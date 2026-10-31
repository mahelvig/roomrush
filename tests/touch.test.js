'use strict';
// Touch controls: drag anywhere to move, also on the empty sides of a wide screen.
const assert = require('assert/strict');
const { SIZES, startRun, playerPos, drag } = require('./helpers');

// Drag up and to the right from (x, y) and check that the hero went that way.
async function dragMoves(page, x, y) {
  await page.evaluate(() => { RR.G.player.invuln = 9999; });
  const [x0, y0] = await playerPos(page);
  await drag(page, x, y, 80, -80);
  const [x1, y1] = await playerPos(page);
  assert.ok(x1 > x0 + 5 && y1 < y0 - 5, `hero went from (${x0 | 0}, ${y0 | 0}) to (${x1 | 0}, ${y1 | 0})`);
}

const dragTest = (label, size, world = 0) => ({
  name: `dragging moves the hero (${label})`,
  size,
  async run(page) {
    await startRun(page, world);
    await dragMoves(page, size[0] / 2, size[1] * 0.7);
  },
});

module.exports = [
  dragTest('phone', SIZES.phone),
  dragTest('iPad portrait', SIZES.ipadPortrait),
  dragTest('iPad landscape', SIZES.ipadLandscape),
  dragTest('Iron Citadel, iPad portrait', SIZES.ipadPortrait, 4),
  {
    name: 'a drag on the dark side of a landscape iPad also steers',
    size: SIZES.ipadLandscape,
    async run(page) {
      await startRun(page);
      const left = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().left);
      assert.ok(left > 100, 'expected empty space at the sides');
      await dragMoves(page, left / 2, SIZES.ipadLandscape[1] * 0.6);
    },
  },
  {
    name: 'the pause button still pauses and does not start the joystick',
    size: SIZES.ipadLandscape,
    async run(page) {
      await startRun(page);
      await page.tap('.pause-btn');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => RR.G.state), 'pause');
      assert.equal(await page.evaluate(() => Input.stick.active), false);
    },
  },
];
