interface Props {
  text: string;
  showActions: boolean;
  onOk: () => void;
  onContinue: () => void;
}

export function ResponseView({ text, showActions, onOk, onContinue }: Props) {
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.4 }}>{text}</div>
      {showActions && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={onContinue}
            style={{ background: '#fff', color: '#ff6b35', border: '1px solid #ff6b35', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}
          >Continuar</button>
          <button
            onClick={onOk}
            style={{ background: '#ff6b35', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
          >OK</button>
        </div>
      )}
    </div>
  );
}
