// screenResults.js — Season recap shown after Final Tribal Council
//
// Displays a full placement list (1st through 16th) and lets the player
// review how the season went before refreshing to play again.
//
// Placement order:
//   1st       — winner (most jury votes)
//   2nd / 3rd — other finalists, sorted by jury vote count (descending)
//   4th–16th  — eliminated players, most-recently-eliminated first

function renderResultsScreen(container, state) {
  const winner     = state.winner;
  const player     = state.player;
  const finalists  = state.finalists  ?? [];
  const eliminated = state.eliminated ?? [];
  const allVotes   = state.finalVotes ?? [];
  const totalPlayers = SEASON_CONFIG.tribeSize * SEASON_CONFIG.tribesCount;  // 16

  // Tally jury votes per finalist.
  const voteCounts = {};
  for (const { target } of allVotes) {
    voteCounts[target.id] = (voteCounts[target.id] ?? 0) + 1;
  }

  // ── Build placement rows ──────────────────────────────────────────────────

  // Helper: turn a contestant into a display row.
  function makeRow(contestant, place, opts = {}) {
    const { juryVotes = null } = opts;
    const isMe = contestant.id === player.id;
    const isWin = winner && contestant.id === winner.id;

    const origColor = contestant.originalTribe
      ? SEASON_CONFIG.tribeColors[contestant.originalTribe]
      : (contestant.tribe === "merged"
          ? SEASON_CONFIG.mergeTribeColor
          : (SEASON_CONFIG.tribeColors[contestant.tribe] ?? SEASON_CONFIG.mergeTribeColor));
    const origName = contestant.originalTribe
      ? SEASON_CONFIG.tribeNames[contestant.originalTribe]
      : (contestant.tribe === "merged"
          ? SEASON_CONFIG.mergeTribeName
          : (SEASON_CONFIG.tribeNames[contestant.tribe] ?? ""));

    const votesCell = juryVotes !== null
      ? `<span class="results-jury-votes">${juryVotes} jury vote${juryVotes !== 1 ? "s" : ""}</span>`
      : "";

    return `
      <div class="results-boot-row
                  ${isWin ? "results-winner-row" : ""}
                  ${isMe  ? "results-player-row" : ""}">
        <span class="results-place">${ordinal(place)}${isWin ? " 🏆" : ""}</span>
        <span class="results-name">${contestant.name}${isMe ? " (you)" : ""}</span>
        <span class="results-tribe" style="color:${origColor}">${origName}</span>
        ${votesCell}
      </div>
    `;
  }

  const rows = [];

  // 1st — winner
  if (winner) {
    rows.push(makeRow(winner, 1, { juryVotes: voteCounts[winner.id] ?? 0 }));
  }

  // 2nd / 3rd — other finalists sorted by jury votes
  const runnerUps = finalists
    .filter(f => !winner || f.id !== winner.id)
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0));

  runnerUps.forEach((f, idx) => {
    rows.push(makeRow(f, idx + 2, { juryVotes: voteCounts[f.id] ?? 0 }));
  });

  // 4th–16th — eliminated players, most recent first (reverse of elimination order).
  // eliminated[0] = 1st boot = last place overall.
  const finalistCount = finalists.length;  // 3
  [...eliminated]
    .reverse()
    .forEach((c, idx) => {
      const place = finalistCount + 1 + idx;  // 4, 5, 6, …
      rows.push(makeRow(c, place));
    });

  // ── Season summary line ───────────────────────────────────────────────────

  const playerPlace = winner && player.id === winner.id
    ? 1
    : (() => {
        const finalistIdx = runnerUps.findIndex(f => f.id === player.id);
        if (finalistIdx !== -1) return finalistIdx + 2;
        const elimIdx = [...eliminated].reverse().findIndex(c => c.id === player.id);
        return finalistCount + 1 + (elimIdx >= 0 ? elimIdx : 0);
      })();

  const episodesPlayed = state.round - 1;

  const summaryLine = winner && player.id === winner.id
    ? `You won! You outlasted all ${totalPlayers - 1} other players across ${episodesPlayed} episodes and ${state.ftcDay} days.`
    : `You finished ${ordinal(playerPlace)} overall — outlasting ${totalPlayers - playerPlace} player${totalPlayers - playerPlace !== 1 ? "s" : ""} across ${episodesPlayed} episodes.`;

  // ── Render ────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">${SEASON_CONFIG.name}</p>
      <h2>Season Results</h2>

      <div class="event-log">
        <p>${summaryLine}</p>
      </div>

      <div class="results-section">
        <div class="results-boot-list">
          ${rows.join("")}
        </div>
      </div>

      <div class="spacer">
        <p class="muted">Refresh the page to play again.</p>
      </div>
    </div>
  `;
}
