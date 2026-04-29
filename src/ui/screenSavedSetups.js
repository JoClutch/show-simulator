// screenSavedSetups.js — save/load custom seasons (v4.4)
//
// Reached from the contestant select screen via "Saved Setups →". Lets the
// user persist the active template under a label, and later reload any
// previously saved setup. Storage is browser-local (localStorage) — see
// data/savedSetups.js for the persistence layer.
//
// ── Flow ─────────────────────────────────────────────────────────────────────
//
// Save: read getActiveTemplate() → prompt for a name → saveSetup() → re-render
//       list. The active runtime stays untouched — saving is read-only with
//       respect to gameState.
//
// Load: validate the stored template → applyTemplate() → onSavedSetupsDone(true)
//       which rebuilds gameState exactly like the cast/rules editors do.
//       Routed only from the select screen, so no game is ever in progress
//       at load time and corruption isn't possible.
//
// Delete: confirm() → deleteSetup() → re-render list. No template/state effects.

function renderSavedSetupsScreen(container, state) {
  drawShell(container);
  drawList(container);
  wireToolbar(container);
  wireFooter(container);
}

// ── Layout ────────────────────────────────────────────────────────────────────

function drawShell(container) {
  const storageOk = isStorageAvailable();

  container.innerHTML = `
    <div class="screen saved-setups-screen">
      <p class="screen-eyebrow">Setup</p>
      <h2>Saved Setups</h2>
      <p class="muted saved-setups-blurb">
        Save custom seasons (cast + rules) to reload later. Setups are stored
        only in this browser — they don't sync between devices.
      </p>

      ${!storageOk ? `
        <div class="saved-setups-warning">
          Browser storage isn't available in this environment.
          Save and load are disabled. (Try a normal browser window.)
        </div>
      ` : ""}

      <div class="saved-setups-toolbar">
        <button class="saved-setups-save-btn" id="saved-setups-save-btn"
                ${!storageOk ? "disabled" : ""}>
          + Save Current Setup
        </button>
        <button class="saved-setups-import-btn" id="saved-setups-import-btn"
                ${!storageOk ? "disabled" : ""}>
          Import from File →
        </button>
      </div>

      <div id="saved-setups-list" class="saved-setups-list"></div>

      <div class="saved-setups-footer">
        <button class="saved-setups-back-btn" id="saved-setups-back-btn">← Back</button>
      </div>
    </div>
  `;
}

