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
    window.close();
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
      <button onClick={handleSave} disabled={saving || !key}>
        {saving ? t('config.saving') : t('config.save')}
      </button>
    </div>
  );
}
