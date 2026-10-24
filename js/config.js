'use strict';
// Game data: sizes, heroes, permanent upgrades, worlds, enemies and bosses.

const VIEW_W = 360;               // logical width of the screen, everything scales from this
const T = 30;                     // tile size
const COLS = 11, BASE_ROWS = 19;  // room interior in tiles (the Iron Citadel's rooms are taller: setRoomRows)
const ROOM_X = 15, ROOM_Y = 66;   // top-left corner of the room interior
const ROOM_W = COLS * T;
const WORLD_W = 360;
let ROWS = BASE_ROWS, ROOM_H = ROWS * T, WORLD_H = ROOM_Y + ROOM_H + 34;
const DOOR_X = WORLD_W / 2, DOOR_W = 56;
const ROOMS_PER_WORLD = 20;

// VOID: a gap in a floating island (you fall); WIND_L / WIND_R: wind that pushes everything sideways.
const TILE = { FLOOR: 0, WALL: 1, WATER: 2, LAVA: 3, ICE: 4, SPIKES: 5, VOID: 6, WIND_L: 7, WIND_R: 8 };

// How fast rooms get harder within a world (per room after the first).
const DIFFICULTY = {
  roomHp: 0.1,         // enemy HP +10% per room
  roomDmg: 0.05,       // enemy damage +5% per room
  roomShotSpeed: 0.012, // enemy shots +1.2% faster per room
  budget: 3.5,         // enemy "points" in room 1
  budgetPerRoom: 0.36, // extra points per room
  maxEnemies: 13,
};

// Difficulty tiers: a world cleared on one tier can be played again on the next.
// Tier n multiplies enemy HP, enemy damage and gold by these to the power of n.
const TIER = { hp: 1.6, dmg: 1.3, gold: 1.45 };
const TIER_NAMES = ['Normal', 'Hard', 'Nightmare', 'Hell'];
const tierName = n => (n < TIER_NAMES.length ? TIER_NAMES[n] : `Torment ${roman(n - TIER_NAMES.length + 1)}`);
// How many affixes elites get, and the share of normal enemies that get one (affixes.js).
const tierAffixes = n => ({ elite: n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0, normal: n >= 4 ? 0.25 : n >= 2 ? 0.1 : 0 });

const RARITY = {
  common:    { name: 'Common',    color: '#a9b6cc', weight: 62, rank: 0 },
  rare:      { name: 'Rare',      color: '#47a6ff', weight: 27, rank: 1 },
  epic:      { name: 'Epic',      color: '#b86bff', weight: 9,  rank: 2 },
  legendary: { name: 'Legendary', color: '#ffb321', weight: 2,  rank: 3 },
};

const HEROES = [
  {
    id: 'ranger', name: 'Rook', title: 'The Ranger', cost: 0,
    hp: 520, atk: 40, interval: 0.58, speed: 112, crit: 0.15,
    weapon: 'bow', shot: 'arrow', shotSpeed: 440,
    passive: '+10% critical chance', ability: 'rain',
    pal: { skin: '#ffd6ae', main: '#3fa14f', dark: '#2a6d36', accent: '#c98a48', hair: '#8a5530', eye: '#2b2140' },
  },
  {
    id: 'mage', name: 'Nova', title: 'The Mage', cost: 30,
    hp: 460, atk: 50, interval: 0.76, speed: 106, crit: 0.05,
    weapon: 'staff', shot: 'orb', shotSpeed: 320, homing: 3.4,
    vsBoss: 0.65,   // homing orbs never miss a boss, so they hit bosses softer
    passive: 'Magic orbs seek out their target (35% less damage to bosses)', ability: 'blink',
    pal: { skin: '#ffd9c2', main: '#7a5cff', dark: '#4d36b8', accent: '#ffcf3f', hair: '#f1f1ff', eye: '#2b2140' },
  },
  {
    id: 'tinker', name: 'Pip', title: 'The Tinker', cost: 80,
    hp: 580, atk: 22, interval: 0.29, speed: 114, crit: 0.05,
    weapon: 'blaster', shot: 'bolt', shotSpeed: 540, drone: 1,
    passive: 'Starts every run with a combat drone', ability: 'turret',
    pal: { skin: '#f2c29b', main: '#ff8a3d', dark: '#c45a1c', accent: '#3fd1c8', hair: '#3b2a24', eye: '#2b2140' },
  },
  {
    id: 'windcaller', name: 'Zephyr', title: 'The Windcaller', cost: 150,
    hp: 500, atk: 38, interval: 0.5, speed: 118, crit: 0.08,
    weapon: 'boomerang', shot: 'boomerang', shotSpeed: 440,
    passive: 'Boomerangs fly back and can hit twice', ability: 'gust',
    pal: { skin: '#f5c9a6', main: '#3fb8d6', dark: '#25799a', accent: '#f4f1e6', hair: '#eef6ff', eye: '#2b2140' },
  },
  {
    id: 'sapper', name: 'Brick', title: 'The Sapper', cost: 200,
    hp: 560, atk: 50, interval: 0.74, speed: 110, crit: 0.06,
    weapon: 'bomb', shot: 'bomb', shotSpeed: 380,
    vsBoss: 0.85,   // a bomb follows its target and never misses
    passive: 'Bombs fly over walls and blow up in a small area', ability: 'overdrive',
    pal: { skin: '#e8b48a', main: '#d0703a', dark: '#8a4520', accent: '#ffcf3f', hair: '#2e2420', eye: '#2b2140' },
  },
];
const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));

