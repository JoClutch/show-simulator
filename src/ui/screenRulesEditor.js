// screenRulesEditor.js — season rules / configuration editor (v4.2)
//
// Lets the user configure the high-level rules of a season before starting.
// Reached from the contestant select screen via "Edit Rules →". Builds a
// candidate SeasonTemplate from the active template, lets the user edit
// scalar settings, validates, and applies on Save.
//
// Settings exposed (all directly map to SeasonTemplate fields):
//   • Tribe names, colors, sizes (count locked at 2 for current architecture)
//   • Tribe swap on/off + trigger count
//   • Merge trigger + merged tribe name/color
//   • Jury start (at merge / custom point + count)
//   • Final Tribal Council finalists count (2–5)
//   • Idol system on/off
//   • Camp actions per round
//
// Cast is NOT edited here — that's the cast editor's job. The cast count is
// shown for context. To change cast, return to select and use "Edit Cast →".
//
// ── Architecture ──────────────────────────────────────────────────────────────
//
// _workingTemplate is a deep clone of the active template. Edits write into
// it directly. On Save: validate via validateSeasonTemplate; if clean, call
// applyTemplate; main.js then rebuilds gameState. On Cancel: discard.
//
// Conditional rows (swap trigger when swap on; jury custom count when "custom")
// toggle visibility via a single helper that re-runs after every input change.

let _workingTemplate = null;

// ── Entry point ──────────────────────────────────────────────────────────────

function renderRulesEditorScreen(container, state) {
  // Deep clone the current active template. JSON round-trip is fine because
  // SeasonTemplate is structured data with no functions or circular refs —
  // the cast array is plain objects.
  const base = getActiveTemplate() ?? DEFAULT_SEASON_TEMPLATE;
  _workingTemplate = JSON.parse(JSON.stringify(base));

  drawShell(container);
  populateInputs(container);
  wireInputs(container);
  wireFooter(container);
  refreshConditionalRows(container);
}

// ── Layout ────────────────────────────────────────────────────────────────────

function drawShell(container) {
  container.innerHTML = `
    <div class="screen rules-editor-screen">
      <p class="screen-eyebrow">Setup</p>
      <h2>Season Rules</h2>
      <p class="muted rules-editor-blurb">
        Configure how your season will play. Cast is managed separately
        — return to the select screen and use Edit Cast to change contestants.
      </p>

      <div class="rules-editor-errors" id="rules-editor-errors"></div>

      <!-- Cast (info only) -->
      <div class="rules-section">
        <h3 class="rules-section-title">Cast</h3>
        <p class="rules-section-info" id="rules-cast-info"></p>
      </div>

      <!-- Tribes -->
      <div class="rules-section">
        <h3 class="rules-section-title">Starting Tribes</h3>
        <p class="rules-section-info muted">
          Number of tribes: <strong>2</strong> &nbsp;
          <span class="rules-future-note">(more tribes in a future version)</span>
        </p>
        <div class="rules-tribe-grid" id="rules-tribe-grid"></div>
      </div>

      <!-- Tribe Swap -->
      <div class="rules-section">
        <h3 class="rules-section-title">Tribe Swap</h3>
        <label class="rules-checkbox-row">
          <input type="checkbox" id="swap-enabled" />
          <span>Enable mid-game tribe swap</span>
        </label>
        <div class="rules-row" id="row-swap-trigger">
          <label for="swap-trigger">Swap fires when</label>
          <input type="number" id="swap-trigger" min="2" max="50" step="1" />
          <span class="muted">players remain</span>
        </div>
      </div>

      <!-- Merge -->
      <div class="rules-section">
        <h3 class="rules-section-title">Merge</h3>
        <div class="rules-row">
          <label for="merge-trigger">Merges when</label>
          <input type="number" id="merge-trigger" min="2" max="50" step="1" />
          <span class="muted">players remain</span>
        </div>
        <div class="rules-row">
          <label for="merge-name">Merged tribe name</label>
          <input type="text" id="merge-name" maxlength="20" />
        </div>
        <div class="rules-row">
          <label for="merge-color">Merged tribe color</label>
          <input type="color" id="merge-color" />
        </div>
      </div>

      <!-- Jury -->
      <div class="rules-section">
        <h3 class="rules-section-title">Jury</h3>
        <div class="rules-row">
          <label for="jury-trigger">Jury starts</label>
          <select id="jury-trigger">
            <option value="atMerge">At merge</option>
            <option value="custom">Custom player count</option>
          </select>
        </div>
        <div class="rules-row" id="row-jury-custom">
          <label for="jury-custom-count">Jury begins when</label>
          <input type="number" id="jury-custom-count" min="2" max="50" step="1" />
          <span class="muted">players remain</span>
        </div>
      </div>

      <!-- Endgame -->
      <div class="rules-section">
        <h3 class="rules-section-title">Endgame</h3>
        <div class="rules-row">
          <label for="finalists">Final Tribal Council</label>
          <select id="finalists">
            <option value="2">Final 2</option>
            <option value="3">Final 3</option>
            <option value="4">Final 4</option>
            <option value="5">Final 5</option>
          </select>
        </div>
      </div>

      <!-- Advanced mechanics -->
      <div class="rules-section">
        <h3 class="rules-section-title">Advanced Mechanics</h3>
        <label class="rules-checkbox-row">
          <input type="checkbox" id="idols-enabled" />
          <span>Hidden Immunity Idols</span>
          <span class="muted rules-checkbox-hint">— search, find, and play idols at tribal</span>
        </label>
      </div>

      <!-- Pacing -->
      <div class="rules-section">
        <h3 class="rules-section-title">Pacing</h3>
        <div class="rules-row">
          <label for="camp-actions">Camp actions per round</label>
          <input type="number" id="camp-actions" min="1" max="10" step="1" />
        </div>
      </div>

      <div class="rules-editor-footer">
        <button class="rules-cancel-btn" id="rules-cancel-btn">Cancel</button>
        <button class="rules-reset-btn"  id="rules-reset-btn">Reset to Defaults</button>
        <button class="rules-save-btn"   id="rules-save-btn">Save Rules →</button>
      </div>
    </div>
  `;
}

