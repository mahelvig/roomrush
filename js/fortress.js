'use strict';
// The Iron Citadel (world 5): tall rooms you climb from the bottom to the gate at the top. The towers
// on the way cannot be destroyed, but each one runs on a power core that can, and the cables on the
// floor show which core feeds which tower. Most rooms split into a safe route and a risky one with a
// chest at the far end. Every fifth room is a command room: three cores, one after the other, and a
// guardian. The boss room is an escort: a siege golem walks up to the Iron Heart while you break the
// cores that keep its gates shut.

const CORE_COLORS = ['#3fd1ff', '#ff8a3a', '#c06bff', '#7be05a', '#ff5a8a', '#ffe55a'];
const TOWER_FROM = { bolt: 1, cannon: 2, sweeper: 3, frost: 4, laser: 6, barracks: 7 };   // first room of each kind
const TOWER_DMG = 60;   // one tower hit in room 1, before world and room scaling (like enemy damage)
const BOLT_RANGE = 140, CANNON_RANGE = 320, FROST_RANGE = 95, SWEEP_LEN = 112, BARRACKS_RANGE = 330;
const towerKinds = idx => Object.keys(TOWER_FROM).filter(k => idx >= TOWER_FROM[k]);
const towerOn = tw => !G.cleared && !G.bossDead && !(tw.coreE && tw.coreE.dead);

// ---------- layout ----------
// A plan is painted into a builder F (grid, towers, cores, chests, gates) and then turned into room.fort.

function fortBuilder(rows) {
  setRoomRows(rows);
  return { rows, g: new Uint8Array(COLS * rows), towers: [], cores: [], chests: [], gates: [], special: new Map(), used: new Set() };
}
const fIn = (F, c, r) => c >= 0 && r >= 0 && c < COLS && r < F.rows;
const fFree = (F, c, r) => fIn(F, c, r) && F.g[tileIndex(c, r)] === TILE.FLOOR && !F.used.has(tileIndex(c, r));
// special: 'tower', 'gate' and 'cover' tiles are walls that are drawn as something else
function fWall(F, c, r, special) {
  if (!fIn(F, c, r)) return;
  F.g[tileIndex(c, r)] = TILE.WALL;
  if (special) F.special.set(tileIndex(c, r), special);
}
function fCore(F, c, r) {
  F.used.add(tileIndex(c, r));
  F.cores.push({ c, r, color: CORE_COLORS[F.cores.length % CORE_COLORS.length] });
  return F.cores.length - 1;
}
function fTower(F, kind, c, r, core, o) {
  fWall(F, c, r, 'tower');
  F.towers.push(Object.assign({ kind, c, r, core }, o));
}
// Crates to hide behind, never stacked on top of each other or onto a reserved tile.
function fCover(F, rng, c0, c1, r0, r1, n, avoidRows = []) {
  for (let k = 0, tries = 0; k < n && tries < 24; tries++) {
    const c = c0 + Math.floor(rng() * (c1 - c0 + 1)), r = r0 + Math.floor(rng() * (r1 - r0 + 1));
    if (avoidRows.includes(r) || !fFree(F, c, r) || !fFree(F, c, r - 1) || !fFree(F, c, r + 1)) continue;
    fWall(F, c, r, 'cover');
    k++;
  }
}
const rngPick = (rng, list) => list[Math.floor(rng() * list.length)];

// Two lanes beside a wall down the middle. The risky lane has more towers and a chest at its far end;
// the safe lane's core sits where the lane starts, the risky lane's halfway up it.
function fortSplit(F, r0, rng, idx, kinds) {
  const h = 11;
  for (let r = r0 + 1; r < r0 + h - 1; r++) fWall(F, 5, r);
  const lane = kinds.filter(k => k !== 'barracks');
  const riskyLeft = rng() < 0.5;
  for (const left of [true, false]) {
    const risky = left === riskyLeft;
    const outer = left ? 0 : 10, inner = left ? 4 : 6, mid = left ? 2 : 8;
    const core = fCore(F, mid, risky ? r0 + 5 : r0 + h - 2);
    const rows = risky ? (idx >= 11 ? [r0 + 2, r0 + 4, r0 + 8] : [r0 + 3, r0 + 8]) : [r0 + 4 + Math.floor(rng() * 3)];
    rows.forEach((r, i) => {
      const kind = rngPick(rng, lane);
      if (kind === 'laser') fTower(F, 'laser', outer, r, core, { dir: left ? 1 : -1, phase: rng() * 3 });
      else fTower(F, kind, i % 2 ? inner : outer, r, core);
    });
    if (risky) { F.used.add(tileIndex(mid, r0 + 1)); F.chests.push({ c: mid, r: r0 + 1 }); }
    fCover(F, rng, mid - 1, mid + 1, r0 + 2, r0 + h - 3, risky ? 1 : 2);
  }
  return h;
}

// An open hall: a sweeper in the middle or two laser gates across it, and towers round the edges.
function fortHall(F, r0, rng, idx, kinds) {
  const h = 8;
  const core = fCore(F, rng() < 0.5 ? 1 : 9, r0 + h - 2);
  const opts = kinds.filter(k => k !== 'barracks');
  const plain = opts.filter(k => k !== 'laser' && k !== 'sweeper');
  let n = idx >= 9 ? 3 : idx >= 3 ? 2 : 1;
  const beamRows = [];
  if (opts.includes('laser') && rng() < 0.45) {
    fTower(F, 'laser', 0, r0 + 2, core, { dir: 1, phase: 0 });
    fTower(F, 'laser', 10, r0 + 5, core, { dir: -1, phase: 1.6 });
    beamRows.push(r0 + 2, r0 + 5);
    n--;
  } else if (opts.includes('sweeper') && rng() < 0.65) {
    fTower(F, 'sweeper', 5, r0 + 3, core, { ang: rng() * TAU, spin: rng() < 0.5 ? 1 : -1 });
    n--;
  }
  const spots = [[0, r0 + 1], [10, r0 + 1], [0, r0 + 6], [10, r0 + 6], [2, r0 + 4], [8, r0 + 4]];
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (const [c, r] of spots) {
    if (n <= 0) break;
    if (!fFree(F, c, r) || beamRows.includes(r)) continue;
    fTower(F, rngPick(rng, plain), c, r, core);
    n--;
  }
  fCover(F, rng, 1, 9, r0 + 1, r0 + h - 2, 2, beamRows);
  return h;
}

