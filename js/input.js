'use strict';
// Floating joystick for touch (put a thumb down anywhere and drag) plus WASD/arrow keys.

const Input = {
  keys: new Set(),
  stick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  R: 54,            // joystick radius in CSS pixels
  el: null,
  enabled: () => true,

  init(el, enabled) {
    this.el = el;
    if (enabled) this.enabled = enabled;
    const pos = e => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // listen on the whole window: a thumb on the empty sides (wide screens) steers too
    const pad = document.getElementById('pad');
    window.addEventListener('pointerdown', e => {
      if (e.target !== el && e.target !== pad) return;
      Sound.init();
      if (this.stick.active || !this.enabled()) return;
      const [x, y] = pos(e);
      Object.assign(this.stick, { active: true, id: e.pointerId, ox: x, oy: y, x, y });
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    window.addEventListener('pointermove', e => {
      const s = this.stick;
      if (!s.active || e.pointerId !== s.id) return;
      const [x, y] = pos(e);
      s.x = x; s.y = y;
      // drag the base along so the thumb never has to come back to where it started
      const dx = x - s.ox, dy = y - s.oy, d = Math.hypot(dx, dy);
      if (d > this.R) {
        s.ox = x - (dx / d) * this.R;
        s.oy = y - (dy / d) * this.R;
      }
      e.preventDefault();
    });
    const end = e => {
      if (e.pointerId === this.stick.id) this.release();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('lostpointercapture', end);

    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      Sound.init();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
  },

  release() {
    Object.assign(this.stick, { active: false, id: null });
  },

  // Movement direction with length 0..1.
  vector() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      return { x: x / d, y: y / d, mag: 1 };
    }
    const s = this.stick;
    if (s.active) {
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      const mag = clamp(d / this.R, 0, 1);
      if (mag > 0.14) return { x: dx / d, y: dy / d, mag: Math.min(1, (mag - 0.14) / 0.6) };
    }
    return { x: 0, y: 0, mag: 0 };
  },
};
