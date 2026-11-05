'use strict';
// Loot: the materials every monster can drop (they upgrade relics), the Hoarder (a rare treasure
// monster that runs away with its sack) and how loot looks and sounds when it falls: a beam of
// light in the colour of its rarity, a name over relics, a sound per rarity, and a list of
// everything found at the end of the run.

// Relic Dust drops from anything; Star Shards from elites, bosses and the Hoarder.
const MATERIALS = {
  dust:  { name: 'Relic Dust', color: '#c9a9ff', rarity: 'rare' },
  shard: { name: 'Star Shard', color: '#ffcf3f', rarity: 'legendary' },
};

// ---------- what monsters drop ----------

// Loot level for amounts: harder worlds and tiers give more, but The Depths can't run away with it.
const matLevel = () => Math.min(8, lootLevel());

function dropMaterials(e) {
  const L = matLevel();
  if (e.boss) {
    dropDust(e.x, e.y, Math.round(10 + 4 * L));
    dropPickup('shard', e.x, e.y, 1 + Math.floor(L / 2));
  } else if (e.elite) {
    dropDust(e.x, e.y, Math.round(rand(3, 5) + L));
    if (!e.noGems && Math.random() < Math.min(0.6, 0.15 + 0.08 * L)) dropPickup('shard', e.x, e.y, 1);
  } else if (Math.random() < Math.min(0.6, 0.25 * (1 + 0.15 * L))) {
    dropDust(e.x, e.y, 1 + (Math.random() < 0.1 * L ? 1 : 0));
  }
}

// Dust falls in a few little piles, like coins.
function dropDust(x, y, total) {
  const n = Math.min(6, Math.max(1, Math.ceil(total / 3)));
  let left = total;
  for (let i = 0; i < n && left > 0; i++) {
    const v = i === n - 1 ? left : Math.max(1, Math.round(total / n));
    left -= v;
    dropPickup('dust', x, y, v);
  }
}

// How rare a pickup is (for its beam, label and sound), or null for coins, hearts and dust.
function lootRarity(k) {
  if (k.kind === 'relic') return RELIC_BY_ID[k.value].rarity;
  if (k.kind === 'recipe') return 'evolution';
  if (k.kind === 'shard') return 'legendary';
  if (k.kind === 'gem') return 'rare';
  return null;
}
// The name shown over a pickup on the floor.
function lootLabel(k) {
  if (k.kind === 'relic') return RELIC_BY_ID[k.value].name;
  if (k.kind === 'recipe') return `Recipe: ${PERK_BY_ID[k.value].name}`;
  if (k.kind === 'shard') return k.value > 1 ? `${k.value} Star Shards` : 'Star Shard';
  return null;
}

// Something worth seeing fell: a sound for its rarity, and a flash where it landed.
function lootDropped(k) {
  const rar = lootRarity(k);
  if (!rar || k.kind === 'gem') return;
  const R = RARITY[rar];
  Sound.play('loot' + Math.min(4, R.rank + 1));
  FX.ring(k.x, k.y, 30 + R.rank * 10, R.color, 0.5, 4);
  FX.burst(k.x, k.y, [R.color, '#ffffff'], 8 + R.rank * 6, { angle: -Math.PI / 2, spread: 1.4, min: 60, max: 180 });
  if (R.rank >= 3) FX.kick(4);
}

// Picked up: materials count for the run, and are kept even if the run is lost (like gold).
function collectMaterial(k, p) {
  const m = MATERIALS[k.kind];
  G.run[k.kind] = (G.run[k.kind] || 0) + k.value;
  if (k.kind === 'shard') {
    Sound.play('gem');
    FX.text(p.x, p.y - 34, `+${k.value} ${m.name}${k.value > 1 ? 's' : ''}`, m.color, 11);
  } else {
    Sound.play('dust');
    FX.burst(k.x, k.y, m.color, 2, { min: 20, max: 60 });
  }
}

// Relics and recipes found in this run, for the list at the end.
function noteLoot(kind, id, L) {
  (G.run.loot = G.run.loot || []).push({ kind, id, L });
}

// ---------- upgrading relics with materials ----------

const RELIC_DUST = { common: 25, rare: 40, epic: 60, legendary: 90 };
// What the next level of a relic costs, or null when it is not found yet or maxed.
function relicUpgradeCost(id) {
  const L = relicLevel(id);
  if (!L || L >= RELIC_MAX) return null;
  return { dust: RELIC_DUST[RELIC_BY_ID[id].rarity] * L, shards: L - 1 };
}
const canUpgradeRelic = id => {
  const c = relicUpgradeCost(id);
  return !!c && save.dust >= c.dust && save.shards >= c.shards;
};
function upgradeRelic(id) {
  if (!canUpgradeRelic(id)) return false;
  const c = relicUpgradeCost(id);
  save.dust -= c.dust;
  save.shards -= c.shards;
  save.relics[id]++;
  writeSave();
  return true;
}

