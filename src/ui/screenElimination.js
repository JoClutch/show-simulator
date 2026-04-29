// screenElimination.js — shown after every Tribal Council vote

function renderEliminationScreen(container, state) {
  const eliminated   = state.eliminated[state.eliminated.length - 1];
  const isPlayer     = eliminated.id === state.player.id;
  const totalPlayers = 16;                                    // fixed cast size
  const placement    = totalPlayers - state.eliminated.length + 1;
  const remaining    = totalPlayers - state.eliminated.length;
  const tribalDay    = getDay(state) + DAY_OFFSETS.tribal;
  const nextEpisode  = state.round + 1;

  // After the merge, eliminated.tribe = "merged".
  // Show the merged tribe name/color; use originalTribe for flavour if present.
  const isMerged   = state.merged;
  const tribeName  = isMerged
    ? SEASON_CONFIG.mergeTribeName
    : SEASON_CONFIG.tribeNames[eliminated.tribe];
  const tribeColor = isMerged
    ? SEASON_CONFIG.mergeTribeColor
    : SEASON_CONFIG.tribeColors[eliminated.tribe];

  // Pre-merge: show remaining A / B tribe sizes.
  // Post-merge: show merged cast count only (A and B are both empty).
  const tribeStatusRow = isMerged
    ? `
      <div class="elim-status-row">
        <span class="elim-status-label">Merged tribe</span>
        <span class="elim-status-value" style="color:${SEASON_CONFIG.mergeTribeColor}">
          ${SEASON_CONFIG.mergeTribeName} · ${state.tribes.merged.length} left
        </span>
      </div>`
    : `
      <div class="elim-status-row tribe-breakdown">
        <span class="elim-status-label">Tribe sizes</span>
        <span class="elim-status-value">
          <span style="color:${SEASON_CONFIG.tribeColors.A}">${SEASON_CONFIG.tribeNames.A} ${state.tribes.A.length}</span>
          &nbsp;·&nbsp;
          <span style="color:${SEASON_CONFIG.tribeColors.B}">${SEASON_CONFIG.tribeNames.B} ${state.tribes.B.length}</span>
        </span>
      </div>`;

  const headline = isPlayer ? "You've Been Voted Out" : "The Tribe Has Spoken";

  const voteOutMsg = isPlayer
    ? `You were voted out ${ordinal(placement)} overall. Your game ends here.`
    : `${eliminated.name} was voted out ${ordinal(placement)} overall.`;

  // Show original pre-merge tribe as extra flavour when available.
  const originalLabel = isMerged && eliminated.originalTribe
    ? ` · Originally ${SEASON_CONFIG.tribeNames[eliminated.originalTribe]}`
    : "";

  const nextBtn = isPlayer
    ? `<p class="muted">Refresh the page to play again.</p>`
    : `<button id="continue-btn">Continue to Episode ${nextEpisode} →</button>`;

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${tribalDay}</p>
      <h2>${headline}</h2>

      <div class="elim-card">
        <div class="elim-name">${eliminated.name}</div>
        <div class="elim-tribe" style="color:${tribeColor}">
          ${tribeName}${originalLabel} &nbsp;·&nbsp; ${ordinal(placement)} out
        </div>
      </div>

      <div class="elim-body">
        <p>${voteOutMsg}</p>
      </div>

      <div class="elim-status">
        <div class="elim-status-row">
          <span class="elim-status-label">Players remaining</span>
          <span class="elim-status-value">${remaining}</span>
        </div>
        <div class="elim-status-row">
          <span class="elim-status-label">Episode</span>
          <span class="elim-status-value">${state.round}</span>
        </div>
        <div class="elim-status-row">
          <span class="elim-status-label">Day</span>
          <span class="elim-status-value">${tribalDay}</span>
        </div>
        ${tribeStatusRow}
      </div>

      <div class="spacer">
        ${nextBtn}
      </div>
    </div>
  `;

  if (!isPlayer) {
    container.querySelector("#continue-btn").addEventListener("click", () => {
      onEliminationDone();
    });
  }
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
