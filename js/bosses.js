'use strict';
// Bosses: a list of attack moves that they cycle through. At 60% and 25% HP they raise a shield held
// up by three crystals and get angrier (phase 2 and 3); in phase 3 they add a signature move.
// After BOSS_FURY_AT seconds everything they do slowly speeds up.

function spawnBoss(key) {
  const def = Object.assign({ ai: 'boss' }, BOSSES[key]);
  const e = spawnEnemy('slime', DOOR_X, ROOM_Y + 150, { spawnT: 1.2 });
  const hp = Math.round(def.hp * TIER.hp ** G.tier);
  const firstOnTier = !G.world.depth && G.tier > (save.tiers[G.world.id] ?? -1);
  Object.assign(e, {
    def, type: key, r: def.r, pal: def.pal, hp, maxHp: hp, dmg: Math.round(def.dmg * TIER.dmg ** G.tier), speed: def.speed,
    state: 'intro', t: 1.4, boss: true, flying: !!def.flying, lastMove: null, phase2: false, phase3: false, m: null,
    phaseIdx: 0, shielded: false, crystals: [], fightT: 0, fury: 0, sinceSig: 0,
    // in The Depths the gems come from the milestones every fifth depth instead
    gems: G.world.depth ? 1 : def.gems * (firstOnTier ? 2 : 1) + Math.min(3, Math.floor(G.tier / 2)),
  });
  e.spawnMax = 1.2;
  if (G.world.bossAffix) {   // bosses in The Depths bring an affix along
    e.aff[G.world.bossAffix] = true;
    e.affList.push(G.world.bossAffix);
    addAffixes(e, 0);
  }
  G.boss = e;
  return e;
}

// How much of a hit the boss takes: nothing while shielded, and a hit that crosses a phase line
// stops on it (the shield goes up next frame).
function bossTakeHit(e, d) {
  if (e.shielded || e.shieldDue) return 0;
  const line = BOSS_PHASES[e.phaseIdx];
  if (line !== undefined && e.hp - d <= e.maxHp * line) {
    d = Math.max(0, Math.ceil(e.hp - e.maxHp * line));
    e.shieldDue = true;
  }
  return d;
}

function startShieldPhase(e) {
  e.phaseIdx++;
  e.shielded = true;
  if (e.phaseIdx === 1) {
    e.phase2 = true;
    FX.text(e.x, e.y - e.r - 30, 'ENRAGED!', '#ff5a6e', 18, { life: 1.6, pop: 0.6, vy: -30 });
  } else {
    e.phase3 = true;
    FX.text(e.x, e.y - e.r - 30, 'FINAL FORM!', '#ff5a6e', 18, { life: 1.6, pop: 0.6, vy: -30 });
  }
  FX.ring(e.x, e.y, 140, '#ff5a6e', 0.6, 8);
  FX.kick(9);
  Sound.play('boss');
  if (e.def.noCrystals) {   // the Iron Heart: no shield here, and in the last phase it breaks free
    e.shielded = false;
    if (e.phase3) heartBreaksFree(e);
    return;
  }
  // three crystals spread round the room hold the shield up
  const spots = [[ROOM_X + 55, ROOM_Y + ROOM_H * 0.42], [ROOM_X + ROOM_W - 55, ROOM_Y + ROOM_H * 0.42], [DOOR_X, ROOM_Y + ROOM_H * 0.78]];
  e.crystals = spots.map(([x, y]) => {
    const spot = blocksWalk(tileAt(x, y)) ? randomOpenSpot({ fromX: x, fromY: y, maxDist: 90 }) : { x, y };
    const c = spawnEnemy('crystal', spot.x, spot.y, { spawnT: 0.6 });
    c.hp = c.maxHp = Math.round(e.maxHp * 0.03);
    c.pal = { main: lighten(e.pal.light, 0.35), dark: e.pal.light, light: '#ffffff' };
    c.noLoot = true;
    c.anchored = true;
    return c;
  });
}

function breakShield(e) {
  e.shielded = false;
  e.crystals = [];
  FX.ring(e.x, e.y, e.r * 3, '#bfe6ff', 0.6, 8);
  FX.burst(e.x, e.y, ['#bfe6ff', '#ffffff'], 30, { min: 80, max: 260 });
  FX.text(e.x, e.y - e.r - 30, 'SHIELD BROKEN', '#bfe6ff', 15, { life: 1.3, pop: 0.5, vy: -30 });
  FX.kick(8);
  Sound.play('shield');
  // a short daze: the moment to hit back
  e.state = 'dazed';
  e.t = 1.6;
  e.dizzy = true;
  e.m = null;
  e.anim = null;
  e.alpha = 1;
  e.hidden = false;
  e.laser = null;
  e.lasers = null;
  e.windup = false;
  if (e.phase3) e.sinceSig = 99;   // open the last phase with the signature move
}

