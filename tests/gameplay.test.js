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
    name: "Brick's bombs curve after fast enemies but never turn sharply in the air",
    size: SIZES.phone,
    async run(page) {
      await page.evaluate(() => { RR.save().hero = 'sapper'; if (!RR.save().heroes.includes('sapper')) RR.save().heroes.push('sapper'); });
      await startRun(page, 3);   // Skyward Ruins: harpies dive about fast
      const r = await page.evaluate(() => new Promise(done => {
        const G = RR.G, p = G.player, last = new Map();
        p.perks = { multishot: 2, front: 2 }; refreshStats(p);
        // a room full of harpies, which dive at the hero fast
        const harpies = () => { for (let i = 0; i < 4; i++) { const e = spawnEnemy('harpy', ROOM_X + 40 + i * 80, ROOM_Y + 120); e.spawnT = 0; } };
        harpies();
        let bombs = 0, worst = 0, n = 0;
        const iv = setInterval(() => {
          p.invuln = 99999;
          if (G.state === 'perk') RR.choosePerk(0);
          if (G.enemies.filter(e => !e.dead).length < 3) harpies();
          for (const b of G.shots) if (b.lob) {
            const prev = last.get(b);
            if (!prev) bombs++;
            const moved = prev ? Math.hypot(b.x - prev.x, b.y - prev.y) : 0;
            const dir = prev && moved > 0.5 ? Math.atan2(b.y - prev.y, b.x - prev.x) : prev && prev.dir;
            if (prev && prev.dir != null && moved > 0.5) worst = Math.max(worst, Math.abs(angleDiff(prev.dir, dir)));
            last.set(b, { x: b.x, y: b.y, dir });
          }
          if (++n > 600) { clearInterval(iv); done({ bombs, worst }); }
        }, 16);
      }));
      assert.ok(r.bombs > 10, `only ${r.bombs} bombs thrown`);
      assert.ok(r.worst < 0.35, `a bomb turned ${r.worst.toFixed(2)} rad in one frame`);
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
