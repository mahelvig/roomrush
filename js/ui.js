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
      else if (pv.kind === 'depths') drawDepthsPreview(ctx, w, h, t);
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
    const k = Math.round((p.abilityCd / abilityCooldown(p.hero, p.s)) * 100) / 100;
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
    const where = w.depth ? `Depth ${w.depth} · ${w.name}` : G.tier ? `${w.short} · ${tierName(G.tier)}` : w.name;
    this.hudEl.querySelector('.hud-world').textContent = `${where} · ${G.roomIdx}/${roomsIn(w)}`;
    let dots = '';
    for (let i = 1; i <= roomsIn(w); i++) {
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
  // A short golden message (quest done, achievement reached).
  toast(text) {
    this.hint(text);
    this.hintEl.classList.add('gold');
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
    refreshQuests();
    const waiting = rewardsWaiting();
    Sound.playMusic('menu');
    const hero = HERO_BY_ID[save.hero];
    const run = loadRun();
    const runWhere = run && (run.depth ? `Depth ${run.depth} · ${depthWorld(run.depth).name} · Room ${run.room}/${DEPTH_ROOMS}`
      : WORLDS[run.world] && `${WORLDS[run.world].name}${run.tier ? ` · ${tierName(run.tier)}` : ''} · Room ${run.room}/${ROOMS_PER_WORLD}`);
    const cont = runWhere ? `
      <div class="continue panel pop">
        <div><b>Run in progress</b><span>${runWhere}</span></div>
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
        <div class="row">
          <button class="btn gold quests-btn" data-a="quests">Quests${waiting ? `<i class="badge">${waiting}</i>` : ''}</button>
          <button class="btn teal" data-a="relics">Relics</button>
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
    const open = depthsUnlocked();
    const depths = `
      <button class="world-card depths ${open ? '' : 'locked'}" data-a="startDepth" ${open ? '' : 'disabled'}>
        <canvas data-preview="depths"></canvas>
        <div class="info">
          <b>The Depths</b>
          <span>Endless worlds, each harder than the last. How deep can you go?</span>
          <span class="best">${save.depthBest ? `Deepest: depth ${save.depthBest}` : 'Not played yet'}</span>
        </div>
        ${open ? '' : `<div class="lock">${SVG.lock}<span>Beat ${WORLDS.find(w => w.id === DEPTH_BASE).name}</span></div>`}
      </button>
      ${open && depthStarts().length > 1 ? this.depthRow() : ''}`;
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Choose a world</h2></header>
      ${this.wornStrip()}
      <div class="list">${cards}${depths}</div>
    `, 'worlds');
  },

  // The relics you will wear, small, with a way to the relic screen.
  wornStrip() {
    if (!Object.keys(save.relics).length) return '';
    const worn = wornRelics();
    const slots = Array.from({ length: relicSlots() }, (_, i) => {
      const r = worn[i] && RELIC_BY_ID[worn[i].id];
      return r ? `<span class="mini r-${r.rarity}"><canvas class="icon" data-icon="${r.icon}"></canvas><em>${worn[i].L}</em></span>` : '<span class="mini empty"></span>';
    }).join('');
    return `<button class="worn-strip panel" data-a="relics"><b>Relics</b>${slots}<span class="link">Change</span></button>`;
  },

  // Relics (the collection, and which to wear) and the recipe book of evolutions.
  relics(tab = this.relicTab || 'relics') {
    this.relicTab = tab;
    const tabs = `<div class="tabs">
      <button class="tab ${tab === 'relics' ? 'on' : ''}" data-a="relics" data-tab="relics">Relics</button>
      <button class="tab ${tab === 'recipes' ? 'on' : ''}" data-a="relics" data-tab="recipes">Recipes</button>
    </div>`;
    const pips = L => `<span class="pips">${Array.from({ length: RELIC_MAX }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('')}</span>`;
    let body;
    if (tab === 'recipes') {
      body = EVOLUTIONS.map(ev => {
        const found = !!save.recipes[ev.id];
        return `
          <div class="upg panel ${found ? '' : 'dim'}">
            <canvas class="icon" data-icon="${found ? ev.icon : 'gift'}"></canvas>
            <div class="u-info">
              <b>${found ? ev.name : 'Unknown recipe'}</b>
              <span>${found ? `<em>${ev.from.map(id => PERK_BY_ID[id].name).join(' + ')}</em> · ${ev.desc}` : 'Still to be found'}</span>
            </div>
          </div>`;
      }).join('');
      body += '<p class="sub">Recipes drop where relics do. Max both perks of a recipe in one run, and the next perk choice lets you merge them.</p>';
    } else {
      const worn = save.worn;
      const n = relicSlots();
      const slots = Array.from({ length: n }, (_, i) => {
        const r = RELIC_BY_ID[worn[i]];
        return r && relicLevel(r.id) ? `<button class="slot r-${r.rarity}" data-a="wearRelic" data-id="${r.id}"><canvas class="icon" data-icon="${r.icon}"></canvas></button>`
          : '<span class="slot empty"></span>';
      }).join('');
      body = `
        <div class="relic-slots panel"><b>Worn</b><div class="slots">${slots}</div>
          <span>${n < 3 ? 'A third slot opens when you clear Frozen Crypt on Hell' : 'Tap a relic to wear it or take it off'}</span></div>` +
        RELICS.map(r => {
          const L = relicLevel(r.id), on = worn.includes(r.id), R = RARITY[r.rarity];
          if (!L) {
            return `
              <div class="upg panel dim">
                <span class="icon unknown">?</span>
                <div class="u-info"><b>Unknown relic</b><span style="color:${R.color}">${R.name}</span></div>
              </div>`;
          }
          return `
            <div class="upg panel relic ${on ? 'worn' : ''}">
              <canvas class="icon" data-icon="${r.icon}"></canvas>
              <div class="u-info">
                <b>${r.name} ${pips(L)}</b>
                <span><i class="rar-tag" style="color:${R.color}">${R.name}</i> · level ${L}${L < RELIC_MAX ? '' : ' (max)'} · ${r.desc(L)}</span>
              </div>
              <button class="btn small ${on ? 'blue' : 'green'}" data-a="wearRelic" data-id="${r.id}">${on ? 'Take off' : 'Wear'}</button>
            </div>`;
        }).join('') +
        '<p class="sub">Relics drop from elites and bosses on Hard and up, from chests in the Iron Citadel and at the milestones of The Depths. A relic you already have goes up a level.</p>';
    }
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Relics</h2></header>
      ${tabs}
      <div class="list">${body}</div>
    `, 'relics');
  },

  // Where to start in The Depths: depth 1 or a checkpoint every fifth depth.
  depthRow() {
    const starts = depthStarts(), d = this.pickedDepth(), i = starts.indexOf(d);
    return `
      <div class="tier-row panel" data-depth="1">
        <button class="round small" data-a="depthPick" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Shallower">${SVG.back}</button>
        <div class="tier-info">
          <b class="t4">Start at depth ${d}</b>
          <span>${d > 1 ? 'No perks to start with, but 3 free picks' : 'From the top'}</span>
        </div>
        <button class="round small flip" data-a="depthPick" data-d="1" ${i >= starts.length - 1 ? 'disabled' : ''} aria-label="Deeper">${SVG.back}</button>
      </div>`;
  },
  pickedDepth() {
    const starts = depthStarts();
    return starts.includes(save.depthPick) ? save.depthPick : starts[starts.length - 1];
  },

  // Quests and achievements: three tabs.
  quests(tab = this.questTab || 'daily') {
    this.questTab = tab;
    refreshQuests();
    const Q = save.quests;
    const bar = (have, need) => `<div class="qbar"><div style="width:${Math.min(100, (have / need) * 100)}%"></div><span>${fmt(Math.min(have, need))}/${fmt(need)}</span></div>`;
    const tabs = `<div class="tabs">
      ${['daily', 'weekly', 'achievements'].map(t => `<button class="tab ${t === tab ? 'on' : ''}" data-a="questTab" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>`;
    let body;
    if (tab === 'achievements') {
      body = ACHIEVEMENTS.map(a => {
        const L = achClaimed(a), done = L >= a.goals.length, goal = a.goals[Math.min(L, a.goals.length - 1)];
        const medals = a.goals.map((_, i) => `<i class="medal m${i} ${i < L ? 'on' : ''}"></i>`).join('');
        return `
          <div class="quest panel">
            <div class="q-info">
              <b>${a.name} <span class="medals">${medals}</span></b>
              <span>${done ? 'All done!' : a.text(goal)}</span>
              ${done ? '' : bar(Math.max(0, a.stat()), goal)}
            </div>
            ${achReady(a) ? `<button class="btn small gold" data-a="claimAch" data-id="${a.id}">Claim ${gemTag(ACH_GEMS[L])}</button>`
              : done ? '' : `<span class="q-reward">${ACH_TIERS[L]} ${gemTag(ACH_GEMS[L])}</span>`}
          </div>`;
      }).join('');
    } else {
      const weekly = tab === 'weekly', list = weekly ? Q.weekly : Q.daily;
      const chestOpen = weekly ? Q.weeklyChest : Q.dailyChest, allDone = list.length && list.every(q => q.done);
      const rows = list.map((q, i) => `
        <div class="quest panel ${q.claimed ? 'dim' : ''}">
          <div class="q-info">
            <b>${questText(q, weekly)}</b>
            ${bar(q.have, q.target)}
          </div>
          ${q.claimed ? '<span class="q-reward">Done</span>'
            : q.done ? `<button class="btn small gold" data-a="claimQuest" data-w="${weekly ? 1 : 0}" data-i="${i}">Claim ${coinTag(q.gold)}</button>`
            : `<div class="q-side"><span class="q-reward">${coinTag(q.gold)}</span>${!weekly && !Q.swapped ? `<button class="link" data-a="swapQuest" data-i="${i}">Swap</button>` : ''}</div>`}
        </div>`).join('');
      const chest = `
        <div class="quest panel chest">
          <div class="q-info">
            <b>${weekly ? 'Weekly' : 'Daily'} chest</b>
            <span>${chestOpen ? 'Opened. Come back for new quests!' : `Finish all ${list.length} quests`}</span>
          </div>
          ${chestOpen ? '' : `<button class="btn small gold" data-a="claimChest" data-w="${weekly ? 1 : 0}" ${allDone ? '' : 'disabled'}>Open ${gemTag(weekly ? WEEKLY_CHEST : DAILY_CHEST)}</button>`}
        </div>`;
      body = `${rows}${chest}<p class="sub">New quests in ${untilNext(weekly)}${!weekly && !Q.swapped ? ' · you can swap one quest today' : ''}</p>`;
    }
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Quests</h2><div class="pill">${gemTag(save.gems)}</div></header>
      ${tabs}
      <div class="list">${body}</div>
    `, 'quests');
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

  upgrades(tab = this.upgradeTab || 'upgrades') {
    this.upgradeTab = tab;
    if (tab === 'mastery') return this.mastery();
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
      ${this.upgradeTabs('upgrades')}
      <p class="sub">Permanent bonuses for every run.</p>
      <div class="list">${rows}</div>
    `, 'upgrades');
  },

  upgradeTabs(on) {
    return `<div class="tabs">
      <button class="tab ${on === 'upgrades' ? 'on' : ''}" data-a="upgradeTab" data-tab="upgrades">Upgrades</button>
      <button class="tab ${on === 'mastery' ? 'on' : ''}" data-a="upgradeTab" data-tab="mastery">Mastery</button>
    </div>`;
  },

  // Mastery: the five upgrades that go on without a cap once maxed.
  mastery() {
    const rows = MASTERY.map(m => {
      const u = UPGRADES.find(x => x.id === m.id);
      const open = upgradeLevel(u.id) >= u.max;
      const L = masteryLevel(m.id), cost = masteryCost(L);
      return `
        <div class="upg panel ${open ? '' : 'dim'}">
          <canvas class="icon" data-icon="${m.icon}"></canvas>
          <div class="u-info">
            <b>${m.name} <span class="lv">${L}</span></b>
            <span>${open ? `${L ? m.desc(L) : 'Not bought yet'} <em>→ ${m.desc(L + 1)}</em>` : `Max ${u.name} first (${upgradeLevel(u.id)}/${u.max})`}</span>
          </div>
          ${open ? `<button class="btn small gold" data-a="buyMastery" data-id="${m.id}" ${save.gold < cost ? 'disabled' : ''}>${coinTag(cost)}</button>` : ''}
        </div>`;
    }).join('');
    this.open(`
      <header><button class="round" data-a="title" aria-label="Back">${SVG.back}</button><h2>Upgrades</h2><div class="pill">${coinTag(save.gold)}</div></header>
      ${this.upgradeTabs('mastery')}
      <p class="sub">No limit: keeps growing as long as you keep buying.</p>
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
    const title = reason === 'start' ? 'Head start!' : G.roomType === 'elite' ? 'Elite defeated!'
      : G.roomType === 'boss' && G.world.depth ? `Depth ${G.world.depth} cleared! Next: depth ${G.world.depth + 1}` : `Room ${G.roomIdx} cleared!`;
    const cards = choices.map((k, i) => {
      const L = p.perks[k.id] || 0;
      const R = RARITY[k.rarity];
      const lv = k.evo ? `<span class="lv">${k.from.map(id => PERK_BY_ID[id].name).join(' + ')}</span>`
        : k.max > 1 && k.max < 99 ? `<span class="lv">${L ? `Lv ${L} → ${L + 1}` : 'New'}</span>` : L ? '' : '<span class="lv">New</span>';
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
      <div class="cards ${choices.length > 2 ? 'three' : ''}">${cards}</div>
      ${G.run.rerolls > 0 ? `<button class="btn small blue" data-a="reroll">Reroll (${G.run.rerolls} left)</button>`
        : `<button class="btn small blue" data-a="reroll" ${save.gems < gemRerollCost() ? 'disabled' : ''}>Reroll ${gemTag(gemRerollCost())}</button>`}
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
          <span><b>${G.roomIdx}/${roomsIn(G.world)}</b>Room</span>
          <span><b>${fmt(run.gold)}</b>Gold</span>
          <span><b>${run.kills || 0}</b>Kills</span>
        </div>
        <h3>Your perks</h3>
        ${owned.length ? `<div class="perk-list">${owned.map(id => {
          const k = PERK_BY_ID[id];
          return `<div class="pl r-${k.rarity}"><canvas class="icon" data-icon="${k.icon}"></canvas><span><b>${k.name}${p.perks[id] > 1 ? ` ×${p.perks[id]}` : ''}</b>${perkDesc(k, p.perks[id])}</span></div>`;
        }).join('')}</div>` : '<p class="sub">No perks yet. Clear a room to get one.</p>'}
        ${(p.relics || []).length ? `<h3>Your relics</h3><div class="perk-list">${p.relics.map(({ id, L }) => {
          const r = RELIC_BY_ID[id];
          return `<div class="pl r-${r.rarity}"><canvas class="icon" data-icon="${r.icon}"></canvas><span><b>${r.name} · level ${L}</b>${r.desc(L)}</span></div>`;
        }).join('')}</div>` : ''}
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
        <p class="sub">${sum.depth ? `Depth ${sum.depth} · ${sum.world.name} · room ${sum.room}/${DEPTH_ROOMS} · deepest ever: ${save.depthBest}`
          : `${sum.world.name}${sum.tier ? ` · ${tierName(sum.tier)}` : ''} · reached room ${sum.room}/${ROOMS_PER_WORLD}`}</p>
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
        <p class="sub">${sum.world.name}${sum.tier ? ` · ${tierName(sum.tier)}` : ''}${sum.bonus > 1 ? ` · first clear bonus +${sum.bonus} gems` : ''}</p>
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
  again: () => {
    goFullscreen();
    if (G.run && G.run.startDepth) startRun(0, null, 0, G.run.startDepth);
    else startRun(G.worldIdx, null, G.tier);
  },
  startDepth: () => { goFullscreen(); startRun(0, null, 0, UI.pickedDepth()); },
  depthPick: d => {
    const starts = depthStarts();
    save.depthPick = starts[clamp(starts.indexOf(UI.pickedDepth()) + +d.d, 0, starts.length - 1)];
    writeSave();
    const row = UI.root.querySelector('.tier-row[data-depth]');
    if (row) row.outerHTML = UI.depthRow();
  },
  upgradeTab: d => UI.upgrades(d.tab),
  quests: () => UI.quests(),
  relics: d => UI.relics(d.tab),
  wearRelic: d => { toggleRelic(d.id); const y = UI.root.scrollTop; UI.relics('relics'); UI.root.scrollTop = y; },
  questTab: d => UI.quests(d.tab),
  claimQuest: d => { claimQuest(d.w === '1', +d.i); Sound.play('coin'); UI.quests(); },
  claimChest: d => { claimChest(d.w === '1'); Sound.play('gem'); UI.quests(); },
  swapQuest: d => { swapQuest(+d.i); UI.quests(); },
  claimAch: d => { claimAchievement(d.id); Sound.play('gem'); const y = UI.root.scrollTop; UI.quests(); UI.root.scrollTop = y; },
  buyMastery: d => {
    const L = masteryLevel(d.id), cost = masteryCost(L);
    if (save.gold < cost) return;
    save.gold -= cost;
    save.mastery[d.id] = L + 1;
    writeSave();
    Sound.play('coin');
    const y = UI.root.scrollTop;
    UI.upgrades('mastery');
    UI.root.scrollTop = y;
  },
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
      // phones stay portrait; tablets may be turned either way
      if (Math.min(screen.width, screen.height) < 600) {
        try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* not supported */ }
      }
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

// The Depths card: the three worlds' floors sinking into the dark round a swirling portal.
function drawDepthsPreview(ctx, w, h, t) {
  const band = w / DEPTH_WORLDS.length;
  DEPTH_WORLDS.forEach((world, i) => {
    ctx.fillStyle = world.theme.floorA;
    ctx.fillRect(i * band, 0, band + 1, h);
  });
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 6, w / 2, h * 0.55, w * 0.55);
  g.addColorStop(0, 'rgba(20,8,40,0.95)');
  g.addColorStop(0.45, 'rgba(30,12,60,0.85)');
  g.addColorStop(1, 'rgba(10,6,24,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h * 0.55);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate(t * (0.6 + i * 0.25) + i);
    ctx.scale(1, 0.42);
    ctx.beginPath(); ctx.arc(0, 0, 14 + i * 9, 0.3, Math.PI * 1.4);
    ctx.strokeStyle = `rgba(192,107,255,${0.85 - i * 0.14})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  glow(ctx, 0, 0, 40, '#c06bff', 0.8);
  ctx.restore();
  const k = h / 80;
  ctx.save();
  ctx.scale(k, k);
  const W = w / k;
  const foes = [fakeEnemy(WORLDS[0].enemies[0], W * 0.18, 56), fakeEnemy(WORLDS[1].enemies[0], W * 0.5, 22), fakeEnemy(WORLDS[2].enemies[0], W * 0.82, 56)];
  for (const e of foes) { drawShadow(ctx, e.x, e.y + e.r * 0.8, e.r); drawEnemy(ctx, e, t); }
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
  if (world.hazards.void) {
    ctx.fillStyle = th.sky; ctx.fillRect(W * 0.58, 58, W * 0.5, 30);
    ctx.fillStyle = th.rock; ctx.fillRect(W * 0.58, 58, W * 0.5, 6);
    for (const [x, y, r] of [[W * 0.7, 76, 5], [W * 0.75, 74, 6], [W * 0.8, 76, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); }
  }
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
