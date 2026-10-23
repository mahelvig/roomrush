'use strict';
// Enemies: spawning, behaviours, status effects (burn, poison, frost, curse) and damage.

function roomScale() {
  const i = G.roomIdx - 1;
  return { hp: 1 + DIFFICULTY.roomHp * i, dmg: 1 + DIFFICULTY.roomDmg * i };
}

// The kinds of enemy that can turn up in a room: more of the world's list the further in you are.
function enemyPool(world, idx) {
  return world.enemies.slice(0, Math.min(world.enemies.length, 2 + Math.floor((idx - 1) / 3)));
}

function spawnEnemy(type, x, y, o = {}) {
  const def = ENEMIES[type];
  const w = G.world, k = roomScale();
  const hp = Math.round(def.hp * w.hpMult * k.hp);
  const e = {
    id: ++G.nextId, def, type, x, y, r: def.r, pal: def.pal,
    hp, maxHp: hp, dmg: Math.round(def.dmg * w.dmgMult * k.dmg), speed: def.speed,
    state: 'idle', t: rand(0.3, 1), cd: rand(0.6, 1.6) + (o.delay || 0),
    look: Math.PI / 2, seed: rand(0, 100), flash: 0, z: 0, vx: 0, vy: 0, kbx: 0, kby: 0,
    moving: false, flying: !!def.flying, elite: !!def.elite, boss: false, squash: 0,
    status: { burn: 0, burnDps: 0, burnTick: 0, poison: 0, poisonDps: 0, poisonTick: 0, slow: 0, freeze: 0, curse: 0 },
    spawnT: o.spawnT !== undefined ? o.spawnT : 0.6, spawnMax: 0.6, dashes: 0,
  };
  e.spawnMax = Math.max(0.01, e.spawnT);
  G.enemies.push(e);
  return e;
}

// ---------- enemy shots ----------

function enemyShot(e, ang, shotKey, speed, dmgMul = 1, o = {}) {
  const sd = SHOTS[shotKey] || SHOTS.orb;
  const sp = speed * G.player.s.bulletSlow * (1 + DIFFICULTY.roomShotSpeed * (G.roomIdx - 1));
  G.eshots.push({
    x: e.x + Math.cos(ang) * (e.r * 0.6), y: e.y - (e.z || 0) + Math.sin(ang) * (e.r * 0.6),
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: sd.r, kind: sd.kind, color: sd.color,
    dmg: Math.round(e.dmg * dmgMul), slow: !!sd.slow, life: 7, seed: rand(0, 10),
    accel: o.accel || 0, ghost: !!o.ghost,
  });
}
function spreadShot(e, ang, n, spread, shotKey, speed, dmgMul, o) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? ang : ang - spread / 2 + (spread * i) / (n - 1);
    enemyShot(e, a, shotKey, speed, dmgMul, o);
  }
  Sound.play('eshoot');
}
function ringShot(e, n, shotKey, speed, offset = 0, dmgMul) {
  for (let i = 0; i < n; i++) enemyShot(e, offset + (i * TAU) / n, shotKey, speed, dmgMul);
  Sound.play('eshoot');
}

// ---------- movement helpers ----------

function walk(e, ang, speed, dt) {
  e.vx = Math.cos(ang) * speed;
  e.vy = Math.sin(ang) * speed;
  const hit = moveEntity(e, e.vx * dt, e.vy * dt, !e.flying);
  e.moving = speed > 0;
  return hit;
}
function walkTo(e, tx, ty, speed, dt) {
  const ang = e.flying ? angleTo(e.x, e.y, tx, ty) : pathDir(e, tx, ty);
  if (ang === null) {   // no way through for something this big: wait instead of pushing at a wall
    e.vx = e.vy = 0;
    e.moving = false;
    return false;
  }
  return walk(e, ang, speed, dt);
}

// ---------- behaviours ----------

