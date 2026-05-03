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

  // v9.0: every regular round begins with the Episode Recap. Episode 1
  // is no exception — the recap screen handles the "no one has been
  // voted out yet" case via lastVotedOutPlayerId === null.
  // AI camp activity is now fired on leaving the recap, NOT here, so
  // the social fabric is still moving when the player reaches camp.
  showScreen("episodeRecap");
}

// v9.0: called when the player dismisses the Episode Recap screen.
// AI takes their phase-1 camp actions here (moved from advanceRound /
// onContestantSelected / onMergeDone / onSwapDone in the non-recap
// paths) so AI timing relative to the player's first camp view is
// preserved.
function onEpisodeRecapDone() {
  runAICampPhase(gameState);
  showScreen("campLife");
}

// v5.6: dispatches AI camp activity for whichever pool(s) are relevant.
// Pre-merge: both tribes' AIs act in parallel (each tribe is its own camp).
// Post-merge: the merged tribe is the single camp.
function runAICampPhase(state) {
  if (state.merged) {
    runAICampActions(state, state.tribes.merged);
  } else {
    runAICampActions(state, state.tribes.A);
    runAICampActions(state, state.tribes.B);
  }
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

// Called when the template picker screen is dismissed.
//   applied=true  → a built-in template was applied; rebuild gameState.
//   applied=false → user clicked Back without picking; no rebuild needed.
function onTemplatesDone(applied) {
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
  // v5.17: rumor spread + effects also runs overnight, before tribal.
  // Allies and close contacts trade what they've heard. New knowers get
  // small behavioral nudges via applyRumorRoundEffects.
  if (gameState.merged) {
    aiFormAlliances(gameState, gameState.tribes.merged);
    spreadIdolSuspicion(gameState, gameState.tribes.merged);
    spreadRumors(gameState, gameState.tribes.merged);
    applyRumorRoundEffects(gameState);
    showScreen("tribal");
  } else if (getPlayerTribeLabel() === gameState.tribalTribe) {
    aiFormAlliances(gameState, gameState.tribes.A);
    aiFormAlliances(gameState, gameState.tribes.B);
    spreadIdolSuspicion(gameState, gameState.tribes[gameState.tribalTribe]);
    spreadRumors(gameState, gameState.tribes.A);
    spreadRumors(gameState, gameState.tribes.B);
    applyRumorRoundEffects(gameState);
    showScreen("tribal");
  } else {
    aiFormAlliances(gameState, gameState.tribes.A);
    aiFormAlliances(gameState, gameState.tribes.B);
    spreadIdolSuspicion(gameState, gameState.tribes[gameState.tribalTribe]);
    spreadRumors(gameState, gameState.tribes.A);
    spreadRumors(gameState, gameState.tribes.B);
    applyRumorRoundEffects(gameState);
    // v9.10: simulate the losing tribe's Tribal Council off-screen so
    // state.eliminated stays in sync with the in-game day count even
    // when the player's tribe wins immunity. Without this the recap
    // stays on "all castaways remain" past Episode 1 in any season
    // where the player wins their first challenge.
    simulateOffscreenTribal(gameState, gameState.tribalTribe);
    advanceRound();
  }
}

// Pre-merge: losingTribeLabel is "A" or "B".
function onChallengeResolved(losingTribeLabel) {
  gameState.immunityWon = losingTribeLabel === "A" ? "B" : "A";
  gameState.tribalTribe = losingTribeLabel;
  gameState.campPhase   = 2;

  // v5.6: AI takes their phase-2 actions before the player's camp screen.
  runAICampPhase(gameState);

  showScreen("campLife");
}

// Post-merge: winnerId is the contestant id of the necklace holder.
function onIndividualChallengeResolved(winnerId) {
  gameState.immunityHolder = winnerId;
  gameState.tribalTribe    = "merged";
  gameState.campPhase      = 2;

  // v5.6: AI takes their phase-2 actions before the player's camp screen.
  runAICampPhase(gameState);

  showScreen("campLife");
}

// Called when the player dismisses the merge screen.
function onMergeDone() {
  // v5.6: AI takes their first post-merge camp actions before the camp screen.
  runAICampPhase(gameState);
  showScreen("campLife");
}

// Called when the player dismisses the swap screen.
function onSwapDone() {
  // v5.6: AI takes their first post-swap camp actions before the camp screen.
  runAICampPhase(gameState);
  showScreen("campLife");
}

function onTribalDone(eliminatedContestant) {
  // v6.6: apply post-vote fallout BEFORE the eliminated is removed from
  // tribes/alliances. The fallout helper reads alliance membership and
  // rel/trust state as it stood AT TRIBAL — pruning the eliminated first
  // would erase the betrayal targets.
  if (typeof applyTribalFallout === "function") {
    applyTribalFallout(gameState, eliminatedContestant, gameState._lastTribalMeta || null);
  }
  // Clean up the cached metadata after fallout has consumed it.
  delete gameState._lastTribalMeta;
  delete gameState._lastTribalOriginalVotes;
  delete gameState._lastTribalRevoteVotes;
  delete gameState._lastTribalProtectedIds;

  recordElimination(gameState, eliminatedContestant);

  showScreen("elimination");
}

// v9.10: shared elimination side-effects, called by both the live tribal
// path (onTribalDone) and the off-screen tribal simulation
// (simulateOffscreenTribal). Mutates state to reflect that this contestant
// has been voted out:
//   • pushed onto state.eliminated
//   • removed from their tribe
//   • state.lastVotedOutPlayerId set (drives Episode Recap)
//   • event log entry written
//   • removed from any alliances they were in
//   • added to the jury if jury-eligible at this point
//
// Does NOT trigger fallout (live path handles that beforehand because it
// has access to ballot metadata) and does NOT route to a screen.
function recordElimination(state, eliminatedContestant) {
  state.eliminated.push(eliminatedContestant);
  removeFromTribes(eliminatedContestant);

  state.lastVotedOutPlayerId = eliminatedContestant.id;

  const isPlayer = eliminatedContestant.id === state.player?.id;
  logEvent(state, {
    category: "tribal",
    type:     isPlayer ? "player-eliminated" : "contestant-eliminated",
    text: isPlayer
      ? "You were voted out."
      : `${eliminatedContestant.name} was voted out.`,
    playerVisible: isPlayer,
    meta: { eliminatedId: eliminatedContestant.id, mergedAtTime: state.merged },
  });

  removeMemberFromAlliances(state, eliminatedContestant.id);

  if (isJuryEligibleElim(state)) {
    eliminatedContestant.juryNumber = state.jury.length + 1;
    eliminatedContestant.sentiment  = buildJurySentiment(
      state,
      eliminatedContestant,
      getAllActive()
    );
    state.jury.push(eliminatedContestant);
  }
}

// v9.10: simulates the losing tribe's Tribal Council off-screen when the
// player's tribe wins immunity. Without this, only player-attended tribals
// produce eliminations — the other tribe's losing rounds vanished from the
// simulation, leaving the cast lopsided and Episode Recap stuck on
// "all castaways remain" past the first couple of rounds.
//
// AI-only voting: each member of the losing tribe picks a target via
// pickVoteTarget, ties broken randomly, no idol play (idols stay in
// pockets when their holder isn't on screen — the played idol mechanic is
// dramatic and player-facing only), no rocks (rare edge case; if a true
// tie persists we randomly resolve it the same way drawRocks would).
//
// Calls recordElimination on the result so all downstream state
// (eliminated[], lastVotedOutPlayerId, event log, alliance pruning,
// jury) is identical to the live path.
function simulateOffscreenTribal(state, tribeLabel) {
  const tribe = state.tribes[tribeLabel];
  if (!tribe || tribe.length === 0) return null;

  // Each AI voter picks a target. No convergence pass needed — that's a
  // small social-dynamics nicety only the live path uses.
  const votes = tribe.map(voter => ({
    voter,
    target: pickVoteTarget(state, voter, tribe),
  }));

  // Tally; resolve ties randomly. Off-screen tribals don't drag through
  // the rocks ceremony — a persistent tie picks a tied candidate at
  // random, mirroring how drawRocks would resolve in the all-tied edge.
  const result = tallyVotes(votes, state, new Set());
  let eliminated = result.eliminated;
  if (!eliminated && result.kind === "tied") {
    const tiedTargets = result.tiedIds
      .map(id => tribe.find(c => c.id === id))
      .filter(Boolean);
    eliminated = tiedTargets[Math.floor(Math.random() * tiedTargets.length)] ?? null;
  }
  if (!eliminated) return null;

  recordElimination(state, eliminated);
  return eliminated;
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

  // v5.39: per-member loyalty drift inside each active alliance. Gentle
  // step toward the natural-fit target (avg inner-circle bond + alliance
  // health − recent intra-alliance conflicts). Compounds across rounds so
  // long-running alliances develop authentic loyalty distributions.
  driftAllianceLoyalty(gameState);

  // Clear ephemeral voting blocs from the just-concluded tribal. Blocs only
  // persist for the round they formed in (visible in dev panel until reset).
  gameState.votingBlocs = [];

  // v5.5: reset tend-camp credits on round boundary. Normally consumed when
  // an idol search fires; reset here as a safety net if the player ends a
  // round without searching.
  gameState.tendCampBonus = 0;

  // v5.12: end-of-round social maintenance.
  //   1. Passive drift on pairs that didn't engage this round
  //   2. Decay suspicion memory by 0.5 per observer/actor pair
  //   3. Clear per-round interaction log + check-in records (after drift uses them)
  passiveDrift(gameState);
  decaySuspicionMemory(gameState);
  clearRoundEphemera(gameState);

  // v5.14: drifter camp-role identity grants a small natural suspicion drop
  // each round — the read is "background presence, not a threat". Other
  // role effects fire situationally (in lobby, search, conversation).
  // v5.15: "leaning:drifter" applies at 50% chance (background presence
  // is forming but not fully read yet).
  for (const c of getAllActive()) {
    const role = getCampRole(gameState, c.id);
    if ((c.suspicion ?? 0) <= 0) continue;
    if (role === "drifter")                            adjustSuspicion(gameState, c.id, -1);
    else if (role === "leaning:drifter" && Math.random() < 0.5) adjustSuspicion(gameState, c.id, -1);
  }

  gameState.round          += 1;
  gameState.campPhase       = 1;
  gameState.immunityWon     = null;
  gameState.tribalTribe     = null;
  gameState.immunityHolder  = null;

  const remaining = getAllActive().length;

  // v8.16: Final 5 is the last tribal at which idols may be played.
  // Once the game has crossed below the threshold (i.e., remaining < 5),
  // mark every still-held idol as expired. The isIdolPlayable() guard
  // already blocks play attempts beyond this point, but explicitly
  // expiring the inventory keeps state clean (UI / dev panel / save
  // game state all see "expired" rather than "held but unusable").
  if (remaining < IDOL_PLAY_MIN_ACTIVE) {
    expireHeldIdols(gameState);
  }

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

  // v9.0: every regular round opens with the Episode Recap. AI phase-1
  // camp activity has moved into onEpisodeRecapDone so the recap stays
  // strictly informational (no engine mutation while it's showing).
  // Merge / swap / FTC branches above are unchanged — they are their
  // own episode openers and skip the recap by design.
  showScreen("episodeRecap");
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

  // v8.1: scene class drives the visual palette swap (day vs. night).
  //   Tribal Council, Final Tribal, and Elimination read as night/firelit
  //   (deep charcoal, ember glow). Every other screen uses the warm-dusk
  //   day palette (driftwood, sand, palm-shade tones).
  // v9.0: episodeRecap is a daytime/morning screen → scene-day.
  const NIGHT_SCENES = new Set(["tribal", "finalTribal", "elimination"]);
  document.body.classList.toggle("scene-night", NIGHT_SCENES.has(name));
  document.body.classList.toggle("scene-day",   !NIGHT_SCENES.has(name));

  switch (name) {
    case "select":       renderSelectScreen(app, gameState);       break;
    case "castEditor":   renderCastEditorScreen(app, gameState);   break;
    case "rulesEditor":  renderRulesEditorScreen(app, gameState);  break;
    case "savedSetups":  renderSavedSetupsScreen(app, gameState);  break;
    case "templates":    renderTemplatesScreen(app, gameState);    break;
    case "swap":         renderSwapScreen(app, gameState);         break;
    case "merge":        renderMergeScreen(app, gameState);        break;
    case "episodeRecap": renderEpisodeRecapScreen(app, gameState);    break;
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

// v9.0: returns the most-recently voted-out contestant (object), or null
// if none — i.e., before the first Tribal Council. The Episode Recap UI
// reads this when rendering "previously on…". Two sources of truth are
// kept aligned: state.lastVotedOutPlayerId (explicit) and
// state.eliminated[last] (history). This helper prefers the explicit
// field, falling back to the array tail for safety.
function getLastEliminated(state = gameState) {
  if (state.lastVotedOutPlayerId) {
    const c = state.eliminated.find(e => e.id === state.lastVotedOutPlayerId);
    if (c) return c;
  }
  return state.eliminated.length > 0
    ? state.eliminated[state.eliminated.length - 1]
    : null;
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

  // v9.1 safety net: applyTemplate normalizes contestant stats, but if a
  // template path ever skips that, this guarantees the runtime cast has
  // the three sub-skills + a coherent legacy `challenge` before any
  // engine code reads them.
  normalizeAllContestants(CONTESTANTS);

  gameState = createSeasonState();
  assignTribes(CONTESTANTS, gameState);
  initIdols(gameState);      // places one idol per tribal camp + one for merge
  showScreen("select");
});
