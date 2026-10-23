'use strict';
// The run: rooms, clearing them, perks, shots, pickups, camera and drawing the game world.

const G = {
  state: 'menu', world: WORLDS[0], worldIdx: 0, run: null, player: null,
  enemies: [], shots: [], eshots: [], pickups: [], helpers: [], zones: [], warns: [], strikes: [],
  time: 0, roomIdx: 1, roomType: 'normal', cleared: false, clearT: 0, perkShown: false,
  doorOpen: false, doorT: 0, camY: 0, viewH: 640, hudH: 50, nextId: 0, scale: 1, dpr: 1,
  boss: null, bossDead: false, bossDeadT: 0, fade: 0, fadeDir: 0, fadeCb: null, choices: [], perkReason: null,
};

// ---------- run flow ----------

function startRun(worldIdx, resume) {
  const hero = HERO_BY_ID[resume ? resume.hero : save.hero] || HEROES[0];
  G.worldIdx = worldIdx;
  G.world = WORLDS[worldIdx];
  G.run = resume || {
    world: worldIdx, hero: hero.id, room: 1, perks: {}, gold: 0, gems: 0, kills: 0, damage: 0, time: 0,
    livesUsed: 0, metaRevive: upgradeLevel('revive') > 0, rerolls: upgradeLevel('reroll'),
    startPicks: upgradeLevel('start'), hp: null,
  };
  G.player = createPlayer(hero, G.run.perks);
  G.player.livesUsed = G.run.livesUsed || 0;
  G.helpers = [];
  syncHelpers(G.player);
  if (resume && resume.hp) G.player.hp = clamp(resume.hp, 1, G.player.s.maxHp);
  if (!resume) { save.stats.runs++; writeSave(); }
  G.time = 0;
  UI.hide();
  UI.hud(true);
  enterRoom(G.run.room);
}

function roomTypeOf(idx) {
  return idx === ROOMS_PER_WORLD ? 'boss' : idx % 5 === 0 ? 'elite' : 'normal';
}

function enterRoom(idx) {
  const w = G.world;
  G.roomIdx = idx;
  G.roomType = roomTypeOf(idx);
  generateRoom(w, idx, G.roomType);
  room.fxTiles = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = room.grid[tileIndex(c, r)];
    if (t === TILE.LAVA || t === TILE.WATER || t === TILE.SPIKES) room.fxTiles.push([c, r, t]);
  }
  rebuildRoomBG();
  G.enemies = []; G.shots = []; G.eshots = []; G.pickups = []; G.zones = []; G.warns = []; G.strikes = [];
  FX.clear();
  const p = G.player;
  Object.assign(p, { x: DOOR_X, y: ROOM_Y + ROOM_H - 36, vx: 0, vy: 0, invuln: 1, target: null, dead: false, slowT: 0 });
  p.volleys.length = 0;
  for (const h of G.helpers) { h.x = p.x; h.y = p.y; }
  Object.assign(G, { cleared: false, clearT: 0, perkShown: false, doorOpen: false, doorT: 0, boss: null, bossDead: false, bossDeadT: 0, winShown: false });
  G.camY = cameraTarget();
  G.run.room = idx;
  G.run.hp = p.hp;
  G.run.perks = p.perks;
  writeRun(G.run);
  if (idx > (save.best[w.id] || 0)) { save.best[w.id] = idx; writeSave(); }
  UI.updateHud();
  UI.bossBar(null);
  Sound.playMusic(G.roomType === 'boss' ? 'boss' : w.music);
  if (idx === 1 && G.run.startPicks > 0) {
    G.state = 'perk';
    showPerkChoice('start');
    return;
  }
  beginRoom();
}

