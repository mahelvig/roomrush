'use strict';
// Adventure: the map of numbered levels, their goals, stars, boosters, the win streak and chests.
const assert = require('assert/strict');
const { SIZES } = require('./helpers');

// A save that has won levels 1..best, with some gold.
const setup = (page, best = 0, extra = {}) => page.evaluate(([best, extra]) => {
  const s = RR.save();
  s.gold = 100000;
  s.seenHint = true;
  s.adv = Object.assign({ best, stars: {}, streak: 0, chests: {}, seenEp: 99 }, extra);
  for (let i = 1; i <= best; i++) s.adv.stars[i] = s.adv.stars[i] || 1;
  RR.UI.title();
}, [best, extra]);

// Start level n from its level screen, with the boosters given, and pick the free perks.
async function play(page, n, boosters = []) {
  await page.evaluate(([n, boosters]) => { RR.UI.advLevel(n); RR.UI.advSel = boosters.slice(); }, [n, boosters]);
  await page.click('[data-a="advPlay"]');
  await page.waitForFunction(() => {
    if (RR.G.state === 'perk' && RR.G.perkReason === 'start') RR.choosePerk(0);
    return RR.G.state === 'play' && RR.G.adv;
  }, null, { polling: 100, timeout: 10000 });
}

// Win the level being played: kill everything, walk through doors, pick perks.
const winLevel = page => page.waitForFunction(() => {
  const G = RR.G;
  if (G.state === 'perk') { RR.choosePerk(0); return false; }
  if (G.state === 'won') return true;
  if (G.state !== 'play') return false;
  G.player.invuln = 9999;
  if (G.adv && G.world.level.goal === 'survive') G.adv.t = 999;
  for (const e of [...G.enemies]) if (!e.dead && e.spawnT <= 0) RR.killEnemy(e);
  if (G.doorOpen) { G.player.x = 180; G.player.y = 50; }   // through the door
  return false;
}, null, { polling: 150, timeout: 40000 });

