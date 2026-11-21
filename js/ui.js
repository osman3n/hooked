/* ui.js — DOM side. Reads game state, writes pixels and text.
   No game rules live here; if a decision needs the simulation, it belongs
   in sim.js. This file only answers "what should the player see right now". */

import { CATCHES, RARITY, RODS, LURES, BANDS, bandFor, byId, TOTAL } from './content.js';
import { state } from './state.js';
import { Phase } from './sim.js';
import { SFX, isMuted, setMuted } from './audio.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);

/* a phone has no keyboard, so the control hint must not mention keys there.
   Read at call time, not module load: the pointer type can change (responsive
   mode, a tablet gaining a keyboard) and the hint should follow. */
const hint = () => window.matchMedia('(pointer: coarse)').matches ? 'tap and hold' : 'space or click';

/* per-rod unlock gate, indexed by RODS position: how many species you must
   have discovered before the shop will sell it */
const ROD_GATE = [0, 3, 9, 18];

export class UI {
  constructor(game) {
    this.game = game;
    this.lastPhase = null;
    this.lastCoins = state.coins;
    this.modalOpen = null;
    this.toastTimers = [];
    this._bind();
    this._buildCodex();
    this._buildShop();
    this._buildHelp();
    this.refresh();
  }

  /* ── wiring ──────────────────────────────────────────────────────── */

