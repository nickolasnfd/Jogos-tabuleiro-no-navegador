import { apply, forfeit, newGame, tick } from '../engine/game';
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/info';
import type { GameState, Move } from '../engine/types';
import { viewFor } from '../engine/view';
import type { View } from '../engine/view';

export interface RoomPlayer {
  id: string;
  name: string;
  secret: string;
}

export interface Room {
  code: string;
  hostId: string | null;
  status: 'lobby' | 'playing' | 'over';
  players: RoomPlayer[];
  game: GameState | null;
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  get(code: string): Promise<{ room: Room; rev: number } | null>;
  /** cria; retorna false se o código já existe */
  create(room: Room): Promise<boolean>;
  /** salva se a revisão bater (controle otimista); retorna false em conflito */
  save(room: Room, expectedRev: number): Promise<boolean>;
}

export type Notify = (code: string, rev: number) => void | Promise<void>;

export interface Reply {
  status: number;
  body: unknown;
}

export interface RoomInfo {
  code: string;
  status: Room['status'];
  hostId: string | null;
  players: { id: string; name: string }[];
  min: number;
  max: number;
}

export interface StateReply {
  room: RoomInfo;
  view: View | null;
  serverNow: number;
  rev: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function makeCode(): string {
  const b = randomBytes(4);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

function makeToken(): string {
  return Array.from(randomBytes(18), (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 28);
}

function makeId(): string {
  return 'p' + Array.from(randomBytes(5), (x) => x.toString(16).padStart(2, '0')).join('');
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number, error: string): Reply => ({ status, body: { error } });

function cleanName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 14);
  return s;
}

function roomInfo(room: Room): RoomInfo {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
  };
}

function auth(room: Room, body: Record<string, unknown>): RoomPlayer | null {
  const p = room.players.find((x) => x.id === body.playerId);
  if (!p) return null;
  // comparação em tempo (quase) constante
  const a = String(body.secret ?? '');
  const b = p.secret;
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? p : null;
}

function stateReply(room: Room, rev: number, me: string | null, now: number): StateReply {
  return {
    room: roomInfo(room),
    view: room.game ? viewFor(room.game, me) : null,
    serverNow: now,
    rev,
  };
}

/** Aplica timeouts pendentes e sincroniza `status` com a fase do jogo. */
function settle(room: Room, now: number): boolean {
  let changed = false;
  if (room.game && room.status === 'playing') {
    const t = tick(room.game, now);
    if (t) {
      room.game = t;
      changed = true;
    }
    if (room.game.phase.kind === 'over') {
      room.status = 'over';
      changed = true;
    }
  }
  if (changed) room.updatedAt = now;
  return changed;
}

