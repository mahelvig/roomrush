'use strict';
// Room backgrounds (drawn once per room into an offscreen canvas), the door and animated tiles.

const SPIKE_CYCLE = 3.6;
function spikePhase(t) {
  const k = t % SPIKE_CYCLE;
  if (k < 2.2) return 'down';
  if (k < 2.8) return 'warn';
  return 'up';
}

function renderRoomBG(world, s) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(WORLD_W * s);
  cv.height = Math.ceil(WORLD_H * s);
  const g = cv.getContext('2d');
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const th = world.theme;
  const rng = makeRng(room.seed);
  const R = () => rng();

  g.fillStyle = th.outer;
  g.fillRect(0, 0, WORLD_W, WORLD_H);

  // floor
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = ROOM_X + c * T, y = ROOM_Y + r * T;
      g.fillStyle = (r + c) % 2 ? th.floorA : th.floorB;
      g.fillRect(x, y, T, T);
      floorDetail(g, world, x, y, R);
    }
  }
  // hazard tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = room.grid[tileIndex(c, r)];
      if (t === TILE.WATER) liquidTile(g, c, r, TILE.WATER, th.waterDark, th.water, 'rgba(255,255,255,0.55)', R);
      else if (t === TILE.LAVA) liquidTile(g, c, r, TILE.LAVA, '#7a2410', th.lava, 'rgba(255,220,120,0.6)', R);
      else if (t === TILE.ICE) iceTile(g, c, r, th, R);
      else if (t === TILE.SPIKES) spikeBase(g, c, r);
      else if (t === TILE.VOID) voidTile(g, c, r, th, R);
    }
  }
  if (room.fort && room.fort.exitY !== null) {
    // a red carpet from the gate down to the line you have to cross
    const y1 = room.fort.exitY;
    g.fillStyle = th.carpet; g.fillRect(DOOR_X - 24, ROOM_Y, 48, y1 - ROOM_Y + 6);
    g.fillStyle = '#ffcf3f'; g.fillRect(DOOR_X - 24, ROOM_Y, 3, y1 - ROOM_Y + 6); g.fillRect(DOOR_X + 21, ROOM_Y, 3, y1 - ROOM_Y + 6);
    g.fillStyle = 'rgba(255,207,63,0.55)'; g.fillRect(ROOM_X, y1 - 1.5, ROOM_W, 3);
  }
  // soft shadow under the top wall
  const grd = g.createLinearGradient(0, ROOM_Y, 0, ROOM_Y + 24);
  grd.addColorStop(0, 'rgba(10,5,25,0.35)');
  grd.addColorStop(1, 'rgba(10,5,25,0)');
  g.fillStyle = grd;
  g.fillRect(ROOM_X, ROOM_Y, ROOM_W, 24);

  drawFrame(g, world, R);

  // obstacles, top to bottom so lower ones overlap
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (room.grid[tileIndex(c, r)] !== TILE.WALL) continue;
      const special = room.fort && room.fort.special.get(tileIndex(c, r));
      if (special === 'tower' || special === 'gate') continue;   // drawn every frame (fortress.js)
      if (room.fort && special !== 'cover') { wallBlock(g, c, r, th); continue; }
      const kind = world.obstacles[Math.floor(R() * world.obstacles.length)];
      drawObstacle(g, world, kind, tileCenterX(c), tileCenterY(r), R);
    }
  }
  return cv;
}

// A block of fortress wall: a raised stone top and, where nothing stands in front of it, a brick face.
function wallBlock(g, c, r, th) {
  const x = ROOM_X + c * T, y = ROOM_Y + r * T, H = 9;
  const solid = (cc, rr) => isTile(cc, rr, TILE.WALL) && !room.fort.special.has(tileIndex(cc, rr));
  const below = solid(c, r + 1);
  if (!below) {
    g.fillStyle = th.wall; g.fillRect(x, y + T - H, T, H);
    g.strokeStyle = 'rgba(20,14,30,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y + T - H / 2); g.lineTo(x + T, y + T - H / 2);
    for (const dx of [8, 22]) { g.moveTo(x + dx, y + T - H); g.lineTo(x + dx, y + T - H / 2); }
    g.moveTo(x + 15, y + T - H / 2); g.lineTo(x + 15, y + T); g.stroke();
  }
  g.fillStyle = th.wallTop; g.fillRect(x, y - H, T, T);
  g.strokeStyle = 'rgba(20,14,30,0.25)'; g.lineWidth = 1;
  g.strokeRect(x + 3, y - H + 3, T - 6, T - 6);
  g.strokeStyle = OL; g.lineWidth = 2;
  g.beginPath();
  if (!solid(c, r - 1)) { g.moveTo(x, y - H); g.lineTo(x + T, y - H); }
  if (!solid(c - 1, r)) { g.moveTo(x, y - H); g.lineTo(x, below ? y + T - H : y + T); }
  if (!solid(c + 1, r)) { g.moveTo(x + T, y - H); g.lineTo(x + T, below ? y + T - H : y + T); }
  if (!below) { g.moveTo(x, y + T - H); g.lineTo(x + T, y + T - H); g.moveTo(x, y + T); g.lineTo(x + T, y + T); }
  g.stroke();
}

