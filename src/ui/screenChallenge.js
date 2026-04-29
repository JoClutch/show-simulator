// screenChallenge.js — immunity challenge results screen
//
// Pre-merge:  tribe vs tribe → calls onChallengeResolved(losingTribeLabel)
// Post-merge: individual immunity → calls onIndividualChallengeResolved(winnerId)
//
// Flavor text is sourced from src/data/flavor.js.

function renderChallengeScreen(container, state) {
  if (state.merged) {
    renderIndividualChallengeScreen(container, state);
  } else {
    renderTribalChallengeScreen(container, state);
  }
}

// ── Pre-merge: tribal immunity ────────────────────────────────────────────────

function renderTribalChallengeScreen(container, state) {
  const result = runChallenge(state.tribes);

  const winnerName  = SEASON_CONFIG.tribeNames[result.winner];
  const loserName   = SEASON_CONFIG.tribeNames[result.loser];
  const winnerColor = SEASON_CONFIG.tribeColors[result.winner];
  const loserColor  = SEASON_CONFIG.tribeColors[result.loser];

  const playerTribeLabel = getPlayerTribeLabel();
  const playerWon        = playerTribeLabel === result.winner;

  // Challenge description — append a close-finish suffix when applicable.
  const closeSuffix = result.wasClose ? pickFlavor(CHALLENGE_CLOSE_SUFFIXES) : "";
  const description = result.description + closeSuffix;

  // Status text shown to the player.
  const playerNote = playerWon
    ? pickFlavor(CHALLENGE_WIN_LINES)
    : pickFlavor(CHALLENGE_LOSS_LINES);

  // Context-sensitive continue button.
  const continueLabel = playerWon
    ? "Head Back to Camp →"
    : "Return to Camp →";

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Immunity Challenge</h2>
      <p class="challenge-type-label">${result.name}</p>

      <div class="event-log">
        <p>${description}</p>
      </div>

      <div class="challenge-outcome-grid">
        <div class="challenge-outcome-cell outcome-win">
          <div class="outcome-label">Immunity</div>
          <div class="outcome-tribe" style="color:${winnerColor}">${winnerName}</div>
          <div class="outcome-sub">Safe from the vote tonight</div>
        </div>
        <div class="challenge-outcome-cell outcome-loss">
          <div class="outcome-label">Tribal Council</div>
          <div class="outcome-tribe" style="color:${loserColor}">${loserName}</div>
          <div class="outcome-sub">Someone goes home tonight</div>
        </div>
      </div>

      <div class="challenge-player-status ${playerWon ? "status-safe" : "status-danger"}">
        <p>${playerNote}</p>
      </div>

      <div class="spacer">
        <button id="continue-btn">${continueLabel}</button>
      </div>
    </div>
  `;

  container.querySelector("#continue-btn").addEventListener("click", () => {
    onChallengeResolved(result.loser);
  });
}

// ── Post-merge: individual immunity ──────────────────────────────────────────

function renderIndividualChallengeScreen(container, state) {
  const members   = state.tribes.merged;
  const result    = runIndividualChallenge(members);
  const player    = state.player;
  const playerWon = result.winner.id === player.id;

  const mergeColor  = SEASON_CONFIG.mergeTribeColor;

  const closeSuffix = result.wasClose ? pickFlavor(CHALLENGE_CLOSE_SUFFIXES) : "";
  const description = result.description + closeSuffix;

  // Status text — personal win vs watching someone else take it.
  const playerNote = playerWon
    ? pickFlavor(INDIV_WIN_LINES)
    : getIndivLossLine(result.winner.name);

  const continueLabel = playerWon
    ? "Head Back to Camp →"
    : "Return to Camp →";

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Individual Immunity</h2>
      <p class="challenge-type-label">${result.name}</p>

      <div class="event-log">
        <p>${description}</p>
      </div>

      <div class="indiv-immunity-winner">
        <div class="immunity-necklace-icon">⬡</div>
        <div class="immunity-winner-name" style="color:${mergeColor}">${result.winner.name}</div>
        <div class="immunity-winner-sub">wins Individual Immunity</div>
      </div>

      <div class="challenge-player-status ${playerWon ? "status-safe" : "status-danger"}">
        <p>${playerNote}</p>
      </div>

      <div class="spacer">
        <button id="continue-btn">${continueLabel}</button>
      </div>
    </div>
  `;

  container.querySelector("#continue-btn").addEventListener("click", () => {
    onIndividualChallengeResolved(result.winner.id);
  });
}
