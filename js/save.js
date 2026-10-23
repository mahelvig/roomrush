'use strict';
// Everything that survives between runs lives in localStorage.

const SAVE_KEY = 'roomrush.save.v1';
const RUN_KEY = 'roomrush.run.v1';

function defaultSave() {
  return {
    gold: 0,
    gems: 0,
    upgrades: {},
    heroes: ['ranger'],
    hero: 'ranger',
    world: 0,
    unlocked: 1,           // number of worlds the player may enter
    best: {},              // world id -> best room reached
    cleared: {},           // world id -> times cleared
    tiers: {},             // world id -> highest difficulty tier cleared (see TIER in config.js)
    tierPick: {},          // world id -> tier picked last time on the world screen
    abilities: {},         // hero id -> ability upgrades bought (0..ABILITY_COSTS.length)
    mastery: {},           // upgrade id -> mastery levels bought (no cap)
    depthBest: 0,          // deepest depth reached in The Depths
    depthCleared: 0,       // deepest depth cleared (for the gem bonus every fifth depth)
    depthPick: 0,          // depth picked on the world screen (0 = the deepest start)
    seenAbilityHint: false,
    settings: { sfx: true, music: true, vibrate: true },
    stats: { runs: 0, kills: 0, bosses: 0, deaths: 0 },
    seenHint: false,
  };
}

let save = loadSave();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const def = defaultSave();
      const s = Object.assign(def, data, {
        settings: Object.assign(def.settings, data.settings),
        stats: Object.assign(def.stats, data.stats),
      });
      // saves from before tiers: a cleared world counts as cleared on Normal
      for (const id in s.cleared) if (s.cleared[id] > 0 && s.tiers[id] === undefined) s.tiers[id] = 0;
      return s;
    }
  } catch (e) { /* private mode or broken data: start fresh */ }
  return defaultSave();
}

function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

const upgradeLevel = id => save.upgrades[id] || 0;
const masteryLevel = id => save.mastery[id] || 0;
// Highest tier the player may pick for a world: one above the best tier cleared.
const tierUnlocked = w => (save.tiers[w.id] ?? -1) + 1;

// A run in progress is stored at the start of every room so it can be continued
// if the phone closes the tab.
function writeRun(run) {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch (e) { /* ignore */ }
}
function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ }
}

function resetSave() {
  save = defaultSave();
  writeSave();
  clearRun();
}
