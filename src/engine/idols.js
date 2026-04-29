// idols.js — Hidden Immunity Idol data model and lifecycle management
//
// This module defines the idol system foundation: data structures, validity
// rules, and lifecycle hooks. Search and play mechanics are intentionally
// absent — see the extension-point stubs at the bottom of this file.
//
// ── Idol lifecycle ────────────────────────────────────────────────────────────
//
//   "hidden"  → idol is in the game but no contestant holds it  (initial state)
//   "held"    → a contestant found the idol and is carrying it
//   "played"  → the idol was used at a Tribal Council
//   "expired" → the idol is permanently removed from play:
//                 • an unfound pre-merge tribal idol expires when merge fires
//                   (the tribal camp is abandoned; the idol is lost)
//                 • any held idol expires when Final Tribal Council begins
//                   (idols cannot be used at FTC)
//
// ── Three idols per season (Phase 1 defaults) ─────────────────────────────────
//
//   tribeA  — hidden at Tribe A's camp pre-merge
//   tribeB  — hidden at Tribe B's camp pre-merge
//   merged  — hidden at the merged camp; only becomes searchable after merge
//
// To add more idols (e.g., a second merge idol, a re-hidden idol), add a new
// entry to IDOL_SLOTS below — no other code needs to change.
//
// ── Architecture rules ────────────────────────────────────────────────────────
//
//   Engine functions mutate state.idols.
//   UI functions must only read state.idols — never mutate directly.
//   Lifecycle hooks (expirePreMergeIdols, expireHeldIdols) are called by main.js.

// ── Idol slot definitions ─────────────────────────────────────────────────────
//
// One entry per idol in the game. Each entry defines the idol's id (used as a
// unique key) and its scope (where it is hidden and who can search for it).
//
// scope — "A" | "B" | "merged"
//   Pre-merge tribal idols: scope "A" or "B" matches their tribe label.
//   Merge idol: scope "merged" means it only appears after the merge fires.
//
// To add a new idol, add one entry here. createIdol() will do the rest.
const IDOL_SLOTS = {
  tribeA: { scope: "A"      },
  tribeB: { scope: "B"      },
  merged: { scope: "merged" },
};

// ── Factory ───────────────────────────────────────────────────────────────────

// Creates a fresh idol object with its initial "hidden" state.
//
// id    — unique string key (from IDOL_SLOTS)
// scope — "A" | "B" | "merged"
function createIdol(id, scope) {
  return {
    id,
    scope,

    // Current lifecycle state.
    status: "hidden",  // "hidden" | "held" | "played" | "expired"

    // Who holds this idol. null unless status === "held".
    // Stores the contestant's id string, not the contestant object itself —
    // so the idol stays valid even if the contestant object is later mutated.
    holder: null,

    // Round tracking — useful for history display and future rule variants
    // (e.g., an idol found before merge that expires N rounds after it is found).
    foundRound:  null,   // round when a contestant picked up this idol
    playedRound: null,   // round when this idol was played at Tribal Council
  };
}

// ── Initialization ────────────────────────────────────────────────────────────

// Populates state.idols with one idol object per IDOL_SLOTS entry.
// Called once at game start (after assignTribes), before the first screen.
// state.idols is initialized as [] in createSeasonState(); this fills it.
function initIdols(state) {
  state.idols = Object.entries(IDOL_SLOTS).map(([id, def]) =>
    createIdol(id, def.scope)
  );
}

// ── Lookups ───────────────────────────────────────────────────────────────────

// Returns the idol object with the given id, or undefined if not found.
function getIdol(state, id) {
  return state.idols.find(idol => idol.id === id);
}

// Returns all idols still "in play" — not expired and not yet played.
// An idol is in play if it is either hidden (searchable) or held (playable).
function getActiveIdols(state) {
  return state.idols.filter(idol =>
    idol.status !== "expired" && idol.status !== "played"
  );
}

// Returns all idols currently held by a specific contestant.
// A contestant can hold more than one idol in theory (e.g., traded or given one).
// contestantId — the contestant's id string
function getHeldIdols(state, contestantId) {
  return state.idols.filter(idol =>
    idol.status === "held" && idol.holder === contestantId
  );
}

// Returns true if at least one idol is hidden (not yet found) in the given scope.
// Use this to decide whether a search attempt has anything to find.
// scope — "A" | "B" | "merged"
function hasHiddenIdolInScope(state, scope) {
  return state.idols.some(idol =>
    idol.status === "hidden" && idol.scope === scope
  );
}

