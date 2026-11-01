import type { StateReply } from '../server/handler';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
const API = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/game` : '/api';

export interface Creds {
  playerId: string;
  secret: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: StateReply,
  ) {
    super(message);
  }
}

export async function call<T = StateReply>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new ApiError(json?.error || `Erro ${res.status}`, res.status, json?.room ? (json as StateReply) : undefined);
  return json as T;
}

export const realtime = { url: SUPABASE_URL, key: SUPABASE_KEY };

/* ----------------------------- sessão no navegador ---------------------------- */

const KEY = 'omerta:sessions';
type Sessions = Record<string, Creds & { name: string }>;

function readAll(): Sessions {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function loadSession(code: string): (Creds & { name: string }) | null {
  return readAll()[code] ?? null;
}

export function saveSession(code: string, s: Creds & { name: string }) {
  try {
    const all = readAll();
    all[code] = s;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* modo privado: segue sem persistir */
  }
}

export function clearSession(code: string) {
  try {
    const all = readAll();
    delete all[code];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function lastName(): string {
  try {
    return localStorage.getItem('omerta:name') || '';
  } catch {
    return '';
  }
}
export function rememberName(n: string) {
  try {
    localStorage.setItem('omerta:name', n);
  } catch {
    /* ignore */
  }
}
