/* sim.js — the game state machine. No DOM, no audio, no rendering.
   Keeping it pure means the loop can be tested headlessly (tools/selftest.mjs).

   THE LOOP, and why it is shaped this way:
     IDLE → (hold) CHARGING → (release) CASTING → WAITING → BITE → FIGHT → LAND/LOSE

   Cast power buys depth, and depth buys different things to catch, so the
   first decision of every cast is "how deep am I willing to go" and the answer
   is always governed by what the rod can reach.

   The fight is a two-meter negotiation, not a QTE:
     - holding the reel fills PROGRESS and raises TENSION
     - the fish periodically SURGES; during a surge tension climbs fast
     - release to bleed tension, but progress bleeds too
   So the player is always choosing between two clocks. That is the whole game. */

import { CATCHES, RODS, LURES, BANDS, bandFor, sizeCm } from './content.js';

/* Rarity weight for one entry. Secrets are rare-but-reachable when their
   condition holds, so finding one feels like an accident you caused. */
const rarityWeight = r =>
  r === 'common' ? 1 : r === 'uncommon' ? 0.55 : r === 'rare' ? 0.22
    : r === 'epic' ? 0.085 : r === 'legendary' ? 0.032 : 0.012;

export const Phase = {
  IDLE: 'idle',
  CHARGING: 'charging',
  CASTING: 'casting',
  WAITING: 'waiting',
  BITE: 'bite',
  FIGHT: 'fight',
  LAND: 'land',
  LOSE: 'lose',
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

export class Game {
  constructor(state) {
    this.state = state;
    this.phase = Phase.IDLE;

    // cast
    this.power = 0;          // 0..1 charge
    this.powerDir = 1;
    this.castPower = 0;
    this.castT = 0;
    this.sweetLo = 0.72;     // the perfect-power window for THIS cast
    this.sweetHi = 0.84;
    this.perfectCast = false;
    this.daily = false;      // was this cast the once-a-day deep throw?

    // water
    this.depth = 0;          // metres of line out for the current cast
    this.bobber = { x: 0, y: 0, vx: 0, vy: 0, bobbing: 0 };

    // waiting
    this.waitT = 0;
    this.waitNeed = 0;
    this.nibbles = [];

    // bite window
    this.biteT = 0;
    this.biteWindow = 0.95;

    // fight
    this.target = null;
    this.progress = 0;
    this.tension = 0;
    this.reeling = false;
    this.surgeT = 0;
    this.surgeNext = 0;
    this.surging = false;
    this.fightT = 0;
    this.stamina = 0;
    this.tickAcc = 0;
    this.strainAcc = 0;

    // results (read by the UI after LAND/LOSE)
    this.result = null;
  }

  get rod() { return this.state.rod(); }
  get lure() { return this.state.lure(); }

  /* ── casting ─────────────────────────────────────────────────────── */

  beginCharge(daily = false) {
    if (this.phase !== Phase.IDLE) return false;
    this.phase = Phase.CHARGING;
    this.power = 0;
    this.powerDir = 1;
    this.daily = daily;
    // The perfect-power band moves every cast, so the meter is a timing test
    // rather than a memorised slider position. It never lands right at the top:
    // a band you can only hit by accident is a tease, not a skill.
    const lo = 0.42 + Math.random() * 0.34;
    this.sweetLo = lo;
    this.sweetHi = Math.min(0.94, lo + 0.09 + Math.random() * 0.05);
    return true;
  }

  /* Is the current charge inside the perfect band? Read by the UI every frame to
     light the meter up, so the player can see the window coming. */
  inSweetSpot() {
    return this.power >= this.sweetLo && this.power <= this.sweetHi;
  }

  releaseCharge() {
    if (this.phase !== Phase.CHARGING) return false;
    this.phase = Phase.CASTING;
    this.castPower = this.power;
    this.castT = 0;
    this.perfectCast = this.inSweetSpot();
    // power maps to depth non-linearly: low power is a short flick, high power
    // is a real heave. The rod caps the top end.
    const reach = this.rod.reach;
    const bonus = (this.perfectCast ? 1.08 : 1) * (this.daily ? 1.35 : 1);
    this.depth = clamp((2 + Math.pow(this.castPower, 1.35) * reach) * bonus, 2, reach);
    // a daily throw is meant to go deeper than the rod should allow, so it is
    // the one cast where the abyss opens early
    if (this.daily) this.depth = Math.max(this.depth, 41);
    this.state.noteDepth(this.depth);
    if (this.daily) this.state.claimDaily();
    this.state.data.casts++;
    this.state.save();
    return true;
  }

  /* ── the tick ────────────────────────────────────────────────────── */

  update(dt, input) {
    dt = Math.min(dt, 0.05); // never let a tab-restore jump the simulation
    switch (this.phase) {
      case Phase.CHARGING: this._charge(dt); break;
      case Phase.CASTING:  this._casting(dt); break;
      case Phase.WAITING:  this._waiting(dt); break;
      case Phase.BITE:     this._bite(dt, input); break;
      case Phase.FIGHT:    this._fight(dt, input); break;
      default: break;
    }
  }

  _charge(dt) {
    // ping-pong so the player can time a release instead of just holding max
    this.power += this.powerDir * dt * 1.35;
    if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
    if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
  }

  _casting(dt) {
    this.castT += dt;
    const T = 0.42;
    if (this.castT >= T) {
      this.phase = Phase.WAITING;
      this.waitT = 0;
      // lure shortens the wait; depth lengthens it slightly (further to fall).
      // Sonar is the upgrade that buys patience back.
      const base = lerp(1.1, 4.2, clamp(this.depth / 40, 0, 1));
      this.waitNeed = base * this.lure.bite * this.state.waitMult() * (0.7 + Math.random() * 0.8);
      this.nibbles = [];
      // schedule 0-2 fake nibbles to keep the player honest
      const n = Math.random() < 0.55 ? (Math.random() < 0.4 ? 2 : 1) : 0;
      for (let i = 0; i < n; i++) {
        this.nibbles.push(this.waitNeed * (0.3 + Math.random() * 0.45));
      }
      this.nibbles.sort((a, b) => a - b);
      this._justCast = true;
    }
  }

  _waiting(dt) {
    this.waitT += dt;
    this.bobber.bobbing += dt;

    // nibble cues — a small dip, not a bite. Deliberately similar but not
    // identical, so a careless player jumps early.
    while (this.nibbles.length && this.waitT > this.nibbles[0]) {
      this.nibbles.shift();
      this.pendingNibble = true;
    }

    if (this.waitT >= this.waitNeed) {
      this.phase = Phase.BITE;
      this.biteT = 0;
      // roll the catch at the moment of the bite, so the fight is committed
      this.target = this._roll();
      // the wider hook buys reaction time on exactly the catches that need it
      this.biteWindow = 0.95 + this.state.hookWindow();
    }
  }

  _bite(dt, input) {
    this.biteT += dt;
    if (input && input.pressed) {           // player hooked it
      this.phase = Phase.FIGHT;
      this._startFight();
      return;
    }
    if (this.biteT >= this.biteWindow) {
      this._lose('missed');
    }
  }

  /* every losing exit funnels through here, so the streak/drought counters in
     state.js can never be skipped by one forgotten path */
  _lose(reason) {
    this.phase = Phase.LOSE;
    this.result = { reason, target: this.target };
    this.state.loss();
  }

  _startFight() {
    const f = this.target.fight;
    this.progress = 26;                     // hooked = you already have some line
    this.tension = 12;
    this.stamina = f.stamina;
    this.fightT = 0;
    this.surgeNext = 0.9 + Math.random() * 1.9;
    this.surgeT = 0;
    this.surging = false;
    this.reeling = false;
    this.holdT = 0;
    this.slackT = 0;
    this.maxTension = 0;
    // generous but finite: enough for a slow, careful player to land anything,
    // short enough that dithering on the meter cannot go on forever. The cap
    // matters — the toughest mythic would otherwise allow a four-minute fight,
    // which reads as a hang rather than a struggle.
    this.fightLimit = Math.min(75, 30 + f.stamina * 22);
  }

  _fight(dt, input) {
    const f = this.target.fight;
    this.fightT += dt;
    this.reeling = !!(input && input.held);

    // ── surge scheduling ──
    // A surge is a burst the player must ease through. Cooldown is scaled by the
    // fish's surge stat, but it can never be shorter than the surge itself —
    // otherwise a strong fish surges back-to-back and progress (×0.25 while
    // surging) never recovers, which is a stalemate, not difficulty.
    this.surgeNext -= dt;
    if (!this.surging && this.surgeNext <= 0) {
      this.surging = true;
      this.surgeT = 0.55 + Math.random() * 0.45;
      this.surgeFired = true;
    }
    if (this.surging) {
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surging = false;
        // REST MUST OUTLAST THE SURGE. If the cooldown can be shorter than the
        // burst itself, a strong fish surges almost continuously, progress is
        // pinned at ×0.25 and the fight becomes unwinnable *and* unlosable —
        // a dead fight, not a hard one. The floor guarantees real recovery time
        // between bursts at every stat value.
        const rest = (1.1 + Math.random() * 1.7) / Math.max(0.5, f.surge);
        this.surgeNext = Math.max(1.1, rest);
      }
    }

    // ── tension ──
    // Reeling climbs; easing bleeds it back. The climb must stay inside what a
    // player can actually manage: if it outruns recovery by too much, the only
    // way to survive is to barely reel at all, and the fight becomes a crawl.
    // So climb and recovery are tuned to a ~40% reel-off duty cycle at the top
    // of the roster — busy, but always paying out.
    let dT = 0;
    if (this.reeling) {
      // Holding without ever easing is meant to lose. A continuous pull builds
      // heat, so the line tightens faster the longer a single hold lasts; the
      // ramp resets the moment you let go. This is what forces the two-clock
      // rhythm instead of "hold and win".
      this.holdT = (this.holdT || 0) + dt;
      dT += (26 + f.pull * 7) * dt;
      dT += Math.min(26, this.holdT * 11) * dt;
      if (this.surging) dT += (26 + f.pull * 16) * dt;
    } else {
      this.holdT = 0;
      dT -= (16 + f.pull * 5) * dt;
      if (this.surging) dT += 10 * dt;      // it keeps pulling even as you ease
    }
    // Braided Line only softens what tension *gains*; the easing back is left
    // alone, so the upgrade is a wider margin rather than a slower fight.
    if (dT > 0) dT *= this.state.tensionMult();
    this.tension = clamp(this.tension + dT, 0, 100);
    this.maxTension = Math.max(this.maxTension, this.tension);

    // ── progress ──
    // you only make real headway while tension is in a workable band; the
    // sweet spot is high-but-not-snapping, which is what the meter is teaching
    let dP = 0;
    if (this.reeling) {
      // Risk/reward on the same meter: line only really comes in when the rod is
      // loaded, so playing safe (low tension) is slow and riding the edge is
      // fast. Past 70 it stops paying off, and near 100 it barely works at all.
      const t = this.tension;
      const sweet = t > 88 ? 0.15
        : t > 70 ? 0.62
        : 0.55 + Math.min(t, 66) / 66 * 0.45;   // 0.55 at slack → 1.0 at 66
      dP += (24 + 16 / Math.max(0.6, f.pull)) * dt * sweet * this.state.reelMult();
      if (this.surging) dP *= 0.25;         // a surging fish gives almost nothing
    } else {
      dP -= (5 + f.pull * 1.6) * dt;        // slack line loses ground
    }
    this.progress = clamp(this.progress + dP, 0, 100);

    // ── slack line ──
    // If you never reel, the fish simply leaves. Without this a passive player
    // sits in a fight that can only end on the clock, which is dead time.
    if (this.reeling) this.slackT = 0;
    else this.slackT += dt;

    // ── the fish tires ──
    // The real reason a fight has to end: the fish wears out. Draining faster
    // while you reel is what rewards active play, but it keeps draining even
    // when you stall — otherwise a player who hovers at the edge of the meter
    // keeps the fish fresh forever and the fight can never resolve.
    this.stamina -= dt * (this.reeling ? 1.7 : 0.7);
    const tired = this.stamina <= 0;
    if (tired) {
      this.surgeNext = Math.max(this.surgeNext, 1.2);
      this.surging = false;
      // An exhausted fish stops fighting back — but only for a player who gives
      // it slack. Cranking on a beaten fish still builds heat, so mashing the
      // button never becomes a shortcut, even on a common.
      if (!this.reeling) this.tension = Math.max(0, this.tension - dt * 9);
    }

    // ── outcomes ──
    if (this.tension >= 100) {
      this._lose('snapped');
      return;
    }
    // A fight that neither side can finish is a bug, not tension. Three exits
    // keep every fight honest: a snapped line, a fish that leaves when you give
    // it no line tension for too long, and a hard clock in case both meters
    // stall. None of them should ever fire during normal play.
    if (this.slackT > 4.5) {
      this._lose('escaped');
      return;
    }
    if (this.fightT > this.fightLimit) {
      this._lose('escaped');
      return;
    }
    if (this.progress >= 100) {
      this._land();
    }
  }

  _land() {
    // A perfect landing is a *choice*, not a side effect: you have to keep the
    // line slack-ish the whole way, which costs you time. Eyeing the top of the
    // meter is faster; staying calm pays 1.5x. Neither is strictly better.
    const perfect = this.maxTension < 60 && this.fightT < 22;
    // Every catch has a size, and every size is rolled fresh. A species you
    // have landed ten times can still surprise you, which is what makes the
    // codex worth reopening. The roll is a ±35% spread around the species'
    // real length, so a big Tiddler is still a Tiddler.
    const nominal = sizeCm(this.target.size);
    const size = Math.round(nominal * (0.65 + Math.random() * 0.7) * 10) / 10;
    const mult = (perfect ? 1.5 : 1)
      * this.state.coinMult()
      * this.state.streakMult()
      * (this.perfectCast ? 1.1 : 1);
    const { isNew, record } = this.state.land(this.target, mult, size);
    this.phase = Phase.LAND;
    this.result = {
      reason: 'landed',
      target: this.target,
      perfect,
      mult,
      size,
      record,
      perfectCast: this.perfectCast,
      daily: this.daily,
      coins: Math.round(this.target.coins * mult),
      isNew,
    };
  }

  /* ── which catch? ────────────────────────────────────────────────── */

  /* The roll weights by band proximity: a catch whose band matches the cast
     depth is most likely, neighbours still possible, distant ones not. Rarer
     things are rarer, but the lure flattens the rarity curve a little.

     Secret catches are filtered by their `when` gate BEFORE weighting, so an
     ineligible secret can never occupy a slot — it simply is not in the water
     this cast. That is why finding one feels caused rather than lucky. */
  _roll() {
    const depth = this.depth;
    const band = bandFor(depth);
    // A perfect cast and the daily throw both tilt the table toward the tail of
    // the distribution. This is the reward for the timing test: not more coins,
    // but a real chance at something you would otherwise never meet.
    const luck = this.lure.luck
      + this.state.charmLuck()
      + (this.perfectCast ? 0.06 : 0)
      + (this.daily ? 0.14 : 0);
    const ctx = {
      power: this.castPower,
      casts: this.state.data.casts,
      coins: this.state.coins,
      losses: this.state.data.losses,
      streak: this.state.data.streak,
      hour: new Date().getHours(),
      depth,
      perfect: this.perfectCast,
      daily: this.daily,
    };

    const weights = [];
    for (const c of CATCHES) {
      const dist = Math.abs(c.band - band.id);
      if (dist > 1) continue;              // no abyss fish in ankle water
      if (c.secret && !(c.when && c.when(ctx))) continue;

      // within-band, prefer the middle of the band
      const mid = (BANDS[c.band].min + BANDS[c.band].max) / 2;
      const span = Math.max(1, (BANDS[c.band].max - BANDS[c.band].min) / 2);
      const centre = 1 - Math.min(1, Math.abs(depth - mid) / (span * 2.4));
      let w = (dist === 0 ? 1 : 0.28) * (0.55 + centre * 0.75);

      w *= rarityWeight(c.rarity);
      // luck lifts the tail of the distribution
      if (c.rarity !== 'common') w *= 1 + luck * (c.rarity === 'mythic' ? 2.2 : 1.4);
      // a live secret must be findable but still a story: rarer than the
      // rarity alone would suggest, and never so rare that nobody ever sees one
      if (c.secret) w *= 2.4;

      weights.push([c, w]);
    }

    if (!weights.length) return CATCHES[0];
    let total = 0;
    for (const [, w] of weights) total += w;
    let roll = Math.random() * total;
    for (const [c, w] of weights) {
      roll -= w;
      if (roll <= 0) return c;
    }
    return weights[weights.length - 1][0];
  }

  /* ── player actions ──────────────────────────────────────────────── */

  /* called once per frame with the raw input snapshot */
  step(dt, input) {
    this.update(dt, input);
  }

  reset() {
    this.phase = Phase.IDLE;
    this.power = 0;
    this.castT = 0;
    this.depth = 0;
    this.progress = 0;
    this.tension = 0;
    this.target = null;
    this.result = null;
    this.maxTension = 0;
    this.fightT = 0;
    this.perfectCast = false;
    this.daily = false;
  }
}
