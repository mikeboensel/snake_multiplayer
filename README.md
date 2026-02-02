# Neon Snake - Multiplayer Game

A real-time multiplayer Snake game built with Python (FastAPI) and vanilla JavaScript. Features multiple players, AI bots, custom avatars, progressive levels, and configurable game options.

## Architecture

### Backend (Python)
- **FastAPI**: HTTP server and WebSocket endpoint for real-time communication
- **Game Loop**: Asynchronous game loop running at 10 ticks/second
- **State Management**: Server-authoritative game state with client synchronization
- **Modules**:
  - `main.py`: FastAPI app, WebSocket handler, game loop orchestration
  - `game.py`: Core game logic, AI behavior, collision detection
  - `connection_manager.py`: WebSocket connection management and message serialization
  - `models.py`: Player state and location enums
  - `levels.py`: Level wall definitions (8 levels)
  - `constants.py`: Game configuration constants

### Frontend (JavaScript)
- **Vanilla JavaScript**: No frameworks, modular ES6 modules
- **Modules**:
  - `main.js`: Application entry point and initialization
  - `networking.js`: WebSocket communication and message handling
  - `state.js`: Client-side state management
  - `rendering.js`: Canvas rendering, visual effects, animations
  - `ui.js`: UI interactions, overlays, lobby management
  - `audio.js`: Sound effects and audio management
  - `effects-settings.js`: Visual effects configuration
  - `image-processor.js`: Custom avatar image processing

### Communication
- **WebSocket**: Bidirectional real-time communication
- **Message Types**: `join`, `ready`, `input`, `state`, `game_start`, `game_end`, `lobby_state`, etc.
- **State Sync**: Server broadcasts game state every tick to all connected clients

## Features

- **Multiplayer**: Support for multiple human players simultaneously
- **AI Bots**: Configurable difficulty levels (Easy, Medium, Hard)
- **Customization**: 
  - Player names, colors, and avatars (emoji or custom image upload)
  - Game options: lives, food count, collision settings
- **Progressive Levels**: 8 levels with increasing wall complexity
- **Visual Effects**: Particles, screen shake, area warp, glow effects
- **Audio**: Sound effects for eating food and player death
- **Lives System**: Players respawn with limited lives
- **Spectator Mode**: Players can watch ongoing games

## Requirements

- Python 3.8+ (for local development)
- UV (fast Python package installer) - recommended for local development
- Docker and Docker Compose (for containerized deployment)

## Installation

### Local Development

1. Install UV (if not already installed):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Install Python dependencies using UV:
```bash
uv pip install fastapi "uvicorn[standard]"
```

Or install from `pyproject.toml`:
```bash
uv pip install -e .
```

Alternatively, using traditional pip:
```bash
pip install fastapi uvicorn
```

### Docker Deployment

Docker Compose automatically reads a `.env` file in the project root. You can create one to customize the port:

```bash
# Create .env file from example (optional - defaults to port 8765)
cp .env.example .env
# Edit .env to change PORT if needed
```

Build and run with Docker Compose:
```bash
docker-compose up --build
```

Or build and run manually:
```bash
docker build -t neon-snake .
docker run -p 8765:8765 neon-snake
```

## Running

### Local Development

Start the server:
```bash
python -m src.main
```

The server will start on `http://localhost:8765`. Open this URL in your web browser to play.

### Docker

Start with Docker Compose:
```bash
docker-compose up
```

The server will be available at `http://localhost:8765`. To run in detached mode:
```bash
docker-compose up -d
```

Stop the server:
```bash
docker-compose down
```

## Game Controls

- **Movement**: Arrow keys or WASD
- **Pause**: ESC key (personal pause, doesn't affect other players)
- **Ready**: Click "READY" button in lobby to join the game

## Project Structure

```
python_multiplayer/
├── src/                    # Python backend
│   ├── main.py            # FastAPI app and WebSocket handler
│   ├── game.py            # Game state and logic
│   ├── connection_manager.py
│   ├── models.py
│   ├── levels.py
│   └── constants.py
├── static/                # Frontend assets
│   ├── css/
│   │   └── styles.css
│   └── js/                # JavaScript modules
│       ├── main.js
│       ├── networking.js
│       ├── state.js
│       ├── rendering.js
│       ├── ui.js
│       ├── audio.js
│       ├── effects-settings.js
│       └── image-processor.js
├── index.html             # Main HTML file
├── pyproject.toml         # Python project configuration
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Docker Compose configuration
├── .env.example           # Environment variables example
└── .dockerignore          # Docker build exclusions
```

## Configuration

### Server Configuration

Server port can be configured via environment variable or `.env` file:
- `PORT`: Server port (default: `8765`)
- Create a `.env` file from `.env.example` to customize

### Game Configuration

Game constants can be modified in `src/constants.py`:
- Grid dimensions (`GRID_W`, `GRID_H`)
- Tick rate (`TICK_RATE`)
- Default food count and advancement threshold
- Respawn delay and level countdown
- Maximum lives

## Development

### Local Development

The server logs to stdout. For production, redirect output:
```bash
python -m src.main > server.log 2>&1
```

Stop the server:
```bash
pkill -f "python.*main"
```

### Docker Development

The Dockerfile uses UV for fast dependency installation. View logs:
```bash
docker-compose logs -f
```

Rebuild after code changes:
```bash
docker-compose up --build
```

The Docker Compose setup includes volume mounts for `static/` and `index.html` to enable hot-reloading during development. Remove these volumes in production for better performance.

## Deployment

The application is deployment-ready and uses dynamic host detection. The client-side code automatically connects to the server using `location.host`, so it will work on any domain without code changes.

### Environment Variables

- `PORT`: Server port (default: `8765`)
- `HOST`: Server bind address (default: `0.0.0.0`)

### Production Deployment

1. **Using Docker Compose**:
   ```bash
   # Remove volume mounts for production
   # Edit docker-compose.yml to remove the volumes section
   docker-compose up -d
   ```

2. **Using Docker directly**:
   ```bash
   docker build -t neon-snake .
   docker run -d -p 8765:8765 -e PORT=8765 neon-snake
   ```

3. **Behind a reverse proxy** (recommended for production):
   - Use nginx or Traefik to handle SSL/TLS termination
   - Configure WebSocket proxying for `/ws` endpoint
   - Example nginx configuration:
     ```nginx
     location / {
         proxy_pass http://localhost:8765;
         proxy_http_version 1.1;
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection "upgrade";
     }
     ```

### WebSocket Protocol

The client automatically uses `wss://` (secure WebSocket) when served over HTTPS, and `ws://` when served over HTTP. Ensure your reverse proxy properly handles WebSocket upgrades for the `/ws` endpoint.
