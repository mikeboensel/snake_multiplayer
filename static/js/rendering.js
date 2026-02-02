// Canvas rendering, particles, and drawing
import { state, canvas, ctx, wallCanvas, wallCtx } from './state.js';
import { CELL, HEAD_AVATARS } from './constants.js';
import { playEatSound, playDeathSound } from './audio.js';
import { updateHUD } from './ui.js';

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

// ── Particles ────────────────────────────────────────
export function processEatenEvents(events) {
  for (const ev of events) {
    const [gx, gy, color, pid] = ev;
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const speed = 60 + Math.random() * 80;
      state.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.1,
        maxLife: 0.4,
        color,
        size: 2 + Math.random() * 2,
      });
    }
    if (pid === state.myId) playEatSound();
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
  const pulse = 0.7 + 0.3 * Math.sin(now / 150);
  ctx.shadowColor = '#aaff00';
  for (const [fx, fy] of state.currState.food) {
    ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = `rgba(170,255,0,${0.8 + 0.2 * pulse})`;
    const pad = 3;
    ctx.beginPath();
    ctx.arc(fx * CELL + CELL / 2, fy * CELL + CELL / 2, CELL / 2 - pad, 0, Math.PI * 2);
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

    for (let i = segs.length - 1; i >= 0; i--) {
      const [sx, sy] = segs[i];
      const isHead = i === 0;
      const brightness = isHead ? 1 : 0.7;
      ctx.shadowBlur = isHead ? 15 : 8;
      ctx.fillStyle = isHead ? brighten(p.color, 40) : p.color;
      ctx.globalAlpha = brightness;
      const pad = isHead ? 1 : 2;
      ctx.fillRect(sx * CELL + pad, sy * CELL + pad, CELL - pad * 2, CELL - pad * 2);

      // Draw emoji on head
      if (isHead && p.head_avatar) {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        const emoji = HEAD_AVATARS[p.head_avatar];
        if (emoji) {
          ctx.font = `${CELL - 4}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, sx * CELL + CELL / 2, sy * CELL + CELL / 2 + 1);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  drawParticles();

  updateHUD(state.currState);

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
