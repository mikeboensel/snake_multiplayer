// Canvas rendering, particles, and drawing
import { state, canvas, ctx, wallCanvas, wallCtx } from './state.js';
import { CELL, HEAD_AVATARS } from './constants.js';
import { playEatSound, playDeathSound } from './audio.js';
import { updateHUD } from './ui.js';
import { settings } from './effects-settings.js';

// ── Wall Rendering (offscreen) ───────────────────────
export function renderWalls() {
  wallCtx.clearRect(0, 0, 800, 600);
  wallCtx.shadowColor = '#4444aa';
  wallCtx.shadowBlur = 8;
  wallCtx.fillStyle = '#2a2a4a';
  for (const [x, y] of state.walls) {
    wallCtx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  wallCtx.shadowBlur = 0;
  wallCtx.strokeStyle = '#3a3a6a';
  wallCtx.lineWidth = 0.5;
  for (const [x, y] of state.walls) {
    wallCtx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
  }
}

// ── Screen Shake ─────────────────────────────────────
state.screenShake = { active: false, intensity: 0, endTime: 0 };

export function triggerScreenShake(intensityMultiplier = 1) {
  if (!settings.screenShake.enabled) return;
  state.screenShake = {
    active: true,
    intensity: settings.screenShake.intensity * intensityMultiplier,
    endTime: performance.now() + settings.screenShake.duration * 1000,
  };
}

function applyScreenShake() {
  if (!state.screenShake.active || performance.now() > state.screenShake.endTime) {
    state.screenShake.active = false;
    return { x: 0, y: 0 };
  }
  return {
    x: (Math.random() - 0.5) * state.screenShake.intensity * 2,
    y: (Math.random() - 0.5) * state.screenShake.intensity * 2,
  };
}

// ── Area Warp ────────────────────────────────────────
state.warps = [];

export function triggerWarp(x, y) {
  if (!settings.areaWarp.enabled) return;
  state.warps.push({
    x, y,
    endTime: performance.now() + settings.areaWarp.duration * 1000,
  });
}

function applyWarpToCoordinate(x, y) {
  let wx = x, wy = y;
  const now = performance.now();
  for (let i = state.warps.length - 1; i >= 0; i--) {
    const warp = state.warps[i];
    if (now > warp.endTime) {
      state.warps.splice(i, 1);
      continue;
    }
    const dx = x - warp.x;
    const dy = y - warp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < settings.areaWarp.radius) {
      const force = (1 - dist / settings.areaWarp.radius) * settings.areaWarp.intensity;
      wx += Math.sin(dist * 0.1) * force;
      wy += Math.cos(dist * 0.1) * force;
    }
  }
  return { x: wx, y: wy };
}

// ── Particles ────────────────────────────────────────
export function processEatenEvents(events) {
  for (const ev of events) {
    const [gx, gy, color, pid] = ev;
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;

    // Trigger screen shake on eat
    if (settings.screenShake.enabled && settings.screenShake.triggers.includes('eat')) {
      triggerScreenShake(1);
    }

    // Trigger warp on eat
    if (settings.areaWarp.enabled) {
      triggerWarp(cx, cy);
    }

    if (!settings.particles.enabled) {
      if (pid === state.myId) playEatSound();
      continue;
    }

    const count = settings.particles.count;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = settings.particles.velocityMin + Math.random() * (settings.particles.velocityMax - settings.particles.velocityMin);
      state.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: settings.particles.life * (0.9 + Math.random() * 0.2),
        maxLife: settings.particles.life,
        color,
        size: settings.particles.sizeMin + Math.random() * (settings.particles.sizeMax - settings.particles.sizeMin),
      });
    }
    if (pid === state.myId) playEatSound();
  }
}

export function processDeathEvent(pid, x, y, color) {
  // Trigger screen shake on death
  if (settings.screenShake.enabled && settings.screenShake.triggers.includes('death')) {
    triggerScreenShake(2.5); // Higher intensity for death
  }

  if (!settings.particles.enabled) return;

  const cx = x * CELL + CELL / 2;
  const cy = y * CELL + CELL / 2;

  const count = settings.particles.count * 2; // Double particles for death
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = settings.particles.velocityMin * 1.5 + Math.random() * (settings.particles.velocityMax * 1.5 - settings.particles.velocityMin * 1.5);
    state.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: settings.particles.life * 1.5, // Longer lasting particles
      maxLife: settings.particles.life * 1.5,
      color,
      size: settings.particles.sizeMin + Math.random() * (settings.particles.sizeMax - settings.particles.sizeMin + 2),
    });
  }
}

