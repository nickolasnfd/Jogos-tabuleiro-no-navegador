// Servidor local completo: serve o front (dist/) e a API na MESMA porta, com salas em memória.
// Uso: npm run play  → mostra os endereços para abrir na TV e nos celulares (mesma rede Wi-Fi).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { handle } from '../src/server/handler';
import { MemoryStore } from '../src/server/memoryStore';

const store = new MemoryStore();
const port = Number(process.env.PORT || 8787);
const DIST = join(process.cwd(), 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();

  if (req.method === 'GET' || req.method === 'HEAD') {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = normalize(join(DIST, urlPath));
    if (!file.startsWith(DIST)) return void res.writeHead(403).end(); // evita path traversal
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('Rode "npm run build" antes.');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    return void res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  }

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
}).listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  console.log('\n  OMERTÀ no ar!\n');
  console.log(`  TV / notebook : ${(ips.length ? ips : ['localhost']).map((ip) => `http://${ip}:${port}/?mesa`).join('   ')}`);
  console.log(`  Celulares     : ${(ips.length ? ips : ['localhost']).map((ip) => `http://${ip}:${port}/`).join('   ')}  (ou leia o QR code da TV)\n`);
});
