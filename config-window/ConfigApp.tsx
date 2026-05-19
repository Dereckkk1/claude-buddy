import { useState } from 'react';
import { invoke } from '../src/services/ipc';

export function ConfigApp() {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!key.startsWith('sk-ant-')) {
      alert('Essa key não parece válida (deve começar com sk-ant-)');
      return;
    }
    setSaving(true);
    await invoke('config:set-api-key', key);
    window.close();
  };

  return (
    <div>
      <h1>Configura a API key do Claude</h1>
      <p className="small">
        Pega uma key em <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a> (settings → API keys).
      </p>
      <input
        type="password"
        placeholder="sk-ant-..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <button onClick={handleSave} disabled={saving || !key}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
