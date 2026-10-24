'use strict';
// Daily and weekly quests, achievements and the stats behind them.
// Gem budget: an active free player earns about 12 gems a day: 5 from the daily chest, about 3 from
// the weekly chest and about 4-6 from runs (elites have a 15-50% chance of one gem, bosses give 1-3,
// a repeat world clear 1, every depth boss 1). First clears, new tiers, depth milestones and
// achievements give gems once each on top, most of them early on.
// Everything follows the phone's clock while the save is local.

const DAILY_CHEST = 5, WEEKLY_CHEST = 20;
const ACH_GEMS = [5, 15, 40];               // bronze, silver, gold
const ACH_TIERS = ['Bronze', 'Silver', 'Gold'];

// event = what counts (track()); n = how many; hero = with one owned hero; minTier = on that tier or higher
const DAILY_QUESTS = [
  { id: 'rooms', event: 'room', n: 15, text: n => `Clear ${n} rooms` },
  { id: 'kills', event: 'kill', n: 150, text: n => `Defeat ${n} enemies` },
  { id: 'elites', event: 'elite', n: 3, text: n => `Defeat ${n} elites` },
  { id: 'nohit', event: 'nohit', n: 4, text: n => `Clear ${n} rooms without getting hit` },
  { id: 'boss', event: 'boss', n: 1, text: () => 'Defeat a boss' },
  { id: 'ability', event: 'ability', n: 12, text: n => `Use your ability ${n} times` },
  { id: 'rare', event: 'epic', n: 2, text: n => `Pick ${n} epic or legendary perks` },
  { id: 'hero', event: 'room', n: 10, hero: true, text: (n, q) => `Clear ${n} rooms with ${HERO_BY_ID[q.hero].name}` },
  { id: 'gold', event: 'gold', n: 0, text: n => `Collect ${fmt(n)} gold` },
  { id: 'depths', event: 'depth', n: 2, when: () => depthsUnlocked(), text: n => `Clear ${n} depths in The Depths` },
];
const WEEKLY_QUESTS = [
  { id: 'rooms', event: 'room', n: 100, text: n => `Clear ${n} rooms` },
  { id: 'kills', event: 'kill', n: 1000, text: n => `Defeat ${fmt(n)} enemies` },
  { id: 'elites', event: 'elite', n: 15, text: n => `Defeat ${n} elites` },
  { id: 'bosses', event: 'boss', n: 3, text: n => `Defeat ${n} bosses` },
  { id: 'nohit', event: 'nohit', n: 25, text: n => `Clear ${n} rooms without getting hit` },
  { id: 'ability', event: 'ability', n: 80, text: n => `Use your ability ${n} times` },
  { id: 'hardwin', event: 'win', n: 1, minTier: 1, when: () => Object.values(save.tiers).some(t => t >= 0), text: () => 'Clear a world on Hard or higher' },
  { id: 'depths', event: 'depth', n: 10, when: () => depthsUnlocked(), text: n => `Clear ${n} depths in The Depths` },
];

const ACHIEVEMENTS = [
  { id: 'slayer', name: 'Slayer', goals: [1000, 10000, 100000], stat: () => save.stats.kills, text: n => `Defeat ${fmt(n)} enemies` },
  { id: 'elites', name: 'Elite Hunter', goals: [25, 150, 600], stat: () => save.stats.elites, text: n => `Defeat ${n} elites` },
  { id: 'bosses', name: 'Boss Breaker', goals: [3, 15, 60], stat: () => save.stats.bosses, text: n => `Defeat ${n} bosses` },
  { id: 'rooms', name: 'Explorer', goals: [100, 1000, 5000], stat: () => save.stats.rooms, text: n => `Clear ${fmt(n)} rooms` },
  { id: 'nohit', name: 'Untouchable', goals: [50, 300, 1500], stat: () => save.stats.roomsNoHit, text: n => `Clear ${fmt(n)} rooms without getting hit` },
  { id: 'flawless', name: 'Flawless', goals: [1, 5, 20], stat: () => save.stats.bossNoHit, text: n => `Defeat ${n === 1 ? 'a boss' : `${n} bosses`} without getting hit` },
  { id: 'conqueror', name: 'Conqueror', goals: [1, 3, 6], stat: () => save.tiers.crypt ?? -1, text: n => `Clear Frozen Crypt on ${tierName(n)}` },
  { id: 'diver', name: 'Deep Diver', goals: [10, 25, 50], stat: () => save.depthBest || 0, text: n => `Reach depth ${n}` },
  { id: 'heroes', name: 'Hero of All Trades', goals: [1, 2, 3], stat: () => save.stats.heroWins.length, text: n => `Clear a world with ${n} different hero${n === 1 ? '' : 'es'}` },
  { id: 'rich', name: 'Treasure Hoarder', goals: [10000, 100000, 1000000], stat: () => save.stats.goldTotal, text: n => `Collect ${fmt(n)} gold in total` },
  { id: 'ability', name: 'Ability Adept', goals: [50, 500, 2000], stat: () => save.stats.abilityUses, text: n => `Use abilities ${fmt(n)} times` },
  { id: 'relics', name: 'Relic Hunter', goals: [2, 5, 10], stat: () => Object.keys(save.relics).length, text: n => `Find ${n} different relics` },
];
const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// ---------- days and weeks ----------