function beginRoom() {
  G.state = 'play';
  spawnRoomEnemies();
  const w = G.world;
  if (G.roomType === 'boss') {
    UI.banner('BOSS', BOSSES[w.boss].name, 'boss');
    UI.bossBar(BOSSES[w.boss].name);
    Sound.play('boss');
    FX.kick(6);
  } else if (G.roomType === 'elite') {
    UI.banner('Elite Room', ENEMIES[G.enemies[0].type].name, 'elite');
  } else {
    UI.banner(`Room ${G.roomIdx}`, G.roomIdx === 1 ? w.name : '', '');
  }
  if (G.roomIdx === 1 && !save.seenHint) UI.hint(isTouch ? 'Drag anywhere to move. Stand still to shoot faster!' : 'Move with WASD or the arrow keys. Stand still to shoot faster!');
}

function spawnRoomEnemies() {
  const w = G.world, idx = G.roomIdx, p = G.player;
  if (G.roomType === 'boss') { spawnBoss(w.boss); return; }
  const types = w.enemies.slice(0, Math.min(w.enemies.length, 2 + Math.floor((idx - 1) / 3)));
  let budget = 3 + idx * 0.3 + G.worldIdx * 0.4;
  let n = 0;
  if (G.roomType === 'elite') {
    const key = w.elites[clamp(idx / 5 - 1, 0, w.elites.length - 1)];
    spawnEnemy(key, DOOR_X, ROOM_Y + 120, { spawnT: 0.9 });
    budget = 1.2 + idx * 0.1;
  }
  while (budget > 0.4 && n < 12) {
    const type = pick(types), def = ENEMIES[type];
    const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 190, maxRow: ROWS - 6, ground: !def.flying });
    spawnEnemy(type, spot.x, spot.y, { spawnT: 0.5 + n * 0.07 });
    budget -= def.cost;
    n++;
  }
}

function onRoomCleared() {
  G.cleared = true;
  G.clearT = 0;
  for (const b of G.eshots) FX.burst(b.x, b.y, b.color, 2, { min: 20, max: 60 });
  G.eshots.length = 0;
  G.strikes = G.strikes.filter(s => s.owner === 'player');
  G.warns.length = 0;
  G.zones = G.zones.filter(z => !z.dmg);
  Sound.play('clear');
  UI.banner('Cleared!', '', 'clear');
  const p = G.player;
  if (p.s.roomHeal > 0) healPlayer(p.s.maxHp * p.s.roomHeal);
  if (!save.seenHint) { save.seenHint = true; writeSave(); }
}

function showPerkChoice(reason) {
  G.state = 'perk';
  G.perkShown = true;
  G.perkReason = reason;
  const minRank = reason === 'room' && G.roomType === 'elite' ? 1 : 0;
  G.choices = rollPerks(G.player, 2, minRank);
  if (!G.choices.length) { finishPerk(); return; }
  UI.perks(G.choices, reason);
}

function choosePerk(i) {
  const perk = G.choices[i];
  if (!perk || G.state !== 'perk') return;
  const p = G.player;
  p.perks[perk.id] = (p.perks[perk.id] || 0) + 1;
  refreshStats(p);
  if (perk.onPick) perk.onPick(p);
  G.run.perks = p.perks;
  Sound.play('perk');
  FX.ring(p.x, p.y, 50, RARITY[perk.rarity].color, 0.6, 6);
  FX.burst(p.x, p.y, [RARITY[perk.rarity].color, '#ffffff'], 16, { min: 50, max: 160 });
  FX.text(p.x, p.y - 36, perk.name, RARITY[perk.rarity].color, 12, { life: 1.2 });
  finishPerk();
}

function finishPerk() {
  UI.hide();
  if (G.perkReason === 'start') {
    G.run.startPicks--;
    writeRun(G.run);
    if (G.run.startPicks > 0) { showPerkChoice('start'); return; }
    beginRoom();
    return;
  }
  G.state = 'play';
  G.doorOpen = true;
  G.run.hp = G.player.hp;
  Sound.play('door');
}

function rerollPerks() {
  if (G.state !== 'perk' || G.run.rerolls <= 0) return;
  G.run.rerolls--;
  const minRank = G.perkReason === 'room' && G.roomType === 'elite' ? 1 : 0;
  G.choices = rollPerks(G.player, 2, minRank);
  UI.perks(G.choices, G.perkReason);
}

