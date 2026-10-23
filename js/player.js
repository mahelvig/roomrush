'use strict';
// The hero: movement, auto-aim, shooting, taking damage and companions.

function createPlayer(hero, perks) {
  const p = {
    hero, perks: Object.assign({}, perks || {}),
    x: DOOR_X, y: ROOM_Y + ROOM_H - 36, r: 10, vx: 0, vy: 0,
    aim: -Math.PI / 2, walk: 0, moving: false, stillT: 0, t: 0,
    cd: 0.4, volleys: [], recoil: 0, invuln: 0, flash: 0,
    shieldUp: false, shieldBurst: false, slowT: 0, hazardT: 0,
    target: null, targetT: 0, meteorT: 3, stormT: 2, livesUsed: 0, dead: false, abilityCd: 0,
  };
  p.s = computeStats(p);
  p.hp = p.s.maxHp;
  p.shieldUp = p.s.shield > 0;
  return p;
}

function refreshStats(p) {
  const oldMax = p.s.maxHp;
  const hadShield = p.s.shield > 0;
  p.s = computeStats(p);
  if (p.s.maxHp > oldMax) p.hp += p.s.maxHp - oldMax;
  p.hp = Math.min(p.hp, p.s.maxHp);
  if (!hadShield && p.s.shield > 0) p.shieldUp = true;
  syncHelpers(p);
}

const rageMult = p => 1 + p.s.rage * clamp(1 - p.hp / p.s.maxHp, 0, 1);
const playerAtk = p => p.s.atk * (1 + p.s.atkPct) * rageMult(p);

function canTarget(e) {
  return !e.dead && e.spawnT <= 0 && !e.hidden;
}

function findTarget(p) {
  let best = null, bestD = Infinity, bestBlocked = null, bestBD = Infinity, shielded = null;
  for (const e of G.enemies) {
    if (!canTarget(e)) continue;
    if (e.shielded) { shielded = e; continue; }   // a shielded boss only when nothing else is left
    const d = dist2(p.x, p.y, e.x, e.y);
    if (lineClear(p.x, p.y, e.x, e.y, false)) {
      if (d < bestD) { bestD = d; best = e; }
    } else if (d < bestBD) { bestBD = d; bestBlocked = e; }
  }
  return best || bestBlocked || shielded;
}

function updatePlayer(p, dt) {
  const s = p.s;
  p.t += dt;
  const v = G.state === 'play' ? Input.vector() : { x: 0, y: 0, mag: 0 };
  const spd = s.speed * (p.slowT > 0 ? 0.6 : 1);
  const tx = v.x * v.mag * spd, ty = v.y * v.mag * spd;
  const onIce = tileAt(p.x, p.y + 4) === TILE.ICE;
  const k = 1 - Math.exp(-(onIce ? 2.4 : 20) * dt);
  p.vx += (tx - p.vx) * k;
  p.vy += (ty - p.vy) * k;
  p.moving = v.mag > 0.05;
  let minY;
  if (G.doorOpen && Math.abs(p.x - DOOR_X) < DOOR_W / 2 - 6) minY = ROOM_Y - 40;
  moveEntity(p, p.vx * dt, p.vy * dt, true, minY);
  if (G.doorOpen && p.y < ROOM_Y - 4) { nextRoom(); return; }
  if (p.moving) { p.walk += dt * 7; p.stillT = 0; } else p.stillT += dt;
  if (onIce && Math.hypot(p.vx, p.vy) > 40 && Math.random() < dt * 20) FX.burst(p.x, p.y + 8, '#ffffff', 1, { min: 10, max: 30, life: 0.3 });
  else if (p.moving && Math.random() < dt * 6) FX.smoke(p.x - p.vx * 0.05, p.y + 8, 'rgba(255,255,255,0.5)', 1, 3);

  p.invuln = Math.max(0, p.invuln - dt);
  p.flash = Math.max(0, p.flash - dt);
  p.slowT = Math.max(0, p.slowT - dt);
  p.recoil = Math.max(0, p.recoil - dt * 6);
  if (p.shieldBurst) { p.shieldBurst = false; shieldBurst(p); }

  // floor hazards
  const tile = tileAt(p.x, p.y + 3);
  p.hazardT -= dt;
  if (tile === TILE.LAVA && p.hazardT <= 0) {
    p.hazardT = 0.45;
    hurtPlayer(Math.round(p.s.maxHp * 0.06 + 10 * G.world.dmgMult), { hazard: true });
    FX.burst(p.x, p.y + 6, ['#ff8a2a', '#ffd35a'], 6, { angle: -Math.PI / 2, spread: 0.8, min: 40, max: 100 });
  } else if (tile === TILE.SPIKES && spikePhase(G.time) === 'up' && p.hazardT <= 0) {
    p.hazardT = 0.6;
    hurtPlayer(Math.round(p.s.maxHp * 0.08 + 20 * G.world.dmgMult), { hazard: true });
  }

  // aim
  p.targetT -= dt;
  if (p.targetT <= 0 || (p.target && !canTarget(p.target))) {
    p.target = findTarget(p);
    p.targetT = 0.12;
  }
  if (p.target) {
    const want = angleTo(p.x, p.y, p.target.x, p.target.y - (p.target.z || 0));
    p.aim += angleDiff(p.aim, want) * Math.min(1, dt * 25);
  } else if (p.moving) {
    p.aim += angleDiff(p.aim, Math.atan2(v.y, v.x)) * Math.min(1, dt * 12);
  }

  // shooting (slower while moving)
  p.cd -= dt * s.rate * (p.moving ? s.moveRate : 1);
  if (p.cd <= 0) {
    if (p.target && G.state === 'play' && !G.cleared) {
      fireVolley(p, p.aim);
      for (let i = 1; i <= s.multishot; i++) p.volleys.push(i * 0.1);
      p.cd = s.interval;
    } else p.cd = 0;
  }
  for (let i = p.volleys.length - 1; i >= 0; i--) {
    p.volleys[i] -= dt;
    if (p.volleys[i] <= 0) {
      p.volleys.splice(i, 1);
      if (p.target && canTarget(p.target)) fireVolley(p, angleTo(p.x, p.y, p.target.x, p.target.y));
    }
  }
  p.ready = p.cd < s.interval * 0.55;

  updateSkyAttacks(p, dt);
}

