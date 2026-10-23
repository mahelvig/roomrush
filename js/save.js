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
      return Object.assign(def, data, {
        settings: Object.assign(def.settings, data.settings),
        stats: Object.assign(def.stats, data.stats),
      });
    }
  } catch (e) { /* private mode or broken data: start fresh */ }
  return defaultSave();
}

function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

const upgradeLevel = id => save.upgrades[id] || 0;

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
