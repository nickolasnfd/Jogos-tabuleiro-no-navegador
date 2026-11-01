import { alivePlayers, deadlineOf, getPlayer, isAlive, mustCoup, responders, validTargets } from './game';
import { ACTIONS, ACTION_ORDER } from './info';
import type { ActionType, Declared, GameState, LogEntry, Role } from './types';

/** Estado público de um jogador (sem cartas ocultas). */
export interface PublicPlayer {
  id: string;
  name: string;
  coins: number;
  cards: number; // quantidade de influências vivas
  lost: Role[]; // reveladas
  alive: boolean;
  isTurn: boolean;
}

export type PublicPhase =
  | { kind: 'lobby' }
  | { kind: 'action'; actor: string }
  | { kind: 'react'; declared: Declared; window: 'action' | 'afterChallenge'; waitingOn: string[] }
  | { kind: 'blockReact'; declared: Declared; blocker: string; blockRole: Role; waitingOn: string[] }
  | { kind: 'lose'; who: string }
  | { kind: 'exchange'; actor: string }
  | { kind: 'over'; winner: string };

export interface Can {
  actions: { action: ActionType; enabled: boolean; reason?: string }[];
  targets: string[];
  challenge: boolean;
  block: Role[];
  pass: boolean;
  lose: Role[]; // cartas que pode revelar
  exchange: { options: Role[]; keep: number } | null;
}

export interface View {
  version: number;
  me: string | null;
  players: PublicPlayer[];
  phase: PublicPhase;
  deadline: number | null;
  deckCount: number;
  round: number;
  log: LogEntry[];
  hand: Role[]; // só as suas
  can: Can;
}

const emptyCan: Can = { actions: [], targets: [], challenge: false, block: [], pass: false, lose: [], exchange: null };

export function viewFor(s: GameState, me: string | null): View {
  const players: PublicPlayer[] = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    coins: p.coins,
    cards: p.hand.length,
    lost: [...p.lost],
    alive: isAlive(p),
    isTurn: s.turn === p.id && s.phase.kind !== 'over',
  }));

  const ph = s.phase;
  let phase: PublicPhase;
  switch (ph.kind) {
    case 'action':
      phase = { kind: 'action', actor: s.turn };
      break;
    case 'react':
      phase = {
        kind: 'react',
        declared: ph.declared,
        window: ph.window,
        waitingOn: responders(s).filter((id) => !ph.passed.includes(id)),
      };
      break;
    case 'blockReact':
      phase = {
        kind: 'blockReact',
        declared: ph.declared,
        blocker: ph.blocker,
        blockRole: ph.blockRole,
        waitingOn: responders(s).filter((id) => !ph.passed.includes(id)),
      };
      break;
    case 'lose':
      phase = { kind: 'lose', who: ph.who };
      break;
    case 'exchange':
      phase = { kind: 'exchange', actor: ph.actor };
      break;
    case 'over':
      phase = { kind: 'over', winner: ph.winner };
      break;
    default:
      phase = { kind: 'lobby' };
  }

  const mine = me ? getPlayer(s, me) : undefined;
  const can: Can = { ...emptyCan, actions: [], block: [], lose: [], targets: [] };

  if (mine && isAlive(mine)) {
    if (ph.kind === 'action' && s.turn === mine.id) {
      const forced = mustCoup(s, mine.id);
      can.targets = validTargets(s, mine.id);
      can.actions = ACTION_ORDER.map((a) => {
        const info = ACTIONS[a];
        if (forced && a !== 'acerto') return { action: a, enabled: false, reason: 'Você tem 10+ moedas: é obrigatório dar um Acerto de Contas.' };
        if (mine.coins < info.cost) return { action: a, enabled: false, reason: `Precisa de ${info.cost} moedas.` };
        return { action: a, enabled: true };
      });
    }
    if (ph.kind === 'react') {
      const rs = responders(s);
      if (rs.includes(mine.id) && !ph.passed.includes(mine.id)) {
        const d = ph.declared;
        const info = ACTIONS[d.action];
        can.pass = true;
        can.challenge = ph.window === 'action' && !!d.claim;
        if (info.blockedBy.length) {
          const ok = info.blockers === 'target' ? d.target === mine.id : mine.id !== d.actor;
          if (ok) can.block = [...info.blockedBy];
        }
      }
    }
    if (ph.kind === 'blockReact') {
      if (responders(s).includes(mine.id) && !ph.passed.includes(mine.id)) {
        can.pass = true;
        can.challenge = true;
      }
    }
    if (ph.kind === 'lose' && ph.who === mine.id) can.lose = [...new Set(mine.hand)];
    if (ph.kind === 'exchange' && ph.actor === mine.id) can.exchange = { options: [...ph.options], keep: ph.keep };
  }

  return {
    version: s.version,
    me,
    players,
    phase,
    deadline: deadlineOf(s),
    deckCount: s.deck.length,
    round: s.round,
    log: s.log.slice(-40),
    hand: mine ? [...mine.hand] : [],
    can,
  };
}

export const aliveCount = (s: GameState) => alivePlayers(s).length;
