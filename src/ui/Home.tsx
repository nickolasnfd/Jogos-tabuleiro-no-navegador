import { useState } from 'react';
import { ApiError, call, lastName, rememberName, saveSession } from './api';
import { Logo, Rules } from './shared';

export function Home({ initialCode, onEnter, onTable }: { initialCode?: string; onEnter: (code: string) => void; onTable: () => void }) {
  const [name, setName] = useState(lastName());
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

  const join = async (c: string) => {
    const n = name.trim();
    if (!n) return setErr('Diga seu nome, parceiro.');
    setBusy(true);
    setErr(null);
    try {
      const r: any = await call({ op: 'join', code: c, name: n });
      rememberName(n);
      saveSession(r.room.code, { playerId: r.playerId, secret: r.secret, name: n });
      onEnter(r.room.code);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return setErr('Diga seu nome, parceiro.');
    setBusy(true);
    setErr(null);
    try {
      const { code: c } = await call<{ code: string }>({ op: 'create' });
      await join(c);
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  };

  const hasCode = code.trim().length === 4;
  return (
    <div className="screen home">
      <Logo />
      <p className="tagline">Blefe. Traição. Ninguém é de confiança.<br />Jogue com a família — cada um no seu celular.</p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          hasCode ? join(code.trim().toUpperCase()) : create();
        }}
      >
        <label>
          Seu nome
          <input value={name} maxLength={14} placeholder="Vito, Don Carlo…" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Código da sala <span className="muted">(se já tiver)</span>
          <input
            className="codeinput"
            value={code}
            maxLength={4}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </label>
        {err && <div className="error" role="alert">{err}</div>}
        <button className="btn gold" disabled={busy || (code.length > 0 && !hasCode)}>
          {busy ? 'Aguarde…' : hasCode ? 'Entrar na sala' : 'Criar nova sala'}
        </button>
      </form>
      <div className="row">
        <button className="link" onClick={() => setRules(true)}>Como se joga</button>
        <button className="link" onClick={onTable}>Abrir a mesa na TV</button>
      </div>
      {rules && <Rules onClose={() => setRules(false)} />}
    </div>
  );
}

export function TableHome({ onOpen, onBack }: { onOpen: (code: string) => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      onOpen((await call<{ code: string }>({ op: 'create' })).code);
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <div className="screen home tv">
      <Logo />
      <p className="tagline">Modo mesa — para a TV ou o notebook.<br />Os jogadores entram pelo celular lendo o QR code.</p>
      <div className="panel">
        <button className="btn gold" disabled={busy} onClick={open}>{busy ? 'Abrindo…' : 'Abrir nova mesa'}</button>
        <label>
          Ou acompanhe uma sala existente
          <input className="codeinput" value={code} maxLength={4} placeholder="ABCD" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
        </label>
        <button className="btn ghost" disabled={code.length !== 4} onClick={() => onOpen(code)}>Acompanhar</button>
        {err && <div className="error">{err}</div>}
      </div>
      <button className="link" onClick={onBack}>← Voltar</button>
    </div>
  );
}
