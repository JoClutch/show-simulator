// screenShowSeasons.js — show page (v10.0)
//
// Lists what's available within a specific show. v10.0 ships a minimal
// version — show name, tagline, and two action buttons (Demo Season,
// Build Your Own). The next phase will replace the buttons with a
// proper grid of season cards driven by src/data/seasons.js.
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

      <div class="show-seasons-actions">
        <button id="start-demo-season-btn" class="show-season-btn show-season-btn-primary">
          Play Demo Season →
        </button>
        <button id="start-custom-season-btn" class="show-season-btn">
          Build Your Own Season
        </button>
      </div>
    </div>
  `;

  container.querySelector("#back-to-landing").addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("landing");
  });

  container.querySelector("#start-demo-season-btn").addEventListener("click", () => {
    startDemoSeason();
  });

  container.querySelector("#start-custom-season-btn").addEventListener("click", () => {
    startCustomSeasonSetup();
  });
}

// ── Season-start handlers ──────────────────────────────────────────────────
//
// These wrap the boot-tail steps that previously ran on DOMContentLoaded.
// Same operations, same order, same result — just gated behind a season
// pick instead of running unconditionally on app load.

function startDemoSeason() {
  applyTemplate(DEFAULT_SEASON_TEMPLATE);
  normalizeAllContestants(CONTESTANTS);
  gameState = createSeasonState();
  assignTribes(CONTESTANTS, gameState);
  initIdols(gameState);
  showScreen("select");
}

function startCustomSeasonSetup() {
  // Apply the default template as a starting point so the existing
  // setup screens (templates / cast editor / rules editor) have a valid
  // active template to read from. Users can override anything from there.
  applyTemplate(DEFAULT_SEASON_TEMPLATE);
  normalizeAllContestants(CONTESTANTS);
  gameState = createSeasonState();
  showScreen("templates");
}
