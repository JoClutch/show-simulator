# CLAUDE.md

## Project Summary

A static, browser-based Survivor season simulator. Plain HTML, CSS, and vanilla JavaScript. No build tools, no frameworks, no backend.

## Key Constraints

- No multiplayer, database, tribe swaps, idols, merge systems, or advanced features until explicitly added
- One test season only (Phase 1)
- All files run directly in the browser — no Node.js required at runtime

## Code Style

- Vanilla JS only (no React, Vue, etc.)
- Keep each file focused on one responsibility
- Prefer clear variable names over comments
- All game state lives in a single `gameState` object in `main.js`
- UI functions only read state — they never mutate it directly
- Engine functions mutate state — they never touch the DOM

## File Roles

| File/Folder | Purpose |
|---|---|
| `src/main.js` | Game loop, state initialization, screen routing |
| `src/engine/` | Pure logic: challenges, votes, relationships |
| `src/ui/` | DOM rendering for each screen |
| `src/data/` | Static JSON/JS data: contestants, tribes, season config |
| `src/styles.css` | All styles — no inline styles in JS |

## Game Loop (Phase 1)

```
Start → Pick contestant → Camp Life → Challenge → 
  [losing tribe] → Tribal Council → repeat
  [winning tribe] → skip Tribal → next round
```

## Docs

Always update `docs/roadmap.md` when a phase is completed or scope changes.