// Active abilities (abilities.js): one per hero, on a button with a cooldown. Each of the
// ABILITY_COSTS upgrades (bought with gems) cuts the cooldown by 10% and makes it stronger.
const ABILITY_COSTS = [20, 40, 60, 80, 100];
const ABILITIES = {
  rain: {
    name: 'Arrow Rain', cd: 18, icon: 'rain',
    desc: L => `Arrows rain down around your target for 2 seconds: ${+(6 + L).toFixed(1)}× your shot damage`,
  },
  blink: {
    name: 'Blink Nova', cd: 14, icon: 'blink',
    desc: L => `Teleport the way you move. The spot you leave explodes for ${+(2.5 + 0.5 * L).toFixed(1)}× your shot damage`,
  },
  turret: {
    name: 'Deploy Turret', cd: 20, icon: 'turret',
    desc: L => `Set down a turret that shoots for ${8 + L} seconds`,
  },
  gust: {
    name: 'Gale Burst', cd: 13, icon: 'gust',
    desc: L => `Blast enemies and their shots away from you: ${+(1.5 + 0.3 * L).toFixed(1)}× your shot damage`,
  },
  overdrive: {
    name: 'Overdrive', cd: 18, icon: 'overdrive',
    desc: L => `Throw bombs twice as fast, even on the run, for ${+(3 + 0.35 * L).toFixed(1)} seconds`,
  },
};

// Permanent upgrades bought with gold between runs.
const UPGRADES = [
  { id: 'hp',      name: 'Vitality',        icon: 'heart',   max: 20, base: 40,   growth: 1.27, desc: l => `+${l * 40} max HP` },
  { id: 'atk',     name: 'Power',           icon: 'sword',   max: 20, base: 50,   growth: 1.28, desc: l => `+${l * 5}% attack` },
  { id: 'speed',   name: 'Haste',           icon: 'quick',   max: 10, base: 60,   growth: 1.33, desc: l => `+${l * 3}% attack speed` },
  { id: 'crit',    name: 'Precision',       icon: 'eye',     max: 10, base: 60,   growth: 1.33, desc: l => `+${l * 2}% critical chance` },
  { id: 'armor',   name: 'Toughness',       icon: 'stone',   max: 10, base: 70,   growth: 1.33, desc: l => `${l * 2}% less damage taken` },
  { id: 'greed',   name: 'Fortune',         icon: 'coin',    max: 10, base: 50,   growth: 1.3,  desc: l => `+${l * 10}% gold` },
  { id: 'recover', name: 'Recovery',        icon: 'regen',   max: 5,  base: 120,  growth: 1.5,  desc: l => `Heal ${l * 3}% after every room` },
  { id: 'luck',    name: 'Lucky Star',      icon: 'star',    max: 5,  base: 150,  growth: 1.55, desc: l => `Rarer perks show up more often (+${l * 20}%)` },
  { id: 'reroll',  name: 'Second Thoughts', icon: 'reroll',  max: 3,  base: 200,  growth: 2,    desc: l => `${l} perk reroll${l === 1 ? '' : 's'} per run` },
  { id: 'start',   name: 'Head Start',      icon: 'gift',    max: 2,  base: 400,  growth: 2.5,  desc: l => `Pick ${l} perk${l === 1 ? '' : 's'} before room 1` },
  { id: 'revive',  name: 'Second Chance',   icon: 'ankh',    max: 1,  base: 1500, growth: 1,    desc: () => 'Come back to life once per run' },
];
const UPGRADE_PRICE = 2;          // everything in the upgrade shop costs this many times the base price
const upgradeCost = (u, level) => Math.round((u.base * UPGRADE_PRICE * Math.pow(u.growth, level)) / 5) * 5;

