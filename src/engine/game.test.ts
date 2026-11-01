import { describe, expect, it } from 'vitest';
import { apply, alivePlayers, forfeit, getPlayer, newGame, responders, tick } from './game';
import type { GameState, Move, Role } from './types';
import { viewFor } from './view';

const NOW = 1_000_000;

function setup(n = 3): GameState {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
  const s = newGame(ids.map((id) => ({ id, name: id.toUpperCase() })), 42, NOW);
  // fixa a ordem de jogo: a, b, c...
  s.players.sort((x, y) => x.id.localeCompare(y.id));
  s.turn = 'a';
  return s;
}

function give(s: GameState, id: string, hand: Role[]) {
  getPlayer(s, id)!.hand = [...hand];
}

function ok(s: GameState, who: string, m: Move, now = NOW): GameState {
  const r = apply(s, who, m, now);
  if (!r.ok) throw new Error(`jogada recusada: ${r.error}`);
  return r.state;
}

function total(s: GameState) {
  // durante a troca, as 2 cartas compradas ficam na fase (options inclui a mão do ator)
  const inTransit = s.phase.kind === 'exchange' ? s.phase.options.length - s.phase.keep : 0;
  return s.deck.length + inTransit + s.players.reduce((n, p) => n + p.hand.length + p.lost.length, 0);
}

describe('início do jogo', () => {
  it('distribui 2 cartas e 2 moedas, 15 cartas no total', () => {
    const s = setup(4);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(2);
      expect(p.coins).toBe(2);
    }
    expect(total(s)).toBe(15);
  });
  it('recusa menos de 2 ou mais de 6 jogadores', () => {
    expect(() => newGame([{ id: 'x', name: 'X' }], 1, NOW)).toThrow();
    const sete = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => newGame(sete, 1, NOW)).toThrow();
  });
});

describe('ações sem reação', () => {
  it('bico: +1 moeda e passa a vez', () => {
    const s = ok(setup(), 'a', { t: 'action', action: 'bico' });
    expect(getPlayer(s, 'a')!.coins).toBe(3);
    expect(s.turn).toBe('b');
    expect(s.phase.kind).toBe('action');
  });
  it('não age fora da vez', () => {
    const r = apply(setup(), 'b', { t: 'action', action: 'bico' }, NOW);
    expect(r.ok).toBe(false);
  });
  it('acerto: exige 7 moedas, tira influência do alvo', () => {
    let s = setup();
    expect(apply(s, 'a', { t: 'action', action: 'acerto', target: 'b' }, NOW).ok).toBe(false);
    getPlayer(s, 'a')!.coins = 7;
    s = ok(s, 'a', { t: 'action', action: 'acerto', target: 'b' });
    expect(getPlayer(s, 'a')!.coins).toBe(0);
    expect(s.phase.kind).toBe('lose');
    const hand = getPlayer(s, 'b')!.hand;
    s = ok(s, 'b', { t: 'lose', role: hand[0] });
    expect(getPlayer(s, 'b')!.hand).toHaveLength(1);
    expect(s.turn).toBe('b');
  });
  it('com 10+ moedas é obrigatório dar o acerto', () => {
    const s = setup();
    getPlayer(s, 'a')!.coins = 10;
    expect(apply(s, 'a', { t: 'action', action: 'bico' }, NOW).ok).toBe(false);
    expect(apply(s, 'a', { t: 'action', action: 'tributo' }, NOW).ok).toBe(false);
    expect(apply(s, 'a', { t: 'action', action: 'acerto', target: 'b' }, NOW).ok).toBe(true);
  });
  it('influência única é revelada automaticamente', () => {
    let s = setup();
    getPlayer(s, 'a')!.coins = 7;
    getPlayer(s, 'b')!.hand = ['advogado'];
    s = ok(s, 'a', { t: 'action', action: 'acerto', target: 'b' });
    expect(getPlayer(s, 'b')!.hand).toHaveLength(0);
    expect(getPlayer(s, 'b')!.lost).toEqual(['advogado']);
    expect(s.turn).toBe('c'); // b eliminado -> pula
  });
});

