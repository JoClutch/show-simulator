// season.js — static season config, state factory, and day utilities
//
// SEASON_CONFIG  : never changes during a playthrough (names, colors, rules)
// DAY_OFFSETS    : named positions within a 3-day episode (use instead of magic numbers)
// createSeasonState() : call once at game start to get a fresh mutable state object
// assignTribes()      : randomly splits contestants into two tribes and stamps
//                       the tribe field on each contestant object
// getDay(state)  : derives the first in-game day of the current episode

const SEASON_CONFIG = {
  name: "Season 1: Broken Compass",
  tribeNames:  { A: "Kaleo",   B: "Vanta"   },
  tribeColors: { A: "#e87c2b", B: "#3a8fd4" },
  tribesCount: 2,
  tribeSize:   8,
  campActionsPerRound: 3,

  // ── Merge ──────────────────────────────────────────────────────────────────
  // Merge fires when remaining players fall to or below this count.
  // After merge: individual immunity replaces tribal, everyone votes each round.
  mergeTriggerCount: 10,
  mergeTribeName:    "Maji",
  mergeTribeColor:   "#9b59b6",

  // ── Endgame ────────────────────────────────────────────────────────────────
  // When remaining players fall to or below finalCount, the season ends with
  // Final Tribal Council instead of another regular vote.
  finalCount: 3,
};

// Returns a brand-new season state object. All fields start at their
// pre-game defaults. The game loop in main.js mutates this object as play progresses.
function createSeasonState() {
  return {
    // ── Progress ───────────────────────────────────────────
    round:  1,       // increments after each Tribal Council
    phase: "select", // "select" | "campLife" | "challenge" | "tribal" | "elimination" | "merge"

    // ── People ─────────────────────────────────────────────
    player: null,    // the contestant object the human chose; set in onContestantSelected()
    tribes: {
      A:      [],    // active contestants on Tribe A (empty after merge)
      B:      [],    // active contestants on Tribe B (empty after merge)
      merged: [],    // active contestants after merge (empty before merge)
    },
    eliminated: [],  // contestant objects in elimination order (all boots, pre- and post-merge)
    jury:       [],  // subset of eliminated: only post-merge boots, in jury-seat order

    // ── Round state ────────────────────────────────────────
    campPhase:      1,     // 1 = pre-challenge camp, 2 = post-challenge camp; reset each round
    immunityWon:    null,  // "A" | "B" — pre-merge: tribe that won immunity; reset each round
    tribalTribe:    null,  // "A" | "B" | "merged" — who attends Tribal Council this round
    immunityHolder: null,  // post-merge: contestant id who holds the necklace; reset each round

    // ── Merge ──────────────────────────────────────────────
    merged: false,   // true after merge fires; gates all post-merge logic

    // ── Endgame ────────────────────────────────────────────
    finalists:  null,  // array of the 3 remaining contestants at FTC; set in startFinalTribal()
    ftcDay:     null,  // in-game day of Final Tribal Council; set in startFinalTribal()
    finalVotes: null,  // array of { voter, target } jury votes; set in onFinalTribalDone()
    winner:     null,  // the winning contestant object; set in onFinalTribalDone()

    // ── Idols ──────────────────────────────────────────────
    // Populated by initIdols() in engine/idols.js after tribes are assigned.
    // Each object: { id, scope, status, holder, foundRound, playedRound }
    //   status: "hidden" | "held" | "played" | "expired"
    // See engine/idols.js for full documentation and lifecycle rules.
    idols: [],

    // How many times the player has searched for an idol per scope.
    // Structure: { [scope]: number }  e.g. { "A": 2, "merged": 1 }
    // Drives the persistence bonus in idolSearch() and feedback tier in
    // actionSearchIdol(). Persists across rounds — searching twice in the
    // pre-merge counts even if Tribal Council separates the attempts.
    idolSearches: {},

    // ── Relationships ──────────────────────────────────────
    // Populated by initRelationships() in engine/relationships.js after tribes are assigned.
    // Structure: { [contestantId]: { [otherContestantId]: number } }
    // Scores range from roughly -50 to +50 and are hidden from the player.
    relationships: {},

    // ── Trust ──────────────────────────────────────────────
    // Populated by initRelationships() alongside relationships.
    // Structure: { [contestantId]: { [otherContestantId]: number } }
    // Range 0–10. Starts at 3 (slight baseline goodwill, not yet earned).
    // Affects: intel quality from askVote, effectiveness of confide/strategy.
    trust: {},
  };
}

// How many days into a 3-day episode each phase takes place.
// Add to getDay(state) instead of hard-coding +1 / +2 in UI files.
// If the episode structure ever changes, update these values here only.
const DAY_OFFSETS = {
  campPhase1: 0,  // Day 1 — morning before the challenge
  challenge:  1,  // Day 2 — immunity challenge
  campPhase2: 2,  // Day 3 — evening after the challenge
  tribal:     2,  // Day 3 — Tribal Council night (same evening as camp phase 2)
};

// Derives the first in-game day of the current episode.
// Episode 1 starts on Day 1; each episode adds 3 days.
// Add a DAY_OFFSETS value to get the exact day for a specific phase.
function getDay(state) {
  return (state.round - 1) * 3 + 1;
}

// Randomly splits contestants into two equal tribes.
// Stamps contestant.tribe = "A" or "B" on each object.
// Populates state.tribes.A and state.tribes.B.
//
// NOTE: this mutates the shared CONTESTANTS objects directly.
// Restarting without a page refresh would re-stamp tribes on the same objects,
// which is fine because assignTribes overwrites the field. A future "play again"
// button must call assignTribes again (or reset CONTESTANTS separately).
function assignTribes(contestants, state) {
  const shuffled = [...contestants].sort(() => Math.random() - 0.5);

  const groupA = shuffled.slice(0, SEASON_CONFIG.tribeSize);
  const groupB = shuffled.slice(SEASON_CONFIG.tribeSize);

  groupA.forEach(c => { c.tribe = "A"; });
  groupB.forEach(c => { c.tribe = "B"; });

  state.tribes.A = groupA;
  state.tribes.B = groupB;
}