// Mastery: once an upgrade is maxed it carries on without a cap, a little per level.
// Power and Vitality multiply, so 12 Power levels keep up with one difficulty tier (x1.6 HP).
const MASTERY = [
  { id: 'atk',   name: 'Power Mastery',     icon: 'sword', desc: L => `x${(1.04 ** L).toFixed(2)} damage` },
  { id: 'hp',    name: 'Vitality Mastery',  icon: 'heart', desc: L => `x${(1.03 ** L).toFixed(2)} max HP` },
  { id: 'armor', name: 'Toughness Mastery', icon: 'stone', desc: L => `${Math.round((1 - 0.98 ** L) * 100)}% less damage taken` },
  { id: 'speed', name: 'Haste Mastery',     icon: 'quick', desc: L => `x${(1.01 ** L).toFixed(2)} attack speed` },
  { id: 'greed', name: 'Fortune Mastery',   icon: 'coin',  desc: L => `+${L * 3}% gold` },
];
const masteryCost = L => Math.round((6000 * 1.055 ** L) / 5) * 5;

const WORLDS = [
  {
    id: 'woods', name: 'Whispering Woods', short: 'Woods', adj: 'Whispering', noun: 'Woods',
    blurb: 'Slimes, goblins and angry boars hide among the trees.',
    hpMult: 1, dmgMult: 1, coinMult: 1,
    enemies: ['slime', 'bat', 'sporecap', 'goblin', 'boar', 'stumpy'],
    elites: ['kingSlime', 'goblinChief', 'direBoar'],
    boss: 'treant',
    hazards: { water: 0.55 },
    obstacles: ['tree', 'tree', 'rock', 'bush'],
    music: 'woods',
    theme: {
      bg: '#16301d', outer: '#24502d', wall: '#3c7a43', wallTop: '#5aa45a',
      floorA: '#8dd270', floorB: '#84c967', detail: '#6aaf52', flower: ['#fff4b8', '#ffffff', '#ffb3d1'],
      water: '#4cb3ea', waterDark: '#2f86c6',
    },
  },
  {
    id: 'caverns', name: 'Ember Caverns', short: 'Caverns', adj: 'Burning', noun: 'Caverns',
    blurb: 'Lava flows between the rocks. Do not stand in it.',
    hpMult: 1.8, dmgMult: 1.45, coinMult: 1.6,
    enemies: ['imp', 'magmaSlug', 'fireBat', 'scorpion', 'salamander', 'golem'],
    elites: ['impLord', 'giantScorpion', 'magmaBrute'],
    boss: 'magmaKing',
    hazards: { lava: 0.7 },
    obstacles: ['basalt', 'basalt', 'crystal'],
    music: 'caverns',
    theme: {
      bg: '#120a0c', outer: '#22151a', wall: '#3a2930', wallTop: '#5a434c',
      floorA: '#5b4752', floorB: '#54414b', detail: '#43323b', crack: '#ff8a3a',
      lava: '#ff7a2a', lavaLight: '#ffd35a',
    },
  },
  {
    id: 'crypt', name: 'Frozen Crypt', short: 'Crypt', adj: 'Frozen', noun: 'Crypt',
    blurb: 'The dead walk on slippery ice. Watch out for spike traps.',
    hpMult: 2.6, dmgMult: 1.8, coinMult: 2.3,
    enemies: ['skeleton', 'ghost', 'skelArcher', 'frostWisp', 'iceMage', 'yeti'],
    elites: ['boneKnight', 'frostWitch', 'elderYeti'],
    boss: 'lich',
    hazards: { ice: 0.55, spikes: 0.45 },
    obstacles: ['tomb', 'iceblock', 'pillar'],
    music: 'crypt',
    theme: {
      bg: '#0d1220', outer: '#161e31', wall: '#3b4a66', wallTop: '#5a6b8f',
      floorA: '#8799b4', floorB: '#8092ad', detail: '#6b7c97',
      ice: '#c4ecff', iceDark: '#8fd0f2',
    },
  },
  {
    id: 'sky', name: 'Skyward Ruins', short: 'Ruins', adj: 'Windswept', noun: 'Ruins',
    blurb: 'Ancient ruins on floating islands. Mind the edges: a fall hurts.',
    hpMult: 3.4, dmgMult: 2.1, coinMult: 3.1,
    enemies: ['harpy', 'sentinel', 'windSpirit', 'gargoyle', 'stormShaman', 'tortoise'],
    elites: ['harpyQueen', 'thunderShaman', 'ancientGargoyle'],
    boss: 'stormRoc',
    hazards: { void: 0.85, wind: 0.5 },
    obstacles: ['column', 'column', 'urn', 'boulder'],
    music: 'sky',
    theme: {
      bg: '#5d93cc', outer: '#8cc6f2', wall: '#a39886', wallTop: '#c9bfa9',
      floorA: '#e4dccb', floorB: '#dbd2bf', detail: '#c4b8a0', moss: '#8cc56a',
      sky: '#9ad0f7', skyDeep: '#5d93cc', rock: '#8a7f6e',
    },
  },
  {
    // fort: tall rooms you climb to the gate at the top, past towers powered by cores (fortress.js)
    id: 'citadel', name: 'Iron Citadel', short: 'Citadel', adj: 'Iron', noun: 'Citadel', fort: true,
    blurb: 'Climb the fortress to its gates. Towers cannot be destroyed, but the cores that power them can.',
    hpMult: 4.2, dmgMult: 2.4, coinMult: 3.9,
    enemies: ['ironSoldier', 'crossbowman', 'warhound', 'shieldbearer'],
    elites: ['warCaptain', 'siegeHound', 'ironWarden'],
    boss: 'ironHeart',
    hazards: {},
    obstacles: ['crate', 'barrel', 'crate', 'sandbags'],
    music: 'citadel',
    theme: {
      bg: '#17151d', outer: '#2a2731', wall: '#4d4a57', wallTop: '#6e6a7a',
      floorA: '#8e877d', floorB: '#867f75', detail: '#6e675e', metal: '#5a6070', carpet: '#9a2f2a',
    },
  },
];

