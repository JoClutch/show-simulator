// season.js — static season config and the season state factory
//
// SEASON_CONFIG  : never changes during a playthrough (names, colors, rules)
// createSeasonState() : call once at game start to get a fresh mutable state object
// assignTribes()      : randomly splits contestants into two tribes and stamps
//                       the tribe field on each contestant object

const SEASON_CONFIG = {
  name: "Season 1: Broken Compass",
  tribeNames:  { A: "Kaleo",   B: "Vanta"   },
  tribeColors: { A: "#e87c2b", B: "#3a8fd4" },
  tribesCount: 2,
  tribeSize:   8,
  campActionsPerRound: 3,

  // ── Phase 1 prototype stop conditions ──────────────────────────────────────
  // The game halts when EITHER condition is met (whichever comes first).
  // Set a value to null to disable that condition.
  // Remove both (or set both to null) when Phase 2 is ready to replace them.
  phase1MaxRounds:    6,   // stop after this many episodes
  phase1MinTribeSize: 5,   // stop when any tribe shrinks to this many members

  // ── Phase 3+ merge hook ─────────────────────────────────────────────────────
  // Set to a remaining-player count to trigger the merge screen.
  // null means merge is disabled (Phase 1 behaviour).
  mergeTriggerCount: null,
};

// Returns a brand-new season state object. All fields start at their
// pre-game defaults. The game loop in main.js mutates this object as play progresses.
function createSeasonState() {
  return {
    // ── Progress ───────────────────────────────────────────
    round:  1,       // increments after each Tribal Council
    phase: "select", // "select" | "campLife" | "challenge" | "tribal" | "elimination"

    // ── People ─────────────────────────────────────────────
    player: null,    // the contestant object the human chose; set in onContestantSelected()
    tribes: {
      A: [],         // array of active contestant objects on Tribe A
      B: [],         // array of active contestant objects on Tribe B
    },
    eliminated: [],  // contestant objects in the order they were voted out

    // ── Round state ────────────────────────────────────────
    campPhase:   1,     // 1 = pre-challenge camp, 2 = post-challenge camp; reset each round
    immunityWon: null,  // "A" | "B" — set by the challenge; reset each round
    tribalTribe: null,  // "A" | "B" — which tribe attends Tribal Council this round

    // ── Relationships ──────────────────────────────────────
    // Populated by initRelationships() in engine/relationships.js after tribes are assigned.
    // Structure: { [contestantId]: { [otherContestantId]: number } }
    // Scores range from roughly -50 to +50 and are hidden from the player.
    relationships: {},
  };
}

// Randomly splits contestants into two equal tribes.
// Stamps contestant.tribe = "A" or "B" on each object.
// Populates state.tribes.A and state.tribes.B.
function assignTribes(contestants, state) {
  const shuffled = [...contestants].sort(() => Math.random() - 0.5);

  const groupA = shuffled.slice(0, SEASON_CONFIG.tribeSize);
  const groupB = shuffled.slice(SEASON_CONFIG.tribeSize);

  groupA.forEach(c => { c.tribe = "A"; });
  groupB.forEach(c => { c.tribe = "B"; });

  state.tribes.A = groupA;
  state.tribes.B = groupB;
}