  _bind() {
    const btn = $('actionBtn');
    const press = e => {
      if (e.type === 'keydown' && e.repeat) return;
      if (this.modalOpen) return;
      e.preventDefault();
      this.onPress();
    };
    const release = e => {
      if (this.modalOpen) return;
      e.preventDefault();
      this.onRelease();
    };

    btn.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (this.modalOpen) {
          if (e.code === 'Enter') { e.preventDefault(); this._advanceCard(); }
          return;
        }
        press(e);
      }
      if (e.code === 'Escape') { this.closeAll(); }
      if (e.code === 'KeyC') this.openCodex();
      if (e.code === 'KeyB') this.openShop();
      if (e.code === 'KeyM') this.toggleMute();
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space' || e.code === 'Enter') release(e);
    });

    $('codexBtn').addEventListener('click', () => { SFX.ui(); this.openCodex(); });
    $('shopBtn').addEventListener('click', () => { SFX.ui(); this.openShop(); });
    $('helpBtn').addEventListener('click', () => { SFX.ui(); this.openHelp(); });

    // clicking the water also casts / hooks — the scene should be live
    $('scene').addEventListener('pointerdown', e => {
      if (this.modalOpen) return;
      press(e);
    });
  }

  onPress() {
    const g = this.game;
    if (g.phase === Phase.IDLE) {
      g.beginCharge();
    } else if (g.phase === Phase.BITE) {
      // handled in sim via input snapshot; UI just flags it
      this.pressedConsumed = true;
    } else if (g.phase === Phase.FIGHT) {
      // held state read by the loop
    }
    this.actionDown = true;
  }

  onRelease() {
    const g = this.game;
    if (g.phase === Phase.CHARGING) {
      const ok = g.releaseCharge();
      if (ok) SFX.cast(0.5 + g.castPower);
    }
    this.actionDown = false;
  }

  get input() {
    return {
      held: !!this.actionDown,
      pressed: !!this.pressedConsume(),
    };
  }

  pressedConsume() {
    // a "pressed this frame" edge for the bite window
    if (this.actionDown && !this._prevDown) { this._prevDown = true; return true; }
    if (!this.actionDown) this._prevDown = false;
    return false;
  }

  /* ── per-frame text/HUD sync ─────────────────────────────────────── */

  refresh() {
    const g = this.game;
    const d = state.data;

    // coins
    const coins = state.coins;
    if (coins !== this.lastCoins) {
      $('coins').textContent = fmt(coins);
      if (coins > this.lastCoins) {
        const n = $('coins');
        n.classList.remove('bump');
        void n.offsetWidth;
        n.classList.add('bump');
      }
      this.lastCoins = coins;
    } else if (!this._coinsInit) {
      $('coins').textContent = fmt(coins);
      this._coinsInit = true;
    }

    // codex counter
    $('codexCount').textContent = `${state.knownCount()}/${TOTAL}`;

    // rod + depth readout
    $('rodLine').textContent = state.rod().name;
    const band = bandFor(g.depth);
    $('depthLine').textContent = g.depth > 0
      ? `${band.name} · ${g.depth.toFixed(0)}m`
      : `${band.name} · ready`;

    // prompt + button per phase
    this._phaseUi(g);
  }

  _phaseUi(g) {
    const p = g.phase;
    const prompt = $('prompt');
    const btn = $('actionBtn');
    const label = $('actionLabel');
    const sub = $('actionSub');
    const power = $('powerWrap');
    const reel = $('reelWrap');

    // the button is the primary control, so its label is the prompt
    switch (p) {
      case Phase.IDLE: {
        power.classList.add('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        label.textContent = 'HOLD TO CAST';
        sub.textContent = hint();
        prompt.textContent = state.data.casts === 0
          ? 'Hold to build power, release to cast. Deeper water, stranger things.'
          : '';
        break;
      }
      case Phase.CHARGING: {
        power.classList.remove('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        label.textContent = 'RELEASE';
        sub.textContent = 'power sets your depth';
        prompt.textContent = '';
        $('powerFill').style.width = (g.power * 100).toFixed(1) + '%';
        $('powerLabel').textContent = g.power > 0.72 ? 'DEEP CAST' : 'RELEASE TO CAST';
        break;
      }
      case Phase.CASTING: {
        power.classList.add('hide');
        reel.classList.add('hide');
        label.textContent = 'CASTING…';
        sub.textContent = '';
        prompt.textContent = '';
        break;
      }
      case Phase.WAITING: {
        power.classList.add('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        label.textContent = 'WAIT';
        sub.textContent = 'watch the float';
        prompt.textContent = 'Waiting…';
        break;
      }
      case Phase.BITE: {
        power.classList.add('hide');
        reel.classList.add('hide');
        btn.classList.add('urgent');
        label.textContent = 'HOOK IT!';
        sub.textContent = 'now';
        prompt.textContent = '';
        break;
      }
      case Phase.FIGHT: {
        power.classList.add('hide');
        reel.classList.remove('hide');
        btn.classList.remove('urgent');
        label.textContent = 'HOLD TO REEL';
        sub.textContent = 'release to ease the line';
        prompt.textContent = '';
        this._fightUi(g);
        break;
      }
      case Phase.LAND:
      case Phase.LOSE: {
        power.classList.add('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        label.textContent = p === Phase.LAND ? 'LANDED' : 'GONE';
        sub.textContent = '';
        prompt.textContent = '';
        break;
      }
    }
  }

  _fightUi(g) {
    $('reelName').textContent = g.target ? g.target.name : '';
    $('progFill').style.width = g.progress.toFixed(1) + '%';
    $('strainFill').style.width = g.tension.toFixed(1) + '%';

    const st = $('reelState');
    const card = $('reelCard');
    const t = g.tension;
    if (g.surging) {
      st.textContent = 'SURGE!';
      st.className = 'hot';
      card.classList.toggle('danger', t > 82);
    } else if (t > 85) {
      st.textContent = 'TOO TAUT';
      st.className = 'hot';
      card.classList.add('danger');
    } else if (t > 60) {
      st.textContent = 'STRAINING';
      st.className = '';
      card.classList.remove('danger');
    } else if (!g.reeling) {
      st.textContent = 'SLACK';
      st.className = '';
      card.classList.remove('danger');
    } else {
      st.textContent = 'CALM';
      st.className = '';
      card.classList.remove('danger');
    }
  }

  /* ── catch card ──────────────────────────────────────────────────── */

  showCard(result) {
    const c = result.target;
    const r = RARITY[c.rarity];
    const card = $('card');
    const won = result.reason === 'landed';

    const glow = r.color + '88';
    card.innerHTML = '';

    if (!won) {
      const why = result.reason === 'snapped'
        ? { tag: 'Line snapped', emoji: '💥', name: 'Snap.', blurb: 'Too much tension. The line did not forgive you.' }
        : result.reason === 'escaped'
          ? { tag: 'Shook the hook', emoji: '💨', name: 'Gone.', blurb: 'You nursed the line for too long and it found a way out.' }
          : { tag: 'Never hooked', emoji: '💨', name: 'Gone.', blurb: 'You waited too long to hook it. Whatever it was, it is not that anymore.' };
      const wrap = el('div', 'catchCard');
      wrap.style.setProperty('--glowCol', 'rgba(120,140,150,0.3)');
      wrap.innerHTML = `
        <span class="rarityTag" style="color:#8aa6b3">${why.tag}</span>
        <span class="catchEmoji">${why.emoji}</span>
        <div class="catchName">${why.name}</div>
        <p class="catchBlurb">${why.blurb}</p>
        <div class="cardBtns"><button class="btn primary" id="cardNext">Cast again</button></div>
      `;
      card.appendChild(wrap);
    } else {
      const wrap = el('div', 'catchCard');
      wrap.style.setProperty('--glowCol', glow);
      const owned = state.data.caught[c.id];
      wrap.innerHTML = `
        <span class="rarityTag" style="color:${r.color}">${r.label}</span>
        <span class="catchEmoji">${c.emoji}</span>
        <div class="catchName" style="color:${r.color}">${c.name}</div>
        <p class="catchBlurb">${c.blurb}</p>
        <div class="catchStats">
          <span class="stat">Value <b>+${result.coins}</b></span>
          <span class="stat">Depth <b>${bandFor(g_depth(c)).name}</b></span>
          <span class="stat">Seen <b>${owned ? owned.count : 1}×</b></span>
          ${result.perfect ? '<span class="stat" style="color:#ffc247">Perfect <b>×1.5</b></span>' : ''}
        </div>
        ${result.isNew ? '<div class="newTag">New species</div>' : ''}
        <div class="cardBtns">
          <button class="btn primary" id="cardNext">Cast again</button>
        </div>
      `;
      card.appendChild(wrap);
    }

    card.classList.remove('hide');
    this.modalOpen = 'card';
    const next = $('cardNext');
    if (next) next.addEventListener('click', () => this._advanceCard());
    if (next) next.focus({ preventScroll: true });
  }

  _advanceCard() {
    if (this.modalOpen !== 'card') return;
    this.closeAll();
    this.game.reset();
    this.refresh();
  }

  /* ── codex ───────────────────────────────────────────────────────── */

  _buildCodex() {
    const body = el('div', 'panelBody');

    // progress sits above the grid, not inside it
    const progress = el('div', 'codexProgress');
    progress.innerHTML = `<div class="bar"><i id="codexBar"></i></div><span id="codexPct">0%</span>`;
    body.appendChild(progress);

    const list = el('div', '');
    list.id = 'codexList';
    body.appendChild(list);

    const panel = el('div', 'panel');
    panel.innerHTML = `
      <div class="panelHead">
        <div>
          <h2 id="codexTitle">Codex</h2>
          <div class="sub" id="codexSub">Everything you have pulled out of the water</div>
        </div>
        <button class="xBtn" data-close aria-label="Close">✕</button>
      </div>`;
    panel.appendChild(body);
    $('codex').appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => this.closeAll());
    $('codex').addEventListener('click', e => { if (e.target.id === 'codex') this.closeAll(); });
  }

  openCodex() {
    this._refreshCodex();
    $('codex').classList.remove('hide');
    this.modalOpen = 'codex';
  }

  _refreshCodex() {
    const list = $('codexList');
    list.innerHTML = '';

    const pct = Math.round(state.completion() * 100);
    const bar = $('codexBar'), p = $('codexPct');
    if (bar) bar.style.width = pct + '%';
    if (p) p.textContent = pct + '%';

    // one labelled grid per depth band, so the codex reads as a food chain
    for (const band of BANDS) {
      const items = CATCHES.filter(c => c.band === band.id);
      const known = items.filter(c => state.known(c.id)).length;
      list.appendChild(el('div', 'sectLabel', `${band.name} · ${known}/${items.length}`));

      const grid = el('div', 'codexGrid');
      for (const c of items) {
        const seen = state.known(c.id);
        const r = RARITY[c.rarity];
        const node = el('button', 'cx' + (seen ? '' : ' unknown'));
        node.style.setProperty('--rc', r.color);
        if (seen) {
          node.innerHTML = `
            <span class="cxEmoji">${c.emoji}</span>
            <span class="cxName">${c.name}</span>
            <span class="cxCount">${state.data.caught[c.id].count}</span>`;
          node.addEventListener('click', () => this.showCodexEntry(c));
        } else {
          node.innerHTML = `<span class="cxEmoji">❓</span><span class="cxName">???</span>`;
          node.disabled = true;
        }
        grid.appendChild(node);
      }
      list.appendChild(grid);
    }
  }

  showCodexEntry(c) {
    const r = RARITY[c.rarity];
    const got = state.data.caught[c.id];
    const card = $('card');
    card.innerHTML = '';
    const wrap = el('div', 'catchCard');
    wrap.style.setProperty('--glowCol', r.color + '88');
    wrap.innerHTML = `
      <span class="rarityTag" style="color:${r.color}">${r.label}</span>
      <span class="catchEmoji">${c.emoji}</span>
      <div class="catchName" style="color:${r.color}">${c.name}</div>
      <p class="catchBlurb">${c.blurb}</p>
      <div class="catchStats">
        <span class="stat">Value <b>${c.coins}</b></span>
        <span class="stat">Depth <b>${bandFor(c).name}</b></span>
        <span class="stat">Caught <b>${got.count}×</b></span>
      </div>
      <div class="cardBtns"><button class="btn" id="cardBack">Back to codex</button></div>`;
    card.appendChild(wrap);
    card.classList.remove('hide');
    this.modalOpen = 'entry';
    $('cardBack').addEventListener('click', () => {
      card.classList.add('hide');
      this.openCodex();
    });
  }

  /* ── shop ────────────────────────────────────────────────────────── */

  _buildShop() {
    const panel = el('div', 'panel');
    panel.innerHTML = `
      <div class="panelHead">
        <div>
          <h2 id="shopTitle">Tackle Box</h2>
          <div class="sub">Rods reach deeper. Lures bite faster.</div>
        </div>
        <button class="xBtn" data-close aria-label="Close">✕</button>
      </div>
      <div class="panelBody" id="shopBody"></div>`;
    $('shop').appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => this.closeAll());
    $('shop').addEventListener('click', e => { if (e.target.id === 'shop') this.closeAll(); });
  }

  openShop() {
    this._refreshShop();
    $('shop').classList.remove('hide');
    this.modalOpen = 'shop';
  }

  _refreshShop() {
    const body = $('shopBody');
    body.innerHTML = '';

    body.appendChild(el('div', 'sectLabel', 'Rods'));
    for (const r of RODS) {
      const owned = state.data.rod === r.id;
      const canBuy = !owned && state.coins >= r.cost && this._rodUnlocked(r);
      const node = el('div', 'item' + (owned ? ' owned' : '') + (!this._rodUnlocked(r) ? ' locked' : ''));
      node.innerHTML = `
        <span class="itemEmoji">🎣</span>
        <div class="itemInfo">
          <div class="itemName">${r.name}</div>
          <div class="itemDesc">${r.desc}</div>
          <div class="itemMeta">Reach ${r.reach}m · wider reel band</div>
        </div>`;
      const b = el('button', 'buyBtn');
      if (owned) { b.textContent = 'Equipped'; b.disabled = true; }
      else if (!this._rodUnlocked(r)) { b.textContent = `Codex ${ROD_GATE[RODS.indexOf(r)]}`; b.disabled = true; }
      else { b.textContent = r.cost === 0 ? 'Equip' : `◎ ${fmt(r.cost)}`; b.disabled = !canBuy; }
      b.addEventListener('click', () => {
        if (r.cost > 0 && !state.spend(r.cost)) return;
        state.setRod(r.id);
        SFX.coin();
        this.toast(`Equipped ${r.name}`, 'good');
        this._refreshShop();
        this.refresh();
      });
      node.appendChild(b);
      body.appendChild(node);
    }

    body.appendChild(el('div', 'sectLabel', 'Lures'));
    for (const l of LURES) {
      const owned = state.data.lure === l.id;
      const canBuy = !owned && state.coins >= l.cost;
      const node = el('div', 'item' + (owned ? ' owned' : ''));
      node.innerHTML = `
        <span class="itemEmoji">${l.id === 'none' ? '🪝' : l.id === 'worm' ? '🪱' : l.id === 'glow' ? '✨' : '🫧'}</span>
        <div class="itemInfo">
          <div class="itemName">${l.name}</div>
          <div class="itemDesc">${l.desc}</div>
          <div class="itemMeta">Bite ${Math.round((1 - l.bite) * 100)}% faster${l.luck ? ` · rarer things` : ''}</div>
        </div>`;
      const b = el('button', 'buyBtn');
      if (owned) { b.textContent = 'Equipped'; b.disabled = true; }
      else { b.textContent = l.cost === 0 ? 'Equip' : `◎ ${fmt(l.cost)}`; b.disabled = !canBuy; }
      b.addEventListener('click', () => {
        if (l.cost > 0 && !state.spend(l.cost)) return;
        state.setLure(l.id);
        SFX.coin();
        this.toast(`Equipped ${l.name}`, 'good');
        this._refreshShop();
        this.refresh();
      });
      node.appendChild(b);
      body.appendChild(node);
    }
  }

  /* Rods are gated by how much of the codex you have filled, not by owning the
     previous rod — a lucky deep cast should be able to pay for itself. */
  _rodUnlocked(r) {
    const i = RODS.indexOf(r);
    if (i <= 0) return true;
    return state.knownCount() >= ROD_GATE[i];
  }

  /* ── help ────────────────────────────────────────────────────────── */

  _buildHelp() {
    const panel = el('div', 'panel');
    panel.innerHTML = `
      <div class="panelHead">
        <div>
          <h2 id="helpTitle">How to fish</h2>
          <div class="sub">Three beats, then repeat</div>
        </div>
        <button class="xBtn" data-close aria-label="Close">✕</button>
      </div>
      <div class="panelBody">
        <div class="helpStep"><span class="helpNum">1</span><div class="helpTxt">
          <b>Hold and release</b> to cast. The power bar sets how far out you go — further out is a different food chain entirely.
        </div></div>
        <div class="helpStep"><span class="helpNum">2</span><div class="helpTxt">
          <b>Wait for the real bite.</b> The float dips for small nibbles; the big one shakes the ring and turns the button gold. Hook it fast or it is gone.
        </div></div>
        <div class="helpStep"><span class="helpNum">3</span><div class="helpTxt">
          <b>Hold to reel, release to ease.</b> Reeling fills LINE and TENSION together. When the fish surges, tension climbs fast — let go before it hits the top or the line snaps.
        </div></div>
        <div class="helpStep"><span class="helpNum">4</span><div class="helpTxt">
          <b>Stay under 75 tension</b> for the whole fight and the catch lands <b>Perfect</b>, worth 1.5×.
        </div></div>
        <div class="sectLabel">Keys</div>
        <div class="helpTxt" style="font-size:11.5px;line-height:1.9">
          ${hint() === 'tap and hold' ? '<b>Tap and hold</b> the button to cast, tap to hook, hold to reel.' : `<b>Space / click</b> — cast, hook, reel<br>
          <b>C</b> — codex &nbsp; <b>B</b> — tackle box &nbsp; <b>M</b> — mute &nbsp; <b>Esc</b> — close`}
        </div>
      </div>`;
    $('help').appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => this.closeAll());
    $('help').addEventListener('click', e => { if (e.target.id === 'help') this.closeAll(); });
  }

  openHelp() {
    $('help').classList.remove('hide');
    this.modalOpen = 'help';
  }

  closeAll() {
    if (this.modalOpen === 'entry') {
      $('card').classList.add('hide');
      this.modalOpen = null;
      return;
    }
    ['card', 'codex', 'shop', 'help'].forEach(id => $(id).classList.add('hide'));
    const wasCard = this.modalOpen === 'card';
    this.modalOpen = null;
    if (wasCard) { this.game.reset(); }
    this.refresh();
  }

  toggleMute() {
    const next = !isMuted();
    setMuted(next);
    state.data.muted = next;
    state.save();
    this.toast(next ? 'Sound off' : 'Sound on');
  }

  /* ── toast ───────────────────────────────────────────────────────── */

  toast(msg, kind = '') {
    const box = $('toast');
    const n = el('div', 'toastItem ' + kind, msg);
    box.appendChild(n);
    setTimeout(() => {
      n.style.transition = 'opacity .3s, transform .3s';
      n.style.opacity = '0';
      n.style.transform = 'translateY(-8px)';
      setTimeout(() => n.remove(), 320);
    }, 1900);
  }
}

/* band lookup for a catch definition (depth meter of its band's midpoint) */
function g_depth(c) {
  const b = BANDS[c.band];
  return (b.min + b.max) / 2;
}