const MAX_SHOTS = 120;

const elementGlow = s =>
  s.lightning ? ELEMENT_COLORS.lightning : s.curse ? ELEMENT_COLORS.curse : s.frost ? ELEMENT_COLORS.frost
  : s.poison ? ELEMENT_COLORS.poison : s.burn ? ELEMENT_COLORS.fire : null;

function fireVolley(p, ang) {
  const s = p.s;
  const dmg = playerAtk(p) * s.dmgMul;
  const dirs = [];
  const n = 1 + s.front;
  for (let i = 0; i < n; i++) dirs.push([ang, (i - (n - 1) / 2) * 7]);
  const diagAngles = [0.45, 0.22, 0.68];
  for (let i = 0; i < s.diag; i++) { dirs.push([ang + diagAngles[i], 0]); dirs.push([ang - diagAngles[i], 0]); }
  for (let i = 0; i < s.side; i++) {
    const o = s.side > 1 ? (i ? 0.16 : -0.16) : 0;
    dirs.push([ang + Math.PI / 2 + o, 0]); dirs.push([ang - Math.PI / 2 - o, 0]);
  }
  for (let i = 0; i < s.rear; i++) dirs.push([ang + Math.PI + (s.rear > 1 ? (i ? 0.2 : -0.2) : 0), 0]);
  const glowC = elementGlow(s);
  for (const [a, off] of dirs) {
    const px = -Math.sin(a) * off, py = Math.cos(a) * off;
    G.shots.push({
      x: p.x + Math.cos(a) * 12 + px, y: p.y - 2 + Math.sin(a) * 12 + py,
      vx: Math.cos(a) * p.hero.shotSpeed, vy: Math.sin(a) * p.hero.shotSpeed,
      r: 4 * s.size, size: s.size, dmg, kind: p.hero.shot, glow: glowC,
      pierce: s.pierce, bounce: s.wallBounce, ric: s.ricochet, hit: [], life: 2.2,
      homing: s.homing, target: p.target, main: true,
    });
  }
  if (G.shots.length > MAX_SHOTS) G.shots.splice(0, G.shots.length - MAX_SHOTS);
  p.recoil = 1;
  Sound.play(p.hero.shot === 'arrow' ? 'shoot' : p.hero.shot === 'orb' ? 'orb' : 'bolt');
}

// Meteor Shower and Thunderstorm perks.
function updateSkyAttacks(p, dt) {
  const s = p.s;
  if (G.cleared) return;
  if (s.meteor) {
    p.meteorT -= dt;
    if (p.meteorT <= 0) {
      p.meteorT = 6 - s.meteor * 1.2;
      const targets = G.enemies.filter(canTarget);
      if (targets.length) {
        const e = pick(targets);
        G.strikes.push({ x: e.x, y: e.y, r: 42, t: 0.7, max: 0.7, dmg: playerAtk(p) * 1.8, owner: 'player', kind: 'meteor' });
      }
    }
  }
  if (s.storm) {
    p.stormT -= dt;
    if (p.stormT <= 0) {
      p.stormT = 3.2 - s.storm * 0.6;
      const targets = shuffle(G.enemies.filter(canTarget)).slice(0, s.storm + 1);
      for (const e of targets) {
        FX.bolt(e.x + rand(-30, 30), e.y - 220, e.x, e.y, '#ffe55a', 2.5);
        FX.burst(e.x, e.y, ['#ffe55a', '#ffffff'], 8, { type: 'spark', min: 60, max: 180 });
        hurtEnemy(e, playerAtk(p) * 1.3, { color: '#ffe55a' });
      }
      if (targets.length) Sound.play('zap');
    }
  }
}

