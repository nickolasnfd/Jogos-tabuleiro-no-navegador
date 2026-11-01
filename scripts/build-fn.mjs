// Empacota a Edge Function (motor + handler + entrada) em um único arquivo para o Supabase.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('supabase/functions/game', { recursive: true });
await build({
  entryPoints: ['supabase/entry.ts'],
  outfile: 'supabase/functions/game/index.ts',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  legalComments: 'none',
  banner: { js: '// GERADO por scripts/build-fn.mjs — não edite à mão.' },
});
console.log('ok: supabase/functions/game/index.ts');
