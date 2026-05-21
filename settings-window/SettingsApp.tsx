import { useEffect, useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useTheme } from '../src/hooks/useTheme';
import { useT } from '../src/i18n';
import { AgentsTab } from './AgentsTab';
import { MCPTab } from './MCPTab';
import type { AppSettingsDTO, Locale } from '@shared/ipc-types';
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

export function SettingsApp() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<AppSettingsDTO | null>(null);
  const [memories, setMemories] = useState<string[]>([]);
  useTheme(settings?.theme);

  useEffect(() => {
    invoke('settings:get').then(setSettings);
    invoke('memories:list').then(setMemories);
  }, []);

  const updateSetting = async (patch: Partial<AppSettingsDTO>) => {
    const next = await invoke('settings:update', patch);
    setSettings(next);
  };

  const refreshMemories = async () => setMemories(await invoke('memories:list'));

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
            {t('settings.sidebar.memories')} <span className="count">{memories.length}</span>
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
              <code className="hotkey-display">{settings.hotkey}</code>
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
              <VoicePicker value={settings.ttsVoice} onChange={(v) => updateSetting({ ttsVoice: v })} disabled={!settings.ttsEnabled} />
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
              <input
                type="range"
                min="0.8" max="1.8" step="0.05"
                value={settings.ttsRate}
                onChange={(e) => updateSetting({ ttsRate: Number(e.target.value) })}
                disabled={!settings.ttsEnabled}
                style={{ width: 180 }}
              />
            </div>
          </>
        )}

        {tab === 'agents' && <AgentsTab />}

        {tab === 'mcp' && <MCPTab />}

        {tab === 'memories' && (
          <>
            <h2>{t('settings.memories.heading')}</h2>
            <p className="settings-help-top">{t('settings.memories.help')}</p>
            {memories.length === 0 ? (
              <div className="empty">{t('settings.memories.empty')}</div>
            ) : (
              <ul className="memory-list">
                {memories.map((m, i) => (
                  <li key={i}>
                    <span>{m}</span>
                    <button onClick={async () => { await invoke('memories:delete', i); refreshMemories(); }}>×</button>
                  </li>
                ))}
              </ul>
            )}
            {memories.length > 0 && (
              <button
                className="danger-btn"
                onClick={async () => { if (confirm(t('settings.memories.confirmClear'))) { await invoke('memories:clear'); refreshMemories(); } }}
              >{t('settings.memories.clearAll')}</button>
            )}
          </>
        )}

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
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
