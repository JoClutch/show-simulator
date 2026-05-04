// screenShowSeasons.js — show page (v10.1)
//
// Lists all seasons available within the show the user clicked into on
// the landing page. Each season is a card driven by src/data/seasons.js.
// Clicking a card branches on the season's `type`:
//
//   "demo" / "prebuilt"  → resolve templateRef, run boot-tail, → "select"
//   "custom"             → apply default template as a starting point,
//                          → "templates" (existing template/cast/rules flow)
//
// Module-local state tracks which show the user clicked into from the
// landing page. Set by onShowSelected() before showScreen("showSeasons").

let _selectedShowId = null;

// Called from screenLanding.js when a show card is clicked.
function onShowSelected(showId) {
  _selectedShowId = showId;
  showScreen("showSeasons");
}

function renderShowSeasonsScreen(container, state) {
  // v10.3: prefer the in-memory _selectedShowId (set when the user clicked
  // a show card on landing). When unset — e.g., the user reached this
  // screen via "Back to Seasons" from a game that was started programmatically
  // through startGame() rather than via the landing flow — fall back to
  // whichever show the active season belongs to.
  const showId = _selectedShowId || (state && state.season && state.season.showId);
  const show   = getShowById(showId);
  if (!show) {
    // Truly no show context anywhere — return to landing so the user can
    // pick. Should be very rare; happens only on direct programmatic
    // navigation that bypasses both the landing flow AND any startGame call.
    showScreen("landing");
    return;
  }
  // Cache for any subsequent re-render (e.g. after a returning visitor goes
  // back to the cast picker and clicks "Back to Seasons" again).
  _selectedShowId = show.id;

  const seasons = getSeasonsForShow(show.id);
  const cards   = seasons.map(buildSeasonCardHTML).join("");

  container.innerHTML = `
    <div class="screen show-seasons-screen">
      <a href="#" class="back-link" id="back-to-landing">← All Shows</a>

      <header class="show-page-header">
        <p class="screen-eyebrow">${escapeHtml(show.tagline ?? "")}</p>
        <h1 style="color:${escapeHtmlAttr(show.accentColor || "var(--text-primary)")}">
          ${escapeHtml(show.name)}
        </h1>
        <p class="muted">${escapeHtml(show.description ?? "")}</p>
      </header>

      <h2 class="show-seasons-heading">Seasons</h2>
      <div class="show-seasons-grid">
        ${cards || `<p class="muted">No seasons available yet.</p>`}
      </div>
    </div>
  `;

  container.querySelector("#back-to-landing").addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("landing");
  });

  // Wire each season card's CTA button. Only available seasons get one.
  container.querySelectorAll(".season-card-cta-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const seasonId = btn.dataset.seasonId;
      onSeasonSelected(seasonId);
    });
  });
}

function buildSeasonCardHTML(season) {
  const isAvailable = season.available !== false;
  const isCustom    = season.type === "custom";
  const isPrebuilt  = season.type === "prebuilt";

  const cls = [
    "season-card",
    isCustom    ? "season-card--custom"      : "",
    isPrebuilt  ? "season-card--prebuilt"    : "",
    !isAvailable ? "season-card--unavailable" : "",
  ].filter(Boolean).join(" ");

  const ctaLabel = season.ctaLabel ?? "Play →";

  const cta = isAvailable
    ? `<button class="season-card-cta-btn ${isCustom ? "" : "season-card-cta-btn-primary"}"
               data-season-id="${escapeHtmlAttr(season.id)}">
         ${escapeHtml(ctaLabel)}
       </button>`
    : `<div class="season-card-coming-soon">Coming Soon</div>`;

  // v10.9: pre-built seasons get a small eyebrow tag so the category is
  // legible at a glance — distinct from demo (the canonical default) and
  // from build-your-own (the dashed-border open-ended option).
  const eyebrow = isPrebuilt
    ? `<div class="season-card-eyebrow">Pre-Built</div>`
    : "";

  return `
    <div class="${cls}">
      <div class="season-card-body">
        ${eyebrow}
        <h3 class="season-card-name">${escapeHtml(season.name)}</h3>
        <p class="season-card-description muted">${escapeHtml(season.description ?? "")}</p>
        <div class="season-card-cta">${cta}</div>
      </div>
    </div>
  `;
}

// ── Season-start handler ───────────────────────────────────────────────────
//
// v10.2: dispatcher logic moved into the canonical startGame({ showId,
// seasonId }) API in main.js — that API is now the single entry point
// for starting a season from any caller (this screen, dev tools,
// hypothetical deep links). The screen just collects the season id from
// the clicked card and hands off.

function onSeasonSelected(seasonId) {
  startGame({ showId: _selectedShowId, seasonId });
}