// Bullet styles used by enemies.
const SHOTS = {
  spore:  { kind: 'spore', color: '#c46bff', r: 6 },
  arrow:  { kind: 'arrow', color: '#ffe07a', r: 4 },
  leaf:   { kind: 'leaf',  color: '#8de65a', r: 6 },
  orb:    { kind: 'orb',   color: '#ff5a6e', r: 6 },
  fire:   { kind: 'fire',  color: '#ff8a2a', r: 6 },
  bigfire:{ kind: 'fire',  color: '#ff6a1a', r: 9 },
  rock:   { kind: 'orb',   color: '#d9a066', r: 7 },
  bone:   { kind: 'bone',  color: '#f4ecd8', r: 5 },
  ice:    { kind: 'ice',   color: '#7fdcff', r: 6, slow: true },
  soul:   { kind: 'orb',   color: '#9ff5ff', r: 6 },
  feather:{ kind: 'feather', color: '#f4f1e6', r: 5 },
  zap:    { kind: 'orb',   color: '#ffe55a', r: 6 },
  dark:   { kind: 'orb',   color: '#b45cff', r: 7 },
  ironBolt: { kind: 'arrow', color: '#ffb36a', r: 4 },
  rivet:  { kind: 'orb',   color: '#ff7a4a', r: 6 },
  steam:  { kind: 'orb',   color: '#ffd35a', r: 7 },
};

