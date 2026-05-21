// Settings tab: MCP Servers (list / add / edit / delete / import JSON).
//
// Status dots come from useMCPStates() — re-renders live as servers come up
// or crash. CRUD goes through IPC. Import JSON uses the same Claude
// Desktop / Cursor schema; valid entries get added, errors are surfaced
// inline in the modal.

import { useEffect, useState } from 'react';
import { invoke } from '../src/services/ipc';
import { useT } from '../src/i18n';
import { useMCPStates } from '../src/services/mcp-tools-cache';
import type { MCPServerConfig, MCPServerStatus } from '@shared/mcp-types';

type Mode =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; config: MCPServerConfig }
  | { kind: 'import' };

const EMPTY: Omit<MCPServerConfig, 'id' | 'prefix'> = {
  name: '',
  command: '',
  args: [],
  env: {},
  enabled: true,
};

// ─── Status pill ────────────────────────────────────────────────────────────
//
// Replaces the old colored dot. Shows an icon + label so the state is readable
// at a glance for color-blind users and matches the visual weight of the
// rest of the row.
function StatusPill({ status, label }: { status: MCPServerStatus; label: string }) {
  const icon = status === 'running' ? '●'
    : status === 'starting' ? '◐'
    : status === 'crashed' ? '⚠'
    : '○';
  return (
    <span className={`mcp-status-pill ${status}`}>
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

// ─── Tip helper — surfaces common error patterns with a recovery hint ───────
function errorTipKey(errorMessage?: string): 'tipEnoent' | 'tipTimeout' | null {
  if (!errorMessage) return null;
  const lc = errorMessage.toLowerCase();
  if (lc.includes('enoent') || lc.includes('not recognized') || lc.includes('command not found')) {
    return 'tipEnoent';
  }
  if (lc.includes('timeout') || lc.includes('timed out')) return 'tipTimeout';
  return null;
}

// ─── Logs modal ─────────────────────────────────────────────────────────────
function LogsModal({ config, onClose }: { config: MCPServerConfig; onClose: () => void }) {
  const t = useT();
  const [info, setInfo] = useState<{ errorMessage?: string; stderr?: string } | null>(null);
  useEffect(() => {
    invoke('mcp:get-stderr', config.id).then(setInfo);
  }, [config.id]);
  const tipKey = errorTipKey(info?.errorMessage);
  return (
    <div className="mcp-logs-backdrop" onClick={onClose}>
      <div className="mcp-logs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-logs-modal-head">
          <h3>{t('settings.mcp.logsTitle')} — {config.name}</h3>
          <button className="cb-btn-ghost-settings" onClick={onClose}>{t('settings.mcp.close')}</button>
        </div>
        {tipKey && (
          <div className="mcp-logs-tip">{t(`settings.mcp.${tipKey}`)}</div>
        )}
        <div className="mcp-logs-body">
          {info?.errorMessage ?? '(no logs available)'}
        </div>
      </div>
    </div>
  );
}

export function MCPTab() {
  const t = useT();
  const [configs, setConfigs] = useState<MCPServerConfig[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [logsFor, setLogsFor] = useState<MCPServerConfig | null>(null);
  const states = useMCPStates();

  const refresh = async () => setConfigs(await invoke('mcp:list-configs'));
  useEffect(() => { refresh(); }, []);

  const stateFor = (id: string) =>
    states.find((s) => s.id === id) ?? { id, status: 'stopped' as MCPServerStatus, toolCount: 0 };

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <MCPEditor
        initial={mode.kind === 'edit' ? mode.config : null}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => { await refresh(); setMode({ kind: 'list' }); }}
      />
    );
  }

  if (mode.kind === 'import') {
    return (
      <MCPImporter
        onCancel={() => setMode({ kind: 'list' })}
        onDone={async () => { await refresh(); setMode({ kind: 'list' }); }}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t('settings.mcp.heading')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cb-btn-ghost-settings" onClick={() => setMode({ kind: 'import' })}>{t('settings.mcp.importJson')}</button>
          <button className="cb-btn-primary" onClick={() => setMode({ kind: 'new' })}>{t('settings.mcp.addServer')}</button>
        </div>
      </div>
      <p className="settings-help-top">{t('settings.mcp.help')}</p>
      {configs.length === 0 ? (
        <div className="mcp-empty-card">{t('settings.mcp.noServers')}</div>
      ) : (
        <ul className="agent-list">
          {configs.map((c) => {
            const st = stateFor(c.id);
            const statusLabel = t(`settings.mcp.status${st.status.charAt(0).toUpperCase()}${st.status.slice(1)}`);
            return (
              <li key={c.id}>
                <StatusPill status={st.status} label={statusLabel} />
                <div className="agent-list-info">
                  <div className="agent-list-name">
                    {c.name}{' '}
                    <span className="agent-list-tag" style={{ marginLeft: 4 }}>{c.prefix}</span>
                  </div>
                  <div className="agent-list-meta">
                    {t('settings.mcp.toolsCount', { n: st.toolCount })}
                    {' · '}<code style={{ fontSize: 10 }}>{c.command} {c.args.slice(0, 3).join(' ')}{c.args.length > 3 ? ' …' : ''}</code>
                  </div>
                </div>
                <label className="switch" style={{ marginRight: 8 }} title={t('settings.mcp.enabledHelp')}>
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={async (e) => {
                      await invoke('mcp:update-config', { id: c.id, patch: { enabled: e.target.checked } });
                      await refresh();
                      if (e.target.checked) await invoke('mcp:restart-server', c.id);
                    }}
                  />
                  <span></span>
                </label>
                {st.status === 'crashed' && (
                  <>
                    <button
                      className="agent-list-action"
                      style={{ marginRight: 4 }}
                      onClick={() => setLogsFor(c)}
                    >{t('settings.mcp.viewLogs')}</button>
                    <button
                      className="agent-list-action"
                      style={{ marginRight: 4 }}
                      onClick={async () => { await invoke('mcp:restart-server', c.id); }}
                    >{t('settings.mcp.restart')}</button>
                  </>
                )}
                <button className="agent-list-action" onClick={() => setMode({ kind: 'edit', config: c })}>{t('settings.mcp.edit')}</button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="settings-help" style={{ marginTop: 16 }}>{t('settings.mcp.builtInNotice')}</p>
      {logsFor && <LogsModal config={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}

// ─── Add/Edit form ──────────────────────────────────────────────────────────

interface EditorProps {
  initial: MCPServerConfig | null;
  onCancel: () => void;
  onSaved: () => void;
}

function MCPEditor({ initial, onCancel, onSaved }: EditorProps) {
  const t = useT();
  const [form, setForm] = useState(() =>
    initial ? {
      name: initial.name,
      command: initial.command,
      args: initial.args,
      env: initial.env,
      enabled: initial.enabled,
    } : EMPTY,
  );
  const [argsText, setArgsText] = useState(() => form.args.join('\n'));
  const [envRows, setEnvRows] = useState<Array<{ k: string; v: string; shown: boolean }>>(
    () => Object.entries(form.env).map(([k, v]) => ({ k, v, shown: false })),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; tools?: string[] } | null>(null);

  // Helper that builds the config snapshot from current form state
  const buildConfig = () => {
    const args = argsText.split('\n').map((l) => l.trim()).filter(Boolean);
    const env: Record<string, string> = {};
    for (const row of envRows) {
      if (row.k.trim()) env[row.k.trim()] = row.v;
    }
    return { ...form, args, env };
  };

  const save = async () => {
    if (!form.name.trim()) { alert(t('settings.agents.needName')); return; }
    if (!form.command.trim()) { alert(t('settings.mcp.needCommand')); return; }
    const cfg = buildConfig();
    setSaving(true);
    try {
      if (initial) {
        await invoke('mcp:update-config', { id: initial.id, patch: cfg });
        if (form.enabled) await invoke('mcp:restart-server', initial.id);
      } else {
        const created = await invoke('mcp:add-config', cfg);
        if (form.enabled) await invoke('mcp:restart-server', created.id);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const test = async () => {
    if (!form.command.trim()) { alert(t('settings.mcp.needCommand')); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await invoke('mcp:test', buildConfig());
      setTestResult(r);
    } finally { setTesting(false); }
  };

  const remove = async () => {
    if (!initial) return;
    if (!confirm(t('settings.mcp.confirmDelete', { name: initial.name }))) return;
    await invoke('mcp:delete-config', initial.id);
    onSaved();
  };

  const testTipKey = testResult?.error ? errorTipKey(testResult.error) : null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>{initial ? t('settings.mcp.editServer') : t('settings.mcp.newServer')}</h2>
        <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.mcp.back')}</button>
      </div>

      <div className="form-row">
        <label>{t('settings.mcp.name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t('settings.mcp.namePlaceholder')}
          style={{ width: 280 }}
        />
      </div>

      <div className="form-row">
        <label>{t('settings.mcp.command')}</label>
        <input
          type="text"
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          placeholder={t('settings.mcp.commandPlaceholder')}
          style={{ width: 280, fontFamily: 'JetBrains Mono, monospace' }}
        />
      </div>

      <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ marginBottom: 4 }}>{t('settings.mcp.args')}</label>
        <textarea
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          rows={4}
          placeholder={t('settings.mcp.argsPlaceholder')}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
        />
      </div>

      <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ marginBottom: 4 }}>{t('settings.mcp.envVars')}</label>
        {envRows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input
              type="text"
              value={row.k}
              placeholder={t('settings.mcp.envKey')}
              onChange={(e) => {
                const next = [...envRows]; next[i] = { ...row, k: e.target.value }; setEnvRows(next);
              }}
              style={{ width: 140, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
            <input
              type={row.shown ? 'text' : 'password'}
              value={row.v}
              placeholder={t('settings.mcp.envValue')}
              onChange={(e) => {
                const next = [...envRows]; next[i] = { ...row, v: e.target.value }; setEnvRows(next);
              }}
              style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
            <button
              type="button"
              className="cb-btn-ghost-settings"
              onClick={() => {
                const next = [...envRows]; next[i] = { ...row, shown: !row.shown }; setEnvRows(next);
              }}
              title={row.shown ? t('settings.mcp.eyeHide') : t('settings.mcp.eyeShow')}
              style={{ padding: '4px 10px' }}
            >{row.shown ? '🙈' : '👁'}</button>
            <button
              type="button"
              className="cb-btn-ghost-settings"
              onClick={() => setEnvRows(envRows.filter((_, j) => j !== i))}
              style={{ padding: '4px 10px' }}
            >×</button>
          </div>
        ))}
        <button
          type="button"
          className="cb-btn-ghost-settings"
          onClick={() => setEnvRows([...envRows, { k: '', v: '', shown: false }])}
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >{t('settings.mcp.envAdd')}</button>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-label">{t('settings.mcp.enabled')}</div>
          <div className="setting-help">{t('settings.mcp.enabledHelp')}</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span></span>
        </label>
      </div>

      {testResult && (
        <div style={{ marginTop: 12 }}>
          {testResult.ok ? (
            <p style={{ color: '#788c5d', margin: 0 }}>
              ✓ {t('settings.mcp.testOk', { n: testResult.tools?.length ?? 0 })}
            </p>
          ) : (
            <>
              <p style={{ color: '#b03c2a', margin: 0, fontSize: 13 }}>
                ✗ {t('settings.mcp.testFailed')}
              </p>
              <pre style={{
                background: 'rgba(176,60,42,0.08)',
                border: '1px solid rgba(176,60,42,0.3)',
                borderRadius: 6,
                padding: 10,
                fontSize: 11,
                maxHeight: 140,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                margin: '6px 0 0 0',
              }}>{testResult.error}</pre>
              {testTipKey && (
                <div className="mcp-logs-tip" style={{ margin: '6px 0 0 0' }}>
                  {t(`settings.mcp.${testTipKey}`)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {initial && (
            <button className="danger-btn" onClick={remove}>{t('settings.mcp.delete')}</button>
          )}
          <button
            className="cb-btn-ghost-settings"
            onClick={test}
            disabled={testing}
          >{testing ? t('settings.mcp.testing') : t('settings.mcp.testConnection')}</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.mcp.cancel')}</button>
          <button className="cb-btn-primary" onClick={save} disabled={saving}>
            {saving ? t('settings.agents.saving') : t('settings.mcp.save')}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── JSON import modal ─────────────────────────────────────────────────────

interface ImporterProps {
  onCancel: () => void;
  onDone: () => void;
}

function MCPImporter({ onCancel, onDone }: ImporterProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await invoke('mcp:import-json', text);
      setResult(r);
      if (r.added > 0 && r.errors.length === 0) {
        // Clean success — close after a short pause
        setTimeout(() => onDone(), 600);
      }
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>{t('settings.mcp.jsonHeading')}</h2>
        <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.mcp.back')}</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('settings.mcp.jsonPlaceholder')}
        rows={16}
        style={{ width: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, boxSizing: 'border-box' }}
      />
      {result && (
        <div style={{ marginTop: 12 }}>
          {result.added > 0 && (
            <p style={{ color: '#788c5d' }}>✓ {t('settings.mcp.jsonAdded', { n: result.added })}</p>
          )}
          {result.errors.length > 0 && (
            <>
              <p style={{ color: '#b03c2a', marginBottom: 4 }}>{t('settings.mcp.jsonErrors')}</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#b03c2a', fontSize: 12 }}>
                {result.errors.map((e, i) => <li key={i}><code>{e}</code></li>)}
              </ul>
            </>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="cb-btn-ghost-settings" onClick={onCancel}>{t('settings.mcp.cancel')}</button>
        <button className="cb-btn-primary" onClick={submit} disabled={submitting || !text.trim()}>
          {t('settings.mcp.jsonImport')}
        </button>
      </div>
    </>
  );
}
