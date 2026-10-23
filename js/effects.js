'use strict';
// Particles, floating numbers, lightning, shock rings and screen shake.

const FONT = "'Lilita One', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif";
const MAX_PARTS = 450;

const FX = {
  parts: [], texts: [], bolts: [], rings: [], shake: 0,

  clear() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.bolts.length = 0;
    this.rings.length = 0;
    this.shake = 0;
  },

  add(p) {
    if (this.parts.length >= MAX_PARTS) this.parts[Math.floor(Math.random() * MAX_PARTS)] = p;
    else this.parts.push(p);
  },

  // Burst of round particles flying outwards.
  burst(x, y, color, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + rand(-(o.spread || 0.6), o.spread || 0.6) : rand(0, TAU);
      const sp = rand(o.min || 40, o.max || 160);
      const life = rand(0.3, o.life || 0.6);
      this.add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life, max: life, size: rand(o.size0 || 1.5, o.size || 3.5),
        color: Array.isArray(color) ? pick(color) : color, drag: o.drag || 3, grav: o.grav || 0,
        type: o.type || 'dot',
      });
    }
  },

  smoke(x, y, color, n, size = 6) {
    for (let i = 0; i < n; i++) {
      const p = {
        x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-25, 25), vy: rand(-40, -5),
        life: rand(0.4, 0.8), size: rand(size * 0.6, size), color, drag: 2, grav: 0, type: 'smoke',
      };
      p.max = p.life;
      this.add(p);
    }
  },

  text(x, y, str, color, size = 12, o = {}) {
    this.texts.push({ x: x + rand(-4, 4), y, str: String(str), color, size, life: o.life || 0.8, max: o.life || 0.8, vy: o.vy || -55, pop: o.pop || 0 });
    if (this.texts.length > 60) this.texts.shift();
  },

  bolt(x1, y1, x2, y2, color = '#ffe55a', w = 2) {
    const pts = [[x1, y1]];
    const n = Math.max(3, Math.floor(dist(x1, y1, x2, y2) / 14));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([lerp(x1, x2, t) + rand(-7, 7), lerp(y1, y2, t) + rand(-7, 7)]);
    }
    pts.push([x2, y2]);
    this.bolts.push({ pts, color, w, life: 0.16, max: 0.16 });
  },

  ring(x, y, r, color, dur = 0.4, w = 4) {
    this.rings.push({ x, y, r, color, life: dur, max: dur, w });
  },

  kick(amount) {
    this.shake = Math.min(14, Math.max(this.shake, amount));
  },

  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if ((this.bolts[i].life -= dt) <= 0) this.bolts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      if ((this.rings[i].life -= dt) <= 0) this.rings.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
  },

  drawBelow(ctx) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * ease.outCubic(k), 0, TAU);
      ctx.strokeStyle = rgba(r.color, 1 - k);
      ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.stroke();
    }
  },

  draw(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.type === 'smoke') {
        ctx.globalAlpha = k * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) {
      const k = b.life / b.max;
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(b.color, k * 0.5);
      ctx.lineWidth = b.w * 3.5;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k})`;
      ctx.lineWidth = b.w;
      ctx.stroke();
    }
  },

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const age = t.max - t.life;
      const pop = age < 0.12 ? 1 + (1 - age / 0.12) * (0.5 + t.pop) : 1;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `${Math.round(t.size * pop)}px ${FONT}`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = OL;
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};