module.exports = [
  {
    name: 'levels are built from their number: saw-tooth difficulty, a boss every 15th, new goals open their episode',
    size: SIZES.phone,
    async run(page) {
      const r = await page.evaluate(() => {
        const a = advLevel(37), b = advLevel(37);
        const goals = new Set();
        for (let n = 1; n <= 150; n++) goals.add(advLevel(n).goal);
        return {
          same: JSON.stringify([a.goal, a.rooms, a.value, a.mod && a.mod.id]) === JSON.stringify([b.goal, b.rooms, b.value, b.mod && b.mod.id]),
          boss: [15, 30, 45].map(n => advLevel(n).goal),
          hard: [5, 10, 20].map(n => advLevel(n).hard),
          saw: [advTier(4), advTier(5), advTier(6)],
          ep2: advLevel(16).goal, ep3: advLevel(31).goal, ep4: advLevel(46).goal, ep5: advLevel(61).goal,
          firstTwo: [advLevel(1).goal, advLevel(2).goal],
          goals: [...goals].sort(),
          noModEarly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => !advLevel(n).mod),
          rooms: [1, 2, 3, 15].map(n => advWorld(n).rooms),
        };
      });
      assert.ok(r.same, 'a level must be the same every time');
      assert.deepEqual(r.boss, ['boss', 'boss', 'boss']);
      assert.deepEqual(r.hard, [true, true, true]);
      assert.ok(r.saw[1] > r.saw[0] && r.saw[2] < r.saw[1], `tiers ${r.saw}`);
      assert.deepEqual([r.ep2, r.ep3, r.ep4, r.ep5], ['timed', 'hoarder', 'careful', 'elite']);
      assert.deepEqual(r.firstTwo, ['clear', 'survive']);
      assert.deepEqual(r.goals, ['boss', 'careful', 'clear', 'elite', 'hoarder', 'survive', 'timed']);
      assert.ok(r.noModEarly, 'episode 1 has no modifiers');
      assert.ok(r.rooms.every(k => k >= 1 && k <= 3), `rooms ${r.rooms}`);
    },
  },
  {
    name: 'the map opens from the title screen, fits, and only the next level is open',
    size: SIZES.phoneSafari,
    async run(page) {
      await setup(page, 3);
      await page.click('[data-a="adventure"]');
      await page.waitForSelector('.adv-node.now');
      const r = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const nodes = [...document.querySelectorAll('.adv-node')];
        return {
          now: document.querySelector('.adv-node.now').dataset.n,
          done: nodes.filter(n => n.classList.contains('done')).length,
          open: nodes.filter(n => !n.disabled).length,
          outside: [...document.querySelectorAll('#ui button, #ui .panel')].filter(e => {
            const b = e.getBoundingClientRect();
            return b.width && (b.left < app.left - 1 || b.right > app.right + 1);
          }).length,
        };
      });
      assert.equal(r.now, '4');
      assert.equal(r.done, 3);
      assert.equal(r.open, 4);
      assert.equal(r.outside, 0);
      await page.click('.adv-node.now');
      await page.waitForSelector('[data-a="advPlay"]');
    },
  },
  {
    name: 'winning a level gives stars, opens the next one and grows the win streak',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 0);
      await play(page, 1);
      await winLevel(page);
      const r = await page.evaluate(() => ({ adv: RR.save().adv, title: document.querySelector('.result h2').textContent, stars: document.querySelectorAll('.adv-won .st.on').length }));
      assert.equal(r.adv.best, 1);
      assert.equal(r.adv.streak, 1);
      assert.equal(r.adv.stars[1], 3, 'an invulnerable hero takes no hits');
      assert.equal(r.stars, 3);
      assert.match(r.title, /Level 1 done/);
      await page.click('.result [data-a="advLevel"][data-n="2"]');
      await page.waitForSelector('[data-a="advPlay"][data-n="2"]');
    },
  },
  {
    name: 'stars go by the hits taken',
    size: SIZES.phone,
    async run(page) {
      const r = await page.evaluate(() => {
        const clear = advLevel(1), careful = advLevel(46);
        return [0, 2, 3, 6, 7].map(h => advStarsFor(clear, h)).concat([0, 1, careful.value].map(h => advStarsFor(careful, h)));
      });
      assert.deepEqual(r, [3, 3, 2, 2, 1, 3, 2, 1]);
    },
  },
  {
    name: 'Survive keeps the room open until the time is up, and sends more enemies',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 1);
      await play(page, 2);
      const r = await page.evaluate(() => new Promise(done => {
        const G = RR.G;
        G.player.invuln = 9999;
        for (const e of [...G.enemies]) RR.killEnemy(e);
        setTimeout(() => {
          const open = !G.cleared, more = G.enemies.length > 0;
          G.adv.t = G.world.level.value - 0.05;
          setTimeout(() => done({ open, more, cleared: G.cleared || G.state === 'won' }), 500);
        }, 4000);
      }));
      assert.ok(r.open, 'the room cleared before the time was up');
      assert.ok(r.more, 'no new enemies came');
      assert.ok(r.cleared, 'the room did not clear when the time was up');
      await page.waitForFunction(() => RR.G.state === 'won', null, { timeout: 10000 });
    },
  },
  {
    name: 'running out of time loses the level, says how close it was, and ends the win streak',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 15, { streak: 4 });
      await play(page, 16);
      assert.equal(await page.evaluate(() => RR.G.world.level.goal), 'timed');
      await page.evaluate(() => { RR.G.player.invuln = 9999; RR.G.adv.t = RR.G.world.level.value; });
      await page.waitForSelector('.result.lose', { timeout: 10000 });
      const r = await page.evaluate(() => ({ why: document.querySelector('.adv-why').textContent, streak: RR.save().adv.streak, best: RR.save().adv.best, text: document.querySelector('.result').textContent }));
      assert.match(r.why, /Out of time/);
      assert.match(r.why, /enem/);
      assert.equal(r.streak, 0);
      assert.equal(r.best, 15);
      assert.match(r.text, /win streak of 4 is gone/);
    },
  },
  {
    name: 'a Hoarder that gets away loses the level',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 30);
      await play(page, 31);
      assert.equal(await page.evaluate(() => RR.G.world.level.goal), 'hoarder');
      await page.waitForFunction(() => RR.G.adv.hoarder, null, { timeout: 10000 });
      await page.evaluate(() => { RR.G.player.invuln = 9999; RR.G.adv.hoarder.life = 0.01; });
      await page.waitForSelector('.result.lose', { timeout: 10000 });
      assert.match(await page.textContent('.adv-why'), /got away/);
    },
  },
  {
    name: 'a boss level ends with the boss, and pays gems the first time',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 14);
      const gems = await page.evaluate(() => RR.save().gems);
      await play(page, 15);
      await winLevel(page);
      const r = await page.evaluate(() => ({ best: RR.save().adv.best, gems: RR.save().gems, type: RR.G.roomType }));
      assert.equal(r.type, 'boss');
      assert.equal(r.best, 15);
      assert.ok(r.gems > gems, 'no gems for the first boss win');
    },
  },
  {
    name: 'boosters cost gold and work: Power Brew, Bubble, Lucky Start and Extra Life',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 20);
      const price = await page.evaluate(() => ['power', 'shield', 'epic', 'life'].reduce((a, id) => a + advPrice(ADV_BOOSTER_BY_ID[id], 21), 0));
      await page.evaluate(() => { RR.UI.advLevel(21); RR.UI.advSel = ['power', 'shield', 'epic', 'life']; });
      await page.click('[data-a="advPlay"]');
      await page.waitForFunction(() => RR.G.state === 'perk');
      const first = await page.evaluate(() => RR.G.choices.map(k => RARITY[k.rarity].rank));
      assert.ok(first.every(k => k >= 2), `Lucky Start offered ranks ${first}`);
      await page.waitForFunction(() => {
        if (RR.G.state === 'perk') RR.choosePerk(0);
        return RR.G.state === 'play';
      }, null, { polling: 100 });
      const r = await page.evaluate(() => {
        const p = RR.G.player, base = baseStats(p.hero);
        const out = { gold: RR.save().gold, invuln: p.invuln, run: RR.G.run.boosters };
        RR.G.run.boosters = [];
        out.ratio = base.dmgMul / baseStats(p.hero).dmgMul;
        p.invuln = 0; p.s.dodge = 0; p.shieldUp = false;
        hurtPlayer(1e12);
        out.revived = !p.dead && p.hp > 0 && RR.G.state === 'play';
        p.invuln = 0;
        hurtPlayer(1e12);
        out.second = p.dead;
        return out;
      });
      assert.equal(r.gold, 100000 - price);
      assert.ok(r.invuln > 6, `Bubble gave ${r.invuln} s`);
      assert.ok(Math.abs(r.ratio - 1.3) < 1e-9, `Power Brew ×${r.ratio}`);
      assert.ok(r.revived, 'Extra Life did not bring the hero back');
      assert.ok(r.second, 'Extra Life works only once');
    },
  },
  {
    name: 'a win streak hands out free boosters',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 5, { streak: 5 });
      const gold = await page.evaluate(() => RR.save().gold);
      await play(page, 6);
      const r = await page.evaluate(() => ({ boosters: RR.G.run.boosters.slice().sort(), gold: RR.save().gold }));
      assert.deepEqual(r.boosters, ['epic', 'power', 'shield']);
      assert.equal(r.gold, gold);
    },
  },
  {
    name: 'Mastery only counts up to the level\'s cap in Adventure',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 0);
      await page.evaluate(() => { RR.save().mastery = { atk: 400, hp: 400 }; });
      await play(page, 1);
      const r = await page.evaluate(() => ({ dmg: RR.G.player.s.dmgMul, cap: advMasteryCap(1) }));
      assert.ok(Math.abs(r.dmg - 1.04 ** r.cap) < 1e-6, `dmgMul ${r.dmg}`);
    },
  },
  {
    name: 'episode chests open once with enough stars',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 15);
      const r = await page.evaluate(() => {
        for (let i = 1; i <= 15; i++) RR.save().adv.stars[i] = 2;   // 30 stars: the first chest only
        const gems = RR.save().gems;
        const a = advOpenChest(1, 0), again = advOpenChest(1, 0), b = advOpenChest(1, 1);
        return { a, again, b, gems: RR.save().gems - gems };
      });
      assert.ok(r.a && r.a.gems > 0);
      assert.equal(r.again, null);
      assert.equal(r.b, null);
      assert.equal(r.gems, r.a.gems);
    },
  },
  {
    name: 'a level in progress can be continued from the title screen',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 2);
      await play(page, 3);
      await page.evaluate(() => { RR.G.state = 'menu'; RR.UI.hud(false); RR.UI.title(); });
      assert.match(await page.textContent('.continue'), /Level 3/);
      await page.click('[data-a="continue"]');
      await page.waitForFunction(() => RR.G.state === 'play' || RR.G.state === 'perk');
      assert.equal(await page.evaluate(() => RR.G.world.adv), 3);
    },
  },
  {
    name: 'replaying an old level neither grows nor breaks the win streak; a new one does',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 5, { streak: 1 });
      await play(page, 1);
      await winLevel(page);
      const replayWin = await page.evaluate(() => RR.save().adv.streak);
      await play(page, 1);
      await page.evaluate(() => { const p = RR.G.player; p.invuln = 0; p.s.dodge = 0; p.shieldUp = false; RR.G.run.metaRevive = false; RR.G.run.boostLife = false; hurtPlayer(1e12); });
      await page.waitForSelector('.result.lose', { timeout: 10000 });
      const replayLoss = await page.evaluate(() => RR.save().adv.streak);
      await play(page, 6);
      await winLevel(page);
      const newWin = await page.evaluate(() => RR.save().adv.streak);
      assert.deepEqual([replayWin, replayLoss, newWin], [1, 1, 2]);
    },
  },
  {
    name: 'a boss level pays no gems when replayed',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 15);
      const gems = await page.evaluate(() => RR.save().gems);
      await play(page, 15);
      await winLevel(page);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({ gems: RR.save().gems, run: RR.G.run.gems }));
      assert.equal(r.run, 0);
      assert.equal(r.gems, gems);
    },
  },
  {
    name: 'relics drop as rarely as in The Depths, and not at all below the first tier',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 100);
      const r = await page.evaluate(() => {
        const at = n => { RR.G.world = advWorld(n); RR.G.tier = advTier(n); return ['boss', 'elite', 'hoarder'].map(relicChance); };
        return { low: at(3), high: at(90) };
      });
      assert.deepEqual(r.low, [0, 0, 0]);
      assert.deepEqual(r.high, [0.15, 0.04, 0.3]);
    },
  },
  {
    name: 'Continue keeps the time already spent on the clock',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 15);
      await play(page, 16);
      await page.evaluate(() => { RR.G.player.invuln = 9999; RR.G.adv.t = 20; });
      await page.waitForTimeout(200);
      await page.evaluate(() => { writeRun(RR.G.run); RR.G.state = 'menu'; RR.UI.hud(false); RR.UI.title(); });
      await page.click('[data-a="continue"]');
      await page.waitForFunction(() => RR.G.state === 'play' && RR.G.adv);
      const t = await page.evaluate(() => RR.G.adv.t);
      assert.ok(t >= 20, `the clock started over at ${t}`);
    },
  },
  {
    name: 'a win counts for the Adventure quests and the achievement, and chimes once per star',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 0);
      await page.evaluate(() => {
        refreshQuests();
        const Q = RR.save().quests;
        Q.daily = [makeQuest(DAILY_QUESTS.find(d => d.id === 'adv')), makeQuest(DAILY_QUESTS.find(d => d.id === 'advnew'))];
        Q.weekly = [makeQuest(WEEKLY_QUESTS.find(d => d.id === 'advstars'), true)];
        window.played = [];
        const play = Sound.play.bind(Sound);
        Sound.play = name => { window.played.push(name); play(name); };
      });
      await play(page, 1);
      await winLevel(page);
      const r = await page.evaluate(() => {
        const Q = RR.save().quests;
        return {
          daily: Q.daily.map(q => q.have), weekly: Q.weekly[0].have,
          ach: ACH_BY_ID.adventurer.stat(), texts: Q.daily.map(q => questText(q, false)),
          stars: window.played.filter(n => /^star\d$/.test(n)),
        };
      });
      assert.deepEqual(r.daily, [1, 1]);
      assert.equal(r.weekly, 3);
      assert.equal(r.ach, 1);
      assert.deepEqual(r.stars, ['star1', 'star2', 'star3']);
      assert.match(r.texts[0], /Adventure/);
    },
  },
  {
    name: 'the pause menu names the level, not a world',
    size: SIZES.phone,
    async run(page) {
      await setup(page, 3);
      await play(page, 4);
      await page.evaluate(() => pauseGame());
      const facts = await page.textContent('.pause-panel .facts');
      assert.match(facts, /4\s*Level/);
      assert.doesNotMatch(facts, /World/);
    },
  },
];
