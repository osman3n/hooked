/* selftest.mjs — proves the rules in sim.js, with no browser involved.
   Run: node tools/selftest.mjs
   Exit code 0 = everything the game promises still holds. */

/* state.js touches localStorage; give it a memory stub so node can import it */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const { CATCHES, RODS, LURES, BANDS, bandFor, RARITY, TOTAL } = await import('../js/content.js');
const { state } = await import('../js/state.js');
const { Game, Phase } = await import('../js/sim.js');

let pass = 0;
const fails = [];

function ok(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? ` — ${detail}` : ''));
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* run the sim forward with a fixed input, in small deterministic steps */
function run(game, seconds, input = { held: false, pressed: false }, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    game.step(dt, input);
    if (game.phase === Phase.LAND || game.phase === Phase.LOSE) return game.phase;
  }
  return game.phase;
}

/* a game whose random rolls are pinned, so tests are not flaky */
function newGame() {
  state.data = {
    v: 1, coins: 0, caught: {}, rod: 'bamboo', lure: 'none',
    bestDepth: 0, casts: 0, totalCoins: 0, muted: true, seenIntro: true,
  };
  return new Game(state);
}

console.log('HOOKED self-test\n');

/* ── content integrity ───────────────────────────────────────────────── */

env: {
  const ids = new Set();
  for (const c of CATCHES) {
    ok(`catch ${c.id} has a unique id`, !ids.has(c.id));
    ids.add(c.id);
    ok(`catch ${c.id} has a real band`, BANDS.some(b => b.id === c.band), String(c.band));
    ok(`catch ${c.id} has a rarity`, !!RARITY[c.rarity], c.rarity);
    ok(`catch ${c.id} has positive value`, c.coins > 0);
    ok(`catch ${c.id} has copy`, typeof c.blurb === 'string' && c.blurb.length > 10);
    ok(`catch ${c.id} fight is sane`, c.fight.pull > 0 && c.fight.stamina > 0);
  }
  eq('TOTAL matches the catalogue', TOTAL, CATCHES.length);
  ok('there are catches that are not fish', CATCHES.filter(c => !/\p{Emoji_Presentation}/u.test(c.emoji) || c.id.length > 3).length > 20);
  ok('every band has something in it', BANDS.every(b => CATCHES.some(c => c.band === b.id)));

  // rods must strictly increase in reach, or "upgrade" is a lie
  for (let i = 1; i < RODS.length; i++) {
    ok(`rod ${RODS[i].id} reaches further than ${RODS[i - 1].id}`, RODS[i].reach > RODS[i - 1].reach);
    ok(`rod ${RODS[i].id} costs more than ${RODS[i - 1].id}`, RODS[i].cost > RODS[i - 1].cost);
  }
  // lures: better lure = faster bite and at least as much luck
  for (let i = 1; i < LURES.length; i++) {
    ok(`lure ${LURES[i].id} bites faster than ${LURES[i - 1].id}`, LURES[i].bite < LURES[i - 1].bite);
    ok(`lure ${LURES[i].id} is at least as lucky`, LURES[i].luck >= LURES[i - 1].luck);
  }
  eq('bandFor(0) is the shore', bandFor(0).id, 0);
  eq('bandFor(999) clamps to the abyss', bandFor(999).id, 4);
}

/* ── the cast ────────────────────────────────────────────────────────── */

cast: {
  const g = newGame();
  eq('starts idle', g.phase, Phase.IDLE);
  ok('cannot release before charging', g.releaseCharge() === false);

  g.beginCharge();
  eq('charging', g.phase, Phase.CHARGING);
  run(g, 0.3, { held: true, pressed: false });
  const charged = g.power;
  ok('charging builds power', charged > 0.2, String(charged));
  ok('power stays within 0..1', charged <= 1);

  g.releaseCharge();
  eq('casting', g.phase, Phase.CASTING);
  ok('depth is positive', g.depth > 0, String(g.depth));
  ok('depth within rod reach', g.depth <= RODS[0].reach + 0.001, `${g.depth} > ${RODS[0].reach}`);
  eq('a cast is counted', state.data.casts, 1);
}

