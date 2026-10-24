'use strict';
// All graphics are drawn in code: heroes, enemies, bosses, shots, pickups and helpers.
// Style: soft cartoon shapes with a dark outline, a highlight and a drop shadow.

const OL = '#22183a';
const ART = { flash: 0, tint: null, tintAmt: 0, alpha: 1 };

function col(c) {
  let out = c;
  if (ART.tint) out = mix(out, ART.tint, ART.tintAmt);
  if (ART.flash > 0) out = mix(out, '#ffffff', ART.flash);
  return out;
}
function fs(ctx, fill, lw = 2) {
  ctx.fillStyle = col(fill);
  ctx.fill();
  if (lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = OL;
    ctx.stroke();
  }
}
function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
function circ(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shine(ctx, x, y, rx, ry, a = 0.5, rot = -0.5) {
  ell(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fill();
}
function line(ctx, x1, y1, x2, y2, color, w) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}
// A line with a dark outline under it (for bows, staffs, legs).
function oline(ctx, x1, y1, x2, y2, color, w) {
  ctx.lineCap = 'round';
  line(ctx, x1, y1, x2, y2, OL, w + 3);
  line(ctx, x1, y1, x2, y2, col(color), w);
}
function eyes(ctx, x, y, gap, r, look, opts = {}) {
  const lx = Math.cos(look) * r * 0.35, ly = Math.sin(look) * r * 0.3;
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    if (opts.white !== false) {
      ell(ctx, ex, y, r, r * (opts.tall || 1.1));
      fs(ctx, opts.white || '#ffffff', 1.5);
    }
    ell(ctx, ex + lx, y + ly, r * (opts.pupil || 0.55), r * (opts.pupil || 0.55) * 1.15);
    ctx.fillStyle = opts.color || OL;
    ctx.fill();
    circ(ctx, ex + lx - r * 0.18, y + ly - r * 0.25, r * 0.18);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (opts.angry) {
      line(ctx, ex - s * r * 1.1, y - r * 1.5, ex + s * r * 0.6, y - r * 0.85, OL, 2);
    }
  }
}
function glowEyes(ctx, x, y, gap, r, color) {
  for (const s of [-1, 1]) {
    ctx.drawImage(glowSprite(color, r * 3), x + s * gap - r * 3, y - r * 3, r * 6, r * 6);
    ell(ctx, x + s * gap, y, r, r * 0.8);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}
function crown(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-8, 3); ctx.lineTo(-9, -6); ctx.lineTo(-4.5, -1.5); ctx.lineTo(0, -8);
  ctx.lineTo(4.5, -1.5); ctx.lineTo(9, -6); ctx.lineTo(8, 3); ctx.closePath();
  fs(ctx, '#ffcf3f', 1.8);
  circ(ctx, 0, -1, 1.6); fs(ctx, '#ff4f6d', 1);
  ctx.restore();
}

// Soft round glow, cached per colour and size.
const _glow = new Map();
function glowSprite(color, r) {
  const size = Math.max(4, Math.round(r));
  const key = color + size;
  let cv = _glow.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    const px = size * 4;
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    grd.addColorStop(0, rgba(color, 0.75));
    grd.addColorStop(0.35, rgba(color, 0.35));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, px, px);
    _glow.set(key, cv);
  }
  return cv;
}
function glow(ctx, x, y, r, color, a = 1) {
  if (a < 1) ctx.globalAlpha *= a;
  ctx.drawImage(glowSprite(color, r / 2), x - r, y - r, r * 2, r * 2);
  if (a < 1) ctx.globalAlpha /= a;
}

function drawShadow(ctx, x, y, rx, a = 0.22) {
  ell(ctx, x, y, rx, rx * 0.38);
  ctx.fillStyle = `rgba(10,5,25,${a})`;
  ctx.fill();
}

// ---------------- heroes ----------------

