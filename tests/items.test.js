'use strict';
// Relics as loot: random affixes, the bag, wearing, salvaging and old saves.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);
const freshBag = () => { save.items = []; save.relics = {}; save.worn = []; save.dust = 0; save.shards = 0; };

module.exports = [
  {
    name: 'every relic rolls its own affixes, more and stronger in harder places',
    size: SIZES.phone,
    async run(page) {
      const r = await page.evaluate(() => {
        const out = { bad: [], counts: {}, avg: {} };
        for (const ilvl of [0, 6]) {
          let sum = 0, n = 0;
          for (let i = 0; i < 400; i++) {
            const base = RELICS[i % RELICS.length], it = makeItem(base.id, ilvl);
            const ids = it.aff.map(a => a[0]);
            if (new Set(ids).size !== ids.length) out.bad.push('twice the same affix');
            for (const [id, v] of it.aff) {
              if (!(v > 0 && v <= affixMax(id, ilvl) + 1e-9)) out.bad.push(`${id} ${v} at ${ilvl}`);
              sum += v / AFFIXES_RELIC[id].max; n++;
            }
            if (ilvl === 0) (out.counts[base.rarity] = out.counts[base.rarity] || new Set()).add(it.aff.length);
          }
          out.avg[ilvl] = sum / n;
        }
        for (const k in out.counts) out.counts[k] = [...out.counts[k]].sort();
        return out;
      });
      assert.deepEqual(r.bad, []);
      assert.deepEqual(r.counts, { common: [1], rare: [2], epic: [2], legendary: [3] });
      assert.ok(r.avg[6] > r.avg[0] * 1.5, `affixes at item level 6 (${r.avg[6]}) vs 0 (${r.avg[0]})`);
    },
  },
  {
    name: 'worn relics add their affixes to the hero, one of each kind',
    size: SIZES.phone,
    async run(page) {
      await page.evaluate(freshBag);
      const r = await page.evaluate(() => {
        const a = addItem({ id: 'stillwater', L: 1, ilvl: 0, aff: [['atk', 0.07], ['gold', 0.1]] });
        const b = addItem({ id: 'stillwater', L: 1, ilvl: 0, aff: [['hp', 0.1]] });
        const c = addItem({ id: 'thornring', L: 1, ilvl: 0, aff: [['crit', 0.04]] });
        const d = addItem({ id: 'ricostone', L: 1, ilvl: 0, aff: [['speed', 0.05]] });
        toggleRelic(a.uid); toggleRelic(c.uid);
        const hero = HEROES[0], plain = computeStats({ hero, perks: {}, relics: [] });
        const worn = computeStats({ hero, perks: {}, relics: wornRelics() });
        const out = { atk: worn.atkPct - plain.atkPct, gold: worn.gold - plain.gold, crit: worn.crit - plain.crit };
        toggleRelic(b.uid);   // a second Still Water swaps for the first
        out.swap = save.worn.slice(); out.ids = { a: a.uid, b: b.uid, c: c.uid, d: d.uid };
        toggleRelic(d.uid);   // slots full: the oldest comes off
        out.full = save.worn.slice();
        return out;
      });
      close(r.atk, 0.07, 'attack affix'); close(r.gold, 0.1, 'gold affix'); close(r.crit, 0.04, 'crit affix');
      assert.deepEqual(r.swap, [r.ids.b, r.ids.c], 'the second Still Water takes the first one\'s place');
      assert.deepEqual(r.full, [r.ids.c, r.ids.d], 'two slots: the oldest comes off');
    },
  },
  {
    name: 'salvaging gives dust back, never takes a worn relic, and a full bag salvages new finds',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      await page.evaluate(freshBag);
      const r = await page.evaluate(() => {
        const keep = addItem(makeItem('thornring', 1)), up = addItem(makeItem('thornring', 1, 3));
        for (let i = 0; i < 3; i++) addItem(makeItem('stillwater', 1));
        addItem(makeItem('luckycoin', 1));
        toggleRelic(keep.uid);
        const out = {};
        out.worn = salvageItem(keep.uid);
        out.up = salvageItem(up.uid);
        out.all = salvageAll('common');
        out.left = save.items.map(it => it.id).sort();
        out.dust = save.dust;
        // fill the bag, then pick up one more
        while (save.items.length < BAG_SIZE) addItem(makeItem('stillwater', 1));
        const before = save.items.length;
        G.run.dust = 0;
        out.msg = collectRelicItem(makeItem('glassheart', 1));
        out.bag = save.items.length - before;
        out.runDust = G.run.dust;
        return out;
      });
      assert.equal(r.worn, null, 'a worn relic is not salvaged');
      assert.deepEqual(r.up, { dust: Math.round(25 * 0.4 + 25 * 3 * 2 / 4), shards: 1 }, 'a level 3 relic gives back part of its levels');
      assert.equal(r.all.n, 3, 'salvage all takes the three level 1 Still Waters');
      assert.deepEqual(r.left, ['luckycoin', 'thornring'], 'the rare and the worn one are left');
      assert.equal(r.dust, r.up.dust + r.all.dust);
      assert.equal(r.bag, 0, 'a full bag takes nothing more');
      assert.ok(r.runDust > 0 && /Bag full/.test(r.msg), r.msg);
    },
  },
  {
    name: 'an old save keeps its relics, levels and what was worn',
    size: SIZES.phone,
    async run(page) {
      const r = await page.evaluate(() => {
        Object.assign(save, { items: [], nextUid: 0, itemsVersion: 0, relics: { thornring: 3, luckycoin: 1, gone: 2 }, worn: ['luckycoin'], tiers: { woods: 1 } });
        migrateRelics();
        const again = save.items.length;
        migrateRelics();   // only once
        return {
          items: save.items.map(it => [it.id, it.L, it.aff.length]).sort(),
          worn: save.worn.map(u => itemByUid(u).id), codex: save.relics, again, after: save.items.length,
        };
      });
      assert.deepEqual(r.items.map(x => x.slice(0, 2)), [['luckycoin', 1], ['thornring', 3]]);
      assert.ok(r.items.every(x => x[2] >= 1), 'migrated relics get affixes');
      assert.deepEqual(r.worn, ['luckycoin']);
      assert.deepEqual(r.codex, { thornring: true, luckycoin: true, gone: 2 });
      assert.equal(r.again, r.after);
    },
  },
  {
    name: 'the bag screen shows affixes, salvages after a second tap and fits the screen',
    size: SIZES.phoneSafari,
    async run(page) {
      const uid = await page.evaluate(() => {
        save.items = []; save.relics = {}; save.worn = []; save.dust = 0; save.shards = 0;
        const worn = addItem({ id: 'thornring', L: 1, ilvl: 0, aff: [['atk', 0.05]] });
        const better = addItem({ id: 'thornring', L: 1, ilvl: 4, aff: [['atk', 0.1], ['gold', 0.15], ['crit', 0.06]] });
        addItem(makeItem('glassheart', 3, 2));
        toggleRelic(worn.uid);
        RR.UI.relics('relics');
        return better.uid;
      });
      const text = await page.$eval('#ui', e => e.textContent);
      assert.ok(text.includes('+10% attack') && text.includes('Better affixes'), 'affixes and the hint should show');
      const btn = `[data-a="salvage"][data-id="${uid}"]`;
      await page.click(btn);
      assert.equal(await page.evaluate(n => !!itemByUid(n), uid), true, 'the first tap only asks');
      assert.ok((await page.$eval(btn, b => b.textContent)).includes('Sure?'));
      await page.click(btn);
      assert.equal(await page.evaluate(n => !!itemByUid(n), uid), false, 'the second tap salvages');
      const outside = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        return [...document.querySelectorAll('#ui button, #ui .panel')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < app.left - 1 || r.right > app.right + 1); }).length;
      });
      assert.equal(outside, 0, 'elements outside the screen');
    },
  },
];