// Enemy definitions. hp/dmg are for room 1 of a world with multiplier 1.
// ai picks the behaviour in enemies.js, art picks the drawing in art.js.
const ENEMIES = {
  // --- Whispering Woods ---
  slime: {
    name: 'Slime', art: 'slime', ai: 'hopper', hp: 70, dmg: 55, speed: 0, r: 12, cost: 1, coins: 2,
    pal: { main: '#6bd35a', dark: '#3f9c39', light: '#b8f59d' },
    hop: { every: 0.85, dur: 0.38, dist: 58 },
  },
  bat: {
    name: 'Bat', art: 'bat', ai: 'flyer', hp: 42, dmg: 45, speed: 78, r: 10, cost: 0.8, coins: 1, flying: true,
    pal: { main: '#8a5cc9', dark: '#5b3a8f', light: '#c9a9f2' },
  },
  sporecap: {
    name: 'Sporecap', art: 'mushroom', ai: 'turret', hp: 95, dmg: 50, speed: 0, r: 13, cost: 1.2, coins: 2,
    pal: { main: '#e2483f', dark: '#a3302b', light: '#ffe9d2' },
    fire: { every: 2.4, shots: 3, spread: 0.32, speed: 115, shot: 'spore', over: true },   // spores fly over scenery
  },
  goblin: {
    name: 'Goblin Archer', art: 'goblin', ai: 'archer', hp: 85, dmg: 60, speed: 68, r: 12, cost: 1.4, coins: 3,
    pal: { main: '#7fbf4a', dark: '#4f8a2c', light: '#8b5a2b' },
    fire: { every: 2.5, aim: 0.6, shots: 1, spread: 0, speed: 240, shot: 'arrow' },
  },
  boar: {
    name: 'Boar', art: 'boar', ai: 'charger', hp: 130, dmg: 70, speed: 48, r: 14, cost: 1.5, coins: 3,
    pal: { main: '#9a6a4a', dark: '#6b4430', light: '#f3e6c8' },
    dash: { every: 2.8, windup: 0.7, speed: 340, dur: 0.7, count: 1 },
  },
  stumpy: {
    name: 'Stumpy', art: 'stump', ai: 'tank', hp: 220, dmg: 55, speed: 26, r: 16, cost: 2, coins: 4,
    pal: { main: '#a8754a', dark: '#6e4a2c', light: '#6fcf55' },
    fire: { every: 3.2, ring: 8, speed: 100, shot: 'leaf' },
  },

  // --- Ember Caverns ---
  imp: {
    name: 'Imp', art: 'imp', ai: 'blinker', hp: 80, dmg: 60, speed: 0, r: 11, cost: 1.1, coins: 2, flying: true,
    pal: { main: '#e5463c', dark: '#9e2a25', light: '#ffd35a' },
    fire: { every: 1.6, aim: 0.45, shots: 1, spread: 0, speed: 170, shot: 'fire' },
  },
  magmaSlug: {
    name: 'Magma Slug', art: 'slug', ai: 'trail', hp: 130, dmg: 60, speed: 36, r: 13, cost: 1.2, coins: 2,
    pal: { main: '#ff8a3a', dark: '#b54a1c', light: '#ffe08a' },
  },
  fireBat: {
    name: 'Fire Bat', art: 'bat', ai: 'flyer', hp: 60, dmg: 55, speed: 90, r: 10, cost: 1, coins: 2, flying: true,
    pal: { main: '#ff6a3a', dark: '#a8361c', light: '#ffd35a' },
    fire: { every: 2.6, shots: 1, spread: 0, speed: 150, shot: 'fire' },
  },
  scorpion: {
    name: 'Scorpion', art: 'scorpion', ai: 'charger', hp: 120, dmg: 70, speed: 60, r: 13, cost: 1.4, coins: 3,
    pal: { main: '#c8423a', dark: '#7f2420', light: '#ffb36a' },
    dash: { every: 2.2, windup: 0.5, speed: 380, dur: 0.5, count: 1 },
  },
  salamander: {
    name: 'Salamander', art: 'salamander', ai: 'archer', hp: 110, dmg: 60, speed: 62, r: 13, cost: 1.6, coins: 3,
    pal: { main: '#ff9d2e', dark: '#c4601a', light: '#3a2a20' },
    fire: { every: 2.6, aim: 0.5, shots: 5, spread: 0.55, speed: 150, shot: 'fire' },
  },
  golem: {
    name: 'Rock Golem', art: 'golem', ai: 'jumper', hp: 300, dmg: 80, speed: 22, r: 17, cost: 2.2, coins: 5,
    pal: { main: '#7d6a66', dark: '#4f423f', light: '#ff8a3a' },
    jump: { every: 3.4, dur: 0.8, radius: 46, ring: 10, speed: 120, shot: 'rock' },
  },

  // --- Skyward Ruins ---
  harpy: {
    name: 'Harpy', art: 'harpy', ai: 'charger', hp: 80, dmg: 60, speed: 72, r: 12, cost: 1.2, coins: 2, flying: true,
    pal: { main: '#c98bd6', dark: '#8a4fa0', light: '#ffd35a' },
    dash: { every: 2.6, windup: 0.6, speed: 360, dur: 0.7, count: 1 },
  },
  sentinel: {
    name: 'Stone Sentinel', art: 'sentinel', ai: 'turret', hp: 140, dmg: 55, speed: 0, r: 14, cost: 1.4, coins: 3,
    pal: { main: '#b9b0a0', dark: '#7d7466', light: '#ffe55a' },
    fire: { every: 2.8, shots: 1, spread: 0, speed: 95, shot: 'zap', homing: 1.6 },
  },
  windSpirit: {
    name: 'Wind Spirit', art: 'windspirit', ai: 'gust', hp: 85, dmg: 55, speed: 0, r: 12, cost: 1.3, coins: 2, flying: true,
    pal: { main: '#e9f6ff', dark: '#9cc8e6', light: '#ffffff' },
    gust: { every: 2.4, radius: 105, push: 300 },
  },
  gargoyle: {
    name: 'Gargoyle', art: 'gargoyle', ai: 'gargoyle', hp: 160, dmg: 70, speed: 52, r: 13, cost: 1.5, coins: 3,
    pal: { main: '#8f8a9e', dark: '#5d586c', light: '#ff5a5a' },
    dash: { every: 2.4, windup: 0.55, speed: 360, dur: 0.55, count: 1 }, wake: 140,
  },
  stormShaman: {
    name: 'Storm Shaman', art: 'shaman', ai: 'shaman', hp: 120, dmg: 70, speed: 48, r: 13, cost: 1.7, coins: 4,
    pal: { main: '#5a6fd6', dark: '#34439a', light: '#ffe55a' },
    cast: { every: 3.0, count: 3, radius: 26, delay: 0.9 },
  },
  tortoise: {
    name: 'Rock Tortoise', art: 'tortoise', ai: 'tortoise', hp: 220, dmg: 65, speed: 24, r: 16, cost: 2.1, coins: 5, shell: true,
    pal: { main: '#9a8a6a', dark: '#6b5e44', light: '#8cc56a' },
    fire: { every: 2.6, shots: 3, spread: 0.5, speed: 120, shot: 'rock' },
  },

  // --- Iron Citadel ---
  ironSoldier: {
    name: 'Iron Soldier', art: 'soldier', ai: 'chaser', hp: 120, dmg: 70, speed: 66, r: 12, cost: 1, coins: 2,
    pal: { main: '#8a93a6', dark: '#565e70', light: '#ff5a3a' },
  },
  crossbowman: {
    name: 'Crossbowman', art: 'soldier', ai: 'archer', hp: 100, dmg: 70, speed: 56, r: 12, cost: 1.3, coins: 3, crossbow: true,
    pal: { main: '#9a7a52', dark: '#5e4a32', light: '#ffb36a' },
    fire: { every: 2.4, aim: 0.55, shots: 1, spread: 0, speed: 300, shot: 'ironBolt' },
  },
  warhound: {
    name: 'War Hound', art: 'hound', ai: 'charger', hp: 110, dmg: 75, speed: 76, r: 13, cost: 1.4, coins: 3,
    pal: { main: '#6a6f7e', dark: '#40444f', light: '#ff5a3a' },
    dash: { every: 2.4, windup: 0.5, speed: 400, dur: 0.5, count: 1 },
  },
  shieldbearer: {
    // its big shield blocks most of a shot from the front (like the tortoise's shell); it turns slowly
    name: 'Shieldbearer', art: 'shieldbearer', ai: 'chaser', hp: 170, dmg: 75, speed: 44, r: 14, cost: 1.8, coins: 4, shell: true, turn: 1.6,
    pal: { main: '#8a93a6', dark: '#565e70', light: '#ffcf3f' },
  },
  // A power core: towers stay on while it stands (fortress.js).
  core: {
    name: 'Power Core', art: 'core', ai: 'core', hp: 90, dmg: 0, speed: 0, r: 13, cost: 0, coins: 0, harmless: true,
    pal: { main: '#3fd1ff', dark: '#1f7fa8', light: '#ffffff' },
  },

  // --- Frozen Crypt ---
  skeleton: {
    name: 'Skeleton', art: 'skeleton', ai: 'chaser', hp: 110, dmg: 65, speed: 64, r: 12, cost: 1, coins: 2,
    pal: { main: '#f2ecdc', dark: '#b9ae95', light: '#6ad0ff' },
  },
  ghost: {
    name: 'Ghost', art: 'ghost', ai: 'blinker', hp: 90, dmg: 60, speed: 0, r: 12, cost: 1.2, coins: 2, flying: true,
    pal: { main: '#e8f6ff', dark: '#9cc3dd', light: '#5fd2ff' },
    fire: { every: 1.9, aim: 0.5, shots: 3, spread: 0.3, speed: 150, shot: 'soul' },
  },
  skelArcher: {
    name: 'Bone Archer', art: 'skeleton', ai: 'archer', hp: 100, dmg: 65, speed: 58, r: 12, cost: 1.4, coins: 3, bow: true,
    pal: { main: '#f2ecdc', dark: '#b9ae95', light: '#ff6a6a' },
    fire: { every: 2.3, aim: 0.5, shots: 1, spread: 0, speed: 270, shot: 'bone' },
  },
  frostWisp: {
    name: 'Frost Wisp', art: 'wisp', ai: 'bomber', hp: 70, dmg: 90, speed: 92, r: 11, cost: 1.2, coins: 2, flying: true,
    pal: { main: '#7fdcff', dark: '#3a9ccc', light: '#ffffff' },
    blast: { radius: 52, ring: 8, speed: 120, shot: 'ice' },
  },
  iceMage: {
    name: 'Ice Mage', art: 'mage', ai: 'caster', hp: 140, dmg: 60, speed: 50, r: 13, cost: 1.8, coins: 4,
    pal: { main: '#3f7fd9', dark: '#264f99', light: '#9ff0ff' },
    fire: { every: 2.8, ring: 12, speed: 105, shot: 'ice' },
  },
  yeti: {
    name: 'Yeti', art: 'yeti', ai: 'jumper', hp: 320, dmg: 85, speed: 30, r: 18, cost: 2.2, coins: 5,
    pal: { main: '#f4f8ff', dark: '#b7c8de', light: '#6fa8e8' },
    jump: { every: 3.2, dur: 0.75, radius: 48, ring: 12, speed: 125, shot: 'ice' },
  },
};

