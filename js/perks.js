'use strict';
// Perks: picked after every room (one of two). mod() changes the stats for a given level,
// onPick() does one-off things like healing.

// Most perks go past their first few levels: the top levels (from `top`) add something new, and
// their card says so. `evoAt` is the level an evolution recipe needs (when it is not the max).
const after = (L, n) => Math.max(0, L - n);   // levels past n
const PERKS = [
  // ---- common ----
  { id: 'attack', name: 'Sharp Shots', rarity: 'common', max: 8, top: 7, icon: 'sword',
    desc: L => (L < 7 ? 'Attack +15%' : 'Attack +15% and critical chance +5%'),
    mod: (s, L) => { s.atkPct += 0.15 * L; s.crit += 0.05 * after(L, 6); } },
  { id: 'speed', name: 'Quick Draw', rarity: 'common', max: 8, top: 7, icon: 'quick',
    desc: L => (L < 7 ? 'Attack speed +12%' : 'Attack speed +12% and move speed +5%'),
    mod: (s, L) => { s.rate *= Math.pow(1.12, L); s.speed *= 1 + 0.05 * after(L, 6); } },
  { id: 'vitality', name: 'Vitality', rarity: 'common', max: 6, top: 6, icon: 'heart',
    desc: L => (L < 6 ? 'Max HP +20%' : 'Max HP +20% and take 8% less damage'),
    mod: (s, L) => { s.hpPct += 0.2 * L; if (L >= 6) s.armor = 1 - (1 - s.armor) * 0.92; } },
  { id: 'patch', name: 'Patch Up', rarity: 'common', max: 99, icon: 'heal',
    desc: 'Heal 40% of your max HP', mod: () => {}, onPick: p => healPlayer(p.s.maxHp * 0.4),
    when: p => p.hp < p.s.maxHp * 0.85 },
  { id: 'boots', name: 'Swift Boots', rarity: 'common', max: 5, top: 4, icon: 'boot',
    desc: L => (L < 4 ? 'Move speed +12%' : 'Move speed +12% and 5% chance to dodge a hit'),
    mod: (s, L) => { s.speed *= 1 + 0.12 * L; s.dodge += 0.05 * after(L, 3); } },
  { id: 'side', name: 'Side Shot', rarity: 'common', max: 3, icon: 'side',
    desc: '+1 shot to the left and right', mod: (s, L) => { s.side += L; } },
  { id: 'rear', name: 'Rear Shot', rarity: 'common', max: 3, icon: 'rear',
    desc: '+1 shot backwards', mod: (s, L) => { s.rear += L; } },
  { id: 'bouncy', name: 'Bouncy Shots', rarity: 'common', max: 3, evoAt: 2, top: 3, icon: 'bounce',
    desc: L => (L < 3 ? 'Shots bounce off walls twice' : 'Shots bounce off walls twice more. Damage +10%'),
    mod: (s, L) => { s.wallBounce += 2 * L; if (L >= 3) s.dmgMul *= 1.1; } },
  { id: 'keen', name: 'Keen Eye', rarity: 'common', max: 5, evoAt: 4, top: 5, icon: 'eye',
    desc: L => (L < 5 ? 'Critical chance +10%' : 'Critical chance +10% and critical damage +30%'),
    mod: (s, L) => { s.crit += 0.1 * L; if (L >= 5) s.critMul += 0.3; } },
  { id: 'greed', name: 'Greed', rarity: 'common', max: 4, icon: 'coin',
    desc: '+40% gold for the rest of this run', mod: (s, L) => { s.gold += 0.4 * L; } },
  { id: 'stone', name: 'Stone Skin', rarity: 'common', max: 5, top: 4, icon: 'stone',
    desc: L => (L < 4 ? 'Take 10% less damage' : 'Take 10% less damage and max HP +10%'),
    mod: (s, L) => { s.armor = 1 - (1 - s.armor) * Math.pow(0.9, L); s.hpPct += 0.1 * after(L, 3); } },
  { id: 'regen', name: 'Second Wind', rarity: 'common', max: 4, evoAt: 3, top: 4, icon: 'regen',
    desc: L => (L < 4 ? 'Heal 8% after every room' : 'Heal 8% after every room and max HP +15%'),
    mod: (s, L) => { s.roomHeal += 0.08 * L; if (L >= 4) s.hpPct += 0.15; } },

  // ---- rare ----
  { id: 'multishot', name: 'Multishot', rarity: 'rare', max: 4, icon: 'multi',
    desc: 'Fire one extra volley. Damage -10%', mod: (s, L) => { s.multishot += L; s.dmgMul *= Math.pow(0.9, L); } },
  { id: 'front', name: 'Front Shot', rarity: 'rare', max: 4, evoAt: 3, icon: 'front',
    desc: '+1 shot side by side. Damage -15%', mod: (s, L) => { s.front += L; s.dmgMul *= Math.pow(0.85, L); } },
  { id: 'diag', name: 'Diagonal Shots', rarity: 'rare', max: 4, icon: 'diag',
    desc: '+2 shots at an angle', mod: (s, L) => { s.diag += L; } },
  { id: 'pierce', name: 'Piercing Shot', rarity: 'rare', max: 4, top: 4, evoAt: 3, icon: 'pierce',
    desc: L => (L < 4 ? 'Shots go through one more enemy' : 'Shots go through one more enemy. Damage +10%'),
    mod: (s, L) => { s.pierce += L; if (L >= 4) s.dmgMul *= 1.1; } },
  { id: 'flame', name: 'Flame Touch', rarity: 'rare', max: 5, top: 4, evoAt: 3, icon: 'fire',
    desc: L => (L < 4 ? 'Shots set enemies on fire' : 'Fire burns hotter'), mod: (s, L) => { s.burn += L; } },
  { id: 'venom', name: 'Venom Touch', rarity: 'rare', max: 5, evoAt: 3, top: 4, icon: 'poison',
    desc: L => (L < 4 ? 'Shots poison enemies. Poison stacks' : 'Poison is stronger and stacks higher'), mod: (s, L) => { s.poison += L; } },
  { id: 'frost', name: 'Frost Touch', rarity: 'rare', max: 5, top: 4, evoAt: 3, icon: 'frost',
    desc: L => (L < 4 ? 'Shots slow enemies and can freeze them' : 'Enemies freeze more often'), mod: (s, L) => { s.frost += L; } },
  { id: 'deadly', name: 'Deadly Strike', rarity: 'rare', max: 4, evoAt: 3, icon: 'crit',
    desc: 'Critical damage +50%', mod: (s, L) => { s.critMul += 0.5 * L; } },
  { id: 'vampire', name: 'Bloodthirst', rarity: 'rare', max: 4, evoAt: 3, icon: 'fang',
    desc: 'Heal 2% of max HP for every kill', mod: (s, L) => { s.vamp += 0.02 * L; } },
  { id: 'holy', name: 'Holy Shield', rarity: 'rare', max: 4, evoAt: 3, top: 2, icon: 'shield',
    desc: L => [
      'A shield blocks one hit. It returns after each room',
      'When it breaks, the shield wipes out nearby shots',
      'When it breaks, it also hurts and blasts away nearby enemies',
      `The shield also grows back ${SHIELD_REGROW} s after it breaks`,
    ][L - 1],
    mod: (s, L) => { s.shield = L; } },
  { id: 'wisp', name: 'Spirit Friend', rarity: 'rare', max: 4, icon: 'wisp',
    desc: 'A spirit flies with you and shoots enemies', mod: (s, L) => { s.wisps += L; } },
  { id: 'blades', name: 'Spinning Blades', rarity: 'rare', max: 4, evoAt: 3, icon: 'blades',
    desc: L => (L < 2 ? '2 blades circle you and cut enemies' : '+1 blade circles you'), mod: (s, L) => { s.blades += L + 1; } },
  { id: 'guard', name: 'Guardian Orbs', rarity: 'rare', max: 3, evoAt: 2, icon: 'orbs',
    desc: '2 orbs circle you and block enemy shots', mod: (s, L) => { s.guards += 2 * L; } },
  { id: 'agile', name: 'Agility', rarity: 'rare', max: 4, icon: 'dodge',
    desc: '12% chance to dodge a hit', mod: (s, L) => { s.dodge += 0.12 * L; } },
  { id: 'steady', name: 'Steady Aim', rarity: 'rare', max: 3, icon: 'aim',
    desc: 'Damage +20% while you stand still', mod: (s, L) => { s.steady += 0.2 * L; } },
  { id: 'focus', name: 'Focus', rarity: 'rare', max: 3, icon: 'focus',
    desc: 'Your ability recharges 20% faster', mod: (s, L) => { s.abilityCd *= Math.pow(0.8, L); } },

  // ---- epic ----
  { id: 'chain', name: 'Chain Lightning', rarity: 'epic', max: 4, evoAt: 3, icon: 'lightning',
    desc: L => (L < 2 ? 'Hits send lightning to nearby enemies' : 'Lightning jumps to one more enemy and hits harder'),
    mod: (s, L) => { s.lightning += L; } },
  { id: 'hex', name: 'Hex', rarity: 'epic', max: 4, icon: 'curse',
    desc: L => (L < 2 ? 'Cursed enemies take more damage and release souls when they die' : 'Curses hurt more and release one more soul'),
    mod: (s, L) => { s.curse += L; } },
  { id: 'ricochet', name: 'Ricochet', rarity: 'epic', max: 3, evoAt: 2, icon: 'ricochet',
    desc: 'Shots jump to 2 more enemies', mod: (s, L) => { s.ricochet += 2 * L; } },
  { id: 'meteor', name: 'Meteor Shower', rarity: 'epic', max: 4, evoAt: 3, icon: 'meteor',
    desc: L => (L < 2 ? 'Meteors fall on enemies every few seconds' : 'Meteors fall more often'), mod: (s, L) => { s.meteor += L; } },
  { id: 'storm', name: 'Thunderstorm', rarity: 'epic', max: 4, evoAt: 3, icon: 'storm',
    desc: L => (L < 2 ? 'Lightning strikes random enemies' : 'Lightning strikes more often, and one more enemy'), mod: (s, L) => { s.storm += L; } },
  { id: 'giant', name: 'Giant Shots', rarity: 'epic', max: 3, icon: 'giant',
    desc: 'Bigger shots. Damage +30% and knockback', mod: (s, L) => { s.size += 0.45 * L; s.atkPct += 0.3 * L; s.knock += L; } },
  { id: 'rage', name: 'Berserker', rarity: 'epic', max: 3, evoAt: 2, icon: 'rage',
    desc: 'Up to +60% damage when your HP is low', mod: (s, L) => { s.rage += 0.6 * L; } },
  { id: 'headshot', name: 'Headshot', rarity: 'epic', max: 4, icon: 'skull',
    desc: '5% chance to defeat a normal enemy in one hit', mod: (s, L) => { s.headshot += 0.05 * L; } },
  { id: 'rungun', name: 'Run & Gun', rarity: 'epic', max: 2, top: 2, icon: 'run',
    desc: L => (L < 2 ? 'Shoot at full speed while moving' : 'Damage +20% while you move'),
    mod: (s, L) => { if (L) s.moveRate = 1; s.moveDmg += 0.2 * after(L, 1); } },

  // ---- legendary ----
  { id: 'extralife', name: 'Extra Life', rarity: 'legendary', max: 2, icon: 'ankh',
    desc: L => (L < 2 ? 'Come back to life once with 60% HP' : 'Come back to life one more time'), mod: (s, L) => { s.lives += L; } },
  { id: 'dragon', name: 'Baby Dragon', rarity: 'legendary', max: 3, icon: 'dragon',
    desc: 'A little dragon spits burning fireballs', mod: (s, L) => { s.dragons += L; } },
  { id: 'arrowstorm', name: 'Barrage', rarity: 'legendary', max: 2, icon: 'arrows',
    desc: '+1 volley and +1 side-by-side shot, no damage loss', mod: (s, L) => { s.multishot += L; s.front += L; } },
  { id: 'phoenix', name: 'Phoenix Heart', rarity: 'legendary', max: 2, icon: 'phoenix',
    desc: 'Max HP +50% and heal fully', mod: (s, L) => { s.hpPct += 0.5 * L; }, onPick: p => healPlayer(p.s.maxHp) },
  { id: 'timewarp', name: 'Time Warp', rarity: 'legendary', max: 2, evoAt: 1, icon: 'hourglass',
    desc: L => (L < 2 ? 'Enemy shots fly 30% slower' : 'Enemy shots fly 45% slower'),
    mod: (s, L) => { s.bulletSlow = L >= 2 ? 0.55 : L ? 0.7 : 1; } },
];
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));
// Most perks have one description; a few change with the level (desc is a function of it).
const perkDesc = (k, L) => (typeof k.desc === 'function' ? k.desc(Math.max(1, L)) : k.desc);
// The level an evolution recipe needs of this perk, and whether level L brings in a new effect.
const evoLevel = k => k.evoAt || k.max;
const perkUpgrade = (k, L) => L > 1 && k.top && L >= k.top && perkDesc(k, L) !== perkDesc(k, L - 1);

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
    meteor: 0, storm: 0, size: 1, knock: 0, rage: 0, headshot: 0, steady: 0, moveDmg: 0,
    lives: 0, gold: upgradeLevel('greed') * 0.1 + masteryLevel('greed') * 0.03, roomHeal: upgradeLevel('recover') * 0.03,
    bulletSlow: 1, homing: hero.homing || 0,
    abilityCd: 1, coreBreak: 0, shieldPierce: 0, firstHit: 0, threeCards: 0, glass: 0,
  };
}

function computeStats(p) {
  const s = baseStats(p.hero);
  for (const id in p.perks) if (PERK_BY_ID[id]) PERK_BY_ID[id].mod(s, p.perks[id]);
  for (const r of p.relics || []) {
    if (RELIC_BY_ID[r.id] && RELIC_BY_ID[r.id].mod) RELIC_BY_ID[r.id].mod(s, r.L);
    applyRelicAffixes(s, r);
  }
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
  const open = k => !out.includes(k) && (p.perks[k.id] || 0) < k.max && (!k.when || k.when(p));
  while (out.length < n) {
    let rest = PERKS.filter(k => open(k) && RARITY[k.rarity].rank >= minRank);
    if (!rest.length) rest = PERKS.filter(open);
    if (!rest.length) break;
    out.push(pick(rest));
  }
  return out;
}
