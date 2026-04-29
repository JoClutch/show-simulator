// screenCastEditor.js — custom cast editor (v4.1)
//
// Reached from the contestant select screen via "Edit Cast →". Lets the user
// add, edit, remove, and reassign contestants before starting a season. On
// save, builds a SeasonTemplate from the active template + working cast,
// validates it, and calls applyTemplate. On cancel, discards changes.
//
// ── Architecture ──────────────────────────────────────────────────────────────
//
// Working state lives in module-scoped variables (the editor is a single
// modal-style screen, not reentrant):
//
//   _workingCast         — array of contestant draft objects being edited.
//                          Mutated by add/edit/remove. Each entry has the
//                          ContestantSchema fields (id, name, stats, tribe,
//                          description). Runtime fields (active, suspicion,
//                          originalTribe) are not stored here.
//
//   _editingContestantId — id of the contestant currently shown in the modal
//                          form, or null if the modal is closed or adding new.
//
// Saves don't mutate state until "Save Cast" is clicked and the resulting
// template passes validation. Cancellation discards _workingCast.
//
// ── Tribe assignment ──────────────────────────────────────────────────────────
//
// A contestant's `tribe` field can be "A", "B", or null (unassigned). Save
// requires either:
//   • all contestants assigned (and per-tribe counts match tribe sizes), OR
//   • all contestants unassigned (the engine will randomize at game start).
// Mixed states are rejected by validateSeasonTemplate.

let _workingCast         = null;
let _editingContestantId = null;

// ── Entry point ──────────────────────────────────────────────────────────────

function renderCastEditorScreen(container, state) {
  // Snapshot the current cast into the working draft. Each entry keeps only
  // schema fields — runtime data stays in CONTESTANTS until Save.
  _workingCast = CONTESTANTS.map(c => ({
    id:          c.id,
    name:        c.name,
    challenge:   c.challenge,
    social:      c.social,
    strategy:    c.strategy,
    tribe:       c.tribe ?? null,
    description: c.description ?? "",
  }));
  _editingContestantId = null;

  drawShell(container);
  drawCastBody(container);
  wireFooter(container);
}

// ── Layout ────────────────────────────────────────────────────────────────────

function drawShell(container) {
  container.innerHTML = `
    <div class="screen cast-editor-screen">
      <p class="screen-eyebrow">Setup</p>
      <h2>Cast Editor</h2>
      <p class="muted cast-editor-blurb">
        Customize the contestants for your season. Stats are 1–10 (whole numbers).
        Each contestant can be pre-assigned to a starting tribe, or left unassigned
        for the engine to randomize.
      </p>

      <div class="cast-editor-errors" id="cast-editor-errors"></div>

      <div class="cast-editor-body" id="cast-editor-body"></div>

      <div class="cast-editor-toolbar">
        <button class="cast-editor-add-btn" id="cast-editor-add-btn">+ Add Contestant</button>
        <button class="cast-editor-reset-btn" id="cast-editor-reset-btn">Reset to Default Cast</button>
      </div>

      <div class="cast-editor-footer">
        <button class="cast-editor-cancel-btn" id="cast-editor-cancel-btn">Cancel</button>
        <button class="cast-editor-save-btn" id="cast-editor-save-btn">Save Cast →</button>
      </div>

      <div class="cast-modal-overlay hidden" id="cast-modal-overlay">
        <div class="cast-modal-panel" id="cast-modal-panel"></div>
      </div>
    </div>
  `;
}

// Repopulates the body's grouped contestant lists. Called on every change so
// reassignments immediately reflect in the right column.
function drawCastBody(container) {
  const body  = container.querySelector("#cast-editor-body");
  const labels = ["A", "B"];   // current code only handles two tribes
  const unassigned = _workingCast.filter(c => c.tribe == null);

  let html = "";

  // Unassigned section appears only when at least one contestant has no tribe.
  if (unassigned.length > 0) {
    html += renderTribeColumn({
      label: null,
      title: "Unassigned",
      color: "var(--text-muted)",
      members: unassigned,
      expectedSize: null,
    });
  }

  for (const label of labels) {
    const tribeMembers = _workingCast.filter(c => c.tribe === label);
    const tribeName    = SEASON_CONFIG.tribeNames[label] ?? label;
    const tribeColor   = SEASON_CONFIG.tribeColors[label] ?? "var(--text-dim)";
    // Each tribe's expected size comes from the active template, falling back
    // to the global SEASON_CONFIG.tribeSize for symmetric default seasons.
    const expectedSize = SEASON_CONFIG.tribeSize;
    html += renderTribeColumn({
      label,
      title: `${escapeHtml(tribeName)} (Tribe ${label})`,
      color: tribeColor,
      members: tribeMembers,
      expectedSize,
    });
  }

  body.innerHTML = html;
  wireRowButtons(container);
}