// ── Availability ──────────────────────────────────────────────────────────────

// Returns true if the idol is currently searchable — hidden in the game AND
// accessible given the current game phase.
//
// Rules:
//   • Pre-merge tribal idols (scope "A" or "B") are available before merge.
//     Once merge fires, any unfound tribal idol is expired by expirePreMergeIdols().
//   • The merge idol (scope "merged") is only available after merge fires.
//     There is nothing to find at the merge camp until the tribes consolidate.
//
// This is the gate for future search logic: idolSearch() should call
// isIdolAvailable() before attempting to award an idol.
function isIdolAvailable(idol, state) {
  if (idol.status !== "hidden") return false;
  if (idol.scope === "merged") return state.merged;   // only after merge
  return !state.merged;                               // tribal idols only pre-merge
}

// ── Validity (playability) ────────────────────────────────────────────────────

// Returns true if this idol can be played at a Tribal Council right now.
//
// An idol is playable when all of the following hold:
//   1. Its status is "held" — someone has the idol in hand.
//   2. The game is not yet in the Final Tribal Council phase.
//      state.finalists being non-null means FTC has started; idols expire then.
//   3. (Optional) The specific holder matches. Pass contestantId to confirm that
//      the contestant trying to play the idol is actually its holder —
//      prevents one player from claiming another's idol.
//
// contestantId is optional. Omit it for a general "is this idol playable at all"
// check; pass it for a "can THIS person play this idol" check.
function isIdolPlayable(idol, state, contestantId) {
  if (idol.status !== "held") return false;
  if (state.finalists !== null) return false;   // FTC has started — too late

  // If a specific contestant is being checked, confirm they hold it.
  if (contestantId !== undefined && idol.holder !== contestantId) return false;

  return true;
}

// ── Expiry ────────────────────────────────────────────────────────────────────

// Expires all unfound pre-merge tribal idols when merge fires.
// Called inside doMerge() in main.js, after state.merged is set to true.
//
// Any tribal idol that was found before the merge (status "held") is NOT expired —
// the holder carries it into the merged game and can still play it at tribal.
// Only idols still sitting hidden at abandoned tribal camps are lost.
function expirePreMergeIdols(state) {
  for (const idol of state.idols) {
    if ((idol.scope === "A" || idol.scope === "B") && idol.status === "hidden") {
      idol.status = "expired";
    }
  }
}

// Expires any idol still held when Final Tribal Council begins.
// Called inside startFinalTribal() in main.js.
//
// In practice, players should have used or lost their idols before this point.
// This is a safety net that cleanly ends all idol business before FTC votes.
function expireHeldIdols(state) {
  for (const idol of state.idols) {
    if (idol.status === "held") {
      idol.status = "expired";
    }
  }
}

// ── Extension points (not yet active) ────────────────────────────────────────
//
// These stubs define the intended API for the future search and play phases.
// They are commented out and not called anywhere — implement and uncomment
// them in the appropriate v3.x phase.

// Extension point: idol search
//
// Called when a contestant chooses a "search for idol" camp action.
// Returns the found idol object on success, or null if nothing was found.
//
// Implementation notes for future phase:
//   — Determine the contestant's current scope from their tribe:
//       scope = state.merged ? "merged" : contestant.tribe
//   — Call hasHiddenIdolInScope(state, scope) first; return null if nothing hidden
//   — Roll a probability check weighted by contestant stats or held clues
//   — On success: update the idol object directly:
//       idol.status     = "held";
//       idol.holder     = contestant.id;
//       idol.foundRound = state.round;
//   — Return the idol so the caller can show a discovery message
//
// function idolSearch(contestant, state) {
//   return null;
// }

// Extension point: idol play
//
// Called when a contestant plays an idol at Tribal Council, before votes are read.
// Should return true on success so the caller can proceed with the protected result.
//
// Implementation notes for future phase:
//   — Call isIdolPlayable(idol, state, contestant.id) first; return false if invalid
//   — The idol can be played on the holder themselves OR on another contestant:
//       const protectedId = targetContestantId ?? contestant.id;
//   — Update the idol object:
//       idol.status      = "played";
//       idol.playedRound = state.round;
//   — Instruct the vote tallier to strip all votes against protectedId:
//       This can be done by filtering allVotes in collectAiVotes / tallyVotes,
//       or by passing a Set of "immune" ids alongside the immunity necklace holder
//   — The UI (screenTribal.js) needs a reveal sequence for the played idol
//
// function idolPlay(idol, targetContestantId, state) {
//   return false;
// }
