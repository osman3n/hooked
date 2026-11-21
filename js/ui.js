/* ui.js — DOM side. Reads game state, writes pixels and text.
   No game rules live here; if a decision needs the simulation, it belongs
   in sim.js. This file only answers "what should the player see right now". */

import { CATCHES, RARITY, RODS, LURES, BANDS, bandFor, byId, TOTAL, ALL, VISIBLE, SECRETS, UPGRADES, formatSize } from './content.js';
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
    this.dailyArmed = false;
    this._bind();
    this._buildCodex();
    this._buildShop();
    this._buildSettings();
    this._buildHelp();
    this.applyHudScale();
    this.applyMotion();
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
      if (e.code === 'Tab') this._trapFocus(e);
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
      if (e.code === 'KeyD') this.toggleDaily();
      if (e.code === 'KeyS') this.openSettings();
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space' || e.code === 'Enter') release(e);
    });

    $('codexBtn').addEventListener('click', () => { SFX.ui(); this.openCodex(); });
    $('shopBtn').addEventListener('click', () => { SFX.ui(); this.openShop(); });
    $('helpBtn').addEventListener('click', () => { SFX.ui(); this.openHelp(); });

    const settings = $('settingsBtn');
    if (settings) settings.addEventListener('click', () => {
      SFX.ui();
      if (this.modalOpen === 'settings') this.closeAll(); else this.openSettings();
    });

    const daily = $('dailyBtn');
    if (daily) daily.addEventListener('click', () => this.toggleDaily());

    // clicking the water also casts / hooks — the scene should be live
    $('scene').addEventListener('pointerdown', e => {
      if (this.modalOpen) return;
      press(e);
    });
  }

  /* Arm or stow the daily deep cast. One per day; the button and the D key
     both land here so they can never disagree about the state. */
  toggleDaily() {
    if (!state.dailyReady()) {
      SFX.ui();
      this.toast('Today\'s deep cast is spent. Tomorrow.');
      return;
    }
    this.dailyArmed = !this.dailyArmed;
    SFX.ui();
    this.toast(this.dailyArmed
      ? 'Daily cast armed — hold to throw it deep.'
      : 'Daily cast put away.');
    this.refresh();
  }

  onPress() {
    const g = this.game;
    if (g.phase === Phase.IDLE) {
      g.beginCharge(this.dailyArmed && state.dailyReady());
      if (this.dailyArmed) this.dailyArmed = false;
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

    // daily deep cast availability
    const daily = $('dailyBtn');
    if (daily) {
      const ready = state.dailyReady();
      daily.classList.toggle('spent', !ready);
      daily.classList.toggle('armed', !!this.dailyArmed);
      daily.textContent = ready
        ? (this.dailyArmed ? 'Deep Cast ✓' : 'Deep Cast')
        : 'Deep Cast ✕';
    }

    // streak chip: only worth showing once there is a run to protect
    const streakChip = $('streakChip');
    if (streakChip) {
      const s = state.data.streak;
      streakChip.classList.toggle('hide', s < 2);
      if (s >= 2) streakChip.textContent = `${s} in a row · ${state.streakMult().toFixed(2)}×`;
    }

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
    if (p !== Phase.CHARGING) {
      // the sweet-spot highlight belongs to the charge only; leaving it on
      // would make the cast button look actionable during a fight
      btn.classList.remove('sweet');
      $('powerFill').classList.remove('sweet');
    }
    switch (p) {
      case Phase.IDLE: {
        power.classList.add('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        label.textContent = this.dailyArmed ? 'THROW IT DEEP' : 'HOLD TO CAST';
        sub.textContent = hint();
        prompt.textContent = state.data.casts === 0
          ? 'Hold to build power, release in the gold window. Deeper water, stranger things.'
          : '';
        break;
      }
      case Phase.CHARGING: {
        power.classList.remove('hide');
        reel.classList.add('hide');
        btn.classList.remove('urgent');
        const sweet = g.inSweetSpot();
        btn.classList.toggle('sweet', sweet);
        label.textContent = sweet ? 'LET GO!' : 'RELEASE';
        sub.textContent = sweet ? 'perfect power' : 'power sets your depth';
        prompt.textContent = '';
        $('powerFill').style.width = (g.power * 100).toFixed(1) + '%';
        $('powerFill').classList.toggle('sweet', sweet);
        // the window itself is painted where it actually is this cast
        const mark = $('powerMark');
        mark.style.left = (g.sweetLo * 100).toFixed(1) + '%';
        mark.style.width = ((g.sweetHi - g.sweetLo) * 100).toFixed(1) + '%';
        $('powerLabel').textContent = g.daily
          ? 'DAILY DEEP CAST'
          : sweet ? 'PERFECT · +8% DEPTH' : 'RELEASE TO CAST';
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

    // A quiet meter is a dead meter: show whether the line is paying out right
    // now, so the player can learn the sweet spot without reading the numbers.
    const pay = $('payTag');
    if (pay) {
      const rate = t > 88 ? 'DEAD' : t > 70 ? 'SLOW' : t > 40 ? 'GOOD' : 'WEAK';
      pay.textContent = g.reeling ? rate : '—';
      pay.className = 'pay ' + (g.reeling ? rate.toLowerCase() : 'idle');
    }

    // The fight has a hard clock (fightLimit) and losing to it reads as the fish
    // escaping for no reason. A player cannot lose to a rule they cannot see, so
    // the remaining time is shown, and only starts shouting in the last stretch.
    const left = Math.max(0, g.fightLimit - g.fightT);
    const pct = g.fightLimit > 0 ? (left / g.fightLimit) * 100 : 0;
    const clock = $('fightClock');
    const fill = $('clockFill');
    const tag = $('clockTag');
    if (clock && fill && tag) {
      fill.style.width = pct.toFixed(1) + '%';
      const secs = Math.ceil(left);
      tag.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      clock.classList.toggle('low', left < 8);
      clock.classList.toggle('critical', left < 4);
    }

    // the danger vignette: a red edge on the canvas only when the line is
    // genuinely about to go, which is information rather than decoration
    this._danger = Math.max(0, Math.min(1, (t - 72) / 26));
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
      const wrap = el('div', 'catchCard' + (c.secret ? ' secret' : '') + (result.record && !result.isNew ? ' record' : ''));
      wrap.style.setProperty('--glowCol', glow);
      const owned = state.data.caught[c.id];
      const best = state.biggest(c.id);
      wrap.innerHTML = `
        <span class="rarityTag" style="color:${r.color}">${c.secret ? '✦ Secret · ' : ''}${r.label}</span>
        <span class="catchEmoji">${c.emoji}</span>
        <div class="catchName" style="color:${r.color}">${c.name}</div>
        <div class="catchSize">${formatSize(result.size)}${result.record && !result.isNew ? ' <em>record</em>' : ''}</div>
        <p class="catchBlurb">${c.blurb}</p>
        <div class="catchStats">
          <span class="stat">Value <b>+${result.coins}</b></span>
          <span class="stat">Depth <b>${BANDS[c.band].name}</b></span>
          <span class="stat">Seen <b>${owned ? owned.count : 1}×</b></span>
          ${owned && owned.count > 1 ? `<span class="stat">Best <b>${formatSize(best)}</b></span>` : ''}
          ${result.perfect ? '<span class="stat" style="color:#ffc247">Perfect <b>×1.5</b></span>' : ''}
          ${result.perfectCast ? '<span class="stat" style="color:#ffc247">Gold cast <b>×1.1</b></span>' : ''}
          ${state.data.streak > 1 ? `<span class="stat" style="color:#7ee0a2">Streak <b>${state.data.streak} · ${(state.streakMult()).toFixed(2)}×</b></span>` : ''}
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

    // one labelled grid per depth band, so the codex reads as a food chain.
    // Only the non-secret roster counts toward a band's total; secrets get
    // their own section at the bottom and simply are not there until found.
    for (const band of BANDS) {
      const items = VISIBLE.filter(c => c.band === band.id);
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

    // secrets: the whole section appears only once you have found at least one,
    // and then shows only the ones you have actually caught
    const found = SECRETS.filter(c => state.known(c.id));
    if (found.length) {
      list.appendChild(el('div', 'sectLabel',
        `Secrets · ${found.length}/${SECRETS.length} found`));
      const grid = el('div', 'codexGrid');
      for (const c of found) {
        const r = RARITY[c.rarity];
        const node = el('button', 'cx');
        node.style.setProperty('--rc', r.color);
        node.innerHTML = `
          <span class="cxEmoji">${c.emoji}</span>
          <span class="cxName">${c.name}</span>
          <span class="cxCount">${state.data.caught[c.id].count}</span>`;
        node.addEventListener('click', () => this.showCodexEntry(c));
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
        <span class="stat">Depth <b>${BANDS[c.band].name}</b></span>
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
          <div class="sub">Upgrades are permanent. Rods reach deeper. Lures bite faster.</div>
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

    /* ── permanent upgrades, the main coin sink ── */
    body.appendChild(el('div', 'sectLabel', 'Upgrades · permanent'));
    for (const u of UPGRADES) {
      const lv = state.upg(u.id);
      const maxed = lv >= u.max;
      const price = state.upgPrice(u.id);
      const canBuy = !maxed && state.coins >= price;

      const node = el('div', 'item' + (maxed ? ' owned' : ''));
      const pips = Array.from({ length: u.max },
        (_, i) => `<i class="pip${i < lv ? ' on' : ''}"></i>`).join('');
      node.innerHTML = `
        <span class="itemEmoji">${u.emoji}</span>
        <div class="itemInfo">
          <div class="itemName">${u.name} <span class="lvl">Lv ${lv}/${u.max}</span></div>
          <div class="itemDesc">${u.desc}</div>
          <div class="itemMeta">${u.stat(lv)}</div>
          <div class="pips">${pips}</div>
        </div>`;
      const b = el('button', 'buyBtn');
      if (maxed) { b.textContent = 'Maxed'; b.disabled = true; }
      else { b.textContent = `◎ ${fmt(price)}`; b.disabled = !canBuy; }
      b.addEventListener('click', () => {
        const got = state.buyUpg(u.id);
        if (!got) return;
        SFX.coin();
        this.toast(`${u.name} → Lv ${got}`, 'good');
        this._refreshShop();
        this.refresh();
      });
      node.appendChild(b);
      body.appendChild(node);
    }

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
    const lureEmoji = { none: '🪝', worm: '🪱', glow: '✨', weird: '🫧', slop: '🍜' };
    for (const l of LURES) {
      const owned = state.data.lure === l.id;
      const canBuy = !owned && state.coins >= l.cost;
      const node = el('div', 'item' + (owned ? ' owned' : ''));
      node.innerHTML = `
        <span class="itemEmoji">${lureEmoji[l.id] || '🪝'}</span>
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

  /* ── settings ────────────────────────────────────────────────────────
     Two controls only, both about readability rather than taste. HUD scale is
     the accessibility fallback the HUD guidelines suggest when per-element
     customisation is out of scope; the motion toggle exists because the scene
     animates constantly and an OS-level preference is not always visible to a
     page loaded from localStorage. */

  _buildSettings() {
    const panel = el('div', 'panel');
    panel.innerHTML = `
      <div class="panelHead">
        <div>
          <h2 id="settingsTitle">Settings</h2>
          <div class="sub">Make the boat fit your eyes</div>
        </div>
        <button class="xBtn" data-close aria-label="Close settings">✕</button>
      </div>
      <div class="panelBody">
        <div class="sectLabel">Display</div>

        <div class="setRow">
          <div class="setInfo">
            <div class="setName">HUD size</div>
            <div class="setDesc">Scales every panel, label and button. The water keeps its own resolution.</div>
          </div>
          <div class="setCtrl">
            <input id="hudRange" class="range" type="range" min="80" max="160" step="10"
                   aria-label="HUD size" aria-valuetext="100 percent">
            <output id="hudOut" class="rangeOut" for="hudRange">100%</output>
          </div>
        </div>

        <div class="setRow">
          <div class="setInfo">
            <div class="setName">Calm the water</div>
            <div class="setDesc">Stops the ambient drift, ripples and float-ups. The game stays fully playable.</div>
          </div>
          <div class="setCtrl">
            <button id="motionBtn" class="toggle" role="switch" aria-checked="false"
                    aria-label="Calm the water"><i></i><span>Off</span></button>
          </div>
        </div>

        <div class="sectLabel">Sound</div>

        <div class="setRow">
          <div class="setInfo">
            <div class="setName">Audio</div>
            <div class="setDesc">Everything is synthesised in the browser. No files are downloaded.</div>
          </div>
          <div class="setCtrl">
            <button id="muteBtn" class="toggle" role="switch" aria-checked="false"
                    aria-label="Sound"><i></i><span>On</span></button>
          </div>
        </div>

        <div class="sectLabel">Progress</div>
        <div class="setRow">
          <div class="setInfo">
            <div class="setName">Reset save</div>
            <div class="setDesc">Erases the codex, coins and upgrades. Settings are kept.</div>
          </div>
          <div class="setCtrl">
            <button id="resetBtn" class="btn danger">Reset</button>
          </div>
        </div>
        <div id="resetConfirm" class="confirm hide">
          <span>This cannot be undone. Everything you caught goes back in the sea.</span>
          <div class="confirmBtns">
            <button id="resetNo" class="btn">Keep it</button>
            <button id="resetYes" class="btn danger">Yes, reset</button>
          </div>
        </div>
      </div>`;
    $('settings').appendChild(panel);

    panel.querySelector('[data-close]').addEventListener('click', () => this.closeAll());
    $('settings').addEventListener('click', e => { if (e.target.id === 'settings') this.closeAll(); });

    $('hudRange').addEventListener('input', e => {
      this.setHudScale(Number(e.target.value) / 100);
    });
    $('motionBtn').addEventListener('click', () => {
      state.data.reduceMotion = !state.data.reduceMotion;
      state.save();
      SFX.ui();
      this.applyMotion();
      this._refreshSettings();
    });
    $('muteBtn').addEventListener('click', () => {
      this.toggleMute();
      this._refreshSettings();
    });
    $('resetBtn').addEventListener('click', () => {
      SFX.ui();
      $('resetConfirm').classList.remove('hide');
      $('resetYes').focus({ preventScroll: true });
    });
    $('resetNo').addEventListener('click', () => {
      $('resetConfirm').classList.add('hide');
      $('resetBtn').focus({ preventScroll: true });
    });
    $('resetYes').addEventListener('click', () => {
      state.reset();
      // state.reset keeps presentation prefs, so re-apply them rather than
      // assuming the DOM still matches
      this.applyHudScale();
      this.applyMotion();
      this._refreshSettings();
      this._refreshCodex();
      this._refreshShop();
      $('resetConfirm').classList.add('hide');
      this.toast('Save wiped. The sea remembers nothing.');
      this.closeAll();
    });
  }

  openSettings() {
    this._refreshSettings();
    $('settings').classList.remove('hide');
    this.modalOpen = 'settings';
    const r = $('hudRange');
    if (r) r.focus({ preventScroll: true });
  }

  _refreshSettings() {
    const scale = state.data.hudScale;
    const range = $('hudRange');
    if (range) {
      range.value = String(Math.round(scale * 100));
      range.setAttribute('aria-valuetext', `${Math.round(scale * 100)} percent`);
    }
    const out = $('hudOut');
    if (out) out.textContent = `${Math.round(scale * 100)}%`;

    const motion = $('motionBtn');
    if (motion) {
      const on = state.data.reduceMotion;
      motion.setAttribute('aria-checked', String(on));
      motion.classList.toggle('on', on);
      motion.querySelector('span').textContent = on ? 'Calm' : 'Off';
    }

    const mute = $('muteBtn');
    if (mute) {
      const on = !isMuted();
      mute.setAttribute('aria-checked', String(on));
      mute.classList.toggle('on', on);
      mute.querySelector('span').textContent = on ? 'On' : 'Muted';
    }
  }

  /* writes the CSS variable, in one place, so the DOM can never disagree with
     the save */
  setHudScale(v) {
    state.data.hudScale = Math.min(1.6, Math.max(0.8, v));
    state.save();
    this.applyHudScale();
    this._refreshSettings();
  }

  applyHudScale() {
    document.documentElement.style.setProperty('--hud', String(state.data.hudScale));
  }

  applyMotion() {
    document.body.classList.toggle('calm', !!state.data.reduceMotion);
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
          <b>Let go inside the gold window.</b> The gold band moves every cast. Release in it for a <b>gold cast</b>: 8% deeper and a better chance of something rare. Miss it and you still cast — just shorter.
        </div></div>
        <div class="helpStep"><span class="helpNum">3</span><div class="helpTxt">
          <b>Wait for the real bite.</b> The float dips for small nibbles; the big one shakes the ring and turns the button gold. Hook it fast or it is gone.
        </div></div>
        <div class="helpStep"><span class="helpNum">4</span><div class="helpTxt">
          <b>Hold to reel, release to ease.</b> Reeling fills LINE and TENSION together. The tag on the line meter shows your payout: <b>GOOD</b> near the top, <b>WEAK</b> near the bottom, <b>DEAD</b> when you are about to snap. When the fish surges, tension climbs fast — let go.
        </div></div>
        <div class="helpStep"><span class="helpNum">5</span><div class="helpTxt">
          <b>The clock under the meters is the fish's patience.</b> Strong fish tire of being hooked and leave when it runs out, so a slow reel can lose a fight you were winning. It only turns gold and red in the last few seconds.
        </div></div>
        <div class="helpStep"><span class="helpNum">6</span><div class="helpTxt">
          <b>Keep peak tension under 60</b> and finish inside 22 seconds for <b>Perfect</b>, worth 1.5×. That is slower on purpose: it is a choice about how you want to play, not a bonus you stumble into.
        </div></div>
        <div class="helpStep"><span class="helpNum">7</span><div class="helpTxt">
          <b>Every catch is measured.</b> Land a bigger one than before and it is a <b>record</b>, even for a species you already have. Chains of catches pay a growing bonus, and <b>Deep Cast</b> gives you one free throw straight to the abyss each day.
        </div></div>
        <div class="helpStep"><span class="helpNum">8</span><div class="helpTxt">
          <b>Some things only appear under certain conditions.</b> Cast at 3 a.m. Throw while broke. Lose three in a row. There are eight of them and the codex will not tell you what they are until you find one.
        </div></div>
        <div class="sectLabel">Keys</div>
        <div class="helpTxt" style="font-size:11.5px;line-height:1.9">
          ${hint() === 'tap and hold' ? '<b>Tap and hold</b> the button to cast, tap to hook, hold to reel.' : `<b>Space / click</b> — cast, hook, reel<br>
          <b>C</b> — codex &nbsp; <b>B</b> — tackle box &nbsp; <b>D</b> — deep cast &nbsp; <b>S</b> — settings &nbsp; <b>M</b> — mute &nbsp; <b>Esc</b> — close`}
        </div>
        <div class="helpTxt" style="font-size:11.5px;line-height:1.9;color:var(--faint);margin-top:8px">
          Everything is keyboard reachable. If the text is small, <b>Settings → HUD size</b> scales the whole interface without touching the water.
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
    ['card', 'codex', 'shop', 'settings', 'help'].forEach(id => $(id).classList.add('hide'));
    const wasCard = this.modalOpen === 'card';
    this.modalOpen = null;
    if (wasCard) { this.game.reset(); }
    this.refresh();
  }

  /* Tab must not walk out of a modal into the HUD behind it. Every overlay is a
     role="dialog" with aria-modal="true", so a focus trap is the missing half of
     that claim; without it a keyboard player tabs into controls they cannot see. */
  _trapFocus(e) {
    if (e.key !== 'Tab' || !this.modalOpen) return;
    const ov = $(this.modalOpen === 'entry' ? 'card' : this.modalOpen);
    if (!ov) return;
    const items = [...ov.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter(n => !n.disabled && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ov.contains(active))) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && (active === last || !ov.contains(active))) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
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

/* a catch's band name always comes from BANDS[c.band]. Never feed a band
   index to bandFor() — that takes metres, and mixing the two silently
   reported "Shore" for everything in the abyss. */
