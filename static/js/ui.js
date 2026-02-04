// UI management: join screen, lobby, HUD, pickers
import { state } from './state.js';
import { NEON_COLORS, HEAD_AVATARS } from './constants.js';
import { sendGameOptions, sendReady, sendAddAI, sendRemoveAI, sendReturnToLobby, sendPause, sendInput } from './networking.js';
import { stopFireworks } from './rendering.js';
import { settings, saveSettings, resetSettings } from './effects-settings.js';
import { playMusic, pauseMusic, setMusicVolume, updateMusicMasterVolume } from './audio.js';
import { ImageProcessor, CropTool } from './image-processor.js';

// ── Build Pickers ────────────────────────────────────
export function buildPickers() {
  const colorPicker = document.getElementById('color-picker');
  NEON_COLORS.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'color-opt' + (i === 0 ? ' selected' : '');
    el.style.background = c;
    el.style.color = c;
    el.onclick = () => {
      colorPicker.querySelectorAll('.color-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      state.selectedColor = c;
    };
    colorPicker.appendChild(el);
  });
  state.selectedColor = NEON_COLORS[0];

  const avatarPicker = document.getElementById('avatar-picker');
  Object.entries(HEAD_AVATARS).forEach(([key, emoji], i) => {
    const el = document.createElement('div');
    el.className = 'avatar-opt' + (i === 0 ? ' selected' : '');
    el.textContent = emoji;
    el.onclick = () => {
      avatarPicker.querySelectorAll('.avatar-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      state.selectedAvatar = key;
    };
    avatarPicker.appendChild(el);
  });
}

// ── Lobby ────────────────────────────────────────────
export function updateLobby(players, gameOptions) {
  const container = document.getElementById('lobby-players');
  const humanPlayers = players.filter(p => !p.is_ai);
  const aiPlayers = players.filter(p => p.is_ai);
  const readyCount = humanPlayers.filter(p => p.ready).length;
  document.getElementById('lobby-ready-count').textContent = `${readyCount}/${humanPlayers.length} ready`;

  const avatarScale = settings.avatarSize?.scale || 1;
  const imageSize = Math.round(24 * avatarScale);
  const emojiSize = (1.4 * avatarScale).toFixed(1);

  container.innerHTML = humanPlayers.map(p => {
    let avatarHtml;
    if (p.custom_head) {
      avatarHtml = `<img src="${esc(p.custom_head)}" style="width:${imageSize}px;height:${imageSize}px;border-radius:50%;" alt="">`;
    } else {
      const emoji = HEAD_AVATARS[p.head_avatar] || HEAD_AVATARS.angel;
      avatarHtml = `<span style="font-size:${emojiSize}em">${emoji}</span>`;
    }

    let badge;
    if (p.location === 'playing') {
      badge = '<span class="lobby-badge playing">PLAYING</span>';
    } else if (p.location === 'spectating') {
      badge = '<span class="lobby-badge spectating">SPECTATING</span>';
    } else if (p.ready) {
      badge = '<span class="lobby-badge ready">READY</span>';
    } else {
      badge = '<span class="lobby-badge not-ready">NOT READY</span>';
    }

    return `<div class="lobby-entry">
      ${avatarHtml}
      <span class="color-swatch" style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${p.color}"></span>
      <span class="lobby-name" style="color:${p.color}">${esc(p.name)}</span>
      ${badge}
    </div>`;
  }).join('');

  // Update AI list
  const aiList = document.getElementById('ai-list');
  aiList.innerHTML = aiPlayers.map(p => {
    const emoji = HEAD_AVATARS[p.head_avatar] || HEAD_AVATARS.angel;
    return `<div class="ai-entry">
      <span style="font-size:1.2em">${emoji}</span>
      <span class="color-swatch" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color}"></span>
      <span style="color:${p.color}">${esc(p.name)}</span>
      <span class="ai-badge">AI</span>
      <button class="ai-remove" data-pid="${esc(p.pid)}">✕</button>
    </div>`;
  }).join('');

  // Add event listeners to remove buttons
  aiList.querySelectorAll('.ai-remove').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.getAttribute('data-pid');
      sendRemoveAI(pid);
    };
  });

  syncOptions(gameOptions);
}

