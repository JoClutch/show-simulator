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

// Called when the cast editor is dismissed.
//   applied=true  → applyTemplate has already run; rebuild gameState so the
//                   select screen reflects the new cast (CONTESTANTS now holds
//                   different objects, and gameState.tribes is stale).
//   applied=false → cancelled; no state changes; just route back.
function onCastEditorDone(applied) {
  if (applied) {
    gameState = createSeasonState();
    assignTribes(CONTESTANTS, gameState);
    initIdols(gameState);
  }
  showScreen("select");
}

// Called when the rules editor is dismissed.
// Same shape as onCastEditorDone — rebuild state on apply, route back either way.
function onRulesEditorDone(applied) {
  if (applied) {
    gameState = createSeasonState();
    assignTribes(CONTESTANTS, gameState);
    initIdols(gameState);
  }
  showScreen("select");
}

// Called when the saved-setups screen is dismissed.
//   applied=true  → a saved template was loaded (applyTemplate has run);
//                   rebuild gameState so the select screen shows the new cast.
//   applied=false → user clicked Back or only saved/deleted (no template
//                   change); no state mutation needed, just route back.
function onSavedSetupsDone(applied) {
  if (applied) {
    gameState = createSeasonState();
    assignTribes(CONTESTANTS, gameState);
    initIdols(gameState);
  }
  showScreen("select");
}

