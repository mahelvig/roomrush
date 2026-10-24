'use strict';
// Sound effects and music made with Web Audio (no sound files).

const Sound = {
  ctx: null, master: null, sfx: null, music: null, noise: null,
  last: {}, track: null, step: 0, nextTime: 0, timer: null,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
    if (this.wanted) this.playMusic(this.wanted);
  },

  applySettings() {
    if (!this.ctx) return;
    this.sfx.gain.value = save.settings.sfx ? 1 : 0;
    this.music.gain.value = save.settings.music ? 0.55 : 0;
  },

  tone(type, f0, f1, dur, vol, when = 0, out = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  },

  hiss(dur, vol, filter, f0, f1, when = 0, q = 1, out = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  play(name) {
    if (!this.ctx || !save.settings.sfx) return;
    const gap = { shoot: 0.06, hit: 0.035, die: 0.04, coin: 0.05, eshoot: 0.07, zap: 0.08, burn: 0.15 }[name] || 0.02;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const S = SFX[name];
    if (S) S(this);
  },

  // ---- music: a tiny step sequencer ----
  playMusic(name) {
    this.wanted = name;
    if (!this.ctx) return;
    if (this.track === name) return;
    this.track = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 60);
  },

  stopMusic() {
    this.wanted = null;
    this.track = null;
  },

  schedule() {
    if (!this.ctx || !this.track) return;
    const tr = TRACKS[this.track];
    const stepDur = 60 / tr.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.playStep(tr, this.step, this.nextTime - this.ctx.currentTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (16 * tr.chords.length);
    }
  },

  playStep(tr, step, when) {
    if (when < 0) return;
    const scale = tr.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const bar = Math.floor(step / 16), s = step % 16;
    const deg = tr.chords[bar];
    const note = i => {
      const d = deg + i;
      return tr.root + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const out = this.music;
    if (s === 0 || s === 8 || (tr.drive && (s === 6 || s === 14))) {
      this.tone(tr.bassWave || 'triangle', hz(note(0) - 24), hz(note(0) - 24), 0.32, 0.22, when, out);
    }
    if (s % 2 === 0) {
      const arp = tr.arp[(s / 2) % tr.arp.length];
      if (arp !== null) this.tone(tr.wave, hz(note(arp) + 12), hz(note(arp) + 12), 0.16, 0.06, when, out);
    }
    if (tr.lead && s % 4 === 0 && (bar + s) % 3 !== 0) {
      const ln = tr.lead[(bar * 4 + s / 4) % tr.lead.length];
      if (ln !== null) this.tone('sine', hz(note(ln) + 24), hz(note(ln) + 24), 0.3, 0.035, when, out);
    }
    if (tr.kick && (s === 0 || s === 8)) this.tone('sine', 120, 40, 0.18, 0.3, when, out);
    if (tr.hat && s % 4 === 2) this.hiss(0.04, 0.05, 'highpass', 7000, 7000, when, 1, out);
  },
};

const TRACKS = {
  menu:    { bpm: 92,  root: 57, mode: 'major', chords: [0, 5, 3, 4], wave: 'triangle', arp: [0, 2, 4, 2, 7, 4, 2, 4], lead: [4, null, 2, 0, 1, null, 2, 4] },
  woods:   { bpm: 108, root: 60, mode: 'major', chords: [0, 4, 5, 3], wave: 'triangle', arp: [0, 2, 4, 7, 4, 2, 4, 2], hat: true, lead: [7, 6, 4, null, 5, 4, 2, null] },
  caverns: { bpm: 116, root: 50, mode: 'minor', chords: [0, 5, 3, 6], wave: 'square', arp: [0, 4, 2, 4, 0, 4, 7, 4], hat: true, kick: true, drive: true, bassWave: 'sawtooth' },
  crypt:   { bpm: 90,  root: 55, mode: 'minor', chords: [0, 3, 5, 4], wave: 'sine', arp: [0, 2, 4, 9, 7, 4, 2, null], hat: true, lead: [4, null, 3, 2, null, 0, 1, null] },
  sky:     { bpm: 100, root: 62, mode: 'major', chords: [0, 3, 5, 4], wave: 'triangle', arp: [0, 4, 7, 9, 7, 4, 2, 4], hat: true, lead: [9, null, 7, 4, null, 5, 4, null] },
  boss:    { bpm: 142, root: 48, mode: 'minor', chords: [0, 0, 5, 6], wave: 'square', arp: [0, 7, 4, 7, 2, 7, 4, 7], hat: true, kick: true, drive: true, bassWave: 'sawtooth' },
};

