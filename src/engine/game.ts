import { ACTIONS, MAX_COINS_BEFORE_FORCED, MAX_PLAYERS, MIN_PLAYERS, ROLES, ROLE_INFO, START_COINS } from './info';
import type { ApplyResult, Declared, GameState, Move, PlayerState, Role, Then, Timers } from './types';

export const DEFAULT_TIMERS: Timers = { reactMs: 10_000, choiceMs: 30_000, actionMs: 60_000 };

/* ------------------------------ RNG (mulberry32) ------------------------------ */

function nextRand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* --------------------------------- helpers ---------------------------------- */

export const isAlive = (p: PlayerState) => p.hand.length > 0;
export const getPlayer = (s: GameState, id: string) => s.players.find((p) => p.id === id);
export const alivePlayers = (s: GameState) => s.players.filter(isAlive);

function nameOf(s: GameState, id: string) {
  return getPlayer(s, id)?.name ?? '???';
}

function log(s: GameState, text: string, tone: 'info' | 'bad' | 'good' | 'alert' = 'info') {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, text, tone });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

/* ------------------------------- criação do jogo ------------------------------ */

export function newGame(
  players: { id: string; name: string }[],
  seed: number,
  now: number,
  timers: Timers = DEFAULT_TIMERS,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`O jogo precisa de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
  }
  const s: GameState = {
    players: [],
    deck: [],
    turn: '',
    phase: { kind: 'lobby' },
    log: [],
    logSeq: 0,
    rng: seed | 0,
    round: 1,
    version: 1,
    timers,
  };
  for (const r of ROLES) for (let i = 0; i < 3; i++) s.deck.push(r);
  shuffle(s, s.deck);
  // ordem de jogo embaralhada
  const order = players.map((p) => ({ ...p }));
  shuffle(s, order);
  for (const p of order) {
    s.players.push({ id: p.id, name: p.name, coins: START_COINS, hand: [s.deck.pop()!, s.deck.pop()!], lost: [] });
  }
  s.turn = s.players[0].id;
  s.phase = { kind: 'action', deadline: now + timers.actionMs };
  log(s, `A família se reúne. ${nameOf(s, s.turn)} abre a noite.`, 'alert');
  return s;
}

/* --------------------------- consultas de regras úteis ------------------------ */

/** Quem pode responder (desafiar/bloquear/passar) na fase atual. */
export function responders(s: GameState): string[] {
  const ph = s.phase;
  if (ph.kind === 'react') {
    const d = ph.declared;
    const info = ACTIONS[d.action];
    const alive = alivePlayers(s).filter((p) => p.id !== d.actor);
    const ids = new Set<string>();
    if (ph.window === 'action' && info.claim) alive.forEach((p) => ids.add(p.id));
    if (info.blockedBy.length) {
      if (info.blockers === 'target') {
        if (d.target && alive.some((p) => p.id === d.target)) ids.add(d.target);
      } else alive.forEach((p) => ids.add(p.id));
    }
    return [...ids];
  }
  if (ph.kind === 'blockReact') {
    return alivePlayers(s)
      .filter((p) => p.id !== ph.blocker)
      .map((p) => p.id);
  }
  return [];
}

export function mustCoup(s: GameState, id: string): boolean {
  const p = getPlayer(s, id);
  return !!p && p.coins >= MAX_COINS_BEFORE_FORCED;
}

export function validTargets(s: GameState, actor: string): string[] {
  return alivePlayers(s)
    .filter((p) => p.id !== actor)
    .map((p) => p.id);
}

/* ------------------------------ transições internas --------------------------- */

function checkOver(s: GameState): boolean {
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    const w = alive[0];
    s.phase = { kind: 'over', winner: w ? w.id : '' };
    if (w) log(s, `${w.name} é o último de pé. A cidade é dele.`, 'good');
    return true;
  }
  return false;
}

function endTurn(s: GameState, now: number) {
  if (checkOver(s)) return;
  const n = s.players.length;
  let i = s.players.findIndex((p) => p.id === s.turn);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (isAlive(s.players[i])) break;
  }
  if (i <= s.players.findIndex((p) => p.id === s.turn)) s.round += 1;
  s.turn = s.players[i].id;
  s.phase = { kind: 'action', deadline: now + s.timers.actionMs };
  log(s, `Vez de ${s.players[i].name}.`);
}

function startLose(s: GameState, who: string, then: Then, now: number): void {
  const p = getPlayer(s, who)!;
  if (!isAlive(p)) return continueThen(s, then, now);
  if (p.hand.length === 1) {
    revealCard(s, who, p.hand[0]);
    return continueThen(s, then, now);
  }
  s.phase = { kind: 'lose', who, then, deadline: now + s.timers.choiceMs };
}

function revealCard(s: GameState, who: string, role: Role) {
  const p = getPlayer(s, who)!;
  const idx = p.hand.indexOf(role);
  p.hand.splice(idx, 1);
  p.lost.push(role);
  log(s, `${p.name} perde ${ROLE_INFO[role].name}${isAlive(p) ? '.' : ' — está fora do jogo.'}`, 'bad');
}

function continueThen(s: GameState, then: Then, now: number): void {
  if (checkOver(s)) return;
  if (then.t === 'endTurn') return endTurn(s, now);
  if (then.t === 'resolve') return resolveAction(s, then.declared, now);
  if (then.t === 'afterChallenge') return afterActionChallenge(s, then.declared, now);
}

/** Ator provou a carta: depois do desafio falhar, ainda pode haver bloqueio. */
function afterActionChallenge(s: GameState, d: Declared, now: number) {
  const actor = getPlayer(s, d.actor)!;
  if (!isAlive(actor)) return endTurn(s, now);
  const info = ACTIONS[d.action];
  const targetDead = info.needsTarget && (!d.target || !isAlive(getPlayer(s, d.target)!));
  if (targetDead) {
    log(s, 'O alvo já não está na jogada. Ação cancelada.');
    return endTurn(s, now);
  }
  if (info.blockedBy.length) {
    const draft = { ...s, phase: { kind: 'react', declared: d, window: 'afterChallenge', passed: [], deadline: 0 } } as GameState;
    if (responders(draft).length > 0) {
      s.phase = { kind: 'react', declared: d, window: 'afterChallenge', passed: [], deadline: now + s.timers.reactMs };
      return;
    }
  }
  resolveAction(s, d, now);
}

function swapCard(s: GameState, who: string, role: Role) {
  const p = getPlayer(s, who)!;
  const idx = p.hand.indexOf(role);
  p.hand.splice(idx, 1);
  s.deck.push(role);
  shuffle(s, s.deck);
  p.hand.push(s.deck.pop()!);
}

function resolveAction(s: GameState, d: Declared, now: number): void {
  const actor = getPlayer(s, d.actor)!;
  const target = d.target ? getPlayer(s, d.target) : undefined;
  if (!isAlive(actor)) return endTurn(s, now);
  switch (d.action) {
    case 'bico':
      actor.coins += 1;
      log(s, `${actor.name} faz um bico e embolsa 1 moeda.`);
      return endTurn(s, now);
    case 'contrabando':
      actor.coins += 2;
      log(s, `${actor.name} passa contrabando e embolsa 2 moedas.`);
      return endTurn(s, now);
    case 'tributo':
      actor.coins += 3;
      log(s, `${actor.name} cobra tributo e embolsa 3 moedas.`, 'good');
      return endTurn(s, now);
    case 'extorsao': {
      if (!target || !isAlive(target)) return endTurn(s, now);
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      actor.coins += amount;
      log(s, `${actor.name} extorque ${amount} moeda${amount === 1 ? '' : 's'} de ${target.name}.`);
      return endTurn(s, now);
    }
    case 'livros': {
      const drawn = [s.deck.pop()!, s.deck.pop()!].filter(Boolean);
      const options = [...actor.hand, ...drawn];
      s.phase = { kind: 'exchange', actor: actor.id, options, keep: actor.hand.length, deadline: now + s.timers.choiceMs };
      log(s, `${actor.name} mexe nos livros contábeis.`);
      return;
    }
    case 'encomenda':
    case 'acerto': {
      if (!target || !isAlive(target)) {
        log(s, 'O alvo já não está na jogada.');
        return endTurn(s, now);
      }
      log(
        s,
        d.action === 'acerto'
          ? `${actor.name} acerta as contas com ${target.name}.`
          : `A encomenda de ${actor.name} chega até ${target.name}.`,
        'bad',
      );
      return startLose(s, target.id, { t: 'endTurn' }, now);
    }
  }
}

function closeWindow(s: GameState, now: number) {
  const ph = s.phase;
  if (ph.kind === 'react') {
    log(s, 'Ninguém se opõe.');
    return resolveAction(s, ph.declared, now);
  }
  if (ph.kind === 'blockReact') {
    log(s, `O bloqueio de ${nameOf(s, ph.blocker)} se mantém. A ação é cancelada.`);
    return endTurn(s, now);
  }
}

function maybeCloseWindow(s: GameState, now: number) {
  const ph = s.phase;
  if (ph.kind !== 'react' && ph.kind !== 'blockReact') return;
  const need = responders(s);
  if (need.every((id) => ph.passed.includes(id))) closeWindow(s, now);
}

/* --------------------------------- aplicar jogada ----------------------------- */

const err = (error: string): ApplyResult => ({ ok: false, error });

export function apply(prev: GameState, playerId: string, move: Move, now: number): ApplyResult {
  const s: GameState = structuredClone(prev);
  const me = getPlayer(s, playerId);
  if (!me) return err('Você não está nesta partida.');
  const ph = s.phase;

  if (ph.kind === 'over') return err('A partida terminou.');
  if (ph.kind === 'lobby') return err('A partida ainda não começou.');
  if (!isAlive(me)) return err('Você está fora do jogo.');

  switch (move.t) {
    /* ------------------------------- ação do turno ------------------------------ */
    case 'action': {
      if (ph.kind !== 'action') return err('Não é hora de escolher uma ação.');
      if (s.turn !== playerId) return err('Não é a sua vez.');
      const info = ACTIONS[move.action];
      if (!info) return err('Ação inválida.');
      if (mustCoup(s, playerId) && move.action !== 'acerto') return err('Com 10 ou mais moedas você é obrigado a dar um Acerto de Contas.');
      if (me.coins < info.cost) return err('Moedas insuficientes.');
      let target: string | undefined;
      if (info.needsTarget) {
        const t = move.target ? getPlayer(s, move.target) : undefined;
        if (!t || !isAlive(t) || t.id === playerId) return err('Escolha um alvo válido.');
        target = t.id;
      }
      me.coins -= info.cost;
      const d: Declared = { action: move.action, actor: playerId, target, claim: info.claim, paid: info.cost };
      const tn = target ? nameOf(s, target) : '';
      const msgs: Record<string, string> = {
        bico: `${me.name} vai fazer um bico.`,
        contrabando: `${me.name} tenta passar contrabando.`,
        acerto: `${me.name} quer acertar as contas com ${tn}!`,
        tributo: `${me.name} diz ser o Chefão e exige tributo.`,
        encomenda: `${me.name} diz ser o Pistoleiro e faz uma encomenda contra ${tn}.`,
        extorsao: `${me.name} diz ser o Cobrador e extorque ${tn}.`,
        livros: `${me.name} diz ser o Contador e quer lavar os livros.`,
      };
      log(s, msgs[move.action], info.claim ? 'alert' : 'info');
      if (move.action === 'bico' || move.action === 'acerto') {
        resolveAction(s, d, now);
      } else {
        const draft = { ...s, phase: { kind: 'react', declared: d, window: 'action', passed: [], deadline: 0 } } as GameState;
        if (responders(draft).length === 0) resolveAction(s, d, now);
        else s.phase = { kind: 'react', declared: d, window: 'action', passed: [], deadline: now + s.timers.reactMs };
      }
      break;
    }

    /* ---------------------------------- passar ---------------------------------- */
    case 'pass': {
      if (ph.kind !== 'react' && ph.kind !== 'blockReact') return err('Nada a passar agora.');
      if (!responders(s).includes(playerId)) return err('Você não pode reagir a esta jogada.');
      if (!ph.passed.includes(playerId)) ph.passed.push(playerId);
      maybeCloseWindow(s, now);
      break;
    }

    /* --------------------------------- desafiar --------------------------------- */
    case 'challenge': {
      if (ph.kind === 'react') {
        if (ph.window !== 'action') return err('O desafio à ação já foi resolvido.');
        const d = ph.declared;
        if (!d.claim) return err('Esta ação não pode ser desafiada.');
        if (!responders(s).includes(playerId)) return err('Você não pode desafiar.');
        const claimer = getPlayer(s, d.actor)!;
        log(s, `${me.name} desafia ${claimer.name}!`, 'alert');
        if (claimer.hand.includes(d.claim)) {
          log(s, `${claimer.name} mostra ${ROLE_INFO[d.claim].name}. O desafio falhou!`, 'good');
          swapCard(s, d.actor, d.claim);
          startLose(s, playerId, { t: 'afterChallenge', declared: d }, now);
        } else {
          log(s, `${claimer.name} estava blefando! Não tem ${ROLE_INFO[d.claim].name}.`, 'bad');
          claimer.coins += d.paid; // reembolso
          startLose(s, d.actor, { t: 'endTurn' }, now);
        }
        break;
      }
      if (ph.kind === 'blockReact') {
        if (!responders(s).includes(playerId)) return err('Você não pode desafiar.');
        const blocker = getPlayer(s, ph.blocker)!;
        log(s, `${me.name} desafia o bloqueio de ${blocker.name}!`, 'alert');
        if (blocker.hand.includes(ph.blockRole)) {
          log(s, `${blocker.name} mostra ${ROLE_INFO[ph.blockRole].name}. O desafio falhou!`, 'good');
          swapCard(s, ph.blocker, ph.blockRole);
          startLose(s, playerId, { t: 'endTurn' }, now); // bloqueio se mantém -> ação cancelada
        } else {
          log(s, `${blocker.name} estava blefando! Não tem ${ROLE_INFO[ph.blockRole].name}.`, 'bad');
          startLose(s, ph.blocker, { t: 'resolve', declared: ph.declared }, now);
        }
        break;
      }
      return err('Não há nada para desafiar.');
    }

    /* ---------------------------------- bloquear -------------------------------- */
    case 'block': {
      if (ph.kind !== 'react') return err('Não há nada para bloquear.');
      const d = ph.declared;
      const info = ACTIONS[d.action];
      if (!info.blockedBy.includes(move.role)) return err('Esse personagem não bloqueia esta ação.');
      const can = info.blockers === 'target' ? d.target === playerId : playerId !== d.actor;
      if (!can) return err('Você não pode bloquear esta ação.');
      log(s, `${me.name} diz ser ${ROLE_INFO[move.role].name} e bloqueia ${nameOf(s, d.actor)}!`, 'alert');
      s.phase = { kind: 'blockReact', declared: d, blocker: playerId, blockRole: move.role, passed: [], deadline: now + s.timers.reactMs };
      // se não sobra ninguém para desafiar o bloqueio, ele vale de imediato
      maybeCloseWindow(s, now);
      break;
    }

    /* ----------------------------- perder influência --------------------------- */
    case 'lose': {
      if (ph.kind !== 'lose' || ph.who !== playerId) return err('Você não precisa revelar uma carta agora.');
      if (!me.hand.includes(move.role)) return err('Você não tem essa carta.');
      revealCard(s, playerId, move.role);
      continueThen(s, ph.then, now);
      break;
    }

    /* ---------------------------------- trocar --------------------------------- */
    case 'exchange': {
      if (ph.kind !== 'exchange' || ph.actor !== playerId) return err('Você não está trocando cartas.');
      const pool = [...ph.options];
      if (move.keep.length !== ph.keep) return err(`Escolha exatamente ${ph.keep} carta(s).`);
      for (const r of move.keep) {
        const i = pool.indexOf(r);
        if (i < 0) return err('Seleção inválida.');
        pool.splice(i, 1);
      }
      me.hand = [...move.keep];
      s.deck.push(...pool);
      shuffle(s, s.deck);
      log(s, `${me.name} termina de lavar os livros.`);
      endTurn(s, now);
      break;
    }

    default:
      return err('Jogada desconhecida.');
  }

  s.version = prev.version + 1;
  return { ok: true, state: s };
}

/* ----------------------------------- timeouts --------------------------------- */

export function deadlineOf(s: GameState): number | null {
  const ph = s.phase;
  return 'deadline' in ph ? ph.deadline : null;
}

/** Aplica ações automáticas se o prazo da fase atual expirou. Retorna null se nada mudou. */
export function tick(prev: GameState, now: number): GameState | null {
  const dl = deadlineOf(prev);
  if (dl === null || now < dl) return null;
  const s: GameState = structuredClone(prev);
  const ph = s.phase;
  switch (ph.kind) {
    case 'action': {
      const me = getPlayer(s, s.turn)!;
      log(s, `${me.name} demorou demais.`, 'alert');
      if (mustCoup(s, me.id)) {
        const targets = validTargets(s, me.id);
        const t = targets[Math.floor(nextRand(s) * targets.length)];
        const r = apply(s, me.id, { t: 'action', action: 'acerto', target: t }, now);
        if (r.ok) return r.state;
      }
      const r = apply(s, me.id, { t: 'action', action: 'bico' }, now);
      return r.ok ? r.state : null;
    }
    case 'react':
    case 'blockReact': {
      for (const id of responders(s)) if (!ph.passed.includes(id)) ph.passed.push(id);
      maybeCloseWindow(s, now);
      break;
    }
    case 'lose': {
      const p = getPlayer(s, ph.who)!;
      log(s, `${p.name} demorou a decidir.`, 'alert');
      revealCard(s, ph.who, p.hand[0]);
      continueThen(s, ph.then, now);
      break;
    }
    case 'exchange': {
      const keep = ph.options.slice(0, ph.keep);
      const rest = ph.options.slice(ph.keep);
      const p = getPlayer(s, ph.actor)!;
      p.hand = keep;
      s.deck.push(...rest);
      shuffle(s, s.deck);
      log(s, `${p.name} demorou — mantém as próprias cartas.`);
      endTurn(s, now);
      break;
    }
    default:
      return null;
  }
  s.version = prev.version + 1;
  return s;
}

/** Remove um jogador que saiu (ex.: desistiu). Suas cartas são reveladas. */
export function forfeit(prev: GameState, playerId: string, now: number): GameState | null {
  const p = getPlayer(prev, playerId);
  if (!p || !isAlive(p) || prev.phase.kind === 'over' || prev.phase.kind === 'lobby') return null;
  const s: GameState = structuredClone(prev);
  const me = getPlayer(s, playerId)!;
  log(s, `${me.name} abandona a família.`, 'bad');
  while (me.hand.length) {
    const r = me.hand[0];
    me.hand.splice(0, 1);
    me.lost.push(r);
  }
  me.coins = 0;
  if (checkOver(s)) {
    s.version = prev.version + 1;
    return s;
  }
  const ph = s.phase;
  // Reavalia a fase para não travar a partida.
  if (s.turn === playerId) {
    endTurn(s, now);
  } else if ('declared' in ph && ph.declared.actor === playerId) {
    endTurn(s, now);
  } else if (ph.kind === 'lose' && ph.who === playerId) {
    continueThen(s, ph.then, now);
  } else if (ph.kind === 'exchange' && ph.actor === playerId) {
    endTurn(s, now);
  } else if (ph.kind === 'react' || ph.kind === 'blockReact') {
    if (ph.kind === 'blockReact' && ph.blocker === playerId) resolveAction(s, ph.declared, now);
    else maybeCloseWindow(s, now);
  }
  s.version = prev.version + 1;
  return s;
}
