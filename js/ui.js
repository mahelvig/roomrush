'use strict';
// Menus and overlays are plain HTML on top of the game canvas.

const SVG = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10.3 2h3.4l.5 2.6c.7.2 1.4.5 2 .9l2.2-1.5 2.4 2.4-1.5 2.2c.4.6.7 1.3.9 2l2.6.5v3.4l-2.6.5c-.2.7-.5 1.4-.9 2l1.5 2.2-2.4 2.4-2.2-1.5c-.6.4-1.3.7-2 .9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.4-.5-2-.9l-2.2 1.5-2.4-2.4 1.5-2.2c-.4-.6-.7-1.3-.9-2L2 13.7v-3.4l2.6-.5c.2-.7.5-1.4.9-2L4 5.6 6.4 3.2l2.2 1.5c.6-.4 1.3-.7 2-.9L10.3 2Zm1.7 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 22 4 21.3 4 20.5v-9C4 10.7 4.7 10 5.5 10H7Zm2.5 0h5V7a2.5 2.5 0 0 0-5 0v3Z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
};

const coinTag = n => `<span class="amt"><i class="coin-ico"></i>${fmt(n)}</span>`;
// The tier a world starts on: the one picked last time, or the highest open one.
const pickedTier = w => clamp(save.tierPick[w.id] ?? tierUnlocked(w), 0, tierUnlocked(w));
const mult = v => (v < 10 ? v.toFixed(1).replace('.0', '') : fmt(v));
const gemTag = n => `<span class="amt"><i class="gem-ico"></i>${fmt(n)}</span>`;

