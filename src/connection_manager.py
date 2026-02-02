"""WebSocket connection management and state serialization."""

import json

from fastapi import WebSocket

from .constants import GRID_W, GRID_H
from .game import GameState


class ConnectionManager:
    def __init__(self):
        self.connections: dict[WebSocket, str] = {}

    async def connect(self, ws: WebSocket, player_id: str):
        await ws.accept()
        self.connections[ws] = player_id

    def disconnect(self, ws: WebSocket):
        self.connections.pop(ws, None)

    async def broadcast(self, message: str):
        disconnected = []
        for ws in self.connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.connections.pop(ws, None)

    async def send_personal(self, ws: WebSocket, message: str):
        await ws.send_text(message)


def walls_to_list(walls) -> list[list[int]]:
    return [[x, y] for x, y in sorted(walls)]


def build_state_msg(game: GameState) -> str:
    players_data = {}
    for pid, p in game.players.items():
        players_data[pid] = {
            "name": p.name,
            "color": p.color,
            "head_avatar": p.head_avatar,
            "segments": p.segments,
            "score": p.score,
            "lives": p.lives,
            "alive": p.alive,
            "game_over": p.game_over,
            "direction": p.direction,
            "is_ai": getattr(p, "is_ai", False),
        }
    return json.dumps({
        "type": "state",
        "players": players_data,
        "food": game.food,
        "level": game.level,
        "food_eaten": game.food_eaten,
        "food_target": game.game_options["food_to_advance"],
        "level_changing": game.level_changing,
        "level_change_at": game.level_change_at,
        "eaten_events": game.eaten_events,
        "paused_players": list(game.paused_players),
    })


def build_lobby_msg(game: GameState) -> str:
    players = []
    for pid, p in game.players.items():
        players.append({
            "pid": pid,
            "name": p.name,
            "color": p.color,
            "head_avatar": p.head_avatar,
            "ready": pid in game.ready_players,
            "is_ai": getattr(p, "is_ai", False),
        })
    return json.dumps({
        "type": "lobby_state",
        "players": players,
        "game_options": game.game_options,
    })
