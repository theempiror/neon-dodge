# Neon Dodge 🎮

A polished single-page arcade game built with **pure HTML, CSS, and vanilla JavaScript** — no build tools, no dependencies.

## How to run

1. Clone or download this repository.
2. Open **`index.html`** in any modern browser (Chrome, Firefox, Edge, Safari).  
   That's it — no server or install step required.

> Tip: For the best experience on a local machine you can also serve it with any static file server, e.g.  
> `npx serve .`  and then navigate to `http://localhost:3000`.

## How to play

| Control | Action |
|---------|--------|
| ← / A   | Move left |
| → / D   | Move right |
| Swipe   | Move left / right on touch devices |

Survive as long as possible by dodging the falling neon blocks.  
Each block you dodge earns **1 point**.  
The game gets faster and spawns more obstacles as your score rises.

## File structure

```
neon-dodge/
├── index.html   # Game layout and screens
├── style.css    # Neon visual style & animations
├── game.js      # All game logic (player, obstacles, scoring, sound)
└── README.md    # This file
```

## Features

- **Start screen** with title and control hints
- **Game-over screen** with current score and all-time best (persisted via `localStorage`)
- **Score counter** and level indicator in the HUD
- **Increasing difficulty** — speed, spawn rate, and max obstacles scale with score
- **Smooth animations** — CSS transitions for player movement, obstacle spawning, particle burst, arena flash
- **Sound-ready structure** — synthesised sound effects via the Web Audio API (dodge, level-up, game-over)
- **Responsive layout** — adapts to any viewport; touch-swipe controls for mobile
- **Modern neon aesthetic** — dark background, glowing cyan/pink/yellow elements, scanline overlay, flickering title
