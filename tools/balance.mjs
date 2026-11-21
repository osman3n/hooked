/* Balance probe: can a competent player actually land every species?
   Not a test — a report. Run: node tools/balance.mjs [strategy]

   Strategies model different players rather than a bare threshold, because a
   fixed "reel until N then stop" is not how anyone plays: it never learns that
   a long hold heats the line, and it never eases early for a surge.          */

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const { CATCHES } = await import('../js/content.js');
const { state } = await import('../js/state.js');
const { Game, Phase } = await import('../js/sim.js');

const STRATEGIES = {
  /* Panicky beginner: grabs the rod, holds far too long, only lets go when the
     meter is nearly red. Should lose the big ones. */
  beginner: g => g.tension < 82 && !(g.surging && g.tension > 55),

  /* Competent: hysteresis, and backs off before a surge rather than during. */
  steady: (g) => {
    if (g.surging) return g.tension < 40;
    if (g.tension > 66) return false;
    if (g.tension < 54) return true;
    return g.held;                      // hold state in the band between
  },

  /* Greedy expert: rides the meter high for speed, accepts the snap risk. */
  greedy: (g) => {
    if (g.surging) return g.tension < 52;
    if (g.tension > 72) return false;
    if (g.tension < 58) return true;
    return g.held;
  },

  /* Never reels: the fight must resolve as an escape, not hang forever. */
  idle: () => false,

  /* Mashes the button and never lets go: the line must snap. */
  masher: () => true,

  /* Deliberately gentle: keeps the meter low the whole fight to earn the
     "perfect" bonus. This is the only strategy that should ever see it. */
  calm: (g) => {
    if (g.surging) return false;
    if (g.tension > 48) return false;
    if (g.tension < 34) return true;
    return g.held;
  },
};

function play(c, strategy) {
  state.data = {
    v: 1, coins: 0, caught: {}, rod: 'abyss', lure: 'none',
    bestDepth: 0, casts: 0, totalCoins: 0, muted: true, seenIntro: true,
    upg: {}, streak: 0, losses: 0,
  };
  const g = new Game(state);
  g.depth = 30;
  g.target = c;
  g.phase = Phase.FIGHT;
  g._startFight();
  g.held = false;
  let n = 0;
  while (g.phase === Phase.FIGHT && n++ < 9000) {      // 150s hard cap
    g.held = strategy(g);
    g.step(1 / 60, { held: g.held, pressed: false });
  }
  return {
    out: g.phase, t: g.fightT, max: g.maxTension,
    reason: g.result ? g.result.reason : 'none',
    perfect: !!(g.result && g.result.perfect), stalled: n >= 9000,
  };
}

const want = process.argv[2];
for (const [name, strat] of Object.entries(STRATEGIES)) {
  if (want && want !== name) continue;
  const tally = { land: 0, snapshot: 0, perfect: 0, times: [] };
  const rows = [];
  for (const c of CATCHES) {
    const r = play(c, strat);
    const won = r.out === Phase.LAND;
    if (won) { tally.land++; if (r.perfect) tally.perfect++; tally.times.push(r.t); }
    else if (r.stalled) tally.snapshot++;
    rows.push({ c, r, won });
  }
  const avg = tally.times.length ? tally.times.reduce((a, b) => a + b, 0) / tally.times.length : 0;
  console.log(`\n══ ${name} ══`);
  for (const { c, r, won } of rows) {
    const tag = won ? (r.perfect ? 'land*' : 'land')
      : r.stalled ? 'STALL'
      : r.reason === 'snapped' ? 'SNAP' : 'ESCAPE';
    console.log(
      `  ${c.rarity.padEnd(10)} pull ${String(c.fight.pull).padEnd(4)} ` +
      `${tag.padEnd(6)} ${(r.stalled ? '—' : r.t.toFixed(1) + 's').padStart(6)}  ` +
      `maxT ${String(Math.round(r.max)).padStart(3)}  ${c.name}`,
    );
  }
  const escaped = rows.filter(x => !x.won && x.r.reason === 'escaped').length;
  console.log(
    `  → landed ${tally.land}/${CATCHES.length}` +
    `, snapped ${rows.filter(x => !x.won && x.r.reason === 'snapped').length}` +
    `, escaped ${escaped}` +
    `, stalled ${tally.snapshot}` +
    `, perfect ${tally.perfect}, avg ${avg.toFixed(1)}s`,
  );
}
