'use strict';
// Perks: picked after every room (one of two). mod() changes the stats for a given level,
// onPick() does one-off things like healing.

const PERKS = [
  // ---- common ----
  { id: 'attack', name: 'Sharp Shots', rarity: 'common', max: 6, icon: 'sword',
    desc: 'Attack +15%', mod: (s, L) => { s.atkPct += 0.15 * L; } },
  { id: 'speed', name: 'Quick Draw', rarity: 'common', max: 6, icon: 'quick',
    desc: 'Attack speed +12%', mod: (s, L) => { s.rate *= Math.pow(1.12, L); } },
  { id: 'vitality', name: 'Vitality', rarity: 'common', max: 5, icon: 'heart',
    desc: 'Max HP +20%', mod: (s, L) => { s.hpPct += 0.2 * L; } },
  { id: 'patch', name: 'Patch Up', rarity: 'common', max: 99, icon: 'heal',
    desc: 'Heal 40% of your max HP', mod: () => {}, onPick: p => healPlayer(p.s.maxHp * 0.4),
    when: p => p.hp < p.s.maxHp * 0.85 },
  { id: 'boots', name: 'Swift Boots', rarity: 'common', max: 3, icon: 'boot',
    desc: 'Move speed +12%', mod: (s, L) => { s.speed *= 1 + 0.12 * L; } },
  { id: 'side', name: 'Side Shot', rarity: 'common', max: 2, icon: 'side',
    desc: '+1 shot to the left and right', mod: (s, L) => { s.side += L; } },
  { id: 'rear', name: 'Rear Shot', rarity: 'common', max: 2, icon: 'rear',
    desc: '+1 shot backwards', mod: (s, L) => { s.rear += L; } },
  { id: 'bouncy', name: 'Bouncy Shots', rarity: 'common', max: 2, icon: 'bounce',
    desc: 'Shots bounce off walls twice', mod: (s, L) => { s.wallBounce += 2 * L; } },
  { id: 'keen', name: 'Keen Eye', rarity: 'common', max: 4, icon: 'eye',
    desc: 'Critical chance +10%', mod: (s, L) => { s.crit += 0.1 * L; } },
  { id: 'greed', name: 'Greed', rarity: 'common', max: 3, icon: 'coin',
    desc: '+40% gold for the rest of this run', mod: (s, L) => { s.gold += 0.4 * L; } },
  { id: 'stone', name: 'Stone Skin', rarity: 'common', max: 3, icon: 'stone',
    desc: 'Take 10% less damage', mod: (s, L) => { s.armor = 1 - (1 - s.armor) * Math.pow(0.9, L); } },
  { id: 'regen', name: 'Second Wind', rarity: 'common', max: 3, icon: 'regen',
    desc: 'Heal 8% after every room', mod: (s, L) => { s.roomHeal += 0.08 * L; } },

  // ---- rare ----
  { id: 'multishot', name: 'Multishot', rarity: 'rare', max: 3, icon: 'multi',
    desc: 'Fire one extra volley. Damage -10%', mod: (s, L) => { s.multishot += L; s.dmgMul *= Math.pow(0.9, L); } },
  { id: 'front', name: 'Front Shot', rarity: 'rare', max: 3, icon: 'front',
    desc: '+1 shot side by side. Damage -15%', mod: (s, L) => { s.front += L; s.dmgMul *= Math.pow(0.85, L); } },
  { id: 'diag', name: 'Diagonal Shots', rarity: 'rare', max: 3, icon: 'diag',
    desc: '+2 shots at an angle', mod: (s, L) => { s.diag += L; } },
  { id: 'pierce', name: 'Piercing Shot', rarity: 'rare', max: 3, icon: 'pierce',
    desc: 'Shots go through one more enemy', mod: (s, L) => { s.pierce += L; } },
  { id: 'flame', name: 'Flame Touch', rarity: 'rare', max: 3, icon: 'fire',
    desc: 'Shots set enemies on fire', mod: (s, L) => { s.burn += L; } },
  { id: 'venom', name: 'Venom Touch', rarity: 'rare', max: 3, icon: 'poison',
    desc: 'Shots poison enemies. Poison stacks', mod: (s, L) => { s.poison += L; } },
  { id: 'frost', name: 'Frost Touch', rarity: 'rare', max: 3, icon: 'frost',
    desc: 'Shots slow enemies and can freeze them', mod: (s, L) => { s.frost += L; } },
  { id: 'deadly', name: 'Deadly Strike', rarity: 'rare', max: 3, icon: 'crit',
    desc: 'Critical damage +50%', mod: (s, L) => { s.critMul += 0.5 * L; } },
  { id: 'vampire', name: 'Bloodthirst', rarity: 'rare', max: 3, icon: 'fang',
    desc: 'Heal 2% of max HP for every kill', mod: (s, L) => { s.vamp += 0.02 * L; } },
  { id: 'holy', name: 'Holy Shield', rarity: 'rare', max: 3, icon: 'shield',
    desc: L => [
      'A shield blocks one hit. It returns after each room',
      'When it breaks, the shield wipes out nearby shots',
      'When it breaks, it also hurts and blasts away nearby enemies',
    ][L - 1],
    mod: (s, L) => { s.shield = L; } },
  { id: 'wisp', name: 'Spirit Friend', rarity: 'rare', max: 3, icon: 'wisp',
    desc: 'A spirit flies with you and shoots enemies', mod: (s, L) => { s.wisps += L; } },
  { id: 'blades', name: 'Spinning Blades', rarity: 'rare', max: 3, icon: 'blades',
    desc: '2 blades circle you and cut enemies', mod: (s, L) => { s.blades += L + 1; } },
  { id: 'guard', name: 'Guardian Orbs', rarity: 'rare', max: 2, icon: 'orbs',
    desc: '2 orbs circle you and block enemy shots', mod: (s, L) => { s.guards += 2 * L; } },
  { id: 'agile', name: 'Agility', rarity: 'rare', max: 3, icon: 'dodge',
    desc: '12% chance to dodge a hit', mod: (s, L) => { s.dodge += 0.12 * L; } },

  // ---- epic ----
  { id: 'chain', name: 'Chain Lightning', rarity: 'epic', max: 3, icon: 'lightning',
    desc: 'Hits send lightning to nearby enemies', mod: (s, L) => { s.lightning += L; } },
  { id: 'hex', name: 'Hex', rarity: 'epic', max: 3, icon: 'curse',
    desc: 'Cursed enemies take more damage and release souls when they die', mod: (s, L) => { s.curse += L; } },
  { id: 'ricochet', name: 'Ricochet', rarity: 'epic', max: 2, icon: 'ricochet',
    desc: 'Shots jump to 2 more enemies', mod: (s, L) => { s.ricochet += 2 * L; } },
  { id: 'meteor', name: 'Meteor Shower', rarity: 'epic', max: 3, icon: 'meteor',
    desc: 'Meteors fall on enemies every few seconds', mod: (s, L) => { s.meteor += L; } },
  { id: 'storm', name: 'Thunderstorm', rarity: 'epic', max: 3, icon: 'storm',
    desc: 'Lightning strikes random enemies', mod: (s, L) => { s.storm += L; } },
  { id: 'giant', name: 'Giant Shots', rarity: 'epic', max: 2, icon: 'giant',
    desc: 'Bigger shots. Damage +30% and knockback', mod: (s, L) => { s.size += 0.45 * L; s.atkPct += 0.3 * L; s.knock += L; } },
  { id: 'rage', name: 'Berserker', rarity: 'epic', max: 2, icon: 'rage',
    desc: 'Up to +60% damage when your HP is low', mod: (s, L) => { s.rage += 0.6 * L; } },
  { id: 'headshot', name: 'Headshot', rarity: 'epic', max: 2, icon: 'skull',
    desc: '3% chance to defeat a normal enemy in one hit', mod: (s, L) => { s.headshot += 0.03 * L; } },
  { id: 'rungun', name: 'Run & Gun', rarity: 'epic', max: 1, icon: 'run',
    desc: 'Shoot at full speed while moving', mod: (s, L) => { if (L) s.moveRate = 1; } },

  // ---- legendary ----
  { id: 'extralife', name: 'Extra Life', rarity: 'legendary', max: 1, icon: 'ankh',
    desc: 'Come back to life once with 60% HP', mod: (s, L) => { s.lives += L; } },
  { id: 'dragon', name: 'Baby Dragon', rarity: 'legendary', max: 2, icon: 'dragon',
    desc: 'A little dragon spits burning fireballs', mod: (s, L) => { s.dragons += L; } },
  { id: 'arrowstorm', name: 'Barrage', rarity: 'legendary', max: 1, icon: 'arrows',
    desc: '+1 volley and +1 side-by-side shot, no damage loss', mod: (s, L) => { s.multishot += L; s.front += L; } },
  { id: 'phoenix', name: 'Phoenix Heart', rarity: 'legendary', max: 1, icon: 'phoenix',
    desc: 'Max HP +50% and heal fully', mod: (s, L) => { s.hpPct += 0.5 * L; }, onPick: p => healPlayer(p.s.maxHp) },
  { id: 'timewarp', name: 'Time Warp', rarity: 'legendary', max: 1, icon: 'hourglass',
    desc: 'Enemy shots fly 30% slower', mod: (s, L) => { s.bulletSlow = L ? 0.7 : 1; } },
];
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));
// Most perks have one description; a few change with the level (desc is a function of it).
const perkDesc = (k, L) => (typeof k.desc === 'function' ? k.desc(Math.max(1, L)) : k.desc);

