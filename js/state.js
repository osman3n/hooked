/* state.js — one save object, one place that owns it.
   Everything the player earns, owns or has seen lives here and nowhere else.
   Persisted to localStorage under a versioned key so a schema change can't
   corrupt an old save silently. */

import { CATCHES, RODS, LURES, byId } from './content.js';

const KEY = 'hooked.save.v1';

const fresh = () => ({
  v: 1,
  coins: 0,
  caught: {},          // id -> { count, best, first }
  rod: 'bamboo',
  lure: 'none',
  bestDepth: 0,
  casts: 0,
  totalCoins: 0,
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
    const isNew = !prev;
    this.events.push({ type: 'land', id, coins, isNew });
    this.save();
    return isNew;
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

  /* completion: every species seen at least once */
  completion() { return this.knownCount() / CATCHES.length; },
};
