'use strict';
// Loot: materials from monsters, upgrading relics with them, the Hoarder and the loot list.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

// Pick up everything on the floor (by putting it under the hero) and run a frame of pickups.
const COLLECT = `(() => { const G = RR.G, p = G.player; for (const k of G.pickups) { k.x = p.x; k.y = p.y; k.t = 1; } updatePickups(0.016, p); })()`;

module.exports = [
  {
    name: 'monsters drop materials, more in harder worlds, and they are kept after the run',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(COLLECT => {
        const G = RR.G, p = G.player;
        p.invuln = 99999;
        // many kills of a plain enemy and an elite, in Woods and in Iron Citadel, on Normal
        const farm = (id, type, n) => {
          G.world = WORLDS.find(w => w.id === id); G.tier = 0;
          G.run.dust = G.run.shard = 0;
          for (let i = 0; i < n; i++) {
            const e = spawnEnemy(type, p.x + 60, p.y - 60, { spawnT: 0 });
            killEnemy(e);
            eval(COLLECT);
          }
          G.enemies.length = 0;
          return { dust: G.run.dust, shard: G.run.shard };
        };
        const out = {
          woods: farm('woods', 'slime', 300), citadel: farm('citadel', 'slime', 300),
          woodsElite: farm('woods', 'goblinChief', 60), citadelElite: farm('citadel', 'goblinChief', 60),
        };
        const before = { dust: save.dust, shards: save.shards };
        const sum = endRun(false);
        out.kept = { dust: save.dust - before.dust, shards: save.shards - before.shards, sum: { dust: sum.dust, shards: sum.shards } };
        return out;
      }, COLLECT);
      assert.ok(r.woods.dust > 30, `only ${r.woods.dust} dust from 300 slimes`);
      assert.equal(r.woods.shard, 0, 'plain monsters drop no shards');
      assert.ok(r.citadel.dust > r.woods.dust * 1.3, `Citadel ${r.citadel.dust} vs Woods ${r.woods.dust} dust`);
      assert.ok(r.woodsElite.shard > 3, `only ${r.woodsElite.shard} shards from 60 elites`);
      assert.ok(r.citadelElite.shard > r.woodsElite.shard, 'harder world, more shards');
      assert.equal(r.kept.dust, r.citadelElite.dust, 'dust from the run goes into the save');
      assert.equal(r.kept.shards, r.citadelElite.shard, 'shards from the run go into the save');
      assert.deepEqual(r.kept.sum, { dust: r.kept.dust, shards: r.kept.shards });
    },
  },
  {
    name: 'Relic Dust and Star Shards level up a relic in the relic screen',
    size: SIZES.phone,
    async run(page) {
      const ids = await page.evaluate(() => {
        save.items = []; save.relics = {}; save.worn = [];
        const ring = addItem(makeItem('thornring', 2, 2)), totem = addItem(makeItem('stormtotem', 2, 5));
        save.worn = [ring.uid];
        save.dust = 0; save.shards = 0; RR.UI.relics('relics');
        return { ring: ring.uid, totem: totem.uid };
      });
      const btn = `[data-a="upgradeRelic"][data-id="${ids.ring}"]`;
      assert.ok(await page.$eval(btn, b => b.disabled), 'should be disabled without materials');
      assert.equal(await page.$(`[data-a="upgradeRelic"][data-id="${ids.totem}"]`), null, 'a maxed relic has no upgrade');
      const cost = await page.evaluate(uid => relicUpgradeCost(itemByUid(uid)), ids.ring);
      assert.deepEqual(cost, { dust: 50, shards: 1 });
      await page.evaluate(() => { save.dust = 60; save.shards = 2; RR.UI.relics('relics'); });
      await page.click(btn);
      const after = await page.evaluate(uid => ({ L: itemByUid(uid).L, dust: save.dust, shards: save.shards }), ids.ring);
      assert.deepEqual(after, { L: 3, dust: 10, shards: 1 });
      // fits the screen with the extra button
      const outside = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        return [...document.querySelectorAll('#ui button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > app.right + 1; }).length;
      });
      assert.equal(outside, 0, 'buttons outside the screen');
    },
  },
  {
    name: 'the Hoarder runs away and escapes with nothing, or bursts with loot when caught',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => new Promise(done => {
        const G = RR.G, p = G.player;
        p.invuln = 99999;
        for (const e of G.enemies) e.dead = true;
        G.enemies.length = 0;
        G.state = 'paused-for-test';   // we step the Hoarder ourselves
        const h = spawnHoarder(p);
        h.spawnT = 0;
        const start = dist(h.x, h.y, p.x, p.y);
        // how far it stays in the last of the 3 seconds, on average: in a room full of rocks it can be
        // cornered for a moment, but one that stood still would be caught by then
        let late = 0;
        // the hero walks at it for 3 seconds
        for (let i = 0; i < 180; i++) {
          const a = angleTo(p.x, p.y, h.x, h.y);
          moveEntity(p, Math.cos(a) * p.s.speed / 60, Math.sin(a) * p.s.speed / 60, true);
          updateEnemy(h, 1 / 60, p);
          if (i >= 120) late += dist(h.x, h.y, p.x, p.y) / 60;
        }
        const harmless = h.def.harmless && h.dmg === 0;
        // left alone it gets away, with no loot
        G.pickups.length = 0;
        for (let i = 0; i < HOARDER_TIME * 60 && !h.dead; i++) updateEnemy(h, 1 / 60, p);
        const escaped = h.dead, escapedLoot = G.pickups.filter(k => k.kind !== 'coin').length;
        // a second one, caught
        const h2 = spawnHoarder(p);
        h2.spawnT = 0;
        G.pickups.length = 0;
        killEnemy(h2);
        const kinds = {};
        for (const k of G.pickups) kinds[k.kind] = (kinds[k.kind] || 0) + k.value;
        G.state = 'play';
        done({ start, late, harmless, escaped, escapedLoot, kinds });
      }));
      assert.ok(r.harmless, 'the Hoarder should not hurt');
      assert.ok(r.late > 60, `the hero got within ${r.late | 0} px of a fleeing Hoarder (started at ${r.start | 0})`);
      assert.ok(r.escaped && r.escapedLoot === 0, 'it should get away with no loot');
      assert.ok(r.kinds.coin > 20 && r.kinds.gem >= 2 && r.kinds.dust >= 12 && r.kinds.shard >= 1, `caught: ${JSON.stringify(r.kinds)}`);
    },
  },
  {
    name: 'a Hoarder turns up in some normal rooms, never in elite or boss rooms',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, count = type => {
          G.roomType = type; G.roomIdx = 3; let n = 0;
          for (let i = 0; i < 2000; i++) { planHoarder(); if (G.hoarderT) n++; }
          G.hoarderT = 0;
          return n / 2000;
        };
        return { normal: count('normal'), elite: count('elite'), boss: count('boss') };
      });
      assert.ok(r.normal > 0.05 && r.normal < 0.12, `normal rooms: ${r.normal}`);
      assert.equal(r.elite + r.boss, 0);
    },
  },
  {
    name: 'rare loot falls with a beam and a name, and the run ends with a list of it',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(COLLECT => {
        const G = RR.G, p = G.player;
        p.invuln = 99999;
        dropPickup('relic', p.x + 80, p.y - 80, makeItem('glassheart', 1));
        dropPickup('shard', p.x + 80, p.y - 80, 2);
        const labels = G.pickups.map(lootLabel).filter(Boolean);
        const rarities = G.pickups.map(lootRarity);
        eval(COLLECT);
        G.run.dust = 7;
        const sum = endRun(false);
        RR.UI.gameOver(sum);
        return { labels, rarities, loot: sum.loot, chips: [...document.querySelectorAll('.loot-chip')].map(c => c.textContent.trim()) };
      }, COLLECT);
      assert.deepEqual(r.labels, ['Glass Heart', '2 Star Shards']);
      assert.deepEqual(r.rarities, ['epic', 'legendary']);
      assert.deepEqual(r.loot.map(l => l.id), ['glassheart']);
      assert.ok(r.chips.some(c => c.includes('Glass Heart')), `chips: ${r.chips}`);
      assert.ok(r.chips.some(c => c.includes('Relic Dust')) && r.chips.some(c => c.includes('Star Shards')), `chips: ${r.chips}`);
    },
  },
];
