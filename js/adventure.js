'use strict';
// Adventure: a map of numbered levels, 1, 2, 3 ... without end. Every level is short (1-3 rooms)
// and has a goal of its own: clear the rooms, survive, beat the clock, catch the Hoarder, take few
// hits, hunt an elite or beat the episode's boss. Levels come in episodes of 15; each episode
// brings in something new. Level n is built from its number alone, so it is the same every time
// and for everyone, and losing only costs that one level.
//
// Difficulty goes up like a saw: every fifth level is a hard one, the one after it easier. It does
// not follow the player's power: permanent Mastery only counts up to a cap that grows with the level
// (advMasteryCap), so a strong save can't flatten the map, and gold buys boosters before a level.
// Stars (1-3) go by how few hits you took; stars open the chests of an episode. Winning levels in a
// row (the win streak) hands out free boosters. Only new levels count for the streak: replaying an
// old one neither grows nor breaks it, so it can't be pumped up on easy levels.
// Loot is kept lean, as the levels are short: relics drop as rarely as in The Depths (and not below
// the first tier), and a boss pays its gem only the first time.

const ADV_EPISODE = 15;               // levels per episode, the last one a boss
const ADV_TIER_PER_LEVEL = 0.15;      // difficulty tiers (TIER in config.js) per level
const ADV_STARS = [2, 6];             // most hits for 3 and for 2 stars
const ADV_CHESTS = [                  // per episode: stars needed and what is inside
  { stars: 25, gems: 8, shards: 2, dust: 30 },
  { stars: 45, gems: 15, shards: 4, dust: 60 },
];

// The goals. ep: the episode that brings it in. short: for the HUD.
const ADV_GOALS = {
  clear:   { ep: 1, name: 'Clear the rooms',    short: 'Clear',   desc: 'Defeat every enemy' },
  survive: { ep: 1, name: 'Survive',            short: 'Survive', desc: n => `Stay alive for ${n} seconds while enemies keep coming` },
  timed:   { ep: 2, name: 'Beat the clock',     short: 'Clock',   desc: n => `Clear each room within ${n} seconds` },
  hoarder: { ep: 3, name: 'Catch the Hoarder',  short: 'Hoarder', desc: 'A Hoarder shows up: catch it before it gets away' },
  careful: { ep: 4, name: 'Careful now',        short: 'Careful', desc: n => `Take no more than ${n} hits` },
  elite:   { ep: 5, name: 'Elite hunt',         short: 'Elite',   desc: 'Defeat the elite waiting in the last room' },
  boss:    { ep: 1, name: 'Boss',               short: 'Boss',    desc: "Beat the episode's boss" },
};
// The world modifiers of The Depths (depths.js), brought in one per episode from episode 3.
const ADV_MOD_EP = { swift: 3, meteors: 4, dark: 5, swarm: 6 };

// Boosters: bought with gold before a level, for that level only. Prices grow with the level.
const ADV_BOOSTERS = [
  { id: 'shield', name: 'Bubble',     icon: 'stone', price: 20, desc: 'No damage for the first 8 seconds' },
  { id: 'power',  name: 'Power Brew', icon: 'sword', price: 30, desc: '+30% damage' },
  { id: 'epic',   name: 'Lucky Start', icon: 'star', price: 40, desc: 'Your first perk is epic or better' },
  { id: 'life',   name: 'Extra Life', icon: 'ankh',  price: 50, desc: 'Come back once if you fall' },
];
const ADV_BOOSTER_BY_ID = Object.fromEntries(ADV_BOOSTERS.map(b => [b.id, b]));
// Free boosters for a win streak of at least `at` levels.
const ADV_STREAK_GIFTS = [{ at: 2, id: 'shield' }, { at: 3, id: 'epic' }, { at: 5, id: 'power' }];

// ---------- progress ----------

function advSave() {
  // (filled in place: callers keep the object they got)
  const a = save.adv = save.adv || {};
  for (const [k, v] of Object.entries({ best: 0, stars: {}, streak: 0, chests: {}, seenEp: 0 })) if (a[k] === undefined) a[k] = v;
  return a;
}
const advStars = n => advSave().stars[n] || 0;
const advUnlocked = n => n <= advSave().best + 1;
const advEpisodeOf = n => Math.floor((n - 1) / ADV_EPISODE) + 1;
function advEpisodeStars(ep) {
  let s = 0;
  for (let i = 1; i <= ADV_EPISODE; i++) s += advStars((ep - 1) * ADV_EPISODE + i);
  return s;
}
const advTotalStars = () => Object.values(advSave().stars).reduce((a, b) => a + b, 0);
// How many Mastery levels count in level n.
const advMasteryCap = n => 10 + Math.floor(1.5 * n);
// Mastery as it counts in this run: capped in Adventure (perks.js baseStats).
const runMastery = id => (G.run && G.run.adv ? Math.min(masteryLevel(id), advMasteryCap(G.run.adv)) : masteryLevel(id));
const advPrice = (b, n) => Math.round((b.price * TIER.gold ** advTier(n)) / 5) * 5 || 5;
// A level not won yet: only these count for the win streak and pay first-win rewards.
const advIsNew = n => n > advSave().best;
const advGifts = () => ADV_STREAK_GIFTS.filter(g => advSave().streak >= g.at).map(g => g.id);

