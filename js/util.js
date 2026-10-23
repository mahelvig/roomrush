'use strict';
// Small math and helper functions shared by every other file.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function weightedPick(list, weight) {
  let total = 0;
  for (const it of list) total += weight(it);
  let r = Math.random() * total;
  for (const it of list) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

// Seeded random numbers (mulberry32) so a room looks the same every time it is redrawn.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  outBack: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

// Colours: '#rrggbb' in, mixed '#rrggbb' out. Cached because art code calls these every frame.
const _rgbCache = new Map();
function hexToRgb(hex) {
  let c = _rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgbCache.set(hex, c);
  }
  return c;
}
const _mixCache = new Map();
function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const key = a + b + Math.round(t * 20);
  let out = _mixCache.get(key);
  if (!out) {
    const q = Math.round(t * 20) / 20;
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * q);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * q);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * q);
    out = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
    _mixCache.set(key, out);
  }
  return out;
}
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function fmt(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return String(n);
}

function roman(n) {
  let out = '';
  for (const [v, s] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