// v4.2: returns true if the eliminated contestant should be added to the jury.
// Replaces the previous hardcoded `if (gameState.merged)` check so custom jury
// start configurations are honored. Called from onTribalDone after the
// eliminated has been removed from tribes — getAllActive() therefore returns
// the post-elimination remaining count.
function isJuryEligibleElim(state) {
  const trigger = SEASON_CONFIG.juryStartTrigger ?? "atMerge";

  if (trigger === "atMerge") return state.merged;

  if (trigger === "custom") {
    const startCount = SEASON_CONFIG.juryStartCount;
    if (typeof startCount !== "number") return state.merged;   // safety fallback
    return getAllActive().length <= startCount;
  }

  return state.merged;
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

// Called when the player dismisses the swap screen.
function onSwapDone() {
  showScreen("campLife");
}

function onTribalDone(eliminatedContestant) {
  gameState.eliminated.push(eliminatedContestant);
  removeFromTribes(eliminatedContestant);

  // Event log: every elimination is recorded. The player sees only their own
  // game-over (this stays out of dev panel as well-noised; AI-only eliminations
  // are still recorded so dev panel can show full history).
  const isPlayer = eliminatedContestant.id === gameState.player?.id;
  logEvent(gameState, {
    category: "tribal",
    type:     isPlayer ? "player-eliminated" : "contestant-eliminated",
    text: isPlayer
      ? "You were voted out."
      : `${eliminatedContestant.name} was voted out.`,
    playerVisible: isPlayer,
    meta: { eliminatedId: eliminatedContestant.id, mergedAtTime: gameState.merged },
  });

  // Prune the eliminated contestant from every alliance they were in.
  // Alliances dropping below 2 members are dissolved automatically.
  removeMemberFromAlliances(gameState, eliminatedContestant.id);

  // Post-merge (or custom-trigger) eliminations are sent to the jury.
  // removeFromTribes() has already run, so getAllActive() returns only survivors —
  // that is the correct population for the sentiment snapshot.
  // v4.2: jury start condition is configurable; see isJuryEligibleElim.
  if (isJuryEligibleElim(gameState)) {
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
  // suspicion/threat/staleness penalties apply, outliers fracture out, dissolved
  // alliances are cleaned up. Runs BEFORE round counter increment so it
  // captures the round just played.
  updateAlliances(gameState);

  // Clear ephemeral voting blocs from the just-concluded tribal. Blocs only
  // persist for the round they formed in (visible in dev panel until reset).
  gameState.votingBlocs = [];

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
  // Takes precedence over swap: if both conditions match (misconfiguration
  // where swapTrigger ≤ mergeTrigger), merge wins.
  if (checkForMerge()) {
    doMerge();
    showScreen("merge");
    return;
  }

  // Swap — fires once when remaining cast first hits the swap trigger.
  // Only meaningful pre-merge; checkForSwap guards against re-firing.
  if (checkForSwap()) {
    doSwap();
    showScreen("swap");
    return;
  }

  showScreen("campLife");
}

// ── Merge ─────────────────────────────────────────────────────────────────────

// Collapses the two tribe arrays into a single merged tribe.
// originalTribe is intentionally NOT set here — it was set once in
// assignTribes and must persist through any tribe swap. Setting it from
// c.tribe at merge time would overwrite it with the post-swap label.
// Sets state.merged = true, which gates all post-merge logic throughout the app.
function doMerge() {
  const all = [...gameState.tribes.A, ...gameState.tribes.B];
  for (const c of all) {
    c.tribe = "merged";   // originalTribe preserved from assignTribes
  }
  gameState.tribes.merged = all;
  gameState.tribes.A      = [];
  gameState.tribes.B      = [];
  gameState.merged        = true;

  // Any tribal idol still hidden in an abandoned camp is now permanently lost.
  // Idols that were already found (status "held") carry over to the merge.
  expirePreMergeIdols(gameState);

  logEvent(gameState, {
    category: "merge",
    type:     "occurred",
    text:     `The tribes have merged into ${SEASON_CONFIG.mergeTribeName}.`,
    playerVisible: true,
    meta: { count: all.length },
  });
}

// ── Tribe swap ────────────────────────────────────────────────────────────────

// Returns true the one time remaining cast hits the swap trigger pre-merge.
// Guarded by gameState.swapped (one-shot) and gameState.merged (irrelevant
// post-merge) and SEASON_CONFIG.swapTriggerCount being set (null disables).
function checkForSwap() {
  if (gameState.swapped) return false;
  if (gameState.merged)  return false;
  const trigger = SEASON_CONFIG.swapTriggerCount;
  if (!trigger) return false;
  return getAllActive().length <= trigger;
}

// Redistributes the active cast into two new tribes of (near-)equal size.
//
// Preserved across swap (no mutation): relationships, trust, suspicion,
// idolSuspicion, alliances, idols, idolSearches, jury, eliminated.
// Mutated: each contestant's `tribe` field, state.tribes.A/B arrays.
//
// originalTribe is NEVER touched — it carries the contestant's identity from
// game start through swap and merge.
function doSwap() {
  const all = [...gameState.tribes.A, ...gameState.tribes.B];

  // Fisher-Yates via shuffleArray (defined in vote.js — uniform permutation).
  const shuffled = shuffleArray(all);

  const half = Math.floor(shuffled.length / 2);
  const newA = shuffled.slice(0, half);
  const newB = shuffled.slice(half);

  for (const c of newA) c.tribe = "A";
  for (const c of newB) c.tribe = "B";

  gameState.tribes.A   = newA;
  gameState.tribes.B   = newB;
  gameState.swapped    = true;
  gameState.swapRound  = gameState.round;

  // Player-visible: identify which new tribe they ended up on so the log
  // entry reads as a personal milestone, not just a generic event.
  const player        = gameState.player;
  const playerNewTribe = newA.find(c => c.id === player?.id) ? "A" : "B";
  const newTribeName   = SEASON_CONFIG.tribeNames[playerNewTribe];
  logEvent(gameState, {
    category: "swap",
    type:     "occurred",
    text:     `Tribe Swap. You're now on ${newTribeName} with ${
      (playerNewTribe === "A" ? newA : newB).length - 1
    } other players.`,
    playerVisible: true,
    meta: { round: gameState.swapRound, playerNewTribe },
  });

  // Note: alliances spanning the new tribes are NOT actively dissolved.
  // They quietly become harder to maintain because cross-tribe members can no
  // longer interact at camp — the existing v3.5 staleness penalty handles the
  // organic decay. If those members reunite at merge, the alliance can recover.
}

// ── Screen routing ────────────────────────────────────────────────────────────

function showScreen(name) {
  gameState.phase = name;
  const app = document.getElementById("app");
  app.innerHTML   = "";

  switch (name) {
    case "select":       renderSelectScreen(app, gameState);       break;
    case "castEditor":   renderCastEditorScreen(app, gameState);   break;
    case "rulesEditor":  renderRulesEditorScreen(app, gameState);  break;
    case "savedSetups":  renderSavedSetupsScreen(app, gameState);  break;
    case "swap":         renderSwapScreen(app, gameState);         break;
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
  // v4 groundwork: apply the default season template before the runtime is
  // built. SEASON_CONFIG and CONTESTANTS are populated/reaffirmed from the
  // template — for the bundled default this is functionally a no-op (values
  // already match the inline defaults in season.js / contestants.js), but it
  // establishes the template as the source of truth and lets future code
  // swap in a different template by calling applyTemplate(...) before boot.
  applyTemplate(DEFAULT_SEASON_TEMPLATE);

  gameState = createSeasonState();
  assignTribes(CONTESTANTS, gameState);
  initIdols(gameState);      // places one idol per tribal camp + one for merge
  showScreen("select");
});