// ── Utility ──────────────────────────────────────────
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

/** Set range input value from a client X position; dispatches input event. */
function setRangeValueFromClientX(input, clientX) {
  const rect = input.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const step = parseFloat(input.step) || 1;
  let value = min + frac * (max - min);
  if (step) value = Math.round(value / step) * step;
  value = Math.max(min, Math.min(max, value));
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Enable drag on all range inputs (in addition to click). */
export function enableSliderDrag() {
  document.querySelectorAll('input[type="range"]').forEach((input) => {
    const onPointer = (clientX) => setRangeValueFromClientX(input, clientX);

    const onMouseMove = (e) => {
      onPointer(e.clientX);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    input.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onPointer(e.clientX);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp, { once: true });
    });

    const onTouchMove = (e) => {
      if (e.touches.length) onPointer(e.touches[0].clientX);
    };
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
    };
    input.addEventListener('touchstart', (e) => {
      if (e.touches.length) onPointer(e.touches[0].clientX);
      document.addEventListener('touchmove', onTouchMove, { capture: true });
      document.addEventListener('touchend', onTouchEnd, { capture: true, once: true });
    }, { passive: true });
  });
}

// ── Game Options ─────────────────────────────────────
const TICK_RATE_OPTIONS = [
  { label: 'Slow', rate: 5 },
  { label: 'Relaxed', rate: 8 },
  { label: 'Normal', rate: 10 },
  { label: 'Fast', rate: 15 },
  { label: 'Ludicrous', rate: 20 }
];

export function setupGameOptions() {
  const optFoodAdvance = document.getElementById('opt-food-advance');
  const optFoodCount = document.getElementById('opt-food-count');
  const optCollisions = document.getElementById('opt-collisions');
  const optLives = document.getElementById('opt-lives');
  const optBotDifficulty = document.getElementById('opt-bot-difficulty');
  const optTickRate = document.getElementById('opt-tick-rate');

  optFoodAdvance.addEventListener('input', () => {
    const v = parseInt(optFoodAdvance.value, 10);
    document.getElementById('val-food-advance').textContent = v;
    sendGameOptions({ food_to_advance: v });
  });

  optFoodCount.addEventListener('input', () => {
    const v = parseInt(optFoodCount.value, 10);
    document.getElementById('val-food-count').textContent = v;
    sendGameOptions({ food_count: v });
  });

  optCollisions.addEventListener('click', () => {
    const current = optCollisions.classList.contains('on');
    sendGameOptions({ collisions: !current });
  });

  optLives.addEventListener('input', () => {
    const v = parseInt(optLives.value, 10);
    document.getElementById('val-lives').textContent = v;
    sendGameOptions({ lives: v });
  });

  optBotDifficulty.addEventListener('input', () => {
    const v = parseInt(optBotDifficulty.value, 10);
    const labels = ['Easy', 'Medium', 'Hard'];
    document.getElementById('val-bot-difficulty').textContent = labels[v];
    sendGameOptions({ bot_difficulty: v });
  });

  const debouncedTickRate = debounce((rate) => sendGameOptions({ tick_rate: rate }), 150);
  optTickRate.addEventListener('input', () => {
    const idx = parseInt(optTickRate.value, 10);
    const opt = TICK_RATE_OPTIONS[idx];
    document.getElementById('val-tick-rate').textContent = opt.label;
    debouncedTickRate(opt.rate);
  });
}