const bossShot = (e, k = 0) => (e.def.altShot && k % 2 ? e.def.altShot : e.def.shot);

function updateBoss(e, dt, p) {
  e.look = angleTo(e.x, e.y, p.x, p.y);
  if (e.state !== 'move' || e.move !== 'gale') G.gale = G.galeDir = null;
  e.slowK = e.status.slow > 0 ? 0.8 : 1;
  if (e.shieldDue) { e.shieldDue = false; startShieldPhase(e); }
  if (e.shielded && !e.def.noCrystals && e.crystals.every(c => c.dead)) breakShield(e);
  if (e.state === 'intro') {
    e.t -= dt;
    if (e.t <= 0) { e.state = 'idle'; e.t = 0.6; }
    return;
  }
  if (e.sealed) return;   // the Iron Heart waits behind its shield for the golem (fortress.js)
  e.fightT += dt;
  if (e.fightT > BOSS_FURY_AT && !e.fury) {
    FX.text(e.x, e.y - e.r - 30, 'FURY!', '#ff5a6e', 18, { life: 1.6, pop: 0.6, vy: -30 });
    Sound.play('boss');
  }
  e.fury = clamp((e.fightT - BOSS_FURY_AT) / 60, 0, 1);
  // the last phase and fury make everything the boss does faster
  dt *= (e.phase3 ? 1.25 : 1) * (1 + 0.5 * e.fury);
  if (e.state === 'dazed') {
    e.t -= dt;
    if (e.t <= 0) { e.state = 'idle'; e.t = 0.3; e.dizzy = false; }
    return;
  }
  if (e.state === 'idle') {
    e.wanderT = (e.wanderT || 0) - dt;
    if (!e.dest || e.wanderT <= 0 || dist(e.x, e.y, e.dest.x, e.dest.y) < 10) {
      // (the Iron Heart's room is very tall: it keeps to its own hall at the top)
      e.dest = { x: rand(ROOM_X + 70, ROOM_X + ROOM_W - 70), y: rand(ROOM_Y + 80, e.def.heart ? ROOM_Y + 330 : ROOM_Y + ROOM_H * 0.5) };
      e.wanderT = 2.2;
    }
    if (!e.def.heart || e.free) walk(e, angleTo(e.x, e.y, e.dest.x, e.dest.y), e.speed * (e.phase2 ? 1.4 : 1) * e.slowK, dt);
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
    e.lasers = null;
  }
}

