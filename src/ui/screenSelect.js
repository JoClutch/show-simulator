// screenSelect.js — home screen: pick your contestant

function renderSelectScreen(container, state) {
  let selected = null;

  // ── Active Setup summary (v4.8) ────────────────────────────────────────────
  // Built from the active template — gives the user a clear one-glance answer
  // to "what season am I about to start?" right above the contestant pick.
  const activeTemplate = getActiveTemplate();
  const activeName     = activeTemplate?.meta?.name ?? SEASON_CONFIG.name;
  const activeDesc     = activeTemplate?.meta?.description ?? "";
  const activeSummary  = buildTemplateSummary(activeTemplate);

  // ── Shell ────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="screen" id="select-screen">
      <div class="select-header">
        <h1>Survivor Simulator</h1>
        <p class="select-subtitle">
          ${escapeHtml(SEASON_CONFIG.name)}
          &nbsp;·&nbsp; ${CONTESTANTS.length} contestants
          &nbsp;·&nbsp; ${SEASON_CONFIG.tribesCount} tribes
        </p>
        <p class="select-setup-links">
          <button class="select-edit-cast-link" id="back-to-seasons-link" title="Pick a different season">← Back to Seasons</button>
          <button class="select-edit-cast-link" id="choose-template-link">Choose Template →</button>
          <button class="select-edit-cast-link" id="edit-cast-link">Edit Cast →</button>
          <button class="select-edit-cast-link" id="edit-rules-link">Edit Rules →</button>
          <button class="select-edit-cast-link" id="saved-setups-link">Saved Setups →</button>
        </p>
        <p class="select-instructions">
          Choose one contestant to play as. You will see the game through their
          eyes for the entire season.
        </p>
      </div>

      <div class="select-active-setup">
        <div class="select-active-setup-header">
          <span class="select-active-setup-label">Starting season:</span>
          <span class="select-active-setup-name">${escapeHtml(activeName)}</span>
        </div>
        ${activeDesc ? `
          <div class="select-active-setup-desc">${escapeHtml(activeDesc)}</div>
        ` : ""}
        <div class="select-active-setup-rules">${escapeHtml(activeSummary)}</div>
      </div>

      <div id="tribe-a-section" class="tribe-section"></div>
      <div id="tribe-b-section" class="tribe-section"></div>

      <div id="selection-preview" class="selection-preview hidden">
        <div>
          <span class="preview-label">Playing as</span>
          <span id="preview-name" class="preview-name"></span>
          <span id="preview-tribe" class="preview-tribe-tag"></span>
        </div>
        <button id="start-btn">Start Game</button>
      </div>

      <div id="no-selection-hint" class="no-selection-hint">
        Select a contestant above to begin.
      </div>
    </div>
  `;

  // ── Build tribe sections ──────────────────────────────────────────────────

  buildTribeSection(
    container.querySelector("#tribe-a-section"),
    "A",
    state.tribes.A,
    onCardClick
  );

  buildTribeSection(
    container.querySelector("#tribe-b-section"),
    "B",
    state.tribes.B,
    onCardClick
  );

  // ── Card click handler ────────────────────────────────────────────────────

  function onCardClick(contestant, clickedCard) {
    // Deselect all cards
    container.querySelectorAll(".contestant-card").forEach(el => {
      el.classList.remove("selected");
    });

    // Select this card
    clickedCard.classList.add("selected");
    selected = contestant;

    // Update preview bar
    const preview    = container.querySelector("#selection-preview");
    const nameEl     = container.querySelector("#preview-name");
    const tribeEl    = container.querySelector("#preview-tribe");
    const hint       = container.querySelector("#no-selection-hint");
    const tribeColor = SEASON_CONFIG.tribeColors[contestant.tribe];
    const tribeName  = SEASON_CONFIG.tribeNames[contestant.tribe];

    nameEl.textContent  = contestant.name;
    tribeEl.textContent = tribeName;
    tribeEl.style.color = tribeColor;

    preview.classList.remove("hidden");
    hint.classList.add("hidden");
  }

  // ── Start button ─────────────────────────────────────────────────────────

  // The button is inside #selection-preview, which only appears after a pick,
  // so no need for a disabled state — the button is simply not visible yet.
  container.querySelector("#start-btn").addEventListener("click", () => {
    if (selected) onContestantSelected(selected);
  });

  // v10.3: "Back to Seasons" — change your mind before committing to a
  // contestant. Routes back to the show page (which renders the season
  // grid for whichever show was last selected). The cast pick screen is
  // the natural cut-off because once a contestant is chosen, the player
  // is committed to playing the season; mid-game we don't expose this.
  container.querySelector("#back-to-seasons-link").addEventListener("click", () => {
    showScreen("showSeasons");
  });

  // ── Edit Cast entry point ─────────────────────────────────────────────────
  // Routes to the cast editor screen. The editor returns to this screen when
  // saved (with the cast applied) or cancelled (with no changes).
  container.querySelector("#edit-cast-link").addEventListener("click", () => {
    showScreen("castEditor");
  });

  // ── Edit Rules entry point ────────────────────────────────────────────────
  // Routes to the rules/configuration screen. Like the cast editor, returns
  // to select on save (rules applied) or cancel (no changes).
  container.querySelector("#edit-rules-link").addEventListener("click", () => {
    showScreen("rulesEditor");
  });

  // ── Saved Setups entry point (v4.4) ───────────────────────────────────────
  // Routes to the save/load manager. Returns to select after either Back
  // (no changes) or Load (template applied + gameState rebuilt).
  container.querySelector("#saved-setups-link").addEventListener("click", () => {
    showScreen("savedSetups");
  });

  // ── Choose Template entry point (v4.6) ────────────────────────────────────
  // Routes to the built-in template picker. Returns to select after either
  // Back (no change) or Use (template applied + gameState rebuilt).
  container.querySelector("#choose-template-link").addEventListener("click", () => {
    showScreen("templates");
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTribeSection(sectionEl, tribeLabel, members, onCardClick) {
  const tribeName  = SEASON_CONFIG.tribeNames[tribeLabel];
  const tribeColor = SEASON_CONFIG.tribeColors[tribeLabel];

  const header = document.createElement("div");
  header.className = "tribe-header";
  header.style.borderColor = tribeColor;
  header.innerHTML = `
    <span class="tribe-header-name" style="color: ${tribeColor}">${escapeHtml(tribeName)}</span>
    <span class="tribe-header-count">${members.length} members</span>
  `;
  sectionEl.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "contestant-grid";
  sectionEl.appendChild(grid);

  for (const contestant of members) {
    const card = buildCard(contestant, tribeColor);
    card.addEventListener("click", () => onCardClick(contestant, card));
    grid.appendChild(card);
  }
}

function buildCard(contestant, tribeColor) {
  const card = document.createElement("div");
  card.className = "contestant-card";
  card.dataset.id = contestant.id;

  // v9.11: portrait above the name on each cast card. Uses the same md
  // stacked treatment as the Tribal Council vote-target cards so cast
  // selection reads as the same visual family. Tinted by originalTribe
  // color via the portrait component's default; falls back to a neutral
  // dark surface if originalTribe isn't set yet at this point.
  card.innerHTML = `
    <div class="card-selected-indicator">▶ Your pick</div>
    <div class="card-tribe-pip" style="background-color: ${tribeColor}"></div>
    ${renderPlayerPortrait(contestant, { size: "large", extraClass: "player-portrait--stacked" })}
    <div class="card-name">${escapeHtml(contestant.name)}</div>
    ${renderContestantStatsHTML(contestant)}
  `;

  return card;
}
