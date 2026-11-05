'use strict';
// Perk values and how perks are drawn for the choice after a room.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

module.exports = [
  {
    name: 'Headshot, Focus and Steady Aim give what they say',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, p = G.player;
        const withPerks = perks => { p.perks = perks; refreshStats(p); return p.s; };
        const shotDmg = moving => { G.shots.length = 0; p.moving = moving; fireVolley(p, -Math.PI / 2); return G.shots[0].dmg; };
        const out = {};
        out.headshot = withPerks({ headshot: 3 }).headshot;
        const cd = abilityCooldown(p.hero, withPerks({}));
        out.focus = abilityCooldown(p.hero, withPerks({ focus: 2 })) / cd;
        withPerks({ steady: 2 });
        out.steady = shotDmg(false) / shotDmg(true);
        withPerks({});
        out.plain = shotDmg(false) / shotDmg(true);
        return out;
      });
      close(r.headshot, 0.15, 'Headshot at level 3');
      close(r.focus, 0.64, 'Focus at level 2');
      close(r.steady, 1.4, 'Steady Aim at level 2, standing vs moving');
      close(r.plain, 1, 'no Steady Aim');
    },
  },
  {
    name: 'Patch Up is only offered when you are hurt, also when a rarity runs dry',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const p = RR.G.player, all = {};
        for (const k of PERKS) if (k.id !== 'patch') all[k.id] = k.max;
        p.perks = all; refreshStats(p);
        const count = () => { let n = 0; for (let i = 0; i < 200; i++) if (rollPerks(p, 2, 1).some(k => k.id === 'patch')) n++; return n; };
        p.hp = p.s.maxHp;
        const full = count();
        p.hp = p.s.maxHp * 0.5;
        return { full, hurt: count() };
      });
      assert.equal(r.full, 0, 'offered at full HP');
      assert.ok(r.hurt > 0, 'never offered when hurt');
    },
  },
  {
    name: 'every perk can turn up in a normal choice',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const missing = await page.evaluate(() => {
        const p = RR.G.player, seen = new Set();
        p.perks = {}; refreshStats(p); p.hp = p.s.maxHp * 0.5;
        for (let i = 0; i < 6000; i++) for (const k of rollPerks(p, 2)) seen.add(k.id);
        return PERKS.filter(k => !seen.has(k.id)).map(k => k.id);
      });
      assert.deepEqual(missing, []);
    },
  },
  {
    name: 'Steady Aim shows a green ring under a hero standing still',
    size: SIZES.phone,
    async run(page) {
      await startRun(page, 1);   // Ember Caverns: a dark floor, so green stands out
      // green pixels round the hero's feet, with and without the perk
      const greenAtFeet = steady => page.evaluate(lv => new Promise(done => {
        const G = RR.G, p = G.player;
        p.invuln = 9999;
        p.perks = lv ? { steady: lv } : {}; refreshStats(p);
        setTimeout(() => {
          const c = document.getElementById('cv'), k = G.scale * G.dpr;
          const cx = p.x * k, cy = (p.y + 6 - G.camY) * k, R = 26 * k;
          const d = c.getContext('2d').getImageData(cx - R, cy - R, 2 * R, 2 * R).data;
          let n = 0;
          // clearly green: the ring is see-through, so its colour mixes with the floor
          for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 40) n++;
          done({ n, target: !!p.target, moving: p.moving });
        }, 500);
      }), steady);
      const off = await greenAtFeet(0);
      const on = await greenAtFeet(2);
      assert.ok(on.target && !on.moving, 'the hero should be standing still with a target');
      assert.ok(on.n > off.n + 20, `green pixels: ${off.n} without, ${on.n} with Steady Aim`);
    },
  },
  {
    name: 'top perk levels add what their cards say, and recipes still merge at the old level',
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, p = G.player;
        const withPerks = perks => { p.perks = perks; refreshStats(p); return p.s; };
        const shotDmg = moving => { G.shots.length = 0; p.moving = moving; fireVolley(p, -Math.PI / 2); return G.shots[0].dmg; };
        const out = {};
        out.crit = withPerks({ keen: 5 }).critMul - withPerks({ keen: 4 }).critMul;
        out.slow = withPerks({ timewarp: 2 }).bulletSlow;
        withPerks({ rungun: 2 });
        out.rungun = shotDmg(true) / shotDmg(false);
        // every level of every perk has a description, and the badge only shows on levels that add something
        out.badDesc = PERKS.filter(k => k.max < 99).flatMap(k =>
          Array.from({ length: k.max }, (_, i) => perkDesc(k, i + 1)).filter(d => typeof d !== 'string' || !d).map(() => k.id));
        out.badges = PERKS.filter(k => Array.from({ length: k.max }, (_, i) => i + 1).some(L => perkUpgrade(k, L))).length;
        // Holy Shield 4 grows back in the middle of a room
        withPerks({ holy: 4 }); p.invuln = 0; p.shieldUp = true;
        hurtPlayer(10);
        out.broke = !p.shieldUp;
        G.cleared = false; updatePlayer(p, SHIELD_REGROW + 0.1);
        out.back = p.shieldUp;
        // Laser Lance needs Front Shot 3 and Piercing Shot 3, not the new max of 4
        save.recipes.lance = true;
        p.perks = { front: 3, pierce: 3 };
        out.lance = readyEvolutions(p).some(ev => ev.id === 'lance');
        p.perks = { front: 3, pierce: 2 };
        out.noLance = !readyEvolutions(p).some(ev => ev.id === 'lance');
        return out;
      });
      close(r.crit, 0.3, 'Keen Eye 5 adds critical damage');
      close(r.slow, 0.55, 'Time Warp 2');
      close(r.rungun, 1.2, 'Run & Gun 2, moving vs standing');
      assert.deepEqual(r.badDesc, [], 'perk levels without a description');
      assert.ok(r.badges >= 10, `only ${r.badges} perks add a new effect at the top`);
      assert.ok(r.broke && r.back, 'Holy Shield 4 should break and grow back');
      assert.ok(r.lance && r.noLance, 'Laser Lance recipe level');
    },
  },
];