const SFX = {
  shoot: s => s.hiss(0.06, 0.06, 'bandpass', 3200, 1200, 0, 2),
  orb: s => s.tone('sine', 520, 880, 0.12, 0.06),
  bolt: s => s.tone('square', 1300, 500, 0.05, 0.025),
  hit: s => { s.hiss(0.05, 0.08, 'lowpass', 1800, 600); s.tone('sine', 240, 120, 0.06, 0.06); },
  crit: s => { s.hiss(0.07, 0.1, 'bandpass', 2600, 900, 0, 3); s.tone('square', 900, 400, 0.07, 0.04); },
  eshoot: s => s.tone('sine', 420, 260, 0.09, 0.05),
  die: s => { s.tone('sine', 520, 70, 0.18, 0.12); s.hiss(0.12, 0.06, 'lowpass', 2400, 300); },
  hurt: s => { s.tone('sawtooth', 260, 90, 0.22, 0.12); s.hiss(0.15, 0.1, 'lowpass', 1500, 200); },
  coin: s => { s.tone('sine', 1320, 1320, 0.06, 0.05); s.tone('sine', 1760, 1760, 0.12, 0.05, 0.05); },
  gem: s => { s.tone('sine', 1560, 1560, 0.08, 0.06); s.tone('sine', 2340, 2340, 0.2, 0.05, 0.07); },
  heal: s => [523, 659, 784].forEach((f, i) => s.tone('sine', f, f, 0.18, 0.07, i * 0.07)),
  perk: s => [523, 659, 784, 1047].forEach((f, i) => s.tone('triangle', f, f, 0.22, 0.08, i * 0.06)),
  click: s => s.tone('sine', 700, 900, 0.06, 0.06),
  door: s => { s.hiss(0.6, 0.12, 'bandpass', 300, 1800, 0, 1.5); s.tone('triangle', 220, 440, 0.5, 0.05); },
  clear: s => [659, 784, 988, 1319].forEach((f, i) => s.tone('triangle', f, f, 0.25, 0.08, i * 0.09)),
  boss: s => { s.tone('sawtooth', 70, 45, 1.2, 0.18); s.tone('sawtooth', 105, 60, 1.2, 0.1); s.hiss(1, 0.08, 'lowpass', 800, 100); },
  explode: s => { s.hiss(0.45, 0.22, 'lowpass', 1800, 80); s.tone('sine', 120, 35, 0.35, 0.22); },
  zap: s => { s.hiss(0.12, 0.08, 'highpass', 3000, 6000); s.tone('square', 1800, 200, 0.1, 0.03); },
  burn: s => s.hiss(0.12, 0.04, 'bandpass', 800, 500, 0, 1),
  freeze: s => s.tone('sine', 2200, 1400, 0.15, 0.04),
  dash: s => s.hiss(0.25, 0.1, 'bandpass', 600, 2000, 0, 1),
  slam: s => { s.tone('sine', 140, 35, 0.4, 0.3); s.hiss(0.3, 0.15, 'lowpass', 900, 100); },
  warn: s => s.tone('square', 880, 880, 0.08, 0.03),
  shield: s => s.tone('triangle', 1200, 600, 0.15, 0.07),
  dodge: s => s.hiss(0.12, 0.06, 'highpass', 2500, 5000),
  revive: s => [392, 523, 659, 784, 1047].forEach((f, i) => s.tone('triangle', f, f, 0.35, 0.09, i * 0.08)),
  victory: s => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => s.tone('triangle', f, f, 0.3, 0.09, i * 0.11)),
  lose: s => [392, 349, 311, 262].forEach((f, i) => s.tone('triangle', f, f * 0.98, 0.35, 0.08, i * 0.16)),
  blink: s => s.tone('sine', 300, 1200, 0.15, 0.04),
};
