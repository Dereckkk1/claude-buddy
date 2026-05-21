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
  // First-run / onboarding flags (loaded from main on mount). We don't read
  // the seenIntro value back — it's purely a "do this once on mount" gate.
  const [, setSeenIntro] = useState(true);
  const [wakeCount, setWakeCount] = useState(0);
  const [showDragHint, setShowDragHint] = useState(false);
  const lastSleepRef = useRef<number>(0);
  const conv = useConversation();
  const drag = useDrag();
  const abortRef = useRef<AbortController | null>(null);
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
      setGreeting(pickGreeting());
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

  // Load onboarding flags once. On a brand-new install with an API key already
  // saved (i.e. user just finished config), skip the initial sleep and open
  // the bubble with the welcome greeting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [flags, apiKey] = await Promise.all([
        invoke('onboarding:get-flags'),
        invoke('config:get-api-key'),
      ]);
      if (cancelled) return;
      setSeenIntro(flags.hasSeenIntro);
      setWakeCount(flags.wakeCount);
      if (!flags.hasSeenIntro && apiKey) {
        // First time the mascot is shown after the user configured their key.
        // Wake straight into the welcome bubble and persist the seen flag so
        // it never appears again. Hard rule: even though we skip the initial
        // sleep frame, the mascot still renders in the corner the whole time.
        setGreeting(t('onboarding.firstRunGreeting'));
        setState('idle');
        await invoke('onboarding:mark-intro-seen');
        setSeenIntro(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tray tooltip mirrors the mascot animation state so users hovering on the
  // tray icon always know what the mascot is doing. The set of channels we
  // care about is a subset of SpriteState — we collapse 'waking' / 'talking'
  // into the closest meaningful tooltip state.
  useEffect(() => {
    const trayState =
      state === 'sleeping' ? 'sleeping'
      : state === 'thinking' ? 'thinking'
      : conv.status === 'error' ? 'error'
      : 'idle';
    void invoke('tray:set-state', trayState);
  }, [state, conv.status]);

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

  const wake = async () => {
    if (state !== 'sleeping') return;
    // "Back so soon?" — if the user wakes us within 2 minutes of sleeping,
    // pull from the recentReturn pool instead of the time-of-day greeting.
    const recentReturn = lastSleepRef.current > 0 && (Date.now() - lastSleepRef.current) < 120_000;
    setGreeting(pickGreeting(new Date(), { recentReturn }));
    setState('waking');
    if (settings?.soundsEnabled) playWake();
    setTimeout(() => { setState((s) => (s === 'waking' ? 'idle' : s)); }, 850);
    // Persist the wake count so we can rotate tips / show the drag hint in
    // the first few sessions only. Local state updates immediately too.
    try {
      const next = await invoke('onboarding:bump-wake-count');
      setWakeCount(next);
      if (next <= 2) {
        setShowDragHint(true);
        setTimeout(() => setShowDragHint(false), 3000);
      }
    } catch {
      // Non-fatal — onboarding niceties only.
    }
  };
  const sleep = () => {
    lastSleepRef.current = Date.now();
    setState('sleeping');
    conv.reset();
    setContinueCounter(0);
    setAgentEvents([]);
    setAgentRunning(false);
    setShowAttachPicker(false);
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
      lastSleepRef.current = Date.now();
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

  const handleSubmit = async (text: string) => {
    if (agentMode) { startAgent(text); return; }
    setContinueCounter(0);
    conv.addUserMessage(text);
    conv.setStatus('thinking');
    setState('thinking');
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
        onToolUse: (name) => {
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            conv.beginAssistantMessage();
            conv.setStatus('talking');
            setState('talking');
          }
          conv.appendAssistantChunk(`\n\n[[step:${name}]]\n\n`);
          if (settings?.soundsEnabled && name === 'edit_in_place') playPasted();
        },
      }, snapshotAttachedPaths);
      while (useConversation.getState().attachments.length > 0) conv.removeAttachment(0);
      conv.setStatus('idle');
      setState('idle');
      if (settings?.soundsEnabled) playDone();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const KNOWN = ['NETWORK', 'INVALID_API_KEY', 'RATE_LIMITED', 'API_KEY_MISSING', 'UNKNOWN'];
      const msg = KNOWN.includes(code) ? t(`errors.${code}`) : `error: ${code}`;
      // Persist the raw code too so the bubble can render a contextual action
      // (e.g. "Open config" only for key-related failures).
      conv.setError(msg, KNOWN.includes(code) ? code : 'UNKNOWN');
      conv.setStatus('error');
      setState('idle');
      if (settings?.soundsEnabled) playError();
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
              {!lastAssistant && wakeCount > 0 && wakeCount <= 5 && (
                // Tip-of-the-day: rotates through 5 hints during the first
                // sessions, then vanishes forever once the user is acclimated.
                <div
                  className="cb-tip"
                  style={{
                    fontSize: 11, color: 'var(--ink-soft)', opacity: 0.9,
                    marginBottom: 4, lineHeight: 1.3,
                  }}
                >
                  {t(`tips.tip${((wakeCount - 1) % 5) + 1}`)}
                </div>
              )}
              {!lastAssistant && showDragHint && (
                <div
                  className="cb-drag-hint"
                  style={{
                    fontSize: 10, color: 'var(--ink-soft)', opacity: 0.7,
                    fontStyle: 'italic', marginBottom: 2,
                  }}
                >
                  {t('onboarding.dragHint')}
                </div>
              )}
              {!lastAssistant && (
                <span className="bubble-greeting" title={greeting}>{greeting}</span>
              )}
              <AgentSelector active={activeAgent} onChange={(a) => { setActiveAgent(a); refreshMemoriesCache(); }} />
            </>
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
            />
          )}
          {conv.status === 'thinking' && (
            <div className="cb-thinking">
              {t('bubble.thinking')}
              <span className="cb-thinking-dots"><span></span><span></span><span></span></span>
            </div>
          )}
          {conv.status === 'error' && conv.error && (
            <div className="cb-error">
              <span>{conv.error}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* For API-key-related errors, offer a 1-click jump to the
                    config window — most users won't remember the tray menu. */}
                {(conv.errorCode === 'INVALID_API_KEY' || conv.errorCode === 'API_KEY_MISSING') && (
                  <button
                    className="cb-btn cb-btn-secondary"
                    onClick={() => { void invoke('config:open'); }}
                  >
                    {t('errorsExtras.openConfig')}
                  </button>
                )}
                <button className="cb-btn cb-btn-secondary" onClick={() => { conv.setError(null, null); conv.setStatus('idle'); }}>{t('response.ok')}</button>
              </div>
            </div>
          )}
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={wake} onMouseDown={drag.onMouseDown} />
    </div>
  );
}
