// screenElimination.js — shown after every Tribal Council vote
//
// Flavor text (elimFlavor, jury join lines) sourced from src/data/flavor.js.
//
// Stat correctness contract (v8.10):
// This screen renders POST-elimination state. By the time we get here,
// onTribalDone() has already pushed the eliminated player onto state.eliminated
// AND removed them from their tribe array. Every displayed stat is derived
// from buildEliminationSummary() so we never mix pre- and post-elim values.

// ── Canonical summary builder ────────────────────────────────────────────────
//
// Single source of truth for every stat shown on the elimination screen.
// Reads ONLY the post-elimination game state — never computes counts from
// SEASON_CONFIG.tribeSize / tribesCount, which can drift from the actual cast
// after custom templates, cast-editor edits, or future cast-size changes.
//
// Definitions (per spec):
//   originalCastSize   = active + eliminated (always correct, derived from
//                        live state — no config dependency)
//   eliminatedCount    = number eliminated SO FAR including the one we're
//                        showing right now
//   playersRemaining   = originalCastSize - eliminatedCount = active count
//   placement          = playersRemaining + 1 (the just-eliminated's finish)
//
// Worked examples:
//   16-player season, 1st boot   → active=15, elim=1, place=16th
//   16-player season, 5th boot   → active=11, elim=5, place=12th
//   16-player season, merge boot → active=9,  elim=7, place=10th  (merge@10)
//   first juror (atMerge config) → same as merge boot, juror=true, jurorIdx=1
//   final non-juror (final 4)    → active=3,  elim=13, place=4th
//
// The "just-eliminated" player is the LAST entry in state.eliminated.
function buildEliminationSummary(state) {
  const eliminated       = state.eliminated[state.eliminated.length - 1];
  const eliminatedCount  = state.eliminated.length;
  const activeList       = getAllActive();           // post-elim survivors
  const playersRemaining = activeList.length;
  const originalCastSize = playersRemaining + eliminatedCount;
  const placement        = playersRemaining + 1;

  // Defensive sanity checks — flag any internal inconsistency loudly during
  // development. These are invariants the rest of the screen depends on.
  if (eliminatedCount < 1) {
    console.error("[buildEliminationSummary] eliminated list is empty — screen called too early?");
  }
  if (placement !== originalCastSize - eliminatedCount + 1) {
    console.error("[buildEliminationSummary] placement formula drift",
      { placement, originalCastSize, eliminatedCount, playersRemaining });
  }
  if (eliminated && state.eliminated.findIndex(e => e.id === eliminated.id) !== eliminatedCount - 1) {
    console.error("[buildEliminationSummary] eliminated player is not at end of list");
  }

  // Jury status — the eliminated player is added to state.jury by onTribalDone
  // BEFORE this screen renders, so checking membership is reliable.
  const jurorEntry = state.jury.find(j => j.id === eliminated.id) || null;
  const isJuror    = !!jurorEntry;
  const juryNumber = jurorEntry ? jurorEntry.juryNumber : null;

  // Tribe context — pre-merge shows A/B remaining; post-merge shows merged.
  const isMerged = !!state.merged;

  // Day / episode context — derived from the current round, not stored
  // separately. The round counter has NOT advanced yet (advanceRound runs
  // on Continue), so state.round is still the round of the just-finished tribal.
  const tribalDay   = getDay(state) + DAY_OFFSETS.tribal;
  const nextEpisode = state.round + 1;

  return {
    eliminated,
    eliminatedCount,
    originalCastSize,
    playersRemaining,
    placement,
    isJuror,
    juryNumber,
    isMerged,
    tribalDay,
    episode: state.round,
    nextEpisode,
  };
}

function renderEliminationScreen(container, state) {
  const summary = buildEliminationSummary(state);
  const {
    eliminated,
    placement,
    playersRemaining,
    isMerged,
    tribalDay,
    nextEpisode,
  } = summary;
  const isPlayer = eliminated.id === state.player.id;

  // Tribe display — post-merge uses merged tribe name/color.
  // (isMerged comes from buildEliminationSummary above.)
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
      <p class="screen-eyebrow">Episode ${summary.episode} · Day ${tribalDay}</p>
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
          <span class="elim-status-value">${playersRemaining}</span>
        </div>
        <div class="elim-status-row">
          <span class="elim-status-label">Episode</span>
          <span class="elim-status-value">${summary.episode}</span>
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
