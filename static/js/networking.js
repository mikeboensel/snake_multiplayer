// WebSocket networking and message handling
import { state } from './state.js';
import { updateLobby, syncOptions, handlePauseState, showGameEndOverlay } from './ui.js';
import { renderWalls, startGame, processEatenEvents, playDeathSound, processDeathEvent, startFireworks, stopFireworks } from './rendering.js';

export function connect(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn) {
  const name = nameInput.value.trim() || 'Player';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.onopen = () => {
    const joinMsg = {
      type: 'join',
      name,
      color: state.selectedColor,
    };

    if (state.customHeadData) {
      joinMsg.custom_head = state.customHeadData;
      joinMsg.head_avatar = null;
    } else {
      joinMsg.head_avatar = state.selectedAvatar;
    }

    state.ws.send(JSON.stringify(joinMsg));
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
      state.customHeadData = null;
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
      state.myLocation = 'playing';
      state.myGameOver = false;
      state.isSpectating = false;
      renderWalls();
      lobbyScreen.style.display = 'none';
      gameContainer.style.display = 'block';
      startGame();
      break;

    case 'game_in_progress':
      // Late joiner - spectate existing game
      state.isSpectating = true;
      state.myLocation = 'spectating';
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

      // Check for player deaths (any player, not just local)
      const prevPlayers = state.prevState?.players || {};
      for (const [pid, p] of Object.entries(msg.players)) {
        const prev = prevPlayers[pid];
        // Player was alive, now dead = just died
        // Use PREV state's segments because server clears them on death
        if (prev && prev.alive && !p.alive && prev.segments.length > 0) {
          const head = prev.segments[0];
          playDeathSound();
          processDeathEvent(pid, head[0], head[1], prev.color);
        }
      }
      // Also detect players who vanished from state entirely (permanent death)
      for (const [pid, prev] of Object.entries(prevPlayers)) {
        if (prev.alive && prev.segments.length > 0 && !msg.players[pid]) {
          const head = prev.segments[0];
          playDeathSound();
          processDeathEvent(pid, head[0], head[1], prev.color);
        }
      }

      // Local player death handling for UI
      const me = state.myId && msg.players[state.myId];
      state.wasAlive = me ? me.alive : true;
      // If local player is in the state but game_over, they're now spectating
      if (me && me.game_over && state.myLocation === 'playing') {
        state.myLocation = 'spectating';
        state.isSpectating = true;
        state.myGameOver = true;
      }
      // If local player vanished from state while playing — permanent elimination
      if (state.myLocation === 'playing' && !me && state.myId) {
        state.myLocation = 'spectating';
        state.isSpectating = true;
        state.myGameOver = true;
      }
      break;

    case 'level_change':
      state.walls = msg.walls;
      renderWalls();
      break;

    case 'pause_state':
      handlePauseState(new Set(msg.paused_players || []));
      break;

    case 'return_to_lobby':
      stopFireworks();
      gameContainer.style.display = 'none';
      lobbyScreen.style.display = 'block';
      state.currState = null;
      state.prevState = null;
      state.isReady = false;
      state.iAmPaused = false;
      state.pausedPlayers.clear();
      state.isSpectating = false;
      state.myLocation = 'lobby';
      state.myGameOver = false;
      state.finalScores = null;
      readyBtn.classList.remove('is-ready');
      readyBtn.textContent = 'READY';
      document.getElementById('death-msg').style.display = 'none';
      document.getElementById('gameover-overlay').style.display = 'none';
      document.getElementById('game-end-overlay').style.display = 'none';
      document.getElementById('pause-menu').style.display = 'none';
      break;

    case 'move_to_lobby':
      // Move only this client to lobby (game continues for others)
      stopFireworks();
      gameContainer.style.display = 'none';
      lobbyScreen.style.display = 'block';
      state.currState = null;
      state.prevState = null;
      state.isReady = false;
      state.iAmPaused = false;
      state.pausedPlayers.clear();
      state.isSpectating = false;
      state.myLocation = 'lobby';
      state.myGameOver = false;
      state.finalScores = null;
      readyBtn.classList.remove('is-ready');
      readyBtn.textContent = 'READY';
      document.getElementById('death-msg').style.display = 'none';
      document.getElementById('gameover-overlay').style.display = 'none';
      document.getElementById('game-end-overlay').style.display = 'none';
      document.getElementById('pause-menu').style.display = 'none';
      break;

    case 'player_location_changed':
      if (msg.player_id === state.myId) {
        state.myLocation = msg.location;
      }
      // Update lobby UI will be called via lobby_state message
      break;

    case 'game_end':
      // Show final scoreboard overlay instead of immediately jumping to lobby
      state.finalScores = msg.final_scores || [];
      state.myGameOver = false;
      state.isReady = false;
      state.iAmPaused = false;
      state.pausedPlayers.clear();
      readyBtn.classList.remove('is-ready');
      readyBtn.textContent = 'READY';
      document.getElementById('death-msg').style.display = 'none';
      document.getElementById('gameover-overlay').style.display = 'none';
      document.getElementById('pause-menu').style.display = 'none';
      showGameEndOverlay(state.finalScores);
      startFireworks();
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
  // Don't send input if this player is paused
  if (state.iAmPaused) return;
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

export function sendPause() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'pause' }));
  }
}
