// Tipos do motor de regras de OMERTÀ (jogo de blefe, mecânica inspirada em jogos de dedução social).

export type Role = 'chefao' | 'pistoleiro' | 'cobrador' | 'contador' | 'advogado';

export type ActionType =
  | 'bico' // +1, sem reação
  | 'contrabando' // +2, bloqueável pelo Chefão
  | 'acerto' // paga 7, alvo perde influência, sem reação
  | 'tributo' // Chefão: +3
  | 'encomenda' // Pistoleiro: paga 3, alvo perde influência; bloqueável pelo Advogado
  | 'extorsao' // Cobrador: rouba 2; bloqueável por Cobrador/Contador
  | 'livros'; // Contador: troca cartas

export interface Declared {
  action: ActionType;
  actor: string;
  target?: string;
  claim?: Role; // personagem declarado pelo ator (se a ação exigir)
  paid: number; // moedas já pagas (reembolsáveis se o blefe for pego)
}

export type Then =
  | { t: 'endTurn' }
  | { t: 'resolve'; declared: Declared } // executar a ação (bloqueio blefado foi pego)
  | { t: 'afterChallenge'; declared: Declared }; // desafio à ação falhou -> janela de bloqueio ou resolve

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'action'; deadline: number }
  | {
      kind: 'react';
      declared: Declared;
      /** 'action' = pode desafiar e bloquear; 'afterChallenge' = só bloquear */
      window: 'action' | 'afterChallenge';
      passed: string[];
      deadline: number;
    }
  | {
      kind: 'blockReact';
      declared: Declared;
      blocker: string;
      blockRole: Role;
      passed: string[];
      deadline: number;
    }
  | { kind: 'lose'; who: string; then: Then; deadline: number }
  | { kind: 'exchange'; actor: string; options: Role[]; keep: number; deadline: number }
  | { kind: 'over'; winner: string };

export interface PlayerState {
  id: string;
  name: string;
  coins: number;
  hand: Role[]; // cartas ocultas (influências vivas)
  lost: Role[]; // cartas reveladas (influências perdidas)
}

export interface LogEntry {
  id: number;
  text: string;
  tone?: 'info' | 'bad' | 'good' | 'alert';
}

export interface GameState {
  players: PlayerState[];
  deck: Role[];
  turn: string; // id do jogador da vez
  phase: Phase;
  log: LogEntry[];
  logSeq: number;
  rng: number;
  round: number;
  version: number;
  timers: Timers;
}

export interface Timers {
  reactMs: number;
  choiceMs: number;
  actionMs: number;
}

export type Move =
  | { t: 'action'; action: ActionType; target?: string }
  | { t: 'challenge' }
  | { t: 'block'; role: Role }
  | { t: 'pass' }
  | { t: 'lose'; role: Role }
  | { t: 'exchange'; keep: Role[] };

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };
