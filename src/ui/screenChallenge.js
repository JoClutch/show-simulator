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

// ── Roster helpers (v8.11) ────────────────────────────────────────────────────
//
// Renders the active members of a tribe as a small named card. Eliminated
// players are not shown because state.tribes.* only ever holds active
// contestants (removeFromTribes prunes them at elimination). The player's
// own tribe gets a gold left-stripe and the player's own name is bolded —
// subtle, theme-consistent highlights only.
function buildTribeRosterHTML(tribeLabel, members, opts = {}) {
  const { isPlayerTribe = false, playerId = null, color, name, nameFormat = "full" } = opts;

  // Defensive: an empty tribe still renders the card with a placeholder so
  // it's obvious at a glance that nobody's left, rather than silently empty.
  if (!members || members.length === 0) {
    return `
      <div class="challenge-roster${isPlayerTribe ? " challenge-roster-mine" : ""}">
        <div class="challenge-roster-header" style="color:${color}">
          ${escapeHtml(name)}
          <span class="challenge-roster-count">0</span>
        </div>
        <div class="challenge-roster-list">
          <div class="challenge-roster-item" style="color:#888;font-style:italic">
            No active members
          </div>
        </div>
      </div>
    `;
  }

  // v8.12: switched from <ul><li> to <div> so the markup is immune to any
  // user-agent or global ul/li reset (the previous attempt rendered but the
  // names were not visible — the most reliable hypothesis was list-style/
  // ul-padding interaction, so we sidestep it entirely). Inline color +
  // display fallbacks ensure names appear even if styles.css is stale-cached.
  const items = members.map(m => {
    const isMe = playerId != null && m.id === playerId;
    const meClass = isMe ? " challenge-roster-me" : "";
    const inlineStyle = isMe
      ? "display:block;color:#f6edd2;font-weight:bold"
      : "display:block;color:#ddd1ae";
    const youTag = isMe
      ? ` <span class="challenge-roster-you" style="color:#e8b346;font-size:0.78rem">(you)</span>`
      : "";
    return `
      <div class="challenge-roster-item${meClass}" style="${inlineStyle}">
        ${escapeHtml(getPlayerDisplayName(m, nameFormat))}${youTag}
      </div>
    `;
  }).join("");

  return `
    <div class="challenge-roster${isPlayerTribe ? " challenge-roster-mine" : ""}"
         style="background:#2c3a1f;border:1px solid #5c7038;border-radius:5px;padding:0.75rem 0.9rem">
      <div class="challenge-roster-header" style="color:${color};font-weight:bold;font-size:1rem;margin-bottom:0.45rem;display:flex;justify-content:space-between;align-items:baseline">
        <span>${escapeHtml(name)}</span>
        <span class="challenge-roster-count" style="color:#847d68;font-size:0.72rem;font-weight:normal">${members.length}</span>
      </div>
      <div class="challenge-roster-list">${items}</div>
    </div>
  `;
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

  // Tribe rosters — current active members of each tribe.
  const rosterA = buildTribeRosterHTML("A", state.tribes.A, {
    name:          SEASON_CONFIG.tribeNames.A,
    color:         SEASON_CONFIG.tribeColors.A,
    isPlayerTribe: playerTribeLabel === "A",
    playerId:      state.player?.id,
  });
  const rosterB = buildTribeRosterHTML("B", state.tribes.B, {
    name:          SEASON_CONFIG.tribeNames.B,
    color:         SEASON_CONFIG.tribeColors.B,
    isPlayerTribe: playerTribeLabel === "B",
    playerId:      state.player?.id,
  });

  container.innerHTML = `
    <div class="screen" data-render-version="v8.15-tribal">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Immunity Challenge</h2>

      <div class="challenge-roster-grid">
        ${rosterA}
        ${rosterB}
      </div>

      <p class="challenge-type-label">${result.name}</p>
      <div class="event-log">
        <p>${description}</p>
      </div>

      <div class="challenge-outcome-grid">
        <div class="challenge-outcome-cell outcome-win">
          <div class="outcome-label">Immunity</div>
          <div class="outcome-tribe" style="color:${winnerColor}">${escapeHtml(winnerName)}</div>
          <div class="outcome-sub">Safe from the vote tonight</div>
        </div>
        <div class="challenge-outcome-cell outcome-loss">
          <div class="outcome-label">Tribal Council</div>
          <div class="outcome-tribe" style="color:${loserColor}">${escapeHtml(loserName)}</div>
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

  enforceChallengeOrder(container);
  console.log("[screenChallenge] v8.15 tribal render — DOM order:", domOrderTrace(container));

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
    : getIndivLossLine(getPlayerDisplayName(result.winner, FORMAT_BY_SCREEN.challenge));

  const continueLabel = playerWon
    ? "Head Back to Camp →"
    : "Return to Camp →";

  // Merged-tribe roster — single card listing every active player.
  const mergedRoster = buildTribeRosterHTML("merged", members, {
    name:          SEASON_CONFIG.mergeTribeName,
    color:         SEASON_CONFIG.mergeTribeColor,
    isPlayerTribe: true,           // post-merge, the merged tribe IS the player's tribe
    playerId:      state.player?.id,
  });

  container.innerHTML = `
    <div class="screen" data-render-version="v8.15-individual">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Individual Immunity</h2>

      <div class="challenge-roster-grid challenge-roster-grid-single">
        ${mergedRoster}
      </div>

      <p class="challenge-type-label">${result.name}</p>
      <div class="event-log">
        <p>${description}</p>
      </div>

      <div class="indiv-immunity-winner">
        <div class="immunity-necklace-icon">⬡</div>
        ${renderPlayerPortrait(result.winner, { size: "lg", extraClass: "player-portrait--stacked" })}
        <div class="immunity-winner-name" style="color:${mergeColor}">${escapeHtml(getPlayerDisplayName(result.winner, FORMAT_BY_SCREEN.challenge))}</div>
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

  enforceChallengeOrder(container);
  console.log("[screenChallenge] v8.15 individual render — DOM order:", domOrderTrace(container));

  container.querySelector("#continue-btn").addEventListener("click", () => {
    onIndividualChallengeResolved(result.winner.id);
  });
}