function drawHero(ctx, hero, st) {
  const P = hero.pal;
  const aim = st.aim;
  const sx = Math.cos(aim) >= 0 ? 1 : -1;
  const bob = st.moving ? Math.abs(Math.sin(st.walk * 2)) * 2.2 : Math.sin(st.t * 2.5) * 0.7;
  const leg = st.moving ? Math.sin(st.walk * 2) * 3.4 : 0;
  const behind = Math.sin(aim) < -0.35;

  ell(ctx, -4 + leg * 0.7, 8.5, 3.6, 2.7); fs(ctx, '#4a3626', 1.6);
  ell(ctx, 4 - leg * 0.7, 8.5, 3.6, 2.7); fs(ctx, '#4a3626', 1.6);

  ctx.save();
  ctx.translate(0, -bob);
  if (behind) drawHeroWeapon(ctx, hero, st, sx);

  // cape
  if (hero.weapon !== 'blaster' && hero.weapon !== 'bomb') {
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(-sx * 12, 4 + Math.sin(st.t * 6) * 1.5, -sx * 8, 9);
    ctx.lineTo(sx * 2, 8);
    ctx.closePath();
    fs(ctx, P.dark, 1.8);
  }
  // body
  ell(ctx, 0, 2, 8, 7.4); fs(ctx, P.main);
  ell(ctx, 0, 5, 7.2, 1.8); fs(ctx, P.accent, 1.4);
  shine(ctx, -3, -1, 2.5, 1.6, 0.35);
  if (hero.weapon === 'bomb') oline(ctx, -5, -4, 5, 6, '#6e4a2c', 1.8);   // the strap of the bomb bag

  // head
  if (hero.weapon === 'bow') {
    circ(ctx, 0, -10.5, 9.8); fs(ctx, P.main);
    ctx.beginPath();
    ctx.moveTo(-sx * 6, -18); ctx.quadraticCurveTo(-sx * 14, -16, -sx * 13, -7); ctx.lineTo(-sx * 7, -12); ctx.closePath();
    fs(ctx, P.main, 1.8);
    circ(ctx, sx * 1.4, -9, 7); fs(ctx, P.skin, 1.6);
    ctx.beginPath();
    ctx.arc(sx * 1.4, -11, 7.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fillStyle = col(P.hair); ctx.fill();
    shine(ctx, -3, -16, 3, 1.6, 0.35);
  } else if (hero.weapon === 'boomerang') {
    circ(ctx, 0, -10, 8.6); fs(ctx, P.skin);
    // windswept white hair and a scarf blowing back
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.quadraticCurveTo(-8, -21, 2, -20); ctx.quadraticCurveTo(-sx * 14, -24 + Math.sin(st.t * 7), -sx * 15, -14);
    ctx.quadraticCurveTo(-sx * 10, -15, -9, -10);
    fs(ctx, P.hair, 1.6);
    rrect(ctx, -9, -15, 18, 3.6, 1.8); fs(ctx, P.main, 1.4);
    ctx.beginPath(); ctx.moveTo(-sx * 6, -13.5); ctx.quadraticCurveTo(-sx * 15, -12 + Math.sin(st.t * 8) * 2, -sx * 19, -9 + Math.sin(st.t * 9) * 2);
    ctx.lineTo(-sx * 15, -11); ctx.closePath();
    fs(ctx, P.main, 1.4);
  } else if (hero.weapon === 'bomb') {
    circ(ctx, 0, -10, 8.6); fs(ctx, P.skin);
    // a short beard, and a hard hat with the goggles pushed up on it
    ctx.beginPath(); ctx.moveTo(-5.5 + sx, -6); ctx.quadraticCurveTo(sx, 0, 5.5 + sx, -6); ctx.quadraticCurveTo(sx, -3.4, -5.5 + sx, -6);
    fs(ctx, P.hair, 1.2);
    ctx.beginPath(); ctx.arc(0, -12, 9.3, Math.PI, 0); ctx.closePath(); fs(ctx, P.accent, 1.8);
    rrect(ctx, -12, -13.2, 24, 3.2, 1.6); fs(ctx, darken(P.accent, 0.2), 1.4);
    for (const s of [-1, 1]) { circ(ctx, s * 3.4 + sx, -17, 2.6); fs(ctx, '#9ad0f7', 1.3); }
    shine(ctx, -4, -18.5, 2.6, 1.2, 0.4);
  } else if (hero.weapon === 'staff') {
    circ(ctx, 0, -10, 8.6); fs(ctx, P.skin);
    ctx.beginPath();
    ctx.moveTo(-8, -11); ctx.quadraticCurveTo(-10, -2, -7, 2); ctx.lineTo(-5, -9); ctx.closePath();
    ctx.moveTo(8, -11); ctx.quadraticCurveTo(10, -2, 7, 2); ctx.lineTo(5, -9); ctx.closePath();
    fs(ctx, P.hair, 1.6);
    // wizard hat
    ctx.beginPath();
    ctx.moveTo(-12, -14);
    ctx.quadraticCurveTo(0, -18, 12, -14);
    ctx.quadraticCurveTo(4, -17, 2, -22);
    ctx.quadraticCurveTo(-1 - sx * 4, -30, -sx * 9, -33 + Math.sin(st.t * 3));
    ctx.quadraticCurveTo(-4, -24, -5, -17);
    ctx.closePath();
    fs(ctx, P.main);
    ell(ctx, 0, -14.5, 12, 2.8); fs(ctx, P.dark, 1.6);
    star(ctx, -1, -21, 2.6, P.accent);
  } else {
    circ(ctx, 0, -10, 8.8); fs(ctx, P.skin);
    ctx.beginPath();
    ctx.arc(0, -11, 9.2, Math.PI, 0);
    ctx.lineTo(sx * 12, -11);
    ctx.lineTo(-sx * 2, -11);
    fs(ctx, P.main, 1.8);
    rrect(ctx, -8, -16, 16, 4, 2); fs(ctx, '#5a4a40', 1.5);
    circ(ctx, -3.5 + sx, -14, 2.8); fs(ctx, P.accent, 1.4);
    circ(ctx, 3.5 + sx, -14, 2.8); fs(ctx, P.accent, 1.4);
  }
  // eyes
  const ex = Math.cos(aim) * 1.8, ey = Math.sin(aim) * 1.1;
  for (const s of [-1, 1]) {
    ell(ctx, s * 3.1 + ex + sx * 1, -8.5 + ey, 1.45, 2);
    ctx.fillStyle = P.eye; ctx.fill();
    circ(ctx, s * 3.1 + ex + sx * 1 - 0.4, -9.3 + ey, 0.55);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  if (!behind) drawHeroWeapon(ctx, hero, st, sx);
  ctx.restore();
}

function star(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  ctx.closePath();
  fs(ctx, color, 1.2);
}

function drawHeroWeapon(ctx, hero, st, sx) {
  const P = hero.pal;
  ctx.save();
  ctx.translate(sx * 2, -1);
  ctx.rotate(st.aim);
  ctx.translate(9 - st.recoil * 3.5, 0);
  if (hero.weapon === 'bow') {
    const pull = st.ready ? 4 : 1 + st.recoil * 0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-3, 0, 9, -1.15, 1.15);
    ctx.strokeStyle = OL; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2.6; ctx.stroke();
    const tx = -3 + Math.cos(1.15) * 9, ty = Math.sin(1.15) * 9;
    ctx.beginPath();
    ctx.moveTo(tx, -ty); ctx.lineTo(-pull, 0); ctx.lineTo(tx, ty);
    ctx.strokeStyle = '#f8f0e0'; ctx.lineWidth = 1; ctx.stroke();
    if (st.ready) {
      oline(ctx, -pull, 0, 9, 0, '#e8d2a8', 1.6);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(8, -2.5); ctx.lineTo(8, 2.5); ctx.closePath();
      fs(ctx, '#dfe6f0', 1.2);
    }
  } else if (hero.weapon === 'staff') {
    // undo the aim rotation: the staff stays upright beside the mage and leans towards the target
    ctx.restore();
    ctx.save();
    ctx.translate(sx * 10, 2);
    ctx.rotate(Math.cos(st.aim) * 0.35 - st.recoil * 0.15 * sx);
    oline(ctx, 0, 9, 0, -15, '#8a5a36', 2.6);
    glow(ctx, 0, -18, 12 + st.recoil * 10, P.accent);
    ell(ctx, 0, -18, 3.6, 4.6); fs(ctx, P.accent, 1.6);
    shine(ctx, -1, -19.5, 1.2, 1.8, 0.7, 0);
  } else if (hero.weapon === 'bomb') {
    if (st.ready || st.recoil < 0.3) {   // a bomb in the hand, fuse lit, when not just thrown
      circ(ctx, 2, 0, 5.2); fs(ctx, '#3a3f4a', 1.6);
      shine(ctx, 0.4, -1.8, 1.6, 1.1, 0.5);
      line(ctx, 4.5, -4, 6.8, -7.2, '#c9a46a', 1.4);
      glow(ctx, 7, -7.6, 6, '#ffcf3f', 0.9);
    }
  } else if (hero.weapon === 'boomerang') {
    if (st.ready || st.recoil < 0.3) {   // in the hand when not just thrown
      ctx.rotate(-0.5 + st.recoil);
      ctx.beginPath(); ctx.moveTo(-2, -7); ctx.quadraticCurveTo(5, -4, 7, 0); ctx.quadraticCurveTo(5, 4, -2, 7);
      ctx.lineTo(1, 7); ctx.quadraticCurveTo(9, 4, 10, 0); ctx.quadraticCurveTo(9, -4, 1, -7); ctx.closePath();
      fs(ctx, P.accent, 1.6);
    }
  } else {
    rrect(ctx, -4, -3.5, 13, 7, 2.5); fs(ctx, '#5a6478', 1.8);
    rrect(ctx, 7, -2.2, 6, 4.4, 1.5); fs(ctx, '#3a4050', 1.5);
    rrect(ctx, -2, -1.5, 7, 3, 1.2); fs(ctx, P.accent, 1);
    if (st.recoil > 0.3) glow(ctx, 15, 0, 10, P.accent, st.recoil);
  }
  ctx.restore();
}

// ---------------- enemies ----------------

const ENEMY_ART = {
  slime(ctx, e, t) {
    const P = e.pal;
    const sq = e.squash || 0;
    ctx.scale(1 + sq * 0.22, 1 - sq * 0.22);
    ctx.beginPath();
    ctx.moveTo(-13, 7);
    ctx.bezierCurveTo(-15, -6, -7, -14, 0, -14);
    ctx.bezierCurveTo(7, -14, 15, -6, 13, 7);
    ctx.quadraticCurveTo(0, 11, -13, 7);
    fs(ctx, P.main);
    ctx.beginPath();
    ctx.moveTo(-11, 5); ctx.quadraticCurveTo(0, 9, 11, 5); ctx.quadraticCurveTo(0, 7, -11, 5);
    ctx.fillStyle = col(P.dark); ctx.fill();
    shine(ctx, -5, -7, 3.6, 2.2, 0.55);
    circ(ctx, 5, -9, 1.1); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    eyes(ctx, 0, -2, 4.3, 2.7, e.look, { angry: e.def.elite });
    ctx.beginPath(); ctx.arc(0, 3, 2.2, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = OL; ctx.lineWidth = 1.5; ctx.stroke();
    if (e.def.elite) crown(ctx, 0, -14, 0.9);
  },

  bat(ctx, e, t) {
    const P = e.pal;
    const flap = Math.sin(t * 18 + e.seed) * 5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 5, -2);
      ctx.quadraticCurveTo(s * 13, -10 - flap, s * 19, -4 - flap);
      ctx.quadraticCurveTo(s * 16, 0 - flap * 0.4, s * 17, 4 - flap * 0.2);
      ctx.quadraticCurveTo(s * 13, 1, s * 11, 5);
      ctx.quadraticCurveTo(s * 8, 2, s * 5, 4);
      ctx.closePath();
      fs(ctx, P.dark, 1.8);
    }
    circ(ctx, 0, 0, 7.5); fs(ctx, P.main);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 2, -6); ctx.lineTo(s * 5.5, -11); ctx.lineTo(s * 6, -4); ctx.closePath();
      fs(ctx, P.main, 1.5);
    }
    shine(ctx, -2.5, -3.5, 2.4, 1.4, 0.45);
    eyes(ctx, 0, -1, 2.8, 1.7, e.look, { white: '#fff36b', angry: true, pupil: 0.45 });
    ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(-1.2, 5.5); ctx.lineTo(-0.4, 3);
    ctx.moveTo(2, 3); ctx.lineTo(1.2, 5.5); ctx.lineTo(0.4, 3);
    ctx.fillStyle = '#fff'; ctx.fill();
    if (e.def.fire) glow(ctx, 0, 0, 16, P.light, 0.4 + Math.sin(t * 8) * 0.15);
  },

  mushroom(ctx, e, t) {
    const P = e.pal;
    const puff = e.puff || 0;
    rrect(ctx, -6.5, -3, 13, 13, 5); fs(ctx, P.light);
    eyes(ctx, 0, 3, 2.8, 1.8, e.look, { angry: true });
    ctx.save();
    ctx.translate(0, -3);
    ctx.scale(1 + puff * 0.15, 1 - puff * 0.12);
    ctx.beginPath();
    ctx.moveTo(-15, 1);
    ctx.bezierCurveTo(-15, -13, 15, -13, 15, 1);
    ctx.quadraticCurveTo(0, 5, -15, 1);
    fs(ctx, P.main);
    for (const [x, y, r] of [[-8, -3, 2.4], [1, -7, 3], [8, -2, 2.1], [-2, -1, 1.5]]) {
      ell(ctx, x, y, r, r * 0.8); ctx.fillStyle = col('#fff4e6'); ctx.fill();
    }
    shine(ctx, -6, -8, 3.6, 1.8, 0.35);
    ctx.restore();
  },

  goblin(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const bob = Math.sin(t * 8 + e.seed) * (e.moving ? 1.4 : 0.4);
    ell(ctx, -4, 9, 3.4, 2.4); fs(ctx, '#3c2a1e', 1.5);
    ell(ctx, 4, 9, 3.4, 2.4); fs(ctx, '#3c2a1e', 1.5);
    ctx.translate(0, -bob);
    ell(ctx, 0, 3, 7.5, 7); fs(ctx, P.light);
    line(ctx, -6, 1, 6, 5, darken(P.light, 0.3), 2);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 6, -11); ctx.lineTo(s * 16, -14); ctx.lineTo(s * 7, -6); ctx.closePath();
      fs(ctx, P.main, 1.6);
    }
    circ(ctx, 0, -8, 8); fs(ctx, P.main);
    shine(ctx, -3, -12, 2.6, 1.5, 0.35);
    eyes(ctx, sx, -8, 3.2, 1.9, e.look, { white: '#fff36b', angry: true });
    ctx.beginPath(); ctx.moveTo(-3 + sx, -3); ctx.lineTo(3 + sx, -3);
    ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.stroke();
    if (e.def.elite) {
      ctx.beginPath(); ctx.arc(0, -10, 8.8, Math.PI, 0); fs(ctx, '#8a8f9e', 1.8);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 7, -14); ctx.quadraticCurveTo(s * 14, -18, s * 13, -25); ctx.quadraticCurveTo(s * 10, -18, s * 4, -16);
        fs(ctx, '#f3e6c8', 1.5);
      }
    }
    ctx.save();
    ctx.rotate(e.look);
    ctx.translate(9, 1);
    ctx.beginPath(); ctx.arc(-3, 0, 8, -1.1, 1.1);
    ctx.strokeStyle = OL; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.strokeStyle = col('#8b5a2b'); ctx.lineWidth = 2.2; ctx.stroke();
    const pull = e.state === 'aim' ? 4 : 0.5;
    ctx.beginPath(); ctx.moveTo(0.6, -7.1); ctx.lineTo(-pull, 0); ctx.lineTo(0.6, 7.1);
    ctx.strokeStyle = '#f8f0e0'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  },

  boar(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const shake = e.state === 'windup' ? Math.sin(t * 60) * 1.2 : 0;
    ctx.translate(shake, 0);
    ctx.scale(sx, 1);
    const step = e.state === 'dash' ? Math.sin(t * 40) * 3 : Math.sin(t * 10 + e.seed) * (e.moving ? 2 : 0);
    for (const [x, ph] of [[-9, 1], [-3, -1], [5, 1], [10, -1]]) {
      rrect(ctx, x - 2, 5 + step * ph * 0.4, 4, 7, 1.5); fs(ctx, P.dark, 1.5);
    }
    ell(ctx, 0, 0, 15, 10.5); fs(ctx, P.main);
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const x = -11 + i * 3.4;
      ctx.lineTo(x, -8 + (i % 2 ? -4 : 0));
    }
    ctx.lineTo(10, -6); ctx.lineTo(-11, -6); ctx.closePath();
    fs(ctx, P.dark, 1.5);
    shine(ctx, -4, -4, 5, 2, 0.25);
    ell(ctx, 14, 2, 5.5, 4.5); fs(ctx, '#e8a59a', 1.8);
    circ(ctx, 15.2, 1.2, 0.9); ctx.fillStyle = OL; ctx.fill();
    circ(ctx, 15.2, 3.6, 0.9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, 5); ctx.quadraticCurveTo(14, 10, 17, 4); ctx.quadraticCurveTo(14, 7, 11, 3); ctx.closePath();
    fs(ctx, P.light, 1.3);
    ell(ctx, 7, -2.5, 2, 2.4); fs(ctx, '#fff', 1.2);
    circ(ctx, 7.6, -2.2, 1.1); ctx.fillStyle = e.state === 'windup' ? '#ff3b3b' : OL; ctx.fill();
    line(ctx, 4.5, -6, 9.5, -4.5, OL, 1.6);
    ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(4, -15); ctx.lineTo(6, -8); ctx.closePath();
    fs(ctx, P.dark, 1.5);
    if (e.def.elite) {
      for (const x of [-8, -2, 4]) {
        ctx.beginPath(); ctx.moveTo(x - 2, -9); ctx.lineTo(x, -16); ctx.lineTo(x + 2, -9); ctx.closePath();
        fs(ctx, '#e8e2d0', 1.2);
      }
    }
  },

  stump(ctx, e, t) {
    const P = e.pal;
    const sway = Math.sin(t * 3 + e.seed) * 1.5;
    rrect(ctx, -13, -10, 26, 22, 7); fs(ctx, P.main);
    line(ctx, -7, -6, -8, 8, darken(P.main, 0.25), 1.6);
    line(ctx, 8, -5, 7, 9, darken(P.main, 0.25), 1.6);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 12, 7); ctx.quadraticCurveTo(s * 17, 10, s * 18, 13); ctx.lineTo(s * 10, 12); ctx.closePath();
      fs(ctx, P.main, 1.6);
    }
    ell(ctx, 0, -10, 13, 4.5); fs(ctx, lighten(P.main, 0.3), 1.8);
    ell(ctx, 0, -10, 8, 2.6); ctx.strokeStyle = darken(P.main, 0.1); ctx.lineWidth = 1; ctx.stroke();
    ell(ctx, 0, -10, 3.5, 1.2); ctx.stroke();
    for (const [x, y, r] of [[-7 + sway, -15, 5], [2 + sway, -18, 6], [8 + sway, -14, 4.5]]) {
      circ(ctx, x, y, r); fs(ctx, P.light, 1.6);
    }
    shine(ctx, 0 + sway, -20, 2.6, 1.4, 0.4);
    glowEyes(ctx, 0, -1, 5, 2.3, '#ffe066');
    ctx.beginPath(); ctx.arc(0, 6, 3.2, Math.PI + 0.3, -0.3);
    ctx.strokeStyle = OL; ctx.lineWidth = 1.8; ctx.stroke();
  },

  imp(ctx, e, t) {
    const P = e.pal;
    const flap = Math.sin(t * 16 + e.seed) * 4;
    const hover = Math.sin(t * 4 + e.seed) * 1.5;
    ctx.translate(0, hover);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 4, -2);
      ctx.quadraticCurveTo(s * 12, -12 - flap, s * 16, -6 - flap);
      ctx.quadraticCurveTo(s * 11, -3, s * 12, 2);
      ctx.quadraticCurveTo(s * 8, 0, s * 5, 3);
      ctx.closePath();
      fs(ctx, P.dark, 1.6);
    }
    ctx.beginPath(); ctx.moveTo(-2, 8);
    ctx.quadraticCurveTo(-6, 15, 2, 15 + Math.sin(t * 5) * 2);
    ctx.strokeStyle = OL; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = col(P.main); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(6, 15); ctx.lineTo(2, 18); ctx.closePath(); fs(ctx, P.main, 1.2);
    circ(ctx, 0, 0, 8.5); fs(ctx, P.main);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 3, -7); ctx.quadraticCurveTo(s * 7, -12, s * 9, -14); ctx.lineTo(s * 6.5, -6); ctx.closePath();
      fs(ctx, '#f6e7c8', 1.4);
    }
    shine(ctx, -3, -4, 2.8, 1.6, 0.4);
    eyes(ctx, 0, -1, 3.2, 1.9, e.look, { white: P.light, angry: true, pupil: 0.45 });
    ctx.beginPath(); ctx.arc(0, 3, 3.4, 0.2, Math.PI - 0.2);
    ctx.fillStyle = OL; ctx.fill();
    if (e.def.elite) crown(ctx, 0, -10, 0.85);
  },

  slug(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const wob = Math.sin(t * 6 + e.seed);
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.moveTo(-16, 7);
    ctx.quadraticCurveTo(-14 - wob, -6, 0, -8);
    ctx.quadraticCurveTo(13, -9, 14, 1);
    ctx.quadraticCurveTo(14, 8, 6, 8);
    ctx.closePath();
    fs(ctx, P.dark);
    ctx.beginPath();
    ctx.moveTo(-12, 3); ctx.quadraticCurveTo(-8, -4, 0, -5); ctx.quadraticCurveTo(9, -5, 11, 2);
    ctx.strokeStyle = col(P.main); ctx.lineWidth = 3; ctx.stroke();
    glow(ctx, 0, 0, 22, P.main, 0.5 + wob * 0.1);
    for (const [x, y] of [[-6, 1], [2, -1], [7, 3]]) {
      circ(ctx, x, y, 1.6); ctx.fillStyle = col(P.light); ctx.fill();
    }
    for (const a of [-0.5, 0.2]) {
      const ex = 9 + Math.cos(a - 1.2) * 9, ey = -6 + Math.sin(a - 1.2) * 9;
      oline(ctx, 9, -5, ex, ey, P.dark, 1.6);
      circ(ctx, ex, ey, 2.4); fs(ctx, '#fff', 1.3);
      circ(ctx, ex + 0.6, ey, 1.1); ctx.fillStyle = OL; ctx.fill();
    }
  },

  scorpion(ctx, e, t) {
    const P = e.pal;
    ctx.rotate(e.look + Math.PI / 2);
    const step = Math.sin(t * 20 + e.seed) * (e.moving || e.state === 'dash' ? 2 : 0);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = -2 + i * 4;
      oline(ctx, s * 6, y, s * 12, y + 3 + (i % 2 ? step : -step) * s, P.dark, 1.4);
    }
    for (const s of [-1, 1]) {
      oline(ctx, s * 5, -7, s * 9, -13, P.main, 2.2);
      ctx.beginPath(); ctx.arc(s * 9, -16, 4, 0, TAU); fs(ctx, P.main, 1.6);
      ctx.beginPath(); ctx.moveTo(s * 9, -16); ctx.lineTo(s * 9 - s * 3, -21); ctx.lineTo(s * 9 + s * 1, -19); ctx.closePath();
      ctx.fillStyle = OL; ctx.fill();
    }
    ell(ctx, 0, 1, 7, 9); fs(ctx, P.main);
    for (const y of [-2, 2, 6]) line(ctx, -5, y, 5, y, darken(P.main, 0.3), 1.2);
    const curl = e.state === 'windup' ? 2 : 0;
    let px = 0, py = 9;
    for (let i = 0; i < 4; i++) {
      const nx = Math.sin(i * 0.5) * 2, ny = 12 + i * 3.5 - curl;
      circ(ctx, nx, ny, 3.4 - i * 0.3); fs(ctx, P.main, 1.4);
      px = nx; py = ny;
    }
    ctx.beginPath(); ctx.moveTo(px - 3, py + 2); ctx.lineTo(px, py + 8); ctx.lineTo(px + 3, py + 2); ctx.closePath();
    fs(ctx, P.light, 1.3);
    eyes(ctx, 0, -6, 2.4, 1.3, -Math.PI / 2, { white: '#ffef8a', pupil: 0.5 });
  },

  salamander(ctx, e, t) {
    const P = e.pal;
    ctx.rotate(e.look + Math.PI / 2);
    const wag = Math.sin(t * 8 + e.seed) * 4;
    ctx.beginPath();
    ctx.moveTo(-3, 8); ctx.quadraticCurveTo(wag, 16, -wag * 0.5, 24); ctx.quadraticCurveTo(wag + 2, 16, 3, 8);
    fs(ctx, P.main, 1.6);
    const leg = Math.sin(t * 12 + e.seed) * (e.moving ? 3 : 0);
    for (const s of [-1, 1]) {
      oline(ctx, s * 5, -3, s * 11, -6 + leg * s, P.dark, 1.8);
      oline(ctx, s * 5, 6, s * 11, 9 - leg * s, P.dark, 1.8);
    }
    ell(ctx, 0, 2, 7, 10); fs(ctx, P.main);
    for (const [x, y] of [[-2, 0], [3, 4], [-1, 7]]) { circ(ctx, x, y, 1.6); ctx.fillStyle = col(P.dark); ctx.fill(); }
    ell(ctx, 0, -9, 6, 6.5); fs(ctx, P.main);
    shine(ctx, -2, -11, 2, 1.2, 0.4);
    eyes(ctx, 0, -11, 3.8, 1.7, -Math.PI / 2, { white: '#ffef8a', pupil: 0.5 });
    if (e.state === 'aim') glow(ctx, 0, -16, 12, '#ffb02e', 0.8);
  },

  golem(ctx, e, t) {
    const P = e.pal;
    const lift = e.state === 'crouch' ? 2 : 0;
    for (const s of [-1, 1]) {
      const ay = e.state === 'air' ? -10 : e.state === 'crouch' ? -2 : 2;
      ell(ctx, s * 16, ay, 5.5, 6.5); fs(ctx, P.main);
    }
    ctx.beginPath();
    ctx.moveTo(-15, 8 + lift);
    ctx.lineTo(-17, -4); ctx.lineTo(-11, -14); ctx.lineTo(-2, -17); ctx.lineTo(9, -15); ctx.lineTo(16, -6); ctx.lineTo(15, 8 + lift);
    ctx.quadraticCurveTo(0, 13 + lift, -15, 8 + lift);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, P.main, 2.2);
    ctx.beginPath();
    ctx.moveTo(-12, 7); ctx.lineTo(-13, -3); ctx.lineTo(-8, -11); ctx.lineTo(1, -13);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 9); ctx.lineTo(-3, 3); ctx.lineTo(-6, -2);
    ctx.moveTo(5, 8); ctx.lineTo(8, 2); ctx.lineTo(5, -4); ctx.lineTo(9, -9);
    ctx.strokeStyle = col(P.light); ctx.lineWidth = 1.8; ctx.stroke();
    glowEyes(ctx, 0, -6, 5, 2.4, P.light);
  },

  skeleton(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const step = Math.sin(t * 10 + e.seed) * (e.moving ? 3 : 0);
    oline(ctx, -3, 4, -4 + step, 11, P.main, 2);
    oline(ctx, 3, 4, 4 - step, 11, P.main, 2);
    ell(ctx, 0, 1, 6, 6.5); fs(ctx, P.dark, 1.8);
    for (const y of [-2, 1, 4]) line(ctx, -4.5, y, 4.5, y, col(P.main), 1.6);
    line(ctx, 0, -4, 0, 6, col(P.main), 1.6);
    if (e.def.knight) {
      rrect(ctx, -sx * 15, -6, 10, 15, 3); fs(ctx, '#6f7f9c', 1.8);
      circ(ctx, -sx * 10, 1.5, 2.2); fs(ctx, '#ffcf3f', 1.2);
    }
    circ(ctx, 0, -9, 8); fs(ctx, P.main);
    rrect(ctx, -4.5, -4, 9, 4.5, 1.8); fs(ctx, P.main, 1.6);
    for (const x of [-2, 0, 2]) line(ctx, x, -3.6, x, -0.2, OL, 0.9);
    for (const s of [-1, 1]) {
      ell(ctx, s * 3.2 + sx * 0.6, -9.5, 2.5, 2.8); ctx.fillStyle = OL; ctx.fill();
      glow(ctx, s * 3.2 + sx * 0.6, -9.5, 5, P.light);
      circ(ctx, s * 3.2 + sx * 0.6, -9.5, 0.9); ctx.fillStyle = col(P.light); ctx.fill();
    }
    shine(ctx, -3, -14, 2.4, 1.3, 0.5);
    if (e.def.knight) {
      ctx.beginPath(); ctx.arc(0, -10, 8.8, Math.PI * 0.95, Math.PI * 2.05); fs(ctx, '#6f7f9c', 1.8);
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.quadraticCurveTo(5, -25, 9, -22); ctx.quadraticCurveTo(5, -21, 1, -17);
      fs(ctx, '#e0485a', 1.4);
    }
    ctx.save();
    ctx.rotate(e.look);
    if (e.def.bow) {
      ctx.translate(9, 0);
      ctx.beginPath(); ctx.arc(-3, 0, 8, -1.1, 1.1);
      ctx.strokeStyle = OL; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = col(P.dark); ctx.lineWidth = 2.2; ctx.stroke();
      const pull = e.state === 'aim' ? 4 : 0.5;
      ctx.beginPath(); ctx.moveTo(0.6, -7.1); ctx.lineTo(-pull, 0); ctx.lineTo(0.6, 7.1);
      ctx.strokeStyle = '#f8f0e0'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.translate(8, 3);
      ctx.rotate(-0.6 + Math.sin(t * 6 + e.seed) * 0.2);
      oline(ctx, 0, 0, 14, 0, '#c9d2e0', 2.4);
      oline(ctx, 2, -3.5, 2, 3.5, '#8a6a4a', 1.8);
    }
    ctx.restore();
  },

  ghost(ctx, e, t) {
    const P = e.pal;
    const hover = Math.sin(t * 3 + e.seed) * 2;
    ctx.translate(0, hover - 3);
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.bezierCurveTo(-11, -18, 11, -18, 11, 0);
    for (let i = 0; i <= 4; i++) {
      const x = 11 - i * 5.5, y = 10 + Math.sin(t * 6 + i * 1.6) * 2.5 + (i % 2 ? -3 : 0);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    fs(ctx, P.main);
    shine(ctx, -4, -9, 3.4, 2, 0.6);
    for (const s of [-1, 1]) {
      ell(ctx, s * 3.8 + Math.cos(e.look) * 1.2, -4 + Math.sin(e.look), 2, 3); ctx.fillStyle = OL; ctx.fill();
    }
    ell(ctx, 0, 2.5, 2.1, 2.6); ctx.fillStyle = OL; ctx.fill();
    ctx.globalAlpha /= 0.9;
  },

  wisp(ctx, e, t) {
    const P = e.pal;
    const fuse = e.state === 'fuse';
    const pulse = fuse ? 1 + Math.sin(t * 40) * 0.15 + (1 - e.t / 0.6) * 0.3 : 1 + Math.sin(t * 5 + e.seed) * 0.05;
    ctx.scale(pulse, pulse);
    glow(ctx, 0, 0, 26, fuse ? '#ffffff' : P.main, 0.7);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + t * 1.5;
      const r = i % 2 ? 7.5 : 12;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    fs(ctx, fuse && Math.sin(t * 40) > 0 ? '#ffffff' : P.main, 1.8);
    circ(ctx, 0, 0, 6.5); fs(ctx, P.light, 1.4);
    eyes(ctx, 0, -0.5, 2.4, 1.4, e.look, { white: false, color: OL, pupil: 0.9, angry: true });
  },

  mage(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const hover = Math.sin(t * 3 + e.seed) * 1;
    ctx.translate(0, hover);
    ctx.beginPath();
    ctx.moveTo(-10, 11); ctx.quadraticCurveTo(-8, -4, 0, -6); ctx.quadraticCurveTo(8, -4, 10, 11);
    ctx.quadraticCurveTo(0, 14, -10, 11);
    fs(ctx, P.main);
    line(ctx, 0, -3, 0, 11, col(P.dark), 1.6);
    ctx.save();
    ctx.translate(sx * 11, 0);
    oline(ctx, 0, 12, 0, -14, '#6a4a3a', 2.2);
    const charging = e.state === 'cast';
    glow(ctx, 0, -17, charging ? 22 : 12, P.light);
    ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(3.5, -17); ctx.lineTo(0, -11); ctx.lineTo(-3.5, -17); ctx.closePath();
    fs(ctx, P.light, 1.5);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-9, -6); ctx.quadraticCurveTo(-9, -20, 0, -21); ctx.quadraticCurveTo(9, -20, 9, -6);
    ctx.quadraticCurveTo(0, -2, -9, -6);
    fs(ctx, P.dark);
    ell(ctx, sx * 0.5, -10, 5.5, 4.5); ctx.fillStyle = '#120c22'; ctx.fill();
    glowEyes(ctx, sx * 0.5, -10, 2.4, 1.2, P.light);
    if (e.def.elite) {
      ctx.beginPath(); ctx.moveTo(-12, -17); ctx.lineTo(12, -17); ctx.lineTo(sx * -2, -36); ctx.closePath();
      fs(ctx, P.dark, 1.8);
      star(ctx, 0, -24, 2.5, P.light);
    }
  },

  yeti(ctx, e, t) {
    const P = e.pal;
    const up = e.state === 'air' || e.state === 'crouch';
    const breathe = Math.sin(t * 3 + e.seed) * 0.6;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 13, -2);
      ctx.rotate(s * (up ? -2.2 : -0.3));
      ell(ctx, 0, 7, 5, 9); fs(ctx, P.main);
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * TAU;
      const r = 15 + (i % 2 ? 1.6 : 0) + breathe;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.95 - 1);
    }
    ctx.closePath();
    fs(ctx, P.main);
    shine(ctx, -6, -8, 4, 2.2, 0.5);
    ell(ctx, 0, -3, 9, 7.5); fs(ctx, P.light, 1.8);
    eyes(ctx, 0, -5, 3.5, 2, e.look, { angry: true });
    ctx.beginPath(); ctx.ellipse(0, 1, 4, up ? 3 : 1.6, 0, 0, TAU);
    ctx.fillStyle = OL; ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 2.5, 0); ctx.lineTo(s * 1.5, 2.5); ctx.lineTo(s * 0.8, 0);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 7, -13); ctx.quadraticCurveTo(s * 12, -20, s * 9, -24); ctx.quadraticCurveTo(s * 8, -18, s * 3, -15);
      fs(ctx, '#d9cdb5', 1.5);
    }
  },


  // ---------------- Skyward Ruins ----------------
  harpy(ctx, e, t) {
    const P = e.pal;
    const dive = e.state === 'dash', wind = e.state === 'windup';
    const flap = dive ? 0 : Math.sin(t * 14 + e.seed) * 5;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    ctx.translate(0, Math.sin(t * 3 + e.seed) * 1.5 - 4);
    for (const s of [-1, 1]) {
      const tip = wind ? -17 : -8 - flap;
      ctx.beginPath();
      ctx.moveTo(s * 4, -2);
      ctx.quadraticCurveTo(s * 13, tip - 4, s * (dive ? 13 : 20), tip);
      ctx.lineTo(s * 16, tip + 5); ctx.lineTo(s * 18, tip + 9); ctx.lineTo(s * 12, tip + 9); ctx.lineTo(s * 12, tip + 13);
      ctx.quadraticCurveTo(s * 8, 4, s * 4, 4);
      ctx.closePath();
      fs(ctx, P.dark, 1.8);
    }
    ell(ctx, 0, 3, 6.5, 7.5); fs(ctx, P.main);
    for (const s of [-1, 1]) oline(ctx, s * 2.5, 9, s * 3.5, 13, P.light, 1.6);
    circ(ctx, 0, -7, 6); fs(ctx, '#f6d7c3');
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.quadraticCurveTo(-sx * 2, -20, sx * 7, -15); ctx.quadraticCurveTo(2, -12, 5, -10); ctx.closePath();
    fs(ctx, P.main, 1.5);
    eyes(ctx, sx * 0.6, -7, 2.4, 1.5, e.look, { white: P.light, angry: true, pupil: 0.5 });
    if (e.def.elite) crown(ctx, 0, -16, 0.7);
  },

  sentinel(ctx, e, t) {
    const P = e.pal;
    const puff = e.puff || 0;
    rrect(ctx, -12, 6, 24, 7, 2); fs(ctx, P.dark, 1.8);
    ctx.beginPath(); ctx.moveTo(-9, 7); ctx.lineTo(-7, -16); ctx.lineTo(0, -21); ctx.lineTo(7, -16); ctx.lineTo(9, 7); ctx.closePath();
    fs(ctx, P.main, 2);
    line(ctx, -6, -1, 6, -1, darken(P.main, 0.22), 1.4);
    line(ctx, -5, 3, 5, 3, darken(P.main, 0.22), 1.4);
    glow(ctx, 0, -9, 14 + puff * 12, P.light, 0.75);
    circ(ctx, 0, -9, 3.6); fs(ctx, P.light, 1.4);
    circ(ctx, Math.cos(e.look) * 1.3, -9 + Math.sin(e.look) * 1.3, 1.4); ctx.fillStyle = OL; ctx.fill();
    shine(ctx, -4, -13, 1.5, 3, 0.35);
  },

  windspirit(ctx, e, t) {
    const P = e.pal;
    const ch = e.state === 'charge' ? clamp(1 - e.t / 0.75, 0, 1) : 0;
    ctx.translate(0, Math.sin(t * 3 + e.seed) * 2 - 4);
    glow(ctx, 0, 0, 22 + ch * 16, '#ffffff', 0.5);
    for (let i = 0; i < 3; i++) {
      const a = t * (4 + i) + i * 2;
      ctx.beginPath(); ctx.arc(0, 0, 8 + i * 3.5 + ch * 5, a, a + 3.4);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 - i * 0.18})`; ctx.lineWidth = 2.4; ctx.stroke();
    }
    for (const [x, y, r] of [[-5, 2, 6], [5, 2, 6], [0, -3, 7]]) { circ(ctx, x, y, r); fs(ctx, P.main, 1.6); }
    for (const [x, y, r] of [[-5, 2, 4.6], [5, 2, 4.6]]) { circ(ctx, x, y, r); ctx.fillStyle = col(P.main); ctx.fill(); }
    eyes(ctx, 0, -1, 2.6, 1.6, e.look, { white: false, color: OL, pupil: 0.9, angry: true });
  },

  gargoyle(ctx, e, t) {
    const P = e.pal;
    const statue = e.statue;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const shake = e.state === 'windup' ? Math.sin(t * 60) * 1.2 : 0;
    ctx.translate(shake, 0);
    if (statue) { rrect(ctx, -13, 7, 26, 6, 2); fs(ctx, '#7d7888', 1.8); }
    for (const s of [-1, 1]) {
      const spread = statue ? 0 : 4;
      ctx.beginPath();
      ctx.moveTo(s * 5, -4); ctx.lineTo(s * (13 + spread), -16 - spread); ctx.lineTo(s * 15, -6); ctx.lineTo(s * (14 + spread), 0); ctx.lineTo(s * 8, 4);
      ctx.closePath();
      fs(ctx, P.dark, 1.8);
    }
    ell(ctx, 0, 3, 9, 8); fs(ctx, P.main);
    for (const s of [-1, 1]) { ell(ctx, s * 6, 9, 3.2, 2.4); fs(ctx, P.dark, 1.5); }
    circ(ctx, sx, -7, 6.5); fs(ctx, P.main);
    for (const s of [-1, 1]) {
      const h = e.def.elite ? 9 : 6;
      ctx.beginPath(); ctx.moveTo(sx + s * 3, -11); ctx.lineTo(sx + s * 6, -11 - h); ctx.lineTo(sx + s * 6.5, -10); ctx.closePath();
      fs(ctx, P.dark, 1.4);
    }
    if (statue) {
      for (const s of [-1, 1]) { ell(ctx, sx + s * 2.4, -7, 1.3, 1.1); ctx.fillStyle = darken(P.main, 0.45); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-2, 3); ctx.lineTo(-4, 8);
      ctx.strokeStyle = darken(P.main, 0.3); ctx.lineWidth = 1; ctx.stroke();
    } else {
      glowEyes(ctx, sx, -7.5, 2.4, 1.3, P.light);
      ctx.beginPath(); ctx.moveTo(sx - 3, -3); ctx.lineTo(sx - 1.5, -1.5); ctx.lineTo(sx, -3); ctx.lineTo(sx + 1.5, -1.5); ctx.lineTo(sx + 3, -3);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.3; ctx.stroke();
    }
  },

  shaman(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const cast = e.state === 'cast';
    ctx.translate(0, -Math.sin(t * 8 + e.seed) * (e.moving ? 1.2 : 0.4));
    ctx.beginPath();
    ctx.moveTo(-10, 11); ctx.quadraticCurveTo(-9, -3, 0, -5); ctx.quadraticCurveTo(9, -3, 10, 11); ctx.quadraticCurveTo(0, 14, -10, 11);
    fs(ctx, P.main);
    line(ctx, 0, -3, 0, 11, col(P.dark), 1.6);
    ctx.save();
    ctx.translate(sx * 11, 0);
    ctx.rotate(cast ? -sx * 0.3 : 0);
    oline(ctx, 0, 12, 0, -16, '#7a5a3a', 2.2);
    glow(ctx, 0, -19, cast ? 26 : 12, P.light, 1);
    circ(ctx, 0, -19, 3.2); fs(ctx, P.light, 1.4);
    if (cast) bolt(ctx, 0, -28, 4, P.light);
    ctx.restore();
    circ(ctx, 0, -9, 7); fs(ctx, P.dark);
    for (const [dx, h, c] of [[-6, 9, '#ff8a3a'], [-2, 13, '#ffe55a'], [2, 13, '#ffe55a'], [6, 9, '#ff8a3a']]) {
      ctx.beginPath(); ctx.moveTo(dx - 1.6, -13); ctx.lineTo(dx, -13 - h); ctx.lineTo(dx + 1.6, -13); ctx.closePath();
      fs(ctx, c, 1.2);
    }
    rrect(ctx, -5.5, -12, 11, 6.5, 2.5); fs(ctx, '#f4f1e6', 1.4);
    eyes(ctx, sx * 0.5, -9, 2.4, 1.4, e.look, { white: P.light, angry: true, pupil: 0.5 });
  },

  tortoise(ctx, e, t) {
    const P = e.pal;
    const open = e.shellOpen;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const step = Math.sin(t * 6 + e.seed) * (e.moving ? 1.5 : 0);
    ctx.save();
    ctx.scale(sx, 1);
    for (const [x, ph] of [[-10, 1], [-4, -1], [4, 1], [10, -1]]) { rrect(ctx, x - 2.5, 6 + step * ph * 0.4, 5, 6, 2); fs(ctx, '#a89a76', 1.5); }
    const hx = open ? 18 : 13;
    ell(ctx, hx, 1, 5.5, 4.5); fs(ctx, '#a89a76', 1.6);
    ell(ctx, hx + 2, 0, 1.3, 1.5); ctx.fillStyle = OL; ctx.fill();
    if (open) { ctx.beginPath(); ctx.ellipse(hx + 4, 3, 2, 1.4, 0, 0, TAU); ctx.fillStyle = OL; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-16, 6); ctx.quadraticCurveTo(-16, -14, 0, -15); ctx.quadraticCurveTo(16, -14, 16, 6); ctx.closePath();
    fs(ctx, P.main, 2.2);
    for (const [x, y] of [[-8, -4], [0, -9], [8, -4], [0, 1]]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(x + Math.cos(a) * 4.2, y + Math.sin(a) * 3.4); }
      ctx.closePath(); ctx.strokeStyle = col(P.dark); ctx.lineWidth = 1.3; ctx.stroke();
    }
    for (const [x, y] of [[-5, -12], [3, -13], [8, -10]]) { circ(ctx, x, y, 2.2); ctx.fillStyle = col(P.light); ctx.fill(); }
    rrect(ctx, -17, 4, 34, 4, 2); fs(ctx, P.dark, 1.6);
    ctx.restore();
    if (!open) {   // the hard front that blocks shots
      ctx.beginPath(); ctx.arc(0, -3, 19, e.look - 1.05, e.look + 1.05);
      ctx.strokeStyle = OL; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#c9bfa9'; ctx.lineWidth = 3; ctx.stroke();
    }
  },

  // ---------------- Iron Citadel ----------------
  // Iron Soldier and Crossbowman (def.crossbow); the Shieldbearer is one with a big shield.
  soldier(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const step = e.moving ? Math.sin(t * 11 + e.seed) * 2.2 : 0;
    ell(ctx, -4 + step * 0.6, 10, 3.4, 2.5); fs(ctx, '#3a3f4c', 1.6);
    ell(ctx, 4 - step * 0.6, 10, 3.4, 2.5); fs(ctx, '#3a3f4c', 1.6);
    ctx.translate(0, -Math.abs(step) * 0.5);
    rrect(ctx, -8, -4, 16, 14, 5); fs(ctx, P.main);
    rrect(ctx, -4, -3, 8, 12, 2); fs(ctx, e.def.crossbow ? P.dark : '#9a2f2a', 1.4);
    circ(ctx, 0, -10, 8.2); fs(ctx, P.main);
    ctx.beginPath(); ctx.arc(0, -10, 8.2, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    rrect(ctx, -6, -11, 12, 3.6, 1.8); ctx.fillStyle = OL; ctx.fill();
    for (const s of [-1, 1]) { circ(ctx, s * 2.4 + sx, -9.3, 1.1); ctx.fillStyle = P.light; ctx.fill(); }
    if (e.def.elite) {   // a captain's plume
      ctx.beginPath(); ctx.moveTo(-1, -17); ctx.quadraticCurveTo(-sx * 10, -24, -sx * 12, -14); ctx.quadraticCurveTo(-sx * 6, -18, 1, -16); ctx.closePath();
      fs(ctx, P.light, 1.4);
    } else {
      rrect(ctx, -1.5, -20, 3, 4, 1.2); fs(ctx, P.dark, 1.2);
    }
    if (e.def.shell) return;   // the Shieldbearer holds its shield instead (drawn on top)
    ctx.save();
    ctx.translate(sx * 7, 1);
    ctx.rotate(e.look);
    if (e.def.crossbow) {
      rrect(ctx, -2, -1.8, 15, 3.6, 1.4); fs(ctx, '#6e4a2c', 1.4);
      ctx.beginPath(); ctx.arc(7, 0, 7, -1.25, 1.25);
      ctx.strokeStyle = OL; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#8a8f9e'; ctx.lineWidth = 2; ctx.stroke();
      const pull = e.state === 'aim' ? 4 : 1;
      ctx.beginPath(); ctx.moveTo(7 + Math.cos(1.25) * 7, -Math.sin(1.25) * 7); ctx.lineTo(7 - pull, 0); ctx.lineTo(7 + Math.cos(1.25) * 7, Math.sin(1.25) * 7);
      ctx.strokeStyle = '#f0e6d2'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      oline(ctx, 3, 0, 17, 0, '#dfe6f0', 2.4);
      line(ctx, 3, -4, 3, 4, '#8a6a3a', 2.6);
    }
    ctx.restore();
  },

  shieldbearer(ctx, e, t) {
    ENEMY_ART.soldier(ctx, e, t);
    ctx.save();
    ctx.rotate(e.look);
    rrect(ctx, 8, -13, 7, 26, 3); fs(ctx, '#7d8494', 2.2);
    line(ctx, 11.5, -9, 11.5, 9, e.pal.light, 2);
    circ(ctx, 11.5, 0, 2.4); fs(ctx, e.pal.light, 1.2);
    ctx.restore();
  },

  hound(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const run = e.state === 'dash' ? 1 : e.moving ? 0.6 : 0;
    const leg = Math.sin(t * 16 + e.seed) * 3 * run, crouch = e.state === 'windup' ? 2 : 0;
    ctx.save();
    ctx.scale(sx, 1);
    for (const [x, ph] of [[-9, 1], [-4, -1], [5, 1], [10, -1]]) { rrect(ctx, x - 2, 3 + leg * ph * 0.5, 4, 8, 1.6); fs(ctx, P.dark, 1.4); }
    ctx.translate(0, crouch);
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-18, -9); ctx.strokeStyle = OL; ctx.lineWidth = 3.5; ctx.stroke(); ctx.strokeStyle = col(P.dark); ctx.lineWidth = 1.8; ctx.stroke();
    ell(ctx, 0, 0, 13, 7.5); fs(ctx, P.main);
    for (const x of [-6, 0, 6]) line(ctx, x, -6, x - 1, 5, rgba(P.dark, 0.6), 1.3);
    ell(ctx, 12, -5, 6.5, 5.5); fs(ctx, P.main);
    rrect(ctx, 13, -2.5, 7, 3.4, 1.4); fs(ctx, P.dark, 1.3);
    ctx.beginPath(); ctx.moveTo(8, -9); ctx.lineTo(10, -15); ctx.lineTo(12.5, -9.5); ctx.closePath(); fs(ctx, P.dark, 1.3);
    glow(ctx, 14.5, -6, 6, P.light, 0.8);
    circ(ctx, 14.5, -6, 1.6); ctx.fillStyle = P.light; ctx.fill();
    ctx.restore();
  },

  // the Iron Warden: a big knight with a hammer that jumps at you
  warden(ctx, e, t) {
    const P = e.pal;
    const sx = Math.cos(e.look) >= 0 ? 1 : -1;
    const sq = e.squash || 0, up = e.state === 'crouch' || e.state === 'air';
    ctx.scale(1 + sq * 0.12, 1 - sq * 0.12);
    for (const s of [-1, 1]) { rrect(ctx, s * 6 - 4, 7, 8, 8, 2.5); fs(ctx, '#3a3f4c', 1.6); }
    rrect(ctx, -12, -8, 24, 18, 7); fs(ctx, P.main, 2.2);
    rrect(ctx, -5, -6, 10, 15, 2); fs(ctx, '#9a2f2a', 1.4);
    for (const s of [-1, 1]) { circ(ctx, s * 12, -6, 5.5); fs(ctx, P.dark, 1.8); }
    rrect(ctx, -8, -24, 16, 17, 6); fs(ctx, P.main, 2);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, -20); ctx.quadraticCurveTo(s * 15, -24, s * 13, -31); ctx.quadraticCurveTo(s * 11, -25, s * 4, -23); ctx.closePath(); fs(ctx, '#e8e0cc', 1.4); }
    rrect(ctx, -6, -17, 12, 3.6, 1.8); ctx.fillStyle = OL; ctx.fill();
    glowEyes(ctx, sx, -15.3, 2.6, 1.2, P.light);
    ctx.save();
    ctx.translate(sx * 13, -2);
    ctx.rotate(up ? -sx * 2.2 : sx * 0.5);
    oline(ctx, 0, 4, 0, -16, '#6e4a2c', 2.6);
    rrect(ctx, -7, -24, 14, 9, 2); fs(ctx, '#5a6070', 2);
    ctx.restore();
  },

  // a power core: a glowing orb in a cage on a stone foot, in the colour of its cables
  core(ctx, e, t) {
    const P = e.pal;
    const pulse = Math.sin(t * 4 + e.seed) * 0.5 + 0.5;
    ell(ctx, 0, 9, 12, 4.5); fs(ctx, '#4a4752', 1.8);
    rrect(ctx, -9, -1, 18, 10, 3); fs(ctx, '#5a6070', 1.8);
    glow(ctx, 0, -11, 30, P.main, 0.45 + pulse * 0.3);
    circ(ctx, 0, -11, 8.5); fs(ctx, P.main, 2);
    circ(ctx, -2.6, -13.6, 3); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    for (const x of [-5, 0, 5]) line(ctx, x, -20, x * 1.25, -2, 'rgba(34,24,58,0.75)', 1.6);
    rrect(ctx, -7, -23, 14, 4, 2); fs(ctx, '#5a6070', 1.6);
  },

  // ---------------- bosses ----------------
  // The Iron Heart: a beating iron heart, held up by pipes until it breaks free
  ironHeart(ctx, e, t) {
    const P = e.pal;
    const beat = 1 + Math.max(0, Math.sin(t * (e.phase2 ? 7 : 5))) * 0.06;
    if (!e.free) {
      for (const s of [-1, 1]) { oline(ctx, s * 14, -6, s * 36, -28, '#5a6070', 5); oline(ctx, s * 18, 10, s * 36, 20, '#5a6070', 4); }
    } else {
      for (const s of [-1, 1]) flame(ctx, s * 9, 30, 5 + Math.sin(t * 30 + s) * 1.2);
    }
    ctx.save();
    ctx.scale(beat, beat);
    heartPath(ctx, 0, 0, 25); fs(ctx, P.main, 2.6);
    ctx.save();
    heartPath(ctx, 0, 0, 25); ctx.clip();
    for (const y of [-8, 6]) { ctx.fillStyle = col(P.dark); ctx.fillRect(-32, y, 64, 4); }
    ctx.restore();
    for (const [x, y] of [[-17, -10], [17, -10], [-12, 8], [12, 8], [0, 18]]) { circ(ctx, x, y, 1.8); ctx.fillStyle = '#f2d38a'; ctx.fill(); }
    glow(ctx, 0, -2, 28, P.light, 0.55 + Math.sin(t * 6) * 0.15);
    circ(ctx, 0, -2, 8); fs(ctx, P.light, 2);
    circ(ctx, -2, -4, 3); ctx.fillStyle = '#fff2c8'; ctx.fill();
    ctx.restore();
    for (const s of [-1, 1]) { rrect(ctx, s * 9 - 3.5, -30, 7, 10, 2); fs(ctx, '#5a6070', 1.6); }
  },
  treant(ctx, e, t) {
    const P = e.pal;
    const sway = Math.sin(t * 1.6) * 2;
    const arm = e.anim === 'cast' ? -0.9 : Math.sin(t * 2) * 0.15;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 20, -6);
      ctx.rotate(s * (0.6 + arm));
      oline(ctx, 0, 0, s * 18, -6, P.main, 6);
      oline(ctx, s * 14, -5, s * 20, -14, P.main, 3.5);
      oline(ctx, s * 16, -6, s * 24, -3, P.main, 3);
      circ(ctx, s * 21, -15, 5); fs(ctx, P.light, 1.6);
      ctx.restore();
    }
    for (const s of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 10 - 6, 18); ctx.quadraticCurveTo(s * 16, 26, s * 22, 22); ctx.lineTo(s * 10 + 4, 16); ctx.closePath();
      fs(ctx, P.dark, 1.8);
    }
    ctx.beginPath();
    ctx.moveTo(-20, 20); ctx.quadraticCurveTo(-24, -6, -16, -20); ctx.lineTo(16, -20); ctx.quadraticCurveTo(24, -6, 20, 20);
    ctx.quadraticCurveTo(0, 26, -20, 20);
    fs(ctx, P.main, 2.4);
    for (const x of [-12, -4, 6, 13]) line(ctx, x, -14, x + 2, 18, darken(P.main, 0.25), 1.8);
    for (const [x, y, r] of [[-20 + sway, -26, 13], [0 + sway, -36, 16], [20 + sway, -26, 13], [-10 + sway, -40, 11], [11 + sway, -42, 11], [0 + sway, -20, 12]]) {
      circ(ctx, x, y, r); fs(ctx, P.light, 2.2);
    }
    for (const [x, y, r] of [[-14 + sway, -32, 4], [4 + sway, -44, 4.5], [18 + sway, -30, 3.5]]) {
      shine(ctx, x, y, r, r * 0.6, 0.35);
    }
    ell(ctx, 0, -2, 14, 11); ctx.fillStyle = darken(P.main, 0.45); ctx.fill();
    glowEyes(ctx, 0, -5, 6, 3.2, e.phase2 ? '#ff6a3a' : '#ffe066');
    ctx.beginPath(); ctx.ellipse(0, 4, 6, e.anim === 'cast' ? 4 : 2, 0, 0, TAU); ctx.fillStyle = OL; ctx.fill();
  },

  magmaKing(ctx, e, t) {
    const P = e.pal;
    const pulse = 0.5 + Math.sin(t * 4) * 0.5;
    const up = e.anim === 'air' || e.anim === 'cast';
    glow(ctx, 0, 0, 70, P.light, 0.35 + pulse * 0.15);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 26, -4);
      ctx.rotate(s * (up ? -1.8 : -0.25));
      ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(7, -6); ctx.lineTo(9, 14); ctx.lineTo(-8, 16); ctx.closePath();
      ctx.lineJoin = 'round';
      fs(ctx, P.main, 2.2);
      line(ctx, -2, 0, 2, 10, col(P.light), 2);
      ell(ctx, 0, 18, 9, 7); fs(ctx, P.main, 2.2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-24, 18); ctx.lineTo(-29, 0); ctx.lineTo(-22, -18); ctx.lineTo(-8, -25); ctx.lineTo(10, -24);
    ctx.lineTo(24, -16); ctx.lineTo(29, 2); ctx.lineTo(23, 19); ctx.quadraticCurveTo(0, 26, -24, 18);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, P.main, 2.6);
    ctx.beginPath();
    ctx.moveTo(-16, 16); ctx.lineTo(-10, 4); ctx.lineTo(-15, -8); ctx.lineTo(-8, -18);
    ctx.moveTo(14, 15); ctx.lineTo(9, 3); ctx.lineTo(16, -6);
    ctx.moveTo(-2, 22); ctx.lineTo(1, 14);
    ctx.strokeStyle = col(P.light); ctx.lineWidth = 2.6; ctx.stroke();
    circ(ctx, 0, 5, 7 + pulse * 1.5); fs(ctx, '#ffd35a', 2);
    glow(ctx, 0, 5, 26, '#ffb02e', 0.8);
    glowEyes(ctx, 0, -10, 8, 3.4, e.phase2 ? '#ffffff' : '#ffd35a');
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = -14 + i * 7;
      ctx.lineTo(x, -24);
      ctx.lineTo(x + 3.5, -36 - (i % 2 ? 0 : 5) - pulse * 2);
    }
    ctx.lineTo(14, -24);
    ctx.closePath();
    fs(ctx, '#2a1a1a', 2);
    for (let i = 0; i < 5; i++) {
      circ(ctx, -10.5 + i * 7, -31 - (i % 2 ? 0 : 4), 1.8); ctx.fillStyle = '#ffb02e'; ctx.fill();
    }
  },

  lich(ctx, e, t) {
    const P = e.pal;
    const hover = Math.sin(t * 2) * 3;
    ctx.translate(0, hover - 4);
    glow(ctx, 0, 0, 60, P.light, 0.25);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.8 + (i * TAU) / 3;
      const x = Math.cos(a) * 34, y = Math.sin(a) * 14 - 6;
      if (Math.sin(a) < 0) drawSkull(ctx, x, y, 5, P.light);
    }
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.quadraticCurveTo(-20, 12, -16, 22);
    for (let i = 0; i <= 6; i++) {
      const x = -16 + i * (32 / 6), y = 22 + Math.sin(t * 5 + i) * 3 + (i % 2 ? 4 : 0);
      ctx.lineTo(x, y);
    }
    ctx.quadraticCurveTo(20, 12, 18, -6);
    ctx.closePath();
    fs(ctx, P.main, 2.4);
    line(ctx, 0, -4, 0, 22, col(P.dark), 2);
    const arm = e.anim === 'cast' ? -1.3 : 0;
    ctx.save();
    ctx.translate(20, -4);
    ctx.rotate(0.15 + arm * 0.3);
    oline(ctx, 0, 30, 0, -26, '#5a4a6a', 3);
    glow(ctx, 0, -30, 26, P.light, 0.9);
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(5, -30); ctx.lineTo(0, -22); ctx.lineTo(-5, -30); ctx.closePath();
    fs(ctx, P.light, 1.8);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-16, -4); ctx.quadraticCurveTo(-16, -30, 0, -32); ctx.quadraticCurveTo(16, -30, 16, -4);
    ctx.quadraticCurveTo(0, 2, -16, -4);
    fs(ctx, P.dark, 2.4);
    drawSkull(ctx, 0, -14, 9, P.light, e.phase2);
    crown(ctx, 0, -27, 1.1);
    for (let i = 0; i < 3; i++) {
      const a = t * 1.8 + (i * TAU) / 3;
      const x = Math.cos(a) * 34, y = Math.sin(a) * 14 - 6;
      if (Math.sin(a) >= 0) drawSkull(ctx, x, y, 5, P.light);
    }
  },

  roc(ctx, e, t) {
    const P = e.pal;
    const up = e.anim === 'cast';
    const flap = Math.sin(t * (up ? 12 : 5)) * (up ? 8 : 4);
    ctx.translate(0, Math.sin(t * 2) * 2 - 6);
    glow(ctx, 0, 0, 60, P.light, 0.18);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(8, -6);
      ctx.quadraticCurveTo(30, -26 - flap, 52, -20 - flap * 1.4);
      for (let i = 0; i < 4; i++) {
        const x = 50 - i * 9, y = -18 - flap * 1.2 + i * 7;
        ctx.lineTo(x + 6, y + 10); ctx.lineTo(x, y + 6);
      }
      ctx.quadraticCurveTo(24, 10, 10, 10);
      ctx.closePath();
      fs(ctx, P.main, 2.4);
      ctx.beginPath(); ctx.moveTo(10, -4); ctx.quadraticCurveTo(28, -18 - flap, 44, -14 - flap * 1.2); ctx.quadraticCurveTo(26, -4, 12, 4); ctx.closePath();
      ctx.fillStyle = col(P.dark); ctx.fill();
      ctx.restore();
    }
    for (const dx of [-8, 0, 8]) {
      ctx.beginPath(); ctx.moveTo(dx - 4, 16); ctx.lineTo(dx, 30); ctx.lineTo(dx + 4, 16); ctx.closePath();
      fs(ctx, P.dark, 1.8);
    }
    ell(ctx, 0, 4, 18, 17); fs(ctx, P.main, 2.4);
    ell(ctx, 0, 9, 11, 10); fs(ctx, '#e9e4d6', 1.8);
    for (const s of [-1, 1]) oline(ctx, s * 7, 18, s * 8, 24, '#ffcf3f', 2.2);
    circ(ctx, 0, -16, 11); fs(ctx, P.main, 2.2);
    for (const [dx, h] of [[-6, 14], [0, 18], [6, 14]]) {
      ctx.beginPath(); ctx.moveTo(dx - 3, -24); ctx.lineTo(dx + 2, -24 - h); ctx.lineTo(dx + 3, -23); ctx.closePath();
      fs(ctx, P.light, 1.6);
    }
    ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(0, -4); ctx.lineTo(5, -14); ctx.closePath();
    fs(ctx, '#ffcf3f', 1.8);
    glowEyes(ctx, 0, -18, 5, 2.6, e.phase2 ? '#ff5a6e' : P.light);
    if (e.phase3) for (let i = 0; i < 2; i++) { const a = t * 5 + i * 3; bolt(ctx, Math.cos(a) * 24, -30 + Math.sin(a) * 6, 5, P.light); }
  },

  // a boss's shield crystal: a floating gem on a little stone base
  crystal(ctx, e, t) {
    const P = e.pal;
    ell(ctx, 0, 9, 9, 3.5); fs(ctx, '#6a6478', 1.6);
    const hover = Math.sin(t * 3 + e.seed) * 2 - 6;
    ctx.translate(0, hover);
    glow(ctx, 0, 0, 30, P.dark, 0.55 + Math.sin(t * 5 + e.seed) * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(8, -4); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.lineTo(-8, -4);
    ctx.closePath();
    fs(ctx, P.main, 2);
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(2, 9); ctx.lineTo(-6, 9); ctx.lineTo(-8, -4); ctx.closePath();
    ctx.fillStyle = col(P.dark); ctx.globalAlpha *= 0.45; ctx.fill(); ctx.globalAlpha /= 0.45;
    shine(ctx, 3, -5, 1.6, 4, 0.8, 0.3);
  },
};

function drawSkull(ctx, x, y, r, eyeColor, angry) {
  circ(ctx, x, y, r); fs(ctx, '#f4ecd8', 1.6);
  rrect(ctx, x - r * 0.55, y + r * 0.45, r * 1.1, r * 0.7, r * 0.2); fs(ctx, '#f4ecd8', 1.3);
  for (const s of [-1, 1]) {
    ell(ctx, x + s * r * 0.38, y - r * 0.05, r * 0.3, r * 0.34); ctx.fillStyle = OL; ctx.fill();
    if (eyeColor) {
      circ(ctx, x + s * r * 0.38, y - r * 0.05, r * 0.14);
      ctx.fillStyle = angry ? '#ff5a6e' : eyeColor; ctx.fill();
    }
  }
}

// Natural radius each drawing was made at; enemies are scaled from it.
const ART_BASE = {
  slime: 12, bat: 10, mushroom: 13, goblin: 12, boar: 14, stump: 15, imp: 10, slug: 13, scorpion: 12,
  salamander: 12, golem: 16, skeleton: 11, ghost: 12, wisp: 11, mage: 12, yeti: 15,
  harpy: 12, sentinel: 14, windspirit: 12, gargoyle: 13, shaman: 13, tortoise: 16,
  treant: 24, magmaKing: 28, lich: 20, roc: 28, crystal: 13,
  soldier: 12, shieldbearer: 13, hound: 13, warden: 14, core: 13, ironHeart: 28,
};

function drawEnemy(ctx, e, t) {
  const art = ENEMY_ART[e.def.art];
  const base = ART_BASE[e.def.art] || 12;
  const s = e.r / base;
  ctx.save();
  ctx.translate(e.x, e.y - (e.z || 0));
  if (e.spawnT > 0) {
    const k = 1 - e.spawnT / e.spawnMax;
    ctx.globalAlpha = clamp(k * 1.5, 0, 1);
    ctx.scale(ease.outBack(clamp(k, 0, 1)) * s, ease.outBack(clamp(k, 0, 1)) * s);
  } else {
    ctx.scale(s, s);
  }
  if (e.alpha !== undefined) ctx.globalAlpha *= e.alpha;
  ART.flash = e.flash > 0 ? Math.min(e.boss || e.elite ? 0.45 : 1, e.flash * 6) : 0;
  const st = e.status;
  if (st.freeze > 0) { ART.tint = '#9fe4ff'; ART.tintAmt = 0.55; }
  else if (st.curse > 0) { ART.tint = '#b45cff'; ART.tintAmt = 0.18; }
  else if (st.poison > 0) { ART.tint = '#7be05a'; ART.tintAmt = 0.18; }
  else if (st.burn > 0) { ART.tint = '#ff7a2a'; ART.tintAmt = 0.18; }
  else if (st.slow > 0) { ART.tint = '#7fdcff'; ART.tintAmt = 0.2; }
  art(ctx, e, t);
  ART.flash = 0; ART.tint = null;
  ctx.restore();
}

// ---------------- shots ----------------

function drawEnemyShot(ctx, b, t) {
  const c = b.color;
  // lobbed shots fly over the scenery: lifted off the ground with a shadow underneath
  const lift = b.ghost ? 5 : 0;
  if (b.ghost) drawShadow(ctx, b.x, b.y + 8, b.r * 0.9, 0.2);
  glow(ctx, b.x, b.y - lift, b.r * 3.2, c, 0.9);
  ctx.save();
  ctx.translate(b.x, b.y - lift);
  const a = Math.atan2(b.vy, b.vx);
  switch (b.kind) {
    case 'arrow':
      ctx.rotate(a);
      oline(ctx, -9, 0, 5, 0, '#c9a46a', 1.6);
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -3.5); ctx.lineTo(3, 3.5); ctx.closePath(); fs(ctx, c, 1.4);
      break;
    case 'leaf':
      ctx.rotate(t * 8 + b.seed);
      ctx.beginPath(); ctx.moveTo(-b.r, 0); ctx.quadraticCurveTo(0, -b.r, b.r, 0); ctx.quadraticCurveTo(0, b.r, -b.r, 0);
      fs(ctx, c, 1.6);
      line(ctx, -b.r * 0.7, 0, b.r * 0.7, 0, darken(c, 0.3), 1);
      break;
    case 'bone':
      ctx.rotate(t * 10 + b.seed);
      oline(ctx, -5, 0, 5, 0, c, 2.2);
      for (const s of [-1, 1]) for (const k of [-1, 1]) { circ(ctx, s * 5, k * 1.6, 1.8); fs(ctx, c, 1); }
      break;
    case 'ice':
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(b.r * 1.5, 0); ctx.lineTo(0, -b.r * 0.7); ctx.lineTo(-b.r * 1.2, 0); ctx.lineTo(0, b.r * 0.7); ctx.closePath();
      fs(ctx, c, 1.6);
      shine(ctx, 1, -1, b.r * 0.6, b.r * 0.25, 0.7, 0);
      break;
    case 'feather':
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(0, -4.5, -8, 0); ctx.quadraticCurveTo(0, 4.5, 8, 0);
      fs(ctx, c, 1.4);
      line(ctx, -9, 0, 7, 0, '#b9a98a', 1);
      break;
    case 'spore':
      circ(ctx, 0, 0, b.r); fs(ctx, c, 1.8);
      for (let i = 0; i < 3; i++) {
        const aa = t * 3 + i * 2.1 + b.seed;
        circ(ctx, Math.cos(aa) * b.r * 0.45, Math.sin(aa) * b.r * 0.45, 1.2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      }
      break;
    case 'fire': {
      const f = 1 + Math.sin(t * 30 + b.seed) * 0.12;
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-b.r * 2.2, 0); ctx.quadraticCurveTo(-b.r, -b.r * f, 0, -b.r * f);
      ctx.arc(0, 0, b.r * f, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-b.r, b.r * f, -b.r * 2.2, 0);
      fs(ctx, c, 1.6);
      circ(ctx, b.r * 0.2, 0, b.r * 0.55); ctx.fillStyle = '#ffe9a0'; ctx.fill();
      break;
    }
    default:
      circ(ctx, 0, 0, b.r); fs(ctx, c, 1.8);
      circ(ctx, -b.r * 0.15, -b.r * 0.15, b.r * 0.5); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }
  ctx.restore();
}

const ELEMENT_COLORS = { fire: '#ff8a2a', poison: '#7be05a', frost: '#7fdcff', lightning: '#ffe55a', curse: '#c06bff' };

function drawPlayerShot(ctx, b, t) {
  const glowC = b.glow || '#ffffff';
  const s = b.size || 1;
  if (b.kind === 'bomb') {   // in the air: drawn above its shadow, the fuse sparking
    const y = b.y - (b.z || 0);
    drawShadow(ctx, b.x, b.y + 4, 4.5 * s, 0.25);
    if (b.glow) glow(ctx, b.x, y, 16 * s, glowC, 0.8);
    circ(ctx, b.x, y, 5 * s); fs(ctx, '#3a3f4a', 1.6);
    shine(ctx, b.x - 1.6 * s, y - 1.8 * s, 1.6 * s, 1.1 * s, 0.5);
    glow(ctx, b.x + 3 * s, y - 5 * s, 7 + Math.sin(t * 40 + b.x) * 2, '#ffcf3f', 0.9);
    return;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  const a = Math.atan2(b.vy, b.vx);
  ctx.rotate(a);
  ctx.scale(s, s);
  switch (b.kind) {
    case 'arrow':
      if (b.glow) glow(ctx, 0, 0, 14, glowC, 0.8);
      oline(ctx, -9, 0, 6, 0, '#f0dcb4', 1.6);
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(4, -3.6); ctx.lineTo(4, 3.6); ctx.closePath(); fs(ctx, b.glow ? lighten(glowC, 0.3) : '#e6edf7', 1.3);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-13, -3.5); ctx.lineTo(-10, 0); ctx.lineTo(-13, 3.5); ctx.closePath();
      ctx.fillStyle = b.glow || '#ff6b7a'; ctx.fill();
      break;
    case 'orb':
      glow(ctx, 0, 0, 22, b.glow || '#b98bff', 1);
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-4, -5, 0, -5.5); ctx.arc(0, 0, 5.5, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-4, 5, -14, 0);
      ctx.fillStyle = rgba(b.glow || '#b98bff', 0.55); ctx.fill();
      circ(ctx, 0, 0, 5); fs(ctx, b.glow ? lighten(glowC, 0.2) : '#c7a6ff', 1.6);
      circ(ctx, 1, -1, 2.2); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    case 'bolt':
      glow(ctx, 0, 0, 14, b.glow || '#3fd1c8', 1);
      rrect(ctx, -9, -2.4, 18, 4.8, 2.4); fs(ctx, b.glow ? lighten(glowC, 0.3) : '#8ff7ef', 1.4);
      rrect(ctx, -6, -1, 12, 2, 1); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    case 'spark':
      glow(ctx, 0, 0, 12, b.glow || '#9fe8ff', 1);
      circ(ctx, 0, 0, 3.4); fs(ctx, b.glow || '#bff1ff', 1.2);
      break;
    case 'dragon':
      glow(ctx, 0, 0, 20, '#ff8a2a', 1);
      circ(ctx, 0, 0, 5.5); fs(ctx, '#ff9a3c', 1.6);
      circ(ctx, 1, 0, 2.6); ctx.fillStyle = '#fff2a8'; ctx.fill();
      break;
    case 'soul':
      glow(ctx, 0, 0, 14, '#c06bff', 1);
      circ(ctx, 0, 0, 3.6); fs(ctx, '#e0b3ff', 1.2);
      break;
    case 'boomerang':
      if (b.glow) glow(ctx, 0, 0, 16, glowC, 0.8);
      ctx.rotate(t * 18 + (b.x + b.y) * 0.01);
      ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(0, -1, 7, -6); ctx.quadraticCurveTo(2, 3, 0, 8); ctx.quadraticCurveTo(-2, 3, -7, -6);
      fs(ctx, b.glow ? lighten(glowC, 0.3) : '#f4f1e6', 1.5);
      break;
  }
  ctx.restore();
}

// ---------------- pickups and helpers ----------------

function drawCoin(ctx, x, y, t, seed) {
  const w = Math.abs(Math.cos(t * 4 + seed));
  ell(ctx, x, y, 4.6 * (0.35 + w * 0.65), 4.6); fs(ctx, '#ffcf3f', 1.6);
  ell(ctx, x, y, 2.4 * (0.35 + w * 0.65), 2.6); ctx.strokeStyle = '#d99a1a'; ctx.lineWidth = 1.2; ctx.stroke();
  shine(ctx, x - 1.4 * w, y - 1.6, 1.3 * w + 0.3, 1, 0.7, 0);
}
function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.9, y - s * 1.3, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 1.3, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}
function drawHeart(ctx, x, y, s, color = '#ff4f6d') {
  heartPath(ctx, x, y, s); fs(ctx, color, 1.8);
  shine(ctx, x - s * 0.55, y - s * 0.45, s * 0.3, s * 0.2, 0.7);
}
function drawGem(ctx, x, y, s, color = '#5ff2ff') {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.85, y - s * 0.25); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.85, y - s * 0.25); ctx.closePath();
  fs(ctx, color, 1.6);
  ctx.beginPath(); ctx.moveTo(x - s * 0.85, y - s * 0.25); ctx.lineTo(x + s * 0.85, y - s * 0.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  shine(ctx, x - s * 0.3, y - s * 0.45, s * 0.2, s * 0.3, 0.8, 0.4);
}

function drawHelper(ctx, h, t) {
  ctx.save();
  ctx.translate(h.x, h.y);
  switch (h.kind) {
    case 'wisp': {
      const b = Math.sin(t * 4 + h.seed) * 1.5;
      glow(ctx, 0, b, 22, '#7fe8ff', 0.9);
      ctx.beginPath();
      ctx.moveTo(-5, b); ctx.quadraticCurveTo(-6, b - 9, 0, b - 8); ctx.quadraticCurveTo(6, b - 9, 5, b);
      ctx.quadraticCurveTo(3, b + 6 + Math.sin(t * 9) * 1.5, 0, b + 9); ctx.quadraticCurveTo(-3, b + 6, -5, b);
      fs(ctx, '#bff4ff', 1.6);
      for (const s of [-1, 1]) { ell(ctx, s * 2, b - 3, 0.9, 1.4); ctx.fillStyle = OL; ctx.fill(); }
      break;
    }
    case 'drone': {
      const b = Math.sin(t * 5 + h.seed) * 1.2;
      ctx.translate(0, b);
      line(ctx, -9, -8, 9, -8, 'rgba(40,30,60,0.6)', 1.5 + Math.abs(Math.sin(t * 40)) * 1.5);
      oline(ctx, 0, -8, 0, -4, '#5a6478', 1.4);
      ell(ctx, 0, 0, 7, 5.5); fs(ctx, '#ff8a3d');
      ell(ctx, Math.cos(h.aim || 0) * 2, 0.5, 3.2, 2.6); fs(ctx, '#3fd1c8', 1.2);
      shine(ctx, -3, -2, 2, 1, 0.5);
      break;
    }
    case 'blade': {
      ctx.rotate(t * 14);
      for (let i = 0; i < 3; i++) {
        ctx.rotate(TAU / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -3, 9, 1); ctx.quadraticCurveTo(5, 1, 0, 3); ctx.closePath();
        fs(ctx, '#dfe7f2', 1.4);
      }
      circ(ctx, 0, 0, 2.6); fs(ctx, '#ffcf3f', 1.2);
      break;
    }
    case 'guard': {
      glow(ctx, 0, 0, 18, '#7fb6ff', 0.8);
      circ(ctx, 0, 0, 5.5); fs(ctx, '#9cc8ff', 1.6);
      shine(ctx, -1.6, -1.8, 1.8, 1.1, 0.8);
      break;
    }
    case 'dragon': {
      const flap = Math.sin(t * 12 + h.seed) * 4;
      const sx = Math.cos(h.aim || 0) >= 0 ? 1 : -1;
      ctx.scale(sx, 1);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-1, -3);
        ctx.quadraticCurveTo(s * 5 - 4, -14 - flap, s * 9 - 2, -10 - flap);
        ctx.quadraticCurveTo(s * 5 - 2, -6, 1, -2);
        fs(ctx, '#ff9a3c', 1.4);
      }
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-13, 3, -14, -2); ctx.quadraticCurveTo(-10, 1, -5, -1);
      fs(ctx, '#e5463c', 1.3);
      ell(ctx, -1, 1, 7, 5); fs(ctx, '#e5463c');
      ell(ctx, 6, -3, 5, 4); fs(ctx, '#e5463c');
      ell(ctx, 1, 3, 4, 2.2); fs(ctx, '#ffd35a', 1);
      circ(ctx, 7.5, -4, 1.2); ctx.fillStyle = OL; ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(3, -10); ctx.lineTo(6, -7); ctx.closePath(); fs(ctx, '#ffd35a', 1);
      break;
    }
  }
  ctx.restore();
}

// ---------------- perk / upgrade icons ----------------

function iconArrow(ctx, x1, y1, x2, y2, color = '#f0dcb4', head = '#e6edf7', w = 3) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  oline(ctx, x1, y1, x2 - Math.cos(a) * 4, y2 - Math.sin(a) * 4, color, w);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath();
  fs(ctx, head, 1.8);
  ctx.restore();
}
function flame(ctx, x, y, s, c1 = '#ff8a2a', c2 = '#ffd35a') {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.3);
  ctx.bezierCurveTo(x + s * 1.1, y - s * 0.3, x + s * 0.9, y + s, x, y + s);
  ctx.bezierCurveTo(x - s * 0.9, y + s, x - s * 1.1, y - s * 0.1, x - s * 0.3, y - s * 0.6);
  ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.1, x, y - s * 1.3);
  fs(ctx, c1, 2);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y + s * 0.2, x + s * 0.45, y + s * 0.8, x, y + s * 0.8);
  ctx.bezierCurveTo(x - s * 0.45, y + s * 0.8, x - s * 0.5, y + s * 0.3, x, y - s * 0.3);
  ctx.fillStyle = c2; ctx.fill();
}
function bolt(ctx, x, y, s, c = '#ffe55a') {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y - s * 1.2); ctx.lineTo(x - s * 0.7, y + s * 0.15); ctx.lineTo(x - s * 0.05, y + s * 0.15);
  ctx.lineTo(x - s * 0.3, y + s * 1.2); ctx.lineTo(x + s * 0.75, y - s * 0.25); ctx.lineTo(x + s * 0.1, y - s * 0.25); ctx.closePath();
  ctx.lineJoin = 'round';
  fs(ctx, c, 2);
}

const ICONS = {
  sword(c) {
    c.save(); c.rotate(-Math.PI / 4);
    c.beginPath(); c.moveTo(-3.5, 8); c.lineTo(-3.5, -16); c.lineTo(0, -21); c.lineTo(3.5, -16); c.lineTo(3.5, 8); c.closePath();
    fs(c, '#e6edf7', 2);
    line(c, 0, -17, 0, 6, 'rgba(120,140,170,0.6)', 1.4);
    rrect(c, -9, 7, 18, 4.5, 2); fs(c, '#ffcf3f', 2);
    rrect(c, -2.5, 11, 5, 9, 2); fs(c, '#8a5a36', 2);
    c.restore();
  },
  quick(c) {
    iconArrow(c, -14, 10, 12, -12);
    for (const [y, l] of [[-2, 9], [5, 7], [12, 5]]) line(c, -18 + (12 - y) * 0.2, y, -18 + l + (12 - y) * 0.2, y - 6, 'rgba(255,255,255,0.75)', 2);
    bolt(c, 10, 8, 7);
  },
  heart(c) { drawHeart(c, 0, 0, 14); },
  heal(c) {
    drawHeart(c, 0, 0, 14);
    rrect(c, -2.5, -8, 5, 14, 1.5); fs(c, '#ffffff', 1.4);
    rrect(c, -7, -3.5, 14, 5, 1.5); fs(c, '#ffffff', 1.4);
  },
  boot(c) {
    c.beginPath(); c.moveTo(-8, -16); c.lineTo(4, -16); c.lineTo(4, 2); c.lineTo(14, 6); c.quadraticCurveTo(16, 12, 12, 13);
    c.lineTo(-8, 13); c.closePath(); fs(c, '#8a5a36', 2);
    rrect(c, -9, 9, 24, 5, 2); fs(c, '#5a3a22', 2);
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(-8, -10 + s * 3); c.quadraticCurveTo(-18, -14 + s * 4, -20, -6 + s * 5); c.quadraticCurveTo(-14, -9 + s * 3, -8, -6 + s * 3);
      fs(c, '#ffffff', 1.6);
    }
  },
  side(c) {
    iconArrow(c, -3, 0, -18, 0); iconArrow(c, 3, 0, 18, 0);
    iconArrow(c, 0, 14, 0, -16, '#f0dcb4', '#ffcf3f');
  },
  rear(c) {
    iconArrow(c, 0, -4, 0, -18, '#f0dcb4', '#e6edf7');
    iconArrow(c, 0, 2, 0, 18, '#f0dcb4', '#ffcf3f');
  },
  bounce(c) {
    rrect(c, 10, -18, 6, 36, 2); fs(c, '#8a7aa0', 2);
    c.beginPath(); c.moveTo(-16, -14); c.lineTo(8, 0); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    iconArrow(c, 8, 0, -14, 14);
  },
  eye(c) {
    ell(c, 0, 0, 18, 11); fs(c, '#ffffff', 2);
    circ(c, 0, 0, 7.5); fs(c, '#47a6ff', 2);
    circ(c, 0, 0, 3.5); c.fillStyle = OL; c.fill();
    circ(c, -2.5, -2.5, 1.6); c.fillStyle = '#fff'; c.fill();
  },
  crit(c) {
    circ(c, 0, 0, 15); c.strokeStyle = OL; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#ff4f6d'; c.lineWidth = 3; c.stroke();
    for (const a of [0, 1, 2, 3]) {
      const ang = a * Math.PI / 2;
      oline(c, Math.cos(ang) * 9, Math.sin(ang) * 9, Math.cos(ang) * 20, Math.sin(ang) * 20, '#ff4f6d', 2.5);
    }
    circ(c, 0, 0, 4); fs(c, '#ffcf3f', 1.6);
  },
  coin(c) {
    circ(c, 0, 0, 15); fs(c, '#ffcf3f', 2.2);
    circ(c, 0, 0, 9.5); c.strokeStyle = '#d99a1a'; c.lineWidth = 2; c.stroke();
    shine(c, -5, -6, 4, 2.5, 0.7);
  },
  stone(c) {
    c.beginPath(); c.moveTo(0, -18); c.lineTo(15, -11); c.quadraticCurveTo(15, 9, 0, 18); c.quadraticCurveTo(-15, 9, -15, -11); c.closePath();
    fs(c, '#9aa3b5', 2.2);
    c.beginPath(); c.moveTo(0, -12); c.lineTo(9, -8); c.quadraticCurveTo(9, 5, 0, 11); c.quadraticCurveTo(-9, 5, -9, -8); c.closePath();
    fs(c, '#c4cad6', 1.4);
  },
  multi(c) {
    iconArrow(c, -8, 16, -8, -6, '#f0dcb4', '#e6edf7');
    iconArrow(c, 8, 6, 8, -16, '#f0dcb4', '#ffcf3f');
  },
  front(c) {
    iconArrow(c, -7, 16, -7, -16); iconArrow(c, 7, 16, 7, -16, '#f0dcb4', '#ffcf3f');
  },
  diag(c) {
    iconArrow(c, 0, 14, 0, -17);
    iconArrow(c, 0, 14, -15, -10, '#f0dcb4', '#ffcf3f');
    iconArrow(c, 0, 14, 15, -10, '#f0dcb4', '#ffcf3f');
  },
  pierce(c) {
    circ(c, 0, 2, 9); fs(c, '#6bd35a', 2);
    eyes(c, 0, 1, 3.2, 1.8, 0, {});
    iconArrow(c, -19, 12, 18, -12);
  },
  fire(c) { flame(c, 0, 2, 14); },
  poison(c) {
    c.beginPath(); c.moveTo(0, -18); c.bezierCurveTo(12, -4, 14, 4, 0, 16); c.bezierCurveTo(-14, 4, -12, -4, 0, -18);
    fs(c, '#7be05a', 2.2);
    for (const [x, y, r] of [[-3, 3, 3], [4, -3, 2], [2, 8, 1.6]]) { circ(c, x, y, r); c.fillStyle = '#c9ff9a'; c.fill(); }
    shine(c, -4, -4, 2.4, 4, 0.5, 0.3);
  },
  frost(c) {
    for (let i = 0; i < 3; i++) {
      c.save(); c.rotate(i * Math.PI / 3);
      oline(c, 0, -17, 0, 17, '#bff1ff', 2.6);
      for (const s of [-1, 1]) for (const k of [-1, 1]) oline(c, 0, k * 10, s * 5, k * 14, '#bff1ff', 2);
      c.restore();
    }
    circ(c, 0, 0, 3.5); fs(c, '#ffffff', 1.4);
  },
  lightning(c) { bolt(c, 0, 0, 16); },
  curse(c) {
    glow(c, 0, 0, 26, '#b45cff', 0.8);
    drawSkull(c, 0, -2, 13, '#d9a6ff');
    circ(c, 0, 0, 19); c.strokeStyle = '#c06bff'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]);
  },
  fang(c) {
    c.beginPath(); c.moveTo(-15, -12); c.quadraticCurveTo(0, -4, 15, -12); c.lineTo(15, -6); c.quadraticCurveTo(0, 2, -15, -6); c.closePath();
    fs(c, '#d9425a', 2);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 9, -6); c.lineTo(s * 6, 8); c.lineTo(s * 4, -5); c.closePath(); fs(c, '#ffffff', 1.6); }
    c.beginPath(); c.moveTo(-6, 9); c.quadraticCurveTo(-3, 15, -6, 18); c.quadraticCurveTo(-9, 15, -6, 9); fs(c, '#ff4f6d', 1.4);
  },
  shield(c) {
    glow(c, 0, 0, 28, '#ffe58a', 0.7);
    c.beginPath(); c.moveTo(0, -18); c.lineTo(15, -11); c.quadraticCurveTo(15, 9, 0, 18); c.quadraticCurveTo(-15, 9, -15, -11); c.closePath();
    fs(c, '#ffd95a', 2.2);
    c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 12); c.moveTo(-8, -4); c.lineTo(8, -4);
    c.strokeStyle = '#fff7d6'; c.lineWidth = 3; c.stroke();
  },
  wisp(c) { c.scale(2.1, 2.1); drawHelper(c, { kind: 'wisp', x: 0, y: 2, seed: 0 }, 0); },
  drone(c) { c.scale(1.8, 1.8); drawHelper(c, { kind: 'drone', x: 0, y: 2, seed: 0 }, 0); },
  blades(c) {
    c.scale(1.6, 1.6);
    circ(c, 0, 0, 10); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.setLineDash([2, 2]); c.stroke(); c.setLineDash([]);
    drawHelper(c, { kind: 'blade', x: -8, y: -4, seed: 0 }, 0.1);
    drawHelper(c, { kind: 'blade', x: 8, y: 4, seed: 0 }, 0.3);
  },
  orbs(c) {
    circ(c, 0, 0, 14); c.strokeStyle = 'rgba(160,200,255,0.5)'; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    drawHelper(c, { kind: 'guard', x: -11, y: -8 }, 0);
    drawHelper(c, { kind: 'guard', x: 11, y: 8 }, 0);
    circ(c, 0, 0, 5); fs(c, '#ff5a6e', 1.4);
  },
  run(c) {
    iconArrow(c, -4, 4, 18, -8);
    c.save(); c.translate(-8, 6); c.scale(0.55, 0.55); ICONS.boot(c); c.restore();
  },
  dodge(c) {
    for (const [r, a] of [[16, 0], [10, 1.2], [5, 2.4]]) {
      c.beginPath(); c.arc(0, 0, r, a, a + 4.2);
      c.strokeStyle = OL; c.lineWidth = 6; c.stroke();
      c.strokeStyle = '#d4f0ff'; c.lineWidth = 3; c.stroke();
    }
  },
  regen(c) {
    drawHeart(c, 0, 1, 11);
    c.beginPath(); c.arc(0, 0, 18, -0.4, Math.PI * 1.3);
    c.strokeStyle = OL; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#7be05a'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(16, -14); c.lineTo(17, -5); c.lineTo(9, -8); c.closePath(); fs(c, '#7be05a', 1.5);
  },
  ricochet(c) {
    for (const [x, y] of [[-14, 10], [14, 8]]) { circ(c, x, y, 6); fs(c, '#6bd35a', 1.8); }
    c.beginPath(); c.moveTo(-14, 10); c.lineTo(0, -12); c.lineTo(14, 8);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    iconArrow(c, -10, 3, -1, -11, '#f0dcb4', '#ffcf3f');
  },
  meteor(c) {
    for (const k of [0, 1, 2]) line(c, 4 + k * 4, -4 - k * 3, 16 + k * 4, -16 - k * 3, rgba('#ffb02e', 0.6), 3);
    circ(c, -2, 4, 10); fs(c, '#8a5a46', 2.2);
    flame(c, -2, 4, 6, '#ff8a2a', '#ffe08a');
  },
  storm(c) {
    for (const [x, y, r] of [[-8, -6, 8], [3, -10, 10], [12, -4, 7], [0, -2, 9]]) { circ(c, x, y, r); fs(c, '#8a96b5', 2); }
    bolt(c, 0, 12, 9);
  },
  giant(c) { c.scale(1.35, 1.35); iconArrow(c, -11, 11, 11, -11, '#f0dcb4', '#ffcf3f', 4.5); },
  rage(c) {
    glow(c, 0, 0, 26, '#ff3b3b', 0.6);
    circ(c, 0, 0, 15); fs(c, '#ff5a4a', 2.2);
    for (const s of [-1, 1]) {
      line(c, s * 10, -9, s * 3, -5, OL, 2.5);
      ell(c, s * 5, -1, 2.2, 2.6); c.fillStyle = OL; c.fill();
    }
    c.beginPath(); c.moveTo(-6, 9); c.lineTo(-3, 6); c.lineTo(0, 9); c.lineTo(3, 6); c.lineTo(6, 9);
    c.strokeStyle = OL; c.lineWidth = 2; c.stroke();
  },
  skull(c) {
    drawSkull(c, 0, -1, 14, '#ff4f6d', true);
    oline(c, -16, 16, 16, -16, '#ffcf3f', 2);
  },
  ankh(c) {
    glow(c, 0, 0, 28, '#ffcf3f', 0.6);
    c.beginPath(); c.ellipse(0, -9, 6, 8, 0, 0, TAU);
    c.strokeStyle = OL; c.lineWidth = 8; c.stroke(); c.strokeStyle = '#ffcf3f'; c.lineWidth = 4; c.stroke();
    oline(c, 0, 0, 0, 18, '#ffcf3f', 4);
    oline(c, -11, 3, 11, 3, '#ffcf3f', 4);
  },
  dragon(c) { c.scale(1.7, 1.7); drawHelper(c, { kind: 'dragon', x: 0, y: 2, seed: 0, aim: 0 }, 0); },
  arrows(c) {
    for (const x of [-12, 0, 12]) iconArrow(c, x, 16, x, -14, '#f0dcb4', x ? '#e6edf7' : '#ffcf3f');
    star(c, 13, 12, 5, '#ffcf3f');
  },
  phoenix(c) {
    flame(c, 0, 4, 15, '#ff6a2a', '#ffd35a');
    drawHeart(c, 0, 4, 6, '#ffffff');
  },
  hourglass(c) {
    rrect(c, -11, -18, 22, 4, 1.5); fs(c, '#8a5a36', 1.8);
    rrect(c, -11, 14, 22, 4, 1.5); fs(c, '#8a5a36', 1.8);
    c.beginPath(); c.moveTo(-8, -14); c.lineTo(8, -14); c.lineTo(1.5, 0); c.lineTo(8, 14); c.lineTo(-8, 14); c.lineTo(-1.5, 0); c.closePath();
    fs(c, '#d4f0ff', 2);
    c.beginPath(); c.moveTo(-5, 13); c.lineTo(5, 13); c.lineTo(0, 6); c.closePath(); c.fillStyle = '#ffcf3f'; c.fill();
    c.beginPath(); c.moveTo(-4, -10); c.lineTo(4, -10); c.lineTo(0, -4); c.closePath(); c.fill();
  },
  star(c) { star(c, 0, 0, 17, '#ffcf3f'); shine(c, -4, -5, 3, 2, 0.6); },
  reroll(c) {
    for (const s of [0, Math.PI]) {
      c.beginPath(); c.arc(0, 0, 14, s + 0.3, s + 2.6);
      c.strokeStyle = OL; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#7be05a'; c.lineWidth = 3.5; c.stroke();
      const ex = Math.cos(s + 2.6) * 14, ey = Math.sin(s + 2.6) * 14;
      c.save(); c.translate(ex, ey); c.rotate(s + 2.6 + Math.PI / 2);
      c.beginPath(); c.moveTo(6, 0); c.lineTo(-3, -6); c.lineTo(-3, 6); c.closePath(); fs(c, '#7be05a', 1.6);
      c.restore();
    }
  },
  gift(c) {
    rrect(c, -15, -6, 30, 22, 3); fs(c, '#47a6ff', 2);
    rrect(c, -17, -12, 34, 8, 2.5); fs(c, '#6fbaff', 2);
    rrect(c, -3.5, -12, 7, 28, 1); fs(c, '#ffcf3f', 1.6);
    for (const s of [-1, 1]) { ell(c, s * 6, -15, 6, 4, s * 0.5); fs(c, '#ffcf3f', 1.6); }
  },
  gem(c) { drawGem(c, 0, 0, 16); },
  slow(c) { ICONS.hourglass(c); },
  orbit(c) { ICONS.orbs(c); },
  // ability icons
  gust(c) {
    glow(c, 0, 0, 28, '#bfefff', 0.6);
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.arc(0, 0, 6 + i * 6, i * 1.4, i * 1.4 + 4.2);
      c.strokeStyle = OL; c.lineWidth = 6; c.stroke();
      c.strokeStyle = i === 1 ? '#3fb8d6' : '#e9f6ff'; c.lineWidth = 3; c.stroke();
    }
  },
  rain(c) {
    for (const [x, y] of [[-12, -4], [0, 2], [12, -6]]) iconArrow(c, x + 4, y - 16, x - 2, y + 14, '#f0dcb4', '#e6edf7');
    ell(c, 0, 17, 16, 4); c.fillStyle = 'rgba(255,224,122,0.5)'; c.fill();
  },
  blink(c) {
    glow(c, 4, 0, 30, '#c38eff', 0.8);
    for (const [y, l] of [[-8, 12], [0, 16], [8, 10]]) line(c, -20, y, -20 + l, y, 'rgba(255,255,255,0.75)', 2.4);
    star(c, 6, 0, 13, '#c38eff');
    shine(c, 3, -4, 3, 2, 0.7);
  },
  overdrive(c) {
    glow(c, -2, 4, 30, '#ffcf3f', 0.55);
    for (const [x, y] of [[-21, -10], [-23, 3], [-20, 15]]) line(c, x, y, x + 8, y, 'rgba(255,207,63,0.9)', 3);
    circ(c, -1, 5, 12); fs(c, '#3a3f4a', 2.4);
    shine(c, -5, 0, 4, 2.6, 0.45);
    oline(c, 7, -4, 12, -12, '#c9a46a', 2);
    star(c, 14, -15, 7, '#ffcf3f');
  },
  turret(c) {
    rrect(c, -14, 4, 28, 12, 4); fs(c, '#c45a1c', 2);
    rrect(c, 2, -9, 18, 7, 3); fs(c, '#5a6478', 2);
    circ(c, 0, -4, 11); fs(c, '#ff8a3d', 2);
    circ(c, 0, -4, 4); c.fillStyle = '#3fd1c8'; c.fill();
  },
};

// Draws icon `id` centred in a square canvas context of size `size`.
function drawIcon(ctx, id, size) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 48, size / 48);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  (ICONS[id] || ICONS.star)(ctx);
  ctx.restore();
}