export function syncOptions(opts) {
  if (!opts) return;
  const optFoodAdvance = document.getElementById('opt-food-advance');
  const optFoodCount = document.getElementById('opt-food-count');
  const optCollisions = document.getElementById('opt-collisions');
  const optLives = document.getElementById('opt-lives');
  const optBotDifficulty = document.getElementById('opt-bot-difficulty');

  optFoodAdvance.value = opts.food_to_advance;
  document.getElementById('val-food-advance').textContent = opts.food_to_advance;
  optFoodCount.value = opts.food_count;
  document.getElementById('val-food-count').textContent = opts.food_count;
  if (opts.collisions) {
    optCollisions.classList.add('on');
    optCollisions.textContent = 'ON';
  } else {
    optCollisions.classList.remove('on');
    optCollisions.textContent = 'OFF';
  }
  if (opts.lives !== undefined) {
    optLives.value = opts.lives;
    document.getElementById('val-lives').textContent = opts.lives;
  }
  if (opts.bot_difficulty !== undefined) {
    optBotDifficulty.value = opts.bot_difficulty;
    const labels = ['Easy', 'Medium', 'Hard'];
    document.getElementById('val-bot-difficulty').textContent = labels[opts.bot_difficulty];
  }
  if (opts.tick_rate !== undefined) {
    const optTickRate = document.getElementById('opt-tick-rate');
    // Find closest matching index
    let bestIdx = 2; // default to Normal
    let bestDiff = Infinity;
    TICK_RATE_OPTIONS.forEach((opt, i) => {
      const diff = Math.abs(opt.rate - opts.tick_rate);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    optTickRate.value = bestIdx;
    document.getElementById('val-tick-rate').textContent = TICK_RATE_OPTIONS[bestIdx].label;
  }
}

// ── HUD ──────────────────────────────────────────────
export function updateHUD(state) {
  // Track spectator state
  if (state.isSpectating === undefined) {
    state.isSpectating = false;
  }

  const levelInfo = document.getElementById('level-info');
  const spectatorBanner = document.getElementById('spectator-banner');
  if (state.isSpectating) {
    levelInfo.textContent = 'SPECTATING';
    spectatorBanner.classList.add('visible');
  } else {
    levelInfo.textContent = `LEVEL ${state.level}`;
    spectatorBanner.classList.remove('visible');
  }
  document.getElementById('food-counter').textContent = `FOOD: ${state.food_eaten}/${state.food_target}`;

  const entries = document.getElementById('legend-entries');
  const sorted = Object.entries(state.players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.score - a.score);

  const avatarScale = settings.avatarSize?.scale || 1;
  const imageSize = Math.round(14 * avatarScale);
  const emojiSize = (0.9 * avatarScale).toFixed(1);

  entries.innerHTML = sorted.map(p => {
    const hearts = p.game_over ? '\u{1F480}' : '\u2764'.repeat(Math.max(0, p.lives));
    const isMe = p.id === window.gameState?.myId;
    const cls = (isMe ? ' me' : '') + (p.game_over ? ' dead' : '');

    let avatarHtml;
    if (p.custom_head) {
      avatarHtml = `<img src="${esc(p.custom_head)}" style="width:${imageSize}px;height:${imageSize}px;border-radius:50%;" alt="">`;
    } else {
      const emoji = HEAD_AVATARS[p.head_avatar] || '';
      avatarHtml = `<span style="font-size:${emojiSize}em">${emoji}</span>`;
    }

    const aiBadge = p.is_ai ? '<span style="color:#fc0;font-size:0.7em;margin-left:2px">AI</span>' : '';
    const spectatorBadge = (isMe && state.isSpectating) ? '<span class="spectator-badge">SPECTATOR</span>' : '';
    return `<div class="entry${cls}"><span class="color-swatch" style="background:${p.color}"></span>${avatarHtml}<span class="pname" style="color:${p.color}">${esc(p.name)}</span>${aiBadge}${spectatorBadge}<span class="lives">${hearts}</span><span class="pscore">${p.score}</span></div>`;
  }).join('');

  const deathMsg = document.getElementById('death-msg');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const globalState = window.gameState;
  const me = globalState?.myId && state.players[globalState.myId];
  if (globalState?.myGameOver) {
    // Player permanently eliminated — show gameover overlay
    deathMsg.style.display = 'none';
    gameoverOverlay.style.display = 'flex';
  } else if (me && !me.alive) {
    deathMsg.textContent = `YOU DIED \u2014 ${me.lives} ${me.lives === 1 ? 'life' : 'lives'} left`;
    deathMsg.style.display = 'block';
    gameoverOverlay.style.display = 'none';
  } else {
    deathMsg.style.display = 'none';
    gameoverOverlay.style.display = 'none';
  }

  const overlay = document.getElementById('countdown-overlay');
  if (state.level_changing && state.level_change_at) {
    overlay.style.display = 'flex';
    const nextLevel = (state.level % 8) + 1;
    document.getElementById('cl-level').textContent = `LEVEL ${nextLevel}`;
    const remaining = Math.max(0, state.level_change_at - Date.now() / 1000);
    document.getElementById('cl-num').textContent = Math.ceil(remaining);
  } else {
    overlay.style.display = 'none';
  }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Game End Overlay ────────────────────────────────
export function showGameEndOverlay(finalScores) {
  const overlay = document.getElementById('game-end-overlay');
  const scoreboard = document.getElementById('final-scoreboard');

  scoreboard.innerHTML = (finalScores || []).map((p, i) => {
    const rankCls = i === 0 ? ' first' : '';
    const aiTag = p.is_ai ? '<span class="score-ai">AI</span>' : '';
    return `<div class="score-entry${rankCls}">
      <span class="score-rank">#${i + 1}</span>
      <span class="score-swatch" style="background:${esc(p.color)}"></span>
      <span class="score-name" style="color:${esc(p.color)}">${esc(p.name)}</span>
      ${aiTag}
      <span class="score-value">${p.score}</span>
    </div>`;
  }).join('');

  overlay.style.display = 'flex';
}

// ── Setup Event Listeners ─────────────────────────────
export function setupEventListeners(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn) {
  const joinBtn = document.getElementById('join-btn');
  const addAiBtn = document.getElementById('add-ai-btn');
  const returnLobbyBtn = document.getElementById('return-lobby-btn');
  const pauseMenu = document.getElementById('pause-menu');
  const pauseTitle = pauseMenu?.querySelector('h2');
  const pauseHint = pauseMenu?.querySelector('.pause-hint');
  const pauseQuitBtn = document.getElementById('pause-quit-btn');

  // Setup custom avatar upload
  setupCustomAvatarUpload();

  // Track pause state (synced with server)
  state.iAmPaused = false;
  state.pausedPlayers = new Set();

  function togglePause() {
    // Only allow pause when in game and not in lobby
    if (gameContainer.style.display === 'none' || gameContainer.style.display === '') return;
    if (state.isSpectating) return; // Spectators cannot pause
    sendPause();
  }

  joinBtn.onclick = () => {
    import('./audio.js').then(({ ensureAudio }) => ensureAudio());
    import('./networking.js').then(m => m.connect(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn));
  };

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      import('./audio.js').then(({ ensureAudio }) => ensureAudio());
      import('./networking.js').then(m => m.connect(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn));
    }
  });

  readyBtn.onclick = () => {
    sendReady();
    state.isReady = !state.isReady;
    readyBtn.classList.toggle('is-ready', state.isReady);
    readyBtn.textContent = state.isReady ? 'READY ✓' : 'READY';
  };

  addAiBtn.onclick = () => {
    sendAddAI();
  };

  returnLobbyBtn.onclick = () => {
    sendReturnToLobby();
  };

  const gameEndLobbyBtn = document.getElementById('game-end-lobby-btn');
  gameEndLobbyBtn.onclick = () => {
    stopFireworks();
    document.getElementById('game-end-overlay').style.display = 'none';
    state.finalScores = null;
    state.myGameOver = false;
    state.isSpectating = false;
    state.myLocation = 'lobby';
    sendReturnToLobby();
  };

  pauseQuitBtn.onclick = () => {
    sendReturnToLobby();
  };

  // Input handling for game controls
  const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', (e) => {
    // Handle Escape for pause menu
    if (e.key === 'Escape') {
      togglePause();
      e.preventDefault();
      return;
    }

    // Don't process movement input if YOU are paused
    if (state.iAmPaused) return;

    const dir = keyMap[e.key];
    if (dir && state.ws && state.ws.readyState === WebSocket.OPEN) {
      sendInput(dir);
      e.preventDefault();
    }
  });
}