function hurtPlayer(amount, o = {}) {
  const p = G.player;
  if (!p || p.dead || G.state !== 'play' || G.bossDead) return false;
  if (p.invuln > 0) return false;
  if (!o.hazard && Math.random() < p.s.dodge) {
    FX.text(p.x, p.y - 26, 'Dodge!', '#bff1ff', 11);
    Sound.play('dodge');
    p.invuln = 0.3;
    return false;
  }
  if (p.shieldUp) {
    p.shieldUp = false;
    p.shieldBurst = true;   // handled in updatePlayer, we may be in the middle of a loop over shots or enemies
    p.invuln = 0.5;
    FX.ring(p.x, p.y, 30, '#ffe58a', 0.4, 5);
    FX.burst(p.x, p.y, ['#ffe58a', '#ffffff'], 10, { min: 60, max: 140 });
    Sound.play('shield');
    return false;
  }
  const d = Math.max(1, Math.round(amount * (1 - p.s.armor)));
  p.hp -= d;
  G.run.damage = (G.run.damage || 0) + d;
  p.flash = 0.2;
  p.invuln = 0.7;
  FX.text(p.x, p.y - 30, '-' + fmt(d), '#ff5a6e', 13, { pop: 0.3 });
  FX.burst(p.x, p.y, ['#ff5a6e', '#ffffff'], 8, { min: 50, max: 140 });
  FX.kick(6);
  vibrate(35);
  Sound.play('hurt');
  if (p.hp <= 0) playerDown(p);
  return true;
}

// What a broken Holy Shield does: level 2 wipes out nearby shots, level 3 also blasts enemies away.
const SHIELD_BURST_R = 120;
function shieldBurst(p) {
  const L = p.s.shield;
  if (L < 2) return;
  FX.ring(p.x, p.y, SHIELD_BURST_R, '#ffe58a', 0.5, 6);
  for (let i = G.eshots.length - 1; i >= 0; i--) {
    const b = G.eshots[i];
    if (dist2(p.x, p.y, b.x, b.y) > SHIELD_BURST_R * SHIELD_BURST_R) continue;
    FX.burst(b.x, b.y, ['#ffe58a', '#ffffff'], 3, { min: 30, max: 90 });
    G.eshots.splice(i, 1);
  }
  if (L < 3) return;
  for (const e of G.enemies) {
    if (!canTarget(e) || dist(p.x, p.y, e.x, e.y) > SHIELD_BURST_R + e.r) continue;
    const a = angleTo(p.x, p.y, e.x, e.y);
    if (!e.boss && !e.anchored) { e.kbx = Math.cos(a) * 420; e.kby = Math.sin(a) * 420; }
    hurtEnemy(e, playerAtk(p) * 2, { color: '#ffe58a' });
  }
  FX.kick(4);
}

function healPlayer(amount) {
  const p = G.player;
  const before = p.hp;
  p.hp = Math.min(p.s.maxHp, p.hp + amount);
  const got = Math.round(p.hp - before);
  if (got > 0) {
    FX.text(p.x, p.y - 30, '+' + fmt(got), '#7be05a', 12);
    FX.burst(p.x, p.y, ['#7be05a', '#c9ff9a'], 8, { angle: -Math.PI / 2, spread: 1.2, min: 30, max: 90 });
    Sound.play('heal');
  }
}

function playerDown(p) {
  const run = G.run;
  if (p.livesUsed < p.s.lives) {
    p.livesUsed++;
    run.livesUsed = p.livesUsed;
    revivePlayer(p, 0.6, 'Extra Life!');
  } else if (run.metaRevive) {
    run.metaRevive = false;
    revivePlayer(p, 0.5, 'Second Chance!');
  } else {
    p.hp = 0;
    p.dead = true;
    FX.burst(p.x, p.y, [p.hero.pal.main, '#ffffff', p.hero.pal.skin], 30, { min: 60, max: 220, life: 0.9 });
    FX.smoke(p.x, p.y, 'rgba(255,255,255,0.6)', 8, 9);
    FX.kick(10);
    vibrate([60, 40, 120]);
    Sound.play('lose');
    playerDied();
  }
}

