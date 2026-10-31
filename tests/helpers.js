'use strict';
// Shared helpers for the browser tests: a static file server for the game and a way to
// open it in Chromium at a given screen size, with touch, as a phone or a tablet would.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

// Serve the repository on a free port. Resolves to { url, close }.
function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
  }));
}

// Screen sizes used across the tests (CSS pixels).
const SIZES = {
  phone: [390, 844],          // iPhone 14
  phoneSafari: [375, 553],    // iPhone SE with Safari's bars showing
  phoneLandscape: [844, 390],
  ipadPortrait: [820, 1180],  // iPad Air / 10th gen
  ipadLandscape: [1180, 820],
  ipadMini: [744, 1133],
  ipadProPortrait: [1024, 1366],
  ipadProLandscape: [1366, 1024],
};

// Open the game in a fresh browser context. The page collects uncaught errors in page.errors;
// the runner fails a test that leaves any behind. #dev turns off the service worker.
async function openGame(browser, base, [width, height], o = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, hasTouch: o.touch !== false, isMobile: o.touch !== false, deviceScaleFactor: o.dpr || 1,
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());   // run offline, fall back to system fonts
  await page.goto(`${base}/index.html#dev`);
  await page.waitForFunction(() => window.RR && RR.G);
  return page;
}

// Start a run in a world and wait until the hero can move.
async function startRun(page, world = 0) {
  await page.evaluate(w => { RR.UI.title(); RR.startRun(w); }, world);
  await page.waitForFunction(() => RR.G.state === 'play' && RR.G.player);
  await page.waitForTimeout(300);
}

const playerPos = page => page.evaluate(() => [RR.G.player.x, RR.G.player.y]);

// Drag a finger from (x, y) by (dx, dy) in CSS pixels, in small steps, and keep it down
// for holdMs before lifting it.
async function drag(page, x, y, dx, dy, holdMs = 300) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 10;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

module.exports = { startServer, openGame, startRun, playerPos, drag, SIZES };
