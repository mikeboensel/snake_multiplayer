// Global state management
import { setCell, canvasW, canvasH, GRID_W, GRID_H } from './constants.js';

export const state = {
  ws: null,
  myId: null,
  walls: [],
  prevState: null,
  currState: null,
  lastStateTime: 0,
  particles: [],
  animFrame: 0,
  wasAlive: true,
  selectedColor: null,
  selectedAvatar: 'angel',
  customHeadData: null,  // Base64 data URL or null
  isReady: false,
  iAmPaused: false,
  pausedPlayers: new Set(),
  myLocation: 'lobby',  // 'lobby', 'playing', 'spectating'
  myGameOver: false,
  finalScores: null,
};

// Canvas references
export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');

// Offscreen wall canvas
export const wallCanvas = document.createElement('canvas');
wallCanvas.width = 800;
wallCanvas.height = 600;
export const wallCtx = wallCanvas.getContext('2d');

// Resize canvas to fill available viewport space at 4:3 aspect ratio
export function resizeCanvas() {
  const sidebar = 230; // legend width + padding
  const vPad = 80;     // top HUD + margins
  const availW = window.innerWidth - sidebar - 40;
  const availH = window.innerHeight - vPad;

  // Fit 4:3 (GRID_W x GRID_H) into available area
  let fitW = availW;
  let fitH = fitW * (GRID_H / GRID_W);
  if (fitH > availH) {
    fitH = availH;
    fitW = fitH * (GRID_W / GRID_H);
  }

  const cell = Math.max(10, Math.floor(fitW / GRID_W));
  setCell(cell);

  canvas.width = canvasW();
  canvas.height = canvasH();
  wallCanvas.width = canvasW();
  wallCanvas.height = canvasH();
}
