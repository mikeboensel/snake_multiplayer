#!/usr/bin/env python3
"""Multiplayer Neon Snake Game Server - asyncio + websockets"""

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import websockets
from websockets.http11 import Response
from websockets.datastructures import Headers

# Constants
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


# ── Level Definitions ──────────────────────────────────────────────

def build_border_walls():
    walls = set()
    for x in range(GRID_W):
        walls.add((x, 0))
        walls.add((x, GRID_H - 1))
    for y in range(GRID_H):
        walls.add((0, y))
        walls.add((GRID_W - 1, y))
    return walls


def build_level_walls(level: int) -> set:
    walls = build_border_walls()

    if level == 1:
        pass  # borders only

    elif level == 2:
        # Center Plus
        cx, cy = GRID_W // 2, GRID_H // 2
        for i in range(-4, 5):
            walls.add((cx + i, cy))
            walls.add((cx, cy + i))

    elif level == 3:
        # Four 3x3 Blocks
        positions = [(10, 8), (27, 8), (10, 19), (27, 19)]
        for px, py in positions:
            for dx in range(3):
                for dy in range(3):
                    walls.add((px + dx, py + dy))

    elif level == 4:
        # Horizontal Bars with gaps
        for x in range(5, 35):
            if x not in (18, 19, 20):
                walls.add((x, 10))
                walls.add((x, 20))

    elif level == 5:
        # Staggered Walls
        for x in range(1, 18):
            walls.add((x, 8))
        for x in range(22, GRID_W - 1):
            walls.add((x, 14))
        for x in range(1, 18):
            walls.add((x, 20))

    elif level == 6:
        # Box Spiral
        # Outer ring
        for x in range(5, 35):
            walls.add((x, 5))
        for x in range(5, 35):
            if x != 20:
                walls.add((x, 24))
        for y in range(5, 25):
            walls.add((5, y))
        for y in range(5, 25):
            if y != 10:
                walls.add((34, y))
        # Inner ring
        for x in range(10, 30):
            if x != 15:
                walls.add((x, 10))
        for x in range(10, 30):
            walls.add((x, 19))
        for y in range(10, 20):
            walls.add((29, y))
        for y in range(10, 20):
            if y != 16:
                walls.add((10, y))

    elif level == 7:
        # Four Rooms with doorways
        cx, cy = GRID_W // 2, GRID_H // 2
        for x in range(1, GRID_W - 1):
            if abs(x - cx) > 2:
                walls.add((x, cy))
        for y in range(1, GRID_H - 1):
            if abs(y - cy) > 2:
                walls.add((cx, y))

    elif level == 8:
        # Dense Maze - short wall segments forming corridors (2+ cells wide)
        segments = [
            ((4, 4), (4, 8)), ((8, 4), (14, 4)), ((8, 8), (8, 12)),
            ((12, 7), (12, 11)), ((16, 4), (16, 10)), ((20, 3), (20, 8)),
            ((24, 4), (28, 4)), ((24, 8), (24, 14)), ((28, 7), (34, 7)),
            ((32, 4), (32, 10)), ((36, 4), (36, 9)),
            ((4, 13), (10, 13)), ((4, 17), (4, 22)), ((8, 17), (14, 17)),
            ((12, 14), (12, 17)), ((16, 14), (22, 14)), ((18, 17), (18, 22)),
            ((22, 18), (28, 18)), ((26, 11), (26, 16)), ((30, 12), (30, 17)),
            ((32, 14), (36, 14)), ((34, 17), (34, 22)),
            ((4, 25), (10, 25)), ((8, 21), (8, 25)), ((12, 22), (18, 22)),
            ((14, 25), (20, 25)), ((22, 22), (22, 26)), ((26, 22), (32, 22)),
            ((28, 25), (34, 25)), ((36, 18), (36, 24)),
        ]
        for (x1, y1), (x2, y2) in segments:
            if x1 == x2:
                for y in range(min(y1, y2), max(y1, y2) + 1):
                    walls.add((x1, y))
            else:
                for x in range(min(x1, x2), max(x1, x2) + 1):
                    walls.add((x, y1))

    return walls


# ── Game State ─────────────────────────────────────────────────────

@dataclass
class PlayerState:
    pid: str
    name: str
    color: str
    segments: list = field(default_factory=list)  # [(x,y), ...] head first
    direction: str = "right"
    next_direction: str = "right"
    score: int = 0
    lives: int = MAX_LIVES
    alive: bool = True
    game_over: bool = False
    respawn_at: Optional[float] = None

    def head(self):
        return self.segments[0] if self.segments else None