// ---------- the Hoarder ----------

// Now and then a normal room hides a Hoarder. It shows up a little after the room starts, never
// fights, runs from you and is gone after HOARDER_TIME seconds. Hits shake coins out of its sack;
// catch it and it bursts with gold, gems, materials and maybe a relic.
const HOARDER_CHANCE = 0.08, HOARDER_TIME = 12;

function planHoarder() {
  G.hoarderT = 0;
  if (G.roomType !== 'normal' || G.world.fort || G.roomIdx < 2) return;
  if (Math.random() < HOARDER_CHANCE) G.hoarderT = rand(1.5, 4);
}

function updateHoarderPlan(dt, p) {
  if (!G.hoarderT || G.cleared) return;
  G.hoarderT -= dt;
  if (G.hoarderT > 0) return;
  G.hoarderT = 0;
  spawnHoarder(p);
}

function spawnHoarder(p) {
  const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 150, maxDist: 320, fit: ENEMIES.hoarder.r });
  const e = spawnEnemy('hoarder', spot.x, spot.y, { spawnT: 0.5 });
  e.life = HOARDER_TIME;
  e.nextCoin = 0.85;
  FX.ring(spot.x, spot.y, 40, '#ffcf3f', 0.6, 5);
  FX.burst(spot.x, spot.y, ['#ffcf3f', '#ffffff'], 18, { min: 40, max: 160 });
  Sound.play('hoarder');
  UI.toast('A Hoarder! Catch it before it gets away!');
  return e;
}