// A yard with a barracks that sends out soldiers, and a tower across from it.
function fortYard(F, r0, rng, idx, kinds) {
  const h = 8;
  const left = rng() < 0.5;
  const core = fCore(F, left ? 8 : 2, r0 + 1);
  fTower(F, 'barracks', left ? 0 : 10, r0 + 3, core, { door: left ? 1 : -1 });
  F.used.add(tileIndex(left ? 1 : 9, r0 + 3));   // in front of its door
  fTower(F, rngPick(rng, kinds.filter(k => k === 'bolt' || k === 'cannon' || k === 'frost')), left ? 10 : 0, r0 + 5, core);
  fCover(F, rng, 2, 8, r0 + 2, r0 + h - 2, 3);
  return h;
}

const FORT_SECTIONS = { split: fortSplit, hall: fortHall, yard: fortYard };
const FORT_HEIGHT = { split: 11, hall: 8, yard: 8 };

// A normal room: from the bottom up a split, a hall or yard, and another split, with a short open
// crossing between them. The gate area is the top 4 rows, the start the bottom 5.
function planFort(rng, idx) {
  const kinds = towerKinds(idx);
  const n = idx <= 3 ? 2 : 3;
  const secs = [];
  for (let i = 0; i < n; i++) secs.push(i % 2 === 0 ? 'split' : kinds.includes('barracks') && rng() < 0.5 ? 'yard' : 'hall');
  const F = fortBuilder(4 + secs.reduce((a, s) => a + FORT_HEIGHT[s], 0) + 3 * (n - 1) + 5);
  let r = 4;
  for (let i = n - 1; i >= 0; i--) {   // painted from the top down
    r += FORT_SECTIONS[secs[i]](F, r, rng, idx, kinds);
    if (i > 0) { fCover(F, rng, 1, 9, r, r + 2, rng() < 0.5 ? 1 : 0); r += 3; }
  }
  F.exitRow = 3;
  return F;
}

// A command room: three bays, each with a core in an alcove and two towers it runs. The cores have
// to go in order (the next one is shielded until then) and the door opens when the last one goes.
function planCommand(rng, idx) {
  const kinds = towerKinds(idx).filter(k => k !== 'barracks' && k !== 'laser');
  const F = fortBuilder(4 + 3 * 8 + 5);
  for (let k = 0; k < 3; k++) {   // k = 0 is the lowest bay, its core comes first
    const r0 = 4 + (2 - k) * 8, left = k % 2 === 0;
    for (const c of left ? [0, 1, 2] : [8, 9, 10]) { fWall(F, c, r0 + 2); fWall(F, c, r0 + 6); }
    const core = fCore(F, left ? 1 : 9, r0 + 4);
    F.cores[core].seq = k;
    fTower(F, rngPick(rng, kinds), left ? 10 : 0, r0 + 4, core);
    if (idx >= 10) fTower(F, rngPick(rng, kinds), left ? 6 : 4, k % 2 ? r0 + 7 : r0 + 1, core);
  }
  fCover(F, rng, 3, 7, 5, F.rows - 7, 3);
  F.coreGoal = true;
  F.exitRow = 3;
  return F;
}

// The boss room: three gates across the way up, each held shut by two cores beside it; once both are
// down the golem can break the gate open. The towers below a gate run on that gate's cores, so the
// golem crosses each stretch under fire until you get to the cores at its far end.
function planBoss(rng) {
  const F = fortBuilder(54);
  F.heart = { c: 5, r: 3 };
  fWall(F, 2, 7); fWall(F, 8, 7);
  // (close enough to the middle that the golem walks past them under fire)
  const towers = [
    [['bolt', 2, 44, 0], ['cannon', 10, 47, 1], ['bolt', 8, 46, 1]],
    [['sweeper', 2, 32, 0, { ang: 0, spin: 1 }], ['laser', 10, 36, 1, { dir: -1 }], ['bolt', 8, 30, 1], ['cannon', 0, 29, 0]],
    [['barracks', 10, 16, 1, { door: -1 }], ['frost', 3, 21, 0], ['cannon', 0, 15, 0], ['bolt', 8, 23, 1]],
  ];
  F.used.add(tileIndex(9, 16));
  [40, 26, 12].forEach((row, k) => {   // the lowest gate first
    for (let c = 0; c < COLS; c++) fWall(F, c, row, c >= 4 && c <= 6 ? 'gate' : null);
    const a = fCore(F, 1, row + 1), b = fCore(F, 9, row + 1);
    F.gates.push({ row, cores: [a, b] });
    for (const [kind, c, r, side, o] of towers[k]) fTower(F, kind, c, r, side ? b : a, Object.assign({ phase: rng() * 3 }, o));
    fCover(F, rng, 1, 2, row + 3, row + 11, 1);
    fCover(F, rng, 8, 9, row + 3, row + 11, 1);
  });
  F.exitRow = -1;
  return F;
}

function generateFortRoom(world, idx, type) {
  room.type = type;
  const need = biggestWalker(world, idx, type);
  let F = null;
  for (let tries = 0; tries < 40; tries++) {
    room.seed = (Math.random() * 1e9) | 0;
    const rng = makeRng(room.seed);
    F = type === 'boss' ? planBoss(rng) : type === 'elite' ? planCommand(rng, idx) : planFort(rng, idx);
    const g = F.g.slice();   // the boss room's gates count as open here
    for (const [i, kind] of F.special) if (kind === 'gate') g[i] = TILE.FLOOR;
    if (!connected(g)) continue;
    for (let i = 0; i < g.length; i++) if (g[i] === TILE.WALL) F.g[i] = TILE.WALL;   // pockets it walled off
    room.grid = F.g;
    room.nav = {};
    if (!need || type === 'boss' || reachShare(need) >= 0.9) break;
  }
  room.grid = F.g;
  room.nav = {};
  const cores = F.cores.map(c => Object.assign({}, c, { x: tileCenterX(c.c), y: tileCenterY(c.r), e: null }));
  const towers = F.towers.map(t => Object.assign({
    x: tileCenterX(t.c), y: tileCenterY(t.r), cd: rand(0.4, 1.4), ang: -Math.PI / 2, spin: 1, phase: 0, dir: 1, door: 1,
    charge: 0, puff: 0, alive: [], spawned: 0, golemT: 0, mode: 'off', len: 0, lens: [], coreE: null, dmg: 0,
  }, t));
  for (const tw of towers) {
    const core = cores[tw.core];
    tw.color = core.color;
    tw.cable = cablePath(tw, core);
    tw.off = ((tw.core % 3) - 1) * 4;   // cables from different cores side by side, not on top of each other
  }
  room.fort = {
    towers, cores,
    chests: F.chests.map(c => ({ x: tileCenterX(c.c), y: tileCenterY(c.r), open: false, t: 0 })),
    gates: F.gates.map(gt => ({ row: gt.row, cores: gt.cores, open: false, t: 0, y: ROOM_Y + gt.row * T })),
    special: F.special,
    exitY: F.exitRow >= 0 ? ROOM_Y + F.exitRow * T : null,
    coreGoal: !!F.coreGoal,
    heart: F.heart ? { x: tileCenterX(F.heart.c), y: tileCenterY(F.heart.r) } : null,
  };
}

