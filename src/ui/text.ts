import { ACTIONS, ROLE_INFO } from '../engine/info';
import type { ActionType, Declared } from '../engine/types';
import type { PublicPlayer, View } from '../engine/view';

export const nameOf = (v: View, id: string | null | undefined) => v.players.find((p) => p.id === id)?.name ?? '???';

const VERB: Record<ActionType, (a: string, t: string) => string> = {
  bico: (a) => `${a} faz um bico`,
  contrabando: (a) => `${a} tenta passar contrabando (+2)`,
  acerto: (a, t) => `${a} acerta as contas com ${t}`,
  tributo: (a) => `${a} diz ser o Chefão e cobra tributo (+3)`,
  encomenda: (a, t) => `${a} diz ser o Pistoleiro e faz uma encomenda contra ${t}`,
  extorsao: (a, t) => `${a} diz ser o Cobrador e extorque ${t}`,
  livros: (a) => `${a} diz ser o Contador e quer lavar os livros`,
};

export function declaredText(v: View, d: Declared) {
  return VERB[d.action](nameOf(v, d.actor), nameOf(v, d.target));
}

export interface Headline {
  title: string;
  sub?: string;
  tone: 'neutral' | 'alert' | 'bad' | 'good';
}

export function headline(v: View): Headline {
  const ph = v.phase;
  switch (ph.kind) {
    case 'action':
      return { title: `Vez de ${nameOf(v, ph.actor)}`, sub: 'Escolhendo uma jogada…', tone: 'neutral' };
    case 'react': {
      const wait = ph.waitingOn.map((id) => nameOf(v, id)).join(', ');
      return {
        title: declaredText(v, ph.declared),
        sub: ph.window === 'action' ? (wait ? `Pode desafiar ou bloquear — aguardando: ${wait}` : '') : `Pode ser bloqueado — aguardando: ${wait}`,
        tone: 'alert',
      };
    }
    case 'blockReact':
      return {
        title: `${nameOf(v, ph.blocker)} diz ser ${ROLE_INFO[ph.blockRole].name} e bloqueia ${nameOf(v, ph.declared.actor)}`,
        sub: `Alguém desafia? Aguardando: ${ph.waitingOn.map((id) => nameOf(v, id)).join(', ')}`,
        tone: 'alert',
      };
    case 'lose':
      return { title: `${nameOf(v, ph.who)} precisa sacrificar uma influência`, tone: 'bad' };
    case 'exchange':
      return { title: `${nameOf(v, ph.actor)} está lavando os livros`, sub: 'Trocando cartas em segredo…', tone: 'neutral' };
    case 'over':
      return { title: `${nameOf(v, ph.winner)} domina a cidade`, tone: 'good' };
    default:
      return { title: 'Aguardando a família', tone: 'neutral' };
  }
}

export const actionBlurb = (a: ActionType) => ACTIONS[a].desc;
export const byTurn = (ps: PublicPlayer[]) => ps;
