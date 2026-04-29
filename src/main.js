// main.js — game loop and screen router
//
// gameState is the single source of truth for the entire playthrough.
// Engine functions mutate it. UI functions only read it.
//
// Pre-merge round flow:
//   Camp Life (campPhase 1)
//       ↓  onCampLifeDone
//   Tribal Immunity Challenge
//       ↓  onChallengeResolved(losingTribeLabel)
//   Camp Life (campPhase 2)
//       ↓  onCampLifeDone
//   player's tribe lost? → Tribal Council → Elimination → advanceRound
//   player's tribe won?  → advanceRound (skip Tribal)
//
// Merge fires when remaining cast ≤ SEASON_CONFIG.mergeTriggerCount:
//   advanceRound → doMerge() → showScreen("merge")
//       ↓  onMergeDone
//   [continues as post-merge rounds below]
//
// Post-merge round flow:
//   Camp Life (campPhase 1)
//       ↓  onCampLifeDone
//   Individual Immunity Challenge
//       ↓  onIndividualChallengeResolved(winnerId)
//   Camp Life (campPhase 2)
//       ↓  onCampLifeDone — everyone always goes to Tribal after merge
//   Tribal Council (full cast votes, immune holder can't be targeted)
//       ↓  onTribalDone → Elimination → advanceRound
//
// advanceRound checks:
//   ≤ finalCount players left → startFinalTribal()
//   merge threshold hit        → doMerge() then showScreen("merge")
//   otherwise                  → next episode, Camp Life phase 1
//
// Final Tribal Council flow:
//   startFinalTribal() → showScreen("finalTribal")
//       ↓  onFinalTribalDone(winner, finalVotes)
//   showScreen("results")

// var (not let) so window.gameState is accessible to devPanel.js.
// The object is always mutated in place — never reassigned — so a single
// window reference stays valid for the entire session.
var gameState;

// ── Lifecycle callbacks ───────────────────────────────────────────────────────

function onContestantSelected(contestant) {
  gameState.player = contestant;
  initRelationships(gameState);
  showScreen("campLife");
}

function onCampLifeDone() {
  if (gameState.campPhase === 1) {
    showScreen("challenge");
    return;
  }

  // Phase 2 → tribal council ahead. Two engine passes happen overnight:
  //   • aiFormAlliances    — NPC pairs with strong rel/trust may form pacts
  //   • spreadIdolSuspicion — close allies share idol reads (gossip)
  //
  // Pre-merge: alliances form in BOTH tribes (they're both at camp), but
  // gossip only matters for the tribe actually voting tonight.
  // Post-merge: everything happens in the merged tribe.
  if (gameState.merged) {
    aiFormAlliances(gameState, gameState.tribes.merged);
    spreadIdolSuspicion(gameState, gameState.tribes.merged);
    showScreen("tribal");
  } else if (getPlayerTribeLabel() === gameState.tribalTribe) {
    aiFormAlliances(gameState, gameState.tribes.A);
    aiFormAlliances(gameState, gameState.tribes.B);
    spreadIdolSuspicion(gameState, gameState.tribes[gameState.tribalTribe]);
    showScreen("tribal");
  } else {
    aiFormAlliances(gameState, gameState.tribes.A);
    aiFormAlliances(gameState, gameState.tribes.B);
    spreadIdolSuspicion(gameState, gameState.tribes[gameState.tribalTribe]);
    advanceRound();
  }
}

// Pre-merge: losingTribeLabel is "A" or "B".
function onChallengeResolved(losingTribeLabel) {
  gameState.immunityWon = losingTribeLabel === "A" ? "B" : "A";
  gameState.tribalTribe = losingTribeLabel;
  gameState.campPhase   = 2;
  showScreen("campLife");
}

// Post-merge: winnerId is the contestant id of the necklace holder.
function onIndividualChallengeResolved(winnerId) {
  gameState.immunityHolder = winnerId;
  gameState.tribalTribe    = "merged";
  gameState.campPhase      = 2;
  showScreen("campLife");
}

// Called when the player dismisses the merge screen.
function onMergeDone() {
  showScreen("campLife");
}

function onTribalDone(eliminatedContestant) {
  gameState.eliminated.push(eliminatedContestant);
  removeFromTribes(eliminatedContestant);

  // Prune the eliminated contestant from every alliance they were in.
  // Alliances dropping below 2 members are dissolved automatically.
  removeMemberFromAlliances(gameState, eliminatedContestant.id);

  // Post-merge eliminations are sent to the jury.
  // removeFromTribes() has already run, so getAllActive() returns only survivors —
  // that is the correct population for the sentiment snapshot.
  if (gameState.merged) {
    eliminatedContestant.juryNumber = gameState.jury.length + 1;
    eliminatedContestant.sentiment  = buildJurySentiment(
      gameState,
      eliminatedContestant,
      getAllActive()
    );
    gameState.jury.push(eliminatedContestant);
  }

  showScreen("elimination");
}

function onEliminationDone() {
  advanceRound();
}

