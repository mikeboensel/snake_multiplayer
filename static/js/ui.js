// UI management: join screen, lobby, HUD, pickers
import { state } from './state.js';
import { NEON_COLORS, HEAD_AVATARS } from './constants.js';
import { sendGameOptions, sendReady, sendAddAI, sendRemoveAI, sendReturnToLobby } from './networking.js';

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
  container.innerHTML = humanPlayers.map(p => {
    const emoji = HEAD_AVATARS[p.head_avatar] || HEAD_AVATARS.angel;
    const badge = p.ready
      ? '<span class="lobby-badge ready">READY</span>'
      : '<span class="lobby-badge not-ready">NOT READY</span>';
    return `<div class="lobby-entry">
      <span class="lobby-avatar">${emoji}</span>
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

// ── Game Options ─────────────────────────────────────
export function setupGameOptions() {
  const optFoodAdvance = document.getElementById('opt-food-advance');
  const optFoodCount = document.getElementById('opt-food-count');
  const optCollisions = document.getElementById('opt-collisions');
  const optLives = document.getElementById('opt-lives');

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
}

export function syncOptions(opts) {
  if (!opts) return;
  const optFoodAdvance = document.getElementById('opt-food-advance');
  const optFoodCount = document.getElementById('opt-food-count');
  const optCollisions = document.getElementById('opt-collisions');
  const optLives = document.getElementById('opt-lives');

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
}

// ── HUD ──────────────────────────────────────────────
export function updateHUD(state) {
  document.getElementById('level-info').textContent = `LEVEL ${state.level}`;
  document.getElementById('food-counter').textContent = `FOOD: ${state.food_eaten}/${state.food_target}`;

  const entries = document.getElementById('legend-entries');
  const sorted = Object.entries(state.players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.score - a.score);
  entries.innerHTML = sorted.map(p => {
    const hearts = '\u2764'.repeat(Math.max(0, p.lives));
    const isMe = p.id === window.gameState?.myId;
    const cls = (isMe ? ' me' : '') + (p.game_over ? ' dead' : '');
    const emoji = HEAD_AVATARS[p.head_avatar] || '';
    const aiBadge = p.is_ai ? '<span style="color:#fc0;font-size:0.7em;margin-left:2px">AI</span>' : '';
    return `<div class="entry${cls}"><span class="color-swatch" style="background:${p.color}"></span><span style="font-size:0.9em">${emoji}</span><span class="pname" style="color:${p.color}">${esc(p.name)}</span>${aiBadge}<span class="lives">${hearts}</span><span class="pscore">${p.score}</span></div>`;
  }).join('');

  const deathMsg = document.getElementById('death-msg');
  const gameoverMsg = document.getElementById('gameover-msg');
  const me = window.gameState?.myId && state.players[window.gameState.myId];
  if (me && !me.alive && me.game_over) {
    deathMsg.style.display = 'none';
    gameoverMsg.style.display = 'block';
  } else if (me && !me.alive) {
    deathMsg.textContent = `YOU DIED \u2014 ${me.lives} ${me.lives === 1 ? 'life' : 'lives'} left`;
    deathMsg.style.display = 'block';
    gameoverMsg.style.display = 'none';
  } else {
    deathMsg.style.display = 'none';
    gameoverMsg.style.display = 'none';
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

// ── Setup Event Listeners ─────────────────────────────
export function setupEventListeners(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn) {
  const joinBtn = document.getElementById('join-btn');
  const addAiBtn = document.getElementById('add-ai-btn');
  const returnLobbyBtn = document.getElementById('return-lobby-btn');

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

  // Input handling for game controls
  const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', (e) => {
    const dir = keyMap[e.key];
    if (dir && state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'input', direction: dir }));
      e.preventDefault();
    }
  });
}

// Expose gameState globally for HUD to access myId
window.gameState = state;
