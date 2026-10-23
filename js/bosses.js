'use strict';
// Bosses: a list of attack moves that they cycle through. Below half HP they get angry (phase 2).

function spawnBoss(key) {
  const def = Object.assign({ ai: 'boss' }, BOSSES[key]);
  const e = spawnEnemy('slime', DOOR_X, ROOM_Y + 150, { spawnT: 1.2 });
  Object.assign(e, {
    def, type: key, r: def.r, pal: def.pal, hp: def.hp, maxHp: def.hp, dmg: def.dmg, speed: def.speed,
    state: 'intro', t: 1.4, boss: true, flying: !!def.flying, lastMove: null, phase2: false, m: null,
  });
  e.spawnMax = 1.2;
  G.boss = e;
  return e;
}

const bossShot = (e, k = 0) => (e.def.altShot && k % 2 ? e.def.altShot : e.def.shot);

function updateBoss(e, dt, p) {
  e.look = angleTo(e.x, e.y, p.x, p.y);
  e.slowK = e.status.slow > 0 ? 0.8 : 1;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) {
    e.phase2 = true;
    FX.text(e.x, e.y - e.r - 30, 'ENRAGED!', '#ff5a6e', 18, { life: 1.6, pop: 0.6, vy: -30 });
    FX.ring(e.x, e.y, 140, '#ff5a6e', 0.6, 8);
    FX.kick(9);
    Sound.play('boss');
  }
  if (e.state === 'intro') {
    e.t -= dt;
    if (e.t <= 0) { e.state = 'idle'; e.t = 0.6; }
    return;
  }
  if (e.state === 'idle') {
    e.wanderT = (e.wanderT || 0) - dt;
    if (!e.dest || e.wanderT <= 0 || dist(e.x, e.y, e.dest.x, e.dest.y) < 10) {
      e.dest = { x: rand(ROOM_X + 70, ROOM_X + ROOM_W - 70), y: rand(ROOM_Y + 80, ROOM_Y + ROOM_H * 0.5) };
      e.wanderT = 2.2;
    }
    walk(e, angleTo(e.x, e.y, e.dest.x, e.dest.y), e.speed * (e.phase2 ? 1.4 : 1) * e.slowK, dt);
    e.t -= dt;
    if (e.t <= 0) startBossMove(e);
    return;
  }
  const done = BOSS_MOVES[e.move](e, dt, p, e.m);
  e.m.t += dt;
  if (done) {
    e.state = 'idle';
    e.t = e.phase2 ? 0.5 : 0.95;
    e.anim = null;
    e.alpha = 1;
    e.hidden = false;
    e.laser = null;
  }
}

function startBossMove(e) {
  const minions = G.enemies.filter(o => o.minion && !o.dead).length;
  const options = e.def.moves.filter(m => m !== e.lastMove && !(m === 'summon' && minions >= 4));
  e.move = pick(options);
  e.lastMove = e.move;
  e.m = { t: 0 };
  e.state = 'move';
  e.anim = 'cast';
}

