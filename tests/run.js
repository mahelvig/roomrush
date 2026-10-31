'use strict';
// Runs the browser tests in tests/*.test.js against the game in headless Chromium.
//
//   npm test                 run everything
//   npm test -- touch        only tests whose file or name contains "touch"
//
// A test file exports a list of { name, size, run(page, ctx) }. Each test gets a fresh page
// with the game loaded at its screen size; it fails if run() throws or the page has errors.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startServer, openGame } = require('./helpers');

const filter = (process.argv[2] || '').toLowerCase();

(async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  const tests = [];
  for (const f of files) {
    for (const t of require(path.join(__dirname, f))) {
      const label = `${f.replace('.test.js', '')} › ${t.name}`;
      if (!filter || label.toLowerCase().includes(filter)) tests.push({ ...t, label });
    }
  }
  if (!tests.length) { console.log(`No tests match "${filter}".`); process.exit(1); }

  const server = await startServer();
  const browser = await chromium.launch();
  let failed = 0;
  const t0 = Date.now();
  for (const t of tests) {
    const start = Date.now();
    let page;
    try {
      page = await openGame(browser, server.url, t.size, t.options);
      await t.run(page, { base: server.url, browser });
      if (page.errors.length) throw new Error(`page errors: ${page.errors.join(' | ')}`);
      console.log(`  ✓ ${t.label} (${Date.now() - start} ms)`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${t.label}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
    } finally {
      if (page) await page.context().close();
    }
  }
  await browser.close();
  server.close();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${tests.length - failed} passed, ${failed} failed (${secs} s)`);
  process.exit(failed ? 1 : 0);
})();
