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
import { getCrashedServers } from './services/mcp-tools-cache';
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
  const [greeting, setGreeting] = useState(pickGreeting);
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
  // Computer-use preflight confirmation modal. When set, the agent loop is
  // blocked waiting on the user clicking Yes/No.
  const [pendingPreflight, setPendingPreflight] = useState<
    null | { goal: string; resolve: (ok: boolean) => void }
  >(null);
  // Agent step counter — surfaced as "passo N/MAX" in the AgentOverlay header.
  const [agentStep, setAgentStep] = useState<{ count: number; max: number } | null>(null);
  // Set when agent emits a "lost" cue. UI reveals a redirect input.
  const [agentLostHint, setAgentLostHint] = useState<string | null>(null);
  // Web-search usage counter, shown next to the model chip during streaming.
  const [webSearchUses, setWebSearchUses] = useState(0);
  // Cumulative session usage. Cost is estimated with a hardcoded table.
  const [sessionUsage, setSessionUsage] = useState<{
    inputTokens: number; outputTokens: number; estCostUsd: number; lastModel: string | null;
  }>({ inputTokens: 0, outputTokens: 0, estCostUsd: 0, lastModel: null });
  // List of crashed MCP server ids; renders a dismissible banner in the header.
  const [crashedMcp, setCrashedMcp] = useState<string[]>(() => getCrashedServers());
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
    setGreeting(pickGreeting());
    setState('waking');
    if (settings?.soundsEnabled) playWake();
    setTimeout(() => { setState((s) => (s === 'waking' ? 'idle' : s)); }, 850);
  };
  const sleep = () => {
    // Abort any in-flight chat/agent stream BEFORE flipping to sleeping so
    // the network request stops mid-flight (signal is checked in the loop).
    abortRef.current?.abort();
    abortRef.current = null;
    setState('sleeping');
    conv.reset();
    setContinueCounter(0);
    setAgentEvents([]);
    setAgentRunning(false);
    setShowAttachPicker(false);
    setAgentStep(null);
    setAgentLostHint(null);
    setWebSearchUses(0);
    setPendingPreflight((prev) => {
      // Resolve any in-flight preflight prompt as denied so the agent unwinds.
      prev?.resolve(false);
      return null;
    });
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

  // Global panic key (Ctrl+Shift+Esc) — abort whatever the agent is doing.
  useEffect(() => {
    const handler = () => {
      if (agentRunning) stopAgent();
      // Also abort any normal chat stream that happens to be in-flight.
      abortRef.current?.abort();
    };
    on('agent:panic', handler);
    return () => off('agent:panic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentRunning]);

  // Reflect MCP server state changes (crashes) in the banner. We pull straight
  // from the cache after each `mcp:states-changed` broadcast.
  useEffect(() => {
    const handler = () => setCrashedMcp(getCrashedServers());
    on('mcp:states-changed', handler);
    return () => off('mcp:states-changed');
  }, []);

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
    setAgentStep(null);
    setAgentLostHint(null);
    setState('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runAgent({
        goal,
        signal: controller.signal,
        requestPreflightConfirm: (g: string) =>
          new Promise<boolean>((resolve) => setPendingPreflight({ goal: g, resolve })),
        onEvent: (e) => {
          setAgentEvents((prev) => [...prev, e]);
          if (e.type === 'status') {
            setAgentStatus(e.message);
            if (typeof e.stepCount === 'number' && typeof e.maxSteps === 'number') {
              setAgentStep({ count: e.stepCount, max: e.maxSteps });
            }
          }
          if (e.type === 'lost') setAgentLostHint(e.message);
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
    setWebSearchUses(0);
    if (settings?.soundsEnabled) playSend();
    let firstChunkSeen = false;
    const controller = new AbortController();
    abortRef.current = controller;
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
        onWebSearchUse: (count) => setWebSearchUses(count),
        onUsage: ({ inputTokens, outputTokens, model }) => {
          // Estimate cost with hardcoded per-Mtok rates. Numbers chosen so the
          // user sees a ballpark — we don't try to bill them.
          const rates = model.includes('sonnet')
            ? { inUsdPerMtok: 3, outUsdPerMtok: 15 }
            : { inUsdPerMtok: 1, outUsdPerMtok: 5 };
          const turnCost =
            (inputTokens / 1_000_000) * rates.inUsdPerMtok +
            (outputTokens / 1_000_000) * rates.outUsdPerMtok;
          setSessionUsage((prev) => ({
            inputTokens: prev.inputTokens + inputTokens,
            outputTokens: prev.outputTokens + outputTokens,
            estCostUsd: prev.estCostUsd + turnCost,
            lastModel: model,
          }));
        },
        onToolUse: (name, input) => {
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            conv.beginAssistantMessage();
            conv.setStatus('talking');
            setState('talking');
          }
          // Encode the tool input args as base64 so the marker is robust to
          // `]]` chars in JSON. The ResponseView decodes on render and shows a
          // collapsible details block. We skip the payload when input is empty
          // to keep the chip clean (most server-side tools like web_search).
          const hasInput = input && Object.keys(input).length > 0;
          if (hasInput) {
            try {
              const json = JSON.stringify(input);
              const b64 = btoa(unescape(encodeURIComponent(json)));
              conv.appendAssistantChunk(`\n\n[[step:${name}:${b64}]]\n\n`);
            } catch {
              conv.appendAssistantChunk(`\n\n[[step:${name}]]\n\n`);
            }
          } else {
            conv.appendAssistantChunk(`\n\n[[step:${name}]]\n\n`);
          }
          if (settings?.soundsEnabled && name === 'edit_in_place') playPasted();
        },
      }, snapshotAttachedPaths, controller.signal);
      while (useConversation.getState().attachments.length > 0) conv.removeAttachment(0);
      conv.setStatus('idle');
      setState('idle');
      if (settings?.soundsEnabled) playDone();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const KNOWN = ['NETWORK', 'INVALID_API_KEY', 'RATE_LIMITED', 'API_KEY_MISSING', 'UNKNOWN'];
      const msg = KNOWN.includes(code) ? t(`errors.${code}`) : `error: ${code}`;
      conv.setError(msg);
      conv.setStatus('error');
      setState('idle');
      if (settings?.soundsEnabled) playError();
    } finally {
      // Clear the active abort handle whether we succeeded or failed.
      if (abortRef.current === controller) abortRef.current = null;
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
        let resolved = await invoke('files:resolve-dropped', paths);
        // [P1-1] Cap many-file drops behind a confirmation so a rogue 5000-file
        // drag doesn't silently fill the scope. Native confirm() is sync and
        // good enough for this rare interaction; modal would be overkill.
        if (resolved.length > 20) {
          const ok = window.confirm(t('attach.confirmMany', { n: resolved.length }));
          if (!ok) resolved = resolved.slice(0, 20);
        }
        for (const r of resolved) {
          // [P0-2] Small images dropped from the OS shell should land as an
          // inline base64 attachment (visible NOW, sent with this message)
          // rather than a path scope. Keeps the "drop a screenshot to ask
          // about it" flow one-step. Fallback to path scope for big/odd
          // images so we don't blow the per-message token budget.
          const isImageFile =
            r.kind === 'file' && /\.(png|jpe?g|gif|webp)$/i.test(r.name);
          if (isImageFile && r.size < 5 * 1024 * 1024) {
            const att = await invoke('files:read-image-as-attachment', r.path);
            if (att) {
              conv.addAttachment(att);
              continue;
            }
            // fall through to path scope if the read failed for any reason
          }
          conv.addAttachedPath({ id: crypto.randomUUID(), ...r });
        }
      }}
    >
      {isDraggingOver && (
        <div className="cb-drop-overlay">
          <div className="cb-drop-overlay-inner">{t('attach.dropHereRich')}</div>
        </div>
      )}
      {state !== 'sleeping' && agentRunning && (
        <AgentOverlay
          status={agentStatus}
          events={agentEvents}
          onStop={stopAgent}
          step={agentStep}
          lostHint={agentLostHint}
          onRedirect={(newGoal) => {
            // Clear the lost cue and restart with the new goal. We stop the
            // current run first so the old controller doesn't outlive us.
            // Note: there's a small race where the old loop's `finally` may
            // flip agentRunning off momentarily — acceptable for now.
            setAgentLostHint(null);
            abortRef.current?.abort();
            setTimeout(() => startAgent(newGoal), 250);
          }}
        />
      )}
      {pendingPreflight && (
        <div className="cb-modal-backdrop">
          <div className="cb-modal">
            <div className="cb-modal-title">{t('agent.preflightTitle')}</div>
            <div className="cb-modal-body">
              {t('agent.preflightConfirm', { goal: pendingPreflight.goal })}
            </div>
            <div className="cb-modal-actions">
              <button
                className="cb-btn cb-btn-secondary"
                autoFocus
                onClick={() => {
                  pendingPreflight.resolve(false);
                  setPendingPreflight(null);
                }}
              >
                {t('agent.preflightNo')}
              </button>
              <button
                className="cb-btn cb-btn-primary"
                onClick={() => {
                  pendingPreflight.resolve(true);
                  setPendingPreflight(null);
                }}
              >
                {t('agent.preflightYes')}
              </button>
            </div>
          </div>
        </div>
      )}
      {state !== 'sleeping' && !agentRunning && (
        <SpeechBubble
          onClose={sleep}
          header={
            <>
              {!lastAssistant && (
                <span className="bubble-greeting" title={greeting}>{greeting}</span>
              )}
              <AgentSelector
                active={activeAgent}
                hasActiveConversation={conv.messages.length > 0}
                onResetConversation={() => conv.reset()}
                onChange={(a) => {
                  const msgs = useConversation.getState().messages;
                  const hasAssistant = msgs.some((m) => m.role === 'assistant');
                  if (hasAssistant) {
                    conv.appendAssistantChunk(`\n\n*${t('agents.switchedTo', { agent: a.name })}*\n\n`);
                  }
                  setActiveAgent(a);
                  refreshMemoriesCache();
                }}
              />
              {crashedMcp.length > 0 && (
                <button
                  type="button"
                  className="cb-mcp-banner"
                  onClick={() => invoke('settings:open').catch(() => {})}
                  title={t('mcp.banner.tooltip')}
                >
                  {t('mcp.banner.crashed', { n: crashedMcp.length })}
                </button>
              )}
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
                    fontFamily: 'SF Mono, Menlo, monospace', opacity: 0.6,
                  }}>
                    ✦ {modelLabel}
                    {webSearchUses > 0 && ` · web ${webSearchUses}/3`}
                    {sessionUsage.inputTokens + sessionUsage.outputTokens > 0 && (
                      ` · ${formatTokens(sessionUsage.inputTokens + sessionUsage.outputTokens)} tok · $${sessionUsage.estCostUsd.toFixed(3)}`
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {/* [P0-1] When BOTH ephemeral attachments and persistent paths exist,
              label each group so the user knows what's one-shot vs sticky.
              Single-group case stays unlabeled — the distinction only matters
              when both are present at once. */}
          {showInput && conv.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachedPaths.length > 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--ink-soft)', marginBottom: 4,
                }}>
                  {t('attach.ephemeralHeader')}
                </div>
              )}
              {conv.attachments.map((a, i) => (
                <AttachmentChip key={i} attachment={a} onRemove={() => conv.removeAttachment(i)} />
              ))}
            </div>
          )}
          {showInput && conv.attachedPaths.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {conv.attachments.length > 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--ink-soft)', marginBottom: 4,
                }}>
                  {t('attach.persistentHeader')}
                </div>
              )}
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
              <button className="cb-btn cb-btn-secondary" onClick={() => { conv.setError(null); conv.setStatus('idle'); }}>{t('response.ok')}</button>
            </div>
          )}
        </SpeechBubble>
      )}
      <Mascot state={state} onClick={wake} onMouseDown={drag.onMouseDown} />
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
