'use strict';
// Room layouts (tile grid), collision against tiles, line of sight and path finding.

const room = {
  grid: new Uint8Array(COLS * ROWS),
  nav: {},        // path maps per enemy size, see pathDir
  seed: 1,
  type: 'normal',
  bg: null,
};

const tileIndex = (c, r) => r * COLS + c;
const colOf = x => Math.floor((x - ROOM_X) / T);
const rowOf = y => Math.floor((y - ROOM_Y) / T);
const tileCenterX = c => ROOM_X + c * T + T / 2;
const tileCenterY = r => ROOM_Y + r * T + T / 2;

function tileAt(x, y) {
  const c = colOf(x), r = rowOf(y);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return TILE.WALL;
  return room.grid[tileIndex(c, r)];
}
const blocksWalk = t => t === TILE.WALL || t === TILE.WATER;
// Ground enemies also avoid lava when they plan a path.
const blocksPath = t => t === TILE.WALL || t === TILE.WATER || t === TILE.LAVA;

// ---------- layout generation ----------

// Start area (bottom middle) and the door area (top middle) are always kept clear.
function keepClear(c, r) {
  if (r >= ROWS - 4 && c >= 3 && c <= 7) return true;
  if (r <= 1 && c >= 4 && c <= 6) return true;
  return false;
}

// Patterns paint the left half (columns 0..5); the room is then mirrored.
const PATTERNS = [
  function pillars(set, rng) {
    const gap = rng() < 0.5 ? 4 : 5;
    const top = 2 + Math.floor(rng() * 2);
    for (let r = top; r < ROWS - 5; r += gap) {
      set(2, r); if (rng() < 0.6) set(2, r + 1);
      if (rng() < 0.5) set(3, r);
    }
  },
  function blocks(set, rng) {
    for (let k = 0; k < 3; k++) {
      const c = 1 + Math.floor(rng() * 4), r = 2 + Math.floor(rng() * 11);
      set(c, r); set(c + 1, r); set(c, r + 1); set(c + 1, r + 1);
    }
  },
  function scatter(set, rng) {
    const n = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) set(Math.floor(rng() * 6), 2 + Math.floor(rng() * 12));
  },
  function centre(set, rng) {
    const r = 6 + Math.floor(rng() * 4);
    for (let dr = 0; dr < 2 + Math.floor(rng() * 2); dr++) { set(5, r + dr); set(4, r + dr); }
    if (rng() < 0.5) { set(1, r - 3); set(1, r + 4); }
  },
  function walls(set, rng) {
    const r = 4 + Math.floor(rng() * 3);
    for (let c = 0; c < 3 + Math.floor(rng() * 2); c++) set(c, r);
    const r2 = r + 5 + Math.floor(rng() * 2);
    for (let c = 2; c < 5; c++) set(c, r2);
  },
  function corners(set, rng) {
    const r = 3 + Math.floor(rng() * 3);
    set(1, r); set(2, r); set(1, r + 1);
    const r2 = r + 6;
    set(1, r2); set(1, r2 + 1); set(2, r2 + 1);
  },
  function diagonal(set, rng) {
    const r = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < 4; k++) set(1 + k, r + k * 2);
  },
];

