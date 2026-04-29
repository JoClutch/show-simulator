// screenTemplates.js — built-in season template picker (v4.6)
//
// Lets the user pick a starting-point template before customizing further.
// Reached from the contestant select screen via "Choose Template →".
//
// Templates are read from BUILT_IN_TEMPLATES (in seasonPresets.js). Each card
// shows the template's name, description, and a one-line summary of its
// rules. Clicking "Use this template" applies it via applyTemplate, rebuilds
// gameState, and routes back to select.
//
// ── Behaviour ────────────────────────────────────────────────────────────────
//
// Templates are starting points, not locked modes. After picking one, the
// user can still:
//   • Edit Cast → change contestants
//   • Edit Rules → tweak any setting
//   • Save the resulting customization to localStorage
//   • Export the resulting customization as JSON
//
// A confirmation prompt fires before applying (matches the load-from-saves
// flow). This protects users who clicked through to the picker but didn't
// realize their current customization would be replaced.

function renderTemplatesScreen(container, state) {
  drawShell(container);
  drawList(container);
  wireFooter(container);
}

// ── Layout ────────────────────────────────────────────────────────────────────

function drawShell(container) {
  container.innerHTML = `
    <div class="screen templates-screen">
      <p class="screen-eyebrow">Setup</p>
      <h2>Choose a Template</h2>
      <p class="muted templates-blurb">
        Pick a starting point for your season. Templates set defaults for tribes,
        merge timing, jury, swap, idols, and endgame format. After picking, you
        can still customize cast and rules before starting.
      </p>

      <div id="templates-list" class="templates-list"></div>

      <div class="templates-footer">
        <button class="templates-back-btn" id="templates-back-btn">← Back</button>
      </div>
    </div>
  `;
}

function drawList(container) {
  const listEl = container.querySelector("#templates-list");
  const active = getActiveTemplate();

  listEl.innerHTML = BUILT_IN_TEMPLATES.map(t => {
    // Mark the currently-active template so the user can see what's already
    // applied (helps avoid no-op re-picks).
    const isActive   = active && active.meta?.id === t.meta?.id;
    const isDefault  = t.meta?.isDefault === true;
    const summary    = buildSummary(t);
    const tagSpans   = [
      isDefault ? `<span class="template-tag template-tag-default">DEFAULT</span>` : "",
      isActive  ? `<span class="template-tag template-tag-active">CURRENT</span>` : "",
    ].filter(Boolean).join(" ");

    // Tribe color swatches give each card a visual identity at a glance.
    const swatches = t.tribes.initial.map(tr =>
      `<span class="template-tribe-swatch" style="background:${tr.color}" title="${escapeHtml(tr.name)}"></span>`
    ).join("");

    return `
      <div class="template-card" data-id="${escapeHtml(t.meta.id)}">
        <div class="template-card-header">
          <span class="template-card-name">${escapeHtml(t.meta.name)}</span>
          <span class="template-card-tags">${tagSpans}</span>
        </div>
        <div class="template-card-swatches">${swatches}</div>
        <p class="template-card-description">${escapeHtml(t.meta.description ?? "")}</p>
        <div class="template-card-summary">${escapeHtml(summary)}</div>
        <div class="template-card-actions">
          <button class="template-use-btn" data-id="${escapeHtml(t.meta.id)}">
            ${isActive ? "Re-apply" : "Use this template"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Wire each "Use this" button after render.
  listEl.querySelectorAll(".template-use-btn").forEach(btn => {
    btn.addEventListener("click", () => handleUse(btn.dataset.id));
  });
}

// One-line summary describing the rules so users can scan templates quickly.
// Order chosen to put the most distinguishing facts first (cast size, swap,
// merge, finalists), with idol/jury notes appended only when non-default.
function buildSummary(t) {
  const tribeNames = t.tribes.initial.map(tr => tr.name).join(", ");
  const parts = [
    `${t.cast.length} cast`,
    `tribes: ${tribeNames}`,
    t.swap.enabled ? `swap @${t.swap.triggerCount}` : "no swap",
    `merge @${t.merge.triggerCount}`,
    `Final ${t.finalTribal.finalists}`,
  ];
  if (!t.idols.enabled) parts.push("no idols");
  if (t.jury.startTrigger === "custom") parts.push(`jury @${t.jury.customStartCount}`);
  return parts.join(" · ");
}

// ── Event handlers ────────────────────────────────────────────────────────────

function wireFooter(container) {
  container.querySelector("#templates-back-btn")
    .addEventListener("click", () => onTemplatesDone(false));
}

function handleUse(templateId) {
  const template = BUILT_IN_TEMPLATES.find(t => t.meta?.id === templateId);
  if (!template) {
    alert("That template is no longer available.");
    return;
  }

  // Same confirmation pattern as load-from-saves — picking a template
  // replaces any unsaved current customization.
  if (!confirm(`Apply the "${template.meta.name}" template? Any unsaved customization will be replaced.`)) {
    return;
  }

  const ok = applyTemplate(template);
  if (!ok) {
    alert("Could not apply template — see console for details. Active config unchanged.");
    return;
  }

  onTemplatesDone(true);
}