// The cable from a core to its tower: the shortest way over the floor, as tile centres.
function cablePath(tw, core) {
  const start = tileIndex(core.c, core.r);
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  prev[start] = start;
  const q = [start];
  let end = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % COLS, r = (i / COLS) | 0;
    if (Math.abs(c - tw.c) + Math.abs(r - tw.r) === 1) { end = i; break; }
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = tileIndex(nc, nr);
      if (prev[j] >= 0 || room.grid[j] === TILE.WALL) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (end < 0) return [[core.x, core.y], [tw.x, tw.y]];
  const pts = [[tw.x, tw.y]];
  for (let i = end; ; i = prev[i]) {
    pts.push([tileCenterX(i % COLS), tileCenterY((i / COLS) | 0)]);
    if (i === start) break;
  }
  return pts.reverse();
}

// ---------- spawning ----------

function spawnFort() {
  const f = room.fort, w = G.world, p = G.player, idx = roomLevel();
  const dmg = Math.round(TOWER_DMG * w.dmgMult * roomScale().dmg);
  for (const c of f.cores) {
    const e = spawnEnemy('core', c.x, c.y, { spawnT: 0.4 });
    e.pal = { main: c.color, dark: darken(c.color, 0.35), light: '#ffffff' };
    e.anchored = true;
    if (f.coreGoal && c.seq > 0) e.shielded = true;
    c.e = e;
  }
  for (const tw of f.towers) { tw.coreE = f.cores[tw.core].e; tw.dmg = dmg; }
  if (G.roomType === 'boss') { spawnEscort(); return; }
  if (G.roomType === 'elite') {
    const key = w.elites[clamp(idx / 5 - 1, 0, w.elites.length - 1)];
    Object.assign(spawnEnemy(key, DOOR_X, ROOM_Y + ROOM_H * 0.45, { spawnT: 0.9 }), { guard: true, patrol: true });
  }
  // a few soldiers on guard, asleep until you come near: here the towers do most of the work
  const types = enemyPool(w, idx);
  let budget = 2 + idx * 0.22, n = 0;
  while (budget > 0.4 && n < 8) {
    const type = pick(types), def = ENEMIES[type];
    const spot = randomOpenSpot({ fromX: p.x, fromY: p.y, minDist: 240, minRow: 4, maxRow: ROWS - 7, fit: def.r });
    spawnEnemy(type, spot.x, spot.y, { spawnT: 0.5 }).asleep = true;
    budget -= def.cost;
    n++;
  }
  giveRoomAffixes();
}

function spawnEscort() {
  const f = room.fort;
  const e = spawnBoss(G.world.boss);
  Object.assign(e, { x: f.heart.x, y: f.heart.y, sealed: true, shielded: true, anchored: true });
  const hp = Math.round(40 * TOWER_DMG * G.world.dmgMult * roomScale().dmg);
  const y = ROOM_Y + ROOM_H - 80;
  G.golem = { x: DOOR_X, y, startY: y, r: 20, hp, maxHp: hp, state: 'walk', t: 0, walk: 0, flash: 0, punch: 0, slowT: 0, vx: 0, vy: 0, repair: false };
}

// ---------- update ----------

function updateFort(dt, p) {
  const f = room.fort;
  for (const tw of f.towers) {
    tw.puff = Math.max(0, tw.puff - dt * 2);
    tw.golemT -= dt;
    if (!towerOn(tw)) { tw.mode = 'off'; tw.charge = 0; continue; }
    TOWER_AI[tw.kind](tw, dt, p);
  }
  for (const ch of f.chests) {
    if (ch.open) ch.t += dt;
    else if (!p.dead && dist2(p.x, p.y, ch.x, ch.y) < 22 * 22) openChest(ch, p);
  }
  for (const gt of f.gates) if (gt.open) gt.t = Math.min(1, gt.t + dt * 1.4);   // (the golem breaks them open)
  if (f.coreGoal) {   // a command room's cores go in order
    const order = f.cores.slice().sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < order.length; i++) {
      const e = order[i].e;
      if (e && e.shielded && order[i - 1].e.dead) {
        e.shielded = false;
        FX.ring(e.x, e.y, 40, order[i].color, 0.5, 5);
        FX.text(e.x, e.y - 30, 'Unshielded!', order[i].color, 11);
        Sound.play('shield');
      }
    }
  }
  if (G.golem) updateGolem(G.golem, dt, p);
  if (!G.cleared && G.roomType !== 'boss' && (f.coreGoal ? f.cores.every(c => c.e && c.e.dead) : p.y < f.exitY)) fortReached(p);
}

// Who a tower shoots at: you or the golem, whichever is nearer and in range (towers would rather
// hit the golem: it counts as a good deal nearer than it is).
function towerTarget(tw, range) {
  const p = G.player, g = G.golem;
  let best = null, bd = range * range;
  if (g && g.state !== 'down' && dist2(tw.x, tw.y, g.x, g.y) < bd) { bd = dist2(tw.x, tw.y, g.x, g.y) * 0.4; best = g; }
  if (!p.dead && dist2(tw.x, tw.y, p.x, p.y) < bd) best = p;
  return best;
}
// Line of sight from just outside the tower's own tile.
function towerSees(tw, o) {
  const a = angleTo(tw.x, tw.y, o.x, o.y);
  return lineClear(tw.x + Math.cos(a) * 22, tw.y + Math.sin(a) * 22, o.x, o.y, false);
}
// Shots start far enough out not to hit the tower's own tile.
const towerGun = tw => ({ x: tw.x, y: tw.y, r: 40, z: 0, dmg: tw.dmg, aff: {} });

// How far a beam reaches before a wall or the edge of the room (it starts outside its own tile).
function beamLength(x, y, ang, max) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let d = 18; d < max; d += 5) {
    const px = x + dx * d, py = y + dy * d;
    if (px < ROOM_X || px > ROOM_X + ROOM_W || py < ROOM_Y || py > ROOM_Y + ROOM_H || tileAt(px, py) === TILE.WALL) return d;
  }
  return max;
}
// Distance from a point to a beam from (x, y).
function beamOff(x, y, ang, len, px, py, from = 0) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const along = clamp((px - x) * dx + (py - y) * dy, from, len);
  return Math.hypot(px - x - dx * along, py - y - dy * along);
}
function beamHits(tw, ang, len, p) {
  if (!p.dead && beamOff(tw.x, tw.y, ang, len, p.x, p.y, 18) < 8 + p.r) hurtPlayer(Math.round(tw.dmg * 1.2));
  const g = G.golem;
  if (g && g.state !== 'down' && tw.golemT <= 0 && beamOff(tw.x, tw.y, ang, len, g.x, g.y, 18) < 8 + g.r) {
    tw.golemT = 0.6;
    golemHurt(g, tw.dmg * 0.5);
  }
}