function nextRoom() {
  if (G.fadeDir) return;
  G.state = 'transition';
  Sound.play('door');
  fadeTo(() => {
    G.run.hp = G.player.hp;
    enterRoom(G.roomIdx + 1);
  });
}

function fadeTo(cb) {
  G.fadeDir = 1;
  G.fadeCb = cb;
}

function playerDied() {
  G.state = 'dying';
  G.dyingT = 0;
  UI.bossBar(null);
}

function endRun(won) {
  const run = G.run;
  save.gold += run.gold;
  save.gems += run.gems;
  save.stats.kills += run.kills || 0;
  if (!won) save.stats.deaths++;
  clearRun();
  writeSave();
  return {
    world: G.world, room: G.roomIdx, gold: run.gold, gems: run.gems, kills: run.kills || 0,
    time: run.time, perks: Object.assign({}, G.player.perks), hero: G.player.hero,
  };
}

function gameOver() {
  G.state = 'over';
  const sum = endRun(false);
  Sound.stopMusic();
  UI.hud(false);
  UI.gameOver(sum);
}

function victory() {
  G.state = 'won';
  G.winShown = true;
  const w = G.world;
  const first = !save.cleared[w.id];
  G.run.gems += first ? 10 : 3;
  save.cleared[w.id] = (save.cleared[w.id] || 0) + 1;
  let unlockedWorld = null;
  if (G.worldIdx + 2 > save.unlocked && G.worldIdx + 1 < WORLDS.length) {
    save.unlocked = G.worldIdx + 2;
    unlockedWorld = WORLDS[G.worldIdx + 1];
  }
  const sum = endRun(true);
  sum.first = first;
  sum.unlocked = unlockedWorld;
  Sound.stopMusic();
  Sound.play('victory');
  UI.hud(false);
  UI.victory(sum);
}

function quitRun() {
  G.state = 'over';
  endRun(false);
  save.stats.deaths--;
  writeSave();
  UI.hud(false);
  UI.title();
}

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  Input.release();
  UI.pause();
}
function resumeGame() {
  if (G.state !== 'pause') return;
  UI.hide();
  G.state = 'play';
}

// ---------- per-frame update ----------

function updateGame(dt) {
  if (G.fadeDir) {
    G.fade = clamp(G.fade + G.fadeDir * dt * 3.2, 0, 1);
    if (G.fadeDir > 0 && G.fade >= 1) {
      G.fadeDir = -1;
      const cb = G.fadeCb;
      G.fadeCb = null;
      if (cb) cb();
    } else if (G.fadeDir < 0 && G.fade <= 0) G.fadeDir = 0;
  }
  if (G.state === 'dying') {
    FX.update(dt);
    G.dyingT += dt;
    if (G.dyingT > 1.5) gameOver();
    return;
  }
  if (G.state !== 'play') return;
  G.time += dt;
  G.run.time += dt;
  const p = G.player;
  updatePlayer(p, dt);
  if (G.state !== 'play') return;
  updateHelpers(p, dt);
  updateFlow(p.x, p.y);
  for (const e of G.enemies) updateEnemy(e, dt, p);
  separateEnemies();
  contactDamage(p);
  updateShots(dt);
  updateEnemyShots(dt, p);
  updateZones(dt, p);
  updateWarns(dt);
  updateStrikes(dt, p);
  updatePickups(dt, p);
  FX.update(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  if (G.boss && !G.bossDead) UI.bossHp(G.boss.hp / G.boss.maxHp);
  if (G.state !== 'play') return;

  if (G.roomType === 'boss') {
    if (G.bossDead) {
      G.bossDeadT += dt;
      if (G.bossDeadT > 0.5) G.cleared = true;
      if (G.bossDeadT > 3.2 && !G.winShown) victory();
    }
  } else if (!G.cleared && G.enemies.length === 0) {
    onRoomCleared();
  } else if (G.cleared && !G.perkShown) {
    G.clearT += dt;
    if (G.clearT > 1.8 || (G.clearT > 0.8 && G.pickups.length === 0)) showPerkChoice('room');
  }
  if (G.doorOpen) G.doorT = Math.min(1, G.doorT + dt * 1.5);
  updateCamera(dt);
}

function contactDamage(p) {
  for (const e of G.enemies) {
    if (e.spawnT > 0 || e.dead || e.hidden || (e.z || 0) > 8 || e.status.freeze > 0) continue;
    const rr = e.r + p.r - 4;
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 >= rr * rr) continue;
    if (hurtPlayer(e.dmg) && !e.boss && !e.elite) {
      const a = angleTo(p.x, p.y, e.x, e.y);
      e.kbx = Math.cos(a) * 220;
      e.kby = Math.sin(a) * 220;
    }
    const d = Math.sqrt(d2);
    if (d > 0.01) {
      const push = (rr - d) * 0.5;
      p.x -= ((e.x - p.x) / d) * push;
      p.y -= ((e.y - p.y) / d) * push;
      resolveTiles(p, true);
    }
  }
}

