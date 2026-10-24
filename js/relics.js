'use strict';
// Relics and perk evolutions: the loot of the harder tiers, instead of gear.
// Relics change how you play. You collect them and wear two in a run (three once Frozen Crypt is
// cleared on Hell). They drop from elites and bosses from Hard up, from the Iron Citadel's chests and
// at the milestones of The Depths; a duplicate raises a relic's level, up to RELIC_MAX.
// Evolutions: with both perks of a recipe maxed in a run, the next perk choice offers to merge them
// into one stronger perk. Recipes drop the same way relics do.

const RELIC_MAX = 5;
const RELICS = [
  { id: 'stillwater', name: 'Still Water', rarity: 'common', icon: 'r_water',
    desc: L => `Stand still for ${stillWaterTime(L).toFixed(1)} s and a bubble of water stops the next hit` },
  { id: 'ricostone', name: 'Ricochet Stone', rarity: 'common', icon: 'r_stone',
    desc: L => `A shot that hits a wall bounces on to the nearest enemy with ${50 + 10 * L}% damage` },
  { id: 'emberboots', name: 'Ember Boots', rarity: 'common', icon: 'r_boots',
    desc: L => `You leave burning footprints: ${+(0.3 + 0.1 * L).toFixed(1)}× your shot damage a second to enemies in them` },
  { id: 'thornring', name: 'Thorn Ring', rarity: 'common', icon: 'r_thorns',
    desc: L => `When you get hit, ${5 + L} thorns fly out, each as strong as a shot` },
  { id: 'corebreaker', name: 'Core Breaker', rarity: 'rare', icon: 'r_hammer',
    desc: L => `×${+(1.75 + 0.25 * L).toFixed(2)} damage to power cores and shield crystals, and ${20 + 10 * L}% of a shot gets past a Shielded enemy's shield`,
    mod: (s, L) => { s.coreBreak = 1.75 + 0.25 * L; s.shieldPierce = 0.2 + 0.1 * L; } },
  { id: 'luckycoin', name: 'Lucky Coin', rarity: 'rare', icon: 'r_coin',
    desc: L => `Every perk choice after a room has 3 cards. +${4 * L}% gold`,
    mod: (s, L) => { s.threeCards = 1; s.gold += 0.04 * L; } },
  { id: 'sandglass', name: 'Sand Glass', rarity: 'rare', icon: 'r_sand',
    desc: L => `Your ability recharges ${8 + 4 * L}% faster`,
    mod: (s, L) => { s.abilityCd *= 1 - (0.08 + 0.04 * L); } },
  { id: 'huntermark', name: "Hunter's Mark", rarity: 'rare', icon: 'r_mark',
    desc: L => `The first hit on every enemy deals +${40 + 20 * L}% damage`,
    mod: (s, L) => { s.firstHit = 1.4 + 0.2 * L; } },
  { id: 'glassheart', name: 'Glass Heart', rarity: 'epic', icon: 'r_glass',
    desc: L => `×${+(1.9 + 0.1 * L).toFixed(1)} damage, but only half your max HP`,
    mod: (s, L) => { s.dmgMul *= 1.9 + 0.1 * L; s.glass = 1; } },
  { id: 'stormtotem', name: 'Storm Totem', rarity: 'legendary', icon: 'r_totem',
    desc: L => `Every ${11 - L}th kill sends lightning that jumps between 5 enemies, ${+(1.5 + 0.25 * L).toFixed(2)}× your shot damage each` },
];
const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]));
const stillWaterTime = L => 2.4 - 0.2 * L;