function startBossMove(e) {
  const minions = G.enemies.filter(o => o.minion && !o.dead).length;
  const options = e.def.moves.filter(m => m !== e.lastMove && !(m === 'summon' && minions >= 4));
  // in the last phase every third move is the signature move
  e.sinceSig++;
  if (e.phase3 && e.sinceSig >= 3) { e.move = e.def.sig; e.sinceSig = 0; }
  else e.move = pick(options);
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
    if (m.t === 0) { m.state = 'windup'; m.k = 0; m.count = e.phase3 ? 3 : e.phase2 ? 2 : 1; }
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

  // Treant: roots burst up across the whole room except a narrow lane, twice, top to bottom
  rootfield(e, dt, p, m) {
    if (m.t === 0) { m.waves = 0; m.next = 0; m.lane = rand(ROOM_X + 70, ROOM_X + ROOM_W - 70); }
    if (m.t >= m.next && m.waves < 2) {
      if (m.waves) m.lane = clamp(m.lane + (m.lane < DOOR_X ? 1 : -1) * rand(100, 150), ROOM_X + 50, ROOM_X + ROOM_W - 50);
      for (let row = 0, y = ROOM_Y + 22; y < ROOM_Y + ROOM_H - 6; row++, y += 34) {
        for (let x = ROOM_X + 10 + (row % 2) * 20; x < ROOM_X + ROOM_W; x += 40) {
          if (Math.abs(x - m.lane) < 55 || tileAt(x, y) === TILE.WALL) continue;
          const t = 1.1 + ((y - ROOM_Y) / ROOM_H) * 0.6;
          G.strikes.push({ x, y, r: 20, t, max: t, dmg: e.dmg, owner: 'enemy', kind: 'root', quiet: true });
        }
      }
      Sound.play('warn');
      m.waves++;
      m.next += 2.1;
    }
    return m.waves >= 2 && m.t > m.next - 0.2;
  },

  // Magma King: three lava beams sweep round him
  eruption(e, dt, p, m) {
    const warnT = 1.0, fireT = 4.2;
    if (m.t === 0) { m.ang = rand(0, TAU); m.dir = chance(0.5) ? 1 : -1; Sound.play('warn'); }
    const on = m.t > warnT;
    if (on) {
      if (!m.fired) { m.fired = true; Sound.play('zap'); FX.kick(6); }
      m.ang += m.dir * 0.42 * dt;   // slow enough to walk along with the gap between two beams
    }
    e.lasers = [0, 1, 2].map(i => {
      const a = m.ang + (i * TAU) / 3;
      return { ang: a, len: rayLength(e.x, e.y, a), on };
    });
    if (on) {
      for (const L of e.lasers) {
        const dx = Math.cos(L.ang), dy = Math.sin(L.ang);
        const along = clamp((p.x - e.x) * dx + (p.y - e.y) * dy, 0, L.len);
        if (Math.hypot(p.x - e.x - dx * along, p.y - e.y - dy * along) < 12 + p.r) hurtPlayer(e.dmg);
      }
    }
    if (m.t >= warnT + fireT) { e.lasers = null; return true; }
    return false;
  },

  // Storm Roc: beats its wings so a strong wind pushes you one way for a few seconds
  gale(e, dt, p, m) {
    if (m.t === 0) {
      const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1]]);
      m.dx = dx; m.dy = dy; m.k = 0.8;
      Sound.play('warn');
    }
    e.anim = 'cast';
    G.galeDir = { x: m.dx, y: m.dy };
    G.gale = m.t > 0.6 ? { x: m.dx * 95, y: m.dy * 95 } : null;   // a moment to brace first
    m.k -= dt;
    if (m.t > 0.6 && m.k <= 0) {
      m.k = 0.9;
      spreadShot(e, angleTo(e.x, e.y, p.x, p.y), 5, 0.7, 'feather', 150, 0.8);
    }
    if (m.t > 4.1) { G.gale = G.galeDir = null; return true; }
    return false;
  },

  // Storm Roc: three waves of lightning all over the room, one bolt always aimed at you
  tempest(e, dt, p, m) {
    if (m.t === 0) { m.waves = 0; m.next = 0; }
    if (m.t >= m.next && m.waves < 3) {
      for (let i = 0; i < 14; i++) {
        const x = i === 0 ? p.x : rand(ROOM_X + 20, ROOM_X + ROOM_W - 20);
        const y = i === 0 ? p.y : rand(ROOM_Y + 20, ROOM_Y + ROOM_H - 20);
        const t = 1.0 + rand(0, 0.35);
        G.strikes.push({ x, y, r: 30, t, max: t, dmg: e.dmg, owner: 'enemy', kind: 'bolt', quiet: i > 0 });
      }
      Sound.play('warn');
      m.waves++;
      m.next += 1.3;
    }
    return m.waves >= 3 && m.t > m.next;
  },

  // Lich: splits into three; two are illusions that shoot but take no damage
  mirror(e, dt, p, m) {
    if (m.t === 0) {
      for (const o of G.enemies) if (o.decoy) o.life = 0;   // old illusions fade first
      const spots = shuffle([[ROOM_X + 70, ROOM_Y + 120], [DOOR_X, ROOM_Y + 90], [ROOM_X + ROOM_W - 70, ROOM_Y + 120]]);
      FX.burst(e.x, e.y, [e.pal.light, '#ffffff'], 16, { min: 40, max: 140 });
      e.x = spots[0][0]; e.y = spots[0][1];
      for (const [x, y] of spots.slice(1)) {
        const d = spawnEnemy('slime', x, y, { spawnT: 0.4 });
        Object.assign(d, {
          def: Object.assign({}, e.def, { ai: 'decoy' }), type: 'decoy', r: e.r, pal: e.pal, dmg: e.dmg,
          hp: 1, maxHp: 1, flying: true, decoy: true, noLoot: true, anchored: true, life: 7, cd: rand(0.6, 1.2), alpha: 0.82,
        });
      }
      for (const [x, y] of spots) FX.burst(x, y, [e.pal.light, '#ffffff'], 12, { min: 40, max: 120 });
      Sound.play('blink');
    }
    return m.t > 0.8;
  },
};

function bossDefeated(e) {
  G.gale = G.galeDir = null;
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
  if (!G.player.roomHits) save.stats.bossNoHit++;
  track('boss');
  UI.bossBar(null);
}