function nearestEnemy(x, y, exclude, maxD = Infinity) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) {
    if (!canTarget(e) || (exclude && exclude.includes(e.id))) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateShots(dt) {
  const S = G.shots;
  for (let i = S.length - 1; i >= 0; i--) {
    const b = S[i];
    b.life -= dt;
    if (b.life <= 0) { S.splice(i, 1); continue; }
    if (b.homing) {
      if (!b.target || !canTarget(b.target)) b.target = nearestEnemy(b.x, b.y, b.hit);
      if (b.target) {
        const sp = Math.hypot(b.vx, b.vy);
        let a = Math.atan2(b.vy, b.vx);
        a += clamp(angleDiff(a, angleTo(b.x, b.y, b.target.x, b.target.y)), -b.homing * dt, b.homing * dt);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
      }
    }
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (tileAt(nx, ny) === TILE.WALL) {
      if (b.bounce > 0) {
        b.bounce--;
        const hx = tileAt(nx, b.y) === TILE.WALL, hy = tileAt(b.x, ny) === TILE.WALL;
        if (hx) b.vx = -b.vx;
        if (hy) b.vy = -b.vy;
        if (!hx && !hy) { b.vx = -b.vx; b.vy = -b.vy; }
        b.hit.length = 0;
        FX.burst(b.x, b.y, '#ffffff', 3, { type: 'spark', min: 40, max: 100 });
        continue;
      }
      FX.burst(nx, ny, b.glow || '#e8d2a8', 3, { min: 30, max: 90 });
      S.splice(i, 1);
      continue;
    }
    b.x = nx; b.y = ny;
    let gone = false;
    for (const e of G.enemies) {
      if (!canTarget(e) || b.hit.includes(e.id)) continue;
      const ey = e.y - (e.z || 0);
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, ey) > rr * rr) continue;
      b.hit.push(e.id);
      shotHits(b, e);
      if (b.ric > 0) {
        const next = nearestEnemy(b.x, b.y, b.hit, 180);
        if (next) {
          b.ric--;
          const sp = Math.hypot(b.vx, b.vy), a = angleTo(b.x, b.y, next.x, next.y);
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
          b.target = next;
          b.life = Math.max(b.life, 1);
          break;
        }
      }
      if (b.pierce > 0) { b.pierce--; continue; }
      gone = true;
      break;
    }
    if (gone) S.splice(i, 1);
  }
}

function updateEnemyShots(dt, p) {
  const S = G.eshots;
  for (let i = S.length - 1; i >= 0; i--) {
    const b = S[i];
    b.life -= dt;
    if (b.accel) {
      const k = 1 + b.accel * dt;
      b.vx *= k; b.vy *= k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || (!b.ghost && tileAt(b.x, b.y) === TILE.WALL)) {
      FX.burst(b.x, b.y, b.color, 3, { min: 20, max: 70 });
      S.splice(i, 1);
      continue;
    }
    const rr = b.r + p.r - 3;
    if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
      if (hurtPlayer(b.dmg) && b.slow) p.slowT = 1.5;
      S.splice(i, 1);
    }
  }
}

