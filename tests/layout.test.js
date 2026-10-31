'use strict';
// Screen layout: how wide the game is on phones and tablets, in portrait and landscape.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

const layout = page => page.evaluate(() => {
  const r = document.getElementById('app').getBoundingClientRect();
  return { left: r.left, width: r.width, scale: RR.G.scale, viewH: RR.G.viewH, rotate: document.body.classList.contains('rotate') };
});

const portraitFullWidth = size => ({
  name: `portrait ${size[0]}x${size[1]} uses the full width`,
  size,
  async run(page) {
    const l = await layout(page);
    assert.equal(l.width, size[0]);
    assert.equal(l.left, 0);
    assert.ok(Math.abs(l.scale - size[0] / 360) < 1e-6, `scale ${l.scale}`);
  },
});

const tabletColumn = size => ({
  name: `landscape tablet ${size[0]}x${size[1]} is a centred column that fits a whole room`,
  size,
  async run(page) {
    const l = await layout(page);
    assert.equal(l.width, Math.round((size[1] * 360) / 700));
    assert.equal(Math.round(l.left), Math.round((size[0] - l.width) / 2));
    assert.ok(Math.abs(l.viewH - 700) < 2, `viewH ${l.viewH}`);
    assert.equal(l.rotate, false);
  },
});

module.exports = [
  portraitFullWidth(SIZES.phone),
  portraitFullWidth(SIZES.phoneSafari),
  portraitFullWidth(SIZES.ipadPortrait),
  portraitFullWidth(SIZES.ipadMini),
  portraitFullWidth(SIZES.ipadProPortrait),
  tabletColumn(SIZES.ipadLandscape),
  tabletColumn(SIZES.ipadProLandscape),
  {
    name: 'a phone on its side asks to be turned upright',
    size: SIZES.phoneLandscape,
    async run(page) {
      assert.equal((await layout(page)).rotate, true);
      assert.ok(await page.isVisible('#rotate'));
    },
  },
  {
    name: 'turning an iPad mid-run rescales and keeps playing',
    size: SIZES.ipadPortrait,
    async run(page) {
      await startRun(page);
      await page.setViewportSize({ width: SIZES.ipadLandscape[0], height: SIZES.ipadLandscape[1] });
      await page.waitForTimeout(400);
      const l = await layout(page);
      assert.equal(l.width, Math.round((820 * 360) / 700));
      assert.equal(await page.evaluate(() => RR.G.state), 'play');
    },
  },
  {
    name: 'tablets get a bigger joystick, phones keep 54 px',
    size: SIZES.ipadPortrait,
    async run(page) {
      assert.ok(await page.evaluate(() => Input.R) > 54);
      await page.setViewportSize({ width: SIZES.phone[0], height: SIZES.phone[1] });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => Input.R), 54);
    },
  },
];