const TOWER_AI = {
  // quick aimed bolts at anything inside its circle
  bolt(tw, dt) {
    const tg = towerTarget(tw, BOLT_RANGE);
    if (tg) tw.ang += angleDiff(tw.ang, angleTo(tw.x, tw.y, tg.x, tg.y)) * Math.min(1, dt * 8);
    tw.cd -= dt;
    tw.charge = tg && tw.cd < 0.35 ? clamp(1 - tw.cd / 0.35, 0, 1) : 0;
    if (tw.cd > 0) return;
    if (!tg || !towerSees(tw, tg)) { tw.cd = 0.15; return; }
    tw.cd = 0.95;
    const n = roomLevel() >= 8 ? 2 : 1;
    for (let i = 0; i < n; i++) enemyShot(towerGun(tw), tw.ang + (i - (n - 1) / 2) * 0.12, 'ironBolt', 280);
    tw.puff = 1;
    Sound.play('eshoot');
  },
  // a shell where you are heading, with a warning circle
  cannon(tw, dt) {
    const tg = towerTarget(tw, CANNON_RANGE);
    if (tg) tw.ang += angleDiff(tw.ang, angleTo(tw.x, tw.y, tg.x, tg.y)) * Math.min(1, dt * 5);
    tw.cd -= dt;
    if (tw.cd > 0) return;
    if (!tg) { tw.cd = 0.2; return; }
    tw.cd = 2.8;
    const x = clamp(tg.x + (tg.vx || 0) * 0.7, ROOM_X + 12, ROOM_X + ROOM_W - 12);
    const y = clamp(tg.y + (tg.vy || 0) * 0.7, ROOM_Y + 12, ROOM_Y + ROOM_H - 12);
    G.strikes.push({ x, y, r: 36, t: 1.05, max: 1.05, dmg: Math.round(tw.dmg * 1.4), owner: 'enemy', kind: 'shell' });
    tw.puff = 1;
    FX.smoke(tw.x + Math.cos(tw.ang) * 16, tw.y - 12 + Math.sin(tw.ang) * 16, 'rgba(220,220,230,0.6)', 4, 6);
    Sound.play('cannon');
  },
  // slows you down while you are near it
  frost(tw) {
    const p = G.player, g = G.golem;
    if (!p.dead && dist2(tw.x, tw.y, p.x, p.y) < (FROST_RANGE + p.r) ** 2) p.slowT = Math.max(p.slowT, 0.25);
    if (g && dist2(tw.x, tw.y, g.x, g.y) < (FROST_RANGE + g.r) ** 2) g.slowT = 0.25;
  },
  // a beam straight across, off and on in a fixed beat
  laser(tw, dt, p) {
    const k = (G.time + tw.phase) % 3.2;
    tw.mode = k < 1.5 ? 'off' : k < 2 ? 'warn' : 'on';
    const ang = tw.dir > 0 ? 0 : Math.PI;
    tw.len = beamLength(tw.x, tw.y, ang, 400);
    if (tw.mode === 'warn' && k - dt < 1.5) Sound.play('warn');
    if (tw.mode === 'on') beamHits(tw, ang, tw.len, p);
  },
  // a beam turning round the tower like a lighthouse
  sweeper(tw, dt, p) {
    tw.ang += tw.spin * 1.15 * dt;
    const n = roomLevel() >= 12 ? 2 : 1;
    tw.lens.length = 0;
    for (let i = 0; i < n; i++) {
      const a = tw.ang + i * Math.PI, len = beamLength(tw.x, tw.y, a, SWEEP_LEN);
      tw.lens.push(len);
      beamHits(tw, a, len, p);
    }
  },
  // sends out soldiers while you are near, a few at a time (and only so many in all)
  barracks(tw, dt, p) {
    tw.alive = tw.alive.filter(e => !e.dead);
    tw.charge = Math.max(0, tw.charge - dt * 2);
    tw.cd -= dt;
    if (tw.cd > 0 || p.dead || dist2(tw.x, tw.y, p.x, p.y) > BARRACKS_RANGE ** 2) return;
    if (tw.alive.length >= (roomLevel() >= 12 ? 3 : 2) || tw.spawned >= 5) return;
    tw.cd = 4.5;
    const e = spawnEnemy('ironSoldier', tw.x + tw.door * 30, tw.y + 4, { spawnT: 0.5 });
    e.noLoot = true;
    tw.alive.push(e);
    tw.spawned++;
    tw.charge = 1;
    Sound.play('door');
  },
};

// A core is down: its towers go dark.
function coreDown(e) {
  const f = room.fort;
  const core = f && f.cores.find(c => c.e === e);
  if (!core) return;
  for (const tw of f.towers) {
    if (tw.coreE !== e) continue;
    FX.burst(tw.x, tw.y - 14, ['#ffffff', core.color, '#5a6070'], 10, { min: 40, max: 120 });
    FX.text(tw.x, tw.y - 32, 'Offline', '#c9c9d6', 10, { life: 1 });
  }
  FX.ring(e.x, e.y, 60, core.color, 0.5, 6);
  Sound.play('zap');
}

function openChest(ch, p) {
  ch.open = true;
  const k = G.world.coinMult * TIER.gold ** G.tier * (1 + p.s.gold);
  dropCoins(ch.x, ch.y, Math.round(2.5 * k * (1 + 0.05 * roomLevel()) * rand(0.9, 1.1)));
  if (Math.random() < Math.min(0.12, 0.06 + 0.01 * G.tier)) dropPickup('gem', ch.x, ch.y, 1);
  if (Math.random() < 0.3) dropPickup('heart', ch.x, ch.y, 0.15);
  FX.burst(ch.x, ch.y - 6, ['#ffcf3f', '#ffffff', '#c98a48'], 16, { angle: -Math.PI / 2, spread: 1.4, min: 50, max: 160 });
  FX.text(ch.x, ch.y - 26, 'Treasure!', '#ffcf3f', 12);
  Sound.play('gem');
}