function updateZones(dt, p) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    z.life -= dt;
    if (z.life <= 0) { G.zones.splice(i, 1); continue; }
    if (z.dmg && dist(z.x, z.y, p.x, p.y) < z.r + p.r * 0.5) hurtPlayer(z.dmg);
  }
}

function updateWarns(dt) {
  for (let i = G.warns.length - 1; i >= 0; i--) {
    const w = G.warns[i];
    w.t -= dt;
    if (w.follow) { w.x = w.follow.x; w.y = w.follow.y; if (w.follow.dead) w.t = 0; }
    if (w.t <= 0) G.warns.splice(i, 1);
  }
}

function updateStrikes(dt, p) {
  for (let i = G.strikes.length - 1; i >= 0; i--) {
    const s = G.strikes[i];
    s.t -= dt;
    if (s.t > 0) continue;
    G.strikes.splice(i, 1);
    if (s.owner === 'enemy') {
      if (dist(s.x, s.y, p.x, p.y) < s.r + p.r * 0.6) hurtPlayer(s.dmg);
      if (s.kind === 'root') {
        G.zones.push({ x: s.x, y: s.y, r: s.r, life: 0.6, max: 0.6, dmg: 0, kind: 'root' });
        FX.burst(s.x, s.y, ['#8a5a36', '#5fbf4a'], 5, { min: 40, max: 110 });
      } else {
        FX.ring(s.x, s.y, s.r * 1.4, '#ff8a2a', 0.4, 5);
        FX.burst(s.x, s.y, ['#ff8a2a', '#ffd35a', '#5a3a36'], 12, { min: 60, max: 180 });
        FX.kick(3);
        if (s.zone) G.zones.push({ x: s.x, y: s.y, r: s.r * 0.8, life: 2.4, max: 2.4, dmg: Math.round(s.dmg * 0.35), color: '#ff7a2a' });
      }
      Sound.play('slam');
    } else {
      for (const e of G.enemies) {
        if (canTarget(e) && dist(e.x, e.y, s.x, s.y) < s.r + e.r) {
          hurtEnemy(e, s.dmg, { color: '#ffb36a' });
          e.status.burn = 2.5;
          e.status.burnDps = Math.max(e.status.burnDps, playerAtk(p) * 0.25);
        }
      }
      FX.ring(s.x, s.y, s.r * 1.3, '#ffb02e', 0.4, 6);
      FX.burst(s.x, s.y, ['#ff8a2a', '#ffd35a', '#ffffff'], 18, { min: 60, max: 200 });
      FX.kick(4);
      Sound.play('explode');
    }
  }
}

function updatePickups(dt, p) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.t += dt;
    const d = dist(k.x, k.y, p.x, p.y);
    if (k.t > 0.4 && (G.cleared || d < 50)) {
      k.speed = Math.min(800, k.speed + 1500 * dt);
      const a = angleTo(k.x, k.y, p.x, p.y);
      k.x += Math.cos(a) * k.speed * dt;
      k.y += Math.sin(a) * k.speed * dt;
    } else {
      const f = Math.exp(-4 * dt);
      k.vx *= f; k.vy *= f;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.r = 4;
      resolveTiles(k, true);
    }
    if (dist(k.x, k.y, p.x, p.y) < p.r + 7) {
      G.pickups.splice(i, 1);
      if (k.kind === 'coin') {
        G.run.gold += k.value;
        Sound.play('coin');
        FX.burst(k.x, k.y, '#ffcf3f', 2, { min: 20, max: 60 });
        UI.updateGold();
      } else if (k.kind === 'heart') {
        healPlayer(p.s.maxHp * k.value);
      } else if (k.kind === 'gem') {
        G.run.gems += k.value;
        Sound.play('gem');
        FX.text(p.x, p.y - 34, `+${k.value} gem${k.value > 1 ? 's' : ''}`, '#5ff2ff', 11);
      }
    }
  }
}

// ---------- camera ----------

