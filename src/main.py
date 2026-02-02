"""FastAPI application — HTTP route, WebSocket endpoint, game loop."""

import asyncio
import json
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .constants import GRID_W, GRID_H, TICK_RATE, TOTAL_LEVELS, DIRECTIONS, NEON_COLORS, HEAD_AVATARS, MAX_LIVES
from .game import GameState
from .levels import build_level_walls
from .models import PlayerState
from .connection_manager import ConnectionManager, walls_to_list, build_state_msg, build_lobby_msg


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(game_loop())
    yield


app = FastAPI(lifespan=lifespan)
game = GameState()
manager = ConnectionManager()

# Mount static files directory
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

HTML_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "index.html")


@app.get("/")
async def serve_index():
    return FileResponse(HTML_PATH, media_type="text/html")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    player_id = f"p{id(ws)}"
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg["type"] == "join":
                name = msg.get("name", "Player")[:16]
                color = msg.get("color", NEON_COLORS[0])
                if color not in NEON_COLORS:
                    color = NEON_COLORS[0]
                head_avatar = msg.get("head_avatar", "angel")
                if head_avatar not in HEAD_AVATARS:
                    head_avatar = "angel"
                p = PlayerState(pid=player_id, name=name, color=color, head_avatar=head_avatar)
                game.players[player_id] = p
                manager.connections[ws] = player_id
                await ws.send_text(json.dumps({
                    "type": "welcome",
                    "player_id": player_id,
                }))
                await manager.broadcast(build_lobby_msg(game))
            elif msg["type"] == "ready":
                if player_id in game.players and not game.started:
                    if player_id in game.ready_players:
                        game.ready_players.discard(player_id)
                    else:
                        game.ready_players.add(player_id)
                    await manager.broadcast(build_lobby_msg(game))
                    # Check if all human players are ready (AI is always ready)
                    human_players = {pid for pid, p in game.players.items() if not getattr(p, 'is_ai', False)}
                    if (len(game.ready_players) >= 1
                            and game.ready_players == human_players):
                        game.start_game()
                        await manager.broadcast(json.dumps({
                            "type": "game_start",
                            "level": game.level,
                            "walls": walls_to_list(game.walls),
                            "grid": [GRID_W, GRID_H],
                        }))
            elif msg["type"] == "game_options":
                if player_id in game.players and not game.started:
                    fta = msg.get("food_to_advance")
                    if isinstance(fta, int) and 1 <= fta <= 19:
                        game.game_options["food_to_advance"] = fta
                    fc = msg.get("food_count")
                    if isinstance(fc, int) and 1 <= fc <= 5:
                        game.game_options["food_count"] = fc
                    coll = msg.get("collisions")
                    if isinstance(coll, bool):
                        game.game_options["collisions"] = coll
                    lives = msg.get("lives")
                    if isinstance(lives, int) and 1 <= lives <= 9:
                        game.game_options["lives"] = lives
                    await manager.broadcast(build_lobby_msg(game))
            elif msg["type"] == "add_ai":
                if player_id in game.players and not game.started:
                    ai_id = game.add_ai()
                    await manager.broadcast(build_lobby_msg(game))
            elif msg["type"] == "remove_ai":
                if player_id in game.players and not game.started:
                    ai_id = msg.get("ai_id")
                    if ai_id:
                        game.remove_ai(ai_id)
                        await manager.broadcast(build_lobby_msg(game))
            elif msg["type"] == "input":
                if player_id in game.players and game.started:
                    d = msg.get("direction")
                    if d in DIRECTIONS:
                        game.players[player_id].next_direction = d
            elif msg["type"] == "return_to_lobby":
                if game.started:
                    game.started = False
                    game.level = 1
                    game.walls = build_level_walls(1)
                    game.food.clear()
                    game.food_eaten = 0
                    game.level_changing = False
                    game.level_change_at = None
                    game.eaten_events.clear()
                    game.ready_players.clear()
                    lives = game.game_options.get("lives", MAX_LIVES)
                    for p in game.players.values():
                        p.score = 0
                        p.lives = lives
                        p.alive = True
                        p.game_over = False
                        p.segments = []
                        p.respawn_at = None
                        # Reset AI decision timers
                        if hasattr(p, 'ai_decision_at'):
                            p.ai_decision_at = 0.0
                    await manager.broadcast(json.dumps({"type": "return_to_lobby"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.connections.pop(ws, None)
        game.ready_players.discard(player_id)
        game.players.pop(player_id, None)
        # Reset game state when last player disconnects
        if not game.players:
            game.started = False
            game.level = 1
            game.walls = build_level_walls(1)
            game.food.clear()
            game.food_eaten = 0
            game.level_changing = False
            game.level_change_at = None
            game.eaten_events.clear()
            game.ready_players.clear()
        if not game.started:
            await manager.broadcast(build_lobby_msg(game))
            # Check if remaining human players are all ready
            human_players = {pid for pid, p in game.players.items() if not getattr(p, 'is_ai', False)}
            if (len(game.players) >= 1
                    and game.ready_players == human_players):
                game.start_game()
                await manager.broadcast(json.dumps({
                    "type": "game_start",
                    "level": game.level,
                    "walls": walls_to_list(game.walls),
                    "grid": [GRID_W, GRID_H],
                }))


async def game_loop():
    prev_level = game.level
    while True:
        if not game.started:
            await asyncio.sleep(1 / TICK_RATE)
            continue

        game.tick()

        if game.level != prev_level:
            level_msg = json.dumps({
                "type": "level_change",
                "level": game.level,
                "walls": walls_to_list(game.walls),
            })
            await manager.broadcast(level_msg)
            prev_level = game.level

        state_msg = build_state_msg(game)
        await manager.broadcast(state_msg)

        await asyncio.sleep(1 / TICK_RATE)


if __name__ == "__main__":
    import uvicorn
    print("Snake server starting on http://localhost:8765")
    uvicorn.run(app, host="0.0.0.0", port=8765)
