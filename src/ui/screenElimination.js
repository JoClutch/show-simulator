// screenElimination.js — shown after every Tribal Council vote
//
// Flavor text (elimFlavor, jury join lines) sourced from src/data/flavor.js.

function renderEliminationScreen(container, state) {
  const eliminated   = state.eliminated[state.eliminated.length - 1];
  const isPlayer     = eliminated.id === state.player.id;
  const totalPlayers = 16;
  const placement    = totalPlayers - state.eliminated.length + 1;
  const remaining    = totalPlayers - state.eliminated.length;
  const tribalDay    = getDay(state) + DAY_OFFSETS.tribal;
  const nextEpisode  = state.round + 1;

  // Tribe display — post-merge uses merged tribe name/color.
  const isMerged   = state.merged;
  const tribeName  = isMerged
    ? SEASON_CONFIG.mergeTribeName
    : SEASON_CONFIG.tribeNames[eliminated.tribe];
  const tribeColor = isMerged
    ? SEASON_CONFIG.mergeTribeColor
    : SEASON_CONFIG.tribeColors[eliminated.tribe];

  // Pre-merge: show remaining A / B tribe sizes.
  // Post-merge: show merged cast count.
  const tribeStatusRow = isMerged
    ? `
      <div class="elim-status-row">
        <span class="elim-status-label">Merged tribe</span>
        <span class="elim-status-value" style="color:${SEASON_CONFIG.mergeTribeColor}">
          ${escapeHtml(SEASON_CONFIG.mergeTribeName)} · ${state.tribes.merged.length} left
        </span>
      </div>`
    : `
      <div class="elim-status-row tribe-breakdown">
        <span class="elim-status-label">Tribe sizes</span>
        <span class="elim-status-value">
          <span style="color:${SEASON_CONFIG.tribeColors.A}">${escapeHtml(SEASON_CONFIG.tribeNames.A)} ${state.tribes.A.length}</span>
          &nbsp;·&nbsp;
          <span style="color:${SEASON_CONFIG.tribeColors.B}">${escapeHtml(SEASON_CONFIG.tribeNames.B)} ${state.tribes.B.length}</span>
        </span>
      </div>`;

  const headline = isPlayer ? "You've Been Voted Out" : "The Tribe Has Spoken";

  const voteOutMsg = isPlayer
    ? `You were voted out ${ordinal(placement)} overall. Your game ends here.`
    : `${eliminated.name} was voted out ${ordinal(placement)} overall.`;

  // One contextual sentence below the main message. Null = omit entirely.
  const flavor    = getElimFlavor(eliminated, isPlayer, state);
  const flavorHTML = flavor
    ? `<p class="elim-flavor muted">${flavor}</p>`
    : "";

  const originalLabel = isMerged && eliminated.originalTribe
    ? ` · Originally ${escapeHtml(SEASON_CONFIG.tribeNames[eliminated.originalTribe])}`
    : "";

  const nextBtn = isPlayer
    ? `<p class="muted">Refresh the page to play again.</p>`
    : `<button id="continue-btn">Continue to Episode ${nextEpisode} →</button>`;

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${tribalDay}</p>
      <h2>${headline}</h2>

      <div class="elim-card">
        <div class="elim-name">${escapeHtml(eliminated.name)}</div>
        <div class="elim-tribe" style="color:${tribeColor}">
          ${escapeHtml(tribeName)}${originalLabel} &nbsp;·&nbsp; ${ordinal(placement)} out
        </div>
      </div>

      <div class="elim-body">
        <p>${escapeHtml(voteOutMsg)}</p>
        ${flavorHTML}
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

      ${buildJuryPanelHTML(state, eliminated, isPlayer)}

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

// ── Jury panel ────────────────────────────────────────────────────────────────

// Renders the jury panel below the status block.
// Only shown on post-merge elimination screens (state.jury.length > 0).
//
// The just-eliminated player is already in state.jury when this renders
// (added in onTribalDone before showScreen was called), so we separate:
//   - newJuror     : the person who just joined (show join message)
//   - priorJurors  : previous jurors (show as chips with sentiment dots)
//
// Sentiment dots show each juror's disposition toward the human player.
// Hidden when the player was the one eliminated (they have no further stake).
function buildJuryPanelHTML(state, eliminated, isPlayer) {
  if (state.jury.length === 0) return "";

  const player      = state.player;
  const newJuror    = state.jury.find(j => j.id === eliminated.id);
  const priorJurors = state.jury.filter(j => j.id !== eliminated.id);

  // Show sentiment dots only when the player is still alive.
  const showSentiment = !isPlayer;

  // Build the prior-juror chip list.
  const priorChips = priorJurors.map(j => {
    const origColor = j.originalTribe
      ? SEASON_CONFIG.tribeColors[j.originalTribe]
      : SEASON_CONFIG.mergeTribeColor;
    const origName = j.originalTribe
      ? SEASON_CONFIG.tribeNames[j.originalTribe]
      : "";

    let dotHTML = "";
    if (showSentiment && j.sentiment) {
      const score = j.sentiment[player.id];
      if (score !== undefined) {
        const tier = sentimentTier(score);
        dotHTML = `<span class="jury-dot" data-tier="${tier}" title="${sentimentLabel(tier)}">●</span>`;
      }
    }

    return `
      <div class="jury-chip">
        ${dotHTML}
        <span class="jury-chip-name">${escapeHtml(j.name)}</span>
        <span class="jury-chip-origin" style="color:${origColor}">${escapeHtml(origName)}</span>
      </div>
    `;
  }).join("");

  // If no prior jurors, show an introductory note instead of an empty list.
  const priorSection = priorJurors.length > 0
    ? `
        <div class="jury-chip-list">${priorChips}</div>
        ${showSentiment ? `
          <p class="jury-legend muted">
            <span class="jury-legend-dot" data-tier="favorable">●</span> Favorable &nbsp;
            <span class="jury-legend-dot" data-tier="mixed">●</span> Mixed &nbsp;
            <span class="jury-legend-dot" data-tier="unfavorable">●</span> Unfavorable
            — toward you
          </p>
        ` : ""}
      `
    : `<p class="muted jury-empty-note">They will vote for the winner at Final Tribal Council.</p>`;

  // Varied join messages for the newly added juror.
  const joinVariants = newJuror ? [
    `${eliminated.name} joins the jury as Juror ${newJuror.juryNumber}.`,
    `${eliminated.name} takes their seat on the jury — Juror ${newJuror.juryNumber}.`,
    `${eliminated.name} is the ${ordinal(newJuror.juryNumber)} member of the jury.`,
  ] : null;
  const joinLine = joinVariants
    ? `<div class="jury-join-note">${pickFlavor(joinVariants)}</div>`
    : "";

  return `
    <div class="jury-panel">
      <div class="jury-panel-header">
        <span class="jury-panel-title">The Jury</span>
        <span class="jury-panel-count">${state.jury.length} member${state.jury.length !== 1 ? "s" : ""}</span>
      </div>
      ${joinLine}
      ${priorSection}
    </div>
  `;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