// Evolutions are perks of their own (in PERK_BY_ID, never rolled like the others).
const EVOLUTIONS = [
  { id: 'lance', name: 'Laser Lance', from: ['front', 'pierce'], icon: 'e_lance',
    desc: 'Your shots ahead become one beam that goes through everything in its way', mod: s => { s.lance = 1; } },
  { id: 'plasma', name: 'Plasma', from: ['flame', 'chain'], icon: 'e_plasma',
    desc: 'Chain lightning sets everything it hits on fire, and jumps further', mod: s => { s.plasma = 1; } },
  { id: 'bladestorm', name: 'Blade Storm', from: ['blades', 'guard'], icon: 'e_blades',
    desc: 'Your blades also stop enemy shots, and the orbs cut enemies too', mod: s => { s.bladestorm = 1; } },
  { id: 'zero', name: 'Absolute Zero', from: ['frost', 'timewarp'], icon: 'e_zero',
    desc: 'Frozen enemies take 40% more damage, and shatter when they die, freezing the ones next to them', mod: s => { s.zero = 1; } },
];
for (const ev of EVOLUTIONS) {
  Object.assign(ev, { rarity: 'evolution', max: 1, evo: true });
  PERK_BY_ID[ev.id] = ev;
}

// ---------- the collection ----------

const relicLevel = id => save.relics[id] || 0;
const relicSlots = () => ((save.tiers.crypt ?? -1) >= 3 ? 3 : 2);
// What a run starts with: the relics worn, at the level they have now.
const wornRelics = () => save.worn.filter(id => relicLevel(id) > 0).slice(0, relicSlots()).map(id => ({ id, L: relicLevel(id) }));
const runRelic = (p, id) => { const r = p.relics && p.relics.find(x => x.id === id); return r ? r.L : 0; };

function toggleRelic(id) {
  const i = save.worn.indexOf(id);
  if (i >= 0) save.worn.splice(i, 1);
  else if (relicLevel(id) > 0) {
    if (save.worn.length >= relicSlots()) save.worn.shift();   // the oldest one comes off
    save.worn.push(id);
  }
  writeSave();
}

// ---------- drops ----------

// Rarer relics get likelier with the tier (or the depth).
function rollRelic(tier) {
  const t = Math.min(tier, 10);
  const boost = { common: 1, rare: 1 + 0.15 * t, epic: 1 + 0.3 * t, legendary: 1 + 0.5 * t };
  const open = RELICS.filter(r => relicLevel(r.id) < RELIC_MAX);
  if (!open.length) return null;
  const rars = Object.keys(boost).filter(r => open.some(x => x.rarity === r));
  const rar = weightedPick(rars, r => RARITY[r].weight * boost[r]);
  return pick(open.filter(x => x.rarity === rar));
}

// The chance of a drop: elites and bosses from Hard up, the Iron Citadel's chests on every tier,
// a milestone of The Depths always. In The Depths the tier is the depth, so it has its own odds.
function relicChance(src) {
  const t = G.tier, deep = !!G.world.depth;
  if (src === 'milestone') return 1;
  if (src === 'chest') return Math.min(0.08, 0.03 + 0.01 * t);
  if (deep) return src === 'boss' ? 0.15 : 0.04;
  if (t < 1) return 0;
  return src === 'boss' ? Math.min(1, 0.4 + 0.15 * t) : Math.min(0.25, 0.06 + 0.03 * t);
}

// Maybe drop a relic or a recipe where something died (or a chest opened).
function maybeDropRelic(src, x, y) {
  if (Math.random() >= relicChance(src)) return;
  const locked = EVOLUTIONS.filter(ev => !save.recipes[ev.id]);
  if (locked.length && Math.random() < 0.25) {
    dropPickup('recipe', x, y, pick(locked).id);
    return;
  }
  const r = rollRelic(G.world.depth ? Math.floor(G.world.depth / 2) : G.tier);
  if (r) dropPickup('relic', x, y, r.id);
}