// Elites are bigger, tougher copies of normal enemies with extra tricks.
function eliteOf(base, extra) {
  const e = Object.assign({}, ENEMIES[base], extra, { elite: true });
  for (const k of ['hop', 'fire', 'dash', 'jump', 'blast', 'cast', 'gust']) {
    if (ENEMIES[base][k] && extra[k]) e[k] = Object.assign({}, ENEMIES[base][k], extra[k]);
  }
  e.hp = ENEMIES[base].hp * (extra.hpMult || 9);
  e.coins = ENEMIES[base].coins * 6;
  return e;
}
Object.assign(ENEMIES, {
  kingSlime: eliteOf('slime', {
    name: 'King Slime', r: 22, hpMult: 9, landRing: 10, split: { type: 'slime', n: 3 },
    hop: { every: 1.1, dur: 0.55, dist: 85 }, ringShot: 'orb',
  }),
  goblinChief: eliteOf('goblin', {
    name: 'Goblin Chief', r: 18, hpMult: 8, fire: { every: 1.9, aim: 0.55, shots: 5, spread: 0.5 },
  }),
  direBoar: eliteOf('boar', {
    name: 'Dire Boar', r: 21, hpMult: 9, dash: { count: 3, windup: 0.55, speed: 380 }, wallRing: 8,
    pal: { main: '#5e4a5a', dark: '#3a2c38', light: '#f3e6c8' },
  }),
  impLord: eliteOf('imp', {
    name: 'Imp Lord', r: 17, hpMult: 9, fire: { every: 1.4, shots: 3, spread: 0.4, shot: 'bigfire' }, blinkRing: 8,
  }),
  giantScorpion: eliteOf('scorpion', {
    name: 'Giant Scorpion', r: 21, hpMult: 9, dash: { count: 3, windup: 0.45 }, wallRing: 8,
  }),
  magmaBrute: eliteOf('golem', {
    name: 'Magma Brute', r: 25, hpMult: 8, jump: { every: 2.6, ring: 16, shot: 'fire' },
    pal: { main: '#6a4a46', dark: '#3e2a28', light: '#ffb02e' },
  }),
  boneKnight: eliteOf('skeleton', {
    name: 'Bone Knight', r: 19, hpMult: 10, speed: 70, knight: true, pulse: { every: 2.6, ring: 12, speed: 120, shot: 'bone' },
  }),
  frostWitch: eliteOf('iceMage', {
    name: 'Frost Witch', r: 19, hpMult: 8, fire: { every: 2.2, ring: 16 }, spiral: true,
    pal: { main: '#6a4fd9', dark: '#3f2c99', light: '#9ff0ff' },
  }),
  elderYeti: eliteOf('yeti', {
    name: 'Elder Yeti', r: 26, hpMult: 8, jump: { every: 2.4, ring: 16, radius: 60 }, jumps: 2,
    pal: { main: '#dfe9f7', dark: '#9fb3cf', light: '#4f86d9' },
  }),
  harpyQueen: eliteOf('harpy', {
    name: 'Harpy Queen', r: 18, hpMult: 8, dash: { count: 3, windup: 0.45 }, diveRing: 8,
    pal: { main: '#e07ad0', dark: '#9a3f8a', light: '#ffd35a' },
  }),
  thunderShaman: eliteOf('stormShaman', {
    name: 'Thunder Shaman', r: 18, hpMult: 8, cast: { every: 2.3, count: 6 },
    pal: { main: '#3f4fb8', dark: '#232d7a', light: '#ffe55a' },
  }),
  ancientGargoyle: eliteOf('gargoyle', {
    name: 'Ancient Gargoyle', r: 20, hpMult: 9, dash: { count: 3, windup: 0.45 }, wallRing: 8,
    pal: { main: '#6f6a80', dark: '#45405a', light: '#ff8a3a' },
  }),
  // the Iron Citadel's guardians walk the command rooms (every fifth room)
  siegeHound: eliteOf('warhound', {
    name: 'Siege Hound', r: 20, hpMult: 9, dash: { count: 3, windup: 0.45 }, wallRing: 10,
    pal: { main: '#545a6a', dark: '#30343e', light: '#ffb02e' },
  }),
  warCaptain: eliteOf('crossbowman', {
    name: 'War Captain', r: 18, hpMult: 8, fire: { every: 1.8, aim: 0.5, shots: 5, spread: 0.6 },
    pal: { main: '#b0452e', dark: '#6e2a1c', light: '#ffcf3f' },
  }),
  ironWarden: eliteOf('ironSoldier', {
    name: 'Iron Warden', art: 'warden', ai: 'jumper', r: 22, hpMult: 9, speed: 40,
    jump: { every: 2.8, dur: 0.8, radius: 56, ring: 14, speed: 125, shot: 'rivet' },
    pal: { main: '#6f7890', dark: '#424a5e', light: '#ff7a3a' },
  }),
  // Shield crystals a boss raises at 60% and 25% HP (bosses.js). HP is set from the boss.
  crystal: {
    name: 'Shield Crystal', art: 'crystal', ai: 'crystal', hp: 1, dmg: 0, speed: 0, r: 13, cost: 0, coins: 0, harmless: true,
    pal: { main: '#9fe8ff', dark: '#4fa6d6', light: '#ffffff' },
  },
});