function floorDetail(g, world, x, y, R) {
  const th = world.theme;
  if (world.id === 'woods') {
    for (let i = 0; i < 2; i++) {
      const px = x + 4 + R() * (T - 8), py = y + 6 + R() * (T - 10);
      g.beginPath();
      g.moveTo(px - 2.5, py - 3); g.lineTo(px, py); g.lineTo(px + 0.5, py - 4); g.moveTo(px, py); g.lineTo(px + 3, py - 2.5);
      g.strokeStyle = th.detail; g.lineWidth = 1.3; g.stroke();
    }
    if (R() < 0.09) {
      const px = x + 6 + R() * (T - 12), py = y + 6 + R() * (T - 12);
      const fc = th.flower[Math.floor(R() * th.flower.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath(); g.arc(px + Math.cos(a) * 2.3, py + Math.sin(a) * 2.3, 1.8, 0, TAU);
        g.fillStyle = fc; g.fill();
      }
      g.beginPath(); g.arc(px, py, 1.4, 0, TAU); g.fillStyle = '#ffcf3f'; g.fill();
    }
  } else if (world.id === 'caverns') {
    if (R() < 0.3) {
      g.beginPath();
      let px = x + R() * T, py = y + R() * T;
      g.moveTo(px, py);
      for (let k = 0; k < 3; k++) { px += R() * 12 - 6; py += R() * 12 - 6; g.lineTo(px, py); }
      g.strokeStyle = rgba(th.crack, 0.35); g.lineWidth = 1.4; g.stroke();
    }
    if (R() < 0.25) {
      g.beginPath(); g.ellipse(x + R() * T, y + R() * T, 2 + R() * 2, 1.5 + R(), 0, 0, TAU);
      g.fillStyle = th.detail; g.fill();
    }
  } else if (world.id === 'citadel') {
    // big flagstones, now and then an iron grate or a crack
    g.strokeStyle = rgba(th.detail, 0.9);
    g.lineWidth = 1.2;
    g.strokeRect(x + 0.6, y + 0.6, T - 1.2, T - 1.2);
    if (R() < 0.45) { g.beginPath(); g.moveTo(x + T / 2, y + 1); g.lineTo(x + T / 2, y + T - 1); g.stroke(); }
    const k = R();
    if (k < 0.012) {
      rrect(g, x + 8, y + 8, 14, 14, 2); g.fillStyle = rgba(th.detail, 0.9); g.fill();
      g.strokeStyle = rgba(th.floorA, 0.9); g.lineWidth = 1.2;
      g.beginPath(); for (const d of [12, 15, 18]) { g.moveTo(x + d, y + 9); g.lineTo(x + d, y + 21); } g.stroke();
    } else if (k < 0.08) {
      g.beginPath(); const px = x + 5 + R() * 18, py = y + 5 + R() * 18;
      g.moveTo(px, py); g.lineTo(px + 5, py + 4); g.lineTo(px + 6, py + 10);
      g.strokeStyle = th.detail; g.stroke();
    }
  } else if (world.id === 'sky') {
    // worn marble slabs with moss in the cracks
    g.strokeStyle = rgba(th.detail, 0.9);
    g.lineWidth = 1.2;
    g.strokeRect(x + 0.6, y + 0.6, T - 1.2, T - 1.2);
    if (R() < 0.18) {
      g.beginPath(); g.ellipse(x + R() * T, y + T - 2 - R() * 6, 4 + R() * 4, 2 + R() * 1.5, 0, 0, TAU);
      g.fillStyle = rgba(th.moss, 0.75); g.fill();
    }
    if (R() < 0.1) {
      g.beginPath(); const px = x + 6 + R() * 18, py = y + 6 + R() * 18;
      g.moveTo(px, py); g.lineTo(px + 4, py + 5); g.lineTo(px + 3, py + 10);
      g.strokeStyle = th.detail; g.stroke();
    }
  } else {
    g.strokeStyle = rgba(th.detail, 0.8);
    g.lineWidth = 1.2;
    g.strokeRect(x + 0.6, y + 0.6, T - 1.2, T - 1.2);
    if (R() < 0.12) {
      g.beginPath();
      const px = x + 5 + R() * 20, py = y + 5 + R() * 20;
      g.moveTo(px, py); g.lineTo(px + 5, py + 3); g.lineTo(px + 7, py + 9);
      g.strokeStyle = th.detail; g.stroke();
    }
    if (R() < 0.08) {
      g.beginPath(); g.ellipse(x + 15, y + 15, 9, 6, R(), 0, TAU);
      g.fillStyle = 'rgba(220,240,255,0.25)'; g.fill();
    }
  }
}

const isTile = (c, r, t) => c >= 0 && r >= 0 && c < COLS && r < ROWS && room.grid[tileIndex(c, r)] === t;

function liquidTile(g, c, r, type, dark, main, foam, R) {
  const x = ROOM_X + c * T, y = ROOM_Y + r * T;
  g.fillStyle = dark;
  g.fillRect(x, y, T, T);
  const l = isTile(c - 1, r, type) ? 0 : 3, rr = isTile(c + 1, r, type) ? 0 : 3;
  const u = isTile(c, r - 1, type) ? 0 : 6, d = isTile(c, r + 1, type) ? 0 : 2;
  g.fillStyle = main;
  g.fillRect(x + l, y + u, T - l - rr, T - u - d);
  g.strokeStyle = foam;
  g.lineWidth = 1.6;
  g.beginPath();
  if (u) { g.moveTo(x + l, y + u); g.lineTo(x + T - rr, y + u); }
  if (l) { g.moveTo(x + l, y + u); g.lineTo(x + l, y + T - d); }
  if (rr) { g.moveTo(x + T - rr, y + u); g.lineTo(x + T - rr, y + T - d); }
  g.stroke();
  if (type === TILE.LAVA) {
    for (let i = 0; i < 2; i++) {
      g.beginPath(); g.ellipse(x + 6 + R() * 18, y + 8 + R() * 16, 3 + R() * 3, 2 + R() * 2, 0, 0, TAU);
      g.fillStyle = '#ffd35a'; g.fill();
    }
  } else if (R() < 0.25) {
    const px = x + 8 + R() * 14, py = y + 10 + R() * 12;
    g.beginPath(); g.arc(px, py, 4.5, 0.4, TAU - 0.4); g.lineTo(px, py); g.closePath();
    g.fillStyle = '#5fbf4a'; g.fill();
    g.strokeStyle = OL; g.lineWidth = 1.2; g.stroke();
  }
}

function iceTile(g, c, r, th, R) {
  const x = ROOM_X + c * T, y = ROOM_Y + r * T;
  g.fillStyle = th.iceDark;
  g.fillRect(x, y, T, T);
  g.fillStyle = th.ice;
  g.fillRect(x + 1, y + 1, T - 2, T - 2);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x + 5, y + 12); g.lineTo(x + 12, y + 5);
  g.moveTo(x + 9, y + 22); g.lineTo(x + 22, y + 9);
  g.stroke();
}