describe('contrabando e bloqueio do Chefão', () => {
  it('sem reação: +2', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'contrabando' });
    expect(s.phase.kind).toBe('react');
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(getPlayer(s, 'a')!.coins).toBe(4);
  });
  it('qualquer um pode bloquear; bloqueio honesto vence o desafio', () => {
    let s = setup();
    give(s, 'b', ['chefao', 'advogado']);
    s = ok(s, 'a', { t: 'action', action: 'contrabando' });
    s = ok(s, 'b', { t: 'block', role: 'chefao' });
    expect(s.phase.kind).toBe('blockReact');
    give(s, 'a', ['pistoleiro', 'contador']);
    s = ok(s, 'a', { t: 'challenge' });
    // A perde influência por desafio falho; ação cancelada
    expect(s.phase.kind).toBe('lose');
    s = ok(s, 'a', { t: 'lose', role: 'contador' });
    expect(getPlayer(s, 'a')!.coins).toBe(2); // não ganhou as 2
    expect(getPlayer(s, 'a')!.hand).toHaveLength(1);
    expect(s.turn).toBe('b');
  });
  it('bloqueio blefado e desafiado: bloqueador perde carta e a ação acontece', () => {
    let s = setup();
    give(s, 'b', ['advogado', 'advogado']);
    s = ok(s, 'a', { t: 'action', action: 'contrabando' });
    s = ok(s, 'b', { t: 'block', role: 'chefao' });
    s = ok(s, 'c', { t: 'challenge' });
    expect(s.phase.kind).toBe('lose');
    s = ok(s, 'b', { t: 'lose', role: 'advogado' });
    expect(getPlayer(s, 'a')!.coins).toBe(4);
    expect(s.turn).toBe('b');
  });
  it('bloqueio sem desafio vale: ação cancelada', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'contrabando' });
    s = ok(s, 'b', { t: 'block', role: 'chefao' });
    s = ok(s, 'a', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(getPlayer(s, 'a')!.coins).toBe(2);
    expect(s.turn).toBe('b');
  });
});

describe('desafios', () => {
  it('tributo honesto: desafiante perde, ator troca a carta e ganha 3', () => {
    let s = setup();
    give(s, 'a', ['chefao', 'contador']);
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    s = ok(s, 'b', { t: 'challenge' });
    expect(s.phase.kind).toBe('lose');
    s = ok(s, 'b', { t: 'lose', role: getPlayer(s, 'b')!.hand[0] });
    expect(getPlayer(s, 'a')!.coins).toBe(5);
    expect(getPlayer(s, 'b')!.hand).toHaveLength(1);
    expect(getPlayer(s, 'a')!.hand).toHaveLength(2);
    expect(total(s)).toBe(15);
  });
  it('tributo blefado: ator perde carta, não ganha moedas', () => {
    let s = setup();
    give(s, 'a', ['advogado', 'contador']);
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    s = ok(s, 'c', { t: 'challenge' });
    s = ok(s, 'a', { t: 'lose', role: 'advogado' });
    expect(getPlayer(s, 'a')!.coins).toBe(2);
    expect(s.turn).toBe('b');
  });
  it('desafio a uma Encomenda blefada reembolsa as 3 moedas', () => {
    let s = setup();
    give(s, 'a', ['advogado', 'contador']);
    getPlayer(s, 'a')!.coins = 3;
    s = ok(s, 'a', { t: 'action', action: 'encomenda', target: 'b' });
    expect(getPlayer(s, 'a')!.coins).toBe(0);
    s = ok(s, 'b', { t: 'challenge' });
    expect(getPlayer(s, 'a')!.coins).toBe(3);
  });
  it('quando todos passam, a ação é resolvida', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(getPlayer(s, 'a')!.coins).toBe(5);
  });
  it('não se pode passar duas vezes nem reagir à própria ação', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    expect(apply(s, 'a', { t: 'challenge' }, NOW).ok).toBe(false);
    expect(apply(s, 'a', { t: 'pass' }, NOW).ok).toBe(false);
  });
});

