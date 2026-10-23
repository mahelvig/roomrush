'use strict';
// Room layouts (tile grid), collision against tiles, line of sight and path finding.

const room = {
  grid: new Uint8Array(COLS * ROWS),
  flow: new Int16Array(COLS * ROWS),
  flowFrom: -1,
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
  room.seed = (Math.random() * 1e9) | 0;
  room.type = type;
  const rng = makeRng(room.seed);
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
      room.flowFrom = -1;
      return;
    }
  }
  room.grid = new Uint8Array(COLS * ROWS);
  room.flowFrom = -1;
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
  const n = Math.ceil(d / 8);
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

// Breadth-first distance map from the player's tile (shared by all ground enemies).
function updateFlow(px, py) {
  const c = clamp(colOf(px), 0, COLS - 1), r = clamp(rowOf(py), 0, ROWS - 1);
  const from = tileIndex(c, r);
  if (from === room.flowFrom) return;
  room.flowFrom = from;
  const f = room.flow;
  f.fill(-1);
  f[from] = 0;
  const q = [from];
  let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const ic = i % COLS, ir = (i / COLS) | 0;
    for (const [dc, dr] of DIRS8) {
      const nc = ic + dc, nr = ir + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = tileIndex(nc, nr);
      if (f[j] !== -1 || blocksPath(room.grid[j])) continue;
      if (dc && dr && (blocksPath(room.grid[tileIndex(ic + dc, ir)]) || blocksPath(room.grid[tileIndex(ic, ir + dr)]))) continue;
      f[j] = f[i] + 1;
      q.push(j);
    }
  }
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// Direction a ground enemy should walk to reach the player.
function pathDir(e, tx, ty) {
  if (pathClear(e.x, e.y, tx, ty, e.r)) return angleTo(e.x, e.y, tx, ty);
  const c = colOf(e.x), r = rowOf(e.y);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return angleTo(e.x, e.y, tx, ty);
  const here = room.flow[tileIndex(c, r)];
  let best = null, bestD = here < 0 ? 9999 : here;
  for (const [dc, dr] of DIRS8) {
    const nc = c + dc, nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
    const d = room.flow[tileIndex(nc, nr)];
    if (d >= 0 && d < bestD) { bestD = d; best = [nc, nr]; }
  }
  if (!best) return angleTo(e.x, e.y, tx, ty);
  return angleTo(e.x, e.y, tileCenterX(best[0]), tileCenterY(best[1]));
}

// Random open tile, used for spawning and teleporting.
function randomOpenSpot(opts = {}) {
  const { minDist = 0, maxDist = 9999, fromX = 0, fromY = 0, maxRow = ROWS - 1, minRow = 0, ground = true } = opts;
  for (let i = 0; i < 80; i++) {
    const c = randInt(0, COLS - 1), r = randInt(minRow, maxRow);
    const t = room.grid[tileIndex(c, r)];
    if (ground ? blocksPath(t) || t === TILE.SPIKES : t === TILE.WALL) continue;
    const x = tileCenterX(c) + rand(-6, 6), y = tileCenterY(r) + rand(-6, 6);
    const d = dist(x, y, fromX, fromY);
    if (d < minDist || d > maxDist) continue;
    return { x, y };
  }
  return { x: tileCenterX(5), y: tileCenterY(Math.min(maxRow, 5)) };
}