function openGate(gt) {
  gt.open = true;
  for (let c = 4; c <= 6; c++) room.grid[tileIndex(c, gt.row)] = TILE.FLOOR;
  room.nav = {};
  FX.burst(DOOR_X, gt.y + T / 2, ['#c9c9d6', '#ffffff', '#5a6070'], 20, { min: 40, max: 160 });
  FX.text(DOOR_X, gt.y - 10, 'Gate open!', '#ffcf3f', 14, { life: 1.4, pop: 0.5 });
  FX.kick(5);
  Sound.play('door');
}

// Through the gate at the top (or the last core of a command room is down): the room is done.
// Soldiers still about give up without loot; a command room's guardian falls with its cores.
function fortReached(p) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.guard) { killEnemy(e); continue; }
    FX.burst(e.x, e.y, [e.pal.main, '#ffffff'], 8, { min: 40, max: 120 });
    e.dead = true;
  }
  onRoomCleared();
  // bonus gold for a quick climb and for not being hit
  const v = Math.round(1.5 * G.world.coinMult * TIER.gold ** G.tier * (1 + p.s.gold) * (1 + 0.05 * roomLevel()));
  const bits = [];
  if (G.roomT < 12 + ROWS * 0.8) { G.run.gold += v; bits.push(`Swift +${v}`); }
  if (!p.roomHits) { G.run.gold += v; bits.push(`Flawless +${v}`); }
  if (bits.length) { UI.banner('Through!', bits.join(' · '), 'clear'); UI.updateGold(); }
}

// ---------- the siege golem (boss room) ----------

// Where the golem stops next: below the nearest closed gate above it, or in front of the heart.
function golemStop(g) {
  const f = room.fort;
  let gate = null;
  for (const gt of f.gates) if (!gt.open && gt.y < g.y && (!gate || gt.y > gate.y)) gate = gt;
  return gate ? { y: gate.y + T + g.r + 6, gate } : { y: f.heart.y + 62, gate: null };
}

function updateGolem(g, dt, p) {
  const heart = G.boss;
  g.flash = Math.max(0, g.flash - dt);
  g.punch = Math.max(0, g.punch - dt * 2.5);
  g.slowT = Math.max(0, g.slowT - dt);
  g.vx = g.vy = 0;
  if (g.state === 'down') {
    g.t -= dt;
    if (g.t <= 0) rebuildGolem(g);
    return;
  }
  // stand next to it and it mends itself
  g.repair = !p.dead && g.hp < g.maxHp && dist2(p.x, p.y, g.x, g.y) < 72 * 72;
  if (g.repair) {
    g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.045 * dt);
    if (Math.random() < dt * 8) FX.burst(g.x + rand(-14, 14), g.y - rand(0, 30), ['#7be05a', '#ffffff'], 1, { angle: -Math.PI / 2, spread: 0.5, min: 20, max: 50 });
  }
  if (g.state === 'walk' || g.state === 'wait') {
    const stop = golemStop(g);
    if (g.y > stop.y + 0.5) {
      const sp = 36 * (g.slowT > 0 ? 0.6 : 1);
      g.y = Math.max(stop.y, g.y - sp * dt);
      g.vy = -sp;
      g.walk += dt * 5;
      g.state = 'walk';
    } else if (stop.gate) {
      if (g.state !== 'wait') { g.state = 'wait'; g.t = 0.8; }
      // both cores down: it breaks the gate open
      const f = room.fort;
      if (stop.gate.cores.every(i => f.cores[i].e && f.cores[i].e.dead)) {
        g.t -= dt;
        if (g.t <= 0) { g.punch = 1; openGate(stop.gate); }
      }
    } else { g.state = 'breach'; g.t = 0.6; }
  } else if (g.state === 'breach') {
    if (!heart || heart.dead || heart.free) { g.state = 'guard'; return; }
    g.t -= dt;
    if (g.t <= 0) { g.t = 3.5; golemPunch(g, heart); }
  }
}

// The first punch breaks the heart's shield; after that every punch hurts it a little.
function golemPunch(g, heart) {
  g.punch = 1;
  FX.kick(5);
  Sound.play('slam');
  FX.burst(heart.x, heart.y + heart.r, ['#ffb02e', '#ffffff', '#5a6070'], 12, { min: 60, max: 180 });
  if (heart.sealed) {
    Object.assign(heart, { sealed: false, shielded: false, state: 'dazed', t: 1.2, dizzy: true });
    FX.text(heart.x, heart.y - heart.r - 30, 'BREACH!', '#ffcf3f', 18, { life: 1.6, pop: 0.6, vy: -30 });
    FX.ring(heart.x, heart.y, 120, '#ffcf3f', 0.6, 8);
    Sound.play('shield');
  } else hurtEnemy(heart, heart.maxHp * 0.006, { color: '#ffcf3f' });
}

function golemHurt(g, d) {
  if (!g || g.state === 'down' || G.bossDead) return;
  g.hp -= d;
  g.flash = 0.12;
  if (g.hp <= 0) golemDown(g);
}

// Down: rebuilt at the last gate it got through after 10 seconds, and the heart gets its shield back.
function golemDown(g) {
  Object.assign(g, { hp: 0, state: 'down', t: 10, repair: false });
  FX.burst(g.x, g.y - 10, ['#c99a4a', '#5a6070', '#ffffff'], 30, { min: 60, max: 220 });
  FX.smoke(g.x, g.y, 'rgba(200,200,210,0.6)', 8, 12);
  FX.kick(9);
  FX.text(g.x, g.y - 44, 'Golem down!', '#ff5a6e', 14, { life: 1.6, pop: 0.5 });
  Sound.play('explode');
  const heart = G.boss;
  if (heart && !heart.dead && !heart.sealed && !heart.free) {
    Object.assign(heart, { sealed: true, shielded: true, state: 'idle', t: 0.6, m: null, laser: null, lasers: null, anim: null, windup: false, dizzy: false });
    FX.text(heart.x, heart.y - heart.r - 30, 'SHIELD UP', '#bfe6ff', 15, { life: 1.4, pop: 0.5, vy: -30 });
    Sound.play('shield');
  }
}

function rebuildGolem(g) {
  let gate = null;   // the gate it last went through, just below where it fell
  for (const gt of room.fort.gates) if (gt.open && gt.y > g.y && (!gate || gt.y < gate.y)) gate = gt;
  Object.assign(g, { x: DOOR_X, y: gate ? gate.y - 26 : g.startY, hp: g.maxHp, state: 'walk', flash: 0 });
  FX.burst(g.x, g.y - 10, ['#c99a4a', '#7be05a', '#ffffff'], 18, { min: 40, max: 140 });
  FX.text(g.x, g.y - 44, 'Golem rebuilt', '#7be05a', 12, { life: 1.3 });
  Sound.play('door');
}