describe('Encomenda (Pistoleiro) e Advogado', () => {
  it('só o alvo pode bloquear', () => {
    let s = setup();
    give(s, 'a', ['pistoleiro', 'contador']);
    getPlayer(s, 'a')!.coins = 3;
    s = ok(s, 'a', { t: 'action', action: 'encomenda', target: 'b' });
    expect(apply(s, 'c', { t: 'block', role: 'advogado' }, NOW).ok).toBe(false);
    expect(apply(s, 'b', { t: 'block', role: 'advogado' }, NOW).ok).toBe(true);
  });
  it('bloqueio vale e as 3 moedas NÃO voltam', () => {
    let s = setup();
    give(s, 'a', ['pistoleiro', 'contador']);
    getPlayer(s, 'a')!.coins = 3;
    s = ok(s, 'a', { t: 'action', action: 'encomenda', target: 'b' });
    s = ok(s, 'b', { t: 'block', role: 'advogado' });
    s = ok(s, 'a', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(getPlayer(s, 'a')!.coins).toBe(0);
    expect(getPlayer(s, 'b')!.hand).toHaveLength(2);
  });
  it('alvo desafia e perde: perde a carta do desafio E é executado pela Encomenda (pode morrer)', () => {
    let s = setup();
    give(s, 'a', ['pistoleiro', 'contador']);
    give(s, 'b', ['advogado', 'chefao']);
    getPlayer(s, 'a')!.coins = 3;
    s = ok(s, 'a', { t: 'action', action: 'encomenda', target: 'b' });
    s = ok(s, 'b', { t: 'challenge' });
    s = ok(s, 'b', { t: 'lose', role: 'advogado' }); // desafio falhou
    expect(s.phase.kind).toBe('react'); // ainda pode bloquear (janela só de bloqueio)
    if (s.phase.kind === 'react') expect(s.phase.window).toBe('afterChallenge');
    s = ok(s, 'b', { t: 'pass' }); // sem Advogado verdadeiro, não bloqueia
    // a Encomenda executa: b tinha 1 carta -> eliminado
    expect(getPlayer(s, 'b')!.hand).toHaveLength(0);
    expect(alivePlayers(s)).toHaveLength(2);
  });
  it('o bloqueador blefado perde uma carta e a Encomenda ainda acerta', () => {
    let s = setup();
    give(s, 'a', ['pistoleiro', 'contador']);
    give(s, 'b', ['chefao', 'chefao']);
    getPlayer(s, 'a')!.coins = 3;
    s = ok(s, 'a', { t: 'action', action: 'encomenda', target: 'b' });
    s = ok(s, 'b', { t: 'block', role: 'advogado' });
    s = ok(s, 'a', { t: 'challenge' });
    s = ok(s, 'b', { t: 'lose', role: 'chefao' }); // blefe pego -> a Encomenda executa
    // b perdeu 1 carta pelo blefe e a última pela Encomenda (auto-revelada)
    expect(getPlayer(s, 'b')!.hand).toHaveLength(0);
    expect(getPlayer(s, 'b')!.lost).toEqual(['chefao', 'chefao']);
  });
});

describe('Extorsão', () => {
  it('toma até 2 moedas', () => {
    let s = setup();
    give(s, 'a', ['cobrador', 'contador']);
    getPlayer(s, 'b')!.coins = 1;
    s = ok(s, 'a', { t: 'action', action: 'extorsao', target: 'b' });
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(getPlayer(s, 'a')!.coins).toBe(3);
    expect(getPlayer(s, 'b')!.coins).toBe(0);
  });
  it('Cobrador ou Contador bloqueiam; Chefão não', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'extorsao', target: 'b' });
    expect(apply(s, 'b', { t: 'block', role: 'chefao' }, NOW).ok).toBe(false);
    expect(apply(s, 'b', { t: 'block', role: 'cobrador' }, NOW).ok).toBe(true);
    expect(apply(s, 'b', { t: 'block', role: 'contador' }, NOW).ok).toBe(true);
  });
});

describe('Lavar os Livros', () => {
  it('compra 2, escolhe quais manter, deck continua com 15 cartas', () => {
    let s = setup();
    give(s, 'a', ['contador', 'advogado']);
    s = ok(s, 'a', { t: 'action', action: 'livros' });
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(s.phase.kind).toBe('exchange');
    if (s.phase.kind !== 'exchange') return;
    expect(s.phase.options).toHaveLength(4);
    const keep = s.phase.options.slice(1, 3);
    s = ok(s, 'a', { t: 'exchange', keep });
    expect(getPlayer(s, 'a')!.hand).toEqual(keep);
    expect(total(s)).toBe(15);
    expect(s.turn).toBe('b');
  });
  it('rejeita seleção inválida', () => {
    let s = setup();
    give(s, 'a', ['contador', 'advogado']);
    s = ok(s, 'a', { t: 'action', action: 'livros' });
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(apply(s, 'a', { t: 'exchange', keep: ['chefao'] }, NOW).ok).toBe(false);
    expect(apply(s, 'a', { t: 'exchange', keep: ['chefao', 'chefao'] }, NOW).ok).toBe(false);
  });
});

describe('fim de jogo', () => {
  it('último jogador vivo vence', () => {
    let s = setup(2);
    getPlayer(s, 'a')!.coins = 7;
    getPlayer(s, 'b')!.hand = ['chefao'];
    s = ok(s, 'a', { t: 'action', action: 'acerto', target: 'b' });
    expect(s.phase).toEqual({ kind: 'over', winner: 'a' });
    expect(apply(s, 'a', { t: 'action', action: 'bico' }, NOW).ok).toBe(false);
  });
});

describe('prazos (timer)', () => {
  it('reação expira: todos passam e a ação resolve', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    expect(tick(s, NOW + 5_000)).toBeNull();
    const t = tick(s, NOW + 11_000)!;
    expect(getPlayer(t, 'a')!.coins).toBe(5);
    expect(t.turn).toBe('b');
  });
  it('turno expira: faz um bico', () => {
    const s = setup();
    const t = tick(s, NOW + 61_000)!;
    expect(getPlayer(t, 'a')!.coins).toBe(3);
  });
  it('turno expira com 10+ moedas: dá o acerto', () => {
    const s = setup();
    getPlayer(s, 'a')!.coins = 10;
    const t = tick(s, NOW + 61_000)!;
    expect(getPlayer(t, 'a')!.coins).toBe(3);
  });
  it('escolha de carta expira: revela a primeira', () => {
    let s = setup();
    getPlayer(s, 'a')!.coins = 7;
    s = ok(s, 'a', { t: 'action', action: 'acerto', target: 'b' });
    const t = tick(s, NOW + 31_000)!;
    expect(getPlayer(t, 'b')!.hand).toHaveLength(1);
  });
});

