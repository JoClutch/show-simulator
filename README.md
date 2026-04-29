# Survivor Season Simulator

A browser-based simulator inspired by the TV show Survivor. Play through a full season as one of 16 fictional contestants, competing in challenges, building relationships at camp, and surviving Tribal Council votes.

## What This Is

A static web app — no server, no database, no login. Just open `src/index.html` in a browser and play.

## Current Scope (Phase 1)

- 1 test season with 16 fictional contestants
- 2 tribes of 8 players
- Player picks one contestant to play as
- Each contestant has 3 stats: Challenge, Social, Strategy
- Game loop: Camp Life → Challenge → (Camp Life) → Tribal Council → repeat
- Dramatic one-at-a-time vote reveals at Tribal Council

## How to Run

1. Clone or download this repo
2. Open `src/index.html` in any modern browser
3. No build step needed

## Project Structure

```
src/
  index.html        # Entry point
  styles.css        # All visual styling
  main.js           # App bootstrap and game loop
  data/             # Static contestant and season data
  engine/           # Game logic (votes, challenges, relationships)
  ui/               # DOM rendering and screen transitions
docs/
  product-spec.md   # Full feature description
  roadmap.md        # Phased development plan
  game-rules.md     # How the game works
```

## Docs

- [Product Spec](docs/product-spec.md)
- [Roadmap](docs/roadmap.md)
- [Game Rules](docs/game-rules.md)