class GameState:
    def __init__(self):
        self.level = 1
        self.walls = build_level_walls(1)
        self.food: list[tuple[int, int]] = []
        self.players: dict[str, PlayerState] = {}
        self.food_eaten = 0
        self.level_changing = False
        self.level_change_at: Optional[float] = None
        self.color_index = 0
        self.eaten_events: list[tuple[int, int, str]] = []  # (x, y, color)

    def next_color(self) -> str:
        c = NEON_COLORS[self.color_index % len(NEON_COLORS)]
        self.color_index += 1
        return c

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
            # Body segments (behind the head)
            segs = [(x - dx * i, y - dy * i) for i in range(length)]
            valid = True
            for sx, sy in segs:
                if (sx, sy) in blocked or sx <= 0 or sx >= GRID_W - 1 or sy <= 0 or sy >= GRID_H - 1:
                    valid = False
                    break
            # Clear runway ahead in facing direction
            if valid:
                for step in range(1, runway + 1):
                    rx, ry = x + dx * step, y + dy * step
                    if (rx, ry) in blocked or rx <= 0 or rx >= GRID_W - 1 or ry <= 0 or ry >= GRID_H - 1:
                        valid = False
                        break
            if valid:
                return segs, d
            attempts += 1
        # Fallback: relax runway requirement progressively
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

        while len(self.food) < FOOD_COUNT:
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
        for p in self.players.values():
            p.lives = MAX_LIVES
            p.game_over = False
            self.spawn_player(p)
        self.spawn_food()

    def tick(self):
        now = time.time()
        self.eaten_events.clear()

        # Handle level countdown
        if self.level_changing:
            if now >= self.level_change_at:
                new_level = (self.level % TOTAL_LEVELS) + 1
                self.change_level(new_level)
            return

        # Respawn dead players (skip game over)
        for p in self.players.values():
            if not p.alive and not p.game_over and p.respawn_at and now >= p.respawn_at:
                self.spawn_player(p)

        # Apply direction changes
        for p in self.players.values():
            if p.alive:
                if OPPOSITES.get(p.next_direction) != p.direction or len(p.segments) == 1:
                    p.direction = p.next_direction

        # Move snakes
        new_heads = {}
        for pid, p in self.players.items():
            if not p.alive:
                continue
            dx, dy = DIRECTIONS[p.direction]
            hx, hy = p.segments[0]
            new_head = (hx + dx, hy + dy)
            new_heads[pid] = new_head

        # Check collisions
        kills = set()
        for pid, head in new_heads.items():
            p = self.players[pid]
            # Wall collision
            if head in self.walls:
                kills.add(pid)
                continue
            # Self collision (check against current body minus tail)
            if head in p.segments[:-1]:
                kills.add(pid)
                continue
            # Other snake body collision
            for other_pid, other_p in self.players.items():
                if other_pid == pid or not other_p.alive:
                    continue
                if head in other_p.segments:
                    kills.add(pid)
                    break

        # Head-on collision
        for pid1, head1 in new_heads.items():
            for pid2, head2 in new_heads.items():
                if pid1 < pid2 and head1 == head2:
                    kills.add(pid1)
                    kills.add(pid2)

        # Kill players
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

        # Move surviving snakes and check food
        for pid, head in new_heads.items():
            if pid in kills:
                continue
            p = self.players[pid]
            p.segments.insert(0, head)
            if head in self.food:
                self.food.remove(head)
                p.score += 1
                self.food_eaten += 1
                self.eaten_events.append((head[0], head[1], p.color))
            else:
                p.segments.pop()

        # Spawn food
        self.spawn_food()

        # Check level advance
        if self.food_eaten >= FOOD_TO_ADVANCE:
            self.level_changing = True
            self.level_change_at = now + LEVEL_COUNTDOWN


# ── Networking ─────────────────────────────────────────────────────

game = GameState()
clients: dict = {}  # websocket -> player_id
html_content = None


def load_html():
    global html_content
    import os
    html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
    with open(html_path, "r") as f:
        html_content = f.read()


async def process_request(connection, request):
    # Only serve HTML for non-WebSocket requests
    if "Upgrade" in request.headers and request.headers["Upgrade"].lower() == "websocket":
        return None
    if request.path == "/" or request.path == "/index.html":
        return Response(
            200, "OK",
            Headers([
                ("Content-Type", "text/html; charset=utf-8"),
                ("Content-Length", str(len(html_content.encode()))),
                ("Connection", "close"),
            ]),
            html_content.encode(),
        )
    return None


def walls_to_list(walls):
    return [[x, y] for x, y in sorted(walls)]


def build_state_msg():
    players_data = {}
    for pid, p in game.players.items():
        players_data[pid] = {
            "name": p.name,
            "color": p.color,
            "segments": p.segments,
            "score": p.score,
            "lives": p.lives,
            "alive": p.alive,
            "game_over": p.game_over,
            "direction": p.direction,
        }
    return json.dumps({
        "type": "state",
        "players": players_data,
        "food": game.food,
        "level": game.level,
        "food_eaten": game.food_eaten,
        "food_target": FOOD_TO_ADVANCE,
        "level_changing": game.level_changing,
        "level_change_at": game.level_change_at,
        "eaten_events": game.eaten_events,
    })


async def handler(websocket):
    player_id = None
    try:
        async for raw in websocket:
            msg = json.loads(raw)
            if msg["type"] == "join":
                player_id = f"p{id(websocket)}"
                name = msg.get("name", "Player")[:16]
                p = PlayerState(pid=player_id, name=name, color=game.next_color())
                game.spawn_player(p)
                game.players[player_id] = p
                clients[websocket] = player_id
                await websocket.send(json.dumps({
                    "type": "welcome",
                    "player_id": player_id,
                    "level": game.level,
                    "walls": walls_to_list(game.walls),
                    "grid": [GRID_W, GRID_H],
                }))
            elif msg["type"] == "input":
                if player_id and player_id in game.players:
                    d = msg.get("direction")
                    if d in DIRECTIONS:
                        game.players[player_id].next_direction = d
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if websocket in clients:
            pid = clients.pop(websocket)
            game.players.pop(pid, None)


async def game_loop():
    prev_level = game.level
    game.spawn_food()
    while True:
        game.tick()

        # Detect level change for wall broadcast
        if game.level != prev_level:
            level_msg = json.dumps({
                "type": "level_change",
                "level": game.level,
                "walls": walls_to_list(game.walls),
            })
            websockets.broadcast(set(clients.keys()), level_msg)
            prev_level = game.level

        state_msg = build_state_msg()
        websockets.broadcast(set(clients.keys()), state_msg)

        await asyncio.sleep(1 / TICK_RATE)


async def main():
    load_html()
    print("Snake server starting on http://localhost:8765")

    async with websockets.serve(
        handler,
        "0.0.0.0",
        8765,
        process_request=process_request,
    ):
        await game_loop()


if __name__ == "__main__":
    asyncio.run(main())