// Bosses have fixed stats (not scaled by world, only by tier) and a list of attack moves (bosses.js).
// sig = the signature move they add in the last phase.
const BOSSES = {
  treant: {
    name: 'Elder Treant', art: 'treant', hp: 20000, dmg: 200, speed: 16, r: 34, coins: 120, gems: 1,
    pal: { main: '#8a5a36', dark: '#5a3a22', light: '#5fbf4a' },
    moves: ['spiral', 'roots', 'fan', 'summon', 'ring'], sig: 'rootfield',
    shot: 'leaf', summon: ['slime', 'sporecap'],
  },
  magmaKing: {
    name: 'Magma King', art: 'magmaKing', hp: 35000, dmg: 160, speed: 20, r: 34, coins: 220, gems: 2,
    pal: { main: '#5a3a36', dark: '#2e1c1a', light: '#ff9a2a' },
    moves: ['slam', 'meteors', 'ring', 'charge', 'summon', 'spiral'], sig: 'eruption',
    shot: 'fire', summon: ['imp', 'magmaSlug'],
  },
  lich: {
    name: 'The Lich', art: 'lich', hp: 32000, dmg: 250, speed: 24, r: 28, coins: 350, gems: 3,
    pal: { main: '#3d3260', dark: '#211a3a', light: '#7ff3ff' },
    moves: ['spiral', 'laser', 'teleport', 'summon', 'ring', 'fan'], sig: 'mirror',
    shot: 'ice', altShot: 'bone', summon: ['skeleton', 'ghost'], flying: true,
  },
  stormRoc: {
    name: 'Storm Roc', art: 'roc', hp: 60000, dmg: 280, speed: 32, r: 34, coins: 450, gems: 4,
    pal: { main: '#6b7a99', dark: '#3e4866', light: '#ffe55a' },
    moves: ['gale', 'fan', 'charge', 'ring', 'summon', 'spiral'], sig: 'tempest',
    shot: 'feather', altShot: 'zap', summon: ['harpy', 'windSpirit'], flying: true,
  },
  // Sealed until the siege golem breaks its shield (fortress.js); no crystals, and below 25% it
  // tears loose and flies about.
  ironHeart: {
    name: 'The Iron Heart', art: 'ironHeart', hp: 92000, dmg: 300, speed: 46, r: 32, coins: 480, gems: 5,
    pal: { main: '#b0452e', dark: '#5e2418', light: '#ffb02e' },
    moves: ['spiral', 'fan', 'ring', 'summon', 'barrage'], sig: 'overload', heart: true, noCrystals: true,
    shot: 'rivet', altShot: 'steam', summon: ['ironSoldier', 'crossbowman'],
  },
};
// Phase lines: below these shares of HP the boss raises a crystal shield and gets angrier.
const BOSS_PHASES = [0.6, 0.25];
const BOSS_FURY_AT = 120;   // seconds into the fight before the boss slowly speeds up
