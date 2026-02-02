"""FastAPI application — HTTP route, WebSocket endpoint, game loop."""

import asyncio
import json
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from .constants import GRID_W, GRID_H, TICK_RATE, TOTAL_LEVELS, DIRECTIONS
from .game import GameState
from .models import PlayerState
from .connection_manager import ConnectionManager, walls_to_list, build_state_msg


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(game_loop())
    yield


app = FastAPI(lifespan=lifespan)
game = GameState()
manager = ConnectionManager()

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
                p = PlayerState(pid=player_id, name=name, color=game.next_color())
                game.spawn_player(p)
                game.players[player_id] = p
                manager.connections[ws] = player_id
                await ws.send_text(json.dumps({
                    "type": "welcome",
                    "player_id": player_id,
                    "level": game.level,
                    "walls": walls_to_list(game.walls),
                    "grid": [GRID_W, GRID_H],
                }))
            elif msg["type"] == "input":
                if player_id in game.players:
                    d = msg.get("direction")
                    if d in DIRECTIONS:
                        game.players[player_id].next_direction = d
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.connections.pop(ws, None)
        game.players.pop(player_id, None)


async def game_loop():
    prev_level = game.level
    game.spawn_food()
    while True:
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
