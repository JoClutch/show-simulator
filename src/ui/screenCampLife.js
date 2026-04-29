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

  // ── Idol state for this screen ────────────────────────────────────────────
  //
  // idolScope: the scope the player can search at their current camp.
  //            Matches tribeLabel exactly ("A" | "B" | "merged").
  //
  // buildIdolBadgeHTML() and the currentHoldsScope check inside
  // showActionButtons() both re-read live state on every call — the player
  // may find an idol mid-session, which must update the badge and button
  // immediately without a full screen re-render.
  const idolScope = tribeLabel;

  // Badge HTML — shown whenever the player holds at least one idol.
  // Uses a named container so showActionButtons() can refresh it after each
  // action (the player may find an idol mid-session).
  function buildIdolBadgeHTML() {
    const held = getHeldIdols(state, player.id);
    if (held.length === 0) return "";
    const labels = held.map(i => {
      const scopeLabel = i.scope === "merged"
        ? SEASON_CONFIG.mergeTribeName
        : SEASON_CONFIG.tribeNames[i.scope];
      return `<span class="camp-idol-label">You hold a Hidden Immunity Idol <span class="camp-idol-scope">(${scopeLabel})</span></span>`;
    }).join("");
    return `<div class="camp-idol-badge"><span class="camp-idol-icon">◆</span>${labels}</div>`;
  }

  const idolBadgeHTML = buildIdolBadgeHTML();

  // Alliance block — shows the alliances the player is a member of.
  // Re-rendered after each action, like the idol badge: alliances can form
  // (proposeAlliance succeeded) or dissolve (member eliminated) mid-session.
  // Only displays alliances the PLAYER is in — the player can see their own
  // pacts but not those formed silently between AIs (info asymmetry).
  function buildAllianceBlockHTML() {
    const mine = getAlliancesForMember(state, player.id);
    if (mine.length === 0) return "";

    const cards = mine.map(a => {
      const strengthInt = Math.round(a.strength);
      const widthPct    = Math.max(5, strengthInt * 10);
      const tier =
        strengthInt >= 7 ? "tight"   :
        strengthInt >= 4 ? "solid"   :
        "weakened";
      const tierLabel =
        tier === "tight"   ? "Tight"   :
        tier === "solid"   ? "Solid"   :
        "Weakened";

      // Staleness cue: alliance hasn't seen a positive member interaction in
      // 2+ rounds. The player's pact will start to bleed strength. Subtle visual.
      const lastReinforced = a.lastReinforcedRound ?? a.formedRound;
      const staleRounds    = state.round - lastReinforced;
      const isStale        = staleRounds >= 2;
      const staleBadge     = isStale
        ? `<span class="camp-alliance-stale-badge" title="No reinforcing interactions for ${staleRounds} rounds">needs attention</span>`
        : "";

      // Member chips — "You" first, then others by name. Eliminated members
      // are pruned in removeMemberFromAlliances so they won't appear.
      const memberChips = a.memberIds.map(id => {
        if (id === player.id) {
          return `<span class="camp-alliance-chip camp-alliance-chip-you">You</span>`;
        }
        const name = findContestant(state, id)?.name ?? "?";
        return `<span class="camp-alliance-chip">${name}</span>`;
      }).join("");

      return `
        <div class="camp-alliance-card camp-alliance-${tier}${isStale ? " camp-alliance-stale" : ""}">
          <div class="camp-alliance-header">
            <span class="camp-alliance-icon">⚐</span>
            <span class="camp-alliance-name">${a.name}</span>
            ${staleBadge}
            <span class="camp-alliance-strength-num">${strengthInt}/10</span>
          </div>
          <div class="camp-alliance-members">${memberChips}</div>
          <div class="camp-alliance-strength">
            <span class="camp-alliance-bar">
              <span class="camp-alliance-bar-fill" style="width:${widthPct}%"></span>
            </span>
            <span class="camp-alliance-tier">${tierLabel}</span>
          </div>
        </div>
      `;
    }).join("");

    return `<div class="camp-alliance-block">${cards}</div>`;
  }

  const allianceBlockHTML = buildAllianceBlockHTML();

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
        <div class="camp-header-right">
          <div id="actions-counter" class="actions-counter">
            ${actionsLeft} of ${maxActions} actions left
          </div>
          <button class="season-log-btn" id="season-log-btn" title="Season Log">📜 Log</button>
        </div>
      </div>

      <div class="season-log-overlay hidden" id="season-log-overlay">
        <div class="season-log-panel">
          <div class="season-log-header">
            <span class="season-log-title">Season Log</span>
            <button class="season-log-close" id="season-log-close-btn" title="Close">✕</button>
          </div>
          <div class="season-log-list" id="season-log-list"></div>
        </div>
      </div>

      ${episodeOpener}

      <div id="idol-badge-container">${idolBadgeHTML}</div>

      <div id="alliance-block-container">${allianceBlockHTML}</div>

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

  // ── Season Log modal ──────────────────────────────────────────────────────
  // Player-visible event entries only. Refreshed each time the modal opens so
  // a search-then-open shows the latest find right away.
  const logOverlay  = container.querySelector("#season-log-overlay");
  const logListEl   = container.querySelector("#season-log-list");
  const logBtn      = container.querySelector("#season-log-btn");
  const logCloseBtn = container.querySelector("#season-log-close-btn");

  function refreshSeasonLog() {
    const events = getPlayerVisibleEvents(state).slice().reverse();   // newest first
    if (events.length === 0) {
      logListEl.innerHTML =
        `<p class="season-log-empty muted">No events yet — the season is just beginning.</p>`;
      return;
    }
    logListEl.innerHTML = events.map(e => {
      const tag = e.category[0].toUpperCase() + e.category.slice(1);
      return `
        <div class="season-log-entry season-log-entry-${e.category}">
          <div class="season-log-entry-meta">
            <span class="season-log-entry-day">Day ${e.day}</span>
            <span class="season-log-entry-tag">${tag}</span>
          </div>
          <div class="season-log-entry-text">${e.text}</div>
        </div>
      `;
    }).join("");
  }

  logBtn.addEventListener("click", () => {
    refreshSeasonLog();
    logOverlay.classList.remove("hidden");
  });
  logCloseBtn.addEventListener("click", () => {
    logOverlay.classList.add("hidden");
  });
  // Backdrop click closes too — but don't close when clicking inside the panel.
  logOverlay.addEventListener("click", e => {
    if (e.target === logOverlay) logOverlay.classList.add("hidden");
  });

  showActionButtons();

  // ── Render phases ─────────────────────────────────────────────────────────

  function showActionButtons() {
    // Refresh the idol badge — the player may have just found one this action.
    const badgeContainer = container.querySelector("#idol-badge-container");
    if (badgeContainer) badgeContainer.innerHTML = buildIdolBadgeHTML();

    // Refresh the alliance block — proposeAlliance just succeeded, an existing
    // alliance just shifted strength tier, etc.
    const allianceContainer = container.querySelector("#alliance-block-container");
    if (allianceContainer) allianceContainer.innerHTML = buildAllianceBlockHTML();

    // Re-read live idol state for the search button — same reason.
    const currentHoldsScope = getHeldIdols(state, player.id)
      .some(i => i.scope === idolScope);

    actionArea.innerHTML = "";

    if (actionsLeft === 0) {
      actionArea.innerHTML =
        `<p class="muted camp-done-msg">You've used all your actions for today.</p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "action-btn-grid";

    for (const action of CAMP_ACTIONS) {
      // v4.2: skip the idol search action entirely when idols are disabled.
      // No engine call, no UI button — the player never sees this option.
      if (action.id === "searchidol" && SEASON_CONFIG.idolsEnabled === false) continue;

      const btn = document.createElement("button");
      btn.className = "action-btn";

      // The search action is disabled once there is nothing left to find in
      // the current scope. The badge already tells the player they have it,
      // so the detail text just confirms why this option is locked.
      let detailText  = action.detail;
      let unavailable = false;
      if (action.id === "searchidol" && currentHoldsScope) {
        detailText  = "You already hold the idol hidden at this camp.";
        unavailable = true;
      }

      btn.innerHTML = `
        <span class="action-btn-label">${action.label}</span>
        <span class="action-btn-detail">${detailText}</span>
      `;

      if (unavailable) {
        btn.disabled = true;
        btn.classList.add("action-btn-unavail");
      } else {
        btn.addEventListener("click", () => onActionClick(action));
      }

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
