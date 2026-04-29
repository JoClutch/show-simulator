// screenMerge.js — merge announcement screen
//
// Shown once when the remaining cast hits the merge threshold.
// Displays the new merged tribe name, lists all surviving players with their
// original tribe colour for context, and explains the rule shift.
//
// Flavor text sourced from src/data/flavor.js.

function renderMergeScreen(container, state) {
  const all        = state.tribes.merged;
  const player     = state.player;
  const mergeColor = SEASON_CONFIG.mergeTribeColor;
  const mergeName  = SEASON_CONFIG.mergeTribeName;
  const mergeDay   = getDay(state) + DAY_OFFSETS.campPhase1;

  // Count survivors from each original tribe.
  const countA = all.filter(c => c.originalTribe === "A").length;
  const countB = all.filter(c => c.originalTribe === "B").length;
  const nameA  = SEASON_CONFIG.tribeNames.A;
  const nameB  = SEASON_CONFIG.tribeNames.B;
  const colorA = SEASON_CONFIG.tribeColors.A;
  const colorB = SEASON_CONFIG.tribeColors.B;

  container.innerHTML = `
    <div class="screen" id="merge-screen">

      <div class="merge-eyebrow-row">
        <p class="screen-eyebrow">Episode ${state.round} · Day ${mergeDay}</p>
      </div>

      <div class="merge-hero">
        <div class="merge-necklace-icon">⬡</div>
        <h1 class="merge-headline">The Merge</h1>
        <div class="merge-tribe-name" style="color:${mergeColor}">${escapeHtml(mergeName)}</div>
      </div>

      <div class="event-log merge-summary">
        <p>
          The two tribes have merged into one.
          From here, immunity is <strong>individual</strong> — one player wins
          the necklace each episode and everyone else is vulnerable.
          Alliances will be tested. Old tribal lines may hold or shatter.
        </p>
        <p class="muted">${pickFlavor(MERGE_FLAVOR_LINES)}</p>
      </div>

      <div class="merge-tribe-tally">
        <span class="merge-tally-item" style="color:${colorA}">
          ${escapeHtml(nameA)} — ${countA} survivor${countA !== 1 ? "s" : ""}
        </span>
        <span class="merge-tally-sep">·</span>
        <span class="merge-tally-item" style="color:${colorB}">
          ${escapeHtml(nameB)} — ${countB} survivor${countB !== 1 ? "s" : ""}
        </span>
      </div>

      <div class="merge-cast-block">
        <h3 class="merge-cast-heading">Surviving to the merge — ${all.length} players</h3>
        <div class="merge-cast-list">
          ${all.map(c => {
            const origColor = SEASON_CONFIG.tribeColors[c.originalTribe];
            const origName  = SEASON_CONFIG.tribeNames[c.originalTribe];
            const isYou     = c.id === player.id;
            return `
              <div class="merge-cast-chip ${isYou ? "merge-cast-chip-you" : ""}">
                <span class="merge-cast-name">${escapeHtml(c.name)}${isYou ? " (You)" : ""}</span>
                <span class="merge-cast-origin" style="color:${origColor}">${escapeHtml(origName)}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="camp-footer">
        <button id="continue-btn">Begin the Merged Game →</button>
      </div>

    </div>
  `;

  container.querySelector("#continue-btn")
    .addEventListener("click", () => onMergeDone());
}