// ── Read working template → fill inputs ──────────────────────────────────────

function populateInputs(container) {
  const t = _workingTemplate;
  const $ = sel => container.querySelector(sel);

  // Cast info — count + helpful note
  $("#rules-cast-info").innerHTML = `
    <strong>${t.cast.length}</strong> contestants
    <span class="muted">— change in the cast editor.</span>
  `;

  // Tribes — render dynamically (the inner inputs are wired in wireInputs)
  const grid = $("#rules-tribe-grid");
  grid.innerHTML = t.tribes.initial.map((tr, i) => `
    <div class="rules-tribe-row" data-tribe-index="${i}">
      <span class="rules-tribe-letter" style="color:${escapeHtmlAttr(tr.color)}">${tr.label}</span>
      <input class="rules-tribe-name"
             type="text" maxlength="20"
             data-tribe-index="${i}"
             value="${escapeHtmlAttr(tr.name)}"
             placeholder="Tribe name" />
      <input class="rules-tribe-color"
             type="color"
             data-tribe-index="${i}"
             value="${escapeHtmlAttr(tr.color)}" />
      <label class="rules-tribe-size-label">
        Size
        <input class="rules-tribe-size"
               type="number" min="1" max="50" step="1"
               data-tribe-index="${i}"
               value="${tr.size}" />
      </label>
    </div>
  `).join("");

  // Swap
  $("#swap-enabled").checked = !!t.swap.enabled;
  $("#swap-trigger").value   = t.swap.triggerCount ?? "";

  // Merge
  $("#merge-trigger").value = t.merge.triggerCount;
  $("#merge-name").value    = t.merge.tribeName;
  $("#merge-color").value   = t.merge.tribeColor;

  // Jury
  $("#jury-trigger").value      = t.jury.startTrigger;
  $("#jury-custom-count").value = t.jury.customStartCount ?? "";

  // Endgame
  $("#finalists").value = String(t.finalTribal.finalists);

  // Idols
  $("#idols-enabled").checked = !!t.idols.enabled;

  // Pacing
  $("#camp-actions").value = t.pacing.campActionsPerRound;
}

// ── Wire input changes → update working template ─────────────────────────────

