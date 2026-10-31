'use strict';
// A few pieces of play: clearing a room, a boss beam, enemies that walk about.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

module.exports = [
  {
    name: 'clearing a room offers perks, and picking one carries on',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      // kill everything and walk to the open door until the perk choice shows up
      await page.waitForFunction(() => {
        const G = RR.G;
        G.player.invuln = 9999;
        for (const e of [...G.enemies]) RR.killEnemy(e);
        if (G.doorOpen) { G.player.x = 180; G.player.y = 70; }
        return G.state === 'perk';
      }, null, { polling: 200, timeout: 15000 });
      assert.equal(await page.locator('.card').count() >= 2, true);
      await page.evaluate(() => RR.choosePerk(0));
      await page.waitForFunction(() => RR.G.state === 'play', null, { timeout: 10000 });
    },
  },
  {
    name: "the Lich's laser hurts the hero",
    size: SIZES.phone,
    async run(page) {
      await startRun(page, 2);
      await page.keyboard.press('KeyB');   // dev key: jump to the boss
      await page.waitForFunction(() => RR.G.enemies.some(e => e.boss && e.spawnT <= 0), null, { timeout: 10000 });
      const hurt = await page.evaluate(() => new Promise(done => {
        const G = RR.G, boss = G.enemies.find(e => e.boss), p = G.player;
        p.s.dodge = 0; p.hp = p.s.maxHp = 1e9;
        boss.state = 'move'; boss.move = 'laser'; boss.m = { t: 0 };
        let n = 0;
        const iv = setInterval(() => {
          p.invuln = 0; p.x = boss.x + 50; p.y = boss.y + 20;
          boss.state = 'move'; boss.move = 'laser';
          if (p.hp < 1e9 || ++n > 160) { clearInterval(iv); done(p.hp < 1e9); }
        }, 25);
      }));
      assert.ok(hurt, 'the laser never hit');
    },
  },
  {
    name: 'Storm Shaman and Ice Mage walk about',
    size: SIZES.phone,
    async run(page) {
      await startRun(page, 3);
      const moved = await page.evaluate(() => new Promise(done => {
        RR.G.player.invuln = 9999;
        const es = ['stormShaman', 'iceMage'].map(t => spawnEnemy(t, ROOM_X + ROOM_W / 2, ROOM_Y + 200));
        es.forEach(e => { e.spawnT = 0; });
        const start = es.map(e => [e.x, e.y]);
        setTimeout(() => done(es.map((e, i) => Math.hypot(e.x - start[i][0], e.y - start[i][1]))), 2500);
      }));
      for (const d of moved) assert.ok(d > 20, `moved only ${d | 0} px`);
    },
  },
];
