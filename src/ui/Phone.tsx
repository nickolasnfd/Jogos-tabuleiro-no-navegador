import { useEffect, useRef, useState } from 'react';
import { ACTIONS, ROLE_INFO } from '../engine/info';
import type { ActionType, Role } from '../engine/types';
import type { StateReply } from '../server/handler';
import type { RoomHook } from './useRoom';
import { Countdown, LogList, PlayerChip, RoleCard, Rules, Coins } from './shared';
import { headline, nameOf } from './text';

export function PhoneGame({ room, hook, myId, onLeave }: { room: StateReply; hook: RoomHook; myId: string; onLeave: () => void }) {
  const v = room.view!;
  const { act, msLeft } = hook;
  const me = v.players.find((p) => p.id === myId);
  const [picking, setPicking] = useState<ActionType | null>(null);
  const [keep, setKeep] = useState<number[]>([]);
  const [rules, setRules] = useState(false);
  const hl = headline(v);
  const isHost = room.room.hostId === myId;

  // reinicia seleções ao mudar de fase
  const phaseKey = `${v.phase.kind}:${v.version}`;
  useEffect(() => {
    setPicking(null);
    setKeep([]);
  }, [phaseKey]);

  // vibra quando precisa de você
  const needsMe = v.can.actions.some((a) => a.enabled) || v.can.pass || v.can.lose.length > 0 || !!v.can.exchange;
  const wasNeeded = useRef(false);
  useEffect(() => {
    if (needsMe && !wasNeeded.current) navigator.vibrate?.(v.can.pass ? 60 : [80, 60, 80]);
    wasNeeded.current = needsMe;
  }, [needsMe, v.can.pass]);

  const total = v.phase.kind === 'action' ? 60_000 : v.phase.kind === 'lose' || v.phase.kind === 'exchange' ? 30_000 : 10_000;
  const others = v.players.filter((p) => p.id !== myId);

  return (
    <div className="screen game">
      <header className="topbar">
        <span className="room-code" title="Código da sala">{room.room.code}</span>
        <span className="muted">Rodada {v.round}</span>
        <button className="link" onClick={() => setRules(true)}>Regras</button>
      </header>

      <section className="opponents" aria-label="Jogadores">
        {others.map((p) => (
          <PlayerChip key={p.id} p={p} waiting={'waitingOn' in v.phase && (v.phase as any).waitingOn.includes(p.id)} />
        ))}
      </section>

      <section className={`banner tone-${hl.tone}`}>
        <div className="banner-title">{hl.title}</div>
        {hl.sub && <div className="banner-sub">{hl.sub}</div>}
        {v.deadline != null && v.phase.kind !== 'over' && <Countdown view={v} msLeft={msLeft} total={total} />}
      </section>

      {/* ----------------------------- painel de decisão ----------------------------- */}
      <section className="decision">
        {v.phase.kind === 'over' ? (
          <GameOver view={v} myId={myId} isHost={isHost} hook={hook} onLeave={onLeave} />
        ) : v.can.actions.length > 0 ? (
          <ActionPanel view={v} picking={picking} setPicking={setPicking} act={act} />
        ) : v.can.pass ? (
          <ReactPanel view={v} act={act} />
        ) : v.can.lose.length > 0 ? (
          <div className="panel">
            <h3>Escolha qual influência sacrificar</h3>
            <p className="muted">Toque na carta que será revelada.</p>
            <div className="hand">
              {v.can.lose.map((r) => (
                <RoleCard key={r} role={r} size="md" onClick={() => act({ t: 'lose', role: r })} />
              ))}
            </div>
          </div>
        ) : v.can.exchange ? (
          <div className="panel">
            <h3>Lavar os livros — fique com {v.can.exchange.keep}</h3>
            <div className="hand wrap">
              {v.can.exchange.options.map((r, i) => (
                <RoleCard
                  key={i}
                  role={r}
                  size="sm"
                  selected={keep.includes(i)}
                  onClick={() =>
                    setKeep((k) => (k.includes(i) ? k.filter((x) => x !== i) : k.length < v.can.exchange!.keep ? [...k, i] : [...k.slice(1), i]))
                  }
                />
              ))}
            </div>
            <button
              className="btn gold"
              disabled={keep.length !== v.can.exchange.keep}
              onClick={() => act({ t: 'exchange', keep: keep.map((i) => v.can.exchange!.options[i]) })}
            >
              Confirmar ({keep.length}/{v.can.exchange.keep})
            </button>
          </div>
        ) : me && !me.alive ? (
          <div className="panel muted center">Você está fora do jogo. Acompanhe a disputa…</div>
        ) : (
          <div className="panel muted center">{v.phase.kind === 'action' ? `Aguardando ${nameOf(v, (v.phase as any).actor)}…` : 'Aguardando os outros…'}</div>
        )}
      </section>

      {/* ----------------------------------- minha mão ------------------------------- */}
      <section className="mine" aria-label="Suas cartas">
        <div className="mine-head">
          <span className="mine-title">{me?.name}</span>
          <Coins n={me?.coins ?? 0} />
        </div>
        <div className="hand">
          {v.hand.map((r, i) => (
            <RoleCard key={`${r}${i}`} role={r} size="md" />
          ))}
          {me?.lost.map((r, i) => (
            <RoleCard key={`l${i}`} role={r} size="md" dim />
          ))}
        </div>
      </section>

      <details className="logbox">
        <summary>Últimos acontecimentos</summary>
        <LogList view={v} n={10} />
      </details>

      <footer className="foot">
        <button className="link danger" onClick={() => confirm('Abandonar a família? Suas cartas serão reveladas.') && onLeave()}>
          Abandonar a partida
        </button>
      </footer>

      {hook.toast && <div className="toast" role="alert">{hook.toast}</div>}
      {rules && <Rules onClose={() => setRules(false)} />}
    </div>
  );
}

