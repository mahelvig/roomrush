'use strict';
// Active abilities: one per hero (ABILITIES in config.js), used with the round button at the bottom
// right, Space or E. The cooldown runs on G.player.abilityCd; what an ability leaves in the room
// (arrow rain, a blink explosion, a turret) lives in G.abilityFx until it is done.

const abilityLevel = hero => save.abilities[hero.id] || 0;
// What one volley of the hero's own shots is worth, so abilities grow with the build.
const abilityPower = p => playerAtk(p) * p.s.dmgMul * (1 + p.s.front) * (1 + p.s.multishot);
const abilityCooldown = hero => ABILITIES[hero.ability].cd * 0.9 ** abilityLevel(hero);
const abilityReady = () => {
  const p = G.player;
  return !!p && !p.dead && G.state === 'play' && !G.cleared && p.abilityCd <= 0;
};

function useAbility() {
  if (!abilityReady()) return false;
  const p = G.player;
  ABILITY_USE[p.hero.ability](p, abilityLevel(p.hero));
  p.abilityCd = abilityCooldown(p.hero);
  return true;
}

const ABILITY_USE = {
  // Rook: arrows fall on the area round the target (or ahead of you) for 2 seconds
  rain(p, L) {
    const t = p.target && canTarget(p.target) ? p.target : null;
    const x = clamp(t ? t.x : p.x + Math.cos(p.aim) * 140, ROOM_X + 20, ROOM_X + ROOM_W - 20);
    const y = clamp(t ? t.y : p.y + Math.sin(p.aim) * 140, ROOM_Y + 20, ROOM_Y + ROOM_H - 20);
    const r = 70 + 4 * L;
    const drops = Array.from({ length: 16 }, () => ({ dx: rand(-1, 1) * r * 0.8, dy: rand(-1, 1) * r * 0.55, ph: rand(0, 1) }));
    G.abilityFx.push({ kind: 'rain', x, y, r, t: 2, max: 2, tick: 0, dmg: abilityPower(p) * (0.6 + 0.1 * L), drops });
    Sound.play('shoot');
  },

  // Nova: teleport the way you are moving (backwards from your aim when standing still),
  // and the spot you left explodes a moment later
  blink(p, L) {
    const v = Input.vector();
    const a = v.mag > 0.1 ? Math.atan2(v.y, v.x) : p.aim + Math.PI;
    const ox = p.x, oy = p.y;
    for (let d = 130; d >= 20; d -= 10) {
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x < ROOM_X + p.r || x > ROOM_X + ROOM_W - p.r || y < ROOM_Y + p.r || y > ROOM_Y + ROOM_H - p.r) continue;
      if (blocksWalk(tileAt(x, y))) continue;
      p.x = x; p.y = y;
      break;
    }
    resolveTiles(p, true);
    p.vx = p.vy = 0;
    p.invuln = Math.max(p.invuln, 0.4);
    FX.burst(ox, oy, ['#c38eff', '#ffffff'], 14, { min: 40, max: 140 });
    FX.burst(p.x, p.y, ['#c38eff', '#ffffff'], 14, { min: 40, max: 140 });
    G.abilityFx.push({ kind: 'nova', x: ox, y: oy, r: 70 + 4 * L, t: 0.35, max: 0.35, dmg: abilityPower(p) * (2.5 + 0.5 * L) });
    Sound.play('blink');
  },

  // Pip: a turret that shoots the nearest enemy
  turret(p, L) {
    const life = 8 + L;
    G.abilityFx.push({ kind: 'turret', x: p.x, y: p.y + 4, t: life, max: life, cd: 0.3, aim: p.aim, dmg: abilityPower(p) * (0.3 + 0.04 * L) });
    FX.burst(p.x, p.y + 4, ['#ff8a3d', '#3fd1c8'], 10, { min: 30, max: 100 });
    Sound.play('door');
  },
};

