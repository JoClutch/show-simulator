// screenChallenge.js — immunity challenge results screen

function renderChallengeScreen(container, state) {
  const result = runChallenge(state.tribes);

  const winnerName  = SEASON_CONFIG.tribeNames[result.winner];
  const loserName   = SEASON_CONFIG.tribeNames[result.loser];
  const winnerColor = SEASON_CONFIG.tribeColors[result.winner];
  const loserColor  = SEASON_CONFIG.tribeColors[result.loser];

  const playerTribeLabel = getPlayerTribeLabel();
  const playerWon        = playerTribeLabel === result.winner;

  const closeNote  = result.wasClose ? " It came down to the wire." : "";
  const playerNote = playerWon
    ? `Your tribe, <strong style="color:${winnerColor}">${winnerName}</strong>, wins immunity. Head back to camp.`
    : `Your tribe, <strong style="color:${loserColor}">${loserName}</strong>, loses immunity. You will attend Tribal Council tonight.`;

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Immunity Challenge</h2>
      <p class="challenge-type-label">${result.name}</p>

      <div class="event-log">
        <p>${result.description}${closeNote}</p>
      </div>

      <div class="challenge-outcome-grid">
        <div class="challenge-outcome-cell outcome-win">
          <div class="outcome-label">Immunity</div>
          <div class="outcome-tribe" style="color:${winnerColor}">${winnerName}</div>
          <div class="outcome-sub">Safe from the vote</div>
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
        <button id="continue-btn">Return to Camp</button>
      </div>
    </div>
  `;

  container.querySelector("#continue-btn").addEventListener("click", () => {
    onChallengeResolved(result.loser);
  });
}