// Somewhere to run to: far from the hero, and not past them.
function fleeSpot(e, p) {
  let best = null, bestScore = -Infinity;
  const ax = e.x - p.x, ay = e.y - p.y;
  for (let i = 0; i < 10; i++) {
    const s = randomOpenSpot({ fromX: e.x, fromY: e.y, minDist: 70, maxDist: 260, fit: e.r });
    const away = (s.x - e.x) * ax + (s.y - e.y) * ay >= 0;   // on the far side from the hero
    const score = dist(s.x, s.y, p.x, p.y) + (away ? 200 : 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

// Run from the hero: to an open spot far from them, a new one when they come close.
AI.hoarder = (e, dt, p) => {
  e.life -= dt;
  if (e.life <= 0) {
    FX.ring(e.x, e.y, 30, '#ffcf3f', 0.5, 5);
    FX.burst(e.x, e.y, ['#ffcf3f', '#c9a9ff', '#ffffff'], 20, { min: 40, max: 150 });
    FX.text(e.x, e.y - 30, 'Got away!', '#ffcf3f', 12, { life: 1.2 });
    Sound.play('blink');
    e.dead = true;   // gone, not killed: no loot
    return;
  }
  e.t -= dt;
  const near = dist(e.x, e.y, p.x, p.y) < 110;
  if (!e.dest || e.t <= 0 || dist(e.x, e.y, e.dest.x, e.dest.y) < 10 || (near && dist(e.dest.x, e.dest.y, p.x, p.y) < 160)) {
    e.dest = fleeSpot(e, p);
    e.t = rand(0.8, 1.4);
  }
  walkTo(e, e.dest.x, e.dest.y, e.speed * e.slowK * (near ? 1.15 : 1), dt);
  e.look = angleTo(e.x, e.y, e.dest.x, e.dest.y);
  e.alpha = e.life < 2.5 ? 0.55 + 0.45 * Math.abs(Math.sin(e.life * 10)) : 1;
  // every tenth of its HP lost shakes a few coins out
  while (e.hp <= e.maxHp * e.nextCoin && e.nextCoin > 0) {
    e.nextCoin -= 0.15;
    dropCoins(e.x, e.y, Math.round(3 * G.world.coinMult * TIER.gold ** G.tier));
    Sound.play('coin');
  }
};

// Caught: the sack bursts.
function hoarderLoot(e) {
  const L = matLevel(), gold = Math.round(40 * G.world.coinMult * TIER.gold ** G.tier * (1 + G.player.s.gold));
  dropCoins(e.x, e.y, gold);
  dropPickup('gem', e.x, e.y, 2 + Math.floor(L / 2));
  dropDust(e.x, e.y, Math.round(12 + 4 * L));
  dropPickup('shard', e.x, e.y, 1 + Math.floor(L / 3));
  if (Math.random() < 0.3) dropPickup('heart', e.x, e.y, 0.3);
  maybeDropRelic('hoarder', e.x, e.y);
  FX.ring(e.x, e.y, 60, '#ffcf3f', 0.7, 6);
  FX.kick(6);
  Sound.play('loot3');
  track('hoarder');
}

// ---------- drawing ----------

// A beam of light over rare loot, so it is seen from across the room.
function drawLootBeam(ctx, k, t) {
  const rar = lootRarity(k);
  if (!rar) return;
  const R = RARITY[rar], h = k.kind === 'gem' ? 26 : 50 + R.rank * 16, w = k.kind === 'gem' ? 4 : 7 + R.rank * 2;
  const a = (k.kind === 'gem' ? 0.35 : 0.55) * (0.8 + 0.2 * Math.sin(t * 4 + k.seed)) * Math.min(1, k.t * 3);
  const g = ctx.createLinearGradient(0, k.y, 0, k.y - h);
  g.addColorStop(0, R.color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(k.x - w / 2, k.y);
  ctx.lineTo(k.x - w * 0.3, k.y - h);
  ctx.lineTo(k.x + w * 0.3, k.y - h);
  ctx.lineTo(k.x + w / 2, k.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The name over a relic, recipe or shard on the floor.
function drawLootLabel(ctx, k, y) {
  const str = lootLabel(k);
  if (!str) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k.t * 2.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `9px ${FONT}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = OL;
  ctx.strokeText(str, k.x, y - 20);
  ctx.fillStyle = RARITY[lootRarity(k)].color;
  ctx.fillText(str, k.x, y - 20);
  ctx.restore();
}

function drawDust(ctx, x, y, t, seed) {
  const s = 3.2 + Math.sin(t * 6 + seed) * 0.5;
  glow(ctx, x, y, 12, MATERIALS.dust.color, 0.6);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, r = i % 2 ? s * 0.45 : s;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  fs(ctx, '#e6d8ff', 1.2);
}

function drawShard(ctx, x, y, t) {
  glow(ctx, x, y, 22, MATERIALS.shard.color, 0.8);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 3) * 0.15);
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(3.5, -1); ctx.lineTo(1.5, 7); ctx.lineTo(-1.5, 7); ctx.lineTo(-3.5, -1);
  ctx.closePath();
  fs(ctx, '#ffe58a', 1.6);
  line(ctx, 0, -7, 0, 6, 'rgba(255,255,255,0.6)', 1);
  shine(ctx, -1.2, -3, 0.8, 2, 0.8, 0.2);
  ctx.restore();
}

// A little hunched thief with a big sack of gold on its back.
ENEMY_ART.hoarder = (ctx, e, t) => {
  const P = e.pal, run = e.moving ? Math.sin(t * 22 + e.seed) : 0;
  const face = Math.cos(e.look) < 0 ? -1 : 1;
  // feet
  for (const s of [-1, 1]) { ell(ctx, s * 4 + run * s * 2, 9, 3, 2); fs(ctx, P.dark, 1.5); }
  // the sack, behind
  ctx.save();
  ctx.translate(-face * 5, -6 + Math.abs(run) * -1.5);
  ell(ctx, 0, 0, 9.5, 9); fs(ctx, '#c8a26a');
  ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(0, -12); ctx.lineTo(3, -8); fs(ctx, '#c8a26a', 1.5);
  line(ctx, -3.5, -7.5, 3.5, -7.5, OL, 1.5);
  for (const [cx, cy] of [[-3, -1], [3, 2], [0, 5]]) { circ(ctx, cx, cy, 2.2); fs(ctx, '#ffcf3f', 1.2); }
  shine(ctx, -4, -3, 2, 1.4, 0.5);
  ctx.restore();
  // body
  ell(ctx, face * 2, 1, 7.5, 8); fs(ctx, P.main);
  // big ears
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(face * 2 + s * 5, -4); ctx.lineTo(face * 2 + s * 12, -9); ctx.lineTo(face * 2 + s * 6, 0);
    fs(ctx, P.main, 1.5);
  }
  eyes(ctx, face * 3.5, -1, 2.8, 2, e.look, { pupil: 0.6 });
  // a sly grin
  ctx.beginPath(); ctx.arc(face * 3.5, 3, 2.4, 0.3, Math.PI - 0.3);
  ctx.strokeStyle = OL; ctx.lineWidth = 1.3; ctx.stroke();
  // coins glinting
  if (Math.sin(t * 7 + e.seed) > 0.85) glow(ctx, -face * 5, -10, 10, '#fff6c2', 0.9);
};
