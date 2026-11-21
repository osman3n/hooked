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

// the new loop systems must be live on the deployed build, not just locally
const mech = await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  // snapshot the save: this probe mutates caught/streak, and the reload
  // assertions below would then be measuring the probe, not persistence
  const savedCaught = JSON.stringify(h.state.data.caught);

  // 1. the gold window: beginCharge() only rolls a window from IDLE, so the
  //    game must be reset between samples or every sample reuses the first
  const lows = [];
  for (let i = 0; i < 12; i++) {
    h.game.reset();
    h.game.beginCharge(false);
    lows.push(h.game.sweetLo);
  }
  const distinct = new Set(lows.map(v => v.toFixed(3))).size;

  // 2. a dead-centre release must register as a perfect cast
  h.game.reset();
  h.game.beginCharge(false);
  h.game.power = (h.game.sweetLo + h.game.sweetHi) / 2;
  h.game.releaseCharge();
  const goldCast = h.game.perfectCast;

  // 3. the daily cast must force the abyss on a short rod
  h.game.reset();
  h.state.data.rod = 'bamboo';
  h.state.data.dailyOn = '';
  h.game.beginCharge(true);
  h.game.power = 0.4;
  h.game.releaseCharge();
  const dailyDepth = h.game.depth;
  const dailySpent = h.state.dailyReady() === false;

  // 4. streaks: three landings then a loss must reset to zero
  h.state.data.streak = 0; h.state.data.losses = 0;
  const def = h.CONTENT.CATCHES[0];
  for (let i = 0; i < 3; i++) h.state.land(def, 1, 10);
  const streakUp = h.state.data.streak;
  const streakMult = h.state.streakMult();
  h.state.loss();
  const streakGone = h.state.data.streak;

  // 5. size records: a bigger catch of a known species must flag
  const small = h.state.land(def, 1, 1);
  const big = h.state.land(def, 1, 999);
  const smaller = h.state.land(def, 1, 2);

  // put the save back so the reload assertions test persistence
  h.state.data.caught = JSON.parse(savedCaught);
  h.state.data.streak = 0;
  h.state.data.losses = 0;
  h.state.save();

  return { distinct, goldCast, dailyDepth, dailySpent,
           streakUp, streakMult, streakGone,
           bigRecord: !!big.record, smallRecord: !!smaller.record };
`);
ok('the gold window moves every cast', mech.distinct > 4, `${mech.distinct} distinct windows in 12`);
ok('a dead-centre release is a perfect cast', mech.goldCast === true, String(mech.goldCast));
ok('the daily cast reaches the abyss on a bamboo rod', mech.dailyDepth >= 41,
  mech.dailyDepth.toFixed(1) + 'm');
ok('the daily cast spends itself', mech.dailySpent === true, String(mech.dailySpent));
ok('landings build a streak', mech.streakUp === 3, String(mech.streakUp));
ok('the streak pays a bonus', mech.streakMult > 1, mech.streakMult.toFixed(3));
ok('a loss breaks the streak', mech.streakGone === 0, String(mech.streakGone));
ok('a bigger catch sets a record', mech.bigRecord === true, String(mech.bigRecord));
ok('a smaller catch does not', mech.smallRecord === false, String(mech.smallRecord));

// the UI work: a visible fight clock, a real focus trap, and a HUD scale that saves
await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  h.game.reset();
  // force a fight so the clock has something to count
  h.game.depth = 12; h.game.castPower = 0.6;
  h.game.target = h.CONTENT.CATCHES.find(c => !c.secret && c.band === 1);
  h.game.phase = h.Phase.FIGHT;
  h.game._startFight();
  h.ui._phaseUi(h.game); h.ui._fightUi(h.game);
  return true;
`);
await sleep(200);
const clock = await run(client, `
  const el = document.getElementById('fightClock');
  const tag = document.getElementById('clockTag');
  const fill = document.getElementById('clockFill');
  return { visible: !!el && el.offsetParent !== null,
           text: tag.textContent,
           width: fill.style.width,
           limit: window.__hooked.game.fightLimit,
           title: el.getAttribute('title') };
`);
ok('the fight clock is on screen during a fight', clock.visible === true, String(clock.visible));
ok('the clock is a real time readout', /^\d+:\d{2}$/.test(clock.text) && clock.text !== '0:00', clock.text);

// format alone proves nothing: step the fight and watch the number fall
await run(client, `
  const h = window.__hooked;
  for (let i = 0; i < 180; i++) h.game.step(1 / 60, { held: false, pressed: false });
  h.ui._fightUi(h.game);
  return true;
`);
const clock2 = await run(client, `
  return { text: document.getElementById('clockTag').textContent,
           pct: document.getElementById('clockFill').style.width };
`);
ok('the clock actually counts down', clock2.text !== clock.text, `${clock.text} → ${clock2.text}`);
ok('the clock bar shrinks with it', parseFloat(clock2.pct) < parseFloat(clock.width), `${clock.width} → ${clock2.pct}`);
ok('the clock has a bar to match its number', clock.width !== '', clock.width);

// the overlay must hold Tab inside itself, or aria-modal is a lie
await run(client, `
  const h = window.__hooked;
  h.game.reset();
  h.ui.closeAll();
  h.ui.openCodex();
  const f = [...document.querySelectorAll('#codex button, #codex [href], #codex input, #codex [tabindex]:not([tabindex="-1"])')]
    .filter(n => !n.disabled && n.offsetParent !== null);
  f[f.length - 1].focus();
  return f.length;
`);
await client.send('Input.dispatchKeyEvent', {
  type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
});
await sleep(120);
const trapped = await run(client, `
  const a = document.activeElement;
  return { inside: !!a.closest('#codex'), id: a.id || a.className || a.tagName };
`);
ok('Tab wraps inside the open overlay', trapped.inside === true, trapped.id);

// HUD scale must survive a reload, so the setting has to live in the save
await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  h.ui.setHudScale(1.3);
  return true;
`);
await sleep(150);
const scaled = await run(client, `
  return { css: getComputedStyle(document.documentElement).getPropertyValue('--hud').trim(),
           saved: window.__hooked.state.data.hudScale };
`);
ok('the HUD scale is applied to the page', scaled.css === '1.3', scaled.css);
ok('the HUD scale is written to the save', scaled.saved === 1.3, String(scaled.saved));

// reload: the save must survive, and the HUD must show it on first paint
await client.send('Page.navigate', { url: URL_ });
await sleep(2500);
const after = await run(client, `
  const h = window.__hooked;
  h.ui.closeAll();
  const css = getComputedStyle(document.documentElement).getPropertyValue('--hud').trim();
  // leave the artifact in a conventional shape for the screenshot below
  h.ui.setHudScale(1);
  return { known: h.state.knownCount(), coins: h.state.data.coins,
           hudOnLoad: css,
           chip: document.getElementById('codexCount').textContent };
`);
ok('save survived a reload', after.known === 1, 'known ' + after.known);
ok('coins survived a reload', after.coins > 0, after.coins + 'c');
ok('HUD reflects the save on first paint', after.chip.startsWith('1/'), after.chip);
ok('the HUD scale survives a reload', after.hudOnLoad === '1.3', after.hudOnLoad);

const shot = await client.send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('shots/live.png', Buffer.from(shot.data, 'base64'));

console.log('\nconsole errors:', errors.length ? errors : 'none');
await close();
if (errors.length) fails.push('console errors');
if (fails.length) { console.log('\n❌ ' + fails.length + ' failed'); process.exitCode = 1; }
else console.log('\n✅ deployed build plays end to end');