function generateRoom(world, idx, type) {
  // a depth looks the same for everyone: its rooms come from its number
  room.seed = world.depth ? world.depth * 1000 + idx : (Math.random() * 1e9) | 0;
  room.type = type;
  const rng = makeRng(room.seed);
  const need = biggestWalker(world, idx, type);
  let fallback = null, fallbackShare = -1;
  for (let tries = 0; tries < 40; tries++) {
    const g = new Uint8Array(COLS * ROWS);
    const set = (c, r, t = TILE.WALL) => {
      if (c < 0 || c > 5 || r < 0 || r >= ROWS) return;
      if (keepClear(c, r) || keepClear(COLS - 1 - c, r)) return;
      g[tileIndex(c, r)] = t;
    };
    const hz = world.hazards;
    if (type === 'boss') {
      // big arena, a few pillars only
      if (rng() < 0.6) { set(2, 5); set(2, 12); }
    } else if (type === 'elite') {
      PATTERNS[5](set, rng);
    } else {
      const n = 1 + (rng() < 0.55 ? 1 : 0);
      const used = new Set();
      for (let k = 0; k < n; k++) {
        let p;
        do { p = Math.floor(rng() * PATTERNS.length); } while (used.has(p));
        used.add(p);
        PATTERNS[p](set, rng);
      }
    }
    // hazards: water bands/ponds, lava pools, ice patches, spike traps
    if (type !== 'boss' || hz.lava || hz.ice) {
      if (hz.water && rng() < hz.water && type === 'normal') {
        if (rng() < 0.5) {
          const r = 6 + Math.floor(rng() * 6);
          for (let c = 0; c < 6; c++) if (c !== 2 || rng() < 0.3) set(c, r, TILE.WATER);
          if (rng() < 0.5) for (let c = 0; c < 6; c++) if (c !== 2) set(c, r + 1, TILE.WATER);
        } else {
          const c = Math.floor(rng() * 3), r = 3 + Math.floor(rng() * 9);
          for (let dc = 0; dc < 2 + Math.floor(rng() * 2); dc++)
            for (let dr = 0; dr < 2; dr++) set(c + dc, r + dr, TILE.WATER);
        }
      }
      if (hz.lava && rng() < hz.lava) paintPatches(set, rng, TILE.LAVA, type === 'boss' ? 2 : 1 + Math.floor(rng() * 2), g);
      if (hz.ice && rng() < hz.ice) paintPatches(set, rng, TILE.ICE, 2, g, 3);
      if (hz.spikes && rng() < hz.spikes && type !== 'boss') {
        const r = 4 + Math.floor(rng() * 8);
        for (let c = 1; c < 6; c += 2) set(c, r, TILE.SPIKES);
        if (rng() < 0.5) for (let c = 0; c < 6; c += 2) set(c, r + 4, TILE.SPIKES);
      }
    }
    // mirror
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < 5; c++) g[tileIndex(COLS - 1 - c, r)] = g[tileIndex(c, r)];
    if (connected(g)) {
      room.grid = g;
      room.nav = {};
      if (!need) return;
      const share = reachShare(need);
      if (share >= 0.9) return;
      if (share > fallbackShare) { fallback = g; fallbackShare = share; }
    }
  }
  room.grid = fallback || new Uint8Array(COLS * ROWS);
  room.nav = {};
}

// Biggest ground enemy that can turn up in a room, as a path-finding size class (0 = none).
function biggestWalker(world, idx, type) {
  if (type === 'boss') return 0;
  const keys = enemyPool(world, idx).slice();
  if (world.depth && (type === 'elite' || (world.mod && world.mod.id === 'swarm'))) keys.push(...world.elites);
  else if (type === 'elite') keys.push(world.elites[clamp(idx / 5 - 1, 0, world.elites.length - 1)]);
  const r = Math.max(0, ...keys.map(k => ENEMIES[k]).filter(d => !d.flying).map(d => d.r));
  return r ? navClassOf(r) : 0;
}

// Share of the open floor (for this size) that can be reached from where the player starts.
// A layout where a big enemy would be walled in on one side scores low.
function reachShare(R) {
  const n = navFor(R, DOOR_X, ROOM_Y + ROOM_H - 36);
  let open = 0, reached = 0;
  for (let k = 0; k < n.open.length; k++) if (n.open[k]) { open++; if (n.flow[k] >= 0) reached++; }
  return open ? reached / open : 0;
}

function paintPatches(set, rng, tile, n, g, size = 2) {
  for (let k = 0; k < n; k++) {
    const c = Math.floor(rng() * 5), r = 2 + Math.floor(rng() * 11);
    for (let dc = 0; dc < size; dc++)
      for (let dr = 0; dr < size; dr++) {
        if (rng() < 0.85 && g[tileIndex(c + dc > 5 ? 5 : c + dc, r + dr)] === TILE.FLOOR) set(c + dc, r + dr, tile);
      }
  }
}

