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

  // v5.2 submenu navigation state.
  //   null         → top-level: show category cards
  //   "<category>" → drilled in: show actions for that category + Back link
  //
  // Reset to null on each camp phase render (this closure is rebuilt then).
  // Within a single phase, drilling/back/executing all preserve the user's
  // place — after taking an action they stay in the same category so they
  // can immediately pick another, matching the "spend N actions" budget.
  let _currentCategory = null;

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
      return `<span class="camp-idol-label">You hold a Hidden Immunity Idol <span class="camp-idol-scope">(${escapeHtml(scopeLabel)})</span></span>`;
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
            <span class="camp-alliance-name">${escapeHtml(a.name)}</span>
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

  // ── Tribe relationship panel (v5.1) ───────────────────────────────────────
  //
  // Replaces the old chip row with a structured list showing the player's
  // current standing with each tribemate. Each row has a colored dot (visual
  // tier), the name, and a short text label. The raw numeric score is
  // available via the row's `title` tooltip but never the primary display —
  // the goal is a readable social dashboard, not a debug dump.
  //
  // Tier boundaries align with engine landmarks already in use:
  //   • rel ≥ 15  triggers bondProtection +20 in voting     → "Tight"
  //   • rel ≥ 8   triggers bondProtection +8                → folded into "Good"
  //   • rel ≥ 10  qualifies a pair for AI alliance auto-form
  //   • rel ≤ -3  is the existing "enemy" threshold for AI danger reads
  //
  // v5.9: relabeled to a five-tier Survivor-flavored scale —
  //   Tight / Good / Neutral / Shaky / Bad. Same underlying score, cleaner
  //   bucket names. The numeric rel and trust values are still shown in
  //   the tooltip for players who want to dig in.
  //
  // Refreshed live in showActionButtons() so labels move as actions land.

  function getRelationshipTier(rel) {
    if (rel >=  15) return { id: "tight",   label: "Tight"   };
    if (rel >=   5) return { id: "good",    label: "Good"    };
    if (rel >=  -4) return { id: "neutral", label: "Neutral" };
    if (rel >= -14) return { id: "shaky",   label: "Shaky"   };
    return                  { id: "bad",     label: "Bad"     };
  }

  // v5.9: trust is a separate dimension from relationship — it tracks how
  // much the target would actually back the player up, vs. just liking them.
  // We surface a small "✦" marker next to names where trust is high so the
  // player can read at a glance who's a real ally vs. a friendly acquaintance.
  function getTrustMarker(trust) {
    if (trust >=  6) return { id: "trusted",   symbol: "✦", title: "Trusts you"           };
    if (trust <= -3) return { id: "distrusted", symbol: "⚠", title: "Doesn't trust you" };
    return null;
  }

  function buildTribePanelHTML() {
    // Locale-aware alphabetical sort. Handles unicode names cleanly (accented
    // characters, mixed case, etc.). The player is rendered first as a self-
    // row, separate from the sort.
    const sorted = [...tribemates].sort((a, b) => a.name.localeCompare(b.name));
    const total  = sorted.length + 1;   // tribemates + the player

    const playerRow = `
      <li class="camp-tribe-row camp-tribe-row-self">
        <span class="camp-tribe-self-icon" aria-hidden="true">★</span>
        <span class="camp-tribe-name">You (${escapeHtml(player.name)})</span>
      </li>
    `;

    const tribemateRows = sorted.map(c => {
      const rel    = getRelationship(state, player.id, c.id);
      const trust  = getTrust(state, player.id, c.id);
      const tier   = getRelationshipTier(rel);
      const marker = getTrustMarker(trust);

      // Numeric values stay in the tooltip — readable on hover without
      // cluttering the panel. Trust line included so the marker isn't
      // mysterious when present.
      const tooltipParts = [`Relationship: ${rel.toFixed(0)}`, `Trust: ${trust.toFixed(0)}`];
      if (marker) tooltipParts.push(marker.title);
      const tooltip = tooltipParts.join(" · ");

      const markerHTML = marker
        ? `<span class="camp-tribe-trust-marker" data-trust="${marker.id}" aria-hidden="true">${marker.symbol}</span>`
        : "";

      return `
        <li class="camp-tribe-row" data-tier="${tier.id}" title="${escapeHtmlAttr(tooltip)}">
          <span class="camp-tribe-dot" aria-hidden="true"></span>
          <span class="camp-tribe-name">${escapeHtml(c.name)}${markerHTML}</span>
          <span class="camp-tribe-tier-label">${tier.label}</span>
        </li>
      `;
    }).join("");

    return `
      <div class="camp-tribe-panel-header">
        <span class="camp-tribe-panel-title">Your Tribe</span>
        <span class="camp-tribe-panel-count">${total} member${total !== 1 ? "s" : ""}</span>
      </div>
      <ul class="camp-tribe-list">
        ${playerRow}
        ${tribemateRows}
      </ul>
    `;
  }

  // Local attribute-context escape helper — same impl as in setup screens.
  // Used by buildTribePanelHTML for the title tooltip text.
  function escapeHtmlAttr(s) {
    return escapeHtml(s);
  }

  // ── End-of-camp target list (v5.7) ───────────────────────────────────────
  //
  // Renders only during camp phase 2 when the player is going to tribal:
  //   • Pre-merge: their tribe must be the losing tribe (the one voting tonight)
  //   • Post-merge: always (every player attends every tribal)
  //
  // Top 3 ranked by aggregate vote pressure (getTopVoteTargets), then sorted
  // alphabetically for display so the ranking determines WHO is on the list
  // but not who's #1 — keeping it a read, not a spoiler.
  //
  // The immunity holder is filtered out by getTopVoteTargets directly, so
  // post-merge with a winning challenge result the panel shows the three
  // most-targeted vulnerable players.
  //
  // Refreshed inside showActionButtons so the picture updates live as the
  // player takes camp actions (lobby/talk/etc.) that shift the dynamics.
  function buildTargetListHTML() {
    if (state.campPhase !== 2) return "";

    // Pre-merge: only show when the player is heading to tribal.
    if (!state.merged && getPlayerTribeLabel() !== state.tribalTribe) return "";

    const attendees = state.merged
      ? state.tribes.merged
      : state.tribes[state.tribalTribe];
    if (!attendees || attendees.length < 2) return "";

    const top = getTopVoteTargets(state, attendees, 3);
    if (top.length === 0) return "";

    // Sort the displayed list alphabetically — the RANK determines membership,
    // alphabetical order doesn't reveal who's most in danger.
    const sorted = [...top].sort((a, b) =>
      a.contestant.name.localeCompare(b.contestant.name)
    );

    const playerInDanger = sorted.some(t => t.contestant.id === player.id);

    const rows = sorted.map(t => {
      const c = t.contestant;
      const isYou = c.id === player.id;
      return `
        <li class="target-row${isYou ? " target-row-you" : ""}">
          <span class="target-row-dot" aria-hidden="true">●</span>
          <span class="target-row-name">${escapeHtml(c.name)}${isYou ? " (you)" : ""}</span>
        </li>
      `;
    }).join("");

    const headline = playerInDanger
      ? "You're on the list. Tonight could be the night."
      : "These three are drawing the most heat.";

    return `
      <div class="target-list-panel${playerInDanger ? " target-list-panel-danger" : ""}">
        <div class="target-list-header">
          <span class="target-list-title">Going Into Tribal</span>
        </div>
        <div class="target-list-subtitle">${escapeHtml(headline)}</div>
        <ul class="target-list">${rows}</ul>
        <div class="target-list-footer">
          A read on tribe pressure. Not a guarantee — votes can shift before they're cast.
        </div>
      </div>
    `;
  }

  const targetListHTML = buildTargetListHTML();

  // ── Shell ─────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="screen" id="camp-screen">

      <div class="camp-header">
        <div class="camp-heading-block">
          <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + (isPhase2 ? DAY_OFFSETS.campPhase2 : DAY_OFFSETS.campPhase1)}</p>
          <h2>${phaseLabel}</h2>
          <span class="camp-tribe-tag" style="color:${tribeColor}">${escapeHtml(tribeName)} tribe</span>
          <span class="camp-step-note">${stepNote}</span>
        </div>
        <div class="camp-header-right">
          <div id="actions-counter" class="actions-counter" data-state="${actionsLeft >= 3 ? 'fresh' : actionsLeft === 2 ? 'mid' : actionsLeft === 1 ? 'low' : 'empty'}">
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

      <!-- v5.1: tribe relationship panel — populated by buildTribePanelHTML.
           Replaces the v5.0 placeholder and the old camp-tribemates chip row.
           Refreshed live in showActionButtons after each camp action so tier
           labels move as relationships change. -->
      <div id="camp-relationship-panel" class="camp-relationship-panel">
        ${buildTribePanelHTML()}
      </div>

      <!-- v5.7: end-of-camp target list — visible only during camp phase 2
           when the player is going to tribal. Populated by buildTargetListHTML
           and refreshed live in showActionButtons so lobby/talk landings
           shift the picture in real time. Empty (renders nothing) during
           phase 1 or when the player isn't going to tribal. -->
      <div id="target-list-container">${targetListHTML}</div>

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
          <div class="season-log-entry-text">${escapeHtml(e.text)}</div>
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

    // v5.1: refresh the tribe relationship panel. Talk/confide/strategy/etc.
    // adjust relationships, so the tier labels need to follow.
    const tribePanel = container.querySelector("#camp-relationship-panel");
    if (tribePanel) tribePanel.innerHTML = buildTribePanelHTML();

    // v5.7: refresh the target list. Lobby/Push-a-vote can shift suspicion;
    // talk/confide can shift rel/trust; both move the pressure ranking.
    const targetListContainer = container.querySelector("#target-list-container");
    if (targetListContainer) targetListContainer.innerHTML = buildTargetListHTML();

    // Re-read live idol state for the search button — same reason.
    const currentHoldsScope = getHeldIdols(state, player.id)
      .some(i => i.scope === idolScope);

    actionArea.innerHTML = "";

    if (actionsLeft === 0) {
      actionArea.innerHTML =
        `<p class="muted camp-done-msg">You've used all your actions for today.</p>`;
      return;
    }

    // v5.2: two-step submenu navigation.
    //   _currentCategory === null  → top-level category picker
    //   _currentCategory === "id"  → action list for that category + Back
    if (_currentCategory === null) {
      renderCategoryPicker(currentHoldsScope);
    } else {
      renderActionsInCategory(_currentCategory, currentHoldsScope);
    }
  }

  // Renders the top-level category picker — three cards (Social, Strategy,
  // Island), each labeled with the count of currently-available actions.
  //
  // Categories with zero available actions are skipped. This keeps the
  // picker tidy when, e.g. the idol system is disabled and Island shrinks
  // to one action — but if all of Island's actions are unavailable for
  // some reason, the card disappears entirely rather than dead-ending.
  function renderCategoryPicker(currentHoldsScope) {
    const grid = document.createElement("div");
    grid.className = "category-picker-grid";

    for (const category of CAMP_ACTION_CATEGORIES) {
      const actions = actionsForCategory(category.id);
      if (actions.length === 0) continue;

      const card = document.createElement("button");
      card.className = "category-card";
      card.innerHTML = `
        <div class="category-card-row">
          <span class="category-card-label">${category.label}</span>
          <span class="category-card-count">
            ${actions.length} action${actions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div class="category-card-desc">${category.description}</div>
        <span class="category-card-arrow" aria-hidden="true">→</span>
      `;
      card.addEventListener("click", () => {
        _currentCategory = category.id;
        showActionButtons();
      });
      grid.appendChild(card);
    }

    actionArea.appendChild(grid);
  }

  // Renders the action list inside a specific category. Includes a Back
  // link at the top that returns to the category picker. Reuses the
  // existing buildActionButton for each action, so per-action gating
  // (search disabled when idol already held, etc.) is preserved.
  function renderActionsInCategory(categoryId, currentHoldsScope) {
    const category = CAMP_ACTION_CATEGORIES.find(c => c.id === categoryId);

    // Defensive: if state.swapped or some external change invalidated the
    // category id, fall back to the picker rather than render nothing.
    if (!category) {
      _currentCategory = null;
      renderCategoryPicker(currentHoldsScope);
      return;
    }

    // Back link
    const back = document.createElement("button");
    back.className = "action-back-btn";
    back.textContent = "← Back to categories";
    back.addEventListener("click", () => {
      _currentCategory = null;
      showActionButtons();
    });
    actionArea.appendChild(back);

    // Category title + description, so the user knows where they are.
    const title = document.createElement("div");
    title.className = "category-section-title";
    title.innerHTML = `
      <span class="category-section-label">${category.label}</span>
      <span class="category-section-desc">${category.description}</span>
    `;
    actionArea.appendChild(title);

    // Action grid for this category.
    const actions = actionsForCategory(category.id);
    const grid    = document.createElement("div");
    grid.className = "action-btn-grid";
    for (const action of actions) {
      grid.appendChild(buildActionButton(action, currentHoldsScope));
    }
    actionArea.appendChild(grid);
  }

  // Helper: returns the actions in a given category that should currently
  // render (some are gated by season config — e.g. searchidol when idols are
  // disabled). Used both by the picker (for counts) and the in-category view.
  function actionsForCategory(categoryId) {
    return CAMP_ACTIONS
      .filter(a => a.category === categoryId)
      .filter(a => actionShouldRender(a));
  }

  // Returns false for actions that should be hidden entirely from this run
  // (e.g. idol search when the idol system is disabled in season config).
  // Disabling-but-visible cases (idol already held) are handled in
  // buildActionButton by setting the `unavailable` flag — those still render.
  function actionShouldRender(action) {
    if (action.id === "searchidol" && SEASON_CONFIG.idolsEnabled === false) return false;
    return true;
  }

  // Builds a single action button. Extracted from showActionButtons so
  // category sections share the per-button logic and future v5.x submenu
  // variants can reuse it without duplicating click wiring.
  function buildActionButton(action, currentHoldsScope) {
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

    return btn;
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
    counter.dataset.state =
      actionsLeft >= 3 ? "fresh" :
      actionsLeft === 2 ? "mid" :
      actionsLeft === 1 ? "low" : "empty";
    showActionButtons();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function appendFeedback(action, target, text) {
    const tag   = target ? `${action.label} · ${escapeHtml(target.name)}` : action.label;
    const entry = document.createElement("div");
    entry.className = "feedback-entry";
    entry.innerHTML = `
      <span class="feedback-action-tag">${tag}</span>
      <span class="feedback-text">${escapeHtml(text)}</span>
    `;
    feedbackLog.insertBefore(entry, feedbackLog.firstChild);
  }
}
