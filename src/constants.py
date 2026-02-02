"""Game constants."""

GRID_W, GRID_H = 40, 30
TICK_RATE = 10
FOOD_COUNT = 3
FOOD_TO_ADVANCE = 5
RESPAWN_DELAY = 3.0
LEVEL_COUNTDOWN = 3.0
TOTAL_LEVELS = 8
MAX_LIVES = 3

DIRECTIONS = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}
OPPOSITES = {"up": "down", "down": "up", "left": "right", "right": "left"}

NEON_COLORS = [
    "#ff00ff", "#00ffff", "#ff3366", "#33ff66",
    "#ffcc00", "#ff6600", "#66ccff", "#cc66ff",
    "#00ff99", "#ff0066", "#33ccff", "#ffff00",
]

HEAD_AVATARS = {
    "angel": "😇", "devil": "😈", "8ball": "🎱",
    "alien": "👽", "skull": "💀", "robot": "🤖",
    "crown": "👑", "fire": "🔥", "ghost": "👻",
    "cyclops": "🧿", "star": "⭐", "diamond": "💎",
}
