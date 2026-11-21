/* content.js — everything you can pull out of the water.
   Design rule: the deeper you cast, the less it is a fish.
   A catch is defined by where it lives (depth), how hard it fights (fight),
   what it's worth (coins) and one line of copy that has to earn its place. */

export const RARITY = {
  common:    { label: 'Common',    color: '#8fb8c9', glow: 0.15, mult: 1.0 },
  uncommon:  { label: 'Uncommon',  color: '#6fd39a', glow: 0.35, mult: 1.6 },
  rare:      { label: 'Rare',      color: '#6aa9ff', glow: 0.6,  mult: 2.6 },
  epic:      { label: 'Epic',      color: '#c07cff', glow: 0.8,  mult: 4.2 },
  legendary: { label: 'Legendary', color: '#ffb641', glow: 1.0,  mult: 7.5 },
  mythic:    { label: 'Mythic',    color: '#ff5d8f', glow: 1.0,  mult: 13.0 },
};

/* depth bands, in metres of line out */
export const BANDS = [
  { id: 0, name: 'Shore',  min: 0,  max: 7,  tint: '#5fb3c9' },
  { id: 1, name: 'Shelf',  min: 7,  max: 15, tint: '#3d8fa8' },
  { id: 2, name: 'Drop-off', min: 15, max: 26, tint: '#2a6a85' },
  { id: 3, name: 'Trench', min: 26, max: 40, tint: '#1b4a63' },
  { id: 4, name: 'Abyss',  min: 40, max: 99, tint: '#0d2b3d' },
];

/* fight: pull = how hard it strains the line, surge = how often it bolts,
   stamina = seconds of resistance before it tires.
   Everything is tuned so a common is a 2-second formality and a mythic is a
   real negotiation with the line. */