export function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ── Interpolation helper ─────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateSegments(prevSegs, currSegs, t) {
  if (!prevSegs || !currSegs || prevSegs.length === 0) return currSegs || [];
  const result = [];
  const len = currSegs.length;
  for (let i = 0; i < len; i++) {
    if (i < prevSegs.length) {
      result.push([
        lerp(prevSegs[i][0], currSegs[i][0], t),
        lerp(prevSegs[i][1], currSegs[i][1], t),
      ]);
    } else {
      result.push([currSegs[i][0], currSegs[i][1]]);
    }
  }
  return result;
}

// ── Drawing ──────────────────────────────────────────
let lastDraw = performance.now();

function drawLoop(now) {
  const dt = (now - lastDraw) / 1000;
  lastDraw = now;
  state.animFrame++;
  updateParticles(dt);

  // Apply screen shake before clearing
  const shake = applyScreenShake();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  ctx.clearRect(0, 0, 800, 600);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 800, 600);

  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= 800; x += CELL) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
  }
  for (let y = 0; y <= 600; y += CELL) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
  }

  ctx.drawImage(wallCanvas, 0, 0);

  if (!state.currState) {
    requestAnimationFrame(drawLoop);
    return;
  }

  const tickMs = 100;
  const elapsed = now - state.lastStateTime;
  const t = Math.min(elapsed / tickMs, 1);

  // Food
  const pulse = settings.foodPulse.enabled
    ? 0.7 + 0.3 * settings.foodPulse.intensity * Math.sin(now / settings.foodPulse.speed)
    : 1;
  const glowMult = settings.glow.enabled ? settings.glow.intensity : 0;
  ctx.shadowColor = '#aaff00';
  for (const [fx, fy] of state.currState.food) {
    const warped = settings.areaWarp.enabled ? applyWarpToCoordinate(fx * CELL + CELL / 2, fy * CELL + CELL / 2) : { x: fx * CELL + CELL / 2, y: fy * CELL + CELL / 2 };
    ctx.shadowBlur = 12 * pulse * glowMult;
    ctx.fillStyle = `rgba(170,255,0,${0.8 + 0.2 * pulse})`;
    const pad = 3;
    ctx.beginPath();
    ctx.arc(warped.x, warped.y, CELL / 2 - pad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Snakes
  const players = state.currState.players;
  const prevPlayers = state.prevState ? state.prevState.players : {};

  for (const [pid, p] of Object.entries(players)) {
    if (!p.alive || !p.segments || p.segments.length === 0) continue;

    const prev = prevPlayers[pid];
    const prevSegs = prev && prev.alive ? prev.segments : null;
    const segs = interpolateSegments(prevSegs, p.segments, t);

    ctx.shadowColor = p.color;
    const glowMult = settings.glow.enabled ? settings.glow.intensity : 0;

    for (let i = segs.length - 1; i >= 0; i--) {
      const [sx, sy] = segs[i];
      const isHead = i === 0;
      const brightness = isHead ? 1 : 0.7;
      ctx.shadowBlur = (isHead ? 15 : 8) * glowMult;
      ctx.fillStyle = isHead ? brighten(p.color, 40) : p.color;
      ctx.globalAlpha = brightness;
      const pad = isHead ? 1 : 2;

      const warped = settings.areaWarp.enabled ? applyWarpToCoordinate(sx * CELL, sy * CELL) : { x: sx * CELL, y: sy * CELL };
      ctx.fillRect(warped.x + pad, warped.y + pad, CELL - pad * 2, CELL - pad * 2);

      // Draw emoji on head
      if (isHead && p.head_avatar) {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        const emoji = HEAD_AVATARS[p.head_avatar];
        if (emoji) {
          ctx.font = `${CELL - 4}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textPos = settings.areaWarp.enabled ? applyWarpToCoordinate(sx * CELL + CELL / 2, sy * CELL + CELL / 2) : { x: sx * CELL + CELL / 2, y: sy * CELL + CELL / 2 };
          ctx.fillText(emoji, textPos.x, textPos.y + 1);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Clean up expired warps
  state.warps = state.warps.filter(w => now < w.endTime);

  drawParticles();

  updateHUD(state.currState);

  ctx.restore();

  requestAnimationFrame(drawLoop);
}

export async function startGame() {
  lastDraw = performance.now();
  requestAnimationFrame(drawLoop);
}

function brighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

export { playDeathSound };
