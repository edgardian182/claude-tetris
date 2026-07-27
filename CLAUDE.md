# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly or serve locally:

```bash
open index.html                  # macOS — open directly
python3 -m http.server 8000      # then visit http://localhost:8000
npx serve .                      # alternative static server
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600 px) for the game, `<canvas id="next-canvas">` for the piece preview, HUD elements (`#score`, `#lines`, `#level`), and `#overlay` for pause/game-over states.
- **`style.css`** — Dark/retro arcade theme using CSS variables, flexbox layout, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~305 lines, `'use strict'`, no modules).

### Key constants in `game.js`

| Constant | Default | Notes |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | Changing these requires matching canvas `width`/`height` in `index.html` (`COLS×BLOCK` / `ROWS×BLOCK`) |
| `BLOCK` | 30 | Pixel size of each cell |
| `COLORS` | 7-color array | Index 1–7 maps to piece types I–L |
| `PIECES` | 7 matrices | Piece shapes stored as square 2D arrays with color-index values |
| `LINE_SCORES` | `[0,100,300,500,800]` | Multiplied by current `level` on line clear |

### Game loop and state

The game loop runs via `requestAnimationFrame`. Global mutable state lives in module-level `let` variables: `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`.

**Call chain:**
```
init() → spawn() → requestAnimationFrame(loop)
loop(ts) → accumulates dt → auto-drops or lockPiece() → draw()
lockPiece() → merge() → clearLines() → spawn()
spawn() → collide() on entry → endGame() if blocked
```

**Rotation:** `rotateCW` uses transpose + row-reverse. `tryRotate` tries 5 wall-kick offsets (`[0, -1, 1, -2, 2]`) before giving up.

**Ghost piece:** `ghostY()` projects `current` straight down until collision; drawn at `globalAlpha = 0.2`.

**Speed formula:** `dropInterval = Math.max(100, 1000 − (level − 1) × 90)` ms. Level increments every 10 lines.
