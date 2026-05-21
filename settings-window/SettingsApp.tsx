import { useEffect, useRef, useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useTheme } from '../src/hooks/useTheme';
import { useT } from '../src/i18n';
import { AgentsTab } from './AgentsTab';
import { MCPTab } from './MCPTab';
import type { AppSettingsDTO, Locale, AgentMemoriesGroupDTO } from '@shared/ipc-types';
import './settings.css';

type Tab = 'general' | 'agents' | 'mcp' | 'memories' | 'about';

function VoicePicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { invoke('tts:voices').then(setVoices); }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  );
}

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português (BR)' },
  { value: 'es', label: 'Español' },
];

// ─── HotkeyRecorder ──────────────────────────────────────────────────────────
//
// Click-to-record. Captures the next keydown that includes at least one
// modifier (Ctrl/Shift/Alt/Meta) + a non-modifier key. Translates the event
// into Electron's accelerator format (e.g. "CommandOrControl+Shift+Space")
// then runs a conflict check via the main process.
function HotkeyRecorder({ value, onSave }: { value: string; onSave: (combo: string) => Promise<void> }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      // Ignore modifier-only keypresses while the user is still chording.
      const isModOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
      if (isModOnly) return;
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      // Normalize the key — Space, single letters, F-keys, arrows…
      let k = e.key;
      if (k === ' ') k = 'Space';
      else if (k.length === 1) k = k.toUpperCase();
      else if (k.startsWith('Arrow')) k = k.slice(5); // "ArrowLeft" → "Left"
      parts.push(k);
      const combo = parts.join('+');
      setDraft(combo);
      setRecording(false);
      setError(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [recording]);

  const commit = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const test = await invoke('hotkey:test', draft);
      if (!test.ok) {
        setError(test.reason === 'in-use' ? t('settings.hotkeyConflict') : t('settings.hotkeyInvalid'));
        return;
      }
      await onSave(draft);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code className="hotkey-display">{draft ?? value}</code>
        {!recording && (
          <button
            className="cb-btn-ghost-settings"
            onClick={() => { setRecording(true); setDraft(null); setError(null); }}
            style={{ padding: '4px 10px', fontSize: 11 }}
          >{t('settings.hotkeyRecord')}</button>
        )}
        {recording && (
          <span style={{ fontSize: 11, color: 'var(--clay)' }}>{t('settings.hotkeyPressKeys')}</span>
        )}
        {draft && !recording && (
          <>
            <button
              className="cb-btn-primary"
              onClick={commit}
              disabled={saving}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >{saving ? '…' : t('settings.hotkeySave')}</button>
            <button
              className="cb-btn-ghost-settings"
              onClick={() => { setDraft(null); setError(null); }}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >{t('settings.hotkeyCancel')}</button>
          </>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#b03c2a' }}>{error}</div>}
    </div>
  );
}

// ─── MemoriesTab (grouped + undo) ───────────────────────────────────────────
//
// Replaces the flat single-agent list with a per-agent grouping. Each × button
// stages a deletion: the row strikes through + a snackbar lets the user undo
// inside a 5s window. After that, we commit via IPC.
interface PendingDeletion {
  agentId: string;
  index: number;
  content: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

function MemoriesTab() {
  const t = useT();
  const [groups, setGroups] = useState<AgentMemoriesGroupDTO[]>([]);
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  // Snapshot of memories that have been visually removed but not yet committed.
  // Keyed by `${agentId}:${index}` (index refers to the ORIGINAL list).
  const pendingKeys = new Set(pending.map((p) => `${p.agentId}:${p.index}`));

  const refresh = async () => setGroups(await invoke('memories:list-all'));
  useEffect(() => { refresh(); }, []);
  // Clear pending timers when tab unmounts to avoid leaks
  useEffect(() => {
    return () => { pending.forEach((p) => clearTimeout(p.timer)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageDelete = (agentId: string, index: number, content: string) => {
    const expiresAt = Date.now() + 5_000;
    const timer = setTimeout(async () => {
      // Commit if still pending — otherwise the user already undid it.
      await invoke('memories:delete-by-index', { agentId, index });
      setPending((cur) => cur.filter((p) => !(p.agentId === agentId && p.index === index)));
      await refresh();
    }, 5_000);
    setPending((cur) => [...cur, { agentId, index, content, expiresAt, timer }]);
  };

  const undo = (agentId: string, index: number) => {
    setPending((cur) => {
      const match = cur.find((p) => p.agentId === agentId && p.index === index);
      if (match) clearTimeout(match.timer);
      return cur.filter((p) => !(p.agentId === agentId && p.index === index));
    });
  };

  const totalMemories = groups.reduce((s, g) => s + g.memories.length, 0);

  return (
    <>
      <h2>{t('settings.memories.heading')}</h2>
      <p className="settings-help-top">{t('settings.memories.help')}</p>
      {totalMemories === 0 ? (
        <div className="empty">{t('settings.memories.empty')}</div>
      ) : (
        groups.filter((g) => g.memories.length > 0).map((g) => (
          <div key={g.agentId} style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '8px 0', fontSize: 14, fontWeight: 600 }}>
              <span style={{ marginRight: 6 }}>{g.emoji}</span>{g.name}
              <span className="count" style={{ marginLeft: 8 }}>{g.memories.length}</span>
            </h3>
            <ul className="memory-list">
              {g.memories.map((m, i) => {
                const key = `${g.agentId}:${i}`;
                const isPending = pendingKeys.has(key);
                return (
                  <li key={i} style={isPending ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                    <span>{m}</span>
                    {isPending ? (
                      <button onClick={() => undo(g.agentId, i)} title={t('settings.memories.undo')}>↺</button>
                    ) : (
                      <button onClick={() => stageDelete(g.agentId, i, m)}>×</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {pending.length > 0 && (
        <div className="memory-undo-snack">
          <span>{t('settings.memories.undoSnack')}</span>
          {pending.map((p) => (
            <button key={`${p.agentId}:${p.index}`} className="cb-btn-ghost-settings" onClick={() => undo(p.agentId, p.index)} style={{ marginLeft: 8 }}>
              {t('settings.memories.undo')}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function SettingsApp() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<AppSettingsDTO | null>(null);
  const [memoriesCount, setMemoriesCount] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  useTheme(settings?.theme);

  useEffect(() => {
    invoke('settings:get').then(setSettings);
    // Count across all agents — the sidebar badge reflects the global total.
    invoke('memories:list-all').then((groups) =>
      setMemoriesCount(groups.reduce((s, g) => s + g.memories.length, 0)),
    );
  }, [tab]);

  const updateSetting = async (patch: Partial<AppSettingsDTO>) => {
    const next = await invoke('settings:update', patch);
    setSettings(next);
  };

  const playPreview = async () => {
    if (!settings) return;
    setPreviewBusy(true);
    try {
      const base64 = await invoke('tts:preview', { voice: settings.ttsVoice, rate: settings.ttsRate });
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.playbackRate = settings.ttsRate;
      previewAudioRef.current?.pause();
      previewAudioRef.current = audio;
      await audio.play().catch(() => { /* user gesture issues swallowed */ });
    } finally {
      setPreviewBusy(false);
    }
  };

  const exportSettings = async () => {
    const r = await invoke('settings:export');
    if (r.ok && r.path) {
      alert(t('settings.exportSuccess', { path: r.path }));
    } else if (r.error) {
      alert(t('settings.exportFailed', { error: r.error }));
    }
  };

  const importSettings = async () => {
    if (!confirm(t('settings.importConfirm'))) return;
    const r = await invoke('settings:import');
    if (r.ok) {
      alert(t('settings.importSuccess'));
      // Refresh local state from the new store
      invoke('settings:get').then(setSettings);
    } else if (r.error) {
      alert(t('settings.importFailed', { error: r.error }));
    }
  };

  return (
    <>
    <div className="settings-titlebar">
      <span className="settings-titlebar-title">{t('settings.titleBar')}</span>
      <button className="settings-titlebar-close" onClick={() => window.close()} aria-label={t('bubble.close')}>×</button>
    </div>
    <div className="settings-root">
      <div className="settings-sidebar">
        <h1>Claude Buddy</h1>
        <nav>
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>{t('settings.sidebar.general')}</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>{t('settings.sidebar.agents')}</button>
          <button className={tab === 'mcp' ? 'active' : ''} onClick={() => setTab('mcp')}>{t('settings.sidebar.mcp')}</button>
          <button className={tab === 'memories' ? 'active' : ''} onClick={() => setTab('memories')}>
            {t('settings.sidebar.memories')} <span className="count">{memoriesCount}</span>
          </button>
          <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>{t('settings.sidebar.about')}</button>
        </nav>
      </div>
      <div className="settings-content">
        {tab === 'general' && settings && (
          <>
            <h2>{t('settings.general.heading')}</h2>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.language')}</div>
                <div className="setting-help">{t('settings.general.languageHelp')}</div>
              </div>
              <select
                value={settings.locale}
                onChange={(e) => updateSetting({ locale: e.target.value as Locale })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.respondInUserLanguage')}</div>
                <div className="setting-help">{t('settings.general.respondInUserLanguageHelp')}</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.respondInUserLanguage ?? true}
                  onChange={(e) => updateSetting({ respondInUserLanguage: e.target.checked })}
                />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.theme')}</div>
                <div className="setting-help">{t('settings.general.themeHelp')}</div>
              </div>
              <div className="theme-picker">
                {(['light', 'auto', 'dark'] as const).map((themeKey) => (
                  <button
                    key={themeKey}
                    className={settings.theme === themeKey ? 'active' : ''}
                    onClick={() => updateSetting({ theme: themeKey })}
                  >{themeKey === 'light' ? t('settings.general.themeLight') : themeKey === 'dark' ? t('settings.general.themeDark') : t('settings.general.themeAuto')}</button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.autostart')}</div>
                <div className="setting-help">{t('settings.general.autostartHelp')}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.autostart} onChange={(e) => updateSetting({ autostart: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.idleTimeout')}</div>
                <div className="setting-help">{t('settings.general.idleTimeoutHelp')}</div>
              </div>
              <select value={settings.idleTimeoutMs} onChange={(e) => updateSetting({ idleTimeoutMs: Number(e.target.value) })}>
                <option value={15000}>{t('settings.general.seconds15')}</option>
                <option value={30000}>{t('settings.general.seconds30')}</option>
                <option value={60000}>{t('settings.general.minute1')}</option>
                <option value={120000}>{t('settings.general.minutes2')}</option>
                <option value={300000}>{t('settings.general.minutes5')}</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.hotkey')}</div>
                <div className="setting-help">{t('settings.general.hotkeyHelp')}</div>
              </div>
              <HotkeyRecorder
                value={settings.hotkey}
                onSave={(combo) => updateSetting({ hotkey: combo })}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.userName')}</div>
                <div className="setting-help">{t('settings.general.userNameHelp')}</div>
              </div>
              <input
                type="text"
                value={settings.userName}
                onChange={(e) => updateSetting({ userName: e.target.value })}
                placeholder={t('settings.general.userNamePlaceholder')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg-input)',
                  color: 'var(--ink)',
                  width: 200,
                }}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.awareness')}</div>
                <div className="setting-help">{t('settings.general.awarenessHelp')}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.awarenessEnabled} onChange={(e) => updateSetting({ awarenessEnabled: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.tts')}</div>
                <div className="setting-help">{t('settings.general.ttsHelp')}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.ttsEnabled} onChange={(e) => updateSetting({ ttsEnabled: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.voice')}</div>
                <div className="setting-help">{t('settings.general.voiceHelp')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <VoicePicker value={settings.ttsVoice} onChange={(v) => updateSetting({ ttsVoice: v })} disabled={!settings.ttsEnabled} />
                <button
                  className="cb-btn-ghost-settings"
                  onClick={playPreview}
                  disabled={!settings.ttsEnabled || previewBusy}
                  title={t('settings.ttsPreview')}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >{t('settings.ttsPreview')}</button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.sounds')}</div>
                <div className="setting-help">{t('settings.general.soundsHelp')}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.soundsEnabled} onChange={(e) => updateSetting({ soundsEnabled: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.volume')}</div>
                <div className="setting-help">{t('settings.general.volumeHelp', { percent: Math.round(settings.soundsVolume * 100) })}</div>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={settings.soundsVolume}
                onChange={(e) => updateSetting({ soundsVolume: Number(e.target.value) })}
                disabled={!settings.soundsEnabled}
                style={{ width: 180 }}
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">{t('settings.general.speed')}</div>
                <div className="setting-help">{t('settings.general.speedHelp', { rate: settings.ttsRate.toFixed(2) })}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="range"
                  min="0.8" max="1.8" step="0.05"
                  value={settings.ttsRate}
                  onChange={(e) => updateSetting({ ttsRate: Number(e.target.value) })}
                  disabled={!settings.ttsEnabled}
                  style={{ width: 180 }}
                />
                <button
                  className="cb-btn-ghost-settings"
                  onClick={playPreview}
                  disabled={!settings.ttsEnabled || previewBusy}
                  title={t('settings.ttsPreview')}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >{t('settings.ttsPreview')}</button>
              </div>
            </div>
          </>
        )}

        {tab === 'agents' && <AgentsTab />}

        {tab === 'mcp' && <MCPTab />}

        {tab === 'memories' && <MemoriesTab />}

        {tab === 'about' && (
          <>
            <h2>{t('settings.about.heading')}</h2>
            <div className="about-card">
              <div className="about-version">{t('settings.about.version')}</div>
              <p className="about-tagline">{t('settings.about.tagline')}</p>
              <hr className="about-divider" />
              <dl className="about-meta">
                <dt>{t('settings.about.authorLabel')}</dt>
                <dd>{t('settings.about.authorName')}</dd>
                <dt>{t('settings.about.repoLabel')}</dt>
                <dd>
                  <a href={t('settings.about.repoUrl')} target="_blank" rel="noreferrer">
                    {t('settings.about.repoUrl').replace('https://', '')}
                  </a>
                </dd>
              </dl>
              <p className="about-built">{t('settings.about.built')}</p>
              <hr className="about-divider" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="cb-btn-ghost-settings" onClick={exportSettings}>{t('settings.export')}</button>
                <button className="cb-btn-ghost-settings" onClick={importSettings}>{t('settings.import')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
