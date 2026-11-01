// Servidor local: mesma lógica do Edge Function do Supabase, com armazenamento em memória.
import { createServer } from 'node:http';
import { handle } from '../src/server/handler';
import { MemoryStore } from '../src/server/memoryStore';

const store = new MemoryStore();
const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method !== 'POST') return void res.writeHead(405).end();
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) return void res.writeHead(413).end();
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* handler responde 400 */
  }
  store.purge(Date.now());
  const r = await handle(store, body, Date.now());
  res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(r.body));
}).listen(port, () => console.log(`OMERTÀ dev server em http://localhost:${port}`));
