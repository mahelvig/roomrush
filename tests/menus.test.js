'use strict';
// Menus: every screen from the title screen opens and fits the game's width.
const assert = require('assert/strict');
const { SIZES } = require('./helpers');

const SCREENS = ['worlds', 'heroes', 'upgrades', 'quests', 'relics'];

const menuTest = (label, size) => ({
  name: `all menus open and fit (${label})`,
  size,
  async run(page) {
    for (const screen of SCREENS) {
      await page.evaluate(() => RR.UI.title());
      await page.click(`[data-a="${screen}"]`);
      await page.waitForTimeout(150);
      const outside = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        return [...document.querySelectorAll('#ui button, #ui .card, #ui .panel')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < app.left - 1 || r.right > app.right + 1); })
          .map(e => e.textContent.trim().slice(0, 30));
      });
      assert.deepEqual(outside, [], `${screen}: elements outside the screen`);
    }
  },
});

module.exports = [
  menuTest('phone', SIZES.phone),
  menuTest('small phone', SIZES.phoneSafari),
  menuTest('iPad portrait', SIZES.ipadPortrait),
  menuTest('iPad landscape', SIZES.ipadLandscape),
];
