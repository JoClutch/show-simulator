// screenSelect.js — home screen: pick your contestant

function renderSelectScreen(container, state) {
  let selected = null;

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
          <button class="select-edit-cast-link" id="edit-cast-link">Edit Cast →</button>
          <button class="select-edit-cast-link" id="edit-rules-link">Edit Rules →</button>
        </p>
        <p class="select-instructions">
          Choose one contestant to play as. You will see the game through their
          eyes for the entire season.
        </p>
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

  card.innerHTML = `
    <div class="card-selected-indicator">▶ Your pick</div>
    <div class="card-tribe-pip" style="background-color: ${tribeColor}"></div>
    <div class="card-name">${escapeHtml(contestant.name)}</div>
    <div class="card-stats">
      <div class="stat-row">
        <span class="stat-label">Challenge</span>
        <span class="stat-value">${contestant.challenge}</span>
      </div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${contestant.challenge * 10}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Social</span>
        <span class="stat-value">${contestant.social}</span>
      </div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${contestant.social * 10}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Strategy</span>
        <span class="stat-value">${contestant.strategy}</span>
      </div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${contestant.strategy * 10}%"></div></div>
    </div>
  `;

  return card;
}