function updateAbilities(dt, p) {
  if (p.abilityCd > 0) p.abilityCd = Math.max(0, p.abilityCd - dt);
  const fx = G.abilityFx;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    if (!f) continue;
    f.t -= dt;
    if (f.kind === 'rain') {
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.2;
        for (const e of G.enemies) {
          if (canTarget(e) && dist(e.x, e.y, f.x, f.y) < f.r + e.r) hurtEnemy(e, f.dmg, { color: '#ffe07a', small: true });
        }
      }
    } else if (f.kind === 'nova' && f.t <= 0) {
      for (const e of G.enemies) {
        if (!canTarget(e) || dist(e.x, e.y, f.x, f.y) > f.r + e.r) continue;
        hurtEnemy(e, f.dmg, { color: '#d9b8ff' });
        if (!e.boss && !e.anchored) {
          const a = angleTo(f.x, f.y, e.x, e.y);
          e.kbx = Math.cos(a) * 320; e.kby = Math.sin(a) * 320;
        }
      }
      FX.ring(f.x, f.y, f.r * 1.2, '#c38eff', 0.45, 7);
      FX.burst(f.x, f.y, ['#c38eff', '#ffffff', '#7a4fe0'], 22, { min: 60, max: 220 });
      FX.kick(5);
      Sound.play('explode');
    } else if (f.kind === 'turret') {
      f.cd -= dt;
      const tgt = nearestEnemy(f.x, f.y, null, 420);
      if (tgt) f.aim += angleDiff(f.aim, angleTo(f.x, f.y - 8, tgt.x, tgt.y)) * Math.min(1, dt * 14);
      if (tgt && f.cd <= 0) {
        f.cd = 0.25;
        const a = f.aim;
        G.shots.push({
          x: f.x + Math.cos(a) * 11, y: f.y - 8 + Math.sin(a) * 11, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460,
          r: 3, dmg: f.dmg, kind: 'bolt', glow: '#3fd1c8', size: 0.7, pierce: 0, bounce: 0, ric: 0, hit: [], life: 1.6, fromAbility: true,
        });
        Sound.play('bolt');
      }
    }
    if (f.t <= 0 && fx[i] === f) fx.splice(i, 1);
  }
}

// ---------- drawing ----------

// On the ground: the rain area and the spot about to explode.
function drawAbilityGround(ctx, t) {
  for (const f of G.abilityFx) {
    if (f.kind === 'rain') {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(1, 0.62);
      ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU);
      ctx.fillStyle = 'rgba(255,224,122,0.12)'; ctx.fill();
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.strokeStyle = 'rgba(255,224,122,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'nova') {
      const k = 1 - f.t / f.max;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fillStyle = `rgba(195,142,255,${0.1 + 0.15 * k})`; ctx.fill();
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU);
      ctx.strokeStyle = 'rgba(195,142,255,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
}

// Above the ground: the falling arrows and the turret.
function drawAbilityFx(ctx, t) {
  for (const f of G.abilityFx) {
    if (f.kind === 'rain') {
      for (const d of f.drops) {
        const k = (t * 2.6 + d.ph) % 1;
        const x = f.x + d.dx + 18 * (1 - k), y = f.y + d.dy - 90 * (1 - k);
        ctx.globalAlpha = Math.min(1, k * 3) * Math.min(1, f.t * 2);
        oline(ctx, x + 4, y - 11, x, y, '#f0dcb4', 1.6);
        ctx.beginPath(); ctx.moveTo(x - 1, y + 4); ctx.lineTo(x - 3.5, y - 2); ctx.lineTo(x + 2.5, y - 1); ctx.closePath();
        fs(ctx, '#e6edf7', 1.2);
      }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'turret') {
      drawShadow(ctx, f.x, f.y + 4, 11);
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.t < 1.5 && Math.floor(t * 10) % 2) ctx.globalAlpha = 0.5;   // blinks before it goes
      rrect(ctx, -9, -4, 18, 9, 3); fs(ctx, '#c45a1c', 2);
      ctx.translate(0, -8);
      ctx.save();
      ctx.rotate(f.aim);
      rrect(ctx, 2, -2.5, 12, 5, 2); fs(ctx, '#5a6478', 1.8);
      ctx.restore();
      circ(ctx, 0, 0, 7); fs(ctx, '#ff8a3d', 2);
      circ(ctx, 0, 0, 2.6); ctx.fillStyle = '#3fd1c8'; ctx.fill();
      ctx.restore();
    }
  }
}
