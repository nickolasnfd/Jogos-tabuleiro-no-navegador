import type { ActionType, Role } from './types';

export const ROLES: Role[] = ['chefao', 'pistoleiro', 'cobrador', 'contador', 'advogado'];

export const ROLE_INFO: Record<Role, { name: string; short: string; power: string; blocks: string }> = {
  chefao: {
    name: 'O Chefão',
    short: 'Chefão',
    power: 'Cobra Tributo: pega 3 moedas.',
    blocks: 'Bloqueia o Contrabando.',
  },
  pistoleiro: {
    name: 'O Pistoleiro',
    short: 'Pistoleiro',
    power: 'Faz uma Encomenda: paga 3 moedas e elimina uma influência de alguém.',
    blocks: '—',
  },
  cobrador: {
    name: 'O Cobrador',
    short: 'Cobrador',
    power: 'Extorque: toma 2 moedas de outro jogador.',
    blocks: 'Bloqueia a Extorsão.',
  },
  contador: {
    name: 'O Contador',
    short: 'Contador',
    power: 'Lava os Livros: compra 2 cartas e troca com as suas.',
    blocks: 'Bloqueia a Extorsão.',
  },
  advogado: {
    name: 'O Advogado',
    short: 'Advogado',
    power: '—',
    blocks: 'Bloqueia a Encomenda do Pistoleiro.',
  },
};

export interface ActionInfo {
  name: string;
  cost: number;
  claim?: Role;
  needsTarget: boolean;
  blockedBy: Role[];
  /** quem pode bloquear: 'any' = qualquer um, 'target' = só o alvo */
  blockers?: 'any' | 'target';
  desc: string;
}

export const ACTIONS: Record<ActionType, ActionInfo> = {
  bico: { name: 'Bico', cost: 0, needsTarget: false, blockedBy: [], desc: 'Pega 1 moeda. Ninguém pode impedir.' },
  contrabando: {
    name: 'Contrabando',
    cost: 0,
    needsTarget: false,
    blockedBy: ['chefao'],
    blockers: 'any',
    desc: 'Pega 2 moedas. Um Chefão pode bloquear.',
  },
  acerto: {
    name: 'Acerto de Contas',
    cost: 7,
    needsTarget: true,
    blockedBy: [],
    desc: 'Paga 7 moedas. O alvo perde uma influência. Sem defesa.',
  },
  tributo: { name: 'Tributo', cost: 0, claim: 'chefao', needsTarget: false, blockedBy: [], desc: 'Chefão: pega 3 moedas.' },
  encomenda: {
    name: 'Encomenda',
    cost: 3,
    claim: 'pistoleiro',
    needsTarget: true,
    blockedBy: ['advogado'],
    blockers: 'target',
    desc: 'Pistoleiro: paga 3 moedas, o alvo perde uma influência.',
  },
  extorsao: {
    name: 'Extorsão',
    cost: 0,
    claim: 'cobrador',
    needsTarget: true,
    blockedBy: ['cobrador', 'contador'],
    blockers: 'target',
    desc: 'Cobrador: toma 2 moedas do alvo.',
  },
  livros: {
    name: 'Lavar os Livros',
    cost: 0,
    claim: 'contador',
    needsTarget: false,
    blockedBy: [],
    desc: 'Contador: compra 2 cartas e troca com as suas.',
  },
};

export const ACTION_ORDER: ActionType[] = ['bico', 'contrabando', 'tributo', 'extorsao', 'livros', 'encomenda', 'acerto'];

export const START_COINS = 2;
export const MAX_COINS_BEFORE_FORCED = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
