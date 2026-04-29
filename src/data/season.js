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

  // ── Tribe swap ─────────────────────────────────────────────────────────────
  // Fires once when remaining players fall to or below this count, before merge.
  // Set to null to disable swaps entirely.
  // The swap redistributes survivors into two new tribes (still labeled A/B,
  // same names and colors). All relationships, trust, suspicion, alliances,
  // and idols persist through the swap untouched. Set this LARGER than
  // mergeTriggerCount so the swap precedes the merge.
  swapTriggerCount: 12,

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

    // ── Tribe swap ─────────────────────────────────────────
    swapped:    false,   // true after swap fires (one-shot pre-merge event)
    swapRound:  null,    // round in which the swap occurred (for narrative/dev)

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

    // ── Idol suspicion ─────────────────────────────────────
    // Each contestant's private belief about whether each OTHER contestant
    // holds a hidden immunity idol. Asymmetric (A's belief about B is
    // independent of B's belief about A).
    // Structure: { [observerId]: { [holderId]: number } }
    // Range 0–10. Default 0 (unaware) — populated lazily by
    // adjustIdolSuspicion() in engine/relationships.js as events occur.
    idolSuspicion: {},

    // ── Alliances ──────────────────────────────────────────
    // Persistent multi-member commitments to vote together. Populated
    // dynamically as alliances form (player action or AI auto-formation).
    // Each alliance: { id, name, memberIds, strength, status, formedRound,
    //                  founderId, lastReinforcedRound }
    //   status: "active" | "weakened" | "dissolved"
    //   strength: 0–10 (drifts toward natural fit each round)
    //   lastReinforcedRound: most recent round any member-pair did a positive
    //     interaction inside the alliance (drives staleness penalty)
    // See engine/alliances.js for the full lifecycle and API.
    alliances: [],

    // ── Voting blocs ───────────────────────────────────────
    // Ephemeral, single-tribal coordinations. Detected after votes are cast:
    // any group of 2+ voters who picked the same target counts as a bloc.
    // Cleared at the start of each new round (advanceRound).
    // Each bloc: { id, memberIds, targetId, formedRound, crossesAlliances }
    // See detectVotingBlocs() in engine/alliances.js.
    votingBlocs: [],

    // ── Event log ──────────────────────────────────────────
    // Unified chronological record of season milestones (idols, alliances,
    // swap, merge, eliminations). Each entry: { round, day, category, type,
    // text, playerVisible, meta }. Engine pushes via logEvent(); UI reads.
    // See engine/eventLog.js.
    eventLog: [],
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
  // v4.1: respect explicit tribe pre-assignment from a custom template if
  // ALL contestants have one. This lets the cast editor save fixed tribe
  // setups. When tribes aren't pre-assigned (the default season's case),
  // randomize as before.
  const allPreAssigned = contestants.length > 0 &&
                         contestants.every(c => c.tribe === "A" || c.tribe === "B");

  let groupA, groupB;
  if (allPreAssigned) {
    groupA = contestants.filter(c => c.tribe === "A");
    groupB = contestants.filter(c => c.tribe === "B");
  } else {
    const shuffled = [...contestants].sort(() => Math.random() - 0.5);
    groupA = shuffled.slice(0, SEASON_CONFIG.tribeSize);
    groupB = shuffled.slice(SEASON_CONFIG.tribeSize);
  }

  // Set BOTH tribe (current) and originalTribe (immutable identity).
  // originalTribe is set once here and never overwritten — not by swap, not by
  // merge. It's the answer to "where did this player start?", which the UI
  // needs even after tribe swaps and the merge. See doSwap and doMerge in main.js.
  groupA.forEach(c => { c.tribe = "A"; c.originalTribe = "A"; });
  groupB.forEach(c => { c.tribe = "B"; c.originalTribe = "B"; });

  state.tribes.A = groupA;
  state.tribes.B = groupB;
}