function renderTribeColumn({ label, title, color, members, expectedSize }) {
  const countText = expectedSize != null
    ? `${members.length} of ${expectedSize}`
    : `${members.length}`;
  const countClass = expectedSize != null && members.length !== expectedSize
    ? "cast-tribe-count cast-tribe-count-warn"
    : "cast-tribe-count";
  const rowsHtml = members.length === 0
    ? `<p class="cast-tribe-empty muted">No contestants here yet.</p>`
    : members.map(c => renderRow(c)).join("");

  return `
    <div class="cast-tribe-col">
      <div class="cast-tribe-header">
        <span class="cast-tribe-name" style="color:${color}">${title}</span>
        <span class="${countClass}">${countText}</span>
      </div>
      <div class="cast-tribe-list">${rowsHtml}</div>
    </div>
  `;
}

function renderRow(c) {
  const desc = c.description
    ? `<div class="cast-row-desc">${escapeHtml(c.description)}</div>`
    : "";
  return `
    <div class="cast-row" data-id="${c.id}">
      <div class="cast-row-main">
        <div class="cast-row-name">${escapeHtml(c.name) || "(unnamed)"}</div>
        <div class="cast-row-stats">
          <span>Chal ${c.challenge}</span>
          <span>Soc ${c.social}</span>
          <span>Str ${c.strategy}</span>
        </div>
        ${desc}
      </div>
      <div class="cast-row-actions">
        <button class="cast-row-edit"   data-id="${c.id}">Edit</button>
        <button class="cast-row-remove" data-id="${c.id}" title="Remove">×</button>
      </div>
    </div>
  `;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function wireFooter(container) {
  container.querySelector("#cast-editor-add-btn").addEventListener("click", () => {
    openModal(container, null);
  });

  container.querySelector("#cast-editor-reset-btn").addEventListener("click", () => {
    if (!confirm("Discard your changes and restore the default cast?")) return;
    // Restore from the bundled default. tribe=null on every entry so the
    // engine randomizes at game start (matching original default behavior).
    _workingCast = BUNDLED_DEFAULT_CAST.map(c => ({
      id:          c.id,
      name:        c.name,
      challenge:   c.challenge,
      social:      c.social,
      strategy:    c.strategy,
      tribe:       null,
      description: c.description ?? "",
    }));
    clearErrors(container);
    drawCastBody(container);
  });

  container.querySelector("#cast-editor-cancel-btn").addEventListener("click", () => {
    onCastEditorDone(false);
  });

  container.querySelector("#cast-editor-save-btn").addEventListener("click", () => {
    handleSave(container);
  });
}

function wireRowButtons(container) {
  container.querySelectorAll(".cast-row-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const c  = _workingCast.find(x => x.id === id);
      if (c) openModal(container, c);
    });
  });

  container.querySelectorAll(".cast-row-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const c  = _workingCast.find(x => x.id === id);
      if (!c) return;
      if (!confirm(`Remove ${c.name || "this contestant"} from the cast?`)) return;
      _workingCast = _workingCast.filter(x => x.id !== id);
      clearErrors(container);
      drawCastBody(container);
    });
  });
}

// ── Save handling ─────────────────────────────────────────────────────────────

function handleSave(container) {
  // Build the candidate template from the active template + working cast.
  // Spreading getActiveTemplate() preserves tribe configuration, swap/merge
  // settings, etc. — the editor only edits the cast portion.
  const baseTemplate = getActiveTemplate() ?? DEFAULT_SEASON_TEMPLATE;
  const candidate = {
    ...baseTemplate,
    cast: _workingCast.map(c => {
      // Strip empty description and null tribe to keep the saved template
      // clean — these fields are optional in the schema.
      const out = {
        id:        c.id,
        name:      c.name,
        challenge: c.challenge,
        social:    c.social,
        strategy:  c.strategy,
      };
      if (c.tribe)            out.tribe       = c.tribe;
      if (c.description)      out.description = c.description;
      return out;
    }),
  };

  const errors = validateSeasonTemplate(candidate);
  if (errors.length > 0) {
    showErrors(container, errors);
    return;
  }

  const ok = applyTemplate(candidate);
  if (!ok) {
    showErrors(container, ["applyTemplate refused the template — see console for details."]);
    return;
  }

  onCastEditorDone(true);
}