const AI = {
  hopper(e, dt, p) {
    const h = e.def.hop;
    if (e.state === 'hop') {
      e.t -= dt;
      const k = 1 - e.t / h.dur;
      e.z = Math.sin(clamp(k, 0, 1) * Math.PI) * 10 * (e.r / 12);
      e.squash = -0.35;
      moveEntity(e, e.vx * dt, e.vy * dt, true);
      if (e.t <= 0) {
        e.state = 'idle';
        e.z = 0;
        e.squash = 0.7;
        e.cd = h.every * rand(0.8, 1.2);
        if (e.def.landRing) {
          ringShot(e, e.def.landRing, e.def.ringShot || 'orb', 110, rand(0, TAU));
          FX.ring(e.x, e.y + e.r * 0.5, e.r * 2.5, '#ffffff', 0.35, 3);
          Sound.play('slam');
        }
      }
    } else {
      e.squash *= Math.exp(-7 * dt);
      e.cd -= dt;
      if (e.cd <= 0) {
        const a = (pathDir(e, p.x, p.y) ?? angleTo(e.x, e.y, p.x, p.y)) + rand(-0.35, 0.35);
        e.state = 'hop';
        e.t = h.dur;
        e.vx = (Math.cos(a) * h.dist) / h.dur;
        e.vy = (Math.sin(a) * h.dist) / h.dur;
      }
    }
  },

  flyer(e, dt, p) {
    const a = angleTo(e.x, e.y, p.x, p.y) + Math.sin(G.time * 2.4 + e.seed) * 0.9;
    walk(e, a, e.speed * e.slowK, dt);
    if (e.def.fire) {
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = e.def.fire.every * rand(0.8, 1.2);
        spreadShot(e, angleTo(e.x, e.y, p.x, p.y), e.def.fire.shots, e.def.fire.spread, e.def.fire.shot, e.def.fire.speed);
      }
    }
  },

  turret(e, dt, p) {
    const f = e.def.fire;
    e.puff = Math.max(0, (e.puff || 0) - dt * 3);
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = f.every * rand(0.85, 1.15);
      e.puff = 1;
      spreadShot(e, angleTo(e.x, e.y, p.x, p.y), f.shots, f.spread, f.shot, f.speed, 1, { ghost: f.over });
      FX.smoke(e.x, e.y - 10, rgba(SHOTS[f.shot].color, 0.6), 3, 5);
    }
  },

  archer(e, dt, p) {
    const f = e.def.fire;
    if (e.state === 'aim') {
      e.t -= dt;
      if (e.t > 0.15) e.look = angleTo(e.x, e.y, p.x, p.y);
      e.moving = false;
      if (e.t <= 0) {
        spreadShot(e, e.look, f.shots, f.spread, f.shot, f.speed);
        e.state = 'move';
        e.t = 0;
        e.cd = f.every * rand(0.85, 1.15);
      }
      return;
    }
    e.t -= dt;
    if (!e.dest || e.t <= 0 || dist(e.x, e.y, e.dest.x, e.dest.y) < 8) {
      e.dest = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 110, maxDist: 250, fit: e.r });
      e.t = rand(1, 1.8);
    }
    walkTo(e, e.dest.x, e.dest.y, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    e.cd -= dt;
    if (e.cd <= 0 && dist(e.x, e.y, p.x, p.y) < 460) {
      e.state = 'aim';
      e.t = f.aim;
    }
  },

  charger(e, dt, p) {
    const d = e.def.dash;
    if (e.state === 'windup') {
      e.t -= dt;
      if (e.t > 0.18) e.look = angleTo(e.x, e.y, p.x, p.y);
      e.moving = false;
      if (e.t <= 0) { e.state = 'dash'; e.t = d.dur; Sound.play('dash'); }
    } else if (e.state === 'dash') {
      e.t -= dt;
      const x0 = e.x, y0 = e.y;
      walk(e, e.look, d.speed, dt);
      // only really running into something ends the charge, grazing a wall does not
      const hit = dist(x0, y0, e.x, e.y) < d.speed * dt * 0.5;
      if (Math.random() < dt * 30) FX.smoke(e.x, e.y + e.r * 0.6, 'rgba(230,210,180,0.7)', 1, 5);
      if (hit || e.t <= 0) {
        if (hit) {
          FX.kick(e.elite ? 6 : 3);
          if (e.def.wallRing) ringShot(e, e.def.wallRing, 'rock', 120, rand(0, TAU));
        }
        e.dashes--;
        if (e.dashes > 0) { e.state = 'windup'; e.t = d.windup * 0.6; }
        else { e.state = 'rest'; e.t = hit ? 0.9 : 0.5; e.dizzy = hit; }
      }
    } else if (e.state === 'rest') {
      e.t -= dt;
      e.moving = false;
      if (e.t <= 0) { e.state = 'idle'; e.dizzy = false; e.cd = d.every * rand(0.8, 1.2); }
    } else {
      walkTo(e, p.x, p.y, e.speed * e.slowK, dt);
      e.look = angleTo(e.x, e.y, p.x, p.y);
      e.cd -= dt;
      if (e.cd <= 0 && dist(e.x, e.y, p.x, p.y) < 330 && pathClear(e.x, e.y, p.x, p.y, e.r)) {
        e.state = 'windup';
        e.t = d.windup;
        e.dashes = d.count;
      }
    }
  },

  tank(e, dt, p) {
    const f = e.def.fire;
    walkTo(e, p.x, p.y, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = f.every * rand(0.9, 1.1);
      e.ringOff = (e.ringOff || 0) + Math.PI / f.ring;
      ringShot(e, f.ring, f.shot, f.speed, e.ringOff);
    }
  },

  chaser(e, dt, p) {
    walkTo(e, p.x, p.y, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    const pu = e.def.pulse;
    if (pu) {
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = pu.every * rand(0.9, 1.1);
        e.ringOff = (e.ringOff || 0) + Math.PI / pu.ring;
        ringShot(e, pu.ring, pu.shot, pu.speed, e.ringOff);
      }
    }
  },

  jumper(e, dt, p) {
    const j = e.def.jump;
    if (e.state === 'crouch') {
      e.t -= dt;
      e.squash = 0.5;
      if (e.t <= 0) {
        e.state = 'air';
        e.t = j.dur;
        G.warns.push({ type: 'circle', x: e.jx1, y: e.jy1, r: j.radius, t: j.dur, max: j.dur });
      }
    } else if (e.state === 'air') {
      e.t -= dt;
      const k = clamp(1 - e.t / j.dur, 0, 1);
      e.x = lerp(e.jx0, e.jx1, k);
      e.y = lerp(e.jy0, e.jy1, k);
      e.z = Math.sin(k * Math.PI) * 60;
      e.squash = -0.3;
      if (e.t <= 0) {
        e.z = 0;
        e.squash = 0.8;
        resolveTiles(e, true);
        if (dist(e.x, e.y, p.x, p.y) < j.radius + p.r) hurtPlayer(e.dmg);
        ringShot(e, j.ring, j.shot, j.speed, rand(0, TAU));
        FX.ring(e.x, e.y + e.r * 0.4, j.radius * 1.3, '#ffffff', 0.4, 5);
        FX.smoke(e.x, e.y + e.r * 0.5, 'rgba(230,220,210,0.7)', 8, 9);
        FX.kick(7);
        Sound.play('slam');
        e.jumps--;
        if (e.jumps > 0) { this.startJump(e, p, 0.3); }
        else { e.state = 'idle'; e.cd = j.every * rand(0.85, 1.15); }
      }
    } else {
      e.squash *= Math.exp(-6 * dt);
      walkTo(e, p.x, p.y, e.speed * e.slowK, dt);
      e.look = angleTo(e.x, e.y, p.x, p.y);
      e.cd -= dt;
      if (e.cd <= 0) { e.jumps = e.def.jumps || 1; this.startJump(e, p, 0.45); }
    }
  },
  startJump(e, p, crouch) {
    e.state = 'crouch';
    e.t = crouch;
    let tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35;
    tx = clamp(tx, ROOM_X + e.r, ROOM_X + ROOM_W - e.r);
    ty = clamp(ty, ROOM_Y + e.r, ROOM_Y + ROOM_H - e.r);
    if (blocksWalk(tileAt(tx, ty))) { tx = p.x; ty = p.y; }
    e.jx0 = e.x; e.jy0 = e.y; e.jx1 = tx; e.jy1 = ty;
  },

  blinker(e, dt, p) {
    const f = e.def.fire;
    e.t -= dt;
    if (e.state === 'vanish') {
      e.alpha = clamp(e.t / 0.35, 0, 1);
      e.hidden = e.alpha < 0.4;
      if (e.t <= 0) {
        const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 100, maxDist: 210, ground: !e.flying });
        e.x = spot.x; e.y = spot.y;
        e.state = 'appear';
        e.t = 0.35;
        Sound.play('blink');
        FX.burst(e.x, e.y, [e.pal.main, e.pal.light], 8, { min: 30, max: 90 });
      }
    } else if (e.state === 'appear') {
      e.alpha = clamp(1 - e.t / 0.35, 0, 1);
      e.hidden = e.alpha < 0.4;
      if (e.t <= 0) { e.state = 'aim'; e.t = f.aim; e.alpha = 1; e.hidden = false; }
    } else if (e.state === 'aim') {
      e.look = angleTo(e.x, e.y, p.x, p.y);
      if (e.t <= 0) {
        spreadShot(e, e.look, f.shots, f.spread, f.shot, f.speed);
        if (e.def.blinkRing) ringShot(e, e.def.blinkRing, 'fire', 110, rand(0, TAU));
        e.state = 'idle';
        e.t = f.every * rand(0.8, 1.2);
      }
    } else {
      e.look = angleTo(e.x, e.y, p.x, p.y);
      if (e.t <= 0) {
        e.state = 'vanish';
        e.t = 0.35;
        FX.burst(e.x, e.y, [e.pal.main, e.pal.light], 6, { min: 30, max: 80 });
      }
    }
  },

  bomber(e, dt, p) {
    const b = e.def.blast;
    if (e.state === 'fuse') {
      e.t -= dt;
      e.moving = false;
      if (e.t <= 0) {
        if (dist(e.x, e.y, p.x, p.y) < b.radius + p.r) hurtPlayer(e.dmg);
        ringShot(e, b.ring, b.shot, b.speed, rand(0, TAU), 0.7);
        FX.ring(e.x, e.y, b.radius * 1.2, e.pal.main, 0.4, 6);
        FX.burst(e.x, e.y, [e.pal.main, e.pal.light, '#ffffff'], 20, { min: 60, max: 220 });
        FX.kick(6);
        Sound.play('explode');
        e.noLoot = false;
        killEnemy(e);
      }
      return;
    }
    const a = angleTo(e.x, e.y, p.x, p.y) + Math.sin(G.time * 3 + e.seed) * 0.4;
    walk(e, a, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    if (dist(e.x, e.y, p.x, p.y) < e.r + p.r + 16) {
      e.state = 'fuse';
      e.t = 0.6;
      Sound.play('warn');
      G.warns.push({ type: 'circle', x: e.x, y: e.y, r: b.radius, t: 0.6, max: 0.6, follow: e });
    }
  },

  caster(e, dt, p) {
    const f = e.def.fire;
    if (e.state === 'cast') {
      e.t -= dt;
      e.moving = false;
      if (e.t <= 0) {
        if (e.def.spiral) { e.state = 'spiral'; e.t = 1.4; e.spin = angleTo(e.x, e.y, p.x, p.y); e.acc = 0; }
        else {
          ringShot(e, f.ring, f.shot, f.speed, rand(0, TAU));
          e.state = 'move';
          e.cd = f.every * rand(0.85, 1.15);
        }
      }
      return;
    }
    if (e.state === 'spiral') {
      e.t -= dt;
      e.acc += dt;
      while (e.acc > 0.08) {
        e.acc -= 0.08;
        e.spin += 0.38;
        enemyShot(e, e.spin, f.shot, f.speed);
        enemyShot(e, e.spin + Math.PI, f.shot, f.speed);
      }
      if (e.t <= 0) {
        ringShot(e, f.ring, f.shot, f.speed * 0.9, rand(0, TAU));
        e.state = 'move';
        e.cd = f.every * rand(0.85, 1.15);
      }
      return;
    }
    e.t -= dt;
    if (!e.dest || e.t <= 0 || dist(e.x, e.y, e.dest.x, e.dest.y) < 8) {
      e.dest = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 120, maxDist: 230, fit: e.r });
      e.t = rand(1.2, 2);
    }
    walkTo(e, e.dest.x, e.dest.y, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    e.cd -= dt;
    if (e.cd <= 0) { e.state = 'cast'; e.t = 0.6; }
  },

  trail(e, dt, p) {
    walkTo(e, p.x, p.y, e.speed * e.slowK, dt);
    e.look = angleTo(e.x, e.y, p.x, p.y);
    e.cd -= dt;
    if (e.cd <= 0) {
      e.cd = 0.45;
      G.zones.push({ x: e.x, y: e.y + 3, r: 12, life: 3.2, max: 3.2, dmg: Math.round(e.dmg * 0.45), color: '#ff7a2a' });
    }
  },
};

