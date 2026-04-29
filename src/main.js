// main.js — game loop and screen router
//
// gameState is the single source of truth for the entire playthrough.
// Engine functions mutate it. UI functions only read it.
//
// Round flow (repeats every episode):
//
//   Camp Life (campPhase 1)
//       ↓  onCampLifeDone
//   Challenge
//       ↓  onChallengeResolved  — writes tribalTribe, campPhase = 2
//   Camp Life (campPhase 2)
//       ↓  onCampLifeDone
//   player's tribe lost? → Tribal Council → Elimination → advanceRound
//   player's tribe won?  → advanceRound  (skip Tribal)
//
// advanceRound checks:
//   ≤ 3 players left     → end-of-game summary
//   merge threshold hit  → merge placeholder (Phase 3+)
//   otherwise            → next episode, Camp Life phase 1

let gameState;

// ── Lifecycle callbacks ───────────────────────────────────────────────────────

function onContestantSelected(contestant) {
  gameState.player = contestant;
  initRelationships(gameState);
  showScreen("campLife");
}

function onCampLifeDone() {
  if (gameState.campPhase === 1) {
    showScreen("challenge");
  } else {
    if (getPlayerTribeLabel() === gameState.tribalTribe) {
      showScreen("tribal");
    } else {
      advanceRound();
    }
  }
}

function onChallengeResolved(losingTribeLabel) {
  gameState.immunityWon = losingTribeLabel === "A" ? "B" : "A";
  gameState.tribalTribe = losingTribeLabel;
  gameState.campPhase   = 2;
  showScreen("campLife");
}

function onTribalDone(eliminatedContestant) {
  eliminatedContestant.active = false;
  gameState.eliminated.push(eliminatedContestant);
  removeFromTribes(eliminatedContestant);
  showScreen("elimination");
}

function onEliminationDone() {
  advanceRound();
}

// ── Round management ──────────────────────────────────────────────────────────

function advanceRound() {
  gameState.round      += 1;
  gameState.campPhase   = 1;
  gameState.immunityWon = null;
  gameState.tribalTribe = null;

  const remaining = getAllActive().length;

  // End of game — fewer than 4 players means Final 3 or lower.
  if (remaining <= 3) {
    showGameOver();
    return;
  }

  // Phase 1 prototype stop — remove this block when Phase 2 is ready.
  if (isPhase1Complete()) {
    showPhase1End();
    return;
  }

  // Merge hook — disabled in Phase 1 (mergeTriggerCount is null).
  // Set SEASON_CONFIG.mergeTriggerCount to a player count to activate in Phase 3.
  if (checkForMerge()) {
    showMergePlaceholder();
    return;
  }

  showScreen("campLife");
}

// ── Screen routing ────────────────────────────────────────────────────────────

function showScreen(name) {
  gameState.phase = name;
  const app = document.getElementById("app");
  app.innerHTML   = "";

  switch (name) {
    case "select":      renderSelectScreen(app, gameState);      break;
    case "campLife":    renderCampLifeScreen(app, gameState);    break;
    case "challenge":   renderChallengeScreen(app, gameState);   break;
    case "tribal":      renderTribalScreen(app, gameState);      break;
    case "elimination": renderEliminationScreen(app, gameState); break;
  }
}

// ── End states ────────────────────────────────────────────────────────────────

// Called when ≤ 3 players remain.
function showGameOver() {
  const player          = gameState.player;
  const isInFinal3      = getAllActive().find(c => c.id === player.id);
  const episodesPlayed  = gameState.round - 1;
  const dayReached      = getDay(gameState);
  const outlasted       = gameState.eliminated.length;

  const headline = isInFinal3
    ? "You Made the Final 3!"
    : "Game Over";

  const summary = isInFinal3
    ? `You survived all ${episodesPlayed} episodes and reached Day ${dayReached}. You outlasted ${outlasted} other players.`
    : `You were voted out on Day ${dayReached - 3}. You lasted ${episodesPlayed} episode${episodesPlayed !== 1 ? "s" : ""} and outlasted ${outlasted - 1} player${outlasted - 1 !== 1 ? "s" : ""}.`;

  const remainingNames = getAllActive().map(c => c.name).join(", ");
  const finalNote = isInFinal3
    ? `<p class="muted">Full jury and Final Tribal Council coming in a later phase.</p>`
    : `<p class="muted">Final 3: ${remainingNames}</p>`;

  document.getElementById("app").innerHTML = `
    <div class="screen">
      <h1>${headline}</h1>
      <div class="event-log">
        <p>${summary}</p>
      </div>
      ${finalNote}
      <div class="spacer">
        <p class="muted">Refresh the page to play again.</p>
      </div>
    </div>
  `;
}

