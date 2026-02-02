"""Core game state and logic."""

import random
import time
from typing import Optional

from .constants import (
    GRID_W, GRID_H, FOOD_COUNT, FOOD_TO_ADVANCE,
    RESPAWN_DELAY, LEVEL_COUNTDOWN, TOTAL_LEVELS, MAX_LIVES,
    DIRECTIONS, OPPOSITES, NEON_COLORS, HEAD_AVATARS,
)
from .levels import build_level_walls
from .models import PlayerState

AI_NAMES = ["Botty", "Snaker", "Viper", "Python", "Cobra", "Mamba", "Rattler", "Noodle"]

# Bot difficulty levels: 0=Easy, 1=Medium, 2=Hard
# intelligence: chance to move toward food (vs random safe direction)
# mistake_rate: chance to pick ANY direction including unsafe/fatal ones
BOT_DIFFICULTY = {
    0: {"name": "Easy", "intelligence": 0.40, "mistake_rate": 0.20},
    1: {"name": "Medium", "intelligence": 0.65, "mistake_rate": 0.10},
    2: {"name": "Hard", "intelligence": 0.80, "mistake_rate": 0.03},
}


class GameState:
    def __init__(self):
        self.level = 1
        self.walls = build_level_walls(1)
        self.food: list[tuple[int, int]] = []
        self.players: dict[str, PlayerState] = {}
        self.food_eaten = 0
        self.level_changing = False
        self.level_change_at: Optional[float] = None
        self.eaten_events: list[tuple[int, int, str, str]] = []
        self.started = False
        self.ready_players: set[str] = set()
        self.paused_players: set[str] = set()
        self.game_options: dict = {
            "food_to_advance": FOOD_TO_ADVANCE,
            "food_count": FOOD_COUNT,
            "collisions": True,
            "lives": MAX_LIVES,
            "bot_difficulty": 1,  # 0=Easy, 1=Medium, 2=Hard
        }

    def start_game(self):
        self.started = True
        self.ready_players.clear()
        lives = self.game_options.get("lives", MAX_LIVES)
        for p in self.players.values():
            p.lives = lives
            self.spawn_player(p)
        self.spawn_food()

    def find_safe_spot(self, length=3, runway=10) -> Optional[list[tuple[int, int]]]:
        occupied = set()
        for p in self.players.values():
            if p.alive:
                occupied.update(p.segments)
        occupied.update(self.food)
        blocked = self.walls | occupied

        attempts = 0
        while attempts < 200:
            x = random.randint(3, GRID_W - 4)
            y = random.randint(3, GRID_H - 4)
            d = random.choice(["left", "right", "up", "down"])
            dx, dy = DIRECTIONS[d]
            segs = [(x - dx * i, y - dy * i) for i in range(length)]
            valid = True
            for sx, sy in segs:
                if (sx, sy) in blocked or sx <= 0 or sx >= GRID_W - 1 or sy <= 0 or sy >= GRID_H - 1:
                    valid = False
                    break
            if valid:
                for step in range(1, runway + 1):
                    rx, ry = x + dx * step, y + dy * step
                    if (rx, ry) in blocked or rx <= 0 or rx >= GRID_W - 1 or ry <= 0 or ry >= GRID_H - 1:
                        valid = False
                        break
            if valid:
                return segs, d
            attempts += 1

        for min_run in (5, 3, 0):
            for _ in range(100):
                x = random.randint(3, GRID_W - 4)
                y = random.randint(3, GRID_H - 4)
                d = random.choice(["left", "right", "up", "down"])
                dx, dy = DIRECTIONS[d]
                segs = [(x - dx * i, y - dy * i) for i in range(length)]
                ok = True
                for sx, sy in segs:
                    if (sx, sy) in blocked or sx <= 0 or sx >= GRID_W - 1 or sy <= 0 or sy >= GRID_H - 1:
                        ok = False
                        break
                if ok:
                    clear = 0
                    for step in range(1, runway + 1):
                        rx, ry = x + dx * step, y + dy * step
                        if (rx, ry) in blocked or rx <= 0 or rx >= GRID_W - 1 or ry <= 0 or ry >= GRID_H - 1:
                            break
                        clear += 1
                    if clear >= min_run:
                        return segs, d
        return [(GRID_W // 2, GRID_H // 2)], "right"

    def spawn_player(self, player: PlayerState):
        result = self.find_safe_spot()
        if isinstance(result, tuple) and len(result) == 2:
            player.segments, player.direction = result
        else:
            player.segments = [(GRID_W // 2, GRID_H // 2)]
            player.direction = "right"
        player.next_direction = player.direction
        player.alive = True
        player.respawn_at = None

    def spawn_food(self):
        occupied = set()
        for p in self.players.values():
            if p.alive:
                occupied.update(p.segments)
        occupied.update(self.walls)
        occupied.update(self.food)

        target = self.game_options["food_count"]
        while len(self.food) < target:
            attempts = 0
            while attempts < 500:
                x = random.randint(1, GRID_W - 2)
                y = random.randint(1, GRID_H - 2)
                if (x, y) not in occupied:
                    self.food.append((x, y))
                    occupied.add((x, y))
                    break
                attempts += 1
            else:
                break

    def change_level(self, new_level: int):
        self.level = new_level
        self.walls = build_level_walls(new_level)
        self.food.clear()
        self.food_eaten = 0
        self.level_changing = False
        self.level_change_at = None
        lives = self.game_options.get("lives", MAX_LIVES)
        for p in self.players.values():
            # Only respawn players who haven't lost all lives
            if not p.game_over:
                p.lives = lives
                self.spawn_player(p)
            else:
                # Ensure dead players stay dead
                p.respawn_at = None
        self.spawn_food()

    def tick(self):
        if not self.started:
            return

        now = time.time()
        self.eaten_events.clear()

        # AI decision making (inefficient pathfinding)
        for p in self.players.values():
            if p.is_ai and p.alive and now >= p.ai_decision_at:
                p.next_direction = self.get_ai_direction(p)
                # AI re-decides every 2-5 ticks for inefficiency
                p.ai_decision_at = now + (0.2 + random.random() * 0.3)

        if self.level_changing:
            if now >= self.level_change_at:
                new_level = (self.level % TOTAL_LEVELS) + 1
                self.change_level(new_level)
            return

        for p in self.players.values():
            if not p.alive and not p.game_over and p.respawn_at and now >= p.respawn_at:
                self.spawn_player(p)

        for p in self.players.values():
            if p.alive:
                if OPPOSITES.get(p.next_direction) != p.direction or len(p.segments) == 1:
                    p.direction = p.next_direction

        new_heads = {}
        for pid, p in self.players.items():
            if not p.alive or not p.segments:
                continue
            dx, dy = DIRECTIONS[p.direction]
            hx, hy = p.segments[0]
            new_heads[pid] = (hx + dx, hy + dy)

        kills = set()
        for pid, head in new_heads.items():
            p = self.players[pid]
            if head in self.walls:
                kills.add(pid)
                continue
            if head in p.segments[:-1]:
                kills.add(pid)
                continue
            if self.game_options["collisions"]:
                for other_pid, other_p in self.players.items():
                    if other_pid == pid or not other_p.alive:
                        continue
                    if head in other_p.segments:
                        kills.add(pid)
                        break

        if self.game_options["collisions"]:
            for pid1, head1 in new_heads.items():
                for pid2, head2 in new_heads.items():
                    if pid1 < pid2 and head1 == head2:
                        kills.add(pid1)
                        kills.add(pid2)

        for pid in kills:
            p = self.players[pid]
            p.alive = False
            p.segments = []
            p.lives -= 1
            if p.lives > 0:
                p.respawn_at = now + RESPAWN_DELAY
            else:
                p.game_over = True
                p.respawn_at = None

        for pid, head in new_heads.items():
            if pid in kills:
                continue
            p = self.players[pid]
            p.segments.insert(0, head)
            if head in self.food:
                self.food.remove(head)
                p.score += 1
                self.food_eaten += 1
                self.eaten_events.append((head[0], head[1], p.color, pid))
            else:
                p.segments.pop()

        self.spawn_food()

        if self.food_eaten >= self.game_options["food_to_advance"]:
            self.level_changing = True
            self.level_change_at = now + LEVEL_COUNTDOWN

    def get_ai_direction(self, ai_player: PlayerState) -> str:
        """AI that moves towards food while avoiding walls. Intelligence based on difficulty."""
        if not ai_player.segments or not self.food:
            return ai_player.direction

        head = ai_player.segments[0]
        current_dir = ai_player.direction

        # Get difficulty settings from game options
        difficulty_level = self.game_options.get("bot_difficulty", 1)
        difficulty = BOT_DIFFICULTY.get(difficulty_level, BOT_DIFFICULTY[1])
        intelligence = difficulty["intelligence"]
        mistake_rate = difficulty["mistake_rate"]

        # Find nearest food
        nearest_food = min(self.food, key=lambda f: abs(f[0] - head[0]) + abs(f[1] - head[1]))
        target_x, target_y = nearest_food

        # Get all safe directions
        safe_dirs = []
        for d_name, (dx, dy) in DIRECTIONS.items():
            # Don't reverse immediately
            if OPPOSITES.get(d_name) == current_dir:
                continue
            new_x, new_y = head[0] + dx, head[1] + dy
            # Check bounds and walls
            if (new_x, new_y) in self.walls or new_x <= 0 or new_x >= GRID_W - 1 or new_y <= 0 or new_y >= GRID_H - 1:
                continue
            # Check collision with self (excluding tail which will move)
            if (new_x, new_y) in ai_player.segments[:-1]:
                continue
            # Check collision with other snakes if collisions enabled
            if self.game_options["collisions"]:
                for other_p in self.players.values():
                    if other_p.pid != ai_player.pid and other_p.alive:
                        if (new_x, new_y) in other_p.segments:
                            break
                else:
                    safe_dirs.append((d_name, new_x, new_y))
            else:
                safe_dirs.append((d_name, new_x, new_y))

        # Roll for mistake - chance to pick ANY direction including unsafe/fatal ones
        if random.random() < mistake_rate:
            # Mistake! Pick from all directions (including reversing)
            all_dirs = list(DIRECTIONS.keys())
            return random.choice(all_dirs)

        if not safe_dirs:
            return current_dir  # No safe moves, accept fate

        # Roll for intelligent action
        if random.random() < intelligence:
            # Intelligent: pick direction that reduces distance to food
            def dist_to_food(x, y):
                return abs(x - target_x) + abs(y - target_y)

            current_dist = dist_to_food(head[0], head[1])
            better_dirs = [(d, x, y) for d, x, y in safe_dirs if dist_to_food(x, y) < current_dist]
            if better_dirs:
                return random.choice(better_dirs)[0]

        # Non-intelligent: pick random safe direction
        return random.choice(safe_dirs)[0]

    def add_ai(self) -> str:
        """Add a new AI player and return its ID."""
        ai_count = sum(1 for p in self.players.values() if p.is_ai)
        ai_id = f"ai_{ai_count}"
        used_names = {p.name for p in self.players.values()}
        available_names = [n for n in AI_NAMES if n not in used_names]
        name = available_names[ai_count % len(available_names)] + f" (AI)"
        # Pick unused color
        used_colors = {p.color for p in self.players.values()}
        available_colors = [c for c in NEON_COLORS if c not in used_colors]
        color = available_colors[ai_count % len(available_colors)] if available_colors else NEON_COLORS[0]
        avatar = list(HEAD_AVATARS.keys())[ai_count % len(HEAD_AVATARS)]

        ai = PlayerState(pid=ai_id, name=name, color=color, head_avatar=avatar, is_ai=True)
        self.players[ai_id] = ai
        return ai_id

    def remove_ai(self, ai_id: str) -> bool:
        """Remove an AI player. Returns True if successful."""
        if ai_id in self.players and self.players[ai_id].is_ai:
            del self.players[ai_id]
            self.ready_players.discard(ai_id)
            return True
        return False

    def get_ai_players(self) -> list[dict]:
        """Get list of AI players for lobby display."""
        return [
            {"pid": pid, "name": p.name, "color": p.color, "head_avatar": p.head_avatar}
            for pid, p in self.players.items()
            if p.is_ai
        ]
