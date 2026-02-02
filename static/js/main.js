// Main entry point
import { buildPickers, setupGameOptions, setupEventListeners, setupSettingsUI } from './ui.js';
import { state } from './state.js';
import { NEON_COLORS } from './constants.js';

// Initialize state
state.selectedColor = NEON_COLORS[0];

// Get screen references
const joinScreen = document.getElementById('join-screen');
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