// Every walkable tile must be reachable from the start, and the door must be reachable.
function connected(g) {
  const seen = new Uint8Array(COLS * ROWS);
  const start = tileIndex(5, ROWS - 2);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop();
    const c = i % COLS, r = (i / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = tileIndex(nc, nr);
      if (seen[j] || blocksPath(g[j])) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  if (!seen[tileIndex(5, 0)]) return false;
  let open = 0, reached = 0;
  for (let i = 0; i < g.length; i++) {
    if (!blocksPath(g[i])) { open++; if (seen[i]) reached++; }
  }
  // close off small unreachable pockets instead of throwing the room away
  if (reached < open) {
    if (open - reached > 6) return false;
    for (let i = 0; i < g.length; i++) if (!blocksPath(g[i]) && !seen[i]) g[i] = TILE.WALL;
  }
  return true;
}

// ---------- collision ----------

// Push a circle out of solid tiles and the room edges. Returns true if it touched something.
function resolveTiles(e, walker, minYOverride) {
  let hit = false;
  const minX = ROOM_X + e.r, maxX = ROOM_X + ROOM_W - e.r;
  const minY = minYOverride !== undefined ? minYOverride : ROOM_Y + e.r;
  const maxY = ROOM_Y + ROOM_H - e.r;
  if (e.x < minX) { e.x = minX; hit = true; }
  if (e.x > maxX) { e.x = maxX; hit = true; }
  if (e.y < minY) { e.y = minY; hit = true; }
  if (e.y > maxY) { e.y = maxY; hit = true; }
  if (!walker) return hit;
  const c0 = colOf(e.x - e.r), c1 = colOf(e.x + e.r);
  const r0 = rowOf(e.y - e.r), r1 = rowOf(e.y + e.r);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      if (!blocksWalk(room.grid[tileIndex(c, r)])) continue;
      const tx = ROOM_X + c * T, ty = ROOM_Y + r * T;
      const cx = clamp(e.x, tx, tx + T), cy = clamp(e.y, ty, ty + T);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= e.r * e.r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = e.r - d;
        e.x += (dx / d) * push;
        e.y += (dy / d) * push;
      } else {
        // centre inside the tile: push out the shortest way
        const l = e.x - tx, rr = tx + T - e.x, u = e.y - ty, b = ty + T - e.y;
        const m = Math.min(l, rr, u, b);
        if (m === l) e.x = tx - e.r; else if (m === rr) e.x = tx + T + e.r;
        else if (m === u) e.y = ty - e.r; else e.y = ty + T + e.r;
      }
    }
  }
  return hit;
}

// Move with sub-steps so fast dashes do not tunnel through tiles.
function moveEntity(e, dx, dy, walker, minY) {
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / (e.r * 0.6)));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    e.x += dx / steps;
    e.y += dy / steps;
    if (resolveTiles(e, walker, minY)) hit = true;
  }
  return hit;
}

// Do walls block the straight line between two points? (water does not block shots)
function lineClear(ax, ay, bx, by, walk) {
  const d = dist(ax, ay, bx, by);
  const n = Math.ceil(d / 5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const tl = tileAt(ax + (bx - ax) * t, ay + (by - ay) * t);
    if (tl === TILE.WALL || (walk && (tl === TILE.WATER || tl === TILE.LAVA))) return false;
  }
  return true;
}

// Like lineClear for walking, but checks a band as wide as the walker so it does not
// try to squeeze through the gap between two diagonal blocks.
function pathClear(ax, ay, bx, by, r) {
  const d = dist(ax, ay, bx, by) || 1;
  const nx = (-(by - ay) / d) * r * 0.9, ny = ((bx - ax) / d) * r * 0.9;
  return lineClear(ax, ay, bx, by, true) &&
    lineClear(ax + nx, ay + ny, bx + nx, by + ny, true) &&
    lineClear(ax - nx, ay - ny, bx - nx, by - ny, true);
}

// Distance to the first wall along a direction (for charge telegraphs and lasers).
function rayLength(x, y, ang, max = 800) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let d = 0; d < max; d += 6) {
    const px = x + dx * d, py = y + dy * d;
    if (px < ROOM_X || px > ROOM_X + ROOM_W || py < ROOM_Y || py > ROOM_Y + ROOM_H) return d;
    if (tileAt(px, py) === TILE.WALL) return d;
  }
  return max;
}

// ---------- path finding ----------
// Ground enemies steer along a distance map on a fine grid (NAV px per cell). A cell only counts as
// open if a circle the size of the enemy fits there, so big enemies are never sent through gaps
// they cannot squeeze through. There is one map per size class, built when an enemy of that class
// asks for it and rebuilt when the target has moved.