function showErrors(container, errors) {
  const el = container.querySelector("#cast-editor-errors");
  el.innerHTML = `
    <div class="cast-editor-errors-header">${errors.length} issue${errors.length !== 1 ? "s" : ""} to fix:</div>
    <ul class="cast-editor-errors-list">
      ${errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
    </ul>
  `;
  // Scroll into view so the user sees the errors immediately
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearErrors(container) {
  container.querySelector("#cast-editor-errors").innerHTML = "";
}

// ── Modal: edit / add contestant ──────────────────────────────────────────────

function openModal(container, contestant) {
  const isNew = contestant === null;
  _editingContestantId = isNew ? null : contestant.id;

  // Defaults for a new contestant — middle stats, empty name, no tribe.
  const draft = isNew ? {
    id:          generateNewId(),
    name:        "",
    challenge:   5,
    social:      5,
    strategy:    5,
    tribe:       null,
    description: "",
  } : { ...contestant };

  const overlay = container.querySelector("#cast-modal-overlay");
  const panel   = container.querySelector("#cast-modal-panel");

  panel.innerHTML = `
    <div class="cast-modal-header">
      <span class="cast-modal-title">${isNew ? "New Contestant" : "Edit Contestant"}</span>
      <button class="cast-modal-close" id="modal-close">✕</button>
    </div>

    <div class="cast-modal-body">
      <div class="cast-form-row">
        <label for="form-name">Name</label>
        <input type="text" id="form-name" maxlength="40" value="${escapeHtmlAttr(draft.name)}" placeholder="Contestant name" />
      </div>

      <div class="cast-form-row">
        <label for="form-tribe">Starting tribe</label>
        <select id="form-tribe">
          <option value=""  ${draft.tribe == null ? "selected" : ""}>Unassigned (random)</option>
          <option value="A" ${draft.tribe === "A" ? "selected" : ""}>${escapeHtml(SEASON_CONFIG.tribeNames.A)} (A)</option>
          <option value="B" ${draft.tribe === "B" ? "selected" : ""}>${escapeHtml(SEASON_CONFIG.tribeNames.B)} (B)</option>
        </select>
      </div>

      <div class="cast-form-stats">
        ${renderStatInput("form-challenge", "Challenge", draft.challenge)}
        ${renderStatInput("form-social",    "Social",    draft.social)}
        ${renderStatInput("form-strategy",  "Strategy",  draft.strategy)}
      </div>

      <div class="cast-form-row">
        <label for="form-description">Description (optional)</label>
        <textarea id="form-description" maxlength="200" rows="2" placeholder="A short bio or hook">${escapeHtml(draft.description)}</textarea>
      </div>

      <div class="cast-form-errors" id="form-errors"></div>
    </div>

    <div class="cast-modal-footer">
      <button class="cast-modal-cancel" id="modal-cancel">Cancel</button>
      <button class="cast-modal-save"   id="modal-save">${isNew ? "Add Contestant" : "Save"}</button>
    </div>
  `;

  overlay.classList.remove("hidden");

  // Wire up form interactions.
  const closeModal = () => {
    overlay.classList.add("hidden");
    _editingContestantId = null;
  };

  panel.querySelector("#modal-close").addEventListener("click", closeModal);
  panel.querySelector("#modal-cancel").addEventListener("click", closeModal);
  // Backdrop click also closes — but only when clicking the overlay itself.
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

  panel.querySelector("#modal-save").addEventListener("click", () => {
    const result = readModalForm(panel);
    const errors = validateContestant(result);
    if (errors.length > 0) {
      panel.querySelector("#form-errors").innerHTML = errors
        .map(e => `<div class="cast-form-error">• ${escapeHtml(e)}</div>`).join("");
      return;
    }
    commitDraft(result, isNew);
    closeModal();
    clearErrors(container);
    drawCastBody(container);
  });
}

function renderStatInput(id, label, value) {
  return `
    <div class="cast-form-stat">
      <label for="${id}">${label}</label>
      <input type="number" id="${id}" min="${STAT_MIN}" max="${STAT_MAX}" step="1" value="${value}" />
    </div>
  `;
}

function readModalForm(panel) {
  const tribeSel = panel.querySelector("#form-tribe").value;
  return {
    id:          _editingContestantId ?? generateNewId(),
    name:        panel.querySelector("#form-name").value.trim(),
    challenge:   clampInt(panel.querySelector("#form-challenge").value),
    social:      clampInt(panel.querySelector("#form-social").value),
    strategy:    clampInt(panel.querySelector("#form-strategy").value),
    tribe:       tribeSel === "" ? null : tribeSel,
    description: panel.querySelector("#form-description").value.trim(),
  };
}

// Inserts (new) or replaces (edit) the draft in _workingCast.
function commitDraft(draft, isNew) {
  if (isNew) {
    _workingCast.push(draft);
  } else {
    const idx = _workingCast.findIndex(c => c.id === draft.id);
    if (idx >= 0) _workingCast[idx] = draft;
    else          _workingCast.push(draft);   // safety: id drifted
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Generates a custom contestant id that doesn't collide with current cast.
function generateNewId() {
  const used = new Set(_workingCast.map(c => c.id));
  let n = _workingCast.length + 1;
  while (used.has(`custom-${n}`)) n++;
  return `custom-${n}`;
}

// Coerces an input value to an integer in [STAT_MIN, STAT_MAX].
// Out-of-range input is clamped; non-numeric falls back to the midpoint (5)
// so the form is never stuck in an unsavable state.
function clampInt(value) {
  let n = parseInt(value, 10);
  if (Number.isNaN(n)) n = Math.round((STAT_MIN + STAT_MAX) / 2);
  return Math.max(STAT_MIN, Math.min(STAT_MAX, n));
}

// escapeHtml lives in src/util.js (loaded earlier). escapeHtmlAttr is kept
// as a local alias for readability at attribute-context call sites.
function escapeHtmlAttr(s) {
  return escapeHtml(s);
}
