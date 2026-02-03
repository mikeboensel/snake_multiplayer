// Main entry point
import { buildPickers, setupGameOptions, setupEventListeners, setupSettingsUI } from './ui.js';
import { state, resizeCanvas } from './state.js';
import { renderWalls } from './rendering.js';
import { NEON_COLORS } from './constants.js';

// ── Retro Jingle ────────────────────────────────────
function playSplashJingle() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();

    // Short retro arpeggio: C5 E5 G5 C6 (fast ascending)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const noteLen = 0.12;

    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'square';
      const t = ac.currentTime + i * noteLen;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen * 1.8);
      osc.start(t);
      osc.stop(t + noteLen * 2);
    });

    // Final shimmer chord
    const shimmerTime = ac.currentTime + notes.length * noteLen;
    [523.25, 659.25, 1046.50].forEach(freq => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, shimmerTime);
      gain.gain.setValueAtTime(0.08, shimmerTime);
      gain.gain.exponentialRampToValueAtTime(0.001, shimmerTime + 0.6);
      osc.start(shimmerTime);
      osc.stop(shimmerTime + 0.7);
    });
  } catch (e) {
    // Audio not available, skip silently
  }
}

// ── Splash Screen ───────────────────────────────────
const splashScreen = document.getElementById('splash-screen');
const joinScreen = document.getElementById('join-screen');

function dismissSplash() {
  splashScreen.classList.add('fade-out');
  splashScreen.addEventListener('animationend', () => {
    splashScreen.remove();
    joinScreen.style.display = '';
  }, { once: true });
}

// Allow click/key to skip the splash early
let splashDismissed = false;
function handleSplashInteraction() {
  if (splashDismissed) return;
  splashDismissed = true;
  clearTimeout(splashTimer);
  playSplashJingle();
  dismissSplash();
}

// Auto-dismiss after 3 seconds, but require a user gesture for audio
const splashTimer = setTimeout(() => {
  if (!splashDismissed) {
    splashDismissed = true;
    dismissSplash();
  }
}, 3000);

// Play jingle on first interaction (user gesture required for AudioContext)
splashScreen.addEventListener('click', handleSplashInteraction, { once: true });
document.addEventListener('keydown', function splashKey(e) {
  handleSplashInteraction();
  document.removeEventListener('keydown', splashKey);
}, { once: true });

// Initialize state
state.selectedColor = NEON_COLORS[0];

// Get screen references
const lobbyScreen = document.getElementById('lobby-screen');
const gameContainer = document.getElementById('game-container');
const nameInput = document.getElementById('name-input');
const readyBtn = document.getElementById('ready-btn');

// Initialize pickers
buildPickers();

// Setup game options listeners
setupGameOptions();

// Setup event listeners
setupEventListeners(nameInput, joinScreen, lobbyScreen, gameContainer, readyBtn);

// Initialize settings UI
setupSettingsUI();

// Debounced resize handler
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (gameContainer.style.display === 'flex') {
      resizeCanvas();
      renderWalls();
    }
  }, 100);
});