// A gap in the floating island: sky and clouds far below, a rock face under the edge above it.
function voidTile(g, c, r, th, R) {
  const x = ROOM_X + c * T, y = ROOM_Y + r * T;
  const grd = g.createLinearGradient(0, y, 0, y + T);
  grd.addColorStop(0, th.skyDeep);
  grd.addColorStop(1, th.sky);
  g.fillStyle = grd;
  g.fillRect(x, y, T, T);
  if (R() < 0.5) {
    const cx = x + 6 + R() * 18, cy = y + 12 + R() * 12;
    for (const [dx, dy, rr] of [[-4, 1, 4], [0, -1, 5], [5, 1, 4]]) { g.beginPath(); g.arc(cx + dx, cy + dy, rr, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill(); }
  }
  const solid = (cc, rr) => !isTile(cc, rr, TILE.VOID) && cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS;
  if (solid(c, r - 1)) {   // the rock face under the edge
    g.fillStyle = th.rock;
    g.fillRect(x, y, T, 9);
    g.beginPath(); g.moveTo(x, y + 9);
    for (let i = 1; i <= 5; i++) g.lineTo(x + (i * T) / 5 - T / 10, y + 9 + (i % 2 ? 4 : 0));
    g.lineTo(x + T, y + 9); g.lineTo(x + T, y); g.closePath();
    g.fillStyle = darken(th.rock, 0.15); g.fill();
  }
  g.strokeStyle = OL;
  g.lineWidth = 2;
  g.beginPath();
  if (solid(c, r - 1)) { g.moveTo(x, y); g.lineTo(x + T, y); }
  if (solid(c, r + 1)) { g.moveTo(x, y + T); g.lineTo(x + T, y + T); }
  if (solid(c - 1, r)) { g.moveTo(x, y); g.lineTo(x, y + T); }
  if (solid(c + 1, r)) { g.moveTo(x + T, y); g.lineTo(x + T, y + T); }
  g.stroke();
}

function spikeBase(g, c, r) {
  const x = ROOM_X + c * T, y = ROOM_Y + r * T;
  rrect(g, x + 2, y + 2, T - 4, T - 4, 4);
  g.fillStyle = '#58637a'; g.fill();
  g.strokeStyle = OL; g.lineWidth = 1.6; g.stroke();
  for (const [dx, dy] of [[9, 9], [21, 9], [9, 21], [21, 21], [15, 15]]) {
    g.beginPath(); g.arc(x + dx, y + dy, 2, 0, TAU);
    g.fillStyle = '#2a2f3d'; g.fill();
  }
}

// Fill everything round the room interior with the current fillStyle.
function fillBorder(g) {
  g.fillRect(0, 0, WORLD_W, ROOM_Y);
  g.fillRect(0, 0, ROOM_X, WORLD_H);
  g.fillRect(ROOM_X + ROOM_W, 0, WORLD_W - ROOM_X - ROOM_W, WORLD_H);
  g.fillRect(0, ROOM_Y + ROOM_H, WORLD_W, WORLD_H - ROOM_Y - ROOM_H);
}

function drawFrame(g, world, R) {
  const th = world.theme;
  g.fillStyle = th.wall;
  fillBorder(g);

  if (world.id === 'woods') {
    // hedges with round bushes along the room edge
    const bush = (x, y, r) => {
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = th.wallTop; g.fill();
      g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    };
    for (let x = 4; x < WORLD_W; x += 16) if (Math.abs(x - DOOR_X) > 38) bush(x + R() * 4, ROOM_Y - 10 + R() * 4, 11 + R() * 3);
    for (let y = ROOM_Y + 10; y < ROOM_Y + ROOM_H; y += 17) {
      bush(4 + R() * 3, y + R() * 4, 9 + R() * 3);
      bush(WORLD_W - 4 - R() * 3, y + R() * 4, 9 + R() * 3);
    }
    for (let x = 6; x < WORLD_W; x += 17) bush(x + R() * 4, ROOM_Y + ROOM_H + 10 + R() * 5, 10 + R() * 3);
    for (let x = 10; x < WORLD_W; x += 34) {
      if (Math.abs(x - DOOR_X) < 50) continue;
      g.beginPath(); g.arc(x, ROOM_Y - 40 + R() * 10, 18 + R() * 6, 0, TAU);
      g.fillStyle = th.outer; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.6; g.stroke();
    }
  } else if (world.id === 'caverns') {
    g.fillStyle = th.wallTop;
    const edge = (x0, y0, x1, y1, nx, ny) => {
      g.beginPath();
      g.moveTo(x0, y0);
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14);
      for (let i = 1; i <= n; i++) {
        const t = i / n, j = 3 + R() * 6;
        g.lineTo(lerp(x0, x1, t) + nx * j, lerp(y0, y1, t) + ny * j);
      }
      g.lineTo(x1, y1);
      g.closePath();
      g.fill();
      g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
    };
    edge(0, ROOM_Y, DOOR_X - 34, ROOM_Y, 0, -1);
    edge(DOOR_X + 34, ROOM_Y, WORLD_W, ROOM_Y, 0, -1);
    edge(ROOM_X, ROOM_Y, ROOM_X, ROOM_Y + ROOM_H, -1, 0);
    edge(ROOM_X + ROOM_W, ROOM_Y, ROOM_X + ROOM_W, ROOM_Y + ROOM_H, 1, 0);
    edge(0, ROOM_Y + ROOM_H, WORLD_W, ROOM_Y + ROOM_H, 0, 1);
    for (let i = 0; i < 14; i++) {
      const x = R() * WORLD_W, y = R() * (ROOM_Y - 20);
      g.beginPath(); g.arc(x, y, 1.5 + R() * 1.5, 0, TAU);
      g.fillStyle = rgba(th.crack, 0.5); g.fill();
    }
  } else if (world.id === 'sky') {
    // open sky round the island, a rocky rim and its underside hanging in the air
    const sky = g.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, th.skyDeep);
    sky.addColorStop(1, th.sky);
    g.fillStyle = sky;
    fillBorder(g);
    for (let i = 0; i < 9; i++) {
      const cx = R() * WORLD_W, cy = R() * ROOM_Y * 0.8;
      for (const [dx, dy, rr] of [[-10, 2, 9], [0, -3, 12], [12, 2, 9]]) { g.beginPath(); g.arc(cx + dx, cy + dy, rr, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
    }
    g.fillStyle = th.rock;
    g.beginPath(); g.moveTo(ROOM_X, ROOM_Y + ROOM_H);
    for (let x = ROOM_X; x <= ROOM_X + ROOM_W; x += 22) g.lineTo(x + 11, ROOM_Y + ROOM_H + 12 + R() * 14);
    g.lineTo(ROOM_X + ROOM_W, ROOM_Y + ROOM_H); g.closePath();
    g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = th.wallTop;
    g.fillRect(0, ROOM_Y - 7, WORLD_W, 7);
    g.fillRect(ROOM_X - 6, ROOM_Y, 6, ROOM_H);
    g.fillRect(ROOM_X + ROOM_W, ROOM_Y, 6, ROOM_H);
    g.fillRect(ROOM_X - 6, ROOM_Y + ROOM_H, ROOM_W + 12, 6);
    for (const x of [44, WORLD_W - 44]) {   // two broken pillars on the upper ledge
      rrect(g, x - 7, ROOM_Y - 40, 14, 34, 2); fs(g, '#e9e2d2', 1.8);
      for (const dx of [-3, 2]) { g.beginPath(); g.moveTo(x + dx, ROOM_Y - 38); g.lineTo(x + dx, ROOM_Y - 8); g.strokeStyle = '#c4b8a0'; g.lineWidth = 1.3; g.stroke(); }
    }
  } else {
    // stone bricks
    g.strokeStyle = 'rgba(10,10,30,0.45)';
    g.lineWidth = 1.2;
    const bricks = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y += 10) {
        const off = ((y - y0) / 10) % 2 ? 9 : 0;
        for (let x = x0 - off; x < x0 + w; x += 18) g.strokeRect(Math.max(x0, x), y, Math.min(18, x0 + w - Math.max(x0, x)), 10);
      }
    };
    bricks(0, 0, WORLD_W, ROOM_Y);
    bricks(0, ROOM_Y, ROOM_X, ROOM_H);
    bricks(ROOM_X + ROOM_W, ROOM_Y, ROOM_X, ROOM_H);
    bricks(0, ROOM_Y + ROOM_H, WORLD_W, WORLD_H - ROOM_Y - ROOM_H);
    g.fillStyle = th.wallTop;
    g.fillRect(0, ROOM_Y - 6, WORLD_W, 6);
    g.fillRect(ROOM_X - 5, ROOM_Y, 5, ROOM_H);
    g.fillRect(ROOM_X + ROOM_W, ROOM_Y, 5, ROOM_H);
    g.fillRect(0, ROOM_Y + ROOM_H, WORLD_W, 5);
    const fire = world.id === 'citadel' ? ['rgba(255,170,80,0.3)', '#ffb36a'] : ['rgba(120,220,255,0.25)', '#9ff0ff'];
    for (const x of [40, WORLD_W - 40]) {
      // torches
      g.fillStyle = '#5a4a3a'; g.fillRect(x - 2, ROOM_Y - 34, 4, 12);
      g.beginPath(); g.arc(x, ROOM_Y - 38, 9, 0, TAU); g.fillStyle = fire[0]; g.fill();
      g.beginPath(); g.arc(x, ROOM_Y - 38, 4, 0, TAU); g.fillStyle = fire[1]; g.fill();
    }
    if (world.id === 'citadel') {
      for (const x of [100, WORLD_W - 100]) {
        g.beginPath(); g.moveTo(x - 11, ROOM_Y - 52); g.lineTo(x + 11, ROOM_Y - 52); g.lineTo(x + 11, ROOM_Y - 14); g.lineTo(x, ROOM_Y - 21); g.lineTo(x - 11, ROOM_Y - 14); g.closePath();
        g.fillStyle = th.carpet; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
        circ(g, x, ROOM_Y - 36, 5); fs(g, '#ffcf3f', 1.4);
      }
    }
  }
  // inner edge line
  g.strokeStyle = OL;
  g.lineWidth = 2;
  g.strokeRect(ROOM_X, ROOM_Y, ROOM_W, ROOM_H);
}