const UI = {
  root: null, previews: [], quitArmed: 0, resetArmed: 0, armedAt: 0,

  init() {
    this.root = document.getElementById('ui');
    this.hudEl = document.getElementById('hud');
    this.bannerEl = document.getElementById('banner');
    this.hintEl = document.getElementById('hint');
    this.bossEl = document.getElementById('bossbar');
    this.abilityEl = document.getElementById('abilityBtn');
    // pointerdown, not click: it has to fire at once, also while the other thumb steers
    this.abilityEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      Sound.init();
      useAbility();
    });
    document.getElementById('app').addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled) return;
      Sound.init();
      const fn = ACTIONS[b.dataset.a];
      if (fn) {
        if (b.dataset.a !== 'pick') Sound.play('click');
        fn(b.dataset, b);
      }
    });
  },

  open(html, cls) {
    this.hintEl.className = '';
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.root.classList.add('open');
    this.root.scrollTop = 0;
    requestAnimationFrame(() => this.prepareCanvases());
  },

  hide() {
    this.root.innerHTML = '';
    this.root.classList.remove('open');
    this.previews = [];
  },

  prepareCanvases() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.previews = [];
    for (const cv of this.root.querySelectorAll('canvas')) {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) continue;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      if (cv.dataset.icon) {
        drawIcon(ctx, cv.dataset.icon, cv.width);
      } else if (cv.dataset.preview) {
        this.previews.push({ cv, ctx, w, h, dpr, kind: cv.dataset.preview, data: cv.dataset });
      }
    }
  },

  // animated hero and world pictures in the menus
  tick(t) {
    for (const pv of this.previews) {
      const { ctx, w, h, dpr } = pv;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (pv.kind === 'hero') drawHeroPreview(ctx, w, h, t, HERO_BY_ID[pv.data.hero]);
      else if (pv.kind === 'world') drawWorldPreview(ctx, w, h, t, +pv.data.w);
    }
  },

  // ---------- HUD ----------
  hud(show) {
    this.hudEl.classList.toggle('hidden', !show);
    this.abilityEl.classList.toggle('hidden', !show);
    if (show) {
      this.updateHud();
      // the hero's ability icon on the button
      const cv = this.abilityEl.querySelector('canvas');
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = cv.height = Math.round((cv.clientWidth || 40) * dpr);
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (G.player) drawIcon(ctx, ABILITIES[G.player.hero.ability].icon, cv.width);
      this.abilityK = -1;
    }
  },
  // Cooldown ring on the ability button (called every update).
  abilityTick() {
    const p = G.player;
    if (!p) return;
    const k = Math.round((p.abilityCd / abilityCooldown(p.hero)) * 100) / 100;
    const ready = abilityReady();
    if (k !== this.abilityK) {
      this.abilityK = k;
      this.abilityEl.style.setProperty('--cd', k);
    }
    if (ready !== this.abilityReady) {
      this.abilityReady = ready;
      this.abilityEl.classList.toggle('ready', ready);
    }
  },
  updateHud() {
    if (!G.run) return;
    const w = G.world;
    this.hudEl.querySelector('.hud-world').textContent = `${G.tier ? `${w.short} · ${tierName(G.tier)}` : w.name} · ${G.roomIdx}/${ROOMS_PER_WORLD}`;
    let dots = '';
    for (let i = 1; i <= ROOMS_PER_WORLD; i++) {
      const type = roomTypeOf(i);
      const cls = [type, i < G.roomIdx ? 'done' : '', i === G.roomIdx ? 'now' : ''].join(' ');
      dots += `<i class="${cls}"></i>`;
    }
    this.hudEl.querySelector('.hud-rooms').innerHTML = dots;
    this.updateGold();
  },
  updateGold() {
    if (G.run) document.getElementById('hudGold').textContent = fmt(G.run.gold);
  },
  bossBar(name) {
    this.bossEl.classList.toggle('hidden', !name);
    if (name) {
      this.bossEl.querySelector('.bb-name').textContent = name;
      this.bossHp(1);
    }
  },
  bossHp(k, shielded) {
    const f = this.bossEl.querySelector('.bb-fill');
    const v = `${Math.max(0, k) * 100}%`;
    if (f.style.width !== v) f.style.width = v;
    this.bossEl.classList.toggle('rage', k < BOSS_PHASES[0]);
    this.bossEl.classList.toggle('shielded', !!shielded);
  },
  banner(title, sub, cls) {
    const b = this.bannerEl;
    b.className = '';
    void b.offsetWidth;
    b.innerHTML = `<div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.className = `show ${cls || ''}`;
  },
  hint(text) {
    const h = this.hintEl;
    h.textContent = text;
    h.className = 'show';
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { h.className = ''; }, 5000);
  },

  // ---------- screens ----------
  title() {
    G.state = 'menu';
    Sound.playMusic('menu');
    const hero = HERO_BY_ID[save.hero];
    const run = loadRun();
    const cont = run && WORLDS[run.world] ? `
      <div class="continue panel pop">
        <div><b>Run in progress</b><span>${WORLDS[run.world].name}${run.tier ? ` · ${tierName(run.tier)}` : ''} · Room ${run.room}/${ROOMS_PER_WORLD}</span></div>
        <button class="btn green" data-a="continue">Continue</button>
        <button class="icon-btn" data-a="abandon" aria-label="Give up run">${SVG.x}</button>
      </div>` : '';
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone;
    this.open(`
      <div class="top-row">
        <div class="pill">${coinTag(save.gold)}</div>
        <div class="pill">${gemTag(save.gems)}</div>
        <span class="grow"></span>
        <button class="round" data-a="settings" aria-label="Settings">${SVG.gear}</button>
      </div>
      <div class="logo"><span class="l1">Room</span><span class="l2">Rush</span></div>
      <div class="hero-stage">
        <canvas data-preview="hero" data-hero="${hero.id}"></canvas>
        <div class="hero-label">${hero.name} <span>${hero.title}</span></div>
      </div>
      ${cont}
      <div class="menu">
        <button class="btn big green" data-a="worlds">Play</button>
        <div class="row">
          <button class="btn blue" data-a="heroes">Heroes</button>
          <button class="btn purple" data-a="upgrades">Upgrades</button>
        </div>
      </div>
      ${ios ? '<p class="tip">Tip: tap Share and “Add to Home Screen” to play in full screen.</p>' : ''}
    `, 'title');
  },

  worlds() {
    const cards = WORLDS.map((w, i) => {
      const locked = i >= save.unlocked;
      const best = save.best[w.id] || 0, cleared = save.cleared[w.id] || 0;
      return `
        <button class="world-card ${locked ? 'locked' : ''}" data-a="start" data-w="${i}" ${locked ? 'disabled' : ''}>
          <canvas data-preview="world" data-w="${i}"></canvas>
          <div class="info">
            <b>${i + 1}. ${w.name}</b>
            <span>${w.blurb}</span>
            <span class="best">${cleared ? `Cleared ${cleared}×` : best ? `Best: room ${best}/${ROOMS_PER_WORLD}` : 'Not played yet'}</span>
          </div>
          ${locked ? `<div class="lock">${SVG.lock}<span>Beat ${WORLDS[i - 1].name}</span></div>` : ''}
        </button>
        ${!locked && tierUnlocked(w) > 0 ? this.tierRow(i) : ''}`;
    }).join('');
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Choose a world</h2></header>
      <div class="list">${cards}</div>
    `, 'worlds');
  },

  // The hero's active ability on its card, with the gem upgrade.
  abilityInfo(h, owned) {
    const a = ABILITIES[h.ability], L = abilityLevel(h), max = ABILITY_COSTS.length;
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('');
    const up = owned && L < max
      ? `<button class="btn small purple" data-a="upgradeAbility" data-id="${h.id}" ${save.gems < ABILITY_COSTS[L] ? 'disabled' : ''}>Upgrade ${gemTag(ABILITY_COSTS[L])}</button>`
      : '';
    return `
      <div class="ability-info">
        <canvas class="icon" data-icon="${a.icon}"></canvas>
        <div><b>${a.name}</b> <span class="pips">${pips}</span><span>${a.desc(L)} · every ${abilityCooldown(h).toFixed(1)} s</span></div>
      </div>
      ${up}`;
  },

  // Difficulty picker under a world card, shown once the world is cleared on Normal.
  tierRow(i) {
    const w = WORLDS[i], t = pickedTier(w), top = tierUnlocked(w);
    const done = t <= (save.tiers[w.id] ?? -1);
    return `
      <div class="tier-row panel" data-w="${i}">
        <button class="round small" data-a="tier" data-w="${i}" data-d="-1" ${t <= 0 ? 'disabled' : ''} aria-label="Easier">${SVG.back}</button>
        <div class="tier-info">
          <b class="t${Math.min(t, 4)}">${tierName(t)}${done ? ' <i>✓</i>' : ''}</b>
          <span>${t ? `Enemies ×${mult(TIER.hp ** t)} HP · ×${mult(TIER.gold ** t)} gold` : 'The normal game'}</span>
        </div>
        <button class="round small flip" data-a="tier" data-w="${i}" data-d="1" ${t >= top ? 'disabled' : ''} aria-label="Harder">${SVG.back}</button>
      </div>`;
  },

  heroes() {
    const maxHp = Math.max(...HEROES.map(h => h.hp));
    const maxDps = Math.max(...HEROES.map(h => h.atk / h.interval));
    const maxSp = Math.max(...HEROES.map(h => h.speed));
    const bar = (label, k) => `<div class="stat"><span>${label}</span><div class="track"><div style="width:${Math.round(k * 100)}%"></div></div></div>`;
    const cards = HEROES.map(h => {
      const owned = save.heroes.includes(h.id);
      const sel = save.hero === h.id;
      let btn;
      if (sel) btn = '<button class="btn small" disabled>Selected</button>';
      else if (owned) btn = `<button class="btn small green" data-a="hero" data-id="${h.id}">Select</button>`;
      else btn = `<button class="btn small gold" data-a="unlockHero" data-id="${h.id}" ${save.gems < h.cost ? 'disabled' : ''}>Unlock ${gemTag(h.cost)}</button>`;
      return `
        <div class="hero-card panel ${sel ? 'sel' : ''}">
          <canvas data-preview="hero" data-hero="${h.id}"></canvas>
          <div class="info">
            <b>${h.name} <span>${h.title}</span></b>
            ${bar('Health', h.hp / maxHp)}${bar('Damage', (h.atk / h.interval) / maxDps)}${bar('Speed', h.speed / maxSp)}
            <p>${h.passive}</p>
            ${this.abilityInfo(h, owned)}
            ${btn}
          </div>
        </div>`;
    }).join('');
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Heroes</h2><div class="pill">${gemTag(save.gems)}</div></header>
      <div class="list">${cards}</div>
    `, 'heroes');
  },

  upgrades() {
    const rows = UPGRADES.map(u => {
      const L = upgradeLevel(u.id);
      const maxed = L >= u.max;
      const cost = upgradeCost(u, L);
      return `
        <div class="upg panel">
          <canvas class="icon" data-icon="${u.icon}"></canvas>
          <div class="u-info">
            <b>${u.name} <span class="lv">${L}/${u.max}</span></b>
            <span>${L ? u.desc(L) : 'Not bought yet'}${maxed ? '' : ` <em>→ ${u.desc(L + 1)}</em>`}</span>
          </div>
          ${maxed ? '<span class="maxed">MAX</span>' : `<button class="btn small gold" data-a="buy" data-id="${u.id}" ${save.gold < cost ? 'disabled' : ''}>${coinTag(cost)}</button>`}
        </div>`;
    }).join('');
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Upgrades</h2><div class="pill">${coinTag(save.gold)}</div></header>
      <p class="sub">Permanent bonuses for every run.</p>
      <div class="list">${rows}</div>
    `, 'upgrades');
  },

  settings() {
    const s = save.settings;
    const tog = (key, label) => `
      <button class="toggle ${s[key] !== false ? 'on' : ''}" data-a="toggle" data-key="${key}">
        <span>${label}</span><i></i>
      </button>`;
    const canFs = !!document.documentElement.requestFullscreen;
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Settings</h2></header>
      <div class="list">
        ${tog('sfx', 'Sound effects')}
        ${tog('music', 'Music')}
        ${'vibrate' in navigator ? tog('vibrate', 'Vibration') : ''}
        ${canFs ? tog('fullscreen', 'Full screen when playing') : ''}
        <div class="panel stats">
          <b>Stats</b>
          <span>Runs: ${save.stats.runs}</span><span>Enemies defeated: ${fmt(save.stats.kills)}</span>
          <span>Bosses defeated: ${save.stats.bosses}</span><span>Deaths: ${save.stats.deaths}</span>
        </div>
        <button class="btn red" data-a="reset">Reset all progress</button>
      </div>
    `, 'settings');
  },

  perks(choices, reason) {
    const p = G.player;
    const title = reason === 'start' ? 'Head start!' : G.roomType === 'elite' ? 'Elite defeated!' : `Room ${G.roomIdx} cleared!`;
    const cards = choices.map((k, i) => {
      const L = p.perks[k.id] || 0;
      const R = RARITY[k.rarity];
      const lv = k.max > 1 && k.max < 99 ? `<span class="lv">${L ? `Lv ${L} → ${L + 1}` : 'New'}</span>` : L ? '' : '<span class="lv">New</span>';
      return `
        <button class="card r-${k.rarity}" data-a="pick" data-i="${i}" style="--rc:${R.color};animation-delay:${i * 0.08}s">
          <span class="rar">${R.name}</span>
          <canvas class="icon" data-icon="${k.icon}"></canvas>
          <b>${k.name}</b>
          <p>${perkDesc(k, L + 1)}</p>
          ${lv}
        </button>`;
    }).join('');
    const owned = Object.keys(p.perks).filter(id => id !== 'patch' && PERK_BY_ID[id]);
    this.armedAt = performance.now() + 450;
    this.open(`
      <div class="perk-head"><h2>Choose a perk</h2><p class="sub">${title}</p></div>
      <div class="cards">${cards}</div>
      ${G.run.rerolls > 0 ? `<button class="btn small blue" data-a="reroll">Reroll (${G.run.rerolls} left)</button>` : ''}
      ${owned.length ? `<div class="owned">${owned.map(id => `<span class="mini r-${PERK_BY_ID[id].rarity}"><canvas class="icon" data-icon="${PERK_BY_ID[id].icon}"></canvas>${p.perks[id] > 1 ? `<em>${p.perks[id]}</em>` : ''}</span>`).join('')}</div>` : ''}
    `, 'perk');
  },

  pause() {
    const p = G.player, run = G.run;
    const owned = Object.keys(p.perks).filter(id => id !== 'patch' && PERK_BY_ID[id]);
    const s = save.settings;
    this.quitArmed = 0;
    this.open(`
      <div class="panel pause-panel">
        <h2>Paused</h2>
        <div class="facts">
          <span><b>${G.world.short}</b>World</span>
          <span><b>${G.roomIdx}/${ROOMS_PER_WORLD}</b>Room</span>
          <span><b>${fmt(run.gold)}</b>Gold</span>
          <span><b>${run.kills || 0}</b>Kills</span>
        </div>
        <h3>Your perks</h3>
        ${owned.length ? `<div class="perk-list">${owned.map(id => {
          const k = PERK_BY_ID[id];
          return `<div class="pl r-${k.rarity}"><canvas class="icon" data-icon="${k.icon}"></canvas><span><b>${k.name}${p.perks[id] > 1 ? ` ×${p.perks[id]}` : ''}</b>${perkDesc(k, p.perks[id])}</span></div>`;
        }).join('')}</div>` : '<p class="sub">No perks yet. Clear a room to get one.</p>'}
        <div class="row toggles">
          <button class="toggle ${s.sfx ? 'on' : ''}" data-a="toggle" data-key="sfx" data-stay="1"><span>Sound</span><i></i></button>
          <button class="toggle ${s.music ? 'on' : ''}" data-a="toggle" data-key="music" data-stay="1"><span>Music</span><i></i></button>
        </div>
        <button class="btn big green" data-a="resume">Resume</button>
        <button class="btn small red" data-a="quit">Quit run</button>
      </div>
    `, 'pause');
  },

  gameOver(sum) {
    this.open(`
      <div class="panel result lose">
        <h2>Defeated</h2>
        <p class="sub">${sum.world.name}${sum.tier ? ` · ${tierName(sum.tier)}` : ''} · reached room ${sum.room}/${ROOMS_PER_WORLD}</p>
        <div class="facts">
          <span><b>${coinTag(sum.gold)}</b>Gold</span>
          <span><b>${gemTag(sum.gems)}</b>Gems</span>
          <span><b>${sum.kills}</b>Kills</span>
          <span><b>${fmtTime(sum.time)}</b>Time</span>
        </div>
        <p class="sub">Gold and gems are yours to keep. Spend them on upgrades!</p>
        <button class="btn big green" data-a="again">Try again</button>
        <div class="row">
          <button class="btn purple" data-a="upgrades">Upgrades</button>
          <button class="btn blue" data-a="title">Home</button>
        </div>
      </div>
    `, 'result-screen');
  },

  victory(sum) {
    this.open(`
      <div class="panel result win">
        <div class="trophy"><canvas class="icon" data-icon="star"></canvas></div>
        <h2>World cleared!</h2>
        <p class="sub">${sum.world.name}${sum.tier ? ` · ${tierName(sum.tier)}` : ''}${sum.bonus > 3 ? ` · first clear bonus +${sum.bonus} gems` : ''}</p>
        <div class="facts">
          <span><b>${coinTag(sum.gold)}</b>Gold</span>
          <span><b>${gemTag(sum.gems)}</b>Gems</span>
          <span><b>${sum.kills}</b>Kills</span>
          <span><b>${fmtTime(sum.time)}</b>Time</span>
        </div>
        ${sum.unlocked ? `<p class="unlock">New world unlocked: <b>${sum.unlocked.name}</b></p>` : ''}
        ${sum.nextTier ? `<p class="unlock">New difficulty unlocked: <b>${sum.nextTier}</b></p>` : ''}
        ${sum.unlocked ? `<button class="btn big green" data-a="start" data-w="${WORLDS.indexOf(sum.unlocked)}" data-t="0">Enter ${sum.unlocked.short}</button>`
          : sum.nextTier ? `<button class="btn big green" data-a="start" data-w="${WORLDS.indexOf(sum.world)}" data-t="${sum.tier + 1}">Play on ${sum.nextTier}</button>`
          : `<button class="btn big green" data-a="again">Play again</button>`}
        <div class="row">
          <button class="btn purple" data-a="upgrades">Upgrades</button>
          <button class="btn blue" data-a="title">Home</button>
        </div>
      </div>
    `, 'result-screen');
  },
};

function fmtTime(s) {
  s = Math.round(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ACTIONS = {
  title: () => UI.title(),
  worlds: () => UI.worlds(),
  heroes: () => UI.heroes(),
  upgrades: () => UI.upgrades(),
  settings: () => UI.settings(),
  start: d => {
    const w = WORLDS[+d.w];
    if (d.t !== undefined) { save.tierPick[w.id] = +d.t; writeSave(); }
    goFullscreen();
    startRun(+d.w, null, pickedTier(w));
  },
  again: () => { goFullscreen(); startRun(G.worldIdx, null, G.tier); },
  tier: d => {
    const w = WORLDS[+d.w];
    save.tierPick[w.id] = clamp(pickedTier(w) + +d.d, 0, tierUnlocked(w));
    writeSave();
    const row = UI.root.querySelector(`.tier-row[data-w="${d.w}"]`);
    if (row) row.outerHTML = UI.tierRow(+d.w);
  },
  continue: () => {
    const run = loadRun();
    if (!run) return UI.title();
    goFullscreen();
    startRun(run.world, run);
  },
  abandon: (d, b) => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.title = 'Tap again to give up the run';
      UI.hint('Tap the X again to give up this run (you keep the gold).');
      return;
    }
    const run = loadRun();
    if (run) { save.gold += run.gold || 0; save.gems += run.gems || 0; writeSave(); }
    clearRun();
    UI.title();
  },
  hero: d => { save.hero = d.id; writeSave(); UI.heroes(); },
  upgradeAbility: d => {
    const h = HERO_BY_ID[d.id], L = abilityLevel(h);
    if (L >= ABILITY_COSTS.length || save.gems < ABILITY_COSTS[L] || !save.heroes.includes(h.id)) return;
    save.gems -= ABILITY_COSTS[L];
    save.abilities[h.id] = L + 1;
    writeSave();
    Sound.play('perk');
    const y = UI.root.scrollTop;
    UI.heroes();
    UI.root.scrollTop = y;
  },
  unlockHero: d => {
    const h = HERO_BY_ID[d.id];
    if (save.gems < h.cost || save.heroes.includes(h.id)) return;
    save.gems -= h.cost;
    save.heroes.push(h.id);
    save.hero = h.id;
    writeSave();
    Sound.play('perk');
    UI.heroes();
  },
  buy: d => {
    const u = UPGRADES.find(x => x.id === d.id);
    const L = upgradeLevel(u.id);
    const cost = upgradeCost(u, L);
    if (L >= u.max || save.gold < cost) return;
    save.gold -= cost;
    save.upgrades[u.id] = L + 1;
    writeSave();
    Sound.play('coin');
    UI.upgrades();
  },
  toggle: (d, b) => {
    const k = d.key;
    save.settings[k] = save.settings[k] === false ? true : !save.settings[k];
    writeSave();
    Sound.applySettings();
    if (k === 'music' && save.settings.music) Sound.playMusic(Sound.wanted || 'menu');
    b.classList.toggle('on', save.settings[k] !== false);
    if (k === 'vibrate' && save.settings.vibrate) vibrate(40);
  },
  reset: (d, b) => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = 'Tap again to erase everything';
      return;
    }
    resetSave();
    UI.title();
  },
  pick: d => {
    if (performance.now() < UI.armedAt) return;
    choosePerk(+d.i);
  },
  reroll: () => rerollPerks(),
  pause: () => pauseGame(),
  resume: () => resumeGame(),
  quit: (d, b) => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = 'Tap again to quit (you keep the gold)';
      return;
    }
    quitRun();
  },
};

function goFullscreen() {
  if (save.settings.fullscreen === false || !isTouch) return;
  const d = document.documentElement;
  if (document.fullscreenElement || !d.requestFullscreen) return;
  if (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
  d.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* not supported */ }
    })
    .catch(() => {});
}

// ---------- menu pictures ----------

function fakeEnemy(type, x, y, r, boss) {
  const def = boss ? BOSSES[type] : ENEMIES[type];
  return {
    def, pal: def.pal, r: r || def.r, x, y, z: 0, look: Math.PI / 2 + 0.3, seed: x * 0.1, state: 'idle',
    status: { freeze: 0, curse: 0, poison: 0, burn: 0, slow: 0 }, flash: 0, spawnT: 0, squash: 0, moving: true,
  };
}

function drawHeroPreview(ctx, w, h, t, hero) {
  const s = Math.min(w / 62, h / 50);
  ctx.save();
  ctx.translate(w / 2, h * 0.62);
  ctx.scale(s, s);
  glow(ctx, 0, -4, 19, hero.pal.main, 0.45);
  drawShadow(ctx, 0, 9, 11);
  const aim = -Math.PI / 2 + Math.sin(t * 0.8) * 1.4;
  drawHero(ctx, hero, { aim, walk: t * 4, moving: false, recoil: Math.max(0, Math.sin(t * 3)) * 0.5, t, ready: Math.sin(t * 3) < 0 });
  ctx.restore();
}

function drawWorldPreview(ctx, w, h, t, i) {
  const world = WORLDS[i];
  const th = world.theme;
  const tile = h / 4;
  for (let r = 0; r < 5; r++) for (let c = 0; c < Math.ceil(w / tile) + 1; c++) {
    ctx.fillStyle = (r + c) % 2 ? th.floorA : th.floorB;
    ctx.fillRect(c * tile, r * tile, tile, tile);
  }
  const k = h / 80;
  const rng = makeRng(i * 999 + 7);
  ctx.save();
  ctx.scale(k, k);
  const W = w / k;
  if (world.hazards.water) { ctx.fillStyle = th.water; ctx.fillRect(W * 0.62, 58, W * 0.4, 30); }
  if (world.hazards.lava) { ctx.fillStyle = th.lava; ctx.fillRect(W * 0.55, 60, W * 0.5, 30); ctx.fillStyle = 'rgba(255,220,120,0.5)'; ctx.fillRect(W * 0.6, 66, W * 0.3, 6); }
  if (world.hazards.ice) { ctx.fillStyle = th.ice; ctx.fillRect(W * 0.5, 58, W * 0.6, 30); }
  drawObstacle(ctx, world, world.obstacles[0], 18, 30, rng);
  drawObstacle(ctx, world, world.obstacles[world.obstacles.length - 1], W - 16, 22, rng);
  const a = fakeEnemy(world.enemies[0], W * 0.3, 52 + Math.sin(t * 3) * 2);
  const b = fakeEnemy(world.enemies[3], W * 0.48, 62 + Math.sin(t * 3 + 1) * 2);
  const boss = fakeEnemy(world.boss, W * 0.76, 52, 22, true);
  for (const e of [a, b]) { drawShadow(ctx, e.x, e.y + e.r * 0.8, e.r); drawEnemy(ctx, e, t); }
  drawShadow(ctx, boss.x, boss.y + 18, 20);
  drawEnemy(ctx, boss, t);
  ctx.restore();
}
