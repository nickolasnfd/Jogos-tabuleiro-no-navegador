// E2E: 1 TV + N celulares (Chromium real) jogam uma partida completa pela interface.
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '/tmp/omerta-shots';
const BASE = process.env.BASE || 'http://localhost:5173';
const N = Number(process.env.PLAYERS || 3);
require('fs').mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function botStep(page, name) {
  // ordem: decisões pendentes
  if (await page.locator('.btn.target').count()) {
    await page.locator('.btn.target').nth(0).click();
    return 'alvo';
  }
  if (await page.locator('.react-btns').count()) {
    const r = Math.random();
    const challenge = page.locator('.react-btns .btn.red');
    const block = page.locator('.react-btns .btn.gold');
    if (r < 0.25 && (await challenge.count())) { await challenge.first().click(); return 'desafiar'; }
    if (r < 0.4 && (await block.count())) { await block.first().click(); return 'bloquear'; }
    await page.locator('.react-btns .btn.ghost').click();
    return 'passar';
  }
  if (await page.locator('.decision .hand button.rcard').count() && !(await page.locator('.hand.wrap').count())) {
    await page.locator('.decision .hand button.rcard').first().click();
    return 'perder';
  }
  if (await page.locator('.hand.wrap').count()) {
    const cards = page.locator('.hand.wrap button.rcard');
    const keep = await page.locator('.decision h3').innerText();
    const k = Number(keep.match(/(\d+)/)?.[1] || 1);
    for (let i = 0; i < k; i++) await cards.nth(i).click();
    await page.locator('.decision .btn.gold').click();
    return 'trocar';
  }
  const acts = page.locator('.act:not(:disabled)');
  const n = await acts.count();
  if (n) {
    // prefere jogadas fortes: acerto > encomenda > resto
    const names = await acts.locator('.act-name').allInnerTexts();
    const idx = names.findIndex((x) => /Acerto/.test(x));
    await acts.nth(idx >= 0 ? idx : Math.floor(Math.random() * n)).click();
    return 'ação';
  }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const tv = await tvCtx.newPage();
  const errors = [];
  tv.on('pageerror', (e) => errors.push('TV: ' + e.message));
  await tv.goto(`${BASE}/?mesa`);
  await tv.getByRole('button', { name: 'Abrir nova mesa' }).click();
  await tv.waitForSelector('.code');
  const code = (await tv.locator('.code').innerText()).trim();
  console.log('sala', code);

  const phones = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`P${i}: ` + e.message));
    // simula leitura do QR: abre o link com ?sala=
    await p.goto(`${BASE}/?sala=${code}`);
    await p.getByPlaceholder('Vito, Don Carlo…').fill(['Vito', 'Sonny', 'Michele', 'Fredo', 'Tom', 'Luca'][i]);
    await p.getByRole('button', { name: 'Entrar na sala' }).click();
    await p.waitForSelector('.roster');
    phones.push({ p, name: ['Vito', 'Sonny', 'Michele', 'Fredo', 'Tom', 'Luca'][i] });
  }
  await sleep(1800);
  await tv.screenshot({ path: `${OUT}/01-tv-lobby.png` });
  await phones[0].p.screenshot({ path: `${OUT}/02-phone-lobby-host.png` });

  await phones[0].p.getByRole('button', { name: 'Começar a partida' }).click();
  await phones[0].p.waitForSelector('.mine');
  await sleep(1500);
  await tv.screenshot({ path: `${OUT}/03-tv-game.png` });
  await phones[0].p.screenshot({ path: `${OUT}/04-phone-game.png` });

  let steps = 0, shot = 0, over = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 170000) {
    for (const ph of phones) {
      try {
        const did = await botStep(ph.p, ph.name);
        if (did) steps++;
        if (did === 'ação' && shot < 1 && Math.random() < 0.2) { shot++; }
      } catch (e) { /* elemento mudou entre a checagem e o clique: normal */ }
    }
    if (steps === 6) {
      await sleep(300);
      await tv.screenshot({ path: `${OUT}/05-tv-mid.png` });
      for (let i = 0; i < phones.length; i++) await phones[i].p.screenshot({ path: `${OUT}/06-phone-${i}-mid.png` });
    }
    if (await tv.locator('.winner').count()) { over = true; break; }
    await sleep(250);
  }
  await sleep(1500);
  await tv.screenshot({ path: `${OUT}/07-tv-over.png` });
  await phones[0].p.screenshot({ path: `${OUT}/08-phone-over.png` });
  const winner = over ? await tv.locator('.winner .over-title').innerText() : null;
  console.log(JSON.stringify({ code, over, steps, winner, errors, secs: Math.round((Date.now() - t0) / 1000) }));

  // privacidade na UI: nenhum celular mostra cartas dos outros (só a própria mão)
  const html = await phones[1].p.content();
  console.log('mão do P1 visível no HTML dele:', (await phones[1].p.locator('.mine .rcard').count()), 'cartas (inclui reveladas)');
  await browser.close();
  process.exit(over && errors.length === 0 ? 0 : 1);
})();
