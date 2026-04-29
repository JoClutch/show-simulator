// screenElimination.js — shown after every Tribal Council vote

function renderEliminationScreen(container, state) {
  const eliminated   = state.eliminated[state.eliminated.length - 1];
  const isPlayer     = eliminated.id === state.player.id;
  const totalPlayers = 16;                                   // fixed for Phase 1
  const placement    = totalPlayers - state.eliminated.length + 1;
  const remaining    = totalPlayers - state.eliminated.length;
  const tribalDay    = getDay(state);                        // first day of this round
  const nextEpisode  = state.round + 1;

  const tribeName  = SEASON_CONFIG.tribeNames[eliminated.tribe];
  const tribeColor = SEASON_CONFIG.tribeColors[eliminated.tribe];

  // Remaining tribe counts — already accurate because removeFromTribes()
  // has already run before this screen renders.
  const countA = state.tribes.A.length;
  const countB = state.tribes.B.length;
  const nameA  = SEASON_CONFIG.tribeNames.A;
  const nameB  = SEASON_CONFIG.tribeNames.B;
  const colorA = SEASON_CONFIG.tribeColors.A;
  const colorB = SEASON_CONFIG.tribeColors.B;

  const headline = isPlayer ? "You've Been Voted Out" : "The Tribe Has Spoken";

  const voteOutMsg = isPlayer
    ? `You were voted out ${ordinal(placement)} overall. Your game ends here.`
    : `${eliminated.name} was voted out ${ordinal(placement)} overall.`;

  const nextBtn = isPlayer
    ? `<p class="muted">Refresh the page to play again.</p>`
    : `<button id="continue-btn">Continue to Episode ${nextEpisode} →</button>`;

  container.innerHTML = `
    <div class="screen">
      <h2>${headline}</h2>

      <div class="elim-card">
        <div class="elim-name">${eliminated.name}</div>
        <div class="elim-tribe" style="color:${tribeColor}">
          ${tribeName} tribe &nbsp;·&nbsp; ${ordinal(placement)} out
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
          <span class="elim-status-value">${tribalDay + 2}</span>
        </div>
        <div class="elim-status-row tribe-breakdown">
          <span class="elim-status-label">Tribe sizes</span>
          <span class="elim-status-value">
            <span style="color:${colorA}">${nameA} ${countA}</span>
            &nbsp;·&nbsp;
            <span style="color:${colorB}">${nameB} ${countB}</span>
          </span>
        </div>
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
