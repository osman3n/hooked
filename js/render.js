/* render.js — the whole scene, drawn on one canvas.
   No sprites, no images: every shape here is a path. That keeps the repo pure
   text and means the art scales to any DPI without a single asset.

   Composition (back to front):
     sky → sun/moon → far hills → water body → light shafts → kelp
     → ambient fish → bobber + line + ripples → foreground vignette

   The colour of the water is driven by how deep the current cast is, so the
   scene itself tells you how far out you threw before any text says so. */

import { BANDS, bandFor } from './content.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.t = 0;
    this.horizon = 0.42;      // fraction of screen height where water starts

    this.ripples = [];
    this.particles = [];
    this.ambient = [];
    this.splash = [];
    this.floaters = [];       // drifting emotes / debris on the surface
    this.wake = [];

    this.resize();
    this._seedAmbient();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(320, r.width || window.innerWidth);
    this.h = Math.max(320, r.height || window.innerHeight);
    this.cv.width = Math.floor(this.w * this.dpr);
    this.cv.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._seedAmbient();
  }

  get surfaceY() { return this.h * this.horizon; }

  _seedAmbient() {
    this.ambient = [];
    const n = Math.round((this.w * this.h) / 90000);
    for (let i = 0; i < n; i++) {
      this.ambient.push({
        x: Math.random() * this.w,
        y: this.surfaceY + Math.random() * (this.h - this.surfaceY),
        sp: 6 + Math.random() * 18,
        dir: Math.random() < 0.5 ? -1 : 1,
        s: 0.5 + Math.random() * 1.1,
        ph: Math.random() * TAU,
        kind: Math.random() < 0.22 ? 'jelly' : 'fish',
      });
    }
    this.particles = [];
    for (let i = 0; i < 34; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.6 + Math.random() * 2.2,
        sp: 4 + Math.random() * 16,
        a: 0.06 + Math.random() * 0.22,
        ph: Math.random() * TAU,
      });
    }
  }

  /* ── effects the game can trigger ──────────────────────────────────── */

  ripple(x, y, strength = 1) {
    this.ripples.push({ x, y, r: 2, max: 60 + 90 * strength, a: 0.55 * strength, life: 1 });
  }

  splashAt(x, y, count = 14, power = 1) {
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const sp = (60 + Math.random() * 190) * power;
      this.splash.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, r: 1 + Math.random() * 2.4,
      });
    }
  }

  floatUp(emoji, x, y) {
    this.floaters.push({ emoji, x, y, vy: -30 - Math.random() * 20, life: 1, size: 26 });
  }

  /* ── main draw ─────────────────────────────────────────────────────── */

  draw(game, dt) {
    this.t += dt;
    const c = this.ctx;
    const { w, h } = this;

    // depth 0..1 for tinting, based on the cast currently on the line
    const depth = game.depth || 0;
    const band = bandFor(depth);
    const deepT = Math.min(1, depth / 40);

    this._sky(c, w, h, deepT, band);
    this._hills(c, w, h, deepT);
    this._water(c, w, h, deepT, band);
    this._shafts(c, w, h, deepT);
    this._kelp(c, w, h, deepT);
    this._ambientFish(c, dt, deepT);
    this._particles(c, dt);
    this._lineAndBobber(c, game, band);
    this._splash(c, dt);
    this._ripples(c, dt);
    this._floaters(c, dt);
    this._vignette(c, w, h);
  }

  _sky(c, w, h, deepT, band) {
    const sy = this.surfaceY;
    // dusk palette, desaturating as the cast goes deep (a subtle "mood" shift)
    const g = c.createLinearGradient(0, 0, 0, sy);
    const top = mix('#0a1a2a', '#1b2b46', deepT * 0.6);
    const mid = mix('#2d4a63', '#4a4a63', deepT * 0.5);
    const low = mix('#e8a06a', '#7a6a72', deepT * 0.75);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, low);
    c.fillStyle = g;
    c.fillRect(0, 0, w, sy + 2);

    // sun / moon — a low disc that reads as either, depending on the cast
    const sx = w * 0.74;
    const sr = Math.min(w, h) * 0.075;
    const syPos = sy - sr * 0.55;
    const halo = c.createRadialGradient(sx, syPos, sr * 0.2, sx, syPos, sr * 4.2);
    // mix the two hex colours first, then attach alpha — mix() only speaks hex
    const haloCol = mix('#ffc478', '#96aadc', deepT);
    halo.addColorStop(0, hexA(haloCol, 0.55));
    halo.addColorStop(0.35, hexA(haloCol, 0.16));
    halo.addColorStop(1, hexA(haloCol, 0));
    c.fillStyle = halo;
    c.fillRect(sx - sr * 4.4, syPos - sr * 4.4, sr * 8.8, sr * 8.8);

    c.beginPath();
    c.arc(sx, syPos, sr, 0, TAU);
    c.fillStyle = mix('#ffd9a0', '#c8d6f0', deepT * 0.85);
    c.fill();

    // glint on the water directly under the disc
    c.save();
    c.globalAlpha = 0.28;
    const gl = c.createLinearGradient(sx, sy, sx, sy + sr * 5);
    gl.addColorStop(0, mix('#ffcf9a', '#b9c8e8', deepT));
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.beginPath();
    c.moveTo(sx - sr * 0.7, sy);
    c.lineTo(sx + sr * 0.7, sy);
    c.lineTo(sx + sr * 2.6, sy + sr * 5);
    c.lineTo(sx - sr * 2.6, sy + sr * 5);
    c.closePath();
    c.fill();
    c.restore();
  }

  _hills(c, w, h, deepT) {
    const sy = this.surfaceY;
    // two ranges, back one lighter — cheap aerial perspective
    const draw = (amp, base, colour, freq, phase) => {
      c.beginPath();
      c.moveTo(0, sy + 2);
      for (let x = 0; x <= w; x += 8) {
        const n = Math.sin(x * freq + phase) * amp
                + Math.sin(x * freq * 2.7 + phase * 1.7) * amp * 0.42
                + Math.sin(x * freq * 0.4 + phase * 0.6) * amp * 1.2;
        c.lineTo(x, sy - base + n);
      }
      c.lineTo(w, sy + 2);
      c.closePath();
      c.fillStyle = colour;
      c.fill();
    };
    draw(h * 0.032, h * 0.055, mix('#22384a', '#1d2a3c', deepT), 0.0032, 1.2);
    draw(h * 0.022, h * 0.022, mix('#16283a', '#131e2e', deepT), 0.0051, 3.4);
  }

  _water(c, w, h, deepT, band) {
    const sy = this.surfaceY;
    const g = c.createLinearGradient(0, sy, 0, h);
    g.addColorStop(0, mix('#3f8ba6', '#20505f', deepT * 0.9));
    g.addColorStop(0.22, mix('#2b6b86', '#183c4d', deepT * 0.9));
    g.addColorStop(0.55, mix('#17485d', '#0f2838', deepT * 0.9));
    g.addColorStop(1, mix('#0c2c3c', '#071520', deepT * 0.85));
    c.fillStyle = g;
    c.fillRect(0, sy, w, h - sy);

    // surface line — two offset sines so it never looks periodic
    c.save();
    for (let layer = 0; layer < 3; layer++) {
      c.beginPath();
      const amp = 2.4 + layer * 1.8;
      const off = layer * 3;
      c.moveTo(0, sy + off);
      for (let x = 0; x <= w; x += 6) {
        const y = sy + off
          + Math.sin(x * 0.012 + this.t * (0.9 + layer * 0.3) + layer) * amp
          + Math.sin(x * 0.031 - this.t * 1.4 + layer * 2) * amp * 0.4;
        c.lineTo(x, y);
      }
      c.strokeStyle = layer === 0
        ? 'rgba(200,240,255,0.55)'
        : `rgba(160,220,240,${0.16 - layer * 0.04})`;
      c.lineWidth = layer === 0 ? 1.6 : 1;
      c.stroke();
    }
    c.restore();

    // depth band guides: faint horizontal rules with a label notch
    c.save();
    c.font = `${Math.round(Math.min(11, w * 0.016))}px Nunito, system-ui, sans-serif`;
    c.fillStyle = 'rgba(190,230,245,0.16)';
    c.strokeStyle = 'rgba(190,230,245,0.10)';
    c.lineWidth = 1;
    for (const b of BANDS) {
      if (b.id === 0) continue;
      const y = sy + (b.min / 44) * (h - sy);
      if (y > h - 8) continue;
      c.beginPath();
      c.setLineDash([3, 7]);
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      c.setLineDash([]);
      // keep the label clear of the left edge and above its rule, so a narrow
      // phone screen does not clip it in half
      c.fillText(`${b.name} · ${b.min}m`, Math.max(12, w * 0.02), y - 6);
    }
    c.restore();
  }

  _shafts(c, w, h, deepT) {
    const sy = this.surfaceY;
    const n = 5;
    c.save();
    c.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * w + Math.sin(this.t * 0.25 + i * 1.7) * w * 0.02;
      const spread = w * (0.05 + 0.03 * Math.sin(i * 2.1));
      const a = (0.055 - deepT * 0.032) * (0.6 + 0.4 * Math.sin(this.t * 0.5 + i));
      if (a <= 0) continue;
      const g = c.createLinearGradient(x, sy, x + spread * 0.4, h);
      g.addColorStop(0, `rgba(190,235,255,${a})`);
      g.addColorStop(1, 'rgba(190,235,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - spread * 0.25, sy);
      c.lineTo(x + spread * 0.25, sy);
      c.lineTo(x + spread * 1.1, h);
      c.lineTo(x - spread * 0.55, h);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  _kelp(c, w, h, deepT) {
    const sy = this.surfaceY;
    const count = 7;
    c.save();
    for (let i = 0; i < count; i++) {
      const x = ((i + 0.35) / count) * w + Math.sin(i * 4.1) * 40;
      const baseY = h + 20;
      const height = (h - sy) * (0.35 + 0.42 * ((i * 7) % 5) / 5);
      const sway = Math.sin(this.t * 0.6 + i) * 0.08;
      c.beginPath();
      c.moveTo(x, baseY);
      const segs = 7;
      for (let s = 1; s <= segs; s++) {
        const ty = baseY - (height * s) / segs;
        const tx = x + Math.sin(s * 0.9 + this.t * 0.7 + i) * 12 * (s / segs) + sway * 40 * (s / segs);
        c.lineTo(tx, ty);
      }
      c.strokeStyle = `rgba(30,90,80,${0.30 - deepT * 0.14})`;
      c.lineWidth = 4 + (i % 3) * 2;
      c.lineCap = 'round';
      c.stroke();
    }
    c.restore();
  }

  _ambientFish(c, dt, deepT) {
    const sy = this.surfaceY;
    c.save();
    for (const f of this.ambient) {
      f.x += f.dir * f.sp * dt;
      const margin = 80;
      if (f.x < -margin) f.x = this.w + margin;
      if (f.x > this.w + margin) f.x = -margin;
      const depthF = (f.y - sy) / Math.max(1, this.h - sy);
      const alpha = (0.10 + 0.16 * depthF) * (1 - deepT * 0.35);
      if (alpha <= 0.01) continue;
      const tail = Math.sin(this.t * 3 + f.ph) * 0.4;
      c.save();
      c.translate(f.x, f.y + Math.sin(this.t * 0.8 + f.ph) * 3);
      c.scale(f.dir, 1);
      c.globalAlpha = alpha;
      c.fillStyle = '#bde7f2';
      if (f.kind === 'jelly') {
        c.beginPath();
        c.arc(0, 0, 7 * f.s, Math.PI, 0);
        c.fill();
        c.globalAlpha = alpha * 0.5;
        for (let k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(k * 3 * f.s, 0);
          c.quadraticCurveTo(k * 3 * f.s + tail * 4, 9 * f.s, k * 3 * f.s - tail * 3, 17 * f.s);
          c.strokeStyle = '#bde7f2';
          c.lineWidth = 1.2;
          c.stroke();
        }
      } else {
        c.beginPath();
        c.ellipse(0, 0, 12 * f.s, 5.2 * f.s, 0, 0, TAU);
        c.fill();
        c.beginPath();
        c.moveTo(-11 * f.s, 0);
        c.lineTo(-19 * f.s, -4.4 * f.s + tail * 3);
        c.lineTo(-19 * f.s, 4.4 * f.s + tail * 3);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
    c.restore();
  }

  _particles(c, dt) {
    c.save();
    for (const p of this.particles) {
      p.y -= p.sp * dt;
      p.x += Math.sin(this.t * 0.6 + p.ph) * 6 * dt;
      if (p.y < -6) { p.y = this.h + 6; p.x = Math.random() * this.w; }
      c.globalAlpha = p.a;
      c.fillStyle = '#d8f2ff';
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  /* the line + bobber: the one object the player is actually watching */
  _lineAndBobber(c, game, band) {
    if (game.depth <= 0) return;
    const sy = this.surfaceY;
    // where the bobber sits on screen, driven by cast depth
    const t = Math.min(1, game.depth / 44);
    const bx = this.w * (0.5 + Math.sin(game.castT * 0.9) * 0.004);
    const by = sy + 16 + t * (this.h - sy) * 0.52;

    // line from an off-screen rod at the lower-left to the bobber
    const rodX = this.w * 0.12;
    const rodY = this.h * 0.86;
    c.save();
    c.strokeStyle = 'rgba(230,245,255,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(rodX, rodY);
    const cx = (rodX + bx) / 2;
    const cy = Math.min(rodY, by) - 40 - t * 30;
    c.quadraticCurveTo(cx, cy, bx, by);
    c.stroke();

    // bobber float
    const bob = Math.sin(this.t * 2.2) * 2.4
      + (game.phase === 'bite' ? Math.sin(this.t * 22) * 5 : 0)
      + (game.phase === 'fight' ? Math.sin(this.t * 14) * 3 : 0);
    const yy = by + bob;

    // glow halo, colour by band so a deep cast visibly changes the marker
    const glow = c.createRadialGradient(bx, yy, 1, bx, yy, 30);
    glow.addColorStop(0, hexA(band.tint, 0.5));
    glow.addColorStop(1, hexA(band.tint, 0));
    c.fillStyle = glow;
    c.fillRect(bx - 30, yy - 30, 60, 60);

    // float body: red top, white bottom — readable at any size
    c.beginPath();
    c.arc(bx, yy, 7, Math.PI, 0);
    c.fillStyle = '#ff5d5d';
    c.fill();
    c.beginPath();
    c.arc(bx, yy, 7, 0, Math.PI);
    c.fillStyle = '#f4f7fa';
    c.fill();
    c.beginPath();
    c.moveTo(bx, yy - 11);
    c.lineTo(bx, yy - 6);
    c.strokeStyle = '#d9e4ee';
    c.lineWidth = 1.2;
    c.stroke();

    // a persistent ring while the fish is hooked
    if (game.phase === 'fight' || game.phase === 'bite') {
      c.beginPath();
      c.arc(bx, yy, 13 + Math.sin(this.t * 8) * 2, 0, TAU);
      c.strokeStyle = hexA(game.phase === 'bite' ? '#ffd166' : '#8fe3ff', 0.7);
      c.lineWidth = 1.6;
      c.stroke();
    }
    c.restore();
    this.bobberPos = { x: bx, y: yy };
  }

  _splash(c, dt) {
    c.save();
    for (let i = this.splash.length - 1; i >= 0; i--) {
      const p = this.splash[i];
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0) { this.splash.splice(i, 1); continue; }
      c.globalAlpha = Math.max(0, p.life) * 0.8;
      c.fillStyle = '#cfeeff';
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  _ripples(c, dt) {
    c.save();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += 90 * dt;
      r.life -= dt * 0.55;
      if (r.life <= 0 || r.r > r.max) { this.ripples.splice(i, 1); continue; }
      c.globalAlpha = Math.max(0, r.life) * r.a;
      c.strokeStyle = '#dff5ff';
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(r.x, r.y, r.r, r.r * 0.36, 0, 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  _floaters(c, dt) {
    c.save();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.y += f.vy * dt;
      f.life -= dt * 0.5;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      c.globalAlpha = Math.min(1, f.life * 1.6);
      c.font = `${f.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      c.textAlign = 'center';
      c.fillText(f.emoji, f.x, f.y);
    }
    c.restore();
  }

  _vignette(c, w, h) {
    const g = c.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.32,
                                     w * 0.5, h * 0.48, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,6,12,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
}

/* ── tiny colour helpers ─────────────────────────────────────────────── */

function hexToRgb(hex) {
  // defensive: a malformed colour should paint wrong, never throw mid-frame
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [0, 0, 0];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const f = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