function drawObstacle(g, world, kind, x, y, R) {
  const th = world.theme;
  g.beginPath(); g.ellipse(x, y + 9, 14, 6, 0, 0, TAU);
  g.fillStyle = 'rgba(10,5,25,0.25)'; g.fill();
  switch (kind) {
    case 'tree': {
      rrect(g, x - 4, y - 2, 8, 13, 3); fs(g, '#7a4e2e', 1.8);
      const cy = y - 10, rr = 15 + R() * 2;
      const green = R() < 0.5 ? '#4fa64a' : '#5cb352';
      g.beginPath(); g.arc(x, cy, rr, 0, TAU); fs(g, green, 2);
      g.beginPath(); g.arc(x - 6, cy + 4, rr * 0.55, 0, TAU); g.fillStyle = darken(green, 0.12); g.fill();
      g.beginPath(); g.arc(x + 6, cy + 5, rr * 0.5, 0, TAU); g.fill();
      g.beginPath(); g.arc(x - 3, cy - 4, rr * 0.6, 0, TAU); g.fillStyle = lighten(green, 0.12); g.fill();
      shine(g, x - 5, cy - 8, 4, 2.5, 0.35);
      if (R() < 0.4) for (let i = 0; i < 3; i++) {
        g.beginPath(); g.arc(x - 8 + R() * 16, cy - 6 + R() * 12, 1.8, 0, TAU); g.fillStyle = '#ff5a5f'; g.fill();
      }
      break;
    }
    case 'rock': {
      g.beginPath();
      g.moveTo(x - 13, y + 8); g.lineTo(x - 14, y - 2); g.lineTo(x - 7, y - 11); g.lineTo(x + 5, y - 12);
      g.lineTo(x + 13, y - 3); g.lineTo(x + 12, y + 8); g.closePath();
      fs(g, '#9aa0aa', 2);
      g.beginPath(); g.moveTo(x - 10, y - 2); g.lineTo(x - 5, y - 8); g.lineTo(x + 4, y - 9);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.moveTo(x + 2, y + 6); g.lineTo(x + 5, y); g.lineTo(x + 3, y - 4);
      g.strokeStyle = '#6b7280'; g.lineWidth = 1.4; g.stroke();
      break;
    }
    case 'bush': {
      for (const [dx, dy, r] of [[-7, 0, 9], [7, 0, 9], [0, -7, 10]]) {
        g.beginPath(); g.arc(x + dx, y + dy, r, 0, TAU); fs(g, '#3f9a45', 1.8);
      }
      shine(g, x - 3, y - 11, 3.5, 2, 0.3);
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.arc(x - 9 + R() * 18, y - 8 + R() * 12, 1.9, 0, TAU); g.fillStyle = '#7a5cff'; g.fill();
      }
      break;
    }
    case 'basalt': {
      g.beginPath();
      g.moveTo(x - 14, y + 9); g.lineTo(x - 13, y - 6); g.lineTo(x - 4, y - 14); g.lineTo(x + 8, y - 12);
      g.lineTo(x + 14, y - 2); g.lineTo(x + 13, y + 9); g.closePath();
      fs(g, '#3b2e33', 2);
      g.beginPath(); g.moveTo(x - 13, y - 6); g.lineTo(x - 4, y - 14); g.lineTo(x + 8, y - 12); g.lineTo(x + 2, y - 5); g.closePath();
      g.fillStyle = '#56464c'; g.fill();
      g.beginPath(); g.moveTo(x - 6, y + 8); g.lineTo(x - 2, y + 1); g.lineTo(x + 4, y - 1); g.lineTo(x + 6, y - 7);
      g.strokeStyle = th.crack; g.lineWidth = 1.8; g.stroke();
      break;
    }
    case 'crystal': {
      g.beginPath(); g.ellipse(x, y + 5, 13, 6, 0, 0, TAU); fs(g, '#2c2226', 1.8);
      for (const [dx, h, w] of [[-6, 16, 5], [3, 22, 6], [9, 12, 4]]) {
        g.beginPath(); g.moveTo(x + dx - w, y + 5); g.lineTo(x + dx, y + 5 - h); g.lineTo(x + dx + w, y + 5); g.closePath();
        fs(g, '#ff8a3a', 1.8);
        g.beginPath(); g.moveTo(x + dx, y + 5 - h); g.lineTo(x + dx + w * 0.4, y + 4); g.lineTo(x + dx + w, y + 5);
        g.fillStyle = 'rgba(255,230,140,0.55)'; g.fill();
      }
      break;
    }
    case 'tomb': {
      rrect(g, x - 13, y + 3, 26, 8, 2); fs(g, '#5d6880', 1.8);
      g.beginPath(); g.moveTo(x - 10, y + 4); g.lineTo(x - 10, y - 8); g.arc(x, y - 8, 10, Math.PI, 0); g.lineTo(x + 10, y + 4); g.closePath();
      fs(g, '#9aa6bd', 2);
      g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y); g.moveTo(x - 4, y - 8); g.lineTo(x + 4, y - 8);
      g.strokeStyle = '#5d6880'; g.lineWidth = 2; g.stroke();
      shine(g, x - 5, y - 12, 2.5, 1.6, 0.35);
      break;
    }
    case 'iceblock': {
      rrect(g, x - 13, y - 13, 26, 24, 4); fs(g, '#a8e4ff', 2);
      rrect(g, x - 13, y - 13, 26, 9, 4); g.fillStyle = '#d8f4ff'; g.fill();
      g.strokeStyle = OL; g.lineWidth = 2; rrect(g, x - 13, y - 13, 26, 24, 4); g.stroke();
      g.beginPath(); g.moveTo(x - 8, y + 6); g.lineTo(x - 2, y - 1);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.stroke();
      break;
    }
    case 'column': {   // a broken marble column
      g.beginPath(); g.ellipse(x, y + 6, 12, 5, 0, 0, TAU); fs(g, '#bdb29c', 1.8);
      const h = 14 + R() * 8;
      rrect(g, x - 8, y - h, 16, h + 6, 2); fs(g, '#ece6d8', 2);
      for (const dx of [-3, 2]) { g.beginPath(); g.moveTo(x + dx, y - h + 2); g.lineTo(x + dx, y + 4); g.strokeStyle = '#cfc5b2'; g.lineWidth = 1.4; g.stroke(); }
      g.beginPath(); g.moveTo(x - 8, y - h); g.lineTo(x - 3, y - h - 4); g.lineTo(x + 1, y - h - 1); g.lineTo(x + 5, y - h - 5); g.lineTo(x + 8, y - h);
      g.closePath(); fs(g, '#f6f1e6', 1.6);
      if (R() < 0.5) { g.beginPath(); g.ellipse(x - 4, y + 3, 4, 2, 0, 0, TAU); g.fillStyle = '#8cc56a'; g.fill(); }
      break;
    }
    case 'urn': {
      g.beginPath(); g.moveTo(x - 6, y + 8); g.quadraticCurveTo(x - 14, y - 2, x - 6, y - 12); g.lineTo(x + 6, y - 12); g.quadraticCurveTo(x + 14, y - 2, x + 6, y + 8); g.closePath();
      fs(g, '#d9a066', 2);
      rrect(g, x - 8, y - 15, 16, 4, 2); fs(g, '#c48b52', 1.6);
      g.beginPath(); g.moveTo(x - 9, y - 2); g.lineTo(x + 9, y - 2); g.strokeStyle = '#7a4e2e'; g.lineWidth = 1.6; g.stroke();
      shine(g, x - 4, y - 6, 2, 4, 0.35);
      break;
    }
    case 'boulder': {
      g.beginPath(); g.ellipse(x, y, 14, 11, 0, 0, TAU); fs(g, '#a69c8a', 2);
      g.beginPath(); g.ellipse(x - 2, y - 8, 9, 4, 0, 0, TAU); g.fillStyle = '#8cc56a'; g.fill();
      shine(g, x - 6, y - 2, 3, 2, 0.3);
      break;
    }
    case 'crate': {
      rrect(g, x - 12, y - 14, 24, 23, 2); fs(g, '#a0703f', 2);
      g.strokeStyle = '#7a4e2e'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(x - 9, y - 11); g.lineTo(x + 9, y + 6); g.moveTo(x + 9, y - 11); g.lineTo(x - 9, y + 6); g.stroke();
      rrect(g, x - 12, y - 14, 24, 23, 2); g.strokeStyle = OL; g.lineWidth = 2; g.stroke();
      shine(g, x - 7, y - 10, 3, 1.5, 0.3);
      break;
    }
    case 'barrel': {
      rrect(g, x - 10, y - 14, 20, 23, 7); fs(g, '#8a5a36', 2);
      for (const yy of [y - 8, y + 3]) { g.beginPath(); g.moveTo(x - 10, yy); g.lineTo(x + 10, yy); g.strokeStyle = '#4a4f5c'; g.lineWidth = 2.6; g.stroke(); }
      g.beginPath(); g.ellipse(x, y - 13, 8.5, 3.2, 0, 0, TAU); fs(g, '#a0703f', 1.6);
      break;
    }
    case 'sandbags': {
      for (const [dx, dy] of [[-7, 3], [7, 3], [0, -6]]) {
        g.beginPath(); g.ellipse(x + dx, y + dy, 9, 5.5, 0, 0, TAU); fs(g, '#b8a27a', 1.8);
        g.beginPath(); g.moveTo(x + dx - 5, y + dy); g.lineTo(x + dx + 5, y + dy); g.strokeStyle = '#8f7a56'; g.lineWidth = 1.2; g.stroke();
      }
      break;
    }
    case 'pillar': {
      g.beginPath(); g.ellipse(x, y + 6, 12, 5, 0, 0, TAU); fs(g, '#5d6880', 1.8);
      rrect(g, x - 8, y - 16, 16, 22, 2); fs(g, '#a4afc4', 2);
      for (const dx of [-3, 2]) { g.beginPath(); g.moveTo(x + dx, y - 14); g.lineTo(x + dx, y + 4); g.strokeStyle = '#7d889f'; g.lineWidth = 1.4; g.stroke(); }
      g.beginPath(); g.ellipse(x, y - 16, 11, 4, 0, 0, TAU); fs(g, '#c4ccdb', 1.8);
      break;
    }
  }
}