describe('abandono', () => {
  it('quem sai na própria vez passa a vez; sobra um e termina', () => {
    const s = setup(2);
    const t = forfeit(s, 'a', NOW)!;
    expect(t.phase).toEqual({ kind: 'over', winner: 'b' });
  });
  it('sair durante a janela de reação não trava o jogo', () => {
    let s = setup(3);
    s = ok(s, 'a', { t: 'action', action: 'tributo' });
    s = ok(s, 'b', { t: 'pass' });
    const t = forfeit(s, 'c', NOW)!;
    expect(getPlayer(t, 'a')!.coins).toBe(5);
  });
});

describe('visão e privacidade', () => {
  it('a visão de um jogador nunca contém as cartas dos outros', () => {
    const s = setup(4);
    const v = viewFor(s, 'a');
    const json = JSON.stringify(v);
    expect(v.hand).toEqual(getPlayer(s, 'a')!.hand);
    for (const p of s.players.filter((x) => x.id !== 'a')) {
      expect(v.players.find((x) => x.id === p.id)).not.toHaveProperty('hand');
    }
    expect(json).not.toContain('"deck"');
    expect(viewFor(s, null).hand).toEqual([]);
  });
  it('opções da troca só aparecem para o ator', () => {
    let s = setup();
    s = ok(s, 'a', { t: 'action', action: 'livros' });
    s = ok(s, 'b', { t: 'pass' });
    s = ok(s, 'c', { t: 'pass' });
    expect(viewFor(s, 'a').can.exchange).not.toBeNull();
    expect(viewFor(s, 'b').can.exchange).toBeNull();
    expect(JSON.stringify(viewFor(s, 'b'))).not.toContain('options');
  });
});

/* ------------------------- simulação de partidas aleatórias ------------------- */

function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function randomMove(s: GameState, rnd: () => number): { who: string; move: Move } | null {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  for (const p of s.players) {
    const v = viewFor(s, p.id);
    const opts: Move[] = [];
    for (const a of v.can.actions) {
      if (!a.enabled) continue;
      opts.push({ t: 'action', action: a.action, target: v.can.targets.length ? pick(v.can.targets) : undefined });
    }
    if (v.can.pass) opts.push({ t: 'pass' }, { t: 'pass' });
    if (v.can.challenge) opts.push({ t: 'challenge' });
    for (const r of v.can.block) opts.push({ t: 'block', role: r });
    for (const r of v.can.lose) opts.push({ t: 'lose', role: r });
    if (v.can.exchange) {
      const pool = [...v.can.exchange.options];
      const keep: Role[] = [];
      for (let i = 0; i < v.can.exchange.keep; i++) keep.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      opts.push({ t: 'exchange', keep });
    }
    if (opts.length && rnd() < 0.6) return { who: p.id, move: pick(opts) };
  }
  return null;
}

describe('simulação (fuzz)', () => {
  it('1500 partidas aleatórias terminam sem estados inválidos', () => {
    let finished = 0;
    for (let g = 0; g < 1500; g++) {
      const rnd = lcg(g + 1);
      const n = 2 + (g % 5);
      let s = newGame(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), g + 7, 0);
      let now = 0;
      for (let step = 0; step < 4000 && s.phase.kind !== 'over'; step++) {
        const m = randomMove(s, rnd);
        if (m) {
          const r = apply(s, m.who, m.move, now);
          if (!r.ok) throw new Error(`jogada legal recusada (jogo ${g}): ${JSON.stringify(m)} -> ${r.error}`);
          s = r.state;
        } else {
          now += 12_000;
          const t = tick(s, now);
          if (t) s = t;
        }
        // invariantes
        expect(total(s)).toBe(15);
        for (const p of s.players) {
          expect(p.hand.length + p.lost.length).toBe(2);
          expect(p.coins).toBeGreaterThanOrEqual(0);
        }
        if (s.phase.kind !== 'over') {
          expect(alivePlayers(s).length).toBeGreaterThan(1);
          expect(getPlayer(s, s.turn)!.hand.length).toBeGreaterThan(0);
        }
        // nenhuma janela fica sem respondentes
        if (s.phase.kind === 'react' || s.phase.kind === 'blockReact') {
          expect(responders(s).length).toBeGreaterThan(0);
        }
      }
      if (s.phase.kind === 'over') finished++;
    }
    expect(finished).toBe(1500);
  });
});
