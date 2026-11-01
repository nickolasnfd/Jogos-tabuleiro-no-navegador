import { describe, expect, it } from 'vitest';
import { handle } from './handler';
import type { StateReply } from './handler';
import { MemoryStore } from './memoryStore';

const T0 = 5_000_000;
type R = { status: number; body: any };
const call = async (store: MemoryStore, body: object, now = T0) => (await handle(store, body, now)) as R;

async function lobby(n = 3) {
  const store = new MemoryStore();
  const { code } = (await call(store, { op: 'create' })).body;
  const ps: { id: string; secret: string; name: string }[] = [];
  for (let i = 0; i < n; i++) {
    const r = await call(store, { op: 'join', code, name: `Jogador${i}` });
    ps.push({ id: r.body.playerId, secret: r.body.secret, name: `Jogador${i}` });
  }
  return { store, code, ps };
}

describe('sala e lobby', () => {
  it('cria sala com código de 4 letras e o primeiro a entrar vira anfitrião', async () => {
    const { store, code, ps } = await lobby(3);
    expect(code).toMatch(/^[A-Z]{4}$/);
    const s = (await call(store, { op: 'state', code })).body as StateReply;
    expect(s.room.hostId).toBe(ps[0].id);
    expect(s.room.players).toHaveLength(3);
    expect(JSON.stringify(s)).not.toContain(ps[0].secret);
  });
  it('código inexistente retorna 404; nome vazio retorna 400', async () => {
    const store = new MemoryStore();
    expect((await call(store, { op: 'state', code: 'ZZZZ' })).status).toBe(404);
    const { code } = (await call(store, { op: 'create' })).body;
    expect((await call(store, { op: 'join', code, name: '   ' })).status).toBe(400);
  });
  it('nomes repetidos recebem sufixo; HTML é removido', async () => {
    const store = new MemoryStore();
    const { code } = (await call(store, { op: 'create' })).body;
    await call(store, { op: 'join', code, name: 'Vito' });
    const r = await call(store, { op: 'join', code, name: 'vito' });
    expect(r.body.room.players.map((p: any) => p.name)).toEqual(['Vito', 'vito 2']);
    const x = await call(store, { op: 'join', code, name: '<b>Al</b>' });
    expect(x.body.room.players.at(-1).name).toBe('bAl/b');
  });
  it('sala lotada (6) recusa o sétimo', async () => {
    const { store, code } = await lobby(6);
    expect((await call(store, { op: 'join', code, name: 'Extra' })).status).toBe(409);
  });
  it('só o anfitrião inicia e precisa de 2+ jogadores', async () => {
    const { store, code, ps } = await lobby(1);
    expect((await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret })).status).toBe(409);
    const r = await call(store, { op: 'join', code, name: 'Outro' });
    const guest = { playerId: r.body.playerId, secret: r.body.secret };
    expect((await call(store, { op: 'start', code, ...guest })).status).toBe(403);
    expect((await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret })).status).toBe(200);
  });
  it('reconexão: join com credenciais devolve o mesmo jogador', async () => {
    const { store, code, ps } = await lobby(2);
    const r = await call(store, { op: 'join', code, playerId: ps[1].id, secret: ps[1].secret });
    expect(r.body.playerId).toBe(ps[1].id);
    expect(r.body.room.players).toHaveLength(2);
  });
  it('entrada tardia é recusada com a partida em andamento', async () => {
    const { store, code, ps } = await lobby(2);
    await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret });
    expect((await call(store, { op: 'join', code, name: 'Atrasado' })).status).toBe(409);
  });
});

describe('privacidade (o ponto mais importante)', () => {
  it('nenhuma resposta contém cartas de outros jogadores nem o baralho', async () => {
    const { store, code, ps } = await lobby(4);
    await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret });
    const peek = async (body: object) => JSON.stringify((await call(store, body)).body);

    const truth = (await store.get(code))!.room.game!;
    const handOf = (id: string) => truth.players.find((p) => p.id === id)!.hand;

    // a TV (sem credenciais) não vê nenhuma mão
    const tv = (await call(store, { op: 'state', code })).body as StateReply;
    expect(tv.view!.hand).toEqual([]);
    expect(JSON.stringify(tv)).not.toContain('"deck"');
    expect(JSON.stringify(tv)).not.toContain('"hand":["');

    // cada jogador só vê a própria mão
    for (const me of ps) {
      const mine = (await call(store, { op: 'state', code, playerId: me.id, secret: me.secret })).body as StateReply;
      expect(mine.view!.hand).toEqual(handOf(me.id));
      for (const p of mine.view!.players) {
        expect(Object.keys(p)).not.toContain('hand');
        expect(typeof p.cards).toBe('number');
      }
    }

    // segredo errado ou ausente nunca devolve mão
    const bad = await call(store, { op: 'state', code, playerId: ps[1].id, secret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
    expect(bad.status).toBe(403);
    expect(await peek({ op: 'state', code, playerId: ps[1].id })).toContain('Sessão inválida');
  });
  it('não é possível jogar como outro jogador', async () => {
    const { store, code, ps } = await lobby(3);
    await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret });
    const r = await call(store, { op: 'act', code, playerId: ps[0].id, secret: ps[1].secret, move: { t: 'action', action: 'bico' } });
    expect(r.status).toBe(403);
  });
});

describe('partida pela API', () => {
  it('joga um turno, rejeita jogada ilegal e processa timeout lazy', async () => {
    const { store, code, ps } = await lobby(3);
    await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret });
    const st = (await call(store, { op: 'state', code })).body as StateReply;
    const turnId = (st.view!.phase as any).actor as string;
    const turnP = ps.find((p) => p.id === turnId)!;
    const other = ps.find((p) => p.id !== turnId)!;

    const bad = await call(store, { op: 'act', code, playerId: other.id, secret: other.secret, move: { t: 'action', action: 'bico' } });
    expect(bad.status).toBe(422);

    const good = await call(store, { op: 'act', code, playerId: turnP.id, secret: turnP.secret, move: { t: 'action', action: 'bico' } });
    expect(good.status).toBe(200);
    const after = good.body as StateReply;
    expect(after.view!.players.find((p) => p.id === turnId)!.coins).toBe(3);

    // timeout: ninguém age por 2 minutos -> próximo jogador faz bico automaticamente
    const late = (await call(store, { op: 'state', code }, T0 + 120_000)).body as StateReply;
    expect(late.view!.version).toBeGreaterThan(after.view!.version);
  });
  it('desistir no meio da partida e revanche', async () => {
    const { store, code, ps } = await lobby(2);
    await call(store, { op: 'start', code, playerId: ps[0].id, secret: ps[0].secret });
    await call(store, { op: 'leave', code, playerId: ps[1].id, secret: ps[1].secret });
    const s = (await call(store, { op: 'state', code })).body as StateReply;
    expect(s.room.status).toBe('over');
    const rematch = await call(store, { op: 'rematch', code, playerId: s.room.hostId, secret: ps.find((p) => p.id === s.room.hostId)!.secret });
    expect(rematch.status).toBe(200);
    expect(rematch.body.room.status).toBe('lobby');
  });
});