export const CATCHES = [
  /* ── Shore ─────────────────────────────────────────────────────────── */
  { id: 'tiddler', name: 'Tiddler', emoji: '🐟', rarity: 'common', band: 0,
    coins: 4, size: 0.9, fight: { pull: 0.9, surge: 0.55, stamina: 1.6 },
    blurb: 'Enormous in ambition. Roughly the length of a thumb.' },
  { id: 'snail', name: 'Mud Snail', emoji: '🐌', rarity: 'common', band: 0,
    coins: 3, size: 0.7, fight: { pull: 0.6, surge: 0.2, stamina: 1.2 },
    blurb: 'Has been meaning to get somewhere for eleven years.' },
  { id: 'sock', name: 'One Sock', emoji: '🧦', rarity: 'common', band: 0,
    coins: 2, size: 0.8, fight: { pull: 0.5, surge: 0.1, stamina: 1.0 },
    blurb: 'The other one is in the machine. It is always in the machine.' },
  { id: 'receipt', name: 'Soggy Receipt', emoji: '🧾', rarity: 'common', band: 0,
    coins: 1, size: 0.6, fight: { pull: 0.4, surge: 0.1, stamina: 0.9 },
    blurb: 'Illegible, but you can still make out the regret.' },
  { id: 'sardine', name: 'Sardine', emoji: '🐠', rarity: 'common', band: 0,
    coins: 6, size: 1.0, fight: { pull: 1.0, surge: 0.6, stamina: 1.8 },
    blurb: 'Travels in a crowd so it never has to be alone with a thought.' },
  { id: 'boot', name: 'A Boot', emoji: '🥾', rarity: 'uncommon', band: 0,
    coins: 11, size: 1.1, fight: { pull: 1.2, surge: 0.3, stamina: 2.0 },
    blurb: 'Left foot. Size 44. Still warm. Do not ask.' },

  /* ── Shelf ─────────────────────────────────────────────────────────── */
  { id: 'puffer', name: 'Anxious Pufferfish', emoji: '🐡', rarity: 'uncommon', band: 1,
    coins: 14, size: 1.0, fight: { pull: 1.5, surge: 1.1, stamina: 2.6 },
    blurb: 'Inflates at the first sign of a social obligation.' },
  { id: 'crab', name: 'Crab With Attitude', emoji: '🦀', rarity: 'uncommon', band: 1,
    coins: 16, size: 1.1, fight: { pull: 1.7, surge: 0.9, stamina: 2.8 },
    blurb: 'Walks sideways purely to be contrarian about it.' },
  { id: 'bass', name: 'Sea Bass. Again.', emoji: '🐟', rarity: 'common', band: 1,
    coins: 8, size: 1.2, fight: { pull: 1.3, surge: 0.7, stamina: 2.2 },
    blurb: 'You have caught this exact fish nine times. It is not the same fish.' },
  { id: 'airpod', name: 'Single AirPod', emoji: '🎧', rarity: 'common', band: 1,
    coins: 9, size: 0.6, fight: { pull: 0.7, surge: 0.2, stamina: 1.4 },
    blurb: '40% battery. Left ear only. Still paired to a phone in another country.' },
  { id: 'router', name: 'WiFi Router, 1 Bar', emoji: '📶', rarity: 'uncommon', band: 1,
    coins: 22, size: 1.0, fight: { pull: 1.4, surge: 0.5, stamina: 2.4 },
    blurb: 'Blinking sadly. Has been rebooted 400 times and forgiven each time.' },
  { id: 'usbc', name: 'USB-C, Wrong Way Up', emoji: '🔌', rarity: 'uncommon', band: 1,
    coins: 19, size: 0.7, fight: { pull: 1.1, surge: 0.4, stamina: 2.1 },
    blurb: 'You flipped it. It was already right. It will never be right.' },
  { id: 'duck', name: 'Rubber Duck (Senior)', emoji: '🦆', rarity: 'uncommon', band: 1,
    coins: 24, size: 0.9, fight: { pull: 1.2, surge: 0.35, stamina: 2.2 },
    blurb: 'Has listened to every bug you ever described out loud. Never judged.' },
  { id: 'jelly', name: 'Existential Jellyfish', emoji: '🪼', rarity: 'uncommon', band: 1,
    coins: 18, size: 1.0, fight: { pull: 0.8, surge: 1.3, stamina: 2.5 },
    blurb: 'No brain, no spine, no plan. Somehow more at peace than you.' },
  { id: 'croissant', name: 'Croissant', emoji: '🥐', rarity: 'common', band: 1,
    coins: 7, size: 0.8, fight: { pull: 0.7, surge: 0.15, stamina: 1.3 },
    blurb: 'Flaky, buttery, structurally unsound. Like most promises.' },
  { id: 'eel', name: 'Suspiciously Long Eel', emoji: '🐍', rarity: 'rare', band: 1,
    coins: 34, size: 1.6, fight: { pull: 2.1, surge: 1.4, stamina: 3.4 },
    blurb: 'You keep pulling. It keeps coming. You begin to have questions.' },

  /* ── Drop-off ──────────────────────────────────────────────────────── */
  { id: 'octopus', name: 'Octopus, No Plans', emoji: '🐙', rarity: 'rare', band: 2,
    coins: 46, size: 1.3, fight: { pull: 2.4, surge: 1.6, stamina: 3.6 },
    blurb: 'Eight arms and not one of them is holding a calendar.' },
  { id: 'angler', name: 'Sad Anglerfish', emoji: '🐡', rarity: 'rare', band: 2,
    coins: 52, size: 1.2, fight: { pull: 2.6, surge: 1.8, stamina: 3.8 },
    blurb: 'Built an entire lamp to find company. Found you. Still sad.' },
  { id: 'sword', name: 'Mildly Threatening Swordfish', emoji: '🗡️', rarity: 'rare', band: 2,
    coins: 58, size: 1.7, fight: { pull: 3.0, surge: 2.1, stamina: 4.0 },
    blurb: 'Not aggressive. Just has a face that suggests it could be.' },
  { id: 'pringle', name: 'The Last Pringle', emoji: '🥔', rarity: 'rare', band: 2,
    coins: 64, size: 0.7, fight: { pull: 1.8, surge: 1.2, stamina: 3.0 },
    blurb: 'Wedged at the bottom of the tube. Reaching it is the whole personality test.' },
  { id: 'captcha', name: 'CAPTCHA', emoji: '🧩', rarity: 'rare', band: 2,
    coins: 41, size: 0.9, fight: { pull: 1.6, surge: 2.0, stamina: 3.2 },
    blurb: 'Select all squares containing a fish. There are none. You fail anyway.' },
  { id: 'nft', name: 'A Screenshot of an NFT', emoji: '🖼️', rarity: 'rare', band: 2,
    coins: 38, size: 1.0, fight: { pull: 1.4, surge: 0.8, stamina: 2.8 },
    blurb: 'You own the picture of the thing. Someone else owns the thing.' },
  { id: 'phone', name: 'Phone at 1%', emoji: '📱', rarity: 'uncommon', band: 2,
    coins: 27, size: 0.7, fight: { pull: 1.0, surge: 1.5, stamina: 2.3 },
    blurb: 'Still has 47 tabs open. Still looking for a charger. Still hopeful.' },
  { id: 'beige', name: 'A Beige Flag', emoji: '🏳️', rarity: 'uncommon', band: 2,
    coins: 25, size: 0.8, fight: { pull: 0.9, surge: 0.4, stamina: 1.9 },
    blurb: 'Not a red flag. Not a green one. Just... beige. You think about it later.' },
  { id: 'vibe', name: 'An Unlabelled Vibe', emoji: '🫧', rarity: 'rare', band: 2,
    coins: 55, size: 0.9, fight: { pull: 1.9, surge: 1.7, stamina: 3.1 },
    blurb: 'Cannot be described, only sensed. Do not try to explain it to anyone.' },
  { id: 'groupchat', name: 'Group Chat (Muted)', emoji: '💬', rarity: 'rare', band: 2,
    coins: 49, size: 1.0, fight: { pull: 1.5, surge: 1.9, stamina: 3.3 },
    blurb: '312 unread. You were tagged twice. It is probably fine.' },

  /* ── Trench ────────────────────────────────────────────────────────── */
  { id: 'ghost', name: 'Ghost Carp', emoji: '👻', rarity: 'rare', band: 3,
    coins: 78, size: 1.4, fight: { pull: 2.8, surge: 2.2, stamina: 4.6 },
    blurb: 'Haunts the exact spot you always cast. Some say it is your old rig.' },
  { id: 'coelacanth', name: 'Coelacanth', emoji: '🐟', rarity: 'epic', band: 3,
    coins: 140, size: 1.8, fight: { pull: 3.4, surge: 2.4, stamina: 5.4 },
    blurb: 'Declared extinct for 65 million years. Has been not extincting quietly.' },
  { id: 'squid', name: 'Giant Squid (Small In Person)', emoji: '🦑', rarity: 'epic', band: 3,
    coins: 155, size: 1.9, fight: { pull: 3.6, surge: 2.8, stamina: 5.8 },
    blurb: 'Photographs enormous. In the net: quite compact. Very good at angles.' },
  { id: 'starter', name: 'Sentient Sourdough Starter', emoji: '🍞', rarity: 'epic', band: 3,
    coins: 130, size: 1.0, fight: { pull: 2.2, surge: 2.6, stamina: 5.0 },
    blurb: 'Named. Fed. Has opinions about your schedule. Older than some of your friends.' },
  { id: 'algorithm', name: 'The Algorithm', emoji: '🌀', rarity: 'epic', band: 3,
    coins: 168, size: 1.2, fight: { pull: 3.2, surge: 3.0, stamina: 5.6 },
    blurb: 'Knows what you want before you do. Currently wants you to keep fishing.' },
  { id: 'unsent', name: 'The Text You Never Sent', emoji: '📝', rarity: 'rare', band: 3,
    coins: 71, size: 0.8, fight: { pull: 2.0, surge: 1.4, stamina: 3.7 },
    blurb: 'Drafted four years ago. Still perfectly worded. Still unsent.' },
  { id: 'spinner', name: 'Eternal Loading Spinner', emoji: '⏳', rarity: 'rare', band: 3,
    coins: 66, size: 0.9, fight: { pull: 1.7, surge: 2.4, stamina: 4.2 },
    blurb: 'It will finish any second now. Any second. Any second.' },
  { id: 'playlist', name: "Your Ex's Playlist", emoji: '🎵', rarity: 'epic', band: 3,
    coins: 145, size: 1.1, fight: { pull: 2.6, surge: 2.5, stamina: 5.2 },
    blurb: 'Every song is a trap. Track 4 is the one you should skip. You will not skip it.' },
  { id: '404', name: '404, Not Found', emoji: '🚫', rarity: 'uncommon', band: 3,
    coins: 44, size: 0.7, fight: { pull: 1.3, surge: 1.0, stamina: 2.6 },
    blurb: 'You are looking in the water. It was never in the water.' },

  /* ── Abyss ─────────────────────────────────────────────────────────── */
  { id: 'kraken', name: "The Kraken's Younger Cousin", emoji: '🐙', rarity: 'legendary', band: 4,
    coins: 420, size: 2.2, fight: { pull: 4.2, surge: 3.2, stamina: 7.0 },
    blurb: 'Did not get the family ambition. Mostly just wants to be included.' },
  { id: 'moonfish', name: 'Moonfish', emoji: '🌙', rarity: 'legendary', band: 4,
    coins: 460, size: 1.9, fight: { pull: 3.8, surge: 3.4, stamina: 6.8 },
    blurb: 'Only surfaces on nights nobody is watching. You were watching.' },
  { id: 'backrooms', name: 'The Backrooms Key', emoji: '🗝️', rarity: 'legendary', band: 4,
    coins: 500, size: 0.9, fight: { pull: 3.0, surge: 3.6, stamina: 6.2 },
    blurb: 'Opens a door in a place with no doors. Smells faintly of damp carpet.' },
  { id: 'schrodinger', name: "Schrödinger's Fish", emoji: '📦', rarity: 'mythic', band: 4,
    coins: 880, size: 1.4, fight: { pull: 4.4, surge: 4.0, stamina: 8.4 },
    blurb: 'Both caught and not caught until you open the card. Please do not open the card.' },
  { id: 'gotaway', name: 'The One That Got Away', emoji: '💨', rarity: 'mythic', band: 4,
    coins: 999, size: 1.6, fight: { pull: 4.8, surge: 4.4, stamina: 9.0 },
    blurb: 'You have described this fish at parties for years. It is finally here. It is enormous.' },
];

