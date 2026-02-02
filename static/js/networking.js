// WebSocket networking and message handling
import { state } from './state.js';
import { updateLobby, syncOptions } from './ui.js';
import { renderWalls, startGame, processEatenEvents, playDeathSound } from './rendering.js';

export function connect(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn) {
  const name = nameInput.value.trim() || 'Player';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.onopen = () => {
    state.ws.send(JSON.stringify({
      type: 'join',
      name,
      color: state.selectedColor,
      head_avatar: state.selectedAvatar
    }));
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg, joinScreen, lobbyScreen, gameContainer, readyBtn);
  };

  state.ws.onclose = () => {
    setTimeout(() => {
      joinScreen.style.display = 'block';
      lobbyScreen.style.display = 'none';
      gameContainer.style.display = 'none';
      state.myId = null;
      state.currState = null;
      state.prevState = null;
      state.isReady = false;
      readyBtn.classList.remove('is-ready');
      readyBtn.textContent = 'READY';
    }, 500);
  };
}

function handleMessage(msg, joinScreen, lobbyScreen, gameContainer, readyBtn) {
  switch (msg.type) {
    case 'welcome':
      state.myId = msg.player_id;
      joinScreen.style.display = 'none';
      lobbyScreen.style.display = 'block';
      break;

    case 'lobby_state':
      updateLobby(msg.players, msg.game_options);
      break;

    case 'game_start':
      state.walls = msg.walls;
      renderWalls();
      lobbyScreen.style.display = 'none';
      gameContainer.style.display = 'block';
      startGame();
      break;

    case 'state':
      state.prevState = state.currState;
      state.currState = msg;
      state.lastStateTime = performance.now();
      processEatenEvents(msg.eaten_events || []);
      const me = state.myId && msg.players[state.myId];
      if (me && !me.alive && state.wasAlive) playDeathSound();
      state.wasAlive = me ? me.alive : true;
      break;

    case 'level_change':
      state.walls = msg.walls;
      renderWalls();
      break;

    case 'return_to_lobby':
      gameContainer.style.display = 'none';
      lobbyScreen.style.display = 'block';
      state.currState = null;
      state.prevState = null;
      state.isReady = false;
      readyBtn.classList.remove('is-ready');
      readyBtn.textContent = 'READY';
      document.getElementById('death-msg').style.display = 'none';
      document.getElementById('gameover-msg').style.display = 'none';
      break;
  }
}

export function sendGameOptions(partial) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'game_options', ...partial }));
  }
}

export function sendReady() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'ready' }));
  }
}

export function sendInput(direction) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'input', direction }));
  }
}

export function sendAddAI() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'add_ai' }));
  }
}

export function sendRemoveAI(aiId) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'remove_ai', ai_id: aiId }));
  }
}

export function sendReturnToLobby() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'return_to_lobby' }));
  }
}
