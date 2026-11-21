/* main.js — the boot file. Wires sim + render + ui + audio, owns the clock,
   and turns phase *changes* into sound and particles.
   Rule of thumb: if it is a rule, sim.js owns it. If it is a pixel or a noise,
   it is decided here or below. */

import { CATCHES, RARITY, bandFor } from './content.js';
import { state } from './state.js';
import { Game, Phase } from './sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { initAudio, resumeAudio, setMuted, SFX } from './audio.js';

const RARITY_ORDER = Object.keys(RARITY);

/* ── boot ─────────────────────────────────────────────────────────── */

state.load();
setMuted(!!state.data.muted);

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas);
const game = new Game(state);
const ui = new UI(game);

/* Audio can only start inside a gesture, so the first interaction unlocks it. */
let audioReady = false;
function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  initAudio();
  resumeAudio();
}
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

/* ── the reel-card fish portrait ──────────────────────────────────── */

const rc = document.getElementById('reelFish');
const rcCtx = rc ? rc.getContext('2d') : null;

function paintReelCard(target) {
  if (!rcCtx || !target) return;
  const w = rc.width, h = rc.height;
  rcCtx.clearRect(0, 0, w, h);
  const col = RARITY[target.rarity].color;

  // a soft rarity-coloured disc behind the emoji
  const g = rcCtx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.42);
  g.addColorStop(0, col + '55');
  g.addColorStop(1, col + '00');
  rcCtx.fillStyle = g;
  rcCtx.fillRect(0, 0, w, h);

  rcCtx.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  rcCtx.textAlign = 'center';
  rcCtx.textBaseline = 'middle';
  rcCtx.fillText(target.emoji, w / 2, h / 2 + 2);
}

/* ── phase transitions → feedback ─────────────────────────────────── */

let lastPhase = game.phase;
let surgeWasOn = false;
let tickAcc = 0;
let strainAcc = 0;

function bobber() {
  return renderer.bobberPos || { x: window.innerWidth / 2, y: window.innerHeight * 0.55 };
}

function onPhase(from, to) {
  const p = bobber();

  switch (to) {
    case Phase.WAITING: {
      SFX.splash(0.7 + game.castPower * 0.6);
      renderer.splashAt(p.x, p.y, 12 + Math.round(game.castPower * 14), 0.7 + game.castPower);
      renderer.ripple(p.x, p.y, 1.2);
      break;
    }
    case Phase.BITE: {
      SFX.bite();
      renderer.ripple(p.x, p.y, 2.4);
      renderer.splashAt(p.x, p.y, 10, 0.7);
      break;
    }
    case Phase.FIGHT: {
      SFX.hook();
      paintReelCard(game.target);
      break;
    }
    case Phase.LAND: {
      const r = game.result;
      const idx = RARITY_ORDER.indexOf(r.target.rarity);
      if (r.isNew) SFX.newCatch();
      SFX.caught(Math.max(0, idx));
      SFX.coin();
      renderer.splashAt(p.x, p.y, 26, 1.5);
      renderer.ripple(p.x, p.y, 2.8);
      renderer.floatUp(r.target.emoji, p.x, p.y - 10);
      ui.showCard(r);
      break;
    }
    case Phase.LOSE: {
      const r = game.result;
      if (r && r.reason === 'snapped') {
        SFX.snap();
        renderer.splashAt(p.x, p.y, 16, 1.1);
      } else {
        SFX.lost();
      }
      setTimeout(() => { if (game.phase === Phase.LOSE) ui.showCard(r); }, 420);
      break;
    }
    default: break;
  }
}

/* ── the loop ─────────────────────────────────────────────────────── */

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 1. read input once per frame so the edge is consumed exactly once
  const input = ui.input;

  // 2. advance the simulation
  game.step(dt, input);

  // 3. react to what changed
  if (game.phase !== lastPhase) {
    onPhase(lastPhase, game.phase);
    lastPhase = game.phase;
  }

  // a nibble cue is a one-shot flag set by the sim
  if (game.pendingNibble) {
    game.pendingNibble = false;
    SFX.nibble();
    const p = bobber();
    renderer.ripple(p.x, p.y, 0.5);
  }

  // 4. continuous feedback during the fight
  if (game.phase === Phase.FIGHT) {
    if (game.surging && !surgeWasOn) {
      SFX.strain(0.9);
      const p = bobber();
      renderer.ripple(p.x, p.y, 1.1);
    }
    surgeWasOn = game.surging;

    if (game.reeling) {
      tickAcc += dt;
      if (tickAcc > 0.11) { tickAcc = 0; SFX.reelTick(0.6 + game.progress / 160); }
    } else {
      tickAcc = 0;
    }

    if (game.tension > 78) {
      strainAcc += dt;
      if (strainAcc > 0.34) { strainAcc = 0; SFX.strain(game.tension / 100); }
    } else {
      strainAcc = 0;
    }
  } else {
    surgeWasOn = false;
  }

  // 5. paint
  renderer.draw(game, dt);
  ui.refresh();

  requestAnimationFrame(frame);
}

/* first-run orientation: show the rules once, then never again */
if (!state.data.seenIntro) {
  state.data.seenIntro = true;
  state.save();
  ui.openHelp();
}

requestAnimationFrame(frame);

/* expose a tiny handle so a self-test (or the console) can drive the game
   without synthesising pointer events */
window.__hooked = {
  game, state, ui, renderer, Phase,
  /* content is exposed for the test harness only; nothing in the game reads it */
  CONTENT: { CATCHES, RARITY, bandFor },
  seed(n = 18) {
    // fill the first n species so screenshots and tests can show a used save
    CATCHES.slice(0, n).forEach((c, i) => {
      state.data.caught[c.id] = { count: 1 + (i % 3), best: 1, first: Date.now() };
    });
    state.data.coins = Math.max(state.data.coins, 900);
    state.save();
    ui.refresh();
    return state.knownCount();
  },
  press() { ui.onPress(); },
  release() { ui.onRelease(); },
  cast(power = 0.8) {
    ui.onPress();
    game.power = power;
    ui.onRelease();
  },
  catchNow() {
    // jump straight to a fight against a random legal catch, for testing
    const band = bandFor(Math.max(4, game.depth));
    const pool = CATCHES.filter(c => Math.abs(c.band - band.id) <= 1);
    game.target = pool[Math.floor(Math.random() * pool.length)];
    game.phase = Phase.FIGHT;
    game._startFight();
    paintReelCard(game.target);
    lastPhase = Phase.FIGHT;
  },
};