// Renders (or re-renders) the saved-setups card list. Called on initial draw
// and after every save/delete.
function drawList(container) {
  const listEl = container.querySelector("#saved-setups-list");
  const setups = listSavedSetups();

  if (setups.length === 0) {
    listEl.innerHTML = `
      <p class="saved-setups-empty muted">
        No saved setups yet. Customize your cast or rules, then save the result here.
      </p>
    `;
    return;
  }

  listEl.innerHTML = setups.map(s => {
    return `
      <div class="saved-setup-card" data-id="${escapeHtml(s.id)}">
        <div class="saved-setup-name">${escapeHtml(s.setupName)}</div>
        <div class="saved-setup-meta">
          <span class="saved-setup-date">Saved ${formatSavedDate(s.savedAt)}</span>
        </div>
        <div class="saved-setup-summary">${escapeHtml(buildTemplateSummary(s.template))}</div>
        <div class="saved-setup-actions">
          <button class="saved-setup-load-btn"     data-id="${escapeHtml(s.id)}">Load</button>
          <button class="saved-setup-download-btn" data-id="${escapeHtml(s.id)}">Download</button>
          <button class="saved-setup-delete-btn"   data-id="${escapeHtml(s.id)}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Wire per-card buttons after each render — the cards are recreated on
  // every redraw so the listeners need to be re-attached.
  listEl.querySelectorAll(".saved-setup-load-btn").forEach(btn => {
    btn.addEventListener("click", () => handleLoad(btn.dataset.id));
  });
  listEl.querySelectorAll(".saved-setup-download-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDownload(btn.dataset.id));
  });
  listEl.querySelectorAll(".saved-setup-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDelete(container, btn.dataset.id));
  });
}

// v4.8: summary now uses the shared buildTemplateSummary in seasonPresets.js
// so the saved-setup card reads the same shorthand as the Active Setup panel
// and the rules editor preview.

// Friendly date formatting using the browser's locale.
function formatSavedDate(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch (_) {
    return iso;
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function wireToolbar(container) {
  const saveBtn   = container.querySelector("#saved-setups-save-btn");
  const importBtn = container.querySelector("#saved-setups-import-btn");

  if (saveBtn && !saveBtn.disabled) {
    saveBtn.addEventListener("click", () => handleSaveCurrent(container));
  }
  if (importBtn && !importBtn.disabled) {
    importBtn.addEventListener("click", () => handleImport(container));
  }
}

function wireFooter(container) {
  container.querySelector("#saved-setups-back-btn")
    .addEventListener("click", () => onSavedSetupsDone(false));
}

// Save the active template after prompting the user for a label.
// Defaults to template.meta.name. Cancel aborts.
function handleSaveCurrent(container) {
  const active = getActiveTemplate() ?? DEFAULT_SEASON_TEMPLATE;

  const defaultName = active.meta?.name ?? "Untitled";
  const userInput   = window.prompt("Save current setup as:", defaultName);
  if (userInput === null) return;   // user cancelled

  const result = saveSetup(active, userInput);
  if (!result.ok) {
    alert(`Could not save:\n• ${result.errors.join("\n• ")}`);
    return;
  }
  drawList(container);
}

// Load the selected setup. Validates, applies, and routes back to select
// (which rebuilds gameState).
function handleLoad(id) {
  const setup = loadSetup(id);
  if (!setup) {
    alert("That saved setup is no longer available.");
    return;
  }

  // Defensive validation — listSavedSetups already filters invalid entries
  // but we re-check here in case a setup was tampered with between list and
  // load (e.g. user editing localStorage in DevTools mid-session).
  const errors = validateSeasonTemplate(setup.template);
  if (errors.length > 0) {
    alert(`Saved setup is no longer valid:\n• ${errors.join("\n• ")}`);
    return;
  }

  if (!confirm(`Load "${setup.setupName}"? Any unsaved customization will be replaced.`)) {
    return;
  }

  const ok = applyTemplate(setup.template);
  if (!ok) {
    alert("Loading failed — see console for details. Active config unchanged.");
    return;
  }

  onSavedSetupsDone(true);
}

// Delete with confirmation, then re-render.
function handleDelete(container, id) {
  const setup = loadSetup(id);
  const label = setup?.setupName ?? "this setup";
  if (!confirm(`Delete "${label}" permanently?`)) return;
  const ok = deleteSetup(id);
  if (!ok) {
    alert("Could not delete that setup.");
    return;
  }
  drawList(container);
}

// v4.5: download a saved setup as a JSON file.
// The file is shareable / portable — anyone with the file can re-import it
// in another browser via the Import button.
function handleDownload(id) {
  const setup = loadSetup(id);
  if (!setup) {
    alert("That saved setup is no longer available.");
    return;
  }
  downloadSavedSetup(setup);
}

// v4.5: import a JSON file as a new saved setup.
// Validates first via parseSavedSetupJson; on success appends to localStorage
// (with a freshly-generated id to avoid collisions). Imported setups land in
// the saves list — the user clicks Load on the resulting card to actually
// apply the template. This keeps import a pure backup-restore action;
// runtime state is never touched on import.
function handleImport(container) {
  pickAndImportSetup(result => {
    if (!result.ok) {
      alert(`Import failed:\n• ${result.errors.join("\n• ")}`);
      return;
    }
    const stored = appendImportedSetup(result.setup);
    if (!stored.ok) {
      alert(`Could not save imported setup:\n• ${stored.errors.join("\n• ")}`);
      return;
    }
    drawList(container);
    // Friendly confirmation — the new card is at the top of the list, but a
    // small toast-like alert helps confirm the import landed.
    alert(`Imported "${stored.setup.setupName}" — find it in the list to load.`);
  });
}