const BOSS_MOVES = {
  spiral(e, dt, p, m) {
    const dur = e.phase2 ? 3.2 : 2.6, arms = e.phase2 ? 4 : 3;
    if (m.t === 0) { m.ang = rand(0, TAU); m.acc = 0; m.dir = chance(0.5) ? 1 : -1; }
    m.acc += dt;
    while (m.acc > 0.09) {
      m.acc -= 0.09;
      m.ang += 0.21 * m.dir;
      for (let i = 0; i < arms; i++) enemyShot(e, m.ang + (i * TAU) / arms, bossShot(e, i), 125, 0.8);
      Sound.play('eshoot');
    }
    return m.t >= dur;
  },

  ring(e, dt, p, m) {
    const bursts = e.phase2 ? 4 : 3, n = e.phase2 ? 22 : 18;
    if (m.t === 0) { m.k = 0; m.next = 0.35; }
    if (m.t >= m.next && m.k < bursts) {
      ringShot(e, n, bossShot(e, m.k), 112 + m.k * 12, (m.k * Math.PI) / n, 0.8);
      FX.ring(e.x, e.y, e.r * 2.2, e.pal.light, 0.35, 5);
      m.k++;
      m.next += 0.55;
    }
    return m.k >= bursts && m.t > m.next - 0.25;
  },

  fan(e, dt, p, m) {
    const waves = e.phase2 ? 4 : 3, n = e.phase2 ? 9 : 7;
    if (m.t === 0) { m.k = 0; m.next = 0.3; }
    if (m.t >= m.next && m.k < waves) {
      spreadShot(e, angleTo(e.x, e.y, p.x, p.y), n, 1.05, bossShot(e, m.k + 1), 175, 0.8);
      m.k++;
      m.next += 0.38;
    }
    return m.k >= waves && m.t > m.next;
  },

  summon(e, dt, p, m) {
    if (!m.done && m.t > 0.6) {
      m.done = true;
      const n = e.phase2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const type = pick(e.def.summon);
        const spot = randomOpenSpot({ fromX: e.x, fromY: e.y, minDist: 40, maxDist: 140, ground: !ENEMIES[type].flying });
        const m2 = spawnEnemy(type, spot.x, spot.y, { spawnT: 0.6 });
        m2.minion = true;
        FX.burst(spot.x, spot.y, [e.pal.light, '#ffffff'], 10, { min: 40, max: 120 });
      }
      FX.ring(e.x, e.y, 70, e.pal.light, 0.5, 6);
      Sound.play('blink');
    }
    return m.t > 1.1;
  },

  roots(e, dt, p, m) {
    if (m.t === 0) {
      const base = angleTo(e.x, e.y, p.x, p.y);
      const offs = e.phase2 ? [-0.5, 0, 0.5] : [-0.25, 0.25];
      for (const o of offs) {
        const a = base + o;
        for (let d = 36, i = 0; d < 560; d += 28, i++) {
          const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
          if (x < ROOM_X || x > ROOM_X + ROOM_W || y < ROOM_Y || y > ROOM_Y + ROOM_H) break;
          if (tileAt(x, y) === TILE.WALL) break;
          const t = 0.65 + i * 0.05;
          G.strikes.push({ x, y, r: 15, t, max: t, dmg: e.dmg, owner: 'enemy', kind: 'root' });
        }
      }
      Sound.play('warn');
    }
    return m.t > 1.5;
  },

  slam(e, dt, p, m) {
    if (m.t === 0) { m.state = 'crouch'; m.k = 0; m.jumps = e.phase2 ? 2 : 1; }
    m.k += dt;
    if (m.state === 'crouch') {
      e.anim = 'cast';
      if (m.k > 0.5) {
        m.state = 'air'; m.k = 0;
        m.x0 = e.x; m.y0 = e.y;
        m.x1 = clamp(p.x, ROOM_X + e.r, ROOM_X + ROOM_W - e.r);
        m.y1 = clamp(p.y, ROOM_Y + e.r, ROOM_Y + ROOM_H - e.r);
        G.warns.push({ type: 'circle', x: m.x1, y: m.y1, r: 66, t: 0.9, max: 0.9 });
      }
    } else if (m.state === 'air') {
      e.anim = 'air';
      const k = clamp(m.k / 0.9, 0, 1);
      e.x = lerp(m.x0, m.x1, k);
      e.y = lerp(m.y0, m.y1, k);
      e.z = Math.sin(k * Math.PI) * 90;
      if (k >= 1) {
        e.z = 0;
        resolveTiles(e, true);
        if (dist(e.x, e.y, p.x, p.y) < 66 + p.r) hurtPlayer(e.dmg * 1.2);
        ringShot(e, e.phase2 ? 24 : 18, bossShot(e), 130, rand(0, TAU), 0.8);
        FX.ring(e.x, e.y + 10, 100, '#ffd35a', 0.5, 8);
        FX.smoke(e.x, e.y + 14, 'rgba(255,200,150,0.6)', 12, 12);
        FX.kick(12);
        vibrate(40);
        Sound.play('slam');
        m.jumps--;
        if (m.jumps > 0) { m.state = 'crouch'; m.k = 0.2; }
        else { m.state = 'rest'; m.k = 0; }
      }
    } else if (m.k > 0.4) return true;
    return false;
  },

  meteors(e, dt, p, m) {
    if (m.t === 0) {
      const n = e.phase2 ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const x = i === 0 ? p.x : clamp(p.x + rand(-130, 130), ROOM_X + 20, ROOM_X + ROOM_W - 20);
        const y = i === 0 ? p.y : clamp(p.y + rand(-130, 130), ROOM_Y + 20, ROOM_Y + ROOM_H - 20);
        const t = 1.0 + i * 0.14;
        G.strikes.push({ x, y, r: 30, t, max: t, dmg: e.dmg, owner: 'enemy', kind: 'meteor', zone: true });
      }
      Sound.play('warn');
    }
    return m.t > 1.2;
  },

  charge(e, dt, p, m) {
    if (m.t === 0) { m.state = 'windup'; m.k = 0; m.count = e.phase2 ? 3 : 2; }
    m.k += dt;
    if (m.state === 'windup') {
      if (m.k < 0.45) e.chargeAng = angleTo(e.x, e.y, p.x, p.y);
      e.windup = true;
      if (m.k > 0.65) { m.state = 'dash'; m.k = 0; e.windup = false; Sound.play('dash'); }
    } else if (m.state === 'dash') {
      const hit = walk(e, e.chargeAng, 430, dt);
      if (Math.random() < dt * 40) FX.smoke(e.x, e.y + e.r * 0.6, 'rgba(255,200,160,0.6)', 1, 8);
      if (hit || m.k > 1.3) {
        if (hit) {
          ringShot(e, 12, bossShot(e), 120, rand(0, TAU), 0.8);
          FX.kick(9);
          Sound.play('slam');
        }
        m.count--;
        m.state = m.count > 0 ? 'windup' : 'rest';
        m.k = 0;
      }
    } else if (m.k > 0.5) return true;
    return false;
  },

  laser(e, dt, p, m) {
    if (m.t === 0) { m.ang = angleTo(e.x, e.y, p.x, p.y); m.tick = 0; Sound.play('warn'); }
    const aimT = 1.0, fireT = e.phase2 ? 1.5 : 1.1;
    if (m.t < aimT) {
      m.ang += angleDiff(m.ang, angleTo(e.x, e.y, p.x, p.y)) * Math.min(1, dt * 5);
      e.laser = { ang: m.ang, len: rayLength(e.x, e.y, m.ang), on: false };
      return false;
    }
    if (!m.fired) { m.fired = true; Sound.play('zap'); FX.kick(5); }
    if (e.phase2) m.ang += clamp(angleDiff(m.ang, angleTo(e.x, e.y, p.x, p.y)), -0.9 * dt, 0.9 * dt);
    const len = rayLength(e.x, e.y, m.ang);
    e.laser = { ang: m.ang, len, on: true };
    // distance from player to the beam
    const dx = Math.cos(m.ang), dy = Math.sin(m.ang);
    const px = p.x - e.x, py = p.y - e.y;
    const along = clamp(px * dx + py * dy, 0, len);
    const off = Math.hypot(px - dx * along, py - dy * along);
    if (off < 11 + p.r) hurtPlayer(e.dmg * 1.1);
    if (Math.random() < dt * 30) {
      FX.burst(e.x + dx * len, e.y + dy * len, [e.pal.light, '#ffffff'], 2, { min: 40, max: 120 });
    }
    if (m.t >= aimT + fireT) { e.laser = null; return true; }
    return false;
  },

  teleport(e, dt, p, m) {
    if (m.t === 0) { m.state = 'out'; m.k = 0; Sound.play('blink'); }
    m.k += dt;
    if (m.state === 'out') {
      e.alpha = clamp(1 - m.k / 0.4, 0, 1);
      e.hidden = e.alpha < 0.3;
      if (m.k >= 0.4) {
        for (let i = 0; i < 12; i++) {
          const x = rand(ROOM_X + 50, ROOM_X + ROOM_W - 50), y = rand(ROOM_Y + 60, ROOM_Y + ROOM_H * 0.55);
          if (dist(x, y, p.x, p.y) > 150 || i === 11) { e.x = x; e.y = y; break; }
        }
        m.state = 'in'; m.k = 0;
        FX.burst(e.x, e.y, [e.pal.light, '#ffffff'], 16, { min: 40, max: 140 });
      }
    } else if (m.state === 'in') {
      e.alpha = clamp(m.k / 0.4, 0, 1);
      e.hidden = e.alpha < 0.3;
      if (m.k >= 0.4) {
        e.alpha = 1; e.hidden = false;
        ringShot(e, e.phase2 ? 20 : 16, bossShot(e, 1), 120, rand(0, TAU), 0.8);
        spreadShot(e, angleTo(e.x, e.y, p.x, p.y), 5, 0.6, bossShot(e), 170, 0.8);
        m.state = 'rest'; m.k = 0;
      }
    } else if (m.k > 0.4) return true;
    return false;
  },
};

function bossDefeated(e) {
  for (const o of G.enemies) {
    if (o !== e && !o.dead) {
      o.dead = true;
      FX.burst(o.x, o.y, [o.pal.main, '#ffffff'], 10, { min: 40, max: 140 });
    }
  }
  G.eshots.length = 0;
  G.strikes = G.strikes.filter(s => s.owner === 'player');
  G.warns.length = 0;
  G.bossDead = true;
  G.bossDeadT = 0;
  FX.ring(e.x, e.y, 200, '#ffffff', 0.9, 10);
  FX.kick(14);
  vibrate([80, 50, 160]);
  save.stats.bosses++;
  UI.bossBar(null);
}
