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
            // (a bomb thrown at something right next to the hero hardly moves sideways: its direction
            // can't be seen, so only bombs really flying count)
            const dir = prev && moved > 2 ? Math.atan2(b.y - prev.y, b.x - prev.x) : prev && prev.dir;
            if (prev && prev.dir != null && moved > 2) worst = Math.max(worst, Math.abs(angleDiff(prev.dir, dir)));
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
  {
    name: 'drops follow how hard a world and tier really are, so the easy world is no farm',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, at = (id, tier) => {
          G.world = WORLDS.find(w => w.id === id); G.tier = tier;
          return { level: lootLevel(), boss: relicChance('boss'), elite: relicChance('elite') };
        };
        return { woodsHell: at('woods', 3), cryptHard: at('crypt', 1), citadelHard: at('citadel', 1),
          woodsHard: at('woods', 1), cryptNormal: at('crypt', 0) };
      });
      const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: ${a} vs ${b}`);
      near(r.woodsHell.level, r.cryptHard.level, 'Woods on Hell is as hard as Crypt on Hard');
      near(r.woodsHell.elite, r.cryptHard.elite, 'so their elites drop relics as often');
      assert.ok(r.citadelHard.boss > r.woodsHell.boss, 'Iron Citadel on Hard should beat Woods on Hell');
      assert.ok(r.citadelHard.elite > r.woodsHard.elite, 'a harder world on the same tier drops more');
      assert.equal(r.cryptNormal.boss, 0, 'still no relics on Normal');
    },
  },
  {
    name: "with lots of bombs and Overdrive, every bomb lands and goes off",
    size: SIZES.phone,
    async run(page) {
      await page.evaluate(() => { RR.save().hero = 'sapper'; if (!RR.save().heroes.includes('sapper')) RR.save().heroes.push('sapper'); });
      await startRun(page, 0);
      const r = await page.evaluate(() => {
        const G = RR.G, p = G.player;
        p.invuln = 99999;
        p.perks = { multishot: 4, front: 4, diag: 4, side: 3, rear: 3, bouncy: 3, ricochet: 3 }; refreshStats(p);
        const wall = () => { for (let i = 0; i < 4; i++) { const e = spawnEnemy('stumpy', ROOM_X + 50 + i * 70, ROOM_Y + 100); e.spawnT = 0; e.hp = e.maxHp = 1e9; } };
        wall();
        // every bomb thrown, and whether it went off
        const thrown = new Set(), blew = new Set(), orig = bombBlast;
        window.bombBlast = b => { blew.add(b); return orig(b); };
        let most = 0, mostBombs = 0;
        for (let i = 0; i < 6 * 60; i++) {
          p.overdriveT = 5;
          if (G.state !== 'play') G.state = 'play';
          updateGame(1 / 60);
          for (const b of G.shots) if (b.lob) thrown.add(b);
          most = Math.max(most, G.shots.length);
          mostBombs = Math.max(mostBombs, G.shots.filter(b => b.lob).length);
        }
        window.bombBlast = orig;
        const vanished = [...thrown].filter(b => !blew.has(b) && !G.shots.includes(b)).length;
        return { thrown: thrown.size, vanished, most, mostBombs, cap: MAX_BOMBS };
      });
      assert.ok(r.most >= 100, `only ${r.most} shots at once: not enough to test the cap`);
      assert.equal(r.vanished, 0, `${r.vanished} of ${r.thrown} bombs vanished in the air`);
      // (a volley thrown after the trim can go a little over, until the next frame)
      assert.ok(r.mostBombs <= r.cap + 40, `${r.mostBombs} bombs in the air at once`);
    },
  },
  {
    name: 'every hero fires real shots with every shot perk at its highest level',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const bad = await page.evaluate(() => {
        const G = RR.G, p = G.player, out = [];
        const hero0 = p.hero;
        for (const hero of HEROES) {
          p.hero = hero;
          p.perks = { front: 4, diag: 4, side: 3, rear: 3 }; refreshStats(p);
          G.shots.length = 0;
          fireVolley(p, -Math.PI / 2);
          for (const b of G.shots) {
            const vals = [b.x, b.y, b.vx, b.vy].concat(b.lob ? [b.lob.x1, b.lob.y1] : []);
            if (!vals.every(Number.isFinite)) { out.push(hero.id); break; }
          }
          // no two shots fly the same way
          const dirs = G.shots.map(b => b.lob ? Math.atan2(b.lob.y1 - b.lob.y0, b.lob.x1 - b.lob.x0) : Math.atan2(b.vy, b.vx)).map(a => a.toFixed(3));
          if (!hero.drone && hero.shot !== 'bomb' && new Set(dirs).size < dirs.length - 4) out.push(`${hero.id}: shots on top of each other`);
        }
        p.hero = hero0; G.shots.length = 0;
        return out;
      });
      assert.deepEqual(bad, []);
    },
  },
];
