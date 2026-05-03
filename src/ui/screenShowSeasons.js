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
  const show = getShowById(_selectedShowId);
  if (!show) {
    // Defensive — should never fire because the landing page only routes
    // here from a valid show card. If it does, send the user back.
    showScreen("landing");
    return;
  }

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

  const cls = [
    "season-card",
    isCustom    ? "season-card--custom"      : "",
    !isAvailable ? "season-card--unavailable" : "",
  ].filter(Boolean).join(" ");

  const ctaLabel = season.ctaLabel ?? "Play →";

  const cta = isAvailable
    ? `<button class="season-card-cta-btn ${isCustom ? "" : "season-card-cta-btn-primary"}"
               data-season-id="${escapeHtmlAttr(season.id)}">
         ${escapeHtml(ctaLabel)}
       </button>`
    : `<div class="season-card-coming-soon">Coming Soon</div>`;

  return `
    <div class="${cls}">
      <div class="season-card-body">
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
