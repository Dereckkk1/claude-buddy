import { useState, useEffect, useRef } from 'react';
import { Mascot } from './components/Mascot';
import { SpeechBubble } from './components/SpeechBubble';
import { InputPanel } from './components/InputPanel';
import { ResponseView } from './components/ResponseView';
import { AttachmentChip } from './components/AttachmentChip';
import { AttachPicker } from './components/AttachPicker';
import { AgentOverlay } from './components/AgentOverlay';
import { AgentSelector } from './components/AgentSelector';
import { CommandApprovalCard } from './components/CommandApprovalCard';
import { usePendingApprovals, resolveApproval, clearAllApprovals } from './services/run-command-bridge';
import type { AgentDTO } from '@shared/ipc-types';
import { useConversation } from './state/conversation';
import { chatWithSkills } from './services/claude';
import { refreshMemoriesCache } from './services/skills';
import { speak, stop as stopSpeaking, isSpeaking } from './services/tts';
import {
  setSoundVolume, playWake, playDone, playSend, playError, playPasted,
  startThinking, stopThinking,
} from './services/sounds';
import type { AppSettingsDTO } from '@shared/ipc-types';
import { runAgent, type AgentEvent } from './services/agent';
import { invoke, on, off } from './services/ipc';
import { useDrag } from './hooks/useDrag';
import { useTheme } from './hooks/useTheme';
import { pickGreeting } from './services/greetings';
import { useT } from './i18n';
import type { SpriteState } from './services/sprite-animator';
import './App.css';

const IDLE_TIMEOUT_MS = 30_000;
const COLLAPSED = { w: 200, h: 110 };
const EXPANDED = { w: 560, h: 380 };
const EXPANDED_WIDE = { w: 800, h: 380 }; // when attach picker is open
const AGENT_SIZE = { w: 460, h: 380 };