const NAV = 5;
const NAV_W = (COLS * T) / NAV, NAV_H = (ROWS * T) / NAV;
const NAV_RADII = [13, 14, 16, 18, 19, 21, 26];   // size classes: the biggest enemy radius in each
const NAV_SEED = 26;                              // the map starts at open cells this close to the target
const NAV_LOOK = 8;                               // how many cells ahead an enemy aims
const NAV_KEEP = 12;                              // maps kept per size class: the player's plus one per enemy heading elsewhere
const NAV_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

const navIdx = (i, j) => j * NAV_W + i;
const navX = i => ROOM_X + (i + 0.5) * NAV;
const navY = j => ROOM_Y + (j + 0.5) * NAV;
const navCell = (x, y) => navIdx(clamp(Math.floor((x - ROOM_X) / NAV), 0, NAV_W - 1), clamp(Math.floor((y - ROOM_Y) / NAV), 0, NAV_H - 1));
const navClassOf = r => NAV_RADII.find(v => r <= v) || NAV_RADII[NAV_RADII.length - 1];

// Does a circle of radius R fit at (x, y)? Half a cell of slack so a gap that really is wide enough
// is not lost between two cells.
function navFits(R, x, y) {
  const m = R - NAV / 2;
  if (x < ROOM_X + m || x > ROOM_X + ROOM_W - m || y < ROOM_Y + m || y > ROOM_Y + ROOM_H - m) return false;
  if (tileAt(x, y) === TILE.LAVA) return false;
  const c0 = colOf(x - m), c1 = colOf(x + m), r0 = rowOf(y - m), r1 = rowOf(y + m);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS || !blocksWalk(room.grid[tileIndex(c, r)])) continue;
      const tx = ROOM_X + c * T, ty = ROOM_Y + r * T;
      const dx = x - clamp(x, tx, tx + T), dy = y - clamp(y, ty, ty + T);
      if (dx * dx + dy * dy < m * m) return false;
    }
  }
  return true;
}

function navFor(R, tx, ty) {
  let n = room.nav[R];
  if (!n) {
    const open = new Uint8Array(NAV_W * NAV_H);
    for (let j = 0; j < NAV_H; j++) for (let i = 0; i < NAV_W; i++) open[navIdx(i, j)] = navFits(R, navX(i), navY(j)) ? 1 : 0;
    n = room.nav[R] = { open, maps: new Map(), queue: new Int32Array(NAV_W * NAV_H), tick: 0 };
  }
  const key = Math.round(tx / 8) * 256 + Math.round(ty / 8);
  let m = n.maps.get(key);
  if (!m) {
    if (n.maps.size >= NAV_KEEP) {   // recycle the map that was used longest ago
      let oldKey = null;
      for (const [k, v] of n.maps) if (oldKey === null || v.used < n.maps.get(oldKey).used) oldKey = k;
      m = n.maps.get(oldKey);
      n.maps.delete(oldKey);
    } else m = { flow: new Int16Array(NAV_W * NAV_H), used: 0 };
    fillNav(n.open, m.flow, n.queue, tx, ty);
    n.maps.set(key, m);
  }
  m.used = ++n.tick;
  return { open: n.open, flow: m.flow };
}

// Breadth-first distance (in cells) to the target for every open cell.
function fillNav(open, flow, queue, tx, ty) {
  flow.fill(-1);
  let tail = 0;
  const i0 = Math.floor((tx - ROOM_X) / NAV), j0 = Math.floor((ty - ROOM_Y) / NAV);
  const span = Math.ceil(NAV_SEED / NAV) + 1;
  for (let j = Math.max(0, j0 - span); j <= Math.min(NAV_H - 1, j0 + span); j++) {
    for (let i = Math.max(0, i0 - span); i <= Math.min(NAV_W - 1, i0 + span); i++) {
      const k = navIdx(i, j);
      if (open[k] && dist2(navX(i), navY(j), tx, ty) <= NAV_SEED * NAV_SEED) { flow[k] = 0; queue[tail++] = k; }
    }
  }
  let head = 0;
  while (head < tail) {
    const k = queue[head++];
    const i = k % NAV_W, j = (k / NAV_W) | 0;
    for (const [di, dj] of NAV_DIRS) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NAV_W || b >= NAV_H) continue;
      const nk = navIdx(a, b);
      if (flow[nk] !== -1 || !open[nk]) continue;
      if (di && dj && (!open[navIdx(a, j)] || !open[navIdx(i, b)])) continue;   // no cutting wall corners
      flow[nk] = flow[k] + 1;
      queue[tail++] = nk;
    }
  }
}