function revivePlayer(p, pct, label) {
  p.hp = Math.round(p.s.maxHp * pct);
  p.invuln = 2.5;
  G.eshots.length = 0;
  for (const e of G.enemies) {
    const a = angleTo(p.x, p.y, e.x, e.y);
    if (!e.boss) { e.kbx = Math.cos(a) * 300; e.kby = Math.sin(a) * 300; }
  }
  FX.ring(p.x, p.y, 120, '#ffcf3f', 0.7, 8);
  FX.burst(p.x, p.y, ['#ffcf3f', '#ffffff'], 30, { min: 80, max: 260 });
  FX.text(p.x, p.y - 40, label, '#ffcf3f', 16, { life: 1.4, pop: 0.6 });
  Sound.play('revive');
}

function vibrate(pattern) {
  if (save.settings.vibrate && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
}

// ---------- companions ----------

function syncHelpers(p) {
  const s = p.s;
  const want = [];
  for (let i = 0; i < s.drones; i++) want.push('drone');
  for (let i = 0; i < s.wisps; i++) want.push('wisp');
  for (let i = 0; i < s.dragons; i++) want.push('dragon');
  for (let i = 0; i < s.blades; i++) want.push('blade');
  for (let i = 0; i < s.guards; i++) want.push('guard');
  const old = G.helpers;
  G.helpers = want.map((kind, i) => {
    const prev = old.find(h => h.kind === kind && !h.taken);
    if (prev) { prev.taken = true; return prev; }
    return { kind, x: p.x, y: p.y, cd: rand(0.2, 1), aim: 0, seed: rand(0, 10) };
  });
  for (const h of G.helpers) h.taken = false;
  const count = {};
  for (const h of G.helpers) { h.idx = count[h.kind] = (count[h.kind] || 0) + 1; }
  for (const h of G.helpers) h.of = count[h.kind];
}

function updateHelpers(p, dt) {
  const atk = playerAtk(p);
  let flyer = 0;
  for (const h of G.helpers) {
    if (h.kind === 'blade' || h.kind === 'guard') {
      const radius = h.kind === 'blade' ? 40 : 27;
      const a = (h.kind === 'blade' ? G.time * 3.3 : -G.time * 2.4) + ((h.idx - 1) * TAU) / h.of;
      h.x = p.x + Math.cos(a) * radius;
      h.y = p.y - 2 + Math.sin(a) * radius;
      if (h.kind === 'blade') {
        for (const e of G.enemies) {
          if (!canTarget(e)) continue;
          if (dist2(h.x, h.y, e.x, e.y) < (e.r + 8) * (e.r + 8) && (e.bladeT || 0) <= 0) {
            e.bladeT = 0.35;
            hurtEnemy(e, atk * 0.45, { color: '#dfe7f2' });
            FX.burst(h.x, h.y, '#ffffff', 3, { type: 'spark', min: 60, max: 140 });
          }
        }
      } else {
        for (let i = G.eshots.length - 1; i >= 0; i--) {
          const b = G.eshots[i];
          if (dist2(h.x, h.y, b.x, b.y) < (b.r + 7) * (b.r + 7)) {
            G.eshots.splice(i, 1);
            FX.burst(b.x, b.y, ['#9cc8ff', '#ffffff'], 5, { min: 40, max: 120 });
          }
        }
      }
      continue;
    }
    // flying companions hover behind the hero
    flyer++;
    const side = flyer % 2 ? -1 : 1;
    const row = Math.floor((flyer - 1) / 2);
    const tx = p.x + side * (18 + row * 10), ty = p.y - 22 - row * 10 + Math.sin(G.time * 3 + h.seed) * 3;
    const k = 1 - Math.exp(-6 * dt);
    h.x += (tx - h.x) * k;
    h.y += (ty - h.y) * k;
    h.cd -= dt;
    const tgt = p.target && canTarget(p.target) ? p.target : null;
    if (tgt) h.aim = angleTo(h.x, h.y, tgt.x, tgt.y);
    if (h.cd <= 0 && tgt && !G.cleared) {
      const a = h.aim;
      if (h.kind === 'wisp') {
        h.cd = 1.0;
        G.shots.push({ x: h.x, y: h.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 3.5, dmg: atk * 0.35, kind: 'spark', pierce: 0, bounce: 0, ric: 0, hit: [], life: 2, homing: 3, target: tgt });
      } else if (h.kind === 'drone') {
        h.cd = 0.55;
        G.shots.push({ x: h.x, y: h.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 3, dmg: atk * 0.4, kind: 'bolt', glow: '#ff8a3d', size: 0.6, pierce: 0, bounce: 0, ric: 0, hit: [], life: 2 });
        Sound.play('bolt');
      } else if (h.kind === 'dragon') {
        h.cd = 1.3;
        G.shots.push({ x: h.x, y: h.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 5, dmg: atk * 0.7, kind: 'dragon', pierce: 0, bounce: 0, ric: 0, hit: [], life: 2.5, splash: 34, burnShot: true });
      }
    }
  }
}
