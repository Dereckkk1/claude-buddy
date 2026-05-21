import { useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useT } from '../src/i18n';

export function ConfigApp() {
  const t = useT();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!key.startsWith('sk-ant-')) {
      alert(t('config.invalid'));
      return;
    }
    setSaving(true);
    await invoke('config:set-api-key', key);
    // Hand off to main: it starts the mascot (already awake) and closes us.
    // The renderer then shows the welcome bubble using `hasSeenIntro=false`.
    await invoke('onboarding:first-run-done');
  };

  const openKeysPage = () => {
    void invoke('shell:open-external', 'https://console.anthropic.com/settings/keys');
  };

  return (
    <div>
      <h1>{t('config.heading')}</h1>
      <p className="small">
        {t('config.help')}{' '}
        <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">{t('config.helpLinkText')}</a>{' '}
        {t('config.helpAfter')}
      </p>
      <input
        type="password"
        placeholder={t('config.placeholder')}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={handleSave} disabled={saving || !key}>
          {saving ? t('config.saving') : t('config.save')}
        </button>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); openKeysPage(); }}
          style={{
            fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'none',
            borderBottom: '1px solid var(--ink-soft)', paddingBottom: 1,
          }}
        >
          {t('configExtras.noKeyLink')}
        </a>
      </div>
      <p className="small" style={{ marginTop: 14, fontSize: 11.5, opacity: 0.8 }}>
        {t('configExtras.costNote')}
      </p>
    </div>
  );
}