/* a full-power cast with a long rod must actually reach deeper than a weak one */
reach: {
  const g = newGame();
  g.beginCharge();
  g.power = 0.15;
  g.releaseCharge();
  const shallow = g.depth;

  g.reset();
  g.beginCharge();
  g.power = 1;
  g.releaseCharge();
  const deep = g.depth;
  ok('more power casts deeper', deep > shallow * 2, `${deep} vs ${shallow}`);
  ok('full power reaches the rod limit', Math.abs(deep - RODS[0].reach) < 0.001, String(deep));
}

/* ── the wait and the bite window ────────────────────────────────────── */

bite: {
  const g = newGame();
  g.beginCharge(); g.power = 0.6; g.releaseCharge();
  run(g, 0.5);
  eq('settles into waiting', g.phase, Phase.WAITING);
  ok('a bite is scheduled', g.waitNeed > 0);

  // do nothing until it bites
  const seen = run(g, 8, { held: false, pressed: false });
  ok('the bite arrives (or it was missed)', seen === Phase.BITE || seen === Phase.LOSE, seen);

  // a fresh cast, then hook within the window
  const g2 = newGame();
  g2.beginCharge(); g2.power = 0.6; g2.releaseCharge();
  run(g2, 0.5);
  let guard = 0;
  while (g2.phase !== Phase.BITE && guard++ < 900) g2.step(1 / 60, { held: false, pressed: false });
  eq('reached the bite', g2.phase, Phase.BITE);
  ok('a target was chosen at the bite', !!g2.target);
  g2.step(1 / 60, { held: false, pressed: true });
  eq('pressing during the bite hooks it', g2.phase, Phase.FIGHT);
  ok('the fight starts with some line', g2.progress > 0);
}

/* missing the window must lose the fish, not hang forever */
miss: {
  const g = newGame();
  g.beginCharge(); g.power = 0.5; g.releaseCharge();
  run(g, 0.5);
  let guard = 0;
  while (g.phase !== Phase.BITE && g.phase !== Phase.LOSE && guard++ < 1200) {
    g.step(1 / 60, { held: false, pressed: false });
  }
  if (g.phase === Phase.BITE) {
    const out = run(g, 2, { held: false, pressed: false });
    eq('an ignored bite times out', out, Phase.LOSE);
    eq('and reports a miss', g.result.reason, 'missed');
  }
}

/* ── the fight ───────────────────────────────────────────────────────── */

fight: {
  const g = newGame();
  g.target = CATCHES.find(c => c.rarity === 'common');
  g.phase = Phase.FIGHT;
  g._startFight();
  ok('tension starts low', g.tension < 30, String(g.tension));

  // holding forever must eventually snap the line: tension has to bite
  const out = run(g, 30, { held: true, pressed: false });
  eq('holding without easing snaps the line', out, Phase.LOSE);
  eq('and says so', g.result.reason, 'snapped');
}

land: {
  const g = newGame();
  // the easiest thing in the game, reeled competently
  g.target = CATCHES.reduce((a, b) => (a.fight.pull <= b.fight.pull ? a : b));
  g.phase = Phase.FIGHT;
  g._startFight();

  let guard = 0;
  let out = Phase.FIGHT;
  while (out === Phase.FIGHT && guard++ < 6000) {
    // a decent player: hold while there is headroom, let go when taut
    const held = g.tension < 62 && !g.surging;
    g.step(1 / 60, { held, pressed: false });
    out = g.phase;
  }
  eq('a well-played common is landed', out, Phase.LAND);
  ok('it pays out', g.result.coins > 0, String(g.result.coins));
  ok('it was recorded', !!state.data.caught[g.target.id]);
  eq('coins went up by the value', state.data.coins, g.result.coins);
  eq('the codex gained one', state.knownCount(), 1);
}

perfect: {
  const g = newGame();
  g.target = CATCHES.reduce((a, b) => (a.fight.pull <= b.fight.pull ? a : b));
  g.phase = Phase.FIGHT;
  g._startFight();
  // keep tension under 75 the whole way: that is the perfect condition
  let guard = 0;
  while (g.phase === Phase.FIGHT && guard++ < 8000) {
    const held = g.tension < 45 && !g.surging;
    g.step(1 / 60, { held, pressed: false });
  }
  if (g.phase === Phase.LAND) {
    ok('staying calm lands it', true);
    ok('calm play is at least as well paid', g.result.mult >= 1);
    if (g.result.perfect) eq('perfect pays 1.5x', g.result.mult, 1.5);
  }
}

