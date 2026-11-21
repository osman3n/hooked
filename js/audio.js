/* audio.js — every sound is synthesised at runtime.
   No .mp3, no .ogg, no licensing, no asset pipeline. A fishing game lives on
   its feedback, so this file is load-bearing, not decoration.
   Tuning: high = bright/shallow, low = dull/deep, exactly like the real thing. */

let ctx = null;
let master = null;
let muted = false;
let reverb = null;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // a short synthesised hall so the abyss sounds bigger than the shore
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(1.8, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);
  return ctx;
}

function impulse(seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}
export function isMuted() { return muted; }

function now() { return ctx.currentTime; }

/* one shaped oscillator note */
function tone({ freq = 440, type = 'sine', dur = 0.18, gain = 0.2, glide = 0,
                attack = 0.006, wet = 0, delay = 0 }) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  if (wet && reverb) {
    const s = ctx.createGain();
    s.gain.value = wet;
    g.connect(s).connect(reverb);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* filtered noise burst — water, splashes, whooshes */
function noise({ dur = 0.3, gain = 0.12, from = 900, to = 300, q = 1, delay = 0, wet = 0 }) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  if (wet && reverb) {
    const s = ctx.createGain();
    s.gain.value = wet;
    g.connect(s).connect(reverb);
  }
  src.start(t);
}

/* ── the vocabulary ─────────────────────────────────────────────────── */

export const SFX = {
  cast(wind = 1) {
    noise({ dur: 0.34, gain: 0.09 * wind, from: 1800, to: 500, q: 2.2 });
    tone({ freq: 300, type: 'sine', dur: 0.14, gain: 0.05, glide: 260 });
  },
  splash(power = 1) {
    noise({ dur: 0.42, gain: 0.16 * (0.5 + power), from: 1400, to: 180, q: 0.8 });
    tone({ freq: 180, type: 'sine', dur: 0.22, gain: 0.07 * power, glide: -90 });
  },
  nibble() {
    tone({ freq: 900, type: 'sine', dur: 0.05, gain: 0.035, glide: 120 });
    noise({ dur: 0.05, gain: 0.03, from: 2400, to: 1200, q: 4 });
  },
  /* the bite — the single most important cue in the game */
  bite() {
    tone({ freq: 640, type: 'triangle', dur: 0.1, gain: 0.16 });
    tone({ freq: 960, type: 'triangle', dur: 0.16, gain: 0.13, delay: 0.06 });
    noise({ dur: 0.16, gain: 0.1, from: 2200, to: 700, q: 1.6 });
  },
  hook() {
    tone({ freq: 220, type: 'square', dur: 0.07, gain: 0.1 });
    tone({ freq: 660, type: 'triangle', dur: 0.2, gain: 0.16, delay: 0.03 });
  },
  reelTick(speed = 1) {
    tone({ freq: 1500 + Math.random() * 260, type: 'square', dur: 0.018, gain: 0.016 * speed });
  },
  strain(level = 1) {
    // a ratchet under load — low, gritty, uncomfortable
    tone({ freq: 130 + level * 40, type: 'sawtooth', dur: 0.05, gain: 0.03 * level });
  },
  snap() {
    tone({ freq: 1200, type: 'sawtooth', dur: 0.1, gain: 0.18, glide: -900 });
    noise({ dur: 0.3, gain: 0.16, from: 4000, to: 300, q: 0.7 });
  },
  caught(rarityIdx = 0) {
    // rising arpeggio whose length scales with how good the catch is
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    const steps = Math.min(scale.length, 2 + rarityIdx);
    for (let i = 0; i < steps; i++) {
      tone({ freq: scale[i], type: 'triangle', dur: 0.26, gain: 0.13, delay: i * 0.075, wet: 0.5 });
    }
    if (rarityIdx >= 3) {
      tone({ freq: 1567.98, type: 'sine', dur: 0.8, gain: 0.1, delay: steps * 0.075, wet: 0.8 });
    }
  },
  lost() {
    tone({ freq: 300, type: 'sine', dur: 0.34, gain: 0.1, glide: -170 });
  },
  coin() {
    tone({ freq: 1200, type: 'triangle', dur: 0.06, gain: 0.09 });
    tone({ freq: 1800, type: 'triangle', dur: 0.1, gain: 0.07, delay: 0.05 });
  },
  ui() {
    tone({ freq: 780, type: 'sine', dur: 0.06, gain: 0.05 });
  },
  newCatch() {
    // discovery stinger, distinct from a normal landing
    [523.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.45, gain: 0.11, delay: i * 0.09, wet: 0.7 }));
  },
};