// Handle pause state from server
export function handlePauseState(pausedPlayers) {
  state.pausedPlayers = pausedPlayers;
  state.iAmPaused = state.pausedPlayers.has(state.myId);

  const pauseMenu = document.getElementById('pause-menu');
  const pauseTitle = pauseMenu?.querySelector('h2');
  const pauseHint = pauseMenu?.querySelector('.pause-hint');
  const settingsPanel = document.getElementById('settings-panel');
  const quitBtn = document.getElementById('pause-quit-btn');

  const otherPaused = Array.from(state.pausedPlayers)
    .filter(pid => pid !== state.myId)
    .map(pid => {
      const p = window.gameState?.currState?.players?.[pid];
      return p?.name || 'Someone';
    });

  if (state.iAmPaused || otherPaused.length > 0) {
    pauseMenu.style.display = 'flex';
    if (state.iAmPaused) {
      pauseTitle.textContent = 'YOU ARE PAUSED';
      pauseHint.textContent = 'Press ESC to unpause yourself';
      if (settingsPanel) settingsPanel.style.display = 'block';
      if (quitBtn) quitBtn.textContent = 'QUIT TO LOBBY';
    } else if (state.myLocation === 'spectating') {
      // Spectators see simplified pause menu
      pauseTitle.textContent = 'GAME PAUSED';
      pauseHint.textContent = `Waiting for: ${otherPaused.join(', ')}`;
      if (settingsPanel) settingsPanel.style.display = 'none';
      if (quitBtn) quitBtn.textContent = 'RETURN TO LOBBY';
    } else {
      pauseTitle.textContent = 'WAITING FOR PLAYERS';
      pauseHint.textContent = `Paused: ${otherPaused.join(', ')}`;
      if (settingsPanel) settingsPanel.style.display = 'none';
      if (quitBtn) quitBtn.textContent = 'QUIT TO LOBBY';
    }
  } else {
    pauseMenu.style.display = 'none';
  }
}