// ---------- update ----------

function updateEnemy(e, dt, p) {
  e.flash = Math.max(0, e.flash - dt);
  e.bladeT = (e.bladeT || 0) - dt;
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  const st = e.status;
  if (st.burn > 0) {
    st.burn -= dt;
    st.burnTick -= dt;
    if (st.burnTick <= 0) {
      st.burnTick = 0.5;
      hurtEnemy(e, st.burnDps * 0.5, { color: '#ff9a3c', small: true, dot: true });
      FX.burst(e.x, e.y - e.r * 0.5, ['#ff8a2a', '#ffd35a'], 3, { angle: -Math.PI / 2, spread: 0.6, min: 20, max: 60 });
    }
    if (st.burn <= 0) st.burnDps = 0;
  }
  if (st.poison > 0) {
    st.poison -= dt;
    st.poisonTick -= dt;
    if (st.poisonTick <= 0) {
      st.poisonTick = 0.5;
      hurtEnemy(e, st.poisonDps * 0.5, { color: '#8cf06a', small: true, dot: true });
      FX.burst(e.x, e.y - e.r * 0.3, '#7be05a', 2, { angle: -Math.PI / 2, spread: 0.5, min: 10, max: 40 });
    }
    if (st.poison <= 0) st.poisonDps = 0;
  }
  if (e.dead) return;
  st.slow = Math.max(0, st.slow - dt);
  st.curse = Math.max(0, st.curse - dt);
  if (st.freeze > 0) { st.freeze -= dt; return; }
  e.slowK = st.slow > 0 ? 0.55 : 1;

  // knockback
  if (e.kbx || e.kby) {
    moveEntity(e, e.kbx * dt, e.kby * dt, !e.flying);
    const k = Math.exp(-10 * dt);
    e.kbx *= k; e.kby *= k;
    if (Math.abs(e.kbx) + Math.abs(e.kby) < 5) e.kbx = e.kby = 0;
  }

  if (e.boss) updateBoss(e, dt, p);
  else AI[e.def.ai](e, dt * (e.state === 'dash' || e.state === 'air' ? 1 : e.slowK === 1 ? 1 : 0.8), p);
  if (!e.flying && !e.boss) resolveTiles(e, true);
}

