'use strict';
// The Depths: an endless row of generated worlds, 10 rooms and a boss each, unlocked by clearing the
// last world on Normal. Depth d is built from its number alone, so every player meets the same depth d:
// the scenery of one world, the enemies of another, a boss with an extra affix and a modifier.
// Enemies are as tough as in the last world, scaled like difficulty tier d (TIER in config.js).

const DEPTH_ROOMS = 10;
const DEPTH_MODS = [
  { id: 'swarm', name: 'Elite Swarm', desc: 'An elite joins every room' },
  { id: 'swift', name: 'Swift Shots', desc: 'Enemy shots fly 30% faster' },
  { id: 'meteors', name: 'Meteor Rain', desc: 'Meteors keep falling around you' },
  { id: 'dark', name: 'Darkness', desc: 'Only the area around you is lit' },
];
const DEPTH_BOSS_AFFIXES = ['fast', 'toxic', 'frost', 'summoner', 'mirror', 'blinking'];

const depthsUnlocked = () => (save.tiers[WORLDS[WORLDS.length - 1].id] ?? -1) >= 0;
// Where a run may start: depth 1, or every fifth depth reached so far.
const depthStarts = () => [1, ...Array.from({ length: Math.floor((save.depthBest || 0) / 5) }, (_, i) => (i + 1) * 5)];
const worldMod = id => !!(G.world.mod && G.world.mod.id === id);

function depthWorld(depth) {
  const rng = makeRng(depth * 7919 + 101);
  const roll = list => list[Math.floor(rng() * list.length)];
  const env = roll(WORLDS), foe = roll(WORLDS), bossFrom = roll(WORLDS);
  const mod = roll(DEPTH_MODS), bossAffix = roll(DEPTH_BOSS_AFFIXES);
  const last = WORLDS[WORLDS.length - 1];
  return Object.assign({}, env, {
    id: 'depths', depth, rooms: DEPTH_ROOMS,
    name: env === foe ? `Deep ${env.noun}` : `${foe.adj} ${env.noun}`,
    short: `Depth ${depth}`, blurb: mod.desc,
    hpMult: last.hpMult, dmgMult: last.dmgMult, coinMult: last.coinMult,
    enemies: foe.enemies, elites: foe.elites, boss: bossFrom.boss, mod, bossAffix,
  });
}

// After the last room of a depth: on to the next one, same run, same perks.
function nextDepth() {
  const d = G.world.depth + 1;
  G.world = depthWorld(d);
  G.tier = d;
  G.run.depth = d;
  save.depthBest = Math.max(save.depthBest || 0, d);
  writeSave();
  enterRoom(1);
}

// The boss of a depth is down: the usual room-cleared flow (perk, door), a banner, and gems
// the first time each fifth depth is cleared.
function depthCleared() {
  const d = G.world.depth;
  onRoomCleared();
  let sub = G.world.name;
  if (d % 5 === 0 && d > (save.depthCleared || 0)) {
    const gems = 10 + d;
    G.run.gems += gems;
    sub = `Milestone bonus +${gems} gems`;
  }
  save.depthCleared = Math.max(save.depthCleared || 0, d);
  writeSave();
  UI.banner(`Depth ${d} cleared!`, sub, 'clear');
}

// Meteor Rain: every few seconds a meteor comes down near you.
function updateMeteorRain(dt, p) {
  G.meteorT = (G.meteorT ?? 3) - dt;
  if (G.meteorT > 0) return;
  G.meteorT = rand(3.5, 5);
  const x = clamp(p.x + p.vx * 0.6 + rand(-40, 40), ROOM_X + 20, ROOM_X + ROOM_W - 20);
  const y = clamp(p.y + p.vy * 0.6 + rand(-40, 40), ROOM_Y + 20, ROOM_Y + ROOM_H - 20);
  G.strikes.push({ x, y, r: 32, t: 1.1, max: 1.1, dmg: Math.round(70 * G.world.dmgMult * roomScale().dmg), owner: 'enemy', kind: 'meteor' });
  Sound.play('warn');
}

// Darkness: everything but a circle round the hero is dimmed.
function drawDarkness(ctx, p) {
  const x = p.x, y = p.y - 4;
  const g = ctx.createRadialGradient(x, y, 90, x, y, 230);
  g.addColorStop(0, 'rgba(6,4,16,0)');
  g.addColorStop(1, 'rgba(6,4,16,0.82)');
  ctx.fillStyle = g;
  ctx.fillRect(0, G.camY - 40, WORLD_W, G.viewH + 80);
}