/* rods: reach (max depth in metres) + reelW (wider safe band) + coins */
export const RODS = [
  { id: 'bamboo',  name: 'Bamboo Rod',   cost: 0,    reach: 16, reelW: 0.18, desc: 'A stick with string. It is enough to start.' },
  { id: 'fiber',   name: 'Fiberglass Rod', cost: 120, reach: 27, reelW: 0.22, desc: 'Reaches the drop-off. Still bends like it means it.' },
  { id: 'carbon',  name: 'Carbon Rod',   cost: 480,  reach: 40, reelW: 0.26, desc: 'Trench depth. Stiff enough to argue with something large.' },
  { id: 'abyss',   name: 'Abyssal Rod',  cost: 1600, reach: 99, reelW: 0.30, desc: 'Goes all the way down. Nothing down there is a fish.' },
];

/* lures: bite speed + a nudge to rare rolls */
export const LURES = [
  { id: 'none',   name: 'Bare Hook',    cost: 0,   bite: 1.0,  luck: 0,    desc: 'No bait. No promises.' },
  { id: 'worm',   name: 'Worm',         cost: 60,  bite: 0.72, luck: 0.02, desc: 'Standard issue. The worm has no opinion.' },
  { id: 'glow',   name: 'Glow Lure',    cost: 260, bite: 0.58, luck: 0.07, desc: 'Visible in the dark. So are you, to it.' },
  { id: 'weird',  name: 'Weird Bait',   cost: 900, bite: 0.46, luck: 0.16, desc: "Nobody will tell you what's in it. It works." },
];

export const byId = new Map(CATCHES.map(c => [c.id, c]));
export const rodById = new Map(RODS.map(r => [r.id, r]));
export const lureById = new Map(LURES.map(l => [l.id, l]));
export const TOTAL = CATCHES.length;

export function bandFor(depth) {
  let b = BANDS[0];
  for (const band of BANDS) if (depth >= band.min) b = band;
  return b;
}