// Picked up: it goes into the collection at once, so it is kept even if the run is lost.
function collectRelic(k, p) {
  let text, color;
  if (k.kind === 'recipe') {
    save.recipes[k.value] = true;
    const ev = PERK_BY_ID[k.value];
    text = `Recipe found: ${ev.name}!`;
    color = RARITY.evolution.color;
  } else {
    const r = RELIC_BY_ID[k.value], L = Math.min(RELIC_MAX, relicLevel(r.id) + 1);
    save.relics[r.id] = L;
    if (L === 1 && save.worn.length < relicSlots()) save.worn.push(r.id);
    text = L === 1 ? `Relic found: ${r.name}!` : `${r.name} is now level ${L}!`;
    color = RARITY[r.rarity].color;
  }
  writeSave();
  track('relic');
  FX.text(p.x, p.y - 40, text, color, 12, { life: 1.8, pop: 0.5 });
  FX.ring(p.x, p.y, 40, color, 0.6, 6);
  Sound.play('perk');
  UI.toast(text);
}

// ---------- in the run ----------

// Recipes found whose two perks are both maxed in this run, and not merged yet.
function readyEvolutions(p) {
  return EVOLUTIONS.filter(ev => save.recipes[ev.id] && !p.perks[ev.id] && ev.from.every(id => (p.perks[id] || 0) >= PERK_BY_ID[id].max));
}

// Still Water's bubble and Ember Boots' footprints.
function updateRelics(p, dt) {
  const still = runRelic(p, 'stillwater');
  if (still && !p.waterUp && p.stillT >= stillWaterTime(still) && G.state === 'play') {
    p.waterUp = true;
    FX.ring(p.x, p.y, 24, '#5fd2ff', 0.4, 4);
  }
  const ember = runRelic(p, 'emberboots');
  if (ember && p.moving && !G.cleared) {
    p.emberT = (p.emberT || 0) - dt;
    if (p.emberT <= 0) {
      p.emberT = 0.2;
      G.zones.push({ x: p.x, y: p.y + 6, r: 13, life: 1.6, max: 1.6, dmg: 0, owner: 'player', color: '#ff8a2a', burn: playerAtk(p) * p.s.dmgMul * (0.3 + 0.1 * ember) });
    }
  }
}

// Footprints burn enemies standing in them (each enemy at most twice a second).
function updatePlayerZones(dt) {
  for (const z of G.zones) {
    if (z.owner !== 'player') continue;
    for (const e of G.enemies) {
      if (!canTarget(e) || (e.emberT || 0) > G.time || e.flying || dist(z.x, z.y, e.x, e.y) > z.r + e.r) continue;
      e.emberT = G.time + 0.5;
      hurtEnemy(e, z.burn * 0.5, { color: '#ff9a3c', small: true, dot: true });
    }
  }
}

// Called when a hit is about to land on you: Still Water may take it instead.
function relicBlocks(p) {
  if (!p.waterUp) return false;
  p.waterUp = false;
  p.stillT = 0;
  p.invuln = 0.5;
  FX.ring(p.x, p.y, 30, '#5fd2ff', 0.4, 5);
  FX.burst(p.x, p.y, ['#5fd2ff', '#ffffff'], 12, { min: 50, max: 140 });
  Sound.play('shield');
  return true;
}

// After a hit that hurt: Thorn Ring.
function relicHurt(p) {
  const L = runRelic(p, 'thornring');
  if (!L) return;
  const n = 5 + L, dmg = playerAtk(p) * p.s.dmgMul, a0 = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n;
    G.shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 4, dmg, kind: 'thorn', pierce: 0, bounce: 0, ric: 0, hit: [], life: 0.9 });
  }
}