// ---------- the levels ----------

// Where a level sits in its episode (1..15) and in its group of five (0..4).
const advPos = n => (n - 1) % ADV_EPISODE + 1;
const advHard = n => advPos(n) % 5 === 0;
// Difficulty tier of level n: rising, with a hard level every fifth and an easier one after it.
function advTier(n) {
  const i = advPos(n);
  const bump = i % 5 === 0 ? 0.5 : i % 5 === 1 && i > 1 ? -0.35 : 0;
  return Math.max(0, ADV_TIER_PER_LEVEL * (n - 1) + bump);
}

// The episode: its world (the four worlds with ordinary rooms in turn, mixed after the first round)
// and what it brings in.
function advEpisode(ep) {
  const rng = makeRng(ep * 4243 + 17);
  const k = DEPTH_WORLDS.length;
  const env = DEPTH_WORLDS[(ep - 1) % k];
  const foe = ep <= k ? env : DEPTH_WORLDS[Math.floor(rng() * k)];
  const boss = ep <= k ? env : DEPTH_WORLDS[Math.floor(rng() * k)];
  const goals = Object.keys(ADV_GOALS).filter(g => g !== 'boss' && ADV_GOALS[g].ep <= ep);
  const mods = DEPTH_MODS.filter(m => ADV_MOD_EP[m.id] <= ep);
  const newGoal = Object.keys(ADV_GOALS).find(g => g !== 'boss' && ADV_GOALS[g].ep === ep && ep > 1);
  const newMod = DEPTH_MODS.find(m => ADV_MOD_EP[m.id] === ep);
  return {
    ep, env, foe, boss, goals, mods,
    name: env === foe ? env.name : `${foe.adj} ${env.noun}`,
    news: [newGoal && ADV_GOALS[newGoal].name, newMod && newMod.name].filter(Boolean),
    newGoal, newMod,
  };
}

// Level n: goal, rooms, modifier and how tough. Plain data, built from n alone.
function advLevel(n) {
  const E = advEpisode(advEpisodeOf(n)), i = advPos(n), hard = advHard(n);
  const rng = makeRng(n * 7907 + 3);
  const roll = list => list[Math.floor(rng() * list.length)];
  let goal;
  if (i === ADV_EPISODE) goal = 'boss';
  else if (i === 1 && E.newGoal) goal = E.newGoal;               // a new goal opens its episode
  else if (n <= 2) goal = ['clear', 'survive'][n - 1];
  else goal = roll(E.goals);
  const rooms = { clear: 2 + Math.floor(rng() * 2), survive: 1, timed: 1 + Math.floor(rng() * 2), hoarder: 1, careful: 2, elite: 2, boss: 2 }[goal];
  // a modifier now and then (always on a hard level, and on the first level with a new one)
  let mod = null;
  if (E.mods.length && (hard || (i === 2 && E.newMod) || rng() < 0.3)) mod = i === 2 && E.newMod ? E.newMod : roll(E.mods);
  const value = goal === 'survive' ? 35 + (hard ? 10 : 0) + Math.min(15, Math.floor(n / 20) * 5)
    : goal === 'timed' ? (hard ? 26 : 32)
    : goal === 'careful' ? (hard ? 2 : 3) : 0;
  return { n, ep: E.ep, pos: i, hard, goal, rooms, mod, value, tier: advTier(n), episode: E };
}

// The world object a level is played in (like depthWorld in depths.js).
function advWorld(n) {
  const L = advLevel(n), E = L.episode;
  const pos = (L.pos - 1) % 5;
  return Object.assign({}, E.env, {
    id: 'adv', adv: n, level: L, rooms: L.rooms,
    name: `Level ${n}`, short: `Level ${n}`, blurb: ADV_GOALS[L.goal].name,
    hpMult: 1, dmgMult: 1, coinMult: 1,
    enemies: E.foe.enemies, elites: E.foe.elites, boss: E.boss.boss, mod: L.mod,
    // how far into a world the rooms are for the room ramp and the enemy budget
    roomLv: 3 + pos * 2 + (L.hard ? 2 : 0),
    budgetMul: L.goal === 'survive' ? 0.6 : L.hard ? 1.2 : 1,
  });
}