export default function App() {
  const t = useT();
  const [state, setState] = useState<SpriteState>('sleeping');
  const [continueCounter, setContinueCounter] = useState(0);
  const [greeting, setGreeting] = useState(() => pickGreeting());
  const [agentMode, setAgentMode] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [agentStatus, setAgentStatus] = useState(() => t('agent.starting'));
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [settings, setSettings] = useState<AppSettingsDTO | null>(null);
  const [muted, setMuted] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentDTO | null>(null);
  // /model forces the model for the NEXT turn only. Cleared after the turn
  // runs (whether success or error) so a stray /model haiku doesn't haunt
  // subsequent unrelated questions.
  const [forcedModel, setForcedModel] = useState<'haiku' | 'sonnet' | null>(null);
  // Extended thinking flag flips when the API stream opts in for deep think.
  // Used to show a different label in the bubble while we wait for chunks.
  const [extendedThinking, setExtendedThinking] = useState(false);
  // Markdown export button feedback (✓ shows for 1.5s after copy).
  const [exportedRecently, setExportedRecently] = useState(false);
  // Selection captured via Ctrl+Shift+A — handed to the InputPanel as a
  // one-shot seed. Number is bumped each time so identical selections still
  // trigger the effect.
  const [inputPrefill, setInputPrefill] = useState<string | undefined>(undefined);
  const conv = useConversation();
  const drag = useDrag();
  const abortRef = useRef<AbortController | null>(null);
  // Timers for happy/confused transient states — we clear them on unmount /
  // before resetting so back-to-back tool calls don't leak callbacks.
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTheme(settings?.theme);

  useEffect(() => {
    const target = agentRunning ? AGENT_SIZE
      : state === 'sleeping' ? COLLAPSED
      : showAttachPicker ? EXPANDED_WIDE
      : EXPANDED;
    invoke('window:set-size', target);
  }, [state, agentRunning, showAttachPicker]);

  useEffect(() => { refreshMemoriesCache(); }, []);
  // Keep the main-process scope guard in sync with the renderer's attached
  // paths so list_folder/read_file only ever touch what the user attached.
  useEffect(() => {
    invoke('files:set-scope', conv.attachedPaths.map((p) => p.path));
  }, [conv.attachedPaths]);
  useEffect(() => {
    invoke('settings:get').then(setSettings);
    const handler = (...args: unknown[]) => {
      const next = args[0] as AppSettingsDTO;
      setSettings(next);
      // When the user changes language, refresh the greeting so the visible
      // line matches the new locale immediately (it's a snapshot at mount).
      setGreeting(pickGreeting(new Date(), next.userName ?? ''));
    };
    on('settings:changed', handler);
    return () => off('settings:changed');
  }, []);
  useEffect(() => {
    invoke('agents:get-active').then(setActiveAgent);
    const handler = (...args: unknown[]) => setActiveAgent(args[0] as AgentDTO);
    on('agents:changed', handler);
    return () => off('agents:changed');
  }, []);

  // Speak the assistant's response when it finishes streaming, if TTS is on
  useEffect(() => {
    if (!settings?.ttsEnabled || muted) return;
    if (conv.status !== 'idle') return;
    const last = [...conv.messages].reverse().find((m) => m.role === 'assistant');
    if (!last?.content.trim()) return;
    speak(last.content, settings.ttsVoice, settings.ttsRate);
    return () => stopSpeaking();
  }, [conv.status, settings?.ttsEnabled, settings?.ttsVoice, muted, conv.messages]);

  // Stop speech when sleeping
  useEffect(() => { if (state === 'sleeping') stopSpeaking(); }, [state]);

  // Sounds setup
  useEffect(() => {
    if (settings) setSoundVolume(settings.soundsEnabled ? settings.soundsVolume : 0);
  }, [settings?.soundsEnabled, settings?.soundsVolume]);

  // Thinking sound loop
  useEffect(() => {
    if (!settings?.soundsEnabled) { stopThinking(); return; }
    if (conv.status === 'thinking') startThinking();
    else stopThinking();
    return () => stopThinking();
  }, [conv.status, settings?.soundsEnabled]);

  /**
   * Schedule a transient sprite state (e.g. `happy`/`confused`) that auto-
   * reverts to `idle` after `ms`. Replaces any previous transient timer so
   * back-to-back triggers don't race each other. If the conversation is
   * still streaming (status=talking) we revert to `talking`, not `idle`,
   * so a mid-stream tool celebration doesn't leave the mascot frozen.
   */
  const flashState = (transient: SpriteState, ms: number) => {
    if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
    setState(transient);
    happyTimerRef.current = setTimeout(() => {
      setState((cur) => {
        if (cur !== transient) return cur; // someone moved us — leave alone
        const status = useConversation.getState().status;
        if (status === 'talking') return 'talking';
        if (status === 'thinking') return 'thinking';
        return 'idle';
      });
      happyTimerRef.current = null;
    }, ms);
  };

  const wake = async () => {
    if (state !== 'sleeping') return;
    setGreeting(pickGreeting(new Date(), settings?.userName ?? ''));
    setState('waking');
    if (settings?.soundsEnabled) playWake();
    setTimeout(() => { setState((s) => (s === 'waking' ? 'idle' : s)); }, 850);
  };
  const sleep = () => {
    setState('sleeping');
    conv.reset();
    setContinueCounter(0);
    setAgentEvents([]);
    setAgentRunning(false);
    setShowAttachPicker(false);
    if (happyTimerRef.current) { clearTimeout(happyTimerRef.current); happyTimerRef.current = null; }
    // Any pending shell-command approval cards get auto-cancelled — releases
    // the agent's tool call so it doesn't hang on the API side.
    clearAllApprovals();
  };

  const approvals = usePendingApprovals();

  useEffect(() => {
    const handler = () => wake();
    on('hotkey:activate', handler);
    return () => off('hotkey:activate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Ctrl+Shift+A — wake the mascot and prefill the input with whatever the
  // user has selected in their other app. Lets you "ask Buddy about this"
  // in one shortcut instead of two.
  useEffect(() => {
    const handler = async () => {
      await wake();
      try {
        const sel = await invoke('keyboard:read-selection');
        if (sel) {
          // Quote the selection so it reads naturally in the input. The user
          // continues typing their question after the blank line. Append a
          // zero-width token to guarantee referential difference even if the
          // exact same selection is grabbed twice in a row.
          const quoted = sel.trim().split('\n').map((l) => `> ${l}`).join('\n');
          setInputPrefill(`${quoted}\n\n`);
          setContinueCounter(0);
        }
      } catch (e) {
        console.error('[App] ask-with-selection failed:', e);
      }
    };
    on('hotkey:ask-with-selection', handler);
    return () => off('hotkey:ask-with-selection');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state === 'sleeping' || agentRunning) return;
    let timer = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
    const reset = () => { clearTimeout(timer); timer = setTimeout(handleTimeout, IDLE_TIMEOUT_MS); };
    function handleTimeout() {
      const currentStatus = useConversation.getState().status;
      if (currentStatus === 'thinking' || currentStatus === 'talking') {
        timer = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
        return;
      }
      setState('sleeping');
      useConversation.getState().reset();
      setContinueCounter(0);
    }
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('click', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('click', reset);
    };
  }, [state, agentRunning]);

  const lastAssistant = [...conv.messages].reverse().find((m) => m.role === 'assistant');
  const showResponse = !!lastAssistant && continueCounter === 0;
  const showInput = !showResponse && conv.status !== 'thinking';

  const startAgent = async (goal: string) => {
    setAgentEvents([{ type: 'status', message: t('agent.starting') }]);
    setAgentStatus(t('agent.starting'));
    setAgentRunning(true);
    setState('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runAgent({
        goal,
        signal: controller.signal,
        onEvent: (e) => {
          setAgentEvents((prev) => [...prev, e]);
          if (e.type === 'status') setAgentStatus(e.message);
          if (e.type === 'done') setAgentStatus(t('agent.done'));
          if (e.type === 'error') setAgentStatus(t('agent.error'));
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errors.unknownAgent');
      setAgentEvents((prev) => [...prev, { type: 'error', message: msg }]);
      setAgentStatus(t('agent.error'));
    } finally {
      abortRef.current = null;
      setState('idle');
    }
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setAgentRunning(false);
    setAgentEvents((prev) => [...prev, { type: 'status', message: t('agent.stopped') }]);
  };

  // Markdown export — collects user/assistant turns and writes them to the
  // clipboard. Returns true on success so callers can show feedback.
  const exportThreadAsMarkdown = async (): Promise<boolean> => {
    const msgs = useConversation.getState().messages.filter((m) => m.content.trim().length > 0);
    if (msgs.length === 0) return false;
    const date = new Date().toISOString().slice(0, 10);
    const header = `# ${t('exportMd.title')} — ${date}`;
    const body = msgs.map((m) => {
      const label = m.role === 'user' ? t('exportMd.you') : t('exportMd.buddy');
      return `**${label}:** ${m.content.trim()}`;
    }).join('\n\n');
    const md = `${header}\n\n${body}\n`;
    try {
      await navigator.clipboard.writeText(md);
      if (settings?.soundsEnabled) playPasted();
      return true;
    } catch (e) {
      console.error('[App] export failed:', e);
      return false;
    }
  };

  // Slash command dispatcher. Stays in App so commands can mutate state that
  // InputPanel doesn't know about (active agent, conversation, etc.).
  const handleSlashCommand = async (cmd: string, args: string) => {
    if (cmd === '/clear') {
      conv.reset();
      setContinueCounter(0);
      return;
    }
    if (cmd === '/sleep') {
      sleep();
      return;
    }
    if (cmd === '/agent') {
      const query = args.trim().toLowerCase();
      if (!query) {
        conv.addUserMessage(`/agent`);
        conv.beginAssistantMessage();
        conv.appendAssistantChunk(t('slash.unknownAgent', { query: '' }));
        return;
      }
      try {
        const all = await invoke('agents:list');
        // Fuzzy match: exact, then starts-with, then contains. First hit wins.
        const lower = (s: string) => s.toLowerCase();
        const match =
          all.find((a) => lower(a.name) === query) ||
          all.find((a) => lower(a.name).startsWith(query)) ||
          all.find((a) => lower(a.name).includes(query));
        if (!match) {
          conv.addUserMessage(`/agent ${args}`);
          conv.beginAssistantMessage();
          conv.appendAssistantChunk(t('slash.unknownAgent', { query: args }));
          return;
        }
        await invoke('agents:set-active', match.id);
        setActiveAgent(match);
        refreshMemoriesCache();
        conv.addUserMessage(`/agent ${args}`);
        conv.beginAssistantMessage();
        conv.appendAssistantChunk(t('slash.switchedTo', { name: match.name }));
      } catch (e) {
        console.error('[App] /agent failed:', e);
      }
      return;
    }
    if (cmd === '/model') {
      const val = args.trim().toLowerCase();
      if (val !== 'haiku' && val !== 'sonnet') {
        conv.addUserMessage(`/model ${args}`);
        conv.beginAssistantMessage();
        conv.appendAssistantChunk(t('slash.modelInvalid', { value: args || '(empty)' }));
        return;
      }
      setForcedModel(val);
      conv.addUserMessage(`/model ${val}`);
      conv.beginAssistantMessage();
      conv.appendAssistantChunk(t('slash.modelSet', { model: val }));
      return;
    }
    if (cmd === '/memory') {
      const fact = args.trim();
      if (!fact) {
        conv.addUserMessage(`/memory`);
        conv.beginAssistantMessage();
        conv.appendAssistantChunk(t('slash.memoryEmpty'));
        return;
      }
      try {
        await invoke('memories:add', fact);
        refreshMemoriesCache();
        conv.addUserMessage(`/memory ${fact}`);
        conv.beginAssistantMessage();
        conv.appendAssistantChunk(t('slash.memorySaved'));
        flashState('happy', 800);
      } catch (e) {
        console.error('[App] /memory failed:', e);
      }
      return;
    }
    if (cmd === '/help') {
      conv.addUserMessage(`/help`);
      conv.beginAssistantMessage();
      conv.appendAssistantChunk(`${t('slash.helpHeader')}\n\n${t('slash.helpList')}`);
      return;
    }
    if (cmd === '/export') {
      const ok = await exportThreadAsMarkdown();
      conv.addUserMessage(`/export`);
      conv.beginAssistantMessage();
      conv.appendAssistantChunk(ok ? t('slash.exportCopied') : t('slash.exportEmpty'));
      return;
    }
  };

  const handleSubmit = async (text: string) => {
    if (agentMode) { startAgent(text); return; }
    setContinueCounter(0);
    conv.addUserMessage(text);
    conv.setStatus('thinking');
    setState('thinking');
    setExtendedThinking(false);
    if (settings?.soundsEnabled) playSend();
    let firstChunkSeen = false;
    try {
      const snapshotMessages = useConversation.getState().messages;
      const snapshotAttachments = useConversation.getState().attachments;
      const snapshotAttachedPaths = useConversation.getState().attachedPaths;
      if (!activeAgent) throw new Error('UNKNOWN');
      await chatWithSkills(snapshotMessages, snapshotAttachments, activeAgent, {
        onChunk: (chunk) => {
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            conv.beginAssistantMessage();
            conv.setStatus('talking');
            setState('talking');
          }
          conv.appendAssistantChunk(chunk);
        },
        onModelPicked: (m) => setModelLabel(m.includes('sonnet') ? 'sonnet' : 'haiku'),
        onExtendedThinking: () => setExtendedThinking(true),
        onToolUse: (name) => {
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            conv.beginAssistantMessage();
            conv.setStatus('talking');
            setState('talking');
          }
          conv.appendAssistantChunk(`\n\n[[step:${name}]]\n\n`);
          if (settings?.soundsEnabled && name === 'edit_in_place') {
            playPasted();
            flashState('happy', 800);
          }
        },
      }, snapshotAttachedPaths, {
        forcedModel,
        userName: settings?.userName ?? '',
        awarenessEnabled: settings?.awarenessEnabled ?? true,
      });
      while (useConversation.getState().attachments.length > 0) conv.removeAttachment(0);
      conv.setStatus('idle');
      // Happy state on success — 1.2s then back to idle.
      if (settings?.soundsEnabled) playDone();
      flashState('happy', 1200);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const KNOWN = ['NETWORK', 'INVALID_API_KEY', 'RATE_LIMITED', 'API_KEY_MISSING', 'UNKNOWN'];
      const msg = KNOWN.includes(code) ? t(`errors.${code}`) : `error: ${code}`;
      conv.setError(msg);
      conv.setStatus('error');
      // Confused state on error — 1.5s.
      if (settings?.soundsEnabled) playError();
      flashState('confused', 1500);
    } finally {
      // /model is a per-turn override — clear after the turn fires.
      setForcedModel(null);
      setExtendedThinking(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        gap: 10, padding: 12,
      }}
      onDragOver={(e) => {
        if (state === 'sleeping' || agentRunning) return;
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        // only clear when leaving the actual container (not bubbling from child)
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (state === 'sleeping' || agentRunning) return;
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        const paths = files
          .map((f) => (window as unknown as { fileBridge: { getPathForFile: (file: File) => string } }).fileBridge.getPathForFile(f))
          .filter(Boolean);
        if (!paths.length) return;
        const resolved = await invoke('files:resolve-dropped', paths);
        for (const r of resolved) {
          conv.addAttachedPath({ id: crypto.randomUUID(), ...r });
        }
      }}
    >
      {isDraggingOver && (
        <div className="cb-drop-overlay">
          <div className="cb-drop-overlay-inner">{t('attach.dropHere')}</div>
        </div>
      )}
      {state !== 'sleeping' && agentRunning && (
        <AgentOverlay status={agentStatus} events={agentEvents} onStop={stopAgent} />
      )}
      {state !== 'sleeping' && !agentRunning && (
        <SpeechBubble
          onClose={sleep}
          header={
            <>
              {!lastAssistant && (
                <span className="bubble-greeting" title={greeting}>{greeting}</span>
              )}
              <AgentSelector active={activeAgent} onChange={(a) => { setActiveAgent(a); refreshMemoriesCache(); }} />
            </>
          }
          headerActions={
            conv.messages.length > 0 ? (
              <button
                onClick={async () => {
                  const ok = await exportThreadAsMarkdown();
                  if (ok) {
                    setExportedRecently(true);
                    setTimeout(() => setExportedRecently(false), 1500);
                  }
                }}
                className="bubble-close"
                title={exportedRecently ? t('bubble.exportDone') : t('bubble.export')}
                aria-label={t('bubble.export')}
                style={{ fontSize: 14 }}
              >{exportedRecently ? '✓' : '↗'}</button>
            ) : null
          }
        >
          {showResponse && lastAssistant && (
            <>
              <ResponseView
                text={lastAssistant.content}
                showActions={conv.status === 'idle'}
                onOk={sleep}
                onContinue={() => setContinueCounter((c) => c + 1)}
                onQuickReply={(t) => { setContinueCounter((c) => c + 1); setTimeout(() => handleSubmit(t), 50); }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 6,
              }}>
                {settings?.ttsEnabled ? (
                  <button
                    onClick={() => {
                      if (isSpeaking()) { stopSpeaking(); setMuted(true); }
                      else if (settings) { setMuted(false); speak(lastAssistant.content, settings.ttsVoice, settings.ttsRate); }
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-soft)', fontSize: 11, padding: 0,
                    }}
                    title={isSpeaking() ? t('bubble.stop') : t('bubble.play')}
                  >{isSpeaking() ? t('bubble.stop') : t('bubble.play')}</button>
                ) : <span />}
                {modelLabel && (
                  <div style={{
                    fontSize: 10, color: 'var(--ink-soft)',
                    fontFamily: 'SF Mono, Menlo, monospace', opacity: 0.5,
                  }}>✦ {modelLabel}</div>
                )}
              </div>
            </>
          )}
          {showInput && conv.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachments.map((a, i) => (
                <AttachmentChip key={i} attachment={a} onRemove={() => conv.removeAttachment(i)} />
              ))}
            </div>
          )}
          {showInput && conv.attachedPaths.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachedPaths.map((p) => (
                <AttachmentChip key={p.id} attachedPath={p} onRemove={() => conv.removeAttachedPath(p.id)} />
              ))}
            </div>
          )}
          {approvals.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {approvals.map((a) => (
                <CommandApprovalCard
                  key={a.id}
                  approval={a}
                  onResolve={(decision) => resolveApproval(a.id, decision)}
                />
              ))}
            </div>
          )}
          {showInput && showAttachPicker && (
            <AttachPicker
              onClose={() => setShowAttachPicker(false)}
              onAttach={(a) => { conv.addAttachment(a); setShowAttachPicker(false); }}
              onAttachPath={(p) => {
                conv.addAttachedPath({ ...p, id: crypto.randomUUID() });
                setShowAttachPicker(false);
              }}
            />
          )}
          {showInput && (
            <InputPanel
              onSubmit={handleSubmit}
              onAttach={() => setShowAttachPicker((v) => !v)}
              agentMode={agentMode}
              onToggleAgent={() => setAgentMode((v) => !v)}
              disabled={conv.status === 'thinking' || conv.status === 'talking'}
              locale={settings?.locale ?? 'en'}
              onSlashCommand={handleSlashCommand}
              prefill={inputPrefill}
            />
          )}
          {conv.status === 'thinking' && (
            <div className="cb-thinking">
              {extendedThinking ? t('bubble.thinkingDeep') : t('bubble.thinking')}
              <span className="cb-thinking-dots"><span></span><span></span><span></span></span>
            </div>
          )}
          {conv.status === 'error' && conv.error && (
            <div className="cb-error">
              <span>{conv.error}</span>
              <button className="cb-btn cb-btn-secondary" onClick={() => { conv.setError(null); conv.setStatus('idle'); }}>{t('response.ok')}</button>
            </div>
          )}
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={wake} onMouseDown={drag.onMouseDown} />
    </div>
  );
}