function ActionPanel({ view: v, picking, setPicking, act }: { view: any; picking: ActionType | null; setPicking: (a: ActionType | null) => void; act: RoomHook['act'] }) {
  const targets: string[] = v.can.targets;
  const choose = (a: ActionType) => {
    if (ACTIONS[a].needsTarget) setPicking(a);
    else act({ t: 'action', action: a });
  };
  if (picking) {
    return (
      <div className="panel">
        <h3>{ACTIONS[picking].name}: contra quem?</h3>
        <div className="targets">
          {targets.map((id) => (
            <button key={id} className="btn target" onClick={() => act({ t: 'action', action: picking, target: id })}>
              {nameOf(v, id)}
            </button>
          ))}
        </div>
        <button className="link" onClick={() => setPicking(null)}>← Voltar</button>
      </div>
    );
  }
  return (
    <div className="panel">
      <h3>Sua vez — escolha uma jogada</h3>
      <div className="actions">
        {v.can.actions.map((a: any) => {
          const info = ACTIONS[a.action as ActionType];
          return (
            <button key={a.action} className={`act${info.claim ? ' claim' : ''}`} disabled={!a.enabled} onClick={() => choose(a.action)} title={a.reason ?? info.desc}>
              <span className="act-name">{info.name}</span>
              <span className="act-sub">
                {info.claim ? `como ${ROLE_INFO[info.claim as Role].short}` : 'sem blefe'}
                {info.cost ? ` · −${info.cost}` : ''}
              </span>
              <span className="act-desc">{a.reason ?? info.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReactPanel({ view: v, act }: { view: any; act: RoomHook['act'] }) {
  return (
    <div className="panel react">
      <h3>E então?</h3>
      <div className="react-btns">
        {v.can.challenge && (
          <button className="btn red" onClick={() => act({ t: 'challenge' })}>
            Desafiar — “tá blefando!”
          </button>
        )}
        {v.can.block.map((r: Role) => (
          <button key={r} className="btn gold" onClick={() => act({ t: 'block', role: r })}>
            Bloquear como {ROLE_INFO[r].short}
          </button>
        ))}
        <button className="btn ghost" onClick={() => act({ t: 'pass' })}>
          Deixar passar
        </button>
      </div>
    </div>
  );
}

function GameOver({ view: v, myId, isHost, hook, onLeave }: { view: any; myId: string; isHost: boolean; hook: RoomHook; onLeave: () => void }) {
  const winner = (v.phase as any).winner as string;
  const won = winner === myId;
  return (
    <div className="panel center over">
      <div className="over-title">{won ? 'A cidade é sua, chefe.' : 'Fim de jogo.'}</div>
      <p>{won ? 'Você é o último de pé.' : `${nameOf(v, winner)} é o novo dono da cidade.`}</p>
      {isHost ? (
        <button className="btn gold" onClick={() => hook.send('rematch')}>Jogar de novo</button>
      ) : (
        <p className="muted">Aguardando o anfitrião chamar a revanche…</p>
      )}
      <button className="link" onClick={onLeave}>Sair da sala</button>
    </div>
  );
}
