// Game constants
export let CELL = 20;
export const GRID_W = 40;
export const GRID_H = 30;

export function setCell(value) { CELL = value; }
export function canvasW() { return CELL * GRID_W; }
export function canvasH() { return CELL * GRID_H; }

export const NEON_COLORS = [
  "#ff00ff", "#00ffff", "#ff3366", "#33ff66",
  "#ffcc00", "#ff6600", "#66ccff", "#cc66ff",
  "#00ff99", "#ff0066", "#33ccff", "#ffff00",
];

export const HEAD_AVATARS = {
  angel: "\u{1F607}", devil: "\u{1F608}", "8ball": "\u{1F3B1}",
  alien: "\u{1F47D}", skull: "\u{1F480}", robot: "\u{1F916}",
  crown: "\u{1F451}", fire: "\u{1F525}", ghost: "\u{1F47B}",
  cyclops: "\u{1F9FF}", star: "\u2B50", diamond: "\u{1F48E}",
};
