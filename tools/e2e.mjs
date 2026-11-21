/* e2e.mjs — plays a full cast→catch on the DEPLOYED site and proves the save
   persists across a reload. Usage: node tools/e2e.mjs [url] */
import { launch, sleep } from './cdp.mjs';

const URL_ = process.argv[2] || 'https://osman3n.github.io/hooked/';

const run = async (page, body) => {
  const r = await page.send('Runtime.evaluate', {
    expression: `(() => { ${body} })()`, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

const { client, close, errors } = await launch({ width: 1280, height: 800, dpr: 1 });
const fails = [];
const ok = (n, c, d) => { if (!c) fails.push(n + (d ? ' — ' + d : '')); console.log((c ? '  ok  ' : ' FAIL ') + n + (d ? '  ' + d : '')); };

await client.send('Page.navigate', { url: URL_ });
await sleep(3000);

// fresh start, then play one cast to completion through the real state machine
const played = await run(client, `
  localStorage.clear();
  const h = window.__hooked;
  h.ui.closeAll();
  const g = h.game;
  g.reset(); g.beginCharge();
  for (let i = 0; i < 45; i++) g.step(1/60, { held: true, pressed: false });
  g.releaseCharge();
  let ticks = 0;
  while (g.phase !== 'waiting' && ticks++ < 900) g.step(1/60, { held: false, pressed: false });
  let guard = 0;
  while (g.phase === 'waiting' && guard++ < 6000) g.step(1/60, { held: false, pressed: false });
  const bit = g.phase;
  g.step(1/60, { held: true, pressed: true });
  const hooked = g.phase === 'fight';
  guard = 0;
  while (g.phase === 'fight' && guard++ < 12000) {
    g.step(1/60, { held: g.tension < 62 && !(g.surging && g.tension > 40), pressed: false });
  }
  return { bit, hooked, phase: g.phase, name: g.result && g.result.target ? g.result.target.name : null,
           coins: h.state.data.coins, known: h.state.knownCount(), depth: +g.depth.toFixed(1),
           total: h.CONTENT.CATCHES.filter(c => !c.secret).length };
`);

ok('bite arrived', played.bit === 'bite', played.bit);
ok('bite hooked into a fight', played.hooked);
ok('fight ended in a landing', played.phase === 'land', played.phase + ' ' + played.name);
ok('coins were awarded', played.coins > 0, played.coins + 'c');
ok('codex recorded the species', played.known === 1, played.known + '/100');
ok('the roster is the expanded one', played.total >= 100, String(played.total));

// the shop must be able to take coins and actually raise a level
const bought = await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  h.state.data.coins = 5000;
  const before = h.state.upg('reel');
  h.state.buyUpg('reel');
  h.ui.openShop();
  const rows = document.querySelectorAll('#shopBody .item').length;
  const pips = document.querySelectorAll('#shopBody .pip.on').length;
  const label = (document.querySelector('#shopBody .item .lvl') || {}).textContent || '';
  h.ui.closeAll();
  return { before, after: h.state.upg('reel'), rows, pips, label };
`);
ok('the shop renders upgrade rows', bought.rows > 8, String(bought.rows));
ok('buying an upgrade raises its level', bought.after === bought.before + 1,
  `${bought.before} → ${bought.after}`);
ok('the level shows in the row', /Lv 1\//.test(bought.label), bought.label);
ok('the pip row is painted', bought.pips >= 1, String(bought.pips));

// reload: the save must survive, and the HUD must show it on first paint
await client.send('Page.navigate', { url: URL_ });
await sleep(2500);
const after = await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  return { known: h.state.knownCount(), coins: h.state.data.coins,
           chip: document.getElementById('codexCount').textContent };
`);
ok('save survived a reload', after.known === 1, 'known ' + after.known);
ok('coins survived a reload', after.coins > 0, after.coins + 'c');
ok('HUD reflects the save on first paint', after.chip.startsWith('1/'), after.chip);

const shot = await client.send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('shots/live.png', Buffer.from(shot.data, 'base64'));

console.log('\nconsole errors:', errors.length ? errors : 'none');
await close();
if (errors.length) fails.push('console errors');
if (fails.length) { console.log('\n❌ ' + fails.length + ' failed'); process.exitCode = 1; }
else console.log('\n✅ deployed build plays end to end');
