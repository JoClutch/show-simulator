// screenSwap.js — Tribe Swap announcement screen
//
// Shown once when the swap trigger fires (engine logic in main.js doSwap).
// Displays the new tribe composition with each contestant chip colored by
// their *originalTribe* — so the player can see at a glance who came from
// where, and how the loyalty lines now cross.
//
// Flow:
//   advanceRound → checkForSwap → doSwap → showScreen("swap")
//   Continue → onSwapDone → showScreen("campLife")
//
// All state is preserved through the swap; this screen is pure presentation.

function renderSwapScreen(container, state) {
  const swapDay     = getDay(state);
  const tribeAName  = SEASON_CONFIG.tribeNames.A;
  const tribeBName  = SEASON_CONFIG.tribeNames.B;
  const tribeAColor = SEASON_CONFIG.tribeColors.A;
  const tribeBColor = SEASON_CONFIG.tribeColors.B;
  const newA        = state.tribes.A;
  const newB        = state.tribes.B;
  const player      = state.player;

  const intro = pickFlavor(SWAP_FLAVOR_LINES);

  // Build a member chip for the new-tribe lists. Color comes from the
  // contestant's originalTribe — the visual cue that loyalty lines crossed.
  function memberChip(c) {
    const origColor = SEASON_CONFIG.tribeColors[c.originalTribe];
    const origName  = SEASON_CONFIG.tribeNames[c.originalTribe];
    const isYou     = c.id === player.id;
    return `
      <div class="swap-cast-chip ${isYou ? "swap-cast-chip-you" : ""}">
        <span class="swap-cast-name">${c.name}${isYou ? " (You)" : ""}</span>
        <span class="swap-cast-origin" style="color:${origColor}">from ${origName}</span>
      </div>
    `;
  }

  // Quick stat: how many came from each original tribe per new tribe?
  // Useful narrative — shows whether the swap was balanced or one-sided.
  function originSummary(members) {
    const fromA = members.filter(c => c.originalTribe === "A").length;
    const fromB = members.filter(c => c.originalTribe === "B").length;
    const nameA = SEASON_CONFIG.tribeNames.A;
    const nameB = SEASON_CONFIG.tribeNames.B;
    const colorA = SEASON_CONFIG.tribeColors.A;
    const colorB = SEASON_CONFIG.tribeColors.B;
    return `
      <span class="swap-origin-stat">
        <span style="color:${colorA}">${fromA} ${nameA}</span>
        &nbsp;·&nbsp;
        <span style="color:${colorB}">${fromB} ${nameB}</span>
      </span>
    `;
  }

  container.innerHTML = `
    <div class="screen" id="swap-screen">

      <div class="swap-eyebrow-row">
        <p class="screen-eyebrow">Episode ${state.round} · Day ${swapDay}</p>
      </div>

      <div class="swap-hero">
        <div class="swap-icon">⇄</div>
        <h1 class="swap-headline">Tribe Swap</h1>
        <p class="swap-subhead">${intro}</p>
      </div>

      <div class="event-log swap-summary">
        <p>
          The buffs are dropped. The tribes have been redrawn. Old loyalties
          carry over — but the new tribemates around you are the only path to
          the next immunity challenge. Some allies are now on the other beach.
          Some former rivals are now sleeping next to you.
        </p>
      </div>

      <div class="swap-tribes">
        <div class="swap-tribe-col">
          <div class="swap-tribe-header">
            <span class="swap-tribe-name" style="color:${tribeAColor}">${tribeAName}</span>
            <span class="swap-tribe-count">${newA.length} member${newA.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="swap-tribe-origin-row">${originSummary(newA)}</div>
          <div class="swap-tribe-list">
            ${newA.map(memberChip).join("")}
          </div>
        </div>

        <div class="swap-tribe-col">
          <div class="swap-tribe-header">
            <span class="swap-tribe-name" style="color:${tribeBColor}">${tribeBName}</span>
            <span class="swap-tribe-count">${newB.length} member${newB.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="swap-tribe-origin-row">${originSummary(newB)}</div>
          <div class="swap-tribe-list">
            ${newB.map(memberChip).join("")}
          </div>
        </div>
      </div>

      <div class="camp-footer">
        <button id="continue-btn">Begin the New Tribes →</button>
      </div>

    </div>
  `;

  container.querySelector("#continue-btn")
    .addEventListener("click", () => onSwapDone());
}