// Enemy shots and shells that reach the golem hit it instead (it makes good cover). Once the heart is
// open the golem stands right in its fire: then plain shots hardly scratch it, but shells and the
// heart's steam jets still do.
const heartFight = () => G.boss && !G.boss.sealed;
function golemBlocks(b) {
  const g = G.golem;
  if (!g || g.state === 'down' || dist2(b.x, b.y, g.x, g.y - 12) > (b.r + g.r) ** 2) return false;
  golemHurt(g, b.dmg * (heartFight() ? 0.03 : 0.35));
  FX.burst(b.x, b.y, ['#c99a4a', '#ffffff'], 3, { min: 30, max: 90 });
  return true;
}
function golemStrike(s) {
  const g = G.golem;
  if (g && g.state !== 'down' && dist(s.x, s.y, g.x, g.y) < s.r + g.r) golemHurt(g, s.dmg * 0.4);
}

// The Iron Heart below 25%: it tears loose and flies about, and no longer needs the golem's breach.
function heartBreaksFree(e) {
  Object.assign(e, { free: true, flying: true, anchored: false });
  FX.text(e.x, e.y + e.r + 30, 'IT BREAKS FREE!', '#ffcf3f', 15, { life: 1.6, pop: 0.6 });
  FX.burst(e.x, e.y, ['#5a6070', '#ffb02e', '#ffffff'], 24, { min: 60, max: 200 });
  if (G.golem && G.golem.state === 'breach') G.golem.state = 'guard';
}

// The Iron Heart's own moves (BOSS_MOVES in bosses.js).
Object.assign(BOSS_MOVES, {
  // cannon fire called down round you, in waves
  barrage(e, dt, p, m) {
    const waves = e.phase2 ? 3 : 2;
    if (m.t === 0) { m.k = 0; m.next = 0; }
    if (m.t >= m.next && m.k < waves) {
      const n = e.phase2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = clamp(i === 0 ? p.x + p.vx * 0.5 : p.x + rand(-120, 120), ROOM_X + 20, ROOM_X + ROOM_W - 20);
        const y = clamp(i === 0 ? p.y + p.vy * 0.5 : p.y + rand(-120, 120), ROOM_Y + 20, ROOM_Y + ROOM_H - 20);
        const t = 1.0 + i * 0.08;
        G.strikes.push({ x, y, r: 32, t, max: t, dmg: e.dmg, owner: 'enemy', kind: 'shell', quiet: i > 0 });
      }
      Sound.play('cannon');
      m.k++;
      m.next += 1.2;
    }
    return m.k >= waves && m.t > m.next - 0.2;
  },
  // signature: four jets of steam turn round the heart
  overload(e, dt, p, m) {
    const warnT = 1.0, fireT = 4.0;
    if (m.t === 0) { m.ang = rand(0, TAU); m.dir = chance(0.5) ? 1 : -1; Sound.play('warn'); }
    const on = m.t > warnT;
    if (on) {
      if (!m.fired) { m.fired = true; Sound.play('zap'); FX.kick(6); }
      m.ang += m.dir * 0.5 * dt;
    }
    e.lasers = [0, 1, 2, 3].map(i => {
      const a = m.ang + (i * Math.PI) / 2;
      return { ang: a, len: Math.min(260, rayLength(e.x, e.y, a)), on };
    });
    if (on) {
      const g = G.golem;
      for (const L of e.lasers) {
        if (beamOff(e.x, e.y, L.ang, L.len, p.x, p.y) < 12 + p.r) hurtPlayer(e.dmg);
        if (g && g.state !== 'down' && (m.golemT || 0) <= 0 && beamOff(e.x, e.y, L.ang, L.len, g.x, g.y) < 12 + g.r) {
          m.golemT = 0.6;
          golemHurt(g, e.dmg * 0.3);
        }
      }
      m.golemT = (m.golemT || 0) - dt;
    }
    if (m.t >= warnT + fireT) { e.lasers = null; return true; }
    return false;
  },
});

// ---------- drawing ----------

const fortOnScreen = (y, pad) => y > G.camY - pad && y < G.camY + G.viewH + pad;