// ---------- damage ----------

function hurtEnemy(e, amount, o = {}) {
  if (e.dead || e.spawnT > 0) return;
  const p = G.player;
  let d = amount;
  if (e.status.curse > 0) d *= 1 + 0.2 * p.s.curse;
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  if (!o.dot) e.flash = 0.1;
  FX.text(e.x, e.y - e.r - 8 - (e.z || 0), fmt(d), o.crit ? '#ffd23f' : o.color || '#ffffff', o.crit ? 15 : o.small ? 9 : 11, { pop: o.crit ? 0.6 : 0, life: o.small ? 0.6 : 0.8 });
  if (e.hp <= 0) killEnemy(e);
}

// Shot from the hero (or a companion) hits an enemy.
function shotHits(b, e) {
  const p = G.player, s = p.s;
  let d = b.dmg;
  const crit = Math.random() < s.crit;
  if (crit) d *= s.critMul;
  if (s.headshot && !e.boss && !e.elite && b.main && Math.random() < s.headshot) {
    FX.text(e.x, e.y - e.r - 16, 'HEADSHOT', '#ff4f6d', 12, { pop: 0.5 });
    d = e.hp + 1;
  }
  hurtEnemy(e, d, { crit });
  Sound.play(crit ? 'crit' : 'hit');
  FX.burst(b.x, b.y, [e.pal.main, '#ffffff'], crit ? 4 : 2, { type: 'spark', min: 60, max: 160 });
  if (b.main || b.splash) applyElements(e, b, d);
  if (b.main && !e.boss) {
    // a small push on every hit, a big one with Giant Shots
    const a = Math.atan2(b.vy, b.vx), k = e.elite ? 15 + 45 * s.knock : 35 + 140 * s.knock;
    e.kbx += Math.cos(a) * k;
    e.kby += Math.sin(a) * k;
  }
  if (b.splash) {
    FX.ring(b.x, b.y, b.splash, '#ff8a2a', 0.3, 4);
    FX.burst(b.x, b.y, ['#ff8a2a', '#ffd35a'], 10, { min: 50, max: 140 });
    for (const o of G.enemies) {
      if (o !== e && canTarget(o) && dist(o.x, o.y, b.x, b.y) < b.splash + o.r) hurtEnemy(o, b.dmg * 0.6, { color: '#ffb36a' });
    }
  }
}