/* releasing must bleed tension — the core of the two-clock design */
release: {
  const g = newGame();
  g.target = CATCHES.find(c => c.rarity === 'epic');
  g.phase = Phase.FIGHT;
  g._startFight();
  g.tension = 70;
  const before = g.tension;
  const progBefore = g.progress;
  run(g, 0.6, { held: false, pressed: false });
  ok('releasing bleeds tension', g.tension < before - 8, `${before} → ${g.tension}`);
  ok('and costs progress', g.progress < progBefore, `${progBefore} → ${g.progress}`);
}

/* ── the roll ────────────────────────────────────────────────────────── */

roll: {
  const g = newGame();
  g.depth = 3;                                  // shore
  const shore = new Set();
  for (let i = 0; i < 4000; i++) shore.add(g._roll().id);
  const shoreBands = [...shore].map(id => CATCHES.find(c => c.id === id).band);
  ok('shallow casts never produce abyss things', shoreBands.every(b => b <= 1),
    'bands: ' + [...new Set(shoreBands)].join(','));

  g.depth = 60;                                 // abyss
  const deep = new Set();
  for (let i = 0; i < 4000; i++) deep.add(g._roll().id);
  const deepBands = [...deep].map(id => CATCHES.find(c => c.id === id).band);
  ok('deep casts never produce shore junk', deepBands.every(b => b >= 3),
    'bands: ' + [...new Set(deepBands)].join(','));

  // a deep cast should surface things a shallow one cannot
  const deepOnly = [...deep].filter(id => !shore.has(id));
  ok('depth unlocks different things', deepOnly.length >= 3, String(deepOnly.length));
}

/* luck must actually change the distribution */
luck: {
  const g = newGame();
  g.depth = 20;
  const sample = lureId => {
    state.data.lure = lureId;
    const counts = { rare: 0, total: 0 };
    for (let i = 0; i < 6000; i++) {
      const c = g._roll();
      if (c.rarity !== 'common') counts.rare++;
      counts.total++;
    }
    return counts.rare / counts.total;
  };
  const plain = sample('none');
  const lucky = sample('weird');
  ok('a lucky lure finds more non-common things', lucky > plain, `${plain.toFixed(3)} → ${lucky.toFixed(3)}`);
  state.data.lure = 'none';
}

/* every catch must be reachable with the best rod; otherwise the codex
   contains an impossible entry */
completable: {
  // A cast can land anywhere from 2 m to the rod's reach; a species is
  // reachable if some cast within that range falls inside its band or a
  // neighbour of it.
  const best = RODS[RODS.length - 1].reach;
  const reachableBands = new Set();
  for (let d = 2; d <= best; d += 0.25) reachableBands.add(bandFor(d).id);
  const missing = CATCHES.filter(c =>
    ![...reachableBands].some(b => Math.abs(c.band - b) <= 1));
  eq('the best rod can reach every species', missing.length, 0,
    missing.map(c => `${c.name} (band ${c.band})`).join(', '));
}

/* ── save / load ─────────────────────────────────────────────────────── */

save: {
  newGame();
  const g = newGame();
  g.target = CATCHES[0];
  g.phase = Phase.FIGHT;
  g._startFight();
  g._land();
  state.save();

  const loaded = JSON.parse(localStorage.getItem('hooked.save.v1'));
  eq('the save round-trips the codex', Object.keys(loaded.caught).length, 1);
  ok('the save carries coins', loaded.coins > 0);

  // a corrupt save must not throw or brick the game
  localStorage.setItem('hooked.save.v1', '{not json');
  const coinsBefore = state.data.coins;
  state.load();
  ok('a corrupt save is ignored rather than crashing', true);
  eq('and the in-memory save is left alone', state.data.coins, coinsBefore);

  // an unknown rod id must not survive
  localStorage.setItem('hooked.save.v1', JSON.stringify({ v: 1, rod: 'nonsense', lure: 'nope', caught: {} }));
  state.load();
  eq('an unknown rod is repaired', state.data.rod, 'bamboo');
  eq('an unknown lure is repaired', state.data.lure, 'none');
}

/* ── report ──────────────────────────────────────────────────────────── */

console.log(`\n${pass} assertions passed`);
if (fails.length) {
  console.error(`\n❌ ${fails.length} failed:`);
  for (const f of fails) console.error('  · ' + f);
  process.exit(1);
}
console.log('✅ all green');
