'use strict';
// Affixes: extra traits that elites get from the Hard tier and up, and some normal enemies from
// Nightmare (tierAffixes in config.js). Each is a flag in e.aff, checked where it matters.

const AFFIXES = {
  fast:      { name: 'Fast',      color: '#ffd35a' },
  explosive: { name: 'Explosive', color: '#ff8a2a' },
  mirror:    { name: 'Mirror',    color: '#e8f0ff' },
  shielded:  { name: 'Shielded',  color: '#6fb0ff' },
  blinking:  { name: 'Blinking',  color: '#c06bff' },
  toxic:     { name: 'Toxic',     color: '#7be05a' },
  frost:     { name: 'Frost',     color: '#7fdcff' },
  summoner:  { name: 'Summoner',  color: '#ff6ad5' },
  chained:   { name: 'Chained',   color: '#c9c9d6' },
};

// Some traits make no sense on some enemies (a wisp that already explodes, an imp that already blinks).
function affixFits(e, id) {
  const ai = e.def.ai;
  if (id === 'explosive') return ai !== 'bomber';
  if (id === 'blinking') return ai !== 'blinker';
  if (id === 'shielded') return ai !== 'blinker' && ai !== 'bomber';
  return true;
}

function addAffixes(e, n) {
  const pool = Object.keys(AFFIXES).filter(id => !e.aff[id] && affixFits(e, id));
  for (let i = 0; i < n && pool.length; i++) {
    const id = pool.splice(randInt(0, pool.length - 1), 1)[0];
    e.aff[id] = true;
    e.affList.push(id);
  }
  if (e.aff.fast) e.haste = e.boss ? 1.2 : 1.4;
  if (e.aff.shielded) e.shieldAng = e.look;
  if (e.aff.chained) e.links = [];
}

// Elites (and on higher tiers some normal enemies) of a freshly spawned room get their traits.
function giveRoomAffixes() {
  const rules = tierAffixes(G.tier);
  for (const e of G.enemies) {
    if (e.boss || e.def.harmless) continue;
    if (e.elite) addAffixes(e, rules.elite);
    else if (Math.random() < rules.normal) addAffixes(e, 1);
  }
}

function updateAffixes(e, dt, p) {
  if (e.aff.shielded) {
    // the shield turns towards you, but slowly: walk round it
    e.shieldAng += clamp(angleDiff(e.shieldAng, angleTo(e.x, e.y, p.x, p.y)), -1.3 * dt, 1.3 * dt);
  }
  if (e.aff.toxic) {
    e.toxicT = (e.toxicT || 0) - dt;
    if (e.toxicT <= 0) {
      e.toxicT = 0.5;
      G.zones.push({ x: e.x, y: e.y + 3, r: 13, life: 3.5, max: 3.5, dmg: Math.round(e.dmg * 0.35), color: '#7be05a' });
    }
  }
  if (e.aff.summoner) {
    e.summonT = (e.summonT ?? 4) - dt;
    if (e.summonT <= 0) {
      e.summonT = 10;
      summonHelpers(e);
    }
  }
  if (e.aff.chained) updateChains(e, dt, p);
}

// Summoner: two small enemies of the world's first kind, at most four alive at a time.
function summonHelpers(e) {
  const alive = G.enemies.filter(o => o.summonedBy === e.id && !o.dead).length;
  const type = G.world.enemies[0];
  for (let i = 0; i < Math.min(2, 4 - alive); i++) {
    const spot = randomOpenSpot({ fromX: e.x, fromY: e.y, minDist: 30, maxDist: 90, ground: !ENEMIES[type].flying });
    const m = spawnEnemy(type, spot.x, spot.y, { spawnT: 0.6 });
    m.summonedBy = e.id;
    m.noLoot = true;
    FX.burst(spot.x, spot.y, [AFFIXES.summoner.color, '#ffffff'], 8, { min: 30, max: 100 });
  }
  FX.ring(e.x, e.y, e.r * 2.4, AFFIXES.summoner.color, 0.4, 4);
  Sound.play('blink');
}

// Chained: a chain to up to two nearby enemies that hurts you if you touch it.
const CHAIN_LEN = 220;
function updateChains(e, dt, p) {
  e.chainT = (e.chainT || 0) - dt;
  if (e.chainT <= 0) {
    e.chainT = 1;
    e.links = e.links.filter(o => !o.dead && dist(e.x, e.y, o.x, o.y) < CHAIN_LEN);
    const near = G.enemies
      .filter(o => o !== e && !o.dead && !o.boss && !o.decoy && !o.def.harmless && !e.links.includes(o) && !(o.links && o.links.includes(e)))
      .sort((a, b) => dist2(e.x, e.y, a.x, a.y) - dist2(e.x, e.y, b.x, b.y));
    for (const o of near) {
      if (e.links.length >= 2 || dist(e.x, e.y, o.x, o.y) >= CHAIN_LEN) break;
      e.links.push(o);
    }
  }
  if (e.spawnT > 0 || e.hidden) return;
  for (const o of e.links) {
    if (o.dead || o.spawnT > 0 || o.hidden || dist(e.x, e.y, o.x, o.y) >= CHAIN_LEN) continue;
    // distance from the player to the chain
    const dx = o.x - e.x, dy = o.y - e.y, len2 = dx * dx + dy * dy || 1;
    const k = clamp(((p.x - e.x) * dx + (p.y - e.y) * dy) / len2, 0, 1);
    if (dist(p.x, p.y, e.x + dx * k, e.y + dy * k) < 5 + p.r) hurtPlayer(Math.round(e.dmg * 0.6));
  }
}

