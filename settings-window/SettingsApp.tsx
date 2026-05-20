import { useEffect, useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useTheme } from '../src/hooks/useTheme';
import { AgentsTab } from './AgentsTab';
import type { AppSettingsDTO } from '@shared/ipc-types';
import './settings.css';

type Tab = 'general' | 'agents' | 'memories' | 'about';

function VoicePicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { invoke('tts:voices').then(setVoices); }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  );
}

export function SettingsApp() {
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
      <span className="settings-titlebar-title">Claude Buddy — Settings</span>
      <button className="settings-titlebar-close" onClick={() => window.close()} aria-label="fechar">×</button>
    </div>
    <div className="settings-root">
      <div className="settings-sidebar">
        <h1>Claude Buddy</h1>
        <nav>
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Geral</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>Agentes</button>
          <button className={tab === 'memories' ? 'active' : ''} onClick={() => setTab('memories')}>
            Memórias <span className="count">{memories.length}</span>
          </button>
          <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>Sobre</button>
        </nav>
      </div>
      <div className="settings-content">
        {tab === 'general' && settings && (
          <>
            <h2>Geral</h2>
            <div className="setting-row">
              <div>
                <div className="setting-label">Tema</div>
                <div className="setting-help">Claro, escuro, ou segue o tema do Windows.</div>
              </div>
              <div className="theme-picker">
                {(['light', 'auto', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    className={settings.theme === t ? 'active' : ''}
                    onClick={() => updateSetting({ theme: t })}
                  >{t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Auto'}</button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Iniciar com o Windows</div>
                <div className="setting-help">Abre o mascote sempre que ligar o PC, escondido na bandeja.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.autostart} onChange={(e) => updateSetting({ autostart: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Tempo até dormir</div>
                <div className="setting-help">Quantos segundos sem interação até o mascote voltar a dormir.</div>
              </div>
              <select value={settings.idleTimeoutMs} onChange={(e) => updateSetting({ idleTimeoutMs: Number(e.target.value) })}>
                <option value={15000}>15 segundos</option>
                <option value={30000}>30 segundos</option>
                <option value={60000}>1 minuto</option>
                <option value={120000}>2 minutos</option>
                <option value={300000}>5 minutos</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Atalho de teclado</div>
                <div className="setting-help">Combinação que acorda o mascote de qualquer lugar.</div>
              </div>
              <code className="hotkey-display">{settings.hotkey}</code>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Ler resposta em voz alta</div>
                <div className="setting-help">O mascote fala a resposta usando vozes neurais do Edge (PT-BR, qualidade alta).</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.ttsEnabled} onChange={(e) => updateSetting({ ttsEnabled: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Voz</div>
                <div className="setting-help">Qual voz neural usar pra falar.</div>
              </div>
              <VoicePicker value={settings.ttsVoice} onChange={(v) => updateSetting({ ttsVoice: v })} disabled={!settings.ttsEnabled} />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Sons</div>
                <div className="setting-help">Bipinhos 8-bit ao acordar, mandar, terminar, etc.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.soundsEnabled} onChange={(e) => updateSetting({ soundsEnabled: e.target.checked })} />
                <span></span>
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Volume dos sons</div>
                <div className="setting-help">{Math.round(settings.soundsVolume * 100)}% — arraste pra ajustar.</div>
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
                <div className="setting-label">Velocidade da fala</div>
                <div className="setting-help">{settings.ttsRate.toFixed(2)}× — arraste pra ajustar.</div>
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

        {tab === 'memories' && (
          <>
            <h2>Memórias</h2>
            <p className="settings-help-top">
              Tudo que o mascote sabe sobre você entre conversas. Ele aprende sozinho usando a tool <code>save_memory</code>.
            </p>
            {memories.length === 0 ? (
              <div className="empty">Sem memórias ainda. O mascote vai aprender com o tempo.</div>
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
                onClick={async () => { if (confirm('Apagar todas as memórias?')) { await invoke('memories:clear'); refreshMemories(); } }}
              >Apagar todas</button>
            )}
          </>
        )}

        {tab === 'about' && (
          <>
            <h2>Sobre</h2>
            <p>Claude Buddy v0.1.0</p>
            <p>Mascote desktop com pixel art e Claude API.</p>
            <p className="setting-help">Construído com Electron, React, TypeScript e muita cafeína.</p>
          </>
        )}
      </div>
    </div>
    </>
  );
}