// Base stats from the hero plus permanent upgrades.
function baseStats(hero) {
  return {
    maxHp: (hero.hp + upgradeLevel('hp') * 40) * 1.03 ** masteryLevel('hp'),
    hpPct: 0,
    atk: hero.atk,
    atkPct: upgradeLevel('atk') * 0.05,
    dmgMul: 1.04 ** masteryLevel('atk'),
    interval: hero.interval,
    rate: (1 + upgradeLevel('speed') * 0.03) * 1.01 ** masteryLevel('speed'),
    moveRate: 0.6,            // fire rate while moving (hybrid controls)
    speed: hero.speed,
    crit: hero.crit + upgradeLevel('crit') * 0.02,
    critMul: 2,
    armor: 1 - (1 - upgradeLevel('armor') * 0.02) * 0.98 ** masteryLevel('armor'),
    dodge: 0,
    front: 0, multishot: 0, diag: 0, side: 0, rear: 0, pierce: 0, wallBounce: 0, ricochet: 0,
    burn: 0, poison: 0, frost: 0, lightning: 0, curse: 0,
    vamp: 0, shield: 0, wisps: 0, blades: 0, guards: 0, dragons: 0, drones: hero.drone || 0,
    meteor: 0, storm: 0, size: 1, knock: 0, rage: 0, headshot: 0,
    lives: 0, gold: upgradeLevel('greed') * 0.1 + masteryLevel('greed') * 0.03, roomHeal: upgradeLevel('recover') * 0.03,
    bulletSlow: 1, homing: hero.homing || 0,
    abilityCd: 1, coreBreak: 0, shieldPierce: 0, firstHit: 0, threeCards: 0, glass: 0,
  };
}

