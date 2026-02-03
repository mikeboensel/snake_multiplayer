// Canvas rendering, particles, and drawing
import { state, canvas, ctx, wallCanvas, wallCtx } from './state.js';
import { CELL, HEAD_AVATARS, canvasW, canvasH } from './constants.js';
import { playEatSound, playDeathSound } from './audio.js';
import { updateHUD } from './ui.js';
import { settings } from './effects-settings.js';

// Custom head image cache
const customHeadImages = new Map();  // player_id -> HTMLImageElement

export function preloadCustomHeadImage(playerId, dataUrl) {
  if (customHeadImages.has(playerId)) return customHeadImages.get(playerId);
  const img = new Image();
  img.src = dataUrl;
  customHeadImages.set(playerId, img);
  return img;
}

export function clearCustomHeadCache() {
  customHeadImages.clear();
}

// ── Wall Rendering (offscreen) ───────────────────────
export function renderWalls() {
  wallCtx.clearRect(0, 0, canvasW(), canvasH());
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

// ── Particle Pattern Generators ──────────────────────
function varyColor(hexColor, variation) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Convert to HSL for hue shift
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r / 255) h = ((g - b) / 255 / d + (g < b ? 6 : 0)) / 6;
    else if (max === g / 255) h = ((b - r) / 255 / d + 2) / 6;
    else h = ((r - g) / 255 / d + 4) / 6;
  }

  // Apply random hue shift
  h = (h + (Math.random() * 2 - 1) * variation + 1) % 1;

  // Convert back to RGB
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let rOut, gOut, bOut;
  if (s === 0) {
    rOut = gOut = bOut = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rOut = hue2rgb(p, q, h + 1/3);
    gOut = hue2rgb(p, q, h);
    bOut = hue2rgb(p, q, h - 1/3);
  }

  return `rgb(${Math.round(rOut * 255)},${Math.round(gOut * 255)},${Math.round(bOut * 255)})`;
}

function createParticlePattern(pattern, cx, cy, count, baseColor, opts = {}) {
  const particles = [];
  const ps = settings.particles;
  const angleJitter = ps.angleJitter || 0.5;
  const colorVar = ps.colorVariation || 0.15;
  const gravity = opts.gravity || 0;
  const velocityMult = opts.velocityMult || 1;
  const lifeMult = opts.lifeMult || 1;

  for (let i = 0; i < count; i++) {
    let angle, speed, vx, vy;
    const baseAngle = (Math.PI * 2 * i) / count;
    const jitter = (Math.random() * 2 - 1) * angleJitter;
    const particleColor = Math.random() < 0.5 ? baseColor : varyColor(baseColor, colorVar);

    switch (pattern) {
      case 'spiral':
        angle = baseAngle + jitter + (i / count) * Math.PI;
        speed = (ps.velocityMin + Math.random() * (ps.velocityMax - ps.velocityMin)) * velocityMult;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        break;

      case 'ring':
        angle = baseAngle + jitter * 0.3; // Less jitter for ring uniformity
        speed = (ps.velocityMin * 0.8 + ps.velocityMax * 0.2 + Math.random() * 20) * velocityMult;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        break;

      case 'sparkle':
        angle = Math.random() * Math.PI * 2;
        speed = (Math.random() * (ps.velocityMax - ps.velocityMin) + ps.velocityMin) * velocityMult * (0.5 + Math.random());
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        break;

      case 'burst':
      default:
        angle = baseAngle + jitter;
        speed = (ps.velocityMin + Math.random() * (ps.velocityMax - ps.velocityMin)) * velocityMult;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
        break;
    }

    particles.push({
      x: cx, y: cy,
      vx, vy,
      gravity: gravity > 0 ? gravity * (0.5 + Math.random()) : 0,
      life: ps.life * lifeMult * (0.8 + Math.random() * 0.4),
      maxLife: ps.life * lifeMult,
      color: particleColor,
      size: ps.sizeMin + Math.random() * (ps.sizeMax - ps.sizeMin + (opts.sizeBoost || 0)),
    });
  }

  return particles;
}

function randomPattern() {
  const patterns = settings.particles.patterns || ['burst'];
  return patterns[Math.floor(Math.random() * patterns.length)];
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

    const pattern = randomPattern();
    const newParticles = createParticlePattern(
      pattern, cx, cy,
      settings.particles.count,
      color
    );
    state.particles.push(...newParticles);

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

  const pattern = randomPattern();
  const gravity = 50 + Math.random() * 100; // Random gravity 50-150 px/s²

  const newParticles = createParticlePattern(
    pattern, cx, cy,
    settings.particles.count * 2, // Double particles for death
    color,
    {
      gravity,
      velocityMult: 1.5,
      lifeMult: 1.5,
      sizeBoost: 2,
    }
  );
  state.particles.push(...newParticles);
}

export function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) {
      p.vy += p.gravity * dt;
    }
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

  ctx.clearRect(0, 0, canvasW(), canvasH());

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasW(), canvasH());

  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= canvasW(); x += CELL) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH()); ctx.stroke();
  }
  for (let y = 0; y <= canvasH(); y += CELL) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW(), y); ctx.stroke();
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

      if (!isHead) {
        ctx.fillRect(warped.x + pad, warped.y + pad, CELL - pad * 2, CELL - pad * 2);
      }

      // Draw emoji or custom head on snake head
      if (isHead) {
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        const textPos = settings.areaWarp.enabled ? applyWarpToCoordinate(sx * CELL + CELL / 2, sy * CELL + CELL / 2) : { x: sx * CELL + CELL / 2, y: sy * CELL + CELL / 2 };

        // Calculate dynamic head size
        const baseSize = CELL - 4;
        const avatarScale = settings.avatarSize?.scale || 1;
        const headSize = Math.round(baseSize * avatarScale);
        const radius = headSize / 2;

        if (p.custom_head) {
          // Draw custom head image
          const img = preloadCustomHeadImage(pid, p.custom_head);
          if (img.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(textPos.x, textPos.y, radius, 0, Math.PI * 2);
            ctx.clip();
            const offset = headSize / 2;
            ctx.drawImage(img, textPos.x - offset, textPos.y - offset, headSize, headSize);
            ctx.restore();
          } else {
            // Fallback to emoji if image not loaded
            const emoji = HEAD_AVATARS[p.head_avatar];
            if (emoji) {
              ctx.font = `${headSize}px serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(emoji, textPos.x, textPos.y + 1);
            }
          }
        } else if (p.head_avatar) {
          // Draw emoji
          const emoji = HEAD_AVATARS[p.head_avatar];
          if (emoji) {
            ctx.font = `${headSize}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, textPos.x, textPos.y + 1);
          }
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

// ── Firework Particles ──────────────────────────────
const FIREWORK_COLORS = ['#0ff', '#f0f', '#ff0', '#0f0', '#f55', '#55f', '#fa0', '#0fa'];
let fireworkInterval = null;

export function startFireworks() {
  if (fireworkInterval) return;
  fireworkInterval = setInterval(() => {
    const cx = Math.random() * canvasW();
    const cy = Math.random() * (canvasH() * 0.67) + 50;
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 60 + Math.random() * 120;
      state.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 80,
        life: 1.0 + Math.random() * 0.4,
        maxLife: 1.2,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }, 600);
}

export function stopFireworks() {
  if (fireworkInterval) {
    clearInterval(fireworkInterval);
    fireworkInterval = null;
  }
}

export { playDeathSound };
