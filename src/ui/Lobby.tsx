import { useState } from 'react';
import type { StateReply } from '../server/handler';
import type { RoomHook } from './useRoom';
import { Logo, Qr, Rules, joinUrl } from './shared';

export function Lobby({ room, hook, myId, onLeave, tv = false }: { room: StateReply; hook: RoomHook; myId: string | null; onLeave?: () => void; tv?: boolean }) {
  const r = room.room;
  const isHost = !!myId && r.hostId === myId;
  const [rules, setRules] = useState(false);
  const url = joinUrl(r.code);
  const can = r.players.length >= r.min;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className={`screen lobby${tv ? ' tv' : ''}`}>
      <Logo small={!tv} />
      <div className="lobby-main">
        <div className="qrbox">
          <Qr text={url} size={tv ? 340 : 200} />
          <div className="code-label">Código da sala</div>
          <div className="code">{r.code}</div>
          <div className="muted small">{url.replace(/^https?:\/\//, '')}</div>
          {!tv && <button className="link" onClick={copy}>Copiar link</button>}
        </div>
        <div className="roster">
          <h3>A família ({r.players.length}/{r.max})</h3>
          <ul>
            {r.players.map((p) => (
              <li key={p.id} className={p.id === myId ? 'me' : ''}>
                <span>{p.name}</span>
                <span className="muted">{p.id === r.hostId ? 'anfitrião' : ''}{p.id === myId ? ' · você' : ''}</span>
              </li>
            ))}
            {r.players.length === 0 && <li className="muted">Escaneie o QR code para entrar…</li>}
          </ul>
          {!tv && isHost && (
            <>
              <button className="btn gold" disabled={!can} onClick={() => hook.send('start')}>
                {can ? 'Começar a partida' : `Faltam ${r.min - r.players.length} jogador(es)`}
              </button>
              <p className="muted small">De {r.min} a {r.max} jogadores. Só você inicia.</p>
            </>
          )}
          {!tv && !isHost && <p className="muted center">Aguardando o anfitrião começar…</p>}
          {tv && <p className="muted center">{can ? 'O anfitrião pode começar pelo celular.' : 'Aguardando jogadores…'}</p>}
          {!tv && (
            <div className="row">
              <button className="link" onClick={() => setRules(true)}>Regras</button>
              {onLeave && <button className="link danger" onClick={onLeave}>Sair</button>}
            </div>
          )}
        </div>
      </div>
      {hook.toast && <div className="toast" role="alert">{hook.toast}</div>}
      {rules && <Rules onClose={() => setRules(false)} />}
    </div>
  );
}