const advGoalText = L => {
  const g = ADV_GOALS[L.goal];
  return typeof g.desc === 'function' ? g.desc(L.value) : g.desc;
};
const advStarText = L => (L.goal === 'careful'
  ? `3 stars: no hits · 2 stars: ${L.value - 1} hits at most`
  : `3 stars: ${ADV_STARS[0]} hits at most · 2 stars: ${ADV_STARS[1]} at most`);
function advStarsFor(L, hits) {
  if (L.goal === 'careful') return hits === 0 ? 3 : hits < L.value ? 2 : 1;
  return hits <= ADV_STARS[0] ? 3 : hits <= ADV_STARS[1] ? 2 : 1;
}

// ---------- playing a level ----------

// Start level n with the boosters bought (ids) on top of the streak's free ones.
function startAdventure(n, bought = []) {
  if (!advUnlocked(n)) return false;
  const cost = bought.reduce((a, id) => a + advPrice(ADV_BOOSTER_BY_ID[id], n), 0);
  if (cost > save.gold) return false;
  save.gold -= cost;
  writeSave();
  const boosters = [...new Set([...bought, ...advGifts()])];
  startRun(0, null, 0, 0, { n, boosters });
  return true;
}

// The run fields a level adds (startRun, game.js).
function advRunFields(n, boosters) {
  return {
    adv: n, boosters, hits: 0,
    startPicks: 2 + upgradeLevel('start'),
    epicPicks: boosters.includes('epic') ? 1 : 0,
    boostLife: boosters.includes('life'),
  };
}

// A room of a level starts (beginRoom): its goal's timers and extras.
function advBeginRoom() {
  const L = G.world.level, p = G.player;
  // (a level continued from the title screen keeps the time already spent in this room)
  const t = G.run.advRoom === G.roomIdx ? G.run.advT || 0 : 0;
  G.adv = { hits: 0, t, waveT: 2.5, hoarderDue: L.goal === 'hoarder' ? 1.2 : 0, hoarder: null, failed: null };
  if (G.roomIdx === 1 && G.run.boosters.includes('shield')) {
    p.invuln = 8;
    FX.ring(p.x, p.y, 34, '#7fd8ff', 0.6, 5);
  }
  if (G.roomIdx === 1) {
    UI.banner(`Level ${L.n}`, `${ADV_GOALS[L.goal].name}${L.mod ? ` · ${L.mod.name}` : ''}`, L.hard ? 'elite' : '');
    const E = L.episode;
    if (L.pos === 1 && E.news.length && advSave().seenEp < E.ep) {
      advSave().seenEp = E.ep;
      writeSave();
      UI.hint(`New in episode ${E.ep}: ${E.news.join(' and ')}!`);
    } else UI.hint(advGoalText(L));
  }
}

// Every frame while playing: timers, waves, the Hoarder and what makes a level fail.
function advUpdate(dt, p) {
  const A = G.adv, L = G.world.level;
  if (!A || A.failed) return;
  if (p.roomHits > A.hits) { G.run.hits += p.roomHits - A.hits; A.hits = p.roomHits; }
  if (G.cleared || G.bossDead) return;
  A.t += dt;
  G.run.advT = A.t;   // saved with the run (writeRun), for Continue
  G.run.advRoom = G.roomIdx;
  if (L.goal === 'survive') {
    A.waveT -= dt;
    if (A.waveT <= 0) {
      A.waveT = L.hard ? 2.6 : 3.2;
      advWave(p, L.hard ? 3 : 2);
    }
    if (A.t >= L.value) advSurvived();
  } else if (L.goal === 'timed' && A.t >= L.value) {
    advFail('time', `Out of time! ${advLeftText()}`);
  } else if (L.goal === 'careful' && G.run.hits > L.value) {
    advFail('hits', `Too many hits. ${advLeftText()}`);
  }
  if (A.hoarderDue > 0) {
    A.hoarderDue -= dt;
    if (A.hoarderDue <= 0) {
      A.hoarder = spawnHoarder(p);
      A.hoarder.life = 16;
    }
  }
  if (A.hoarder && A.hoarder.escaped) {
    advFail('hoarder', `The Hoarder got away with ${Math.round((A.hoarder.hp / A.hoarder.maxHp) * 100)}% of its HP left!`);
  }
  UI.advTimer();
}

// The goal still holds the room open (no clearing while there is time left to survive).
const advHoldsRoom = () => !!(G.world.adv && G.adv && G.world.level.goal === 'survive' && !G.adv.done);

