// Ponto de entrada da Edge Function (Deno). Empacotado por scripts/build-fn.mjs.
import { handle } from '../src/server/handler';
import type { Room, Store } from '../src/server/handler';

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REST = `${URL_}/rest/v1/omerta_rooms`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class PgStore implements Store {
  async get(code: string) {
    const r = await fetch(`${REST}?code=eq.${code}&select=rev,data`, { headers: H });
    if (!r.ok) throw new Error(`db get ${r.status}`);
    const rows = (await r.json()) as { rev: number; data: Room }[];
    return rows[0] ? { room: rows[0].data, rev: rows[0].rev } : null;
  }
  async create(room: Room) {
    const r = await fetch(REST, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ code: room.code, rev: 0, data: room }),
    });
    if (r.status === 409) return false;
    if (!r.ok) throw new Error(`db create ${r.status}`);
    return true;
  }
  /** UPDATE ... WHERE rev = esperado  → controle otimista atômico */
  async save(room: Room, expectedRev: number) {
    const r = await fetch(`${REST}?code=eq.${room.code}&rev=eq.${expectedRev}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ rev: expectedRev + 1, data: room, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`db save ${r.status}`);
    return ((await r.json()) as unknown[]).length === 1;
  }
}

/** avisa os clientes (Realtime Broadcast) que a sala mudou; falhas são ignoradas (há polling) */
async function notify(code: string) {
  try {
    await fetch(`${URL_}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ messages: [{ topic: `omerta:${code}`, event: 'changed', payload: {}, private: false }] }),
    });
  } catch {
    /* ignore */
  }
}

const store = new PgStore();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405, headers: CORS });
  let body: unknown = null;
  try {
    const text = await req.text();
    if (text.length > 20_000) return new Response('grande demais', { status: 413, headers: CORS });
    body = JSON.parse(text);
  } catch {
    /* handler responde 400 */
  }
  try {
    if ((body as { op?: string } | null)?.op === 'create') {
      // limpeza oportunista de salas antigas
      fetch(`${URL_}/rest/v1/rpc/omerta_purge_rooms`, { method: 'POST', headers: H, body: '{}' }).catch(() => {});
    }
    const r = await handle(store, body, Date.now(), notify);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('erro interno', e);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