// Door in the top wall. openT goes from 0 (closed) to 1 (fully open).
function drawDoor(ctx, world, openT, t) {
  const x = DOOR_X, y = ROOM_Y, w = DOOR_W, h = 48;
  const th = world.theme;
  const glowC = { woods: '#fff3b0', caverns: '#ffc27a', crypt: '#b6f0ff', sky: '#ffffff', citadel: '#ffcf8a' }[world.id] || '#ffffff';
  ctx.save();
  // opening
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h + w / 2); ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = '#120c22';
  ctx.fill();
  if (openT > 0) {
    ctx.save();
    ctx.clip();
    const grd = ctx.createRadialGradient(x, y - 20, 2, x, y - 20, 40);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.4, glowC);
    grd.addColorStop(1, rgba(glowC, 0.1));
    ctx.globalAlpha = openT;
    ctx.fillStyle = grd;
    ctx.fillRect(x - w, y - h - 10, w * 2, h + 20);
    ctx.globalAlpha = 1;
    // door panel slides up
    ctx.translate(0, -h * ease.inOut(openT));
    doorPanel(ctx, world, x, y, w, h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.clip();
    doorPanel(ctx, world, x, y, w, h);
    ctx.restore();
  }
  // arch frame
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h + w / 2); ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, y);
  ctx.lineWidth = 9; ctx.strokeStyle = OL; ctx.stroke();
  ctx.lineWidth = 5.5; ctx.strokeStyle = world.id === 'woods' ? '#b8b0a0' : th.wallTop; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  if (openT >= 1) {
    const b = Math.sin(t * 6) * 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y + 6 + b); ctx.lineTo(x - 10, y + 18 + b); ctx.lineTo(x - 4, y + 18 + b); ctx.lineTo(x - 4, y + 28 + b);
    ctx.lineTo(x + 4, y + 28 + b); ctx.lineTo(x + 4, y + 18 + b); ctx.lineTo(x + 10, y + 18 + b); ctx.closePath();
    fs(ctx, '#ffffff', 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function doorPanel(ctx, world, x, y, w, h) {
  if (world.id === 'citadel') {   // an iron portcullis
    ctx.fillStyle = 'rgba(20,14,30,0.65)';
    ctx.fillRect(x - w / 2, y - h, w, h);
    for (let i = -2; i <= 2; i++) oline(ctx, x + i * 10, y - h, x + i * 10, y, '#7d7b8a', 2.4);
    for (const yy of [y - 34, y - 14]) oline(ctx, x - w / 2, yy, x + w / 2, yy, '#7d7b8a', 2.4);
    return;
  }
  if (world.id === 'sky') {
    ctx.fillStyle = '#ece6d8';
    ctx.fillRect(x - w / 2, y - h, w, h);
    for (const yy of [y - 36, y - 14]) { ctx.fillStyle = '#ffcf3f'; ctx.fillRect(x - w / 2, yy, w, 3); }
    ctx.strokeStyle = 'rgba(120,100,70,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y); ctx.stroke();
    circ(ctx, x, y - 25, 4); fs(ctx, '#3fb8d6', 1.4);
    return;
  }
  if (world.id === 'crypt') {
    ctx.fillStyle = 'rgba(20,20,40,0.6)';
    ctx.fillRect(x - w / 2, y - h, w, h);
    for (let i = -2; i <= 2; i++) {
      oline(ctx, x + i * 10, y - h, x + i * 10, y, '#8a93a8', 2.4);
    }
    oline(ctx, x - w / 2, y - 26, x + w / 2, y - 26, '#8a93a8', 2.4);
    return;
  }
  const wood = world.id === 'woods' ? '#8a5a36' : '#4a3a3a';
  ctx.fillStyle = wood;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 11, y - h); ctx.lineTo(x + i * 11, y); ctx.stroke();
  }
  for (const yy of [y - 34, y - 12]) {
    ctx.fillStyle = world.id === 'woods' ? '#5a5f6a' : '#ff8a3a';
    ctx.fillRect(x - w / 2, yy, w, 4);
  }
  circ(ctx, x + 14, y - 22, 2.4); fs(ctx, '#ffcf3f', 1.2);
}