// Expose gameState globally for HUD to access myId
window.gameState = state;

// ── Custom Avatar Upload ────────────────────────────────
export function setupCustomAvatarUpload() {
  const uploadBtn = document.getElementById('avatar-upload-btn');
  const fileInput = document.getElementById('avatar-upload');
  const previewContainer = document.getElementById('custom-avatar-preview');
  const previewCanvas = document.getElementById('preview-canvas');
  const clearBtn = document.getElementById('clear-custom-avatar');
  const cropModal = document.getElementById('crop-modal');
  const cropCanvas = document.getElementById('crop-canvas');
  const cropOverlay = document.getElementById('crop-overlay');
  const cropCancel = document.getElementById('crop-cancel');
  const cropConfirm = document.getElementById('crop-confirm');

  let cropTool = null;
  let currentImage = null;

  // Restore saved custom avatar from localStorage
  const savedAvatar = localStorage.getItem('customHeadData');
  if (savedAvatar) {
    state.customHeadData = savedAvatar;
    const img = new Image();
    img.onload = () => {
      const previewCtx = previewCanvas.getContext('2d');
      previewCtx.clearRect(0, 0, 60, 60);
      previewCtx.beginPath();
      previewCtx.arc(30, 30, 30, 0, Math.PI * 2);
      previewCtx.clip();
      previewCtx.drawImage(img, 0, 0, 60, 60);
    };
    img.src = savedAvatar;
    previewContainer.classList.remove('hidden');
    uploadBtn.classList.add('hidden');
  }

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const img = await ImageProcessor.validateAndLoad(file);
      currentImage = img;

      // Setup crop tool
      cropTool = new CropTool(cropCanvas, cropOverlay);
      cropTool.setImage(img);

      // Show modal
      cropModal.classList.remove('hidden');
    } catch (err) {
      alert(err.message);
    }

    // Reset file input
    fileInput.value = '';
  });

  cropCancel.addEventListener('click', () => {
    cropModal.classList.add('hidden');
    if (cropTool) {
      cropTool.destroy();
      cropTool = null;
    }
    currentImage = null;
  });

  cropConfirm.addEventListener('click', () => {
    if (!cropTool || !currentImage) return;

    // Resize if needed first, so we know the actual dimensions
    const maxDimension = 200;
    const resized = ImageProcessor.resizeImage(currentImage, maxDimension);

    // Get crop params scaled to the resized image dimensions
    const params = cropTool.getCropParams(resized.width);
    if (!params) return;

    // Create circular crop
    const cropped = ImageProcessor.createCircularCrop(
      resized,
      params.x,
      params.y,
      params.radius,
      60  // Output size
    );

    // Convert to base64
    const dataUrl = ImageProcessor.toDataURL(cropped);

    // Validate size
    if (!ImageProcessor.validateBase64Size(dataUrl)) {
      alert('Image is too large after processing. Please try a smaller image.');
      cropModal.classList.add('hidden');
      cropTool.destroy();
      cropTool = null;
      currentImage = null;
      return;
    }

    // Store in state and persist to localStorage
    state.customHeadData = dataUrl;
    localStorage.setItem('customHeadData', dataUrl);

    // Update preview
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.clearRect(0, 0, 60, 60);
    const img = new Image();
    img.onload = () => {
      previewCtx.beginPath();
      previewCtx.arc(30, 30, 30, 0, Math.PI * 2);
      previewCtx.clip();
      previewCtx.drawImage(img, 0, 0, 60, 60);
    };
    img.src = dataUrl;

    // Show preview, hide upload button
    previewContainer.classList.remove('hidden');
    uploadBtn.classList.add('hidden');

    // Close modal
    cropModal.classList.add('hidden');
    cropTool.destroy();
    cropTool = null;
    currentImage = null;
  });

  clearBtn.addEventListener('click', () => {
    state.customHeadData = null;
    localStorage.removeItem('customHeadData');
    previewContainer.classList.add('hidden');
    uploadBtn.classList.remove('hidden');

    // Clear preview canvas
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.clearRect(0, 0, 60, 60);
  });
}