function computeStats(p) {
  const s = baseStats(p.hero);
  for (const id in p.perks) if (PERK_BY_ID[id]) PERK_BY_ID[id].mod(s, p.perks[id]);
  for (const r of p.relics || []) if (RELIC_BY_ID[r.id] && RELIC_BY_ID[r.id].mod) RELIC_BY_ID[r.id].mod(s, r.L);
  s.maxHp = Math.round(s.maxHp * (1 + s.hpPct) * (s.glass ? 0.5 : 1));
  s.dodge = Math.min(0.5, s.dodge);
  s.crit = Math.min(1, s.crit);
  return s;
}

// Pick n different perks. minRank 1 = at least rare (elite rooms).
function rollPerks(p, n, minRank = 0) {
  const luck = upgradeLevel('luck') * 0.2;
  const weight = r => {
    const R = RARITY[r];
    if (R.rank < minRank) return 0;
    return R.rank === 0 ? R.weight * (1 - luck * 0.5) : R.weight * (1 + luck * R.rank * 0.5);
  };
  const available = PERKS.filter(k => (p.perks[k.id] || 0) < k.max && (!k.when || k.when(p)));
  const out = [];
  for (let i = 0; i < n && available.length; i++) {
    const rarities = Object.keys(RARITY).filter(r => available.some(k => k.rarity === r) && weight(r) > 0);
    if (!rarities.length) break;
    const rar = weightedPick(rarities, weight);
    const pool = available.filter(k => k.rarity === rar);
    const perk = pick(pool);
    out.push(perk);
    available.splice(available.indexOf(perk), 1);
  }
  // fill up from anything that is left if a rarity ran dry
  while (out.length < n) {
    let rest = PERKS.filter(k => !out.includes(k) && (p.perks[k.id] || 0) < k.max && RARITY[k.rarity].rank >= minRank);
    if (!rest.length) rest = PERKS.filter(k => !out.includes(k) && (p.perks[k.id] || 0) < k.max);
    if (!rest.length) break;
    out.push(pick(rest));
  }
  return out;
}
