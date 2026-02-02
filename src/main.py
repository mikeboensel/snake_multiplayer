"""FastAPI application — HTTP route, WebSocket endpoint, game loop."""

import asyncio
import json
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .constants import GRID_W, GRID_H, TICK_RATE, TOTAL_LEVELS, DIRECTIONS, NEON_COLORS, HEAD_AVATARS, MAX_LIVES
from .models import PlayerLocation
import re


# Custom heads storage (player_id -> base64 data URL)
custom_heads = {}
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

                # Handle custom head or emoji avatar
                custom_head = msg.get("custom_head")
                head_avatar = msg.get("head_avatar", "angel")

                if custom_head:
                    # Validate custom head format
                    if validate_custom_head(custom_head):
                        custom_heads[player_id] = custom_head
                        head_avatar = None  # Clear emoji avatar
                    else:
                        custom_head = None
                        if head_avatar not in HEAD_AVATARS:
                            head_avatar = "angel"
                else:
                    if head_avatar not in HEAD_AVATARS:
                        head_avatar = "angel"

                p = PlayerState(pid=player_id, name=name, color=color, head_avatar=head_avatar, custom_head=custom_head)
                game.players[player_id] = p
                manager.connections[ws] = player_id
                await ws.send_text(json.dumps({
                    "type": "welcome",
                    "player_id": player_id,
                }))

                # If game is in progress, send game state for spectating
                if game.started:
                    await ws.send_text(json.dumps({
                        "type": "game_in_progress",
                        "level": game.level,
                        "walls": walls_to_list(game.walls),
                        "grid": [GRID_W, GRID_H],
                    }))
                    # Send lobby state so late joiners can see who's playing
                    await ws.send_text(build_lobby_msg(game))
                    # Send current state immediately
                    await ws.send_text(build_state_msg(game))
                else:
                    # Only broadcast to lobby if game hasn't started
                    await manager.broadcast(build_lobby_msg(game))
            elif msg["type"] == "ready":
                # Ignore ready messages during a game - must wait for game to end
                if player_id in game.players and not game.started:
                    if player_id in game.ready_players:
                        game.ready_players.discard(player_id)
                    else:
                        game.ready_players.add(player_id)
                    await manager.broadcast(build_lobby_msg(game))
                    # Check if ready to start (only lobby players need to be ready)
                    lobby_players = {pid for pid, p in game.players.items()
                                    if not getattr(p, 'is_ai', False) and p.location == PlayerLocation.LOBBY}
                    if (len(game.ready_players) >= 1
                            and game.ready_players == lobby_players):
                        # Move ready players to playing
                        for pid in game.ready_players:
                            game.players[pid].location = PlayerLocation.PLAYING
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
                    bot_diff = msg.get("bot_difficulty")
                    if isinstance(bot_diff, int) and 0 <= bot_diff <= 2:
                        game.game_options["bot_difficulty"] = bot_diff
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
            elif msg["type"] == "pause":
                if player_id in game.players and game.started:
                    # Toggle player's personal pause state
                    if player_id in game.paused_players:
                        game.paused_players.discard(player_id)
                    else:
                        game.paused_players.add(player_id)
                    # Broadcast new pause state to all players
                    await manager.broadcast(json.dumps({
                        "type": "pause_state",
                        "paused_players": list(game.paused_players),
                    }))
            elif msg["type"] == "input":
                if player_id in game.players and game.started and player_id not in game.paused_players:
                    d = msg.get("direction")
                    if d in DIRECTIONS:
                        game.players[player_id].next_direction = d
            elif msg["type"] == "return_to_lobby":
                if player_id in game.players:
                    player = game.players[player_id]

                    # Move only this player to lobby
                    player.location = PlayerLocation.LOBBY
                    player.score = 0
                    lives = game.game_options.get("lives", MAX_LIVES)
                    player.lives = lives
                    player.alive = True
                    player.game_over = False
                    player.segments = []
                    player.respawn_at = None
                    game.ready_players.discard(player_id)

                    # Send personal message to move this client to lobby
                    await ws.send_text(json.dumps({"type": "move_to_lobby"}))

                    # Broadcast player location change
                    await manager.broadcast(json.dumps({
                        "type": "player_location_changed",
                        "player_id": player_id,
                        "location": "lobby",
                    }))

                    # Send lobby state to this player so they can see who's playing
                    await ws.send_text(build_lobby_msg(game))

                    # Only reset game if NO active players remain
                    if game.started and not game.has_active_players:
                        game.started = False
                        game.paused_players.clear()
                        game.level = 1
                        game.walls = build_level_walls(1)
                        game.food.clear()
                        game.food_eaten = 0
                        game.level_changing = False
                        game.level_change_at = None
                        game.eaten_events.clear()
                        game.ready_players.clear()
                        for p in game.players.values():
                            p.score = 0
                            p.lives = lives
                            p.alive = True
                            p.game_over = False
                            p.segments = []
                            p.respawn_at = None
                            if hasattr(p, 'ai_decision_at'):
                                p.ai_decision_at = 0.0
                        await manager.broadcast(json.dumps({"type": "game_end"}))
                        await manager.broadcast(build_lobby_msg(game))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.connections.pop(ws, None)
        game.ready_players.discard(player_id)
        game.players.pop(player_id, None)
        custom_heads.pop(player_id, None)  # Clean up custom head
        # Reset game state when last player disconnects
        if not game.players:
            game.started = False
            game.paused_players.clear()
            game.level = 1
            game.walls = build_level_walls(1)
            game.food.clear()
            game.food_eaten = 0
            game.level_changing = False
            game.level_change_at = None
            game.eaten_events.clear()
            game.ready_players.clear()
        # If no active players remain, end the game
        elif game.started and not game.has_active_players:
            game.started = False
            game.paused_players.clear()
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
                if hasattr(p, 'ai_decision_at'):
                    p.ai_decision_at = 0.0
            await manager.broadcast(json.dumps({"type": "game_end"}))
        if not game.started:
            await manager.broadcast(build_lobby_msg(game))


def any_paused_human_players(game_state: GameState) -> bool:
    """Check if any human (non-AI) players are paused."""
    for pid in game_state.paused_players:
        if pid in game_state.players and not getattr(game_state.players[pid], 'is_ai', False):
            return True
    return False


def validate_custom_head(data_url: str) -> bool:
    """Validate a custom head data URL.

    Args:
        data_url: Base64 data URL string (e.g., "data:image/png;base64,...")

    Returns:
        True if valid, False otherwise
    """
    if not isinstance(data_url, str):
        return False

    # Check format: data:image/<type>;base64,<data>
    pattern = r'^data:image/([a-zA-Z+]+);base64,[A-Za-z0-9+/=]+$'
    if not re.match(pattern, data_url):
        return False

    # Check size: must be less than 100KB
    if len(data_url) > 100 * 1024:
        return False

    return True


async def game_loop():
    prev_level = game.level
    while True:
        if not game.started or any_paused_human_players(game):
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