// ── Settings UI ───────────────────────────────────────
export function setupSettingsUI() {
  // Helper to bind checkbox to setting
  function bindCheckbox(id, getter, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = getter();
    el.addEventListener('change', () => {
      setter(el.checked);
      saveSettings();
    });
  }

  // Helper to bind slider to setting
  function bindSlider(id, valueId, getter, setter, formatter = v => v) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valueId);
    if (!el || !valEl) return;
    el.value = getter();
    valEl.textContent = formatter(getter());
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      setter(val);
      valEl.textContent = formatter(val);
      saveSettings();
    });
  }

  // Particles
  bindCheckbox('setting-particles-enabled',
    () => settings.particles.enabled,
    v => settings.particles.enabled = v);
  bindSlider('setting-particle-count', 'val-particle-count',
    () => settings.particles.count,
    v => settings.particles.count = v);
  bindSlider('setting-particle-velocity', 'val-particle-velocity',
    () => (settings.particles.velocityMin + settings.particles.velocityMax) / 2,
    v => {
      settings.particles.velocityMin = Math.max(20, v - 40);
      settings.particles.velocityMax = v + 40;
    });
  bindSlider('setting-particle-life', 'val-particle-life',
    () => Math.round(settings.particles.life * 10),
    v => settings.particles.life = v / 10,
    v => `${(v / 10).toFixed(1)}s`);

  // Screen Shake
  bindCheckbox('setting-screenshake-enabled',
    () => settings.screenShake.enabled,
    v => settings.screenShake.enabled = v);
  bindSlider('setting-screenshake-intensity', 'val-screenshake-intensity',
    () => settings.screenShake.intensity,
    v => settings.screenShake.intensity = v);
  bindCheckbox('setting-shake-trigger-eat',
    () => settings.screenShake.triggers.includes('eat'),
    v => {
      if (v && !settings.screenShake.triggers.includes('eat')) {
        settings.screenShake.triggers.push('eat');
      } else if (!v) {
        settings.screenShake.triggers = settings.screenShake.triggers.filter(t => t !== 'eat');
      }
    });
  bindCheckbox('setting-shake-trigger-death',
    () => settings.screenShake.triggers.includes('death'),
    v => {
      if (v && !settings.screenShake.triggers.includes('death')) {
        settings.screenShake.triggers.push('death');
      } else if (!v) {
        settings.screenShake.triggers = settings.screenShake.triggers.filter(t => t !== 'death');
      }
    });

  // Area Warp
  bindCheckbox('setting-areawarp-enabled',
    () => settings.areaWarp.enabled,
    v => settings.areaWarp.enabled = v);
  bindSlider('setting-areawarp-intensity', 'val-areawarp-intensity',
    () => settings.areaWarp.intensity,
    v => settings.areaWarp.intensity = v);
  bindSlider('setting-areawarp-radius', 'val-areawarp-radius',
    () => settings.areaWarp.radius,
    v => settings.areaWarp.radius = v);

  // Food Pulse
  bindCheckbox('setting-pulse-enabled',
    () => settings.foodPulse.enabled,
    v => settings.foodPulse.enabled = v);
  bindSlider('setting-pulse-intensity', 'val-pulse-intensity',
    () => Math.round(settings.foodPulse.intensity * 100),
    v => settings.foodPulse.intensity = v / 100,
    v => `${v}%`);
  bindSlider('setting-pulse-speed', 'val-pulse-speed',
    () => settings.foodPulse.speed,
    v => settings.foodPulse.speed = v,
    v => `${v}ms`);

  // Glow
  bindCheckbox('setting-glow-enabled',
    () => settings.glow.enabled,
    v => settings.glow.enabled = v);
  bindSlider('setting-glow-intensity', 'val-glow-intensity',
    () => Math.round(settings.glow.intensity * 100),
    v => settings.glow.intensity = v / 100,
    v => `${v}%`);

  // Avatar Size
  bindSlider('setting-avatar-size', 'val-avatar-size',
    () => Math.round((settings.avatarSize?.scale || 1.5) * 100),
    v => settings.avatarSize.scale = v / 100,
    v => `${v}%`);

  // Audio
  bindCheckbox('setting-sfx-enabled',
    () => settings.sfx.enabled,
    v => settings.sfx.enabled = v);
  bindSlider('setting-master-volume', 'val-master-volume',
    () => Math.round(settings.sfx.masterVolume * 100),
    v => {
      settings.sfx.masterVolume = v / 100;
      updateMusicMasterVolume();
    },
    v => `${v}%`);

  // Music
  bindCheckbox('setting-music-enabled',
    () => settings.sfx.music.enabled,
    v => {
      settings.sfx.music.enabled = v;
      if (v) {
        playMusic();
      } else {
        pauseMusic();
      }
    });
  bindSlider('setting-music-volume', 'val-music-volume',
    () => Math.round(settings.sfx.music.volume * 100),
    v => setMusicVolume(v / 100),
    v => `${v}%`);

  // Eat Sound
  bindCheckbox('setting-eat-enabled',
    () => settings.sfx.eat.enabled,
    v => settings.sfx.eat.enabled = v);
  bindSlider('setting-eat-volume', 'val-eat-volume',
    () => Math.round(settings.sfx.eat.volume * 100),
    v => settings.sfx.eat.volume = v / 100,
    v => `${v}%`);
  bindSlider('setting-eat-pitch', 'val-eat-pitch',
    () => 50,
    v => {
      const factor = v / 50;
      settings.sfx.eat.pitchStart = Math.round(520 * factor);
      settings.sfx.eat.pitchEnd = Math.round(1200 * factor);
    },
    v => `${v}%`);

  // Death Sound
  bindCheckbox('setting-death-enabled',
    () => settings.sfx.death.enabled,
    v => settings.sfx.death.enabled = v);
  bindSlider('setting-death-volume', 'val-death-volume',
    () => Math.round(settings.sfx.death.volume * 100),
    v => settings.sfx.death.volume = v / 100,
    v => `${v}%`);
  bindSlider('setting-death-pitch', 'val-death-pitch',
    () => 50,
    v => {
      const factor = v / 50;
      settings.sfx.death.pitchStart = Math.round(180 * factor);
      settings.sfx.death.pitchEnd = Math.round(40 * factor);
    },
    v => `${v}%`);

  // Reset button
  const resetBtn = document.getElementById('reset-settings-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetSettings();
      // Reload page to refresh UI
      location.reload();
    });
  }
}
