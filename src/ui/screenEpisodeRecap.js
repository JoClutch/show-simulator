// screenEpisodeRecap.js — start-of-episode recap screen (v9.0)
//
// Read-only summary shown at the top of every regular round (post Episode 1
// includes a "previously voted out" headline). Sits between advanceRound /
// onContestantSelected and the first Camp Life view.
//
// Composition:
//   • Eyebrow:  Episode N · Day X
//   • Title:    "Episode Recap"
//   • Body:     pre-merge → tribeA · center card · tribeB grid
//               post-merge → center card on top, merged roster below
//   • Center:   "Previously voted out: <name>"  OR
//               "The adventure begins. All castaways remain."
//   • Continue button → onEpisodeRecapDone()
//
// Tribe rosters reuse buildTribeRosterHTML() from screenChallenge.js —
// vanilla-JS script-tag globals, loaded earlier in index.html. The recap
// inherits the player-tribe gold stripe and "(you)" highlight for free.
//
// Last voted-out player resolves through getLastEliminated(state) (main.js),
// which reads state.lastVotedOutPlayerId set in onTribalDone.

function renderEpisodeRecapScreen(container, state) {
  const lastBoot = getLastEliminated(state);
  const recapDay = getDay(state);  // Day 1 of the episode (camp phase 1)

  const isMerged = !!state.merged;

  const playerTribeLabel = state.player ? getPlayerTribeLabel() : null;
  const playerId         = state.player?.id ?? null;

  // ── Center card ─────────────────────────────────────────────────────────────
  // The "previously on…" headline. Empty-state for Episode 1.
  const centerCardHTML = lastBoot
    ? buildPrevBootCardHTML(lastBoot, state)
    : buildOpenerCardHTML(state);

  // ── Tribe roster section ────────────────────────────────────────────────────
  let rosterSectionHTML;
  if (isMerged) {
    // Post-merge: single merged-tribe roster, center card on top.
    const mergedRoster = buildTribeRosterHTML("merged", state.tribes.merged, {
      name:          SEASON_CONFIG.mergeTribeName,
      color:         SEASON_CONFIG.mergeTribeColor,
      isPlayerTribe: true,
      playerId,
    });
    rosterSectionHTML = `
      <div class="recap-center-row">${centerCardHTML}</div>
      <div class="recap-roster-grid recap-roster-grid-single">
        ${mergedRoster}
      </div>
    `;
  } else {
    // Pre-merge: tribe A · center card · tribe B (3-column grid on desktop,
    // stacks to center → A → B on mobile via CSS).
    const rosterA = buildTribeRosterHTML("A", state.tribes.A, {
      name:          SEASON_CONFIG.tribeNames.A,
      color:         SEASON_CONFIG.tribeColors.A,
      isPlayerTribe: playerTribeLabel === "A",
      playerId,
    });
    const rosterB = buildTribeRosterHTML("B", state.tribes.B, {
      name:          SEASON_CONFIG.tribeNames.B,
      color:         SEASON_CONFIG.tribeColors.B,
      isPlayerTribe: playerTribeLabel === "B",
      playerId,
    });
    rosterSectionHTML = `
      <div class="recap-roster-grid">
        <div class="recap-roster-cell recap-roster-cell-a">${rosterA}</div>
        <div class="recap-roster-cell recap-roster-cell-center">${centerCardHTML}</div>
        <div class="recap-roster-cell recap-roster-cell-b">${rosterB}</div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="screen" data-render-version="v9.0-episode-recap">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${recapDay}</p>
      <h2>Episode Recap</h2>

      ${rosterSectionHTML}

      <div class="spacer">
        <button id="episode-recap-continue-btn">Continue →</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector("#episode-recap-continue-btn");
  continueBtn.addEventListener("click", onEpisodeRecapDone);
  // v9.0 a11y: focus the continue button so Enter/Space advances the
  // recap from the keyboard, matching player expectations on a screen
  // whose only interactive element is "Continue".
  continueBtn.focus();
}

// ── Center card builders ──────────────────────────────────────────────────────

// "Previously voted out" card. Uses the boot's original tribe color so the
// chip reads as a proper memorial — even if they were swapped or merged
// before being voted out, originalTribe is the identity color.
function buildPrevBootCardHTML(boot, state) {
  const origColor = boot.originalTribe
    ? SEASON_CONFIG.tribeColors[boot.originalTribe]
    : SEASON_CONFIG.mergeTribeColor;
  const origName = boot.originalTribe
    ? SEASON_CONFIG.tribeNames[boot.originalTribe]
    : SEASON_CONFIG.mergeTribeName;

  const isPlayerBoot = state.player && boot.id === state.player.id;
  const subhead = isPlayerBoot
    ? "You were voted out."
    : `Voted out at the previous Tribal Council.`;

  return `
    <div class="recap-prev-boot-card">
      <div class="recap-prev-boot-eyebrow">Previously voted out</div>
      ${renderPlayerPortrait(boot, { size: "large", extraClass: "player-portrait--stacked is-eliminated" })}
      <div class="recap-prev-boot-name">${escapeHtml(getPlayerDisplayName(boot, FORMAT_BY_SCREEN.episodeRecap))}</div>
      <div class="recap-prev-boot-tribe" style="color:${origColor}">
        ${escapeHtml(origName)}
      </div>
      <div class="recap-prev-boot-sub">${subhead}</div>
    </div>
  `;
}

// Empty-state card — rendered when state.eliminated is empty AND
// state.lastVotedOutPlayerId is null. The center card is decided in
// renderEpisodeRecapScreen via getLastEliminated(state); this helper is
// only invoked when that check returns null.
//
// v9.10: day label now derived from state (was a hard-coded "Day 1"
// string). On a true Episode 1 cold start the label still reads "Day 1"
// because getDay(state) === 1 there; on later episodes that legitimately
// reach this branch with no recorded boots, the label tracks the eyebrow
// instead of going stale.
function buildOpenerCardHTML(state) {
  const day = state ? getDay(state) : 1;
  return `
    <div class="recap-prev-boot-card recap-opener-card">
      <div class="recap-prev-boot-eyebrow">Day ${day}</div>
      <div class="recap-opener-headline">The adventure begins.</div>
      <div class="recap-prev-boot-sub">All castaways remain.</div>
    </div>
  `;
}