// Stub shown when merge is triggered (Phase 3+).
// Activated by setting SEASON_CONFIG.mergeTriggerCount to a player count.
function showMergePlaceholder() {
  document.getElementById("app").innerHTML = `
    <div class="screen">
      <h2>The Merge</h2>
      <p>
        The two tribes have merged into one.
        Full merge gameplay is coming in a later phase.
      </p>
      <p class="muted">Refresh to play again.</p>
    </div>
  `;
}

// ── Phase 1 stop ─────────────────────────────────────────────────────────────

// Returns true when either Phase 1 stop condition is met.
// To disable a condition, set its config value to null.
// Remove this function entirely when Phase 2 is ready.
function isPhase1Complete() {
  const { phase1MaxRounds, phase1MinTribeSize } = SEASON_CONFIG;
  if (phase1MaxRounds !== null && gameState.round > phase1MaxRounds) return true;
  if (phase1MinTribeSize !== null) {
    const smallest = Math.min(gameState.tribes.A.length, gameState.tribes.B.length);
    if (smallest <= phase1MinTribeSize) return true;
  }
  return false;
}

// Shown when isPhase1Complete() triggers. Remove this function when Phase 2 is ready.
function showPhase1End() {
  const episodesPlayed = gameState.round - 1;
  const dayReached     = getDay(gameState);
  const remaining      = getAllActive().length;
  const countA         = gameState.tribes.A.length;
  const countB         = gameState.tribes.B.length;
  const nameA          = SEASON_CONFIG.tribeNames.A;
  const nameB          = SEASON_CONFIG.tribeNames.B;
  const colorA         = SEASON_CONFIG.tribeColors.A;
  const colorB         = SEASON_CONFIG.tribeColors.B;

  document.getElementById("app").innerHTML = `
    <div class="screen phase1-end-screen">
      <div class="phase1-end-badge">Phase 1 Complete</div>
      <h1>To Be Continued…</h1>

      <div class="event-log phase1-end-recap">
        <p>
          The game has reached the end of this prototype.
          ${episodesPlayed} episode${episodesPlayed !== 1 ? "s" : ""} played
          &nbsp;·&nbsp; Day ${dayReached}
          &nbsp;·&nbsp; ${remaining} players remaining
        </p>
        <p>
          <span style="color:${colorA}">${nameA}: ${countA}</span>
          &nbsp;·&nbsp;
          <span style="color:${colorB}">${nameB}: ${countB}</span>
        </p>
      </div>

      <div class="phase1-end-roadmap">
        <h3>Coming in Later Phases</h3>
        <ul>
          <li><span class="phase-tag">Phase 2</span> Tribe swap &amp; deeper social mechanics</li>
          <li><span class="phase-tag">Phase 3</span> The merge &amp; individual immunity</li>
          <li><span class="phase-tag">Phase 4</span> Jury, Final Tribal Council &amp; the winner</li>
        </ul>
      </div>

      <div class="spacer">
        <p class="muted">Refresh the page to play again.</p>
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the label ("A" or "B") of the tribe the player is currently in.
function getPlayerTribeLabel() {
  for (const label of ["A", "B"]) {
    if (gameState.tribes[label].find(c => c.id === gameState.player.id)) {
      return label;
    }
  }
  return null;
}

// Returns all contestants who have not yet been eliminated.
function getAllActive() {
  return [...gameState.tribes.A, ...gameState.tribes.B];
}

// Removes a contestant from whichever tribe array they belong to.
function removeFromTribes(contestant) {
  for (const label of ["A", "B"]) {
    gameState.tribes[label] = gameState.tribes[label].filter(
      c => c.id !== contestant.id
    );
  }
}

// Derives the in-game day from the round number.
// Each episode spans 3 days. Day 1 is the very start of the game.
//   Round 1 → Day 1   Round 2 → Day 4   Round 3 → Day 7 …
function getDay(state) {
  return (state.round - 1) * 3 + 1;
}

// Returns true when the remaining player count falls to or below the merge
// trigger threshold. Always false in Phase 1 (mergeTriggerCount is null).
function checkForMerge() {
  const trigger = SEASON_CONFIG.mergeTriggerCount;
  if (!trigger) return false;
  return getAllActive().length <= trigger;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  gameState = createSeasonState();
  assignTribes(CONTESTANTS, gameState);
  showScreen("select");
});