// On the floor: cables, tower ranges, frost fields, laser warnings, chests, gates and the way out.
function drawFortGround(ctx, t) {
  const f = room.fort;
  ctx.save();
  for (const tw of f.towers) {
    const on = towerOn(tw), o = tw.off;
    ctx.beginPath();
    tw.cable.forEach(([x, y], i) => (i ? ctx.lineTo(x + o, y + o) : ctx.moveTo(x + o, y + o)));
    ctx.strokeStyle = 'rgba(20,14,30,0.5)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = on ? darken(tw.color, 0.25) : '#45424d'; ctx.lineWidth = 2.6; ctx.stroke();
    if (on) {   // power running along it
      ctx.setLineDash([4, 12]);
      ctx.lineDashOffset = -t * 45;
      ctx.strokeStyle = lighten(tw.color, 0.35); ctx.lineWidth = 2.6; ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
  const p = G.player;
  for (const tw of f.towers) {
    if (!towerOn(tw) || !fortOnScreen(tw.y, 180)) continue;
    if (tw.kind === 'bolt') {
      const inside = dist2(tw.x, tw.y, p.x, p.y) < BOLT_RANGE * BOLT_RANGE;
      ctx.save();
      ctx.beginPath(); ctx.arc(tw.x, tw.y, BOLT_RANGE, 0, TAU);
      ctx.fillStyle = `rgba(255,70,80,${inside ? 0.07 : 0.035})`; ctx.fill();
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = t * 12;
      ctx.strokeStyle = `rgba(255,70,80,${inside ? 0.55 : 0.28})`; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    } else if (tw.kind === 'frost') {
      ctx.beginPath(); ctx.arc(tw.x, tw.y, FROST_RANGE, 0, TAU);
      ctx.fillStyle = 'rgba(160,225,255,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(210,245,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = t * 0.4 + (i * TAU) / 8, d = FROST_RANGE * (0.45 + ((i * 37) % 10) / 22);
        star(ctx, tw.x + Math.cos(a) * d, tw.y + Math.sin(a) * d, 2.4, 'rgba(235,250,255,0.85)');
      }
    } else if (tw.kind === 'sweeper') {
      ctx.beginPath(); ctx.arc(tw.x, tw.y, SWEEP_LEN, 0, TAU);
      ctx.strokeStyle = 'rgba(255,90,80,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (tw.kind === 'laser' && tw.mode === 'warn') {
      const a = tw.dir > 0 ? 0 : Math.PI;
      ctx.setLineDash([8, 6]);
      line(ctx, tw.x + Math.cos(a) * 14, tw.y, tw.x + Math.cos(a) * tw.len, tw.y, `rgba(255,60,80,${0.5 + Math.sin(t * 30) * 0.3})`, 2);
      ctx.setLineDash([]);
    }
  }
  for (const ch of f.chests) if (fortOnScreen(ch.y, 40)) drawChest(ctx, ch, t);
  for (const gt of f.gates) if (fortOnScreen(gt.y, 60)) drawGate(ctx, gt, t);
  if (f.exitY !== null && !f.coreGoal && !G.cleared) {
    // gold arrows at the line you have to cross
    for (let i = 0; i < 5; i++) {
      const x = ROOM_X + 33 + i * 66, y = f.exitY + 8 - ((t * 0.8 + i * 0.2) % 1) * 6;
      ctx.globalAlpha = 0.55 + Math.sin(t * 4 + i) * 0.2;
      ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x, y - 4); ctx.lineTo(x + 8, y + 4);
      ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Towers and the golem take part in the depth sorting with the enemies (see drawGame).
function fortDrawables() {
  const f = room.fort, out = [];
  for (const tw of f.towers) if (fortOnScreen(tw.y, 70)) out.push({ y: tw.y + 10, fortDraw: (ctx, t) => drawTower(ctx, tw, t) });
  const g = G.golem;
  if (g) out.push({ y: g.y, fortDraw: (ctx, t) => drawGolem(ctx, g, t) });
  return out;
}

// Above everything: beams that are on, the golem's health and a marker when it is off screen.
function drawFortTop(ctx, t) {
  const f = room.fort;
  for (const tw of f.towers) {
    if (!towerOn(tw) || !fortOnScreen(tw.y, 140)) continue;
    if (tw.kind === 'laser' && tw.mode === 'on') drawFortBeam(ctx, tw.x, tw.y, tw.dir > 0 ? 0 : Math.PI, tw.len, t);
    else if (tw.kind === 'sweeper') tw.lens.forEach((len, i) => drawFortBeam(ctx, tw.x, tw.y, tw.ang + i * Math.PI, len, t));
  }
  const g = G.golem;
  if (!g) return;
  if (g.state !== 'down') {
    hpBar(ctx, g.x - 22, g.y - 52, 44, 5, g.hp / g.maxHp, '#7be05a');
    if (g.repair) { ctx.font = `10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#7be05a'; ctx.fillText('+', g.x + 28, g.y - 46); }
  }
  const bottom = G.camY + G.viewH - 30;
  if (g.y > bottom + 20) {   // below the screen: a little marker at the edge
    const y = bottom - 46;
    ctx.save();
    ctx.translate(g.x, y);
    rrect(ctx, -22, -9, 44, 18, 9); fs(ctx, 'rgba(34,24,58,0.8)', 1.6);
    ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(4, 11); ctx.lineTo(0, 17); ctx.closePath(); fs(ctx, '#c99a4a', 1.4);
    hpBar(ctx, -15, -2.5, 30, 5, g.hp / g.maxHp, g.state === 'down' ? '#ff5a6e' : '#7be05a');
    ctx.restore();
  }
}

function drawFortBeam(ctx, x, y, ang, len, t) {
  const x1 = x + Math.cos(ang) * 12, y1 = y + Math.sin(ang) * 12;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  const wob = 1 + Math.sin(t * 50) * 0.12;
  ctx.lineCap = 'round';
  line(ctx, x1, y1, x2, y2, 'rgba(255,80,70,0.3)', 18 * wob);
  line(ctx, x1, y1, x2, y2, 'rgba(255,120,90,0.8)', 8 * wob);
  line(ctx, x1, y1, x2, y2, '#ffffff', 3);
}

// A tower stands on its tile; the light in it has the colour of its core (grey once that is gone).
function drawTower(ctx, tw, t) {
  const on = towerOn(tw), lamp = on ? tw.color : '#6a6774';
  ctx.save();
  ctx.translate(tw.x, tw.y);
  ell(ctx, 0, 12, 15, 5); ctx.fillStyle = 'rgba(10,5,25,0.3)'; ctx.fill();
  rrect(ctx, -14, -2, 28, 15, 4); fs(ctx, '#5d5a66', 2);
  line(ctx, -12, 6, 12, 6, '#4a4752', 1.4);
  const light = (x, y, r) => {
    if (on) glow(ctx, x, y, r * 3.2 + tw.charge * 10, lamp, 0.7);
    circ(ctx, x, y, r); fs(ctx, lamp, 1.4);
  };
  switch (tw.kind) {
    case 'bolt': {
      rrect(ctx, -8, -20, 16, 22, 3); fs(ctx, '#6a7080', 2);
      ctx.save(); ctx.translate(0, -20); ctx.rotate(tw.ang);
      rrect(ctx, 2, -3, 15 - tw.puff * 4, 6, 2); fs(ctx, '#3a3f4c', 1.6);
      ctx.restore();
      circ(ctx, 0, -20, 8.5); fs(ctx, '#7d8494', 2);
      light(0, -20, 3.4);
      break;
    }
    case 'cannon': {
      rrect(ctx, -11, -12, 22, 14, 4); fs(ctx, '#6a7080', 2);
      ctx.save(); ctx.translate(0, -14); ctx.rotate(tw.ang);
      rrect(ctx, 0, -5, 19 - tw.puff * 5, 10, 3); fs(ctx, '#2e323c', 1.8);
      rrect(ctx, 14 - tw.puff * 5, -6, 5, 12, 2); fs(ctx, '#3a3f4c', 1.4);
      ctx.restore();
      circ(ctx, 0, -14, 10); fs(ctx, '#565c6a', 2);
      light(0, -14, 3);
      break;
    }
    case 'frost': {
      ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(8, -12); ctx.lineTo(5, 2); ctx.lineTo(-5, 2); ctx.lineTo(-8, -12); ctx.closePath();
      fs(ctx, on ? '#bfeaff' : '#8a96a6', 2);
      ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(2, 2); ctx.lineTo(-5, 2); ctx.lineTo(-8, -12); ctx.closePath();
      ctx.fillStyle = on ? 'rgba(90,170,220,0.4)' : 'rgba(60,70,90,0.35)'; ctx.fill();
      light(0, -10, 3.2);
      break;
    }
    case 'laser': {
      rrect(ctx, -7, -24, 14, 26, 3); fs(ctx, '#6a7080', 2);
      circ(ctx, tw.dir * 8, 0, 5.5); fs(ctx, '#3a3f4c', 1.6);
      circ(ctx, tw.dir * 8, 0, 3); ctx.fillStyle = on && tw.mode !== 'off' ? '#ff5a4a' : '#6a6774'; ctx.fill();
      light(0, -18, 3);
      break;
    }
    case 'sweeper': {
      ell(ctx, 0, -2, 12, 9); fs(ctx, '#6a7080', 2);
      ctx.save(); ctx.rotate(tw.ang);
      rrect(ctx, 4, -3, 10, 6, 2); fs(ctx, '#3a3f4c', 1.6);
      if ((tw.lens || []).length > 1) { rrect(ctx, -14, -3, 10, 6, 2); fs(ctx, '#3a3f4c', 1.6); }
      ctx.restore();
      light(0, -4, 3.6);
      break;
    }
    case 'barracks': {
      rrect(ctx, -14, -16, 28, 20, 3); fs(ctx, '#7a6a5a', 2);
      for (const y of [-10, -4]) line(ctx, -12, y, 12, y, 'rgba(40,30,30,0.35)', 1.2);
      ctx.beginPath(); ctx.moveTo(-17, -15); ctx.lineTo(0, -29); ctx.lineTo(17, -15); ctx.closePath(); fs(ctx, '#9a2f2a', 2);
      const open = tw.charge;
      rrect(ctx, tw.door * 4 - 5, -10 + open * 3, 10, 14 - open * 3, 2); fs(ctx, open > 0.1 ? '#22183a' : '#5a3f2e', 1.6);
      line(ctx, 0, -29, 0, -40, '#4a4752', 1.6);
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(9 + Math.sin(t * 6) * 1.5, -37); ctx.lineTo(0, -34); ctx.closePath(); fs(ctx, lamp, 1.2);
      break;
    }
  }
  ctx.restore();
}

function drawChest(ctx, ch, t) {
  ctx.save();
  ctx.translate(ch.x, ch.y);
  drawShadow(ctx, 0, 8, 12, 0.25);
  if (!ch.open) glow(ctx, 0, -2, 24, '#ffcf3f', 0.35 + Math.sin(t * 4) * 0.12);
  rrect(ctx, -11, -4, 22, 12, 2); fs(ctx, '#a0643a', 1.8);
  line(ctx, -11, 2, 11, 2, '#7a4a28', 1.2);
  if (ch.open) {
    ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(11, -4); ctx.closePath(); fs(ctx, '#7a4a28', 1.6);
    glow(ctx, 0, -6, 18, '#ffe9a0', Math.max(0, 1 - ch.t));
  } else {
    rrect(ctx, -12, -11, 24, 8, 3); fs(ctx, '#b8743f', 1.8);
    rrect(ctx, -2.5, -6, 5, 6, 1); fs(ctx, '#ffcf3f', 1.2);
  }
  for (const s of [-1, 1]) line(ctx, s * 7, ch.open ? -4 : -11, s * 7, 8, '#ffcf3f', 2);
  ctx.restore();
}

// A portcullis across the middle of a gate row; it slides up into the wall when it opens.
function drawGate(ctx, gt, t) {
  const x0 = ROOM_X + 4 * T, w = 3 * T, y = gt.y, k = ease.inOut(gt.t);
  const f = room.fort;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y - 12, w, T + 12); ctx.clip();
  ctx.translate(0, -k * (T + 4));
  ctx.fillStyle = 'rgba(20,14,30,0.55)';
  ctx.fillRect(x0, y - 8, w, T + 8);
  for (let i = 0; i <= 6; i++) oline(ctx, x0 + 6 + i * 13, y - 8, x0 + 6 + i * 13, y + T - 2, '#7d7b8a', 2.2);
  for (const yy of [y + 2, y + T - 10]) oline(ctx, x0 + 2, yy, x0 + w - 2, yy, '#7d7b8a', 2.4);
  for (let i = 0; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(x0 + 3 + i * 13, y + T - 2); ctx.lineTo(x0 + 6 + i * 13, y + T + 4); ctx.lineTo(x0 + 9 + i * 13, y + T - 2); fs(ctx, '#9a98a6', 1.2); }
  ctx.restore();
  // a lamp on each side for the two cores that hold it shut
  gt.cores.forEach((ci, i) => {
    const c = f.cores[ci], x = i ? x0 + w + 6 : x0 - 6, alive = c.e && !c.e.dead;
    if (alive) glow(ctx, x, y - 4, 14, c.color, 0.7);
    circ(ctx, x, y - 4, 4); fs(ctx, alive ? c.color : '#4a4752', 1.4);
  });
}

function drawGolem(ctx, g, t) {
  if (g.state === 'down') {   // a heap of parts and a ring that fills up until it is rebuilt
    for (const [dx, dy, r] of [[-12, 4, 7], [8, 6, 8], [-2, -2, 6], [14, -4, 5]]) { circ(ctx, g.x + dx, g.y + dy, r); fs(ctx, '#a07a3a', 1.6); }
    ctx.beginPath(); ctx.arc(g.x, g.y - 20, 12, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - g.t / 10));
    ctx.strokeStyle = '#7be05a'; ctx.lineWidth = 3; ctx.stroke();
    return;
  }
  const step = g.state === 'walk' ? Math.sin(g.walk) : 0;
  drawShadow(ctx, g.x, g.y + 16, 20, 0.28);
  ctx.save();
  ctx.translate(g.x, g.y - Math.abs(step) * 2);
  ART.flash = g.flash > 0 ? 0.6 : 0;
  for (const s of [-1, 1]) { rrect(ctx, s * 9 - 5, 6 + step * s * 2, 10, 12, 3); fs(ctx, '#7a5a32', 2); }
  rrect(ctx, -17, -24, 34, 32, 9); fs(ctx, '#c99a4a', 2.2);
  line(ctx, -15, -6, 15, -6, '#a07a3a', 2);
  for (const [x, y] of [[-12, -18], [12, -18], [-12, 2], [12, 2]]) { circ(ctx, x, y, 1.8); ctx.fillStyle = '#f2d38a'; ctx.fill(); }
  rrect(ctx, -9, -36, 18, 14, 5); fs(ctx, '#a87c3a', 2);
  glow(ctx, 0, -30, 14, '#5fd2ff', 0.8);
  rrect(ctx, -6, -32, 12, 4, 2); ctx.fillStyle = '#9ff0ff'; ctx.fill();
  for (const s of [-1, 1]) {   // fists; the right one punches up at the heart
    const up = s > 0 ? g.punch * 20 : 0;
    oline(ctx, s * 15, -16, s * 21, -8 - up, '#8a8f9e', 4);
    circ(ctx, s * 21, -8 - up, 7); fs(ctx, '#8a8f9e', 2);
  }
  ART.flash = 0;
  ctx.restore();
}