// A shot that is about to stop at a wall: Ricochet Stone sends it on (once) at the nearest enemy.
function relicWallBounce(b) {
  const L = runRelic(G.player, 'ricostone');
  if (!L || b.stoned || b.boomerang || b.lob) return false;
  let best = null, bd = 220 * 220;
  for (const e of G.enemies) {
    if (!canTarget(e) || b.hit.includes(e.id)) continue;
    const d = dist2(b.x, b.y, e.x, e.y);
    if (d < bd && lineClear(b.x, b.y, e.x, e.y, false)) { bd = d; best = e; }
  }
  if (!best) return false;
  const sp = Math.hypot(b.vx, b.vy), a = angleTo(b.x, b.y, best.x, best.y);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  b.dmg *= 0.5 + 0.1 * L;
  b.stoned = true;
  b.life = Math.max(b.life, 0.8);
  FX.burst(b.x, b.y, ['#c9bfa9', '#ffffff'], 3, { type: 'spark', min: 40, max: 100 });
  return true;
}

// Extra damage from relics and evolutions on any hit (Core Breaker, Absolute Zero), and on the
// first shot that hits an enemy (Hunter's Mark).
function relicDamage(e, d) {
  const s = G.player.s;
  if (s.coreBreak && (e.type === 'core' || e.type === 'crystal')) d *= s.coreBreak;
  if (s.zero && e.status.freeze > 0) d *= 1.4;
  return d;
}
function markDamage(e, d) {
  const s = G.player.s;
  if (s.firstHit && !e.marked && !e.boss) { e.marked = true; d *= s.firstHit; }
  return d;
}

// After a kill: Storm Totem counts kills, Absolute Zero shatters the frozen.
function relicKill(e) {
  const p = G.player, s = p.s;
  if (s.zero && e.status.freeze > 0) {
    FX.burst(e.x, e.y, ['#bff1ff', '#ffffff', '#7fdcff'], 16, { min: 60, max: 180 });
    FX.ring(e.x, e.y, 70, '#bff1ff', 0.4, 5);
    Sound.play('freeze');
    for (const o of G.enemies) {
      if (o === e || !canTarget(o) || o.boss || dist(o.x, o.y, e.x, e.y) > 70 + o.r) continue;
      o.status.freeze = Math.max(o.status.freeze, o.elite ? 0.5 : 1);
      o.status.slow = 2;
    }
  }
  const L = runRelic(p, 'stormtotem');
  if (!L || e.def.harmless) return;
  p.totemKills = (p.totemKills || 0) + 1;
  if (p.totemKills < 11 - L) return;
  p.totemKills = 0;
  const dmg = playerAtk(p) * s.dmgMul * (1.5 + 0.25 * L);
  let fx = e.x, fy = e.y;
  const hit = [];
  for (let k = 0; k < 5; k++) {
    let best = null, bd = 170 * 170;
    for (const o of G.enemies) {
      if (!canTarget(o) || hit.includes(o)) continue;
      const d = dist2(fx, fy, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) break;
    hit.push(best);
    FX.bolt(fx, fy, best.x, best.y, '#9fe8ff', 2.4);
    hurtEnemy(best, dmg, { color: '#9fe8ff' });
    fx = best.x; fy = best.y;
  }
  if (hit.length) { Sound.play('zap'); FX.text(e.x, e.y - 24, 'Storm!', '#9fe8ff', 11); }
}

// Laser Lance: one beam instead of the shots side by side, through everything up to the first wall.
function fireLance(p, a, dmg) {
  const len = rayLength(p.x, p.y - 2, a, 460);
  const dx = Math.cos(a), dy = Math.sin(a);
  const b = { x: 0, y: 0, vx: dx * 400, vy: dy * 400, r: 6, dmg, main: true, hit: [], kind: 'lance' };
  for (const e of G.enemies) {
    if (!canTarget(e)) continue;
    const ex = e.x - p.x, ey = e.y - (e.z || 0) - (p.y - 2);
    const along = ex * dx + ey * dy;
    if (along < 0 || along > len || Math.abs(ex * dy - ey * dx) > 8 + e.r) continue;
    b.x = e.x; b.y = e.y;
    shotHits(b, e);
  }
  G.abilityFx.push({ kind: 'lance', x: p.x, y: p.y - 2, a, len, t: 0.14, max: 0.14 });
}
