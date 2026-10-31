'use strict';
// Start-up: canvas size (portrait, fits any phone), the main loop and pausing when hidden.

const app = document.getElementById('app');
const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
let cssW = 360, cssH = 640;
let dprCap = 3;
let slowT = 0;

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const tablet = isTablet();
  const landscapePhone = isTouch && W > H && !tablet;
  document.body.classList.toggle('rotate', landscapePhone);
  if (landscapePhone && G.state === 'play') pauseGame();
  // Portrait (phones and tablets): always the full width, the room scrolls with you.
  // Landscape: a portrait column in the middle; on tablets never so wide that a normal
  // room no longer fits the height. Touches on the sides still steer (Input).
  const maxW = Math.round(H * (tablet ? VIEW_W / FIT_H : 0.62));
  cssW = W <= H ? W : Math.min(W, maxW);
  cssH = H;
  app.style.width = cssW + 'px';
  app.style.left = Math.round((W - cssW) / 2) + 'px';
  const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  G.scale = cssW / VIEW_W;
  G.dpr = dpr;
  G.viewH = cssH / G.scale;
  app.style.setProperty('--u', (cssW / VIEW_W).toFixed(4));
  app.style.fontSize = Math.min(28, (cssW / VIEW_W) * 16) + 'px';
  // tablets get a bigger joystick (CSS pixels); phones keep 54
  Input.R = tablet ? Math.round(54 * clamp(G.scale / 1.08, 1, 1.6)) : 54;
  const hud = document.querySelector('.hud-top');
  G.hudH = hud ? (hud.getBoundingClientRect().bottom + 6) / G.scale : 56;
  if (G.run && room.bg) rebuildRoomBG();
  if (UI.root && UI.root.classList.contains('open')) UI.prepareCanvases();
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  // weak phone: lower the resolution step by step if we stay below ~45 fps while playing
  if (G.state === 'play' && dt < 0.25) {
    slowT = dt > 1 / 45 ? slowT + dt : Math.max(0, slowT - dt * 0.5);
    if (slowT > 2 && dprCap > 1.25 && G.dpr > 1.25) {
      dprCap = Math.max(1.25, G.dpr - 0.5);
      slowT = 0;
      resize();
    }
  }
  if (dt > 0.25) dt = 0.25;
  const speed = DEV ? window.RR.speed || 1 : 1;
  acc += dt * speed;
  let steps = 0;
  while (acc >= STEP && steps < 5 * speed) {
    updateGame(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps >= 5 * speed) acc = 0;

  const dpr = G.dpr;
  ctx.setTransform(G.scale * dpr, 0, 0, G.scale * dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const t = now / 1000;
  if (G.run && G.state !== 'menu') {
    drawGame(ctx);
    drawJoystick(ctx);
    if (G.fade > 0) {
      ctx.fillStyle = `rgba(10,6,20,${G.fade})`;
      ctx.fillRect(0, 0, VIEW_W, G.viewH);
    }
    if (G.state === 'dying') {
      ctx.fillStyle = `rgba(60,0,20,${Math.min(0.5, G.dyingT * 0.4)})`;
      ctx.fillRect(0, 0, VIEW_W, G.viewH);
    }
  } else {
    drawMenuBG(ctx, VIEW_W, G.viewH, t);
  }
  if (UI.previews.length) UI.tick(t);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.state === 'play') pauseGame();
    if (Sound.ctx) Sound.ctx.suspend();
  } else if (Sound.ctx) Sound.ctx.resume();
});
window.addEventListener('pagehide', () => {
  if (G.run && (G.state === 'play' || G.state === 'pause' || G.state === 'perk')) {
    G.run.hp = G.player.hp;
    writeRun(G.run);
  }
});
window.addEventListener('keydown', e => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && G.state === 'play') pauseGame();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && G.state === 'pause') resumeGame();
  else if (G.state === 'perk' && (e.code === 'Digit1' || e.code === 'Digit2')) choosePerk(e.code === 'Digit1' ? 0 : 1);
  else if (G.state === 'play' && (e.code === 'Space' || e.code === 'KeyE')) { e.preventDefault(); useAbility(); }
  if (DEV) devKey(e.code);
});
// stop the page from scrolling or zooming on phones
document.addEventListener('touchmove', e => { if (!e.target.closest('#ui')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => setTimeout(resize, 100));

// ---------- developer shortcuts (#dev in the address) ----------
const DEV = location.hash.includes('dev');
function devKey(code) {
  if (G.state !== 'play') return;
  if (code === 'KeyK') for (const e of G.enemies) if (!e.boss) killEnemy(e); else hurtEnemy(e, e.maxHp * 0.25);
  if (code === 'KeyN') { for (const e of G.enemies) e.dead = true; G.enemies = []; }
  if (code === 'KeyB') { G.roomIdx = roomsIn(G.world) - 1; nextRoom(); }
  if (code === 'KeyH') healPlayer(G.player.s.maxHp);
  if (code === 'KeyG') { save.gold += 1000; save.gems += 20; writeSave(); }
  if (code === 'KeyI') G.player.invuln = 9999;
}
window.RR = { G, save: () => save, startRun, choosePerk, room, PERKS, ENEMIES, WORLDS, UI, killEnemy, nextRoom };

UI.init();
Input.init(canvas, () => G.state === 'play');
resize();
UI.title();
requestAnimationFrame(t => { last = t; frame(t); });
document.fonts && document.fonts.ready.then(() => { resize(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !DEV) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