function cameraTarget() {
  const vh = G.viewH;
  const min = -G.hudH, max = WORLD_H - vh + 6;
  if (max <= min) return -(G.hudH + (vh - G.hudH - WORLD_H) / 2);
  const p = G.player;
  return clamp((p ? p.y : WORLD_H / 2) - vh * 0.56, min, max);
}
function updateCamera(dt) {
  G.camY += (cameraTarget() - G.camY) * Math.min(1, dt * 7);
}

function rebuildRoomBG() {
  const s = Math.min(3, G.scale * G.dpr);
  room.bg = renderRoomBG(G.world, s);
}

// ---------- drawing ----------

const ART_TOP = { treant: 2.4, magmaKing: 1.5, lich: 2, stump: 1.6, mushroom: 1.3, mage: 1.8, goblin: 1.6, skeleton: 1.7, yeti: 1.3, golem: 1.2 };

function drawGame(ctx) {
  const w = G.world, t = G.time, p = G.player;
  ctx.fillStyle = w.theme.bg;
  ctx.fillRect(0, 0, VIEW_W, G.viewH);
  ctx.save();
  const sh = FX.shake;
  ctx.translate(sh ? rand(-sh, sh) * 0.5 : 0, -G.camY + (sh ? rand(-sh, sh) * 0.5 : 0));
  if (room.bg) ctx.drawImage(room.bg, 0, 0, WORLD_W, WORLD_H);
  drawTileFx(ctx, w, t);
  drawDoor(ctx, w, G.doorT, t);

  // ground layer: puddles, warnings
  for (const z of G.zones) drawZone(ctx, z, t);
  for (const wn of G.warns) {
    const k = 1 - wn.t / wn.max;
    ctx.beginPath(); ctx.arc(wn.x, wn.y, wn.r, 0, TAU);
    ctx.fillStyle = 'rgba(255,60,80,0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,80,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(wn.x, wn.y, wn.r * k, 0, TAU);
    ctx.fillStyle = 'rgba(255,60,80,0.25)'; ctx.fill();
  }
  for (const s of G.strikes) {
    const k = 1 - s.t / s.max;
    const c = s.owner === 'player' ? '255,170,40' : '255,60,80';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.strokeStyle = `rgba(${c},0.7)`; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * k, 0, TAU);
    ctx.fillStyle = `rgba(${c},0.25)`; ctx.fill();
  }
  for (const e of G.enemies) drawTelegraph(ctx, e, p, t);
  FX.drawBelow(ctx);

  for (const k of G.pickups) {
    drawShadow(ctx, k.x, k.y + 5, 4, 0.18);
    const hop = Math.abs(Math.sin(k.t * 5 + k.seed)) * 2;
    if (k.kind === 'coin') drawCoin(ctx, k.x, k.y - hop, k.t, k.seed);
    else if (k.kind === 'heart') drawHeart(ctx, k.x, k.y - hop, 6);
    else drawGem(ctx, k.x, k.y - hop, 6);
  }

  // shadows
  for (const e of G.enemies) {
    if (e.spawnT > 0 && e.spawnT > e.spawnMax * 0.7) continue;
    const zk = e.z ? clamp(1 - e.z / 120, 0.4, 1) : 1;
    drawShadow(ctx, e.x, e.y + e.r * (e.flying ? 1.3 : 0.75), e.r * 0.95 * zk, e.flying ? 0.15 : 0.24);
  }
  if (!p.dead) drawShadow(ctx, p.x, p.y + 9, 9);

  // focus ring: standing still makes you shoot faster
  if (!p.dead && !p.moving && p.target && p.s.moveRate < 1 && G.state === 'play') {
    const k = clamp(p.stillT * 5, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y + 6);
    ctx.scale(1, 0.4);
    ctx.rotate(t * 2);
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU);
    ctx.strokeStyle = `rgba(255,214,90,${0.7 * k})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // entities sorted by depth
  const list = G.enemies.slice().sort((a, b) => (a.y + (a.flying ? 1000 : 0)) - (b.y + (b.flying ? 1000 : 0)));
  let playerDrawn = p.dead;
  for (const e of list) {
    if (!playerDrawn && !e.flying && e.y > p.y) { drawPlayer(ctx, p, t); playerDrawn = true; }
    if (!playerDrawn && e.flying) { drawPlayer(ctx, p, t); playerDrawn = true; }
    if (e.elite || e.boss) glow(ctx, e.x, e.y - (e.z || 0), e.r * 2.6, e.boss ? (e.phase2 ? '#ff5a6e' : e.pal.light) : '#ffcf3f', 0.3 + Math.sin(t * 4) * 0.08);
    drawEnemy(ctx, e, t);
    if (e.status.freeze > 0) {
      rrect(ctx, e.x - e.r * 1.1, e.y - e.r * 1.4, e.r * 2.2, e.r * 2.2, 5);
      ctx.fillStyle = 'rgba(170,230,255,0.45)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (e.dizzy) {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * TAU) / 3;
        star(ctx, e.x + Math.cos(a) * e.r * 0.8, e.y - e.r * 1.3 + Math.sin(a) * 3, 2.5, '#ffe55a');
      }
    }
    if (e.laser) drawLaser(ctx, e, t);
  }
  if (!playerDrawn) drawPlayer(ctx, p, t);
  for (const h of G.helpers) drawHelper(ctx, h, t);

  for (const b of G.shots) drawPlayerShot(ctx, b, t);
  for (const b of G.eshots) drawEnemyShot(ctx, b, t);
  for (const s of G.strikes) if (s.kind === 'meteor' && s.t < 0.55) drawMeteor(ctx, s, t);
  FX.draw(ctx);

  // health bars
  for (const e of G.enemies) {
    if (e.boss || e.spawnT > 0 || e.hidden) continue;
    if (!e.elite && e.hp >= e.maxHp) continue;
    const bw = e.elite ? 44 : Math.max(20, e.r * 1.9), bh = e.elite ? 5 : 3.5;
    const by = e.y - (e.z || 0) - e.r * (ART_TOP[e.def.art] || 1.25) - (e.elite ? 14 : 7);
    hpBar(ctx, e.x - bw / 2, by, bw, bh, e.hp / e.maxHp, e.elite ? '#ffb321' : '#ff5a5f');
  }
  if (!p.dead) {
    hpBar(ctx, p.x - 18, p.y - 34, 36, 5, p.hp / p.s.maxHp, '#5fd068');
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = OL;
    ctx.strokeText(Math.ceil(p.hp), p.x, p.y - 35);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.ceil(p.hp), p.x, p.y - 35);
  }
  FX.drawTexts(ctx);
  ctx.restore();
}

function drawPlayer(ctx, p, t) {
  if (p.dead) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.invuln > 0 && p.flash <= 0 && Math.floor(t * 14) % 2 === 0 && p.invuln < 0.9) ctx.globalAlpha = 0.45;
  ART.flash = p.flash > 0 ? Math.min(1, p.flash * 6) : 0;
  drawHero(ctx, p.hero, { aim: p.aim, walk: p.walk, moving: p.moving, recoil: p.recoil, t: p.t, ready: p.ready });
  ART.flash = 0;
  ctx.restore();
  if (p.shieldUp) {
    ctx.beginPath(); ctx.arc(p.x, p.y - 4, 19, 0, TAU);
    ctx.fillStyle = 'rgba(255,229,138,0.12)'; ctx.fill();
    ctx.strokeStyle = `rgba(255,229,138,${0.55 + Math.sin(t * 5) * 0.2})`; ctx.lineWidth = 2; ctx.stroke();
  }
  if (p.slowT > 0) {
    ctx.beginPath(); ctx.arc(p.x, p.y + 6, 12, 0, TAU);
    ctx.fillStyle = 'rgba(127,220,255,0.25)'; ctx.fill();
  }
}

function hpBar(ctx, x, y, w, h, k, color) {
  rrect(ctx, x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
  ctx.fillStyle = OL; ctx.fill();
  if (k > 0) {
    rrect(ctx, x, y, Math.max(h, w * clamp(k, 0, 1)), h, h / 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 1, y + 0.6, Math.max(0, w * clamp(k, 0, 1) - 2), h * 0.35);
  }
}

function drawTelegraph(ctx, e, p, t) {
  if (e.spawnT > 0) return;
  if ((e.state === 'windup' && e.def.dash) || e.windup) {
    const a = e.windup ? e.chargeAng : e.look;
    const len = Math.min(380, rayLength(e.x, e.y, a));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(255,60,80,${0.16 + Math.sin(t * 20) * 0.06})`;
    ctx.fillRect(0, -e.r, len, e.r * 2);
    ctx.strokeStyle = 'rgba(255,60,80,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, -e.r, len, e.r * 2);
    ctx.restore();
  } else if (e.state === 'aim' && e.def.fire) {
    const len = Math.min(500, rayLength(e.x, e.y, e.look));
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.look) * len, e.y + Math.sin(e.look) * len);
    ctx.strokeStyle = `rgba(255,60,80,${0.35 + Math.sin(t * 25) * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawLaser(ctx, e, t) {
  const L = e.laser;
  const x2 = e.x + Math.cos(L.ang) * L.len, y2 = e.y + Math.sin(L.ang) * L.len;
  ctx.lineCap = 'round';
  if (!L.on) {
    ctx.setLineDash([8, 6]);
    line(ctx, e.x, e.y, x2, y2, `rgba(255,60,80,${0.5 + Math.sin(t * 30) * 0.3})`, 2);
    ctx.setLineDash([]);
  } else {
    const wob = 1 + Math.sin(t * 50) * 0.12;
    line(ctx, e.x, e.y, x2, y2, rgba(e.pal.light, 0.3), 26 * wob);
    line(ctx, e.x, e.y, x2, y2, rgba(e.pal.light, 0.8), 13 * wob);
    line(ctx, e.x, e.y, x2, y2, '#ffffff', 5);
  }
}

function drawZone(ctx, z, t) {
  const k = clamp(z.life / Math.min(0.5, z.max), 0, 1);
  if (z.kind === 'root') {
    const g = 1 - z.life / z.max;
    const h = g < 0.3 ? g / 0.3 : 1 - (g - 0.3) / 0.7;
    for (const [dx, s] of [[-6, 0.8], [0, 1.1], [6, 0.9]]) {
      ctx.beginPath();
      ctx.moveTo(z.x + dx - 4, z.y + 4);
      ctx.lineTo(z.x + dx, z.y + 4 - 22 * s * h);
      ctx.lineTo(z.x + dx + 4, z.y + 4);
      ctx.closePath();
      fs(ctx, '#8a5a36', 1.6);
    }
    return;
  }
  ctx.globalAlpha = k * 0.9;
  glow(ctx, z.x, z.y, z.r * 2.2, z.color, 0.6);
  ell(ctx, z.x, z.y, z.r, z.r * 0.7);
  ctx.fillStyle = rgba(z.color, 0.55 + Math.sin(t * 8 + z.x) * 0.1);
  ctx.fill();
  ell(ctx, z.x, z.y, z.r * 0.5, z.r * 0.35);
  ctx.fillStyle = 'rgba(255,230,140,0.6)';
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMeteor(ctx, s, t) {
  const k = s.t / 0.55;
  const x = s.x + 60 * k, y = s.y - 260 * k;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 30, y - 60);
  ctx.strokeStyle = 'rgba(255,170,60,0.4)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.stroke();
  glow(ctx, x, y, 30, '#ff8a2a', 1);
  circ(ctx, x, y, 9); fs(ctx, '#7a4a3a', 2);
  circ(ctx, x - 2, y - 2, 4); ctx.fillStyle = '#ffb36a'; ctx.fill();
}

function drawJoystick(ctx) {
  const s = Input.stick;
  if (!s.active || G.state !== 'play') return;
  const k = 1 / G.scale;
  const ox = s.ox * k, oy = s.oy * k, R = Input.R * k;
  let dx = (s.x - s.ox) * k, dy = (s.y - s.oy) * k;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(ox + dx, oy + dy, R * 0.45, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(34,24,58,0.6)'; ctx.lineWidth = 2; ctx.stroke();
}
