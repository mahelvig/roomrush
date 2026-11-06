'use strict';
// Relics as loot: every relic that drops is a thing of its own, with its level and a few random
// affixes (+7% attack, +12% gold ...). They go in the bag (BAG_SIZE), you wear the best ones,
// level them up with Relic Dust and Star Shards, and salvage the rest into dust.
// The relic's own effect (relics.js) is the same on every copy; the affixes are what you hunt for.

const BAG_SIZE = 40;

// What an affix can be. max is the best roll at item level 0; it grows with the level (affixMax).
// pct: shown as a percentage. apply(s, v): adds it to the stats (perks.js).
const AFFIXES_RELIC = {
  atk:     { name: 'attack',              max: 0.08,  apply: (s, v) => { s.atkPct += v; } },
  rate:    { name: 'attack speed',        max: 0.06,  apply: (s, v) => { s.rate *= 1 + v; } },
  crit:    { name: 'critical chance',     max: 0.05,  apply: (s, v) => { s.crit += v; } },
  critdmg: { name: 'critical damage',     max: 0.25,  apply: (s, v) => { s.critMul += v; } },
  hp:      { name: 'max HP',              max: 0.10,  apply: (s, v) => { s.hpPct += v; } },
  armor:   { name: 'less damage taken',   max: 0.05,  apply: (s, v) => { s.armor = 1 - (1 - s.armor) * (1 - v); } },
  speed:   { name: 'move speed',          max: 0.06,  apply: (s, v) => { s.speed *= 1 + v; } },
  dodge:   { name: 'dodge chance',        max: 0.03,  apply: (s, v) => { s.dodge += v; } },
  gold:    { name: 'gold',                max: 0.12,  apply: (s, v) => { s.gold += v; } },
  heal:    { name: 'heal after a room',   max: 0.03,  apply: (s, v) => { s.roomHeal += v; } },
  ability: { name: 'faster ability',      max: 0.06,  apply: (s, v) => { s.abilityCd *= 1 - v; } },
  vamp:    { name: 'HP for every kill',   max: 0.005, apply: (s, v) => { s.vamp += v; } },
};
const AFFIX_IDS = Object.keys(AFFIXES_RELIC);
// Harder places roll stronger affixes: up to about double at item level 8.
const affixMax = (id, ilvl) => AFFIXES_RELIC[id].max * (1 + 0.12 * clamp(ilvl, 0, 8));
// How many affixes a relic of this rarity gets, and a chance of one more in harder places.
const AFFIX_COUNT = { common: 1, rare: 2, epic: 2, legendary: 3 };

// "+7% attack". Small values keep a decimal.
function affixText([id, v]) {
  const p = v * 100;
  return `+${p < 1 ? p.toFixed(1) : p < 10 ? +p.toFixed(1) : Math.round(p)}% ${AFFIXES_RELIC[id].name}`;
}
// How good the rolls are, 0..1 (1 = every affix at the best value for its item level).
const rollQuality = it => (it.aff.length ? it.aff.reduce((a, [id, v]) => a + v / affixMax(id, it.ilvl), 0) / it.aff.length : 0);

// A fresh relic of base `id`, rolled at item level ilvl.
function makeItem(id, ilvl, L = 1) {
  const base = RELIC_BY_ID[id];
  let n = AFFIX_COUNT[base.rarity];
  if (n < 4 && Math.random() < Math.min(0.4, 0.05 * ilvl)) n++;
  const ids = shuffle(AFFIX_IDS.slice()).slice(0, n);
  return { id, L, ilvl: Math.round(ilvl * 10) / 10, aff: ids.map(a => [a, +(affixMax(a, ilvl) * rand(0.4, 1)).toFixed(4)]) };
}

// ---------- the bag ----------

const bagItems = () => save.items;
const itemByUid = uid => save.items.find(it => it.uid === uid);
const isWorn = it => save.worn.includes(it.uid);
const relicSlots = () => ((save.tiers.crypt ?? -1) >= 3 ? 3 : 2);
const hasFoundRelics = () => save.items.length > 0 || Object.keys(save.relics).length > 0;

function addItem(it) {
  it.uid = save.nextUid = (save.nextUid || 0) + 1;
  save.items.push(it);
  save.relics[it.id] = true;   // the codex of relics ever found
  return it;
}

// What a run starts with: the worn relics (one of each kind), as they are now.
function wornRelics() {
  const out = [];
  for (const uid of save.worn) {
    const it = itemByUid(uid);
    if (it && !out.some(o => o.id === it.id)) out.push({ id: it.id, L: it.L, aff: it.aff, uid });
    if (out.length >= relicSlots()) break;
  }
  return out;
}
const runRelic = (p, id) => { const r = p.relics && p.relics.find(x => x.id === id); return r ? r.L : 0; };
function applyRelicAffixes(s, r) {
  for (const [id, v] of r.aff || []) if (AFFIXES_RELIC[id]) AFFIXES_RELIC[id].apply(s, v);
}

