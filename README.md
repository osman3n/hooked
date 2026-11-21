# 🎣 HOOKED

**A meme fishing game.** Cast out, wait for the bite, hook it, then fight it in. You will catch fish. You will also catch a USB-C cable, a CAPTCHA, a sentient sourdough starter, and the one that got away.

**[▶ Play it now](https://osman3n.github.io/hooked/)**

![HOOKED title screen](shots/01-title.png)

---

## Why it exists

Fishing minigames are the most-copied, least-understood mechanic in games. Most reduce to a progress bar that fills while you hold a button. The good ones are built on a **three-beat loop**:

1. **Charge** — how far do you cast? Distance is a real decision, not flavour.
2. **React** — the bite is a window. Miss it and the fish is gone.
3. **Fight** — two competing clocks. The fish pulls *and* it webs. You cannot just hold.

HOOKED is an attempt to build those three beats properly in ~4,500 lines of dependency-free JavaScript, and to make the reward for doing it well something funnier than a trout.

## The loop

| Beat | What you do | What the game asks |
| --- | --- | --- |
| **Cast** | Hold, release on the gold window | The window **moves every cast**, so muscle memory is not enough — you have to look |
| **Wait** | Do nothing. Breathe. | Fake nibbles are indistinguishable from real ones until the last moment |
| **Bite** | Press within a ~0.95 s window | Every miss is a fish you will never see |
| **Fight** | Hold to reel, release to ease | Tension and progress are both clocks. Riding the edge fills LINE ~2× faster than playing safe |

### The gold window

The power bar's sweet spot is not a fixed mark at 78% — it is re-rolled every single cast
(`beginCharge()` picks `lo = 0.42 + rand·0.34`, width `0.09–0.14`). Releasing inside it:

- casts **8% deeper** (capped at the rod's reach, so it never breaks the depth budget), and
- adds **+0.06 luck**, so slightly better things notice you.

Before this, the mark on the bar was decoration — the sim had no notion of a sweet spot at
all, and the HTML mark was hardcoded at `left: 78%`. A skill beat the player does not have
to unlock is worth more than another 20 catches.

### The fight is the game

There is no way to brute-force it:

- **Holding forever snaps the line.** Tension has a hold ramp — the longer you crank without easing, the faster it climbs.
- **Never reeling loses the fish.** Slack accumulates; after 4.5 s it shakes the hook (`escaped`).
- **Playing it safe is slow, not safe.** Progress scales with tension: 0.55× at slack, 1.0× at 66. Wobbling in the middle means every fight runs near its 30–80 s clock.
- **Surges are the tell.** A surging fish keeps pulling even as you ease, so releasing is mandatory exactly when it feels worst.
- **`PERFECT` is a choice, not a bonus.** It requires keeping peak tension under 60 **and** landing it — a deliberately gentle, slow fight. It pays ×1.5.
- **The fish has a clock too.** Every fight has a patience bar under the meters, and it turns gold then red in the last few seconds. It used to be invisible, which meant the game could take a fight from you with no on-screen reason.

That gives four distinct ways to lose: snap at 100 tension, let slack hit 4.5 s, run out the fish's clock, or fumble the bite.

## What you can catch

**100 things** across five depth bands, plus **8 secrets** you cannot see in the codex until you find one. Maybe a third are fish. The rest are the sea's honest opinion about the internet.

| Depth | Band | What lives there |
| --- | --- | --- |
| 0–7 m | Shore | Tiddler, Mud Snail, One Sock, Soggy Receipt, Sardine, Rusty Tin Can, Clump of Seaweed, Shell With Nobody In It, Goby Doing Its Best, A Boot, Message in a Bottle (Blank), One-Armed Sunglasses, Beach Sandal Size 46, Someone Else's Hook, Beach Ball With a Grudge, Very Small Frog, Key to a Flat You No Longer Rent, Wedding Ring (Not Yours) |
| 7–15 m | Shelf | Sea Bass. Again., Sea Bass (A Different One), Suspiciously Fresh Mackerel, Croissant, Soggy Pizza Slice, Someone's Marble, Single AirPod, Wrong Charger Right Voltage, Anxious Pufferfish, Crab With Attitude, WiFi Router 1 Bar, USB-C Wrong Way Up, Rubber Duck (Senior), Existential Jellyfish, Reading Glasses −2.50, The LEGO You Stepped On, Wallet With No Cards, Suspiciously Long Eel, Floppy Disk (Unlabelled), Frisbee Still Flying |
| 15–26 m | Drop-off | Phone at 1%, A Beige Flag, Dongle of Unknown Purpose, SIM Card Three Bars, A Notification You Dismissed, A Match Who Never Replied, Octopus No Plans, Sad Anglerfish, Mildly Threatening Swordfish, The Last Pringle, CAPTCHA, A Screenshot of an NFT, An Unlabelled Vibe, Group Chat (Muted), Mechanical Keyboard (Clicky), The Zipper That Ate Your Jacket, Recursion (See: Recursion), Fast Charger Still Warm, That One Bug You Fixed in Prod, Unlabelled Mixtape, Term Sheet Waterlogged, Lobster With a Mortgage |
| 26–40 m | Trench | 404 Not Found, Mandatory Update, Group Chat: 'Dads of Fishing', Ghost Carp, The Text You Never Sent, Eternal Loading Spinner, A Voicemail From 2016, Terms of Service (Unread), Inbox: 4,112 Unread, An Invoice You Already Paid, Lanternfish With a Dental Plan, Merge Conflict Unresolved, Sentient Sourdough Starter, Coelacanth, Giant Squid (Small In Person), The Algorithm, Your Ex's Playlist, Friday Somehow, A Genuinely Beautiful Fish, The Hole Where Your Motivation Was, Seed Phrase (Laminated), A Cat Somehow |
| 40 m+ | Abyss | Anglerfish With a Business Plan, Extended Warranty Expired, Your 2019 Tax Return, Gacha Pity Timer, Unidentified Submerged Object, A Door Slightly Ajar, The Kraken's Younger Cousin, Moonfish, The Backrooms Key, Fishing Permit From 2050, The Last Slice Still Warm, Leviathan Retired, The Dark Itself, A Memory You Trimmed, Schrödinger's Fish, The One That Got Away, 42, Catfish (Both Definitions) |

Rarity split across all 108: 18 common · 24 uncommon · 28 rare · 21 epic · 13 legendary · 4 mythic.

### The secrets

Eight catches are not in the codex and are not in any band's total. Each one is gated on something about **how you happen to be playing right now**, so it reads as a thing that happened to you rather than a lucky roll:

| Secret | Appears when |
| --- | --- |
| Splash, But No | you cast with almost no power |
| Beginner's Luck | it is your very first cast |
| Your Last Coin | you are nearly broke |
| The Pity Catch | you have lost three in a row |
| The 3 A.M. Thought | your local clock is between 00:00 and 05:00 |
| The Streak | you have landed five in a row |
| The Full Send | you cast at essentially full power |
| A Literal Money Fish | you are sitting on 5,000+ coins |

The gate is checked **before** weighting, so an ineligible secret is not in the water at all — it can never eat a slot that belonged to a real catch. Progress is measured against the 100 visible entries, so the bar can actually reach 100% without requiring you to fish at 3 a.m.

## Upgrades

Coins buy two different things: **gear** (rods reach deeper, lures bite faster) and **permanent upgrades**, which are six tracks of small, stacking multipliers. All levels are kept forever and all of them touch the simulation.

| Upgrade | Levels | Effect per level |
| --- | --- | --- |
| 🎡 Smoother Reel | 4 | +8% line speed |
| 🧵 Braided Line | 4 | −7% tension gain |
| 🥅 Bigger Net | 4 | +12% coins |
| 🍀 Lucky Charm | 4 | +3% rare finds |
| 📡 Depth Sonar | 3 | −12% wait time |
| 🪝 Wider Hook | 3 | +0.15 s hook window |

Rods are gated on **codex progress**, not on money (`ROD_GATE = [0, 3, 9, 18]`), so a lucky deep cast can pay for its own rod. Upgrades are never gated — if you can afford it, it is yours.

Deeper water does not merely pay better, it has **its own roster**. A Shore-only player literally cannot finish the codex, which is what makes the depth bands feel like places rather than difficulty tiers.

## Coming back tomorrow

Three systems exist only to make a second session worth opening:

- **Size records.** Every catch rolls a size from its bulk class (`sizeCm()` maps the
  relative index onto a log curve — a receipt is 2.4 cm, a retired leviathan is 14.8 m).
  Beating your own best for a species shows a green edge and a `record` tag. This is the
  reason re-catching a common is not wasted.
- **Streak bonus.** Consecutive landings pay up to **×1.20** at ten in a row; any loss
  resets it to zero. It is visible in the HUD once you have two, so the risk of a
  cocky fight is a number you can see.
- **The daily deep cast** (`D`, or the gold chip). Once per local day it forces the cast
  to at least 41 m — the abyss — regardless of your rod, and adds **+0.14 luck**. It
  spends itself the moment you let go, and the daily rolls over at *your* midnight
  (local date, deliberately not UTC).

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Cast / hook / reel | Click or `Space` (hold to charge) | Tap and hold |
| Daily deep cast | `D` | Deep Cast chip |
| Codex | `C` | Codex chip |
| Tackle Box | `B` | Tackle Box chip |
| Settings | `S` | ⚙ chip |
| Mute | `M` | Settings → Audio |
| Close panel | `Esc` | ✕ |

Every panel is reachable by keyboard, Tab is trapped inside the open overlay, and focus returns to where it was when the panel closes.

## Settings

Three things live behind the ⚙ chip, and all of them persist:

- **HUD size**, 80–160% in 10% steps. It scales the interface layer only — `transform: scale(var(--hud))` on `#hud` — so labels and buttons grow while the water keeps its own resolution. This is the recommended fallback when per-element HUD placement is out of scope: one slider instead of fifteen.
- **Calm the water.** Stops the ambient drift, ripples and float-ups. It deliberately does *not* stop the bobber, the meters or the fight clock, because those carry information rather than decoration.
- **Reset save.** Asks first, and keeps your display and sound settings — a new run should not reset the player's eyes to defaults.

The setting is applied through exactly one function (`setHudScale`), which writes the CSS variable and the save together, so the DOM cannot disagree with what was stored.

## Running it

No build step, no dependencies, no `npm install`. It is plain ES modules served as static files.

```bash
npm run dev          # serves on http://localhost:8080
```

Any static server works (`python -m http.server`, `npx serve`, …). You cannot open `index.html` from the filesystem — ES modules require HTTP.

```bash
npm test             # 927 assertions, headless, no browser
npm run balance      # prints a per-species balance table for 6 player archetypes
npm run shots        # 12 screenshots via headless Chrome → shots/
npm run e2e          # plays the DEPLOYED site end-to-end, checks the save reloads
```

`npm run shots` and `npm run e2e` need Chrome. They honour `CHROME_PATH`, otherwise look for Chrome in the usual Windows location. `e2e` takes an optional URL: `node tools/e2e.mjs http://localhost:8080/`.

CI runs `test` and `balance` on every push (`.github/workflows/ci.yml`) — there is nothing to install, which is the point of having no dependencies.

## How it is built

```
index.html          markup + HUD skeleton
css/style.css       design system: tokens, glass panels, all states
js/content.js       the 108 catches, secrets, rarity table, depth bands, rods, lures, upgrades
js/sim.js           the entire game state machine — no DOM, no canvas
js/state.js         localStorage save, coins, codex, unlock rules
js/render.js        canvas scene: sky, water, kelp, particles, line, bobber
js/ui.js            DOM HUD, panels, phase→copy mapping
js/audio.js         all sound synthesised at runtime (no .wav in the repo)
js/main.js          bootstrap + the single rAF loop
tools/              dev server, CDP client, screenshots, self-test, balance probe
```

Deliberate choices:

- **No bundler, no framework, no assets.** The whole repo is text, so GitHub Pages serves the source directly and it scales to any DPI. The favicon is an inline SVG emoji.
- **`sim.js` has no DOM access.** The entire game is steppable in Node, which is why 927 assertions can run headless and why the balance probe can play 648 fights in a couple of seconds.
- **All audio is synthesised.** `js/audio.js` builds tones and noise plus a generated convolver reverb, so there is nothing to download and no licensing question.
- **`tools/cdp.mjs` is a 120-line Chrome DevTools Protocol client** instead of Puppeteer, which keeps the zero-dependency promise while still catching real console errors — that client is how two of the bugs below were found.
- **Balance is tested, not vibed.** `tools/balance.mjs` plays every species with six strategies (beginner, steady, greedy, idle, masher, calm) and asserts the shape of the outcome, not just that it runs.

## Bugs worth remembering

Real ones, found by actually running the thing:

- **`addColorStop` threw mid-frame.** A gradient call passed `rgba(...)` into a hex-only `mix()`, producing `#NaNbaNaN0.55`. The canvas died. Caught only because the screenshot harness collects `Runtime.exceptionThrown`.
- **Holding the button always won.** Progress was `26 + 30/pull` per second — the weakest catch landed in under a second. Adding a hold ramp (tension climbs with continuous reel time) turned a formality into the actual mechanic.
- **A strong fish could not be caught at all.** Progress rate and slack loss nearly cancelled at `pull: 4.8`, so the mythic fight crawled for 191 s. Retuned both slopes.
- **Stalemate by design.** Surge cooldown was shorter than surge duration, so a strong fish surged continuously, progress sat at ×0.25, and the fight could be neither won nor lost. Rest now always outlasts the surge.
- **The codex rendered as one narrow column.** The JS set `id="codexGrid"` while the CSS targeted the *class* `.codexGrid`. An id/class mismatch that no unit test would catch.
- **Every request 403'd.** The dev server compared `target.startsWith(root)` with a relative root; `'index.html'.startsWith('.')` is false. Found by a HUD probe, not by a screenshot.
- **A 241-second fight.** `fightLimit = 30 + stamina * 22` was fine for a 40-item roster, but the expansion added mythics with `stamina: 9.6`, so one bad fight could run four minutes and read as a hang. Capped at 75 s.
- **The shop lied about its own upgrades.** `stat(lv)` reported the *current* level, so every unbought upgrade read `−0% TENSION GAIN` — which looks like a broken item, not a purchasable one. Now level 0 shows what the first purchase buys.
- **A phantom upgrade level survived `load()`.** Corrupt-save repair clamped known ids but left unknown keys in the map, so a renamed upgrade would keep a ghost level. The map is now rebuilt from `UPGRADES` only.
- **An ineligible secret could eat a real catch's slot.** Secrets are now filtered by their gate *before* weighting, so they are simply not in the water when their condition is false.
- **The codex called everything "Shore".** `showCodexEntry` passed a catch's band *index* into `bandFor()`, which takes *metres* — so a band-4 abyss catch resolved against depth 4 and matched the shore band. Every codex entry lied about its depth, and nothing failed loudly. The band name now always comes from `BANDS[c.band].name`, and the self-test pins the index-vs-metres distinction.
- **A Tiddler measured 41.7 cm.** Each catch's `size` is a relative bulk index, not centimetres, but `_land` multiplied it by 34 — so a fish described as "roughly the length of a thumb" measured like a small dog. Sizes now run through `sizeCm()` (a log curve) and `formatSize()`, and the self-test asserts a receipt is under 5 cm while a leviathan is over 2 m.
- **Haptics threw a console error on load.** `navigator.vibrate` before any user gesture is blocked, which failed the zero-console-errors gate on every screenshot run. `buzz()` now no-ops until the first real gesture.
- **The help panel documented the wrong Perfect rule.** It promised "stay under 75", while the sim required `maxTension < 60 && fightT < 22`. The copy now matches the code — and the `D` key it advertised was not bound at all until this pass.
- **The gold window was decoration.** The power bar's gold mark was hardcoded at `left: 78%` in CSS and the sim had no sweet spot at all, so the most skilful-looking part of the cast did nothing. It is now re-rolled per cast and pays depth plus luck.
- **`npm run dev` silently did nothing.** The direct-run guard compared `import.meta.url` against a hand-built `` `file://${path}` ``, which has two slashes, while `import.meta.url` on Windows is `file:///C:/...`. The comparison was never true, so the script exited 0 without listening on a port. Both harnesses hid it because they *import* `serve()` instead of running it. Fixed with `pathToFileURL()`, and verified with an actual HTTP request rather than an exit code.
- **The player could lose to a timer they could not see.** `if (this.fightT > this.fightLimit)` ended fights after 30–80 s, and no UI element showed that clock. Research into Stardew's HUD and the Accessible Game Design guidelines turned this into a real fix: a visible patience bar, gold under 8 s, red under 4 s. Timers should be readable, not merely enforceable.
- **The last line of the help panel looked clipped.** It was legitimately scrollable — the content overflowed by exactly 47 px, so the final sentence sat on the cut edge and read as broken text. Tightened the spacing so the panel fits without scrolling at 1280×800.
- **A regex literal was double-escaped in an e2e assertion.** `/^\\d+:\\d{2}$/` matched a literal backslash, so `1:15` failed while the clock was working perfectly. The assertion now also steps the game and proves the number actually falls, because a format check alone would have passed with a frozen clock.

## License

MIT — see [LICENSE](LICENSE).
