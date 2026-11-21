/* shot.mjs — screenshot the game in a real browser at a few key moments.
   Usage: node tools/shot.mjs [--url=http://127.0.0.1:8080] [--w=1280] [--h=800]
   Writes shots/*.png and prints every console error it saw. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { serve } from './serve.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'shots');

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const W = Number(arg('w', 1280));
const H = Number(arg('h', 800));

async function shoot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(OUT, name + '.png'), Buffer.from(data, 'base64'));
  return name;
}

const evaluate = async (page, expression) => {
  // Runtime.evaluate shares one global scope across calls, so a bare `const h`
  // would collide on the second call — every snippet is wrapped in an IIFE.
  const wrapped = expression.trim().startsWith('(') || expression.trim().startsWith('{')
    ? `(() => (${expression}))()`
    : `(() => { ${expression} })()`;
  const r = await page.send('Runtime.evaluate', {
    expression: wrapped, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
};

async function main() {
  await mkdir(OUT, { recursive: true });

  let baseUrl = arg('url', '');
  let local = null;
  if (!baseUrl) {
    local = await serve(0);
    baseUrl = local.url;
  }
  console.log('url  ', baseUrl);

  const { client: page, close, errors } = await launch({ width: W, height: H, dpr: 2 });

  try {
    await page.send('Page.navigate', { url: baseUrl });
    await sleep(1400);

    // the intro overlay opens on a fresh save; dismiss it so the water shows
    await evaluate(page, 'document.getElementById("help").classList.add("hide"); window.__hooked.ui.modalOpen = null; window.__hooked.ui.refresh(); true');
    await sleep(500);
    await shoot(page, '01-title');
    console.log('shot  01-title');

    // mid-charge: power meter visible
    await evaluate(page, 'window.__hooked.press(); true');
    await sleep(420);
    await shoot(page, '02-charging');
    console.log('shot  02-charging');

    // released: let it splash and settle into the wait
    await evaluate(page, 'window.__hooked.ui.onRelease(); true');
    await sleep(700);
    await shoot(page, '03-waiting');
    console.log('shot  03-waiting');

    // a fight, forced so the HUD is populated
    await evaluate(page, `
      const h = window.__hooked;
      h.state.data.rod = 'carbon';
      h.game.depth = 22;
      h.catchNow();
      h.ui.refresh(); true`);
    await sleep(450);
    await shoot(page, '04-fight');
    console.log('shot  04-fight');

    // the catch card for a deep, rare thing
    await evaluate(page, `
      const h = window.__hooked;
      const C = h.game.target;
      h.game.result = { reason: 'landed', target: C, perfect: true, mult: 1.5,
        coins: Math.round(C.coins * 1.5), isNew: true };
      h.game.phase = 'land';
      h.ui.showCard(h.game.result); true`);
    await sleep(600);
    await shoot(page, '05-catch');
    console.log('shot  05-catch');

    // a secret card: it must read differently from an ordinary lucky catch
    await evaluate(page, `
      const h = window.__hooked;
      const S = h.CONTENT.CATCHES.find(c => c.secret && c.id === 'maxpower');
      h.ui.closeAll();
      h.ui.showCard({ reason: 'landed', target: S, perfect: false, mult: 1,
        coins: S.coins, isNew: true }); true`);
    await sleep(600);
    await shoot(page, '05b-secret');
    console.log('shot  05b-secret');

    // codex, with a partly filled save including a couple of secrets
    await evaluate(page, `
      const h = window.__hooked;
      h.game.reset();
      h.seed(21);
      h.state.data.caught['streak5'] = { count: 1, best: 1, first: Date.now() };
      h.state.data.caught['pity'] = { count: 2, best: 1, first: Date.now() };
      h.ui.closeAll();
      h.ui.openCodex();
      h.ui.refresh(); true`);
    await sleep(600);
    await shoot(page, '06-codex');
    console.log('shot  06-codex');

    // shop, scrolled to the upgrades with a few levels bought
    await evaluate(page, `
      const h = window.__hooked;
      h.state.data.coins = 4000;
      h.state.data.upg = { reel: 2, net: 1, charm: 3 };
      h.ui.closeAll();
      h.ui.openShop(); true`);
    await sleep(400);
    await shoot(page, '07-shop');
    console.log('shot  07-shop');

    // mobile portrait
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    });
    await sleep(700);
    await evaluate(page, 'window.__hooked.ui.closeAll(); window.__hooked.game.reset(); window.__hooked.ui.refresh(); true');
    await sleep(500);
    await shoot(page, '08-mobile');
    console.log('shot  08-mobile');

    const info = await evaluate(page, `({
      phase: window.__hooked.game.phase,
      catches: window.__hooked.game.constructor.name,
      canvasW: document.getElementById('scene').width,
      known: window.__hooked.state.knownCount(),
      dpr: window.devicePixelRatio,
    })`);
    console.log('state ', JSON.stringify(info));
  } finally {
    await close();
    if (local) local.server.close();
  }

  if (errors.length) {
    console.error('\n❌ console errors:');
    for (const e of errors) console.error('  · ' + e);
    process.exitCode = 1;
  } else {
    console.log('\n✅ no console errors');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
