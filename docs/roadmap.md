# Roadmap

## Phase 1 — Working Prototype ✅

Goal: A playable loop from start to first elimination.

- [x] Contestant select screen with all 16 players and stats
- [x] Two tribes of 8, randomly assigned at start
- [x] Camp Life screen with simple flavor-text relationship events
- [x] Challenge screen with weighted random outcome
- [x] Tribal Council with player vote input
- [x] AI votes calculated from relationship values
- [x] One-at-a-time vote reveal
- [x] Elimination screen
- [x] Game over screen when player is voted out
- [x] Placeholder end screen at final 3

Deliverable: A full round-trip game loop in the browser.

---

## Phase 2 — Full Season Loop ✅

Goal: Play from start to final 3 without stopping.

- [x] Track all eliminations across episodes
- [x] Correctly remove eliminated players from tribe lists
- [x] Multiple rounds until final 3
- [x] Episode counter and day tracking
- [x] v2.1: Expanded camp actions (talk, strategy, confide, lobby, lay low, etc.)
- [x] v2.1: Trust system (per-pair, 0–10, affects intel quality)
- [x] v2.1: Suspicion system (per-player, affects AI vote targeting)
- [x] v2.2: Strategic AI voting (bond protection, convergence, trust factor, social/challenge threat)

---

## Phase 3 — Merge ✅

Goal: Introduce the merge at a set number of players.

- [x] Merge trigger at 10 players remaining
- [x] All remaining players join one tribe (Maji)
- [x] Merge screen with player roster and original tribe origins
- [x] Individual immunity challenges post-merge
- [x] Camp Life works with full merged cast
- [x] Tribal Council: full cast votes, immunity holder protected
- [x] v2.5: Jury tracking — post-merge boots join the jury
- [x] v2.5: Jury sentiment snapshot (relationship + trust at elimination time)
- [x] v2.5: Jury panel on elimination screen with sentiment dots
- [x] v2.5: Jury summary on game-over screen
- [x] v2.5: Bug fix — findContestant now searches merged tribe (suspicion post-merge)

---

## Phase 4 — Endgame

Goal: Complete season with a winner.

- [ ] Jury tracking (post-merge eliminations become jurors)
- [ ] Final Tribal Council with jury votes
- [ ] Player can make a case to the jury
- [ ] Winner declared, season summary screen
- [ ] Stats: challenges won, votes received, relationships

---

## Phase 5 — Replayability

Goal: Make the game worth replaying.

- [ ] Multiple pre-built seasons with different casts
- [ ] Random season generator
- [ ] Idols and advantages
- [ ] Tribe swaps
- [ ] Save/load game state

---

## Backlog (No Timeline)

- Sound effects and music
- Animated vote reveal
- Mobile-friendly layout
- Accessibility improvements
- Custom contestant creator
