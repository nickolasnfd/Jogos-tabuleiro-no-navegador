import type { StateReply } from '../server/handler';
import type { RoomHook } from './useRoom';
import { Lobby } from './Lobby';
import { Countdown, Logo, LogList, PlayerChip, Qr, joinUrl } from './shared';
import { headline, nameOf } from './text';

/** Tela da mesa: feita para a TV/notebook, só leitura. */
export function Table({ room, hook }: { room: StateReply; hook: RoomHook }) {
  const v = room.view;
  if (!v || room.room.status === 'lobby') return <Lobby room={room} hook={hook} myId={null} tv />;
  const hl = headline(v);
  const total = v.phase.kind === 'action' ? 60_000 : v.phase.kind === 'lose' || v.phase.kind === 'exchange' ? 30_000 : 10_000;
  const waiting = 'waitingOn' in v.phase ? ((v.phase as any).waitingOn as string[]) : [];
  return (
    <div className="screen tv table">
      <header className="tv-head">
        <Logo small />
        <div className="tv-meta">
          <span>Sala {room.room.code}</span>
          <span>Rodada {v.round}</span>
          <span>Baralho: {v.deckCount}</span>
        </div>
      </header>
      <div className="tv-body">
        <section className="tv-players">
          {v.players.map((p) => (
            <PlayerChip key={p.id} p={p} big waiting={waiting.includes(p.id)} />
          ))}
        </section>
        <section className="tv-center">
          <div className={`banner big tone-${hl.tone}`}>
            <div className="banner-title">{hl.title}</div>
            {hl.sub && <div className="banner-sub">{hl.sub}</div>}
            {v.deadline != null && v.phase.kind !== 'over' && <Countdown view={v} msLeft={hook.msLeft} total={total} />}
          </div>
          {v.phase.kind === 'over' && (
            <div className="winner">
              <div className="over-title">{nameOf(v, v.phase.winner)}</div>
              <p>é o novo dono da cidade.</p>
              <Qr text={joinUrl(room.room.code)} size={140} />
              <p className="muted small">Mesma sala: o anfitrião pode chamar a revanche no celular.</p>
            </div>
          )}
        </section>
        <aside className="tv-log">
          <h3>Crônica da noite</h3>
          <LogList view={v} n={12} />
        </aside>
      </div>
    </div>
  );
}