export async function handle(
  store: Store,
  raw: unknown,
  now: number,
  notify: Notify = () => {},
): Promise<Reply> {
  if (!raw || typeof raw !== 'object') return fail(400, 'Requisição inválida.');
  const body = raw as Record<string, unknown>;
  const op = String(body.op ?? '');

  /* -------------------------------- criar sala -------------------------------- */
  if (op === 'create') {
    for (let i = 0; i < 8; i++) {
      const code = makeCode();
      const room: Room = { code, hostId: null, status: 'lobby', players: [], game: null, createdAt: now, updatedAt: now };
      if (await store.create(room)) {
        await notify(code, 0);
        return ok({ code });
      }
    }
    return fail(503, 'Não foi possível criar a sala. Tente de novo.');
  }

  const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) return fail(400, 'Código de sala inválido.');

  // loop de controle otimista
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = await store.get(code);
    if (!found) return fail(404, 'Sala não encontrada. Confira o código.');
    const { room, rev } = found;
    let mutated = settle(room, now);
    let reply: Reply | null = null;
    let me: RoomPlayer | null = null;

    switch (op) {
      /* ---------------------------------- estado ---------------------------------- */
      case 'state': {
        if (body.playerId) {
          me = auth(room, body);
          if (!me) return fail(403, 'Sessão inválida. Entre na sala novamente.');
        }
        reply = null; // resposta montada após salvar
        break;
      }

      /* ---------------------------------- entrar ---------------------------------- */
      case 'join': {
        if (body.playerId && body.secret) {
          me = auth(room, body);
          if (me) break; // reconexão
        }
        if (room.status !== 'lobby') return fail(409, 'A partida já começou.');
        if (room.players.length >= MAX_PLAYERS) return fail(409, 'A sala está cheia.');
        let name = cleanName(body.name);
        if (!name) return fail(400, 'Diga seu nome, parceiro.');
        const base = name;
        let n = 2;
        while (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${base.slice(0, 11)} ${n++}`;
        me = { id: makeId(), name, secret: makeToken() };
        room.players.push(me);
        if (!room.hostId) room.hostId = me.id;
        room.updatedAt = now;
        mutated = true;
        break;
      }

      /* --------------------------------- começar ---------------------------------- */
      case 'start':
      case 'rematch': {
        me = auth(room, body);
        if (!me) return fail(403, 'Sessão inválida.');
        if (room.hostId !== me.id) return fail(403, 'Só o anfitrião pode fazer isso.');
        if (op === 'start') {
          if (room.status !== 'lobby') return fail(409, 'A partida já começou.');
          if (room.players.length < MIN_PLAYERS) return fail(409, `São necessários pelo menos ${MIN_PLAYERS} jogadores.`);
          const seed = new Uint32Array(randomBytes(4).buffer)[0];
          room.game = newGame(room.players.map((p) => ({ id: p.id, name: p.name })), seed, now);
          room.status = 'playing';
        } else {
          if (room.status !== 'over') return fail(409, 'A partida ainda não terminou.');
          room.game = null;
          room.status = 'lobby';
        }
        room.updatedAt = now;
        mutated = true;
        break;
      }

      /* ---------------------------------- jogada ---------------------------------- */
      case 'act': {
        me = auth(room, body);
        if (!me) return fail(403, 'Sessão inválida.');
        if (room.status !== 'playing' || !room.game) return fail(409, 'A partida não está em andamento.');
        const r = apply(room.game, me.id, body.move as Move, now);
        if (!r.ok) {
          // devolve também o estado atual para o cliente se ressincronizar
          if (mutated && !(await store.save(room, rev))) continue;
          return { status: 422, body: { error: r.error, ...stateReply(room, mutated ? rev + 1 : rev, me.id, now) } };
        }
        room.game = r.state;
        if (room.game.phase.kind === 'over') room.status = 'over';
        room.updatedAt = now;
        mutated = true;
        break;
      }

      /* ----------------------------------- sair ----------------------------------- */
      case 'leave': {
        me = auth(room, body);
        if (!me) return ok({ left: true });
        if (room.status === 'lobby') {
          room.players = room.players.filter((p) => p.id !== me!.id);
          if (room.hostId === me.id) room.hostId = room.players[0]?.id ?? null;
        } else if (room.game && room.status === 'playing') {
          const g = forfeit(room.game, me.id, now);
          if (g) {
            room.game = g;
            if (g.phase.kind === 'over') room.status = 'over';
          }
          if (room.hostId === me.id) {
            const next = room.game.players.find((p) => p.hand.length > 0 && p.id !== me!.id);
            room.hostId = next?.id ?? room.hostId;
          }
        }
        room.updatedAt = now;
        mutated = true;
        reply = ok({ left: true });
        break;
      }

      default:
        return fail(400, 'Operação desconhecida.');
    }

    if (mutated) {
      const saved = await store.save(room, rev);
      if (!saved) continue; // conflito: recarrega e tenta de novo
      await notify(code, rev + 1);
    }
    const newRev = mutated ? rev + 1 : rev;
    if (reply) return reply;
    const out = stateReply(room, newRev, me ? me.id : null, now);
    if (op === 'join' && me) return ok({ ...out, playerId: me.id, secret: me.secret });
    return ok(out);
  }
  return fail(409, 'Muita gente jogando ao mesmo tempo. Tente de novo.');
}
