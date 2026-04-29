# Survivor Season Simulator

A browser-based simulator inspired by the TV show Survivor. Play through a full season as one of 16 fictional contestants, competing in challenges, building relationships at camp, and surviving Tribal Council votes.

## What This Is

A static web app — no server, no database, no login. Open `index.html` in a browser and play. Nothing to install.

## Current Scope (Phase 1)

- 1 test season with 16 fictional contestants
- 2 tribes of 8 players
- Player picks one contestant to play as
- Each contestant has 3 stats: Challenge, Social, Strategy
- Game loop: Camp Life → Challenge → Camp Life → Tribal Council → repeat
- Dramatic one-at-a-time vote reveals at Tribal Council

## How to Run Locally

1. Clone or download this repo
2. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
3. No build step, no dependencies, no server needed

> **Note:** Some browsers block local `file://` scripts. If the page loads blank, either use Firefox (which allows it by default) or run a simple local server:
> ```
> # Python 3
> python -m http.server 8000
> # then open http://localhost:8000
> ```

## Play on GitHub Pages

The live version is served directly from the `main` branch root.

To deploy your own fork:

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Under **Build and deployment**, set Source to **Deploy from a branch**
4. Set Branch to **main** (or **master**) and folder to **/ (root)**
5. Click **Save** — GitHub will give you a URL like `https://yourusername.github.io/show-simulator/`

## Project Structure

```
index.html          # Entry point — served by GitHub Pages
src/
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
