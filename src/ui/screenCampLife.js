// screenCampLife.js — interactive Camp Life phase
//
// Used for both campPhase 1 (before the challenge) and campPhase 2 (after).
// Works pre-merge (tribe context) and post-merge (full merged cast).
//
// Pre-merge:
//   campPhase 1 → onCampLifeDone → showScreen("challenge")
//   campPhase 2, lost → onCampLifeDone → showScreen("tribal")
//   campPhase 2, safe → onCampLifeDone → advanceRound()
//
// Post-merge:
//   campPhase 1 → onCampLifeDone → showScreen("challenge") [individual]
//   campPhase 2 → onCampLifeDone → showScreen("tribal")    [everyone goes]

function renderCampLifeScreen(container, state) {
  const tribeLabel = getPlayerTribeLabel();   // "A" | "B" | "merged"
  const player     = state.player;
  const maxActions = SEASON_CONFIG.campActionsPerRound;
  const isPhase2   = state.campPhase === 2;

  // Tribe identity — handle pre-merge and post-merge separately.
  const tribeName  = tribeLabel === "merged"
    ? SEASON_CONFIG.mergeTribeName
    : SEASON_CONFIG.tribeNames[tribeLabel];
  const tribeColor = tribeLabel === "merged"
    ? SEASON_CONFIG.mergeTribeColor
    : SEASON_CONFIG.tribeColors[tribeLabel];

  // Everyone in the player's current tribe (excluding the player themselves).
  const tribemates = state.tribes[tribeLabel].filter(c => c.id !== player.id);

  // ── Determine phase-2 outcome context ─────────────────────────────────────
  //
  // Pre-merge:
  //   goingToTribal = player's tribe lost the challenge
  //   isSafe        = player's tribe won
  //
  // Post-merge:
  //   goingToTribal = player is NOT the immunity holder (everyone else is vulnerable)
  //   isSafe        = player holds the necklace

  let goingToTribal = false;
  let isSafe        = false;

  if (isPhase2) {
    if (state.merged) {
      const isImmune = state.immunityHolder === player.id;
      goingToTribal  = !isImmune;
      isSafe         = isImmune;
    } else {
      goingToTribal = state.tribalTribe === tribeLabel;
      isSafe        = !goingToTribal;
    }
  }

  // Labels that change depending on phase and outcome.
  const phaseLabel    = isPhase2 ? "Evening at Camp" : "Camp Life";
  const stepNote      = isPhase2 ? "After the challenge" : "Before the challenge";

  // Episode opener — a brief atmospheric line shown only on the first camp
  // phase of each episode (phase 1). Sourced from flavor.js.
  const episodeOpener = !isPhase2
    ? `<p class="camp-episode-opener muted">${getEpisodeOpener(state)}</p>`
    : "";

  // After merge everyone always heads to tribal in phase 2 (even the immune
  // holder — they still attend and cast a vote).
  const continueLabel = !isPhase2
    ? "Head to the Challenge →"
    : (goingToTribal || state.merged) ? "Head to Tribal Council →"
    : "End the Day →";

  // Status banners — only shown in phase 2.
  let statusBanner = "";
  if (isPhase2) {
    if (goingToTribal) {
      const msg = state.merged
        ? "Everyone heads to Tribal Council tonight. You are vulnerable."
        : "Tribal Council is tonight. Make your moves count.";
      statusBanner = `<div class="camp-status-banner camp-status-danger">${msg}</div>`;
    } else if (isSafe) {
      const msg = state.merged
        ? "You hold Individual Immunity. You cannot be voted out tonight."
        : "Your tribe won immunity. You are safe tonight.";
      statusBanner = `<div class="camp-status-banner camp-status-safe">${msg}</div>`;
    }
  }

  let actionsLeft = maxActions;

  // ── Shell ─────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="screen" id="camp-screen">

      <div class="camp-header">
        <div class="camp-heading-block">
          <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + (isPhase2 ? DAY_OFFSETS.campPhase2 : DAY_OFFSETS.campPhase1)}</p>
          <h2>${phaseLabel}</h2>
          <span class="camp-tribe-tag" style="color:${tribeColor}">${tribeName} tribe</span>
          <span class="camp-step-note">${stepNote}</span>
        </div>
        <div id="actions-counter" class="actions-counter">
          ${actionsLeft} of ${maxActions} actions left
        </div>
      </div>

      ${episodeOpener}

      ${statusBanner}

      <div class="camp-tribemates">
        <span class="camp-tribemates-label">Your tribe:</span>
        <span class="tribe-chip tribe-chip-you">You (${player.name})</span>
        ${tribemates.map(c => `<span class="tribe-chip">${c.name}</span>`).join("")}
      </div>

      <div id="action-area" class="action-area"></div>

      <div id="feedback-log" class="feedback-log"></div>

      <div class="camp-footer">
        <button id="continue-btn">${continueLabel}</button>
      </div>

    </div>
  `;

  const actionArea  = container.querySelector("#action-area");
  const feedbackLog = container.querySelector("#feedback-log");
  const counter     = container.querySelector("#actions-counter");

  container.querySelector("#continue-btn")
    .addEventListener("click", () => onCampLifeDone());

  showActionButtons();

  // ── Render phases ─────────────────────────────────────────────────────────

  function showActionButtons() {
    actionArea.innerHTML = "";

    if (actionsLeft === 0) {
      actionArea.innerHTML =
        `<p class="muted camp-done-msg">You've used all your actions for today.</p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "action-btn-grid";

    for (const action of CAMP_ACTIONS) {
      const btn = document.createElement("button");
      btn.className = "action-btn";
      btn.innerHTML = `
        <span class="action-btn-label">${action.label}</span>
        <span class="action-btn-detail">${action.detail}</span>
      `;
      btn.addEventListener("click", () => onActionClick(action));
      grid.appendChild(btn);
    }

    actionArea.appendChild(grid);
  }

  function showTargetPicker(action) {
    actionArea.innerHTML = "";

    const picker = document.createElement("div");
    picker.className = "target-picker";
    picker.innerHTML = `
      <p class="target-picker-prompt">
        <strong>${action.label}</strong> — ${action.targetPrompt ?? "choose someone"}:
      </p>
      <div class="target-chip-row" id="target-chips"></div>
      <button id="cancel-target-btn" class="cancel-btn">← Cancel</button>
    `;

    const chipRow = picker.querySelector("#target-chips");
    for (const mate of tribemates) {
      const chip = document.createElement("button");
      chip.className = "target-chip";
      chip.textContent = mate.name;
      chip.addEventListener("click", () => onTargetSelected(action, mate));
      chipRow.appendChild(chip);
    }

    picker.querySelector("#cancel-target-btn")
      .addEventListener("click", () => showActionButtons());

    actionArea.appendChild(picker);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function onActionClick(action) {
    if (actionsLeft === 0) return;
    if (action.needsTarget) {
      showTargetPicker(action);
    } else {
      resolveAction(action, null);
    }
  }

  function onTargetSelected(action, target) {
    resolveAction(action, target);
  }

  function resolveAction(action, target) {
    const result = executeAction(state, action.id, player, tribemates, target);
    actionsLeft--;
    appendFeedback(action, target, result.feedback);
    counter.textContent = actionsLeft > 0
      ? `${actionsLeft} of ${maxActions} actions left`
      : "No actions left";
    showActionButtons();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function appendFeedback(action, target, text) {
    const tag   = target ? `${action.label} · ${target.name}` : action.label;
    const entry = document.createElement("div");
    entry.className = "feedback-entry";
    entry.innerHTML = `
      <span class="feedback-action-tag">${tag}</span>
      <span class="feedback-text">${text}</span>
    `;
    feedbackLog.insertBefore(entry, feedbackLog.firstChild);
  }
}