// Blinking: jumps away when it drops below 75%, 50% and 25% HP.
function blinkIfHurt(e) {
  e.blinkAt = e.blinkAt ?? 0.75;
  if (e.hp > e.maxHp * e.blinkAt) return;
  e.blinkAt -= 0.25;
  const p = G.player;
  FX.burst(e.x, e.y, [AFFIXES.blinking.color, '#ffffff'], 10, { min: 30, max: 110 });
  const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 110, maxDist: 240, ground: !e.flying, fit: e.flying ? 0 : e.r });
  e.x = spot.x; e.y = spot.y;
  e.kbx = e.kby = 0;
  FX.burst(e.x, e.y, [AFFIXES.blinking.color, '#ffffff'], 10, { min: 30, max: 110 });
  Sound.play('blink');
}

// Shielded blocks shots from the front; Mirror sends every fifth hit back at you.
// A Rock Tortoise's shell (or a Shieldbearer's shield) from the front only lets 30% of the damage through.
// A bomb going off (b.blast) comes from above and gets past both.
const shellHit = (b, e) => e.def.shell && !e.shellOpen && !b.blast && Math.abs(angleDiff(e.look, Math.atan2(-b.vy, -b.vx))) < 1.05;

function shotBlocked(b, e) {
  if (e.aff.shielded && !b.blast && Math.abs(angleDiff(e.shieldAng, Math.atan2(-b.vy, -b.vx))) < 0.95) return true;
  if (e.aff.mirror && b.main) {
    e.mirrorN = (e.mirrorN || 0) + 1;
    if (e.mirrorN % 5 === 0) {
      enemyShot(e, Math.atan2(-b.vy, -b.vx), 'orb', 230);
      FX.ring(e.x, e.y, e.r * 1.8, AFFIXES.mirror.color, 0.3, 3);
      return true;
    }
  }
  return false;
}

// Explosive: a ring of fire when it dies.
function affixExplode(e) {
  ringShot(e, 10, 'fire', 120, rand(0, TAU));
  FX.ring(e.x, e.y, e.r * 3, AFFIXES.explosive.color, 0.4, 5);
  FX.kick(4);
}

// ---------- drawing ----------

// Under the enemy: a dashed ring in the colour of its first trait, and the front shield.
function drawAffixAura(ctx, e, t) {
  if (e.spawnT > 0 || e.hidden) return;
  const c = AFFIXES[e.affList[0]].color;
  ctx.save();
  ctx.translate(e.x, e.y + e.r * 0.55);
  ctx.scale(1, 0.45);
  ctx.rotate(t * 1.5);
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(0, 0, e.r * 1.35, 0, TAU);
  ctx.strokeStyle = rgba(c, 0.85);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  if (e.aff.shielded) {
    const y = e.y - (e.z || 0);
    ctx.beginPath(); ctx.arc(e.x, y, e.r + 7, e.shieldAng - 0.95, e.shieldAng + 0.95);
    ctx.strokeStyle = OL; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = AFFIXES.shielded.color; ctx.lineWidth = 4; ctx.stroke();
  }
}

// On the ground: the chains between Chained enemies and their partners.
function drawChains(ctx, e, t) {
  if (!e.links || e.spawnT > 0) return;
  for (const o of e.links) {
    if (o.dead || o.spawnT > 0 || dist(e.x, e.y, o.x, o.y) >= CHAIN_LEN) continue;
    const n = Math.max(2, Math.floor(dist(e.x, e.y, o.x, o.y) / 9));
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = lerp(e.x, o.x, k), y = lerp(e.y, o.y, k) + Math.sin(k * Math.PI) * 6;
      ell(ctx, x, y, 3.6, 2.4, Math.atan2(o.y - e.y, o.x - e.x) + (i % 2 ? Math.PI / 2 : 0));
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = i % 2 ? '#8f8fa3' : '#c9c9d6';
      ctx.stroke();
    }
  }
}

// Above an elite's health bar: the names of its traits.
function drawAffixNames(ctx, e, y) {
  const text = e.affList.map(id => AFFIXES[id].name).join(' · ');
  ctx.font = `8px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OL;
  ctx.strokeText(text, e.x, y);
  ctx.fillStyle = AFFIXES[e.affList[0]].color;
  ctx.fillText(text, e.x, y);
}
