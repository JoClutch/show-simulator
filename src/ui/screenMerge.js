// screenMerge.js — merge announcement screen
//
// Shown once when the remaining cast hits the merge threshold.
// Displays the new merged tribe name, lists all surviving players with their
// original tribe colour for context, and explains the rule shift.
// The player continues to Camp Life (the first post-merge episode).

function renderMergeScreen(container, state) {
  const all        = state.tribes.merged;
  const player     = state.player;
  const mergeColor = SEASON_CONFIG.mergeTribeColor;
  const mergeName  = SEASON_CONFIG.mergeTribeName;
  const mergeDay   = getDay(state) + DAY_OFFSETS.campPhase1;

  container.innerHTML = `
    <div class="screen" id="merge-screen">

      <div class="merge-eyebrow-row">
        <p class="screen-eyebrow">Episode ${state.round} · Day ${mergeDay}</p>
      </div>

      <div class="merge-hero">
        <div class="merge-necklace-icon">⬡</div>
        <h1 class="merge-headline">The Merge</h1>
        <div class="merge-tribe-name" style="color:${mergeColor}">${mergeName}</div>
      </div>

      <div class="event-log merge-summary">
        <p>
          The two tribes have merged into one.
          From here, immunity is <strong>individual</strong> — one player wins
          the necklace each episode and everyone else is at risk.
          Alliances will be tested. Old tribal lines may hold or shatter.
        </p>
        <p>
          <strong>${all.length} players remain.</strong>
          The game is wide open.
        </p>
      </div>

      <div class="merge-cast-block">
        <h3 class="merge-cast-heading">Surviving to the merge</h3>
        <div class="merge-cast-list">
          ${all.map(c => {
            const origColor = SEASON_CONFIG.tribeColors[c.originalTribe];
            const origName  = SEASON_CONFIG.tribeNames[c.originalTribe];
            const isYou     = c.id === player.id;
            return `
              <div class="merge-cast-chip ${isYou ? "merge-cast-chip-you" : ""}">
                <span class="merge-cast-name">${c.name}${isYou ? " (You)" : ""}</span>
                <span class="merge-cast-origin" style="color:${origColor}">${origName}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="camp-footer">
        <button id="continue-btn">Enter the Merged Game →</button>
      </div>

    </div>
  `;

  container.querySelector("#continue-btn")
    .addEventListener("click", () => onMergeDone());
}