// ── Round management ──────────────────────────────────────────────────────────

function advanceRound() {
  // Round-end alliance drift: strength shifts toward member rel/trust averages,
  // suspicion penalties apply, dissolved alliances are cleaned up. Runs BEFORE
  // round counter increment so it captures the round just played.
  updateAlliances(gameState);

  gameState.round          += 1;
  gameState.campPhase       = 1;
  gameState.immunityWon     = null;
  gameState.tribalTribe     = null;
  gameState.immunityHolder  = null;

  const remaining = getAllActive().length;

  // End of game — final count reached: begin Final Tribal Council.
  if (remaining <= SEASON_CONFIG.finalCount) {
    startFinalTribal();
    return;
  }

  // Merge — fires once when remaining cast hits the trigger count.
  // checkForMerge() guards against re-firing after merge is already active.
  if (checkForMerge()) {
    doMerge();
    showScreen("merge");
    return;
  }

  showScreen("campLife");
}

// ── Merge ─────────────────────────────────────────────────────────────────────

// Collapses the two tribe arrays into a single merged tribe.
// Stamps originalTribe on each contestant so the elimination screen can still
// reference their pre-merge affiliation for flavour.
// Sets state.merged = true, which gates all post-merge logic throughout the app.
function doMerge() {
  const all = [...gameState.tribes.A, ...gameState.tribes.B];
  for (const c of all) {
    c.originalTribe = c.tribe;   // preserve "A" | "B" for display
    c.tribe         = "merged";
  }
  gameState.tribes.merged = all;
  gameState.tribes.A      = [];
  gameState.tribes.B      = [];
  gameState.merged        = true;

  // Any tribal idol still hidden in an abandoned camp is now permanently lost.
  // Idols that were already found (status "held") carry over to the merge.
  expirePreMergeIdols(gameState);
}

// ── Screen routing ────────────────────────────────────────────────────────────

function showScreen(name) {
  gameState.phase = name;
  const app = document.getElementById("app");
  app.innerHTML   = "";

  switch (name) {
    case "select":       renderSelectScreen(app, gameState);       break;
    case "merge":        renderMergeScreen(app, gameState);        break;
    case "campLife":     renderCampLifeScreen(app, gameState);     break;
    case "challenge":    renderChallengeScreen(app, gameState);    break;
    case "tribal":       renderTribalScreen(app, gameState);       break;
    case "elimination":  renderEliminationScreen(app, gameState);  break;
    case "finalTribal":  renderFinalTribalScreen(app, gameState);  break;
    case "results":      renderResultsScreen(app, gameState);      break;
  }
}

// ── Final Tribal Council ──────────────────────────────────────────────────────

// Called when remaining players hit SEASON_CONFIG.finalCount.
// Snapshots the finalists and the last real in-game day, then hands off to the
// FTC screen.
//
// Note: advanceRound() increments gameState.round before calling this, so
// getDay(gameState) returns the first day of the never-played next episode.
// Subtract 1 to get the actual last in-game day (Tribal Council night).
function startFinalTribal() {
  gameState.finalists = getAllActive();
  gameState.ftcDay    = getDay(gameState) - 1;

  // Idols cannot be played at Final Tribal Council.
  // Expire any still-held idols before FTC begins.
  expireHeldIdols(gameState);

  showScreen("finalTribal");
}

// Called by the FTC screen once the winner is declared.
// Saves the results to state and transitions to the season recap.
function onFinalTribalDone(winner, finalVotes) {
  gameState.winner     = winner;
  gameState.finalVotes = finalVotes;
  showScreen("results");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the label of the tribe the player is currently in.
// Returns "merged" when the game has merged, "A" or "B" otherwise.
function getPlayerTribeLabel() {
  if (gameState.merged) return "merged";
  for (const label of ["A", "B"]) {
    if (gameState.tribes[label].find(c => c.id === gameState.player.id)) {
      return label;
    }
  }
  return null;
}

// Returns all contestants who have not yet been eliminated.
function getAllActive() {
  if (gameState.merged) return [...gameState.tribes.merged];
  return [...gameState.tribes.A, ...gameState.tribes.B];
}

// Removes a contestant from whichever tribe array they belong to.
function removeFromTribes(contestant) {
  if (gameState.merged) {
    gameState.tribes.merged = gameState.tribes.merged.filter(
      c => c.id !== contestant.id
    );
    return;
  }
  for (const label of ["A", "B"]) {
    gameState.tribes[label] = gameState.tribes[label].filter(
      c => c.id !== contestant.id
    );
  }
}

// Returns true the one time remaining players hit or fall below the merge
// trigger. The state.merged guard prevents it from firing again after merge.
function checkForMerge() {
  if (gameState.merged) return false;
  const trigger = SEASON_CONFIG.mergeTriggerCount;
  if (!trigger) return false;
  return getAllActive().length <= trigger;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  gameState = createSeasonState();
  assignTribes(CONTESTANTS, gameState);
  initIdols(gameState);      // places one idol per tribal camp + one for merge
  showScreen("select");
});