// Survive: a few more enemies from the edges, as long as there aren't too many.
function advWave(p, k) {
  const types = enemyPool(G.world, roomLevel());
  for (let i = 0; i < k && G.enemies.length < DIFFICULTY.maxEnemies; i++) {
    const type = pick(types), def = ENEMIES[type];
    const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 170, maxRow: ROWS - 4, ground: !def.flying, fit: def.flying ? 0 : def.r });
    spawnEnemy(type, spot.x, spot.y, { spawnT: 0.7 });
  }
}

// Survive: time is up, the enemies that are left flee and the room is cleared.
function advSurvived() {
  G.adv.done = true;
  for (const e of G.enemies) {
    if (e.def.ai === 'hoarder') continue;
    FX.smoke(e.x, e.y, 'rgba(255,255,255,0.55)', 4, e.r * 0.6);
    e.dead = true;
  }
  G.enemies = G.enemies.filter(e => !e.dead);
  if (!G.enemies.length) onRoomCleared();
}

// How close it was, for the message when a level is lost.
function advLeftText() {
  if (G.boss && !G.bossDead) return `The boss had ${Math.max(1, Math.round((G.boss.hp / G.boss.maxHp) * 100))}% HP left!`;
  const left = G.enemies.filter(e => !e.dead && !e.def.harmless).length;
  const rooms = roomsIn(G.world) - G.roomIdx;
  const L = G.world.level;
  if (L.goal === 'survive' && G.adv) return `Only ${Math.max(1, Math.ceil(L.value - G.adv.t))} seconds to go!`;
  if (!left && !rooms) return 'So close!';
  return `${left} enem${left === 1 ? 'y' : 'ies'} left${rooms ? ` and ${rooms} more room${rooms > 1 ? 's' : ''}` : ''}.`;
}

// Lost for a reason other than falling: the level ends as if the hero went down.
function advFail(reason, text) {
  G.adv.failed = { reason, text };
  UI.banner(reason === 'time' ? 'Time up!' : reason === 'hoarder' ? 'It got away!' : 'Too many hits!', '', 'boss');
  Sound.play('lose');
  playerDied();
}

// The last room is cleared or the boss is down.
function advWin() {
  G.state = 'won';
  G.winShown = true;
  const L = G.world.level, a = advSave(), run = G.run;
  const stars = advStarsFor(L, run.hits);
  const before = advStars(L.n), first = L.n > a.best;
  a.stars[L.n] = Math.max(before, stars);
  a.best = Math.max(a.best, L.n);
  if (first) a.streak++;
  // the first win of a level pays a little gold, a boss level a few gems too
  const bonus = first ? Math.round(25 * TIER.gold ** L.tier * (1 + G.player.s.gold)) : 0;
  run.gold += bonus;
  if (first && L.goal === 'boss') run.gems += 3 + Math.min(7, Math.floor(L.ep / 2));
  if (L.goal === 'boss') track('win');
  const sum = endRun(true);
  Object.assign(sum, { adv: L, stars, before, first, bonus, streak: a.streak, chest: advChestReady(L.ep) });
  Sound.stopMusic();
  Sound.play('victory');
  UI.hud(false);
  UI.advResult(sum);
}

// Fell, or failed the goal (gameOver, game.js).
function advLost() {
  G.state = 'over';
  const a = advSave(), L = G.world.level;
  const why = G.adv && G.adv.failed ? G.adv.failed.text : `You fell. ${advLeftText()}`;
  const lostStreak = advIsNew(L.n) ? a.streak : 0;
  if (lostStreak) a.streak = 0;
  const sum = endRun(false);
  Object.assign(sum, { adv: L, why, lostStreak });
  Sound.stopMusic();
  UI.hud(false);
  UI.advResult(sum);
}

// ---------- episode chests ----------

const advChestOpen = (ep, i) => !!(advSave().chests[ep] || [])[i];
const advAnyChest = () => { for (let ep = 1; ep <= advEpisodeOf(advSave().best + 1); ep++) if (advChestReady(ep)) return true; return false; };
const advChestReady = ep => ADV_CHESTS.some((c, i) => !advChestOpen(ep, i) && advEpisodeStars(ep) >= c.stars);
function advOpenChest(ep, i) {
  const c = ADV_CHESTS[i];
  if (!c || advChestOpen(ep, i) || advEpisodeStars(ep) < c.stars) return null;
  const a = advSave();
  (a.chests[ep] = a.chests[ep] || [])[i] = true;
  const k = 1 + Math.floor((ep - 1) / 4);   // later episodes, fuller chests
  const got = { gems: c.gems, shards: c.shards * k, dust: c.dust * k };
  save.gems += got.gems;
  save.shards += got.shards;
  save.dust += got.dust;
  writeSave();
  return got;
}