// Animated touches on top of the background: lava glow, water sparkles, spikes.
function drawTileFx(ctx, world, t) {
  const list = room.fxTiles;
  if (!list) return;
  const sp = spikePhase(t);
  for (const [c, r, type] of list) {
    const x = ROOM_X + c * T, y = ROOM_Y + r * T;
    if (type === TILE.LAVA) {
      const a = 0.25 + Math.sin(t * 2 + c * 1.3 + r * 0.7) * 0.15;
      ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.fillRect(x + 3, y + 6, T - 6, T - 8);
      const bx = x + 8 + ((c * 37 + r * 13) % 14), by = y + 10 + ((c * 11 + r * 7) % 12);
      const k = (t * 0.8 + c * 0.3 + r * 0.5) % 1;
      ctx.beginPath(); ctx.arc(bx, by, 1 + k * 3, 0, TAU);
      ctx.strokeStyle = `rgba(255,240,180,${1 - k})`; ctx.lineWidth = 1.2; ctx.stroke();
    } else if (type === TILE.WATER) {
      const k = (t * 0.5 + c * 0.37 + r * 0.61) % 1;
      if (k < 0.5) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 - k})`;
        ctx.fillRect(x + 6 + ((c * 7) % 14), y + 12 + ((r * 5) % 10), 6, 1.5);
      }
    } else if (windOf(type)) {
      // streaks blowing across the band
      const dir = windOf(type);
      for (let i = 0; i < 2; i++) {
        const k = (t * 1.6 + c * 0.23 + r * 0.41 + i * 0.5) % 1;
        const sx = dir > 0 ? x + k * T : x + T - k * T, sy = y + 8 + i * 13 + ((c + r) % 3) * 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin(k * Math.PI)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - dir * 10, sy); ctx.stroke();
      }
      if ((c + r) % 4 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x + 15 + dir * 5, y + 15); ctx.lineTo(x + 15 - dir * 3, y + 10); ctx.lineTo(x + 15 - dir * 3, y + 20); ctx.closePath(); ctx.fill();
      }
    } else if (type === TILE.SPIKES) {
      if (sp === 'down') continue;
      const up = sp === 'up' ? 1 : 0.35;
      for (const [dx, dy] of [[9, 9], [21, 9], [9, 21], [21, 21], [15, 15]]) {
        ctx.beginPath();
        ctx.moveTo(x + dx - 2.6, y + dy + 1); ctx.lineTo(x + dx, y + dy - 9 * up); ctx.lineTo(x + dx + 2.6, y + dy + 1); ctx.closePath();
        fs(ctx, '#dfe6f0', 1.3);
      }
    }
  }
}

// Background for the menus: a slow starry gradient.
function drawMenuBG(ctx, w, h, t) {
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#2a1d52');
  grd.addColorStop(0.6, '#1b1430');
  grd.addColorStop(1, '#120c22');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97.3) % w + Math.sin(t * 0.3 + i) * 10 + w) % w;
    const y = (h - ((t * (8 + (i % 5) * 4) + i * 53) % (h + 20))) ;
    const a = 0.15 + ((i * 7) % 10) / 25;
    ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, TAU);
    ctx.fillStyle = `rgba(255,230,180,${a})`;
    ctx.fill();
  }
}
