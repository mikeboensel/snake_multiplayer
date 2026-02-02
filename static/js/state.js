// Global state management
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
