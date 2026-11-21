/* state.js — one save object, one place that owns it.
   Everything the player earns, owns or has seen lives here and nowhere else.
   Persisted to localStorage under a versioned key so a schema change can't
   corrupt an old save silently.

   Adding a field is safe without bumping the key: load() merges the parsed
   save over fresh(), so an old save simply gains the new defaults. Only a
   *renamed* or *retyped* field would need a new key. */

import { CATCHES, RODS, LURES, UPGRADES, byId, TOTAL } from './content.js';

const KEY = 'hooked.save.v1';

const fresh = () => ({
  v: 1,
  coins: 0,
  caught: {},          // id -> { count, best, first }
  rod: 'bamboo',
  lure: 'none',
  upg: {},             // upgrade id -> level (absent = 0)
  bestDepth: 0,
  casts: 0,
  totalCoins: 0,
  streak: 0,           // consecutive landings, reset by any loss
  losses: 0,           // consecutive losses, reset by any landing
  muted: false,
  seenIntro: false,
});

export const state = {
  data: fresh(),
  /* ~events~ are not persisted; they are the "what just happened" channel the
     UI reads to decide whether to celebrate, so it never has to diff state. */
  events: [],

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1) {
        this.data = { ...fresh(), ...parsed };
        // guard against a save referencing content that no longer exists
        if (!RODS.some(r => r.id === this.data.rod)) this.data.rod = 'bamboo';
        if (!LURES.some(l => l.id === this.data.lure)) this.data.lure = 'none';
        if (!this.data.upg || typeof this.data.upg !== 'object') this.data.upg = {};
        // rebuild the level map from known tracks only: an id that is no longer
        // in UPGRADES must not survive, or a renamed upgrade would leave a
        // ghost key that still reads as a level.
        const clean = {};
        for (const u of UPGRADES) {
          const lv = this.data.upg[u.id];
          if (lv === undefined) continue;
          // repair a corrupt/oversized level rather than letting it poison stats
          const safe = Math.max(0, Math.min(u.max, Math.floor(Number(lv) || 0)));
          if (safe) clean[u.id] = safe;
        }
        this.data.upg = clean;
      }
    } catch { /* a corrupt save is not worth an error screen */ }
    return this;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ }
  },

  reset() {
    const muted = this.data.muted;
    this.data = fresh();
    this.data.muted = muted;
    this.save();
  },

  get coins() { return this.data.coins; },
  set coins(v) { this.data.coins = Math.max(0, Math.round(v)); },

  rod() { return RODS.find(r => r.id === this.data.rod) || RODS[0]; },
  lure() { return LURES.find(l => l.id === this.data.lure) || LURES[0]; },

  /* ── upgrades ────────────────────────────────────────────────────── */

  /* current level of one upgrade (0 when never bought) */
  upg(id) { return (this.data.upg && this.data.upg[id]) || 0; },

  /* price of the next level, or null when the track is maxed */
  upgPrice(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return null;
    const lv = this.upg(id);
    return lv >= u.max ? null : u.costs[lv];
  },

  /* returns the new level, or 0 if it could not be bought */
  buyUpg(id) {
    const price = this.upgPrice(id);
    if (price == null) return 0;
    if (!this.spend(price)) return 0;
    const lv = this.upg(id) + 1;
    this.data.upg[id] = lv;
    this.events.push({ type: 'upgrade', id, level: lv });
    this.save();
    return lv;
  },

  /* effective multipliers derived from upgrade levels. Kept here, next to the
     levels themselves, so sim.js reads a number and never re-derives a rule. */
  reelMult() { return 1 + this.upg('reel') * 0.08; },       // line speed
  tensionMult() { return 1 - this.upg('line') * 0.07; },    // tension gain
  coinMult() { return 1 + this.upg('net') * 0.12; },        // payout
  charmLuck() { return this.upg('charm') * 0.03; },         // extra luck
  waitMult() { return 1 - this.upg('sonar') * 0.12; },       // bite delay
  hookWindow() { return this.upg('hook') * 0.15; },          // extra seconds

  /* ── catches ─────────────────────────────────────────────────────── */

  /* has this species ever been landed? */
  known(id) { return !!this.data.caught[id]; },
  knownCount() { return Object.keys(this.data.caught).length; },

  /* record a landing; returns true if it was the first of its kind */
  land(catchDef, multiplier = 1) {
    const id = catchDef.id;
    const prev = this.data.caught[id];
    const coins = Math.round(catchDef.coins * multiplier);
    this.data.coins += coins;
    this.data.totalCoins += coins;
    this.data.caught[id] = {
      count: (prev?.count || 0) + 1,
      best: Math.max(prev?.best || 0, multiplier),
      first: prev?.first || Date.now(),
    };
    this.data.streak += 1;
    this.data.losses = 0;
    const isNew = !prev;
    this.events.push({ type: 'land', id, coins, isNew });
    this.save();
    return isNew;
  },

  /* a lost fight: breaks the streak and counts the drought, which is what the
     pity secret listens for */
  loss() {
    this.data.streak = 0;
    this.data.losses += 1;
    this.events.push({ type: 'loss' });
    this.save();
  },

  spend(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save();
    return true;
  },

  setRod(id) { this.data.rod = id; this.save(); },
  setLure(id) { this.data.lure = id; this.save(); },

  noteDepth(d) {
    if (d > this.data.bestDepth) { this.data.bestDepth = d; this.save(); }
  },

  drain() { const e = this.events; this.events = []; return e; },

  /* completion: every non-secret species seen at least once. Secrets are a
     bonus, not part of the 100%, or the bar would stall at 92% forever. */
  completion() { return Math.min(1, this.knownCount() / TOTAL); },
};
