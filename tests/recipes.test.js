'use strict';
// Evolution recipes: what each new one does, and where the game shows what a recipe needs.
const assert = require('assert/strict');
const { SIZES, startRun } = require('./helpers');

module.exports = [
  {
    name: 'every recipe has two real perks it can reach, an icon, and merges at the right level',
    size: SIZES.phone,
    async run(page) {
      const r = await page.evaluate(() => EVOLUTIONS.flatMap(ev => {
        const bad = [];
        if (!ICONS[ev.icon]) bad.push(`${ev.id}: no icon`);
        for (const id of ev.from) {
          const k = PERK_BY_ID[id];
          if (!k || k.evo) bad.push(`${ev.id}: ${id} is not a perk`);
          else if (evoLevel(k) > k.max) bad.push(`${ev.id}: ${id} needs ${evoLevel(k)} of ${k.max}`);
        }
        save.recipes[ev.id] = true;
        const p = { perks: Object.fromEntries(ev.from.map(id => [id, evoLevel(PERK_BY_ID[id])])) };
        if (!readyEvolutions(p).includes(ev)) bad.push(`${ev.id}: not ready at the levels it asks for`);
        p.perks[ev.from[0]]--;
        if (readyEvolutions(p).includes(ev)) bad.push(`${ev.id}: ready one level too early`);
        return bad;
      }));
      assert.deepEqual(r, []);
      assert.ok(await page.evaluate(() => EVOLUTIONS.length) >= 10);
    },
  },
  {
    name: "Assassin's Mark, Wildfire, Blood Frenzy, Cataclysm, Guardian Angel and Pinball do what they say",
    size: SIZES.phone,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, p = G.player, out = {};
        p.invuln = 99999;
        const withPerks = perks => { p.perks = perks; refreshStats(p); };
        const foe = () => { const e = spawnEnemy('stumpy', p.x, p.y - 150, { spawnT: 0 }); return e; };
        // Assassin: a crit on a low enemy finishes it
        withPerks({ assassin: 1 }); p.s.crit = 1; p.s.critMul = 1;
        let e = foe(); e.hp = e.maxHp * 0.4;
        shotHits({ dmg: e.maxHp * 0.1, main: false, vx: 0, vy: -1, x: e.x, y: e.y, hit: [] }, e);
        out.assassin = e.dead;
        withPerks({}); p.s.crit = 1; p.s.critMul = 1;
        e = foe(); e.hp = e.maxHp * 0.4;
        shotHits({ dmg: e.maxHp * 0.1, main: false, vx: 0, vy: -1, x: e.x, y: e.y, hit: [] }, e);
        out.plainCrit = e.dead;
        // Wildfire: burning and poisoned, the burn ticks twice as hard
        const tick = perks => {
          withPerks(perks);
          const f = foe(); f.hp = f.maxHp = 1e6;
          Object.assign(f.status, { burn: 2, burnDps: 100, burnTick: 0, poison: 2, poisonDps: 0, poisonTick: 9 });
          updateEnemy(f, 0.01, p);
          return 1e6 - f.hp;
        };
        out.wildfire = tick({ wildfire: 1 }) / tick({});
        // Blood Frenzy: kills stack damage up to +60%
        withPerks({ frenzy: 1 }); p.frenzy = 0;
        const atk0 = playerAtk(p);
        for (let i = 0; i < 30; i++) killEnemy(foe());
        out.frenzy = playerAtk(p) / atk0;
        // Cataclysm: the sky attacks come twice as often
        G.cleared = false;
        const sky = perks => { withPerks(perks); p.meteorT = 0; p.stormT = 0; updateSkyAttacks(p, 0.001); return [p.meteorT, p.stormT]; };
        const [m0, s0] = sky({ meteor: 3, storm: 3 }), [m1, s1] = sky({ meteor: 3, storm: 3, cataclysm: 1 });
        out.cataclysm = [m1 / m0, s1 / s0];
        // Guardian Angel: the shield heals when it breaks and is back 5 s later
        withPerks({ holy: 3, angel: 1 }); p.invuln = 0; p.shieldUp = true; p.hp = p.s.maxHp * 0.5;
        const hp0 = p.hp;
        hurtPlayer(10);
        out.angelHeal = (p.hp - hp0) / p.s.maxHp;
        updatePlayer(p, 4); out.angelAt4 = p.shieldUp;
        updatePlayer(p, 1.1); out.angelAt5 = p.shieldUp;
        p.invuln = 99999;
        // Pinball: a bounce off a wall makes the shot stronger
        withPerks({ pinball: 1 });
        G.shots.length = 0;
        G.shots.push({ x: ROOM_X + 8, y: p.y - 100, vx: -600, vy: 0, r: 3, dmg: 100, kind: 'arrow', pierce: 0, bounce: 1, ric: 0, hit: [], life: 2 });
        updateShots(0.02);
        out.pinball = G.shots[0] ? G.shots[0].dmg : null;
        for (const x of G.enemies) x.dead = true;
        return out;
      });
      assert.ok(r.assassin && !r.plainCrit, `Assassin's Mark finishes a low enemy (${r.assassin}), a plain crit does not (${r.plainCrit})`);
      assert.ok(Math.abs(r.wildfire - 2) < 0.01, `Wildfire burn: ×${r.wildfire}`);
      assert.ok(Math.abs(r.frenzy - 1.6) < 0.01, `Blood Frenzy after 30 kills: ×${r.frenzy}`);
      assert.deepEqual(r.cataclysm.map(x => +x.toFixed(2)), [0.5, 0.5]);
      assert.ok(Math.abs(r.angelHeal - 0.1) < 0.01, `Guardian Angel heals ${r.angelHeal}`);
      assert.ok(!r.angelAt4 && r.angelAt5, 'the shield is back after 5 s, not before');
      assert.equal(r.pinball, 125);
    },
  },
  {
    name: 'perk cards name the recipe they belong to, and the pause menu shows how far you are',
    size: SIZES.phoneSafari,
    async run(page) {
      await startRun(page);
      const r = await page.evaluate(() => {
        const G = RR.G, p = G.player;
        save.recipes = { lance: true, wildfire: true };
        p.perks = { front: 2, venom: 3 }; refreshStats(p);
        RR.UI.perks([PERK_BY_ID.pierce, PERK_BY_ID.flame], 'room');
        const tags = [...document.querySelectorAll('.card')].map(c => (c.querySelector('.recipe-tag') || {}).textContent || '');
        const app = document.getElementById('app').getBoundingClientRect();
        const cardsFit = [...document.querySelectorAll('.card')].every(c => { const b = c.getBoundingClientRect(); return b.left >= app.left - 1 && b.right <= app.right + 1 && b.bottom <= app.bottom + 1; });
        RR.UI.pause();
        const pause = [...document.querySelectorAll('.pl.r-evolution')].map(e => `${e.querySelector('b').textContent} ${e.querySelector('.rp').textContent}`);
        return { tags, cardsFit, pause };
      });
      assert.deepEqual(r.tags, ['⚗ Laser Lance · needs Front Shot 3', '⚗ Wildfire · Venom Touch ✓']);
      assert.ok(r.cardsFit, 'the perk cards should fit the screen');
      assert.deepEqual(r.pause, ['Laser Lance Front Shot 2/3 · Piercing Shot 0/3', 'Wildfire Flame Touch 0/3 · Venom Touch 3/3']);
    },
  },
  {
    name: 'the recipe book shows each recipe as perk + perk = evolution, with the levels',
    size: SIZES.phoneSafari,
    async run(page) {
      const r = await page.evaluate(() => {
        save.recipes = { pinball: true };
        RR.UI.relics('recipes');
        const known = [...document.querySelectorAll('.recipe:not(.dim) .formula')].map(f => [...f.querySelectorAll('small, em, .op')].map(x => x.textContent).join(' '));
        const app = document.getElementById('app').getBoundingClientRect();
        const outside = [...document.querySelectorAll('.recipe')].filter(e => { const b = e.getBoundingClientRect(); return b.left < app.left - 1 || b.right > app.right + 1; }).length;
        return { known, unknown: document.querySelectorAll('.recipe.dim').length, count: document.querySelector('.recipe-count').textContent, outside };
      });
      assert.deepEqual(r.known, ['Bouncy Shots Lv 2 + Ricochet Lv 2 = Pinball']);
      assert.equal(r.unknown, await page.evaluate(() => EVOLUTIONS.length - 1));
      assert.match(r.count, /^1 of \d+ recipes found$/);
      assert.equal(r.outside, 0);
    },
  },
];