function wireInputs(container) {
  const $ = sel => container.querySelector(sel);

  // Tribe rows — name, color, size for each
  container.querySelectorAll(".rules-tribe-name").forEach(el => {
    el.addEventListener("input", e => {
      const i = +e.target.dataset.tribeIndex;
      _workingTemplate.tribes.initial[i].name = e.target.value.trim() || _workingTemplate.tribes.initial[i].name;
    });
  });
  container.querySelectorAll(".rules-tribe-color").forEach(el => {
    el.addEventListener("input", e => {
      const i = +e.target.dataset.tribeIndex;
      _workingTemplate.tribes.initial[i].color = e.target.value;
      // Update the colored letter chip live
      const letter = container.querySelector(`.rules-tribe-row[data-tribe-index="${i}"] .rules-tribe-letter`);
      if (letter) letter.style.color = e.target.value;
    });
  });
  container.querySelectorAll(".rules-tribe-size").forEach(el => {
    el.addEventListener("input", e => {
      const i = +e.target.dataset.tribeIndex;
      _workingTemplate.tribes.initial[i].size = clampInt(e.target.value, 1, 50);
    });
  });

  // Swap
  $("#swap-enabled").addEventListener("change", e => {
    _workingTemplate.swap.enabled = e.target.checked;
    refreshConditionalRows(container);
  });
  $("#swap-trigger").addEventListener("input", e => {
    _workingTemplate.swap.triggerCount = clampInt(e.target.value, 2, 50);
  });

  // Merge
  $("#merge-trigger").addEventListener("input", e => {
    _workingTemplate.merge.triggerCount = clampInt(e.target.value, 2, 50);
  });
  $("#merge-name").addEventListener("input", e => {
    _workingTemplate.merge.tribeName = e.target.value.trim() || _workingTemplate.merge.tribeName;
  });
  $("#merge-color").addEventListener("input", e => {
    _workingTemplate.merge.tribeColor = e.target.value;
  });

  // Jury
  $("#jury-trigger").addEventListener("change", e => {
    _workingTemplate.jury.startTrigger = e.target.value;
    if (e.target.value === "custom" && _workingTemplate.jury.customStartCount == null) {
      // Provide a sensible default when switching to custom — one above merge.
      _workingTemplate.jury.customStartCount = (_workingTemplate.merge.triggerCount ?? 10) + 1;
      $("#jury-custom-count").value = _workingTemplate.jury.customStartCount;
    }
    refreshConditionalRows(container);
  });
  $("#jury-custom-count").addEventListener("input", e => {
    _workingTemplate.jury.customStartCount = clampInt(e.target.value, 2, 50);
  });

  // Endgame
  $("#finalists").addEventListener("change", e => {
    _workingTemplate.finalTribal.finalists = parseInt(e.target.value, 10);
  });

  // Idols
  $("#idols-enabled").addEventListener("change", e => {
    _workingTemplate.idols.enabled = e.target.checked;
  });

  // Pacing
  $("#camp-actions").addEventListener("input", e => {
    _workingTemplate.pacing.campActionsPerRound = clampInt(e.target.value, 1, 10);
  });
}

// Toggles visibility of conditional rows based on current flags.
function refreshConditionalRows(container) {
  const swapRow      = container.querySelector("#row-swap-trigger");
  const juryCustomRow = container.querySelector("#row-jury-custom");

  swapRow.classList.toggle("hidden", !_workingTemplate.swap.enabled);
  juryCustomRow.classList.toggle("hidden", _workingTemplate.jury.startTrigger !== "custom");
}

// ── Footer buttons ───────────────────────────────────────────────────────────

function wireFooter(container) {
  container.querySelector("#rules-cancel-btn").addEventListener("click", () => {
    onRulesEditorDone(false);
  });

  container.querySelector("#rules-reset-btn").addEventListener("click", () => {
    if (!confirm("Discard your changes and restore the default rules?")) return;
    _workingTemplate = JSON.parse(JSON.stringify(DEFAULT_SEASON_TEMPLATE));
    populateInputs(container);
    refreshConditionalRows(container);
    clearErrors(container);
  });

  container.querySelector("#rules-save-btn").addEventListener("click", () => {
    handleSave(container);
  });
}

// ── Save handler ─────────────────────────────────────────────────────────────

function handleSave(container) {
  const errors = validateSeasonTemplate(_workingTemplate);
  if (errors.length > 0) {
    showErrors(container, errors);
    return;
  }

  const ok = applyTemplate(_workingTemplate);
  if (!ok) {
    showErrors(container, ["applyTemplate refused the template — see console for details."]);
    return;
  }

  onRulesEditorDone(true);
}

function showErrors(container, errors) {
  const el = container.querySelector("#rules-editor-errors");
  el.innerHTML = `
    <div class="rules-editor-errors-header">${errors.length} issue${errors.length !== 1 ? "s" : ""} to fix:</div>
    <ul class="rules-editor-errors-list">
      ${errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
    </ul>
  `;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearErrors(container) {
  container.querySelector("#rules-editor-errors").innerHTML = "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampInt(value, min, max) {
  let n = parseInt(value, 10);
  if (Number.isNaN(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

// Escape utilities — kept local to this file to avoid coupling with the
// cast editor (which has its own copies). Future could share via a util.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttr(s) {
  return escapeHtml(s);
}
