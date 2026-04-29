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
        <div class="saved-setup-summary">${escapeHtml(buildSummary(s.template))}</div>
        <div class="saved-setup-actions">
          <button class="saved-setup-load-btn"   data-id="${escapeHtml(s.id)}">Load</button>
          <button class="saved-setup-delete-btn" data-id="${escapeHtml(s.id)}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Wire per-card buttons after each render — the cards are recreated on
  // every redraw so the listeners need to be re-attached.
  listEl.querySelectorAll(".saved-setup-load-btn").forEach(btn => {
    btn.addEventListener("click", () => handleLoad(btn.dataset.id));
  });
  listEl.querySelectorAll(".saved-setup-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => handleDelete(container, btn.dataset.id));
  });
}

// Builds a one-line summary of the template for display in the saved-setup card.
// Format: "16 cast · 2 tribes (Kaleo, Vanta) · merges at 10 · Final 3"
// Idols flag and swap state are appended when they differ from the default
// expectation, keeping the line scannable for typical configurations.
function buildSummary(t) {
  const tribeNames = t.tribes.initial.map(tr => tr.name).join(", ");
  const parts = [
    `${t.cast.length} cast`,
    `${t.tribes.initial.length} tribes (${tribeNames})`,
    `merges at ${t.merge.triggerCount}`,
    `Final ${t.finalTribal.finalists}`,
  ];
  if (!t.swap?.enabled) parts.push("no swap");
  if (t.idols?.enabled === false) parts.push("idols off");
  return parts.join(" · ");
}

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
  const saveBtn = container.querySelector("#saved-setups-save-btn");
  if (!saveBtn || saveBtn.disabled) return;
  saveBtn.addEventListener("click", () => handleSaveCurrent(container));
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