// ── Post-render order enforcement (v8.15) ────────────────────────────────────
//
// Belt-and-braces: regardless of how the markup string above was authored,
// this pass physically reorders the live DOM so the rosters always sit
// immediately below the <h2>, with the type label + description following.
// Any later browser/cache weirdness can't put the description above the
// rosters because we move them ourselves after innerHTML is parsed.
function enforceChallengeOrder(container) {
  const screen = container.querySelector(".screen");
  if (!screen) return;

  const h2          = screen.querySelector("h2");
  const rosterGrid  = screen.querySelector(".challenge-roster-grid");
  const typeLabel   = screen.querySelector(".challenge-type-label");
  const description = screen.querySelector(".event-log");

  if (!h2 || !rosterGrid || !description) return;

  // Place rosters immediately after the <h2>.
  if (h2.nextElementSibling !== rosterGrid) {
    h2.insertAdjacentElement("afterend", rosterGrid);
  }
  // Place type label after rosters (if present).
  if (typeLabel && rosterGrid.nextElementSibling !== typeLabel) {
    rosterGrid.insertAdjacentElement("afterend", typeLabel);
  }
  // Place description after type label (or rosters if no label).
  const beforeDesc = typeLabel || rosterGrid;
  if (beforeDesc.nextElementSibling !== description) {
    beforeDesc.insertAdjacentElement("afterend", description);
  }
}

// Returns a short string of the screen's child class names in order, for the
// console trace. Lets you verify at a glance that the live DOM order is right.
function domOrderTrace(container) {
  const screen = container.querySelector(".screen");
  if (!screen) return "(no .screen)";
  return Array.from(screen.children)
    .map(el => el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : ""))
    .join(" → ");
}
