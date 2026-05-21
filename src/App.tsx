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
import { speak, stop as stopSpeaking, onSpeechStateChange } from './services/tts';
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

// Bumped from 30s → 90s so the user can read a longer response without the
// mascot snoozing on them. Real "afk" detection happens in the timeout handler
// (sleep + memory-preserving wake threshold) further down.
const IDLE_TIMEOUT_MS = 90_000;
// If the mascot was sleeping for longer than this when re-woken, we treat the
// next interaction as a fresh chat (reset messages). Below the threshold the
// previous conversation is preserved — "I was just looking away for a sec".
const STALE_CONVERSATION_MS = 5 * 60 * 1000;
const COLLAPSED = { w: 200, h: 110 };
const EXPANDED = { w: 560, h: 380 };
const EXPANDED_WIDE = { w: 800, h: 380 }; // when attach picker is open
const AGENT_SIZE = { w: 460, h: 380 };

export default function App() {
  const t = useT();
  const [state, setState] = useState<SpriteState>('sleeping');
  const [continueCounter, setContinueCounter] = useState(0);
  const [collapsedResponse, setCollapsedResponse] = useState(false);
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
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentDTO | null>(null);
  // Computer-use preflight confirmation modal. When set, the agent loop is
  // blocked waiting on the user clicking Yes/No.
  const [pendingPreflight, setPendingPreflight] = useState<
    null | { goal: string; resolve: (ok: boolean) => void }
  >(null);
  const [agentStep, setAgentStep] = useState<{ count: number; max: number } | null>(null);
  const [agentLostHint, setAgentLostHint] = useState<string | null>(null);
  const [webSearchUses, setWebSearchUses] = useState(0);
  const [sessionUsage, setSessionUsage] = useState<{
    inputTokens: number; outputTokens: number; estCostUsd: number; lastModel: string | null;
  }>({ inputTokens: 0, outputTokens: 0, estCostUsd: 0, lastModel: null });
  const [crashedMcp, setCrashedMcp] = useState<string[]>(() => getCrashedServers());
  // First-run / onboarding state.
  const [, setSeenIntro] = useState(true);
  const [wakeCount, setWakeCount] = useState(0);
  const [showDragHint, setShowDragHint] = useState(false);
  const lastSleepRef = useRef<number>(0);
  const conv = useConversation();
  const drag = useDrag();
  const abortRef = useRef<AbortController | null>(null);
  // Tracks the last time the user interacted with the bubble. Used by `wake()`
  // to decide whether to preserve or reset the conversation — keeps context
  // for quick re-engagements but starts fresh after a real break.
  const lastActiveRef = useRef<number>(Date.now());
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

  // React to TTS state changes (start/end) without polling — the service
  // emits events on audio.onended, so the UI flips back instantly when the
  // playback finishes naturally, not 200ms later.
  useEffect(() => {
    const unsub = onSpeechStateChange((speaking) => setTtsPlaying(speaking));
    return unsub;
  }, []);

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
    // Wipe prior conversation only if sleep was longer than STALE threshold.
    // Quick re-wakes preserve context — user just looked away for a sec.
    const wasStale = Date.now() - lastActiveRef.current > STALE_CONVERSATION_MS;
    if (wasStale) {
      conv.reset();
      setContinueCounter(0);
      setCollapsedResponse(false);
    }
    lastActiveRef.current = Date.now();
    // "Back so soon?" — if within 2 min, pull recentReturn pool instead.
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
    // Abort any in-flight chat/agent stream BEFORE flipping to sleeping so
    // the network request stops mid-flight (signal is checked in the loop).
    abortRef.current?.abort();
    abortRef.current = null;
    // Mark the moment we went to sleep for both recentReturn greetings and
    // the stale-threshold check in wake(). Do NOT call conv.reset() — wake()
    // decides whether to keep or wipe based on how long the sleep was.
    lastSleepRef.current = Date.now();
    lastActiveRef.current = Date.now();
    setState('sleeping');
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
    const reset = () => {
      lastActiveRef.current = Date.now();
      clearTimeout(timer);
      timer = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
    };
    function handleTimeout() {
      const currentStatus = useConversation.getState().status;
      if (currentStatus === 'thinking' || currentStatus === 'talking') {
        timer = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
        return;
      }
      // Sleep but PRESERVE conversation — next wake decides keep vs wipe
      // based on elapsed time. Mascot sprite stays visible (hard constraint).
      lastSleepRef.current = Date.now();
      lastActiveRef.current = Date.now();
      setState('sleeping');
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

  // Esc key: collapse the bubble back to sleep state. We only listen while the
  // bubble is actually shown — otherwise typing Esc in some other app would
  // never even reach us, but it's a cheap guard.
  useEffect(() => {
    if (state === 'sleeping' || agentRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        sleep();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, agentRunning]);

  const lastAssistantIdx = (() => {
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'assistant') return i;
    }
    return -1;
  })();
  const lastAssistant = lastAssistantIdx >= 0 ? conv.messages[lastAssistantIdx] : undefined;
  // The user message that immediately preceded the last assistant reply —
  // displayed truncated above the response so the user can re-read it.
  const lastUserBeforeAssistant = (() => {
    if (lastAssistantIdx <= 0) return undefined;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') return conv.messages[i];
    }
    return undefined;
  })();
  const showResponse = !!lastAssistant && continueCounter === 0;
  const showInput = !showResponse && conv.status !== 'thinking';
  // List of past user prompts for the input's ArrowUp history navigation.
  const userPromptHistory = conv.messages.filter((m) => m.role === 'user').map((m) => m.content);
  // Turn counter (number of user messages in the current conversation). Shown
  // as a small chip in the header so the user can tell at a glance how many
  // back-and-forths they're into.
  const turnCount = userPromptHistory.length;

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
    // New user message → the previous answer (if any) is no longer the
    // "current" one — drop the collapsed-state so the new exchange renders
    // fresh below the input.
    setCollapsedResponse(false);
    conv.addUserMessage(text);
    conv.setStatus('thinking');
    setState('thinking');
    setWebSearchUses(0);
    if (settings?.soundsEnabled) playSend();
    // Wire up cancellation for the streaming chat. The stop button in the
    // thinking UI calls abortRef.current?.abort() and the SDK respects it.
    const controller = new AbortController();
    abortRef.current = controller;
    let firstChunkSeen = false;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const snapshotMessages = useConversation.getState().messages;
      const snapshotAttachments = useConversation.getState().attachments;
      const snapshotAttachedPaths = useConversation.getState().attachedPaths;
      if (!activeAgent) throw new Error('UNKNOWN');
      await chatWithSkills(snapshotMessages, snapshotAttachments, activeAgent, {
        signal: controller.signal,
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
      // User-initiated stop: do NOT show error UI. Drop back to idle silently.
      const errLike = err as { name?: string; message?: string };
      if (errLike?.name === 'AbortError' || errLike?.message === 'aborted') {
        conv.setStatus('idle');
        setState('idle');
        return;
      }
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const KNOWN = ['NETWORK', 'INVALID_API_KEY', 'RATE_LIMITED', 'API_KEY_MISSING', 'UNKNOWN'];
      // Never expose raw error codes to the user; fall back to generic UNKNOWN
      // and log the actual code for debugging.
      let msg: string;
      if (KNOWN.includes(code)) {
        msg = t(`errors.${code}`);
      } else {
        console.warn('[App] unknown error code from chatWithSkills:', code);
        msg = t('errors.UNKNOWN');
      }
      // Persist the raw code too so the bubble can render a contextual action
      // (e.g. "Open config" only for key-related failures).
      conv.setError(msg, KNOWN.includes(code) ? code : 'UNKNOWN');
      conv.setStatus('error');
      setState('idle');
      if (settings?.soundsEnabled) playError();
    } finally {
      // Clear the active abort handle whether we succeeded or failed.
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  // Resend the last user prompt as-is. Used by the "regenerate" quick reply
  // and the "try again" CTA on transient errors. We pop the most recent
  // assistant reply first so the regenerated answer takes its place instead
  // of being appended as a second turn.
  const regenerateLast = () => {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const msgs = conv.messages;
    // Remove trailing assistant message (if any) so the regenerate produces a
    // single fresh answer at the same logical position.
    const trimmed: typeof msgs = [];
    let droppedAssistant = false;
    for (let i = 0; i < msgs.length; i++) {
      if (i === msgs.length - 1 && msgs[i].role === 'assistant' && !droppedAssistant) {
        droppedAssistant = true;
        continue;
      }
      trimmed.push(msgs[i]);
    }
    // Also remove the trailing user message so handleSubmit re-adds it cleanly
    // (avoids duplicate "ask me X" turns in the transcript).
    if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === 'user') trimmed.pop();
    useConversation.setState({ messages: trimmed, error: null });
    handleSubmit(lastUser.content);
  };

  const tryAgainAfterError = () => {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // Pop the trailing user message so handleSubmit re-adds it without dupes,
    // then clear the error state.
    const msgs = [...conv.messages];
    if (msgs[msgs.length - 1]?.role === 'user') msgs.pop();
    useConversation.setState({ messages: msgs, error: null });
    conv.setStatus('idle');
    handleSubmit(lastUser.content);
  };

  // Truncated single-line summary of the current response — used inside the
  // collapsed strip after the user clicks Continue.
  const responseSummary = (() => {
    if (!lastAssistant) return '';
    const stripped = lastAssistant.content.replace(/\[\[step:[a-z_]+\]\]/g, '').replace(/\s+/g, ' ').trim();
    return stripped.length > 80 ? stripped.slice(0, 80) + '…' : stripped;
  })();

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        gap: 10, padding: 12,
      }}
      onClick={(e) => {
        // Click-outside the bubble dismisses it (only when the click hits the
        // outer flex container itself, not bubble content). Since useDrag
        // doesn't surface live dragging state, we rely on the fact that a real
        // drag never produces a clean `click` on the outer container — drags
        // end on mouseup, and only direct clicks fire here.
        if (e.target !== e.currentTarget) return;
        if (state === 'sleeping' || agentRunning) return;
        sleep();
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
              {turnCount > 0 && (
                <span
                  className="cb-turn-chip"
                  title={`turn ${turnCount}`}
                >{t('response.turnPrefix')}{turnCount}</span>
              )}
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
          {/* Collapsed-response strip: appears after the user clicks Continue. */}
          {collapsedResponse && lastAssistant && (
            <button
              type="button"
              className="cb-collapsed-response"
              onClick={() => { setCollapsedResponse(false); setContinueCounter(0); }}
              title={responseSummary}
            >
              <span className="cb-collapsed-response-chevron">↳</span>
              <span className="cb-collapsed-response-text">
                {t('response.collapsedHint')} · {responseSummary}
              </span>
              <span className="cb-collapsed-response-action">{t('response.expand')}</span>
            </button>
          )}
          {showResponse && lastAssistant && (
            <>
              {/* Echo of the user's question above the response — gives the
                  reader an anchor without having to scroll back. Truncated to
                  2 lines via CSS clamp; full text is in the title attribute. */}
              {lastUserBeforeAssistant && (
                <div
                  className="cb-user-question"
                  title={lastUserBeforeAssistant.content}
                >{lastUserBeforeAssistant.content}</div>
              )}
              <ResponseView
                text={lastAssistant.content}
                showActions={conv.status === 'idle'}
                onOk={sleep}
                onContinue={() => {
                  // Continue now collapses the response into a strip and shows
                  // the input — it no longer wipes the answer entirely.
                  setCollapsedResponse(true);
                  setContinueCounter((c) => c + 1);
                }}
                onQuickReply={(qt) => { setContinueCounter((c) => c + 1); setTimeout(() => handleSubmit(qt), 50); }}
                onRegenerate={regenerateLast}
                soundsEnabled={settings?.soundsEnabled}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 6,
              }}>
                {settings?.ttsEnabled ? (
                  <button
                    onClick={() => {
                      if (ttsPlaying) { stopSpeaking(); setMuted(true); }
                      else if (settings) { setMuted(false); speak(lastAssistant.content, settings.ttsVoice, settings.ttsRate); }
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-soft)', fontSize: 11, padding: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                    title={ttsPlaying ? t('bubble.stop') : t('bubble.play')}
                  >
                    {ttsPlaying && (
                      <span className="cb-tts-indicator" aria-hidden="true">
                        <span></span><span></span><span></span>
                      </span>
                    )}
                    {ttsPlaying ? t('bubble.stop') : t('bubble.play')}
                  </button>
                ) : <span />}
                {modelLabel && (
                  <div
                    style={{
                      fontSize: 10, color: 'var(--ink-soft)',
                      fontFamily: 'SF Mono, Menlo, monospace', opacity: 0.7,
                      cursor: 'default',
                    }}
                    title={t('response.modelTooltip')}
                  >
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
              lastPrompts={userPromptHistory}
            />
          )}
          {conv.status === 'thinking' && (
            <div className="cb-thinking">
              {t('bubble.thinking')}
              <span className="cb-thinking-dots"><span></span><span></span><span></span></span>
              <button
                type="button"
                className="cb-stop-stream"
                onClick={stopStreaming}
                title={t('response.stop')}
              >{t('response.stop')}</button>
            </div>
          )}
          {conv.status === 'error' && conv.error && (
            <div className="cb-error">
              <span>{conv.error}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {(conv.errorCode === 'NETWORK' || conv.errorCode === 'RATE_LIMITED' || conv.errorCode === 'UNKNOWN') && (
                  <button
                    className="cb-btn cb-btn-secondary"
                    onClick={tryAgainAfterError}
                  >{t('response.tryAgain')}</button>
                )}
                {(conv.errorCode === 'INVALID_API_KEY' || conv.errorCode === 'API_KEY_MISSING') && (
                  <button
                    className="cb-btn cb-btn-secondary"
                    onClick={() => { void invoke('config:open'); }}
                  >
                    {t('errorsExtras.openConfig')}
                  </button>
                )}
                <button
                  className="cb-btn cb-btn-secondary"
                  onClick={() => { conv.setError(null, null); conv.setStatus('idle'); }}
                >{t('response.ok')}</button>
              </div>
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