function applyElements(e, b, d) {
  const p = G.player, s = p.s, st = e.status;
  const atk = playerAtk(p);
  if (s.burn || b.burnShot) {
    const L = Math.max(s.burn, b.burnShot ? 1 : 0);
    st.burn = 2.5;
    st.burnDps = Math.max(st.burnDps, atk * 0.22 * L);
  }
  if (s.poison && b.main) {
    st.poison = 5;
    st.poisonDps = Math.min(st.poisonDps + atk * 0.07 * s.poison, atk * 0.45 * s.poison);
  }
  if (s.frost && b.main) {
    st.slow = 2;
    if (!e.boss && st.freeze <= 0 && Math.random() < 0.08 * s.frost) {
      st.freeze = e.elite ? 0.5 : 1.2;
      FX.burst(e.x, e.y, ['#bff1ff', '#ffffff'], 8, { min: 30, max: 90 });
      Sound.play('freeze');
    }
  }
  if (s.curse && b.main) st.curse = 5;
  if (s.lightning && b.main && !b.chained) {
    const n = 1 + s.lightning;
    const near = G.enemies
      .filter(o => o !== e && canTarget(o) && dist2(o.x, o.y, e.x, e.y) < 130 * 130)
      .sort((a1, a2) => dist2(a1.x, a1.y, e.x, e.y) - dist2(a2.x, a2.y, e.x, e.y))
      .slice(0, n);
    let fx = e.x, fy = e.y;
    for (const o of near) {
      FX.bolt(fx, fy, o.x, o.y, '#ffe55a', 1.8);
      hurtEnemy(o, d * (0.25 + 0.1 * s.lightning), { color: '#ffe55a' });
      fx = o.x; fy = o.y;
    }
    if (near.length) Sound.play('zap');
  }
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const p = G.player, s = p.s, run = G.run;
  run.kills = (run.kills || 0) + 1;
  FX.burst(e.x, e.y - (e.z || 0), [e.pal.main, e.pal.light, '#ffffff'], e.boss ? 50 : e.elite ? 26 : 14, { min: 60, max: e.boss ? 320 : 200, life: 0.7 });
  FX.smoke(e.x, e.y, 'rgba(255,255,255,0.55)', e.elite || e.boss ? 8 : 4, e.r * 0.6);
  Sound.play(e.boss || e.elite ? 'explode' : 'die');
  if (e.elite) FX.kick(6);

  // loot
  const coins = Math.round((e.boss ? e.def.coins : e.def.coins * G.world.coinMult) * (1 + s.gold) * rand(0.8, 1.2));
  dropCoins(e.x, e.y, coins);
  if (e.elite) {
    dropPickup('heart', e.x, e.y, 0.3);
    dropPickup('gem', e.x, e.y, 1 + G.worldIdx);
  } else if (!e.boss && Math.random() < 0.025) dropPickup('heart', e.x, e.y, 0.12);
  if (e.boss) dropPickup('gem', e.x, e.y, e.def.gems);

  if (s.vamp) healPlayer(p.s.maxHp * s.vamp);
  if (e.status.curse > 0 && s.curse) {
    const n = 2 + s.curse;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      G.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 4, dmg: playerAtk(p) * 0.6, kind: 'soul', pierce: 0, bounce: 0, ric: 0, hit: [e.id], life: 2, homing: 6, target: null });
    }
    FX.burst(e.x, e.y, '#c06bff', 10, { min: 40, max: 120 });
  }
  if (e.def.split) {
    for (let i = 0; i < e.def.split.n; i++) {
      const a = (i / e.def.split.n) * TAU;
      const c = spawnEnemy(e.def.split.type, e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, { spawnT: 0.15 });
      c.kbx = Math.cos(a) * 200; c.kby = Math.sin(a) * 200;
    }
  }
  if (e.boss) bossDefeated(e);
}

function dropCoins(x, y, total) {
  const n = Math.min(14, Math.max(1, Math.ceil(total / 3)));
  let left = total;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.max(1, Math.round(total / n));
    left -= v;
    if (v <= 0) break;
    dropPickup('coin', x, y, v);
  }
}

function dropPickup(kind, x, y, value) {
  const a = rand(0, TAU), sp = rand(40, 130);
  G.pickups.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, t: 0, seed: rand(0, 10), speed: 0 });
}

// Keep enemies from stacking on top of each other.
function separateEnemies() {
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.spawnT > 0 || a.dead) continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.spawnT > 0 || b.dead || a.flying !== b.flying) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r - 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2;
      const wa = a.boss ? 0 : b.boss ? 1 : 0.5;
      a.x -= (dx / d) * push * 2 * wa;
      a.y -= (dy / d) * push * 2 * wa;
      b.x += (dx / d) * push * 2 * (1 - wa);
      b.y += (dy / d) * push * 2 * (1 - wa);
    }
  }
}