const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = () => dateKey(new Date());
function weekKey() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // back to Monday
  return dateKey(d);
}
// Time left until midnight / next Monday, as "5 h 12 min".
function untilNext(weekly) {
  const now = new Date(), next = new Date(now);
  next.setHours(24, 0, 0, 0);
  if (weekly) next.setDate(next.getDate() + ((8 - next.getDay()) % 7));
  const min = Math.max(1, Math.round((next - now) / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

// ---------- quests ----------

// Gold for one daily quest: grows with how far the player has come.
function questGold() {
  const bestTier = Math.max(0, ...Object.values(save.tiers));
  return Math.round((250 * (1 + save.unlocked * 0.5) * TIER.gold ** bestTier) / 5) * 5;
}

function makeQuest(def, weekly) {
  const q = { id: def.id, have: 0, done: false, claimed: false };
  q.target = def.id === 'gold' ? Math.round((questGold() * 6) / 50) * 50 : def.n;
  if (def.hero) q.hero = pick(save.heroes);
  q.gold = questGold() * (weekly ? 4 : 1);
  return q;
}

function rollQuests(pool, n, weekly, keep = []) {
  const open = shuffle(pool.filter(d => (!d.when || d.when()) && !keep.includes(d.id)));
  return open.slice(0, n).map(d => makeQuest(d, weekly));
}

// New quests when the day or the week has turned.
function refreshQuests() {
  const Q = save.quests;
  let changed = false;
  if (!save.achInit) {   // first time: what was already reached is not announced again
    for (const a of ACHIEVEMENTS) save.achSeen[a.id] = a.goals.filter(g => a.stat() >= g).length;
    save.achInit = true;
    changed = true;
  }
  if (Q.day !== todayKey()) {
    Object.assign(Q, { day: todayKey(), daily: rollQuests(DAILY_QUESTS, 3, false), swapped: false, dailyChest: false });
    changed = true;
  }
  if (Q.week !== weekKey()) {
    Object.assign(Q, { week: weekKey(), weekly: rollQuests(WEEKLY_QUESTS, 5, true), weeklyChest: false });
    changed = true;
  }
  if (changed) writeSave();
}

const questDef = (q, weekly) => (weekly ? WEEKLY_QUESTS : DAILY_QUESTS).find(d => d.id === q.id);
const questText = (q, weekly) => questDef(q, weekly).text(q.target, q);

// Swap one unfinished daily quest for another (once a day).
function swapQuest(i) {
  const Q = save.quests, q = Q.daily[i];
  if (Q.swapped || !q || q.done) return;
  const fresh = rollQuests(DAILY_QUESTS, 1, false, Q.daily.map(x => x.id))[0];
  if (!fresh) return;
  Q.daily[i] = fresh;
  Q.swapped = true;
  writeSave();
}

function claimQuest(weekly, i) {
  const q = save.quests[weekly ? 'weekly' : 'daily'][i];
  if (!q || !q.done || q.claimed) return;
  q.claimed = true;
  save.gold += q.gold;
  writeSave();
}

function claimChest(weekly) {
  const Q = save.quests, list = weekly ? Q.weekly : Q.daily, key = weekly ? 'weeklyChest' : 'dailyChest';
  if (Q[key] || !list.length || !list.every(q => q.done)) return;
  Q[key] = true;
  save.gems += weekly ? WEEKLY_CHEST : DAILY_CHEST;
  writeSave();
}

// ---------- achievements ----------

const achClaimed = a => save.achieved[a.id] || 0;
const achReady = a => achClaimed(a) < a.goals.length && a.stat() >= a.goals[achClaimed(a)];

function claimAchievement(id) {
  const a = ACH_BY_ID[id];
  if (!a || !achReady(a)) return;
  save.gems += ACH_GEMS[achClaimed(a)];
  save.achieved[id] = achClaimed(a) + 1;
  writeSave();
}

// How many rewards wait to be claimed (the dot on the title screen).
function rewardsWaiting() {
  const Q = save.quests;
  let n = ACHIEVEMENTS.filter(achReady).length;
  for (const [list, chest] of [[Q.daily, Q.dailyChest], [Q.weekly, Q.weeklyChest]]) {
    n += list.filter(q => q.done && !q.claimed).length;
    if (!chest && list.length && list.every(q => q.done)) n++;
  }
  return n;
}

// ---------- counting ----------

// Everything that counts towards quests and achievements comes through here.
// type: kill, elite, boss, room, nohit, gold, ability, epic, win, depth
function track(type, amount = 1) {
  const st = save.stats;
  const add = { kill: 'kills', elite: 'elites', room: 'rooms', nohit: 'roomsNoHit', gold: 'goldTotal', ability: 'abilityUses' }[type];
  if (add) st[add] = (st[add] || 0) + amount;
  const Q = save.quests;
  for (const [list, weekly] of [[Q.daily, false], [Q.weekly, true]]) {
    for (const q of list) {
      const def = questDef(q, weekly);
      if (!def || q.done || def.event !== type) continue;
      if (def.hero && (!G.player || G.player.hero.id !== q.hero)) continue;
      if (def.minTier && G.tier < def.minTier) continue;
      q.have = Math.min(q.target, q.have + amount);
      if (q.have >= q.target) {
        q.done = true;
        UI.toast(`Quest complete: ${questText(q, weekly)}`);
      }
    }
  }
  // achievements: say so once when a new level is reached
  for (const a of ACHIEVEMENTS) {
    const seen = save.achSeen[a.id] || 0;
    if (seen < a.goals.length && a.stat() >= a.goals[seen]) {
      save.achSeen[a.id] = seen + 1;
      UI.toast(`Achievement: ${a.name} (${ACH_TIERS[seen]})`);
    }
  }
}