// Wear or take off. Only one of each kind: wearing a second Thorn Ring swaps it for the first.
function toggleRelic(uid) {
  const it = itemByUid(uid);
  if (!it) return;
  const i = save.worn.indexOf(uid);
  if (i >= 0) save.worn.splice(i, 1);
  else {
    const same = save.worn.findIndex(u => { const o = itemByUid(u); return o && o.id === it.id; });
    if (same >= 0) save.worn[same] = uid;
    else {
      if (save.worn.length >= relicSlots()) save.worn.shift();   // the oldest one comes off
      save.worn.push(uid);
    }
  }
  writeSave();
}

// ---------- levelling up and salvaging ----------

const RELIC_DUST = { common: 25, rare: 40, epic: 60, legendary: 90 };
// What the next level of a relic costs, or null when it is maxed.
function relicUpgradeCost(it) {
  if (!it || it.L >= RELIC_MAX) return null;
  return { dust: RELIC_DUST[RELIC_BY_ID[it.id].rarity] * it.L, shards: it.L - 1 };
}
const canUpgradeRelic = it => {
  const c = relicUpgradeCost(it);
  return !!c && save.dust >= c.dust && save.shards >= c.shards;
};
function upgradeRelic(uid) {
  const it = itemByUid(uid);
  if (!canUpgradeRelic(it)) return false;
  const c = relicUpgradeCost(it);
  save.dust -= c.dust;
  save.shards -= c.shards;
  it.L++;
  writeSave();
  return true;
}

// Salvaged: some dust back, and half of what went into its levels (dust and shards).
function salvageValue(it) {
  const d = RELIC_DUST[RELIC_BY_ID[it.id].rarity];
  return { dust: Math.round(d * 0.4 + d * it.L * (it.L - 1) / 4), shards: Math.round((it.L - 1) * (it.L - 2) / 4) };
}
function salvageItem(uid) {
  const it = itemByUid(uid);
  if (!it || isWorn(it)) return null;
  const v = salvageValue(it);
  save.dust += v.dust;
  save.shards += v.shards;
  save.items.splice(save.items.indexOf(it), 1);
  writeSave();
  return v;
}
// Everything of a rarity that is not worn, level 1 only (levelled ones were chosen on purpose).
const salvageableOf = rar => save.items.filter(it => !isWorn(it) && it.L === 1 && RELIC_BY_ID[it.id].rarity === rar);
function salvageAll(rar) {
  const sum = { dust: 0, shards: 0, n: 0 };
  for (const it of salvageableOf(rar)) {
    const v = salvageItem(it.uid);
    sum.dust += v.dust; sum.shards += v.shards; sum.n++;
  }
  return sum;
}

// The bag in the order it is shown: the worn ones first, then kind by kind, the best first.
function sortedBag() {
  const order = Object.fromEntries(RELICS.map((r, i) => [r.id, i]));
  return save.items.slice().sort((a, b) => isWorn(b) - isWorn(a) || order[a.id] - order[b.id] || b.L - a.L || rollQuality(b) - rollQuality(a));
}

// ---------- picking one up ----------

// A relic picked up in a run goes in the bag at once (kept even if the run is lost). A full bag
// salvages it straight away.
function collectRelicItem(it) {
  const r = RELIC_BY_ID[it.id];
  if (save.items.length >= BAG_SIZE) {
    const d = RELIC_DUST[r.rarity];
    G.run.dust = (G.run.dust || 0) + d;
    noteLoot('relic', it);
    return `Bag full: ${r.name} salvaged for ${d} dust`;
  }
  const first = !save.relics[it.id];
  addItem(it);
  if (save.worn.length < relicSlots() && !wornRelics().some(o => o.id === it.id)) save.worn.push(it.uid);
  noteLoot('relic', it);
  return first ? `New relic: ${r.name}!` : `${r.name} · ${it.aff.length} affix${it.aff.length > 1 ? 'es' : ''}`;
}

// ---------- old saves ----------

// Saves from before the bag kept one level per relic (save.relics: id -> level). Each becomes an
// item at that level with fresh affixes, rolled at the level of the best world and tier cleared.
function migrateRelics() {
  if (save.itemsVersion >= 1) return;
  const ilvl = Math.max(1, ...WORLDS.map(w => (save.tiers[w.id] ?? -1) < 0 ? 0 : save.tiers[w.id] + Math.log(w.hpMult) / Math.log(TIER.hp)));
  const oldWorn = save.worn.slice();
  save.worn = [];
  for (const id in save.relics) {
    const L = save.relics[id];
    if (!RELIC_BY_ID[id] || typeof L !== 'number' || L < 1) continue;
    const it = addItem(makeItem(id, ilvl, Math.min(RELIC_MAX, L)));
    if (oldWorn.includes(id)) save.worn.push(it.uid);
  }
  save.itemsVersion = 1;
  writeSave();
}
migrateRelics();
