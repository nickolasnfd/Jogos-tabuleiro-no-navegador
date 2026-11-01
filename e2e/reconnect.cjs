// E2E: 6 jogadores + recarregar a página de um celular no meio da partida (reconexão) + celular sem sessão.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const mk = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const host = await mk();
  const errors = [];
  host.on('pageerror', (e) => errors.push(e.message));
  await host.goto(BASE + '/');
  await host.getByPlaceholder('Vito, Don Carlo…').fill('Don');
  await host.getByRole('button', { name: 'Criar nova sala' }).click();
  await host.waitForSelector('.code');
  const code = (await host.locator('.code').innerText()).trim();
  const names = ['Vito', 'Sonny', 'Michele', 'Fredo', 'Tom'];
  const guests = [];
  for (const n of names) {
    const p = await mk();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${BASE}/?sala=${code}`);
    await p.getByPlaceholder('Vito, Don Carlo…').fill(n);
    await p.getByRole('button', { name: 'Entrar na sala' }).click();
    await p.waitForSelector('.roster');
    guests.push(p);
  }
  // 7º jogador deve ser barrado
  const extra = await mk();
  await extra.goto(`${BASE}/?sala=${code}`);
  await extra.getByPlaceholder('Vito, Don Carlo…').fill('Extra');
  await extra.getByRole('button', { name: 'Entrar na sala' }).click();
  await extra.waitForSelector('.error');
  console.log('sala cheia ->', (await extra.locator('.error').innerText()).trim());

  await sleep(1500);
  console.log('jogadores no lobby (host vê):', await host.locator('.roster li').count());
  await host.getByRole('button', { name: 'Começar a partida' }).click();
  await host.waitForSelector('.mine');
  await sleep(1200);

  // reconexão: recarrega um convidado no meio do jogo
  const g = guests[2];
  const before = await g.locator('.mine .rcard-name').allInnerTexts();
  await g.reload();
  await g.waitForSelector('.mine');
  const after = await g.locator('.mine .rcard-name').allInnerTexts();
  console.log('mão antes/depois do reload:', JSON.stringify(before), JSON.stringify(after), JSON.stringify(before) === JSON.stringify(after) ? 'IGUAL' : 'DIFERENTE');

  // privacidade na UI: nenhum celular mostra nome de personagem dos oponentes (só o próprio .mine)
  const oppCards = await host.locator('.opponents .rcard').count();
  console.log('cartas de oponentes visíveis no celular do host:', oppCards);

  // celular com sala inexistente
  const lost = await mk();
  await lost.goto(`${BASE}/?sala=ZZZZ`);
  await lost.getByPlaceholder('Vito, Don Carlo…').fill('Perdido');
  await lost.getByRole('button', { name: 'Entrar na sala' }).click();
  await lost.waitForSelector('.error');
  console.log('sala inexistente ->', (await lost.locator('.error').innerText()).trim());

  // entrada tardia
  const late = await mk();
  await late.goto(`${BASE}/?sala=${code}`);
  await late.getByPlaceholder('Vito, Don Carlo…').fill('Tarde');
  await late.getByRole('button', { name: 'Entrar na sala' }).click();
  await late.waitForSelector('.error');
  console.log('entrada tardia ->', (await late.locator('.error').innerText()).trim());

  await host.screenshot({ path: '/tmp/omerta-shots/09-six-players-host.png' });
  console.log('erros JS:', errors.length ? errors : 'nenhum');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