// Is the straight line between two points made of open cells only?
function navLineOpen(open, ax, ay, bx, by) {
  const n = Math.ceil(dist(ax, ay, bx, by) / (NAV / 2));
  for (let s = 1; s <= n; s++) {
    const x = ax + ((bx - ax) * s) / n, y = ay + ((by - ay) * s) / n;
    const i = clamp(Math.floor((x - ROOM_X) / NAV), 0, NAV_W - 1), j = clamp(Math.floor((y - ROOM_Y) / NAV), 0, NAV_H - 1);
    if (!open[navIdx(i, j)]) return false;
  }
  return true;
}

// Direction a ground enemy should walk to reach (tx, ty), or null if it has no way there.
function pathDir(e, tx, ty) {
  if (pathClear(e.x, e.y, tx, ty, e.r)) return angleTo(e.x, e.y, tx, ty);
  const { open, flow } = navFor(navClassOf(e.r), tx, ty);
  const ci = clamp(Math.floor((e.x - ROOM_X) / NAV), 0, NAV_W - 1), cj = clamp(Math.floor((e.y - ROOM_Y) / NAV), 0, NAV_H - 1);
  // the lowest reachable cell around the enemy (it is rarely exactly on a cell, and may be pressed against a wall)
  let i = -1, j = -1, best = Infinity;
  for (let k = 1; k <= 12 && i < 0; k++) {
    for (let b = Math.max(0, cj - k); b <= Math.min(NAV_H - 1, cj + k); b++) {
      for (let a = Math.max(0, ci - k); a <= Math.min(NAV_W - 1, ci + k); a++) {
        const d = flow[navIdx(a, b)];
        if (d >= 0 && d < best) { best = d; i = a; j = b; }
      }
    }
  }
  if (i < 0) return null;
  if (best === 0) return angleTo(e.x, e.y, tx, ty);
  // follow the map downhill and aim at the furthest cell that can be reached in a straight line
  let ti = i, tj = j;
  for (let step = 0; step < NAV_LOOK; step++) {
    let ni = -1, nj = -1, nd = flow[navIdx(i, j)];
    if (nd <= 0) break;
    for (const [di, dj] of NAV_DIRS) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NAV_W || b >= NAV_H) continue;
      const d = flow[navIdx(a, b)];
      if (d < 0 || d >= nd) continue;
      if (di && dj && (!open[navIdx(a, j)] || !open[navIdx(i, b)])) continue;
      nd = d; ni = a; nj = b;
    }
    if (ni < 0) break;
    i = ni; j = nj;
    if (navLineOpen(open, e.x, e.y, navX(i), navY(j))) { ti = i; tj = j; }
  }
  return angleTo(e.x, e.y, navX(ti), navY(tj));
}

// Random open tile, used for spawning and teleporting.
function randomOpenSpot(opts = {}) {
  const { minDist = 0, maxDist = 9999, fromX = 0, fromY = 0, maxRow = ROWS - 1, minRow = 0, ground = true, fit = 0 } = opts;
  for (let i = 0; i < 80; i++) {
    const c = randInt(0, COLS - 1), r = randInt(minRow, maxRow);
    const t = room.grid[tileIndex(c, r)];
    if (ground ? blocksPath(t) || t === TILE.SPIKES : t === TILE.WALL) continue;
    const x = tileCenterX(c) + rand(-6, 6), y = tileCenterY(r) + rand(-6, 6);
    const d = dist(x, y, fromX, fromY);
    if (d < minDist || d > maxDist) continue;
    if (fit) {   // big enemies need room to stand, and a way to the player
      const R = navClassOf(fit);
      if (!navFits(R, x, y) || navFor(R, fromX, fromY).flow[navCell(x, y)] < 0) continue;
    }
    return { x, y };
  }
  return { x: tileCenterX(5), y: tileCenterY(Math.min(maxRow, 5)) };
}
