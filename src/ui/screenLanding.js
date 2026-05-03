// screenLanding.js — root landing page (v10.0)
//
// Shown on first load. Renders a grid of all shows from src/data/shows.js.
// Clicking an available show routes into the show page (showSeasons screen).
// Unavailable shows render as dimmed "Coming Soon" tiles with no click
// handler — they're discoverable so users see what's planned.
//
// Architecture: this is the new boot landing. The previous boot routed
// straight to "select" (cast pick) after applying the default season
// template. That direct-to-game path now lives behind the show + season
// flow — applyTemplate fires when the user picks a specific season,
// not at app start.

function renderLandingScreen(container, state) {
  const cards = SHOWS.map(buildShowCardHTML).join("");

  container.innerHTML = `
    <div class="screen landing-screen">
      <header class="landing-header">
        <p class="screen-eyebrow">The Show Simulator</p>
        <h1>Pick a Show</h1>
        <p class="landing-subtitle muted">
          Reality TV strategy, one season at a time.
        </p>
      </header>

      <div class="landing-grid" id="landing-grid">
        ${cards}
      </div>
    </div>
  `;

  // Wire show-card clicks. Only enabled cards have a button.
  container.querySelectorAll(".show-card-play-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const showId = btn.dataset.showId;
      onShowSelected(showId);
    });
  });
}

function buildShowCardHTML(show) {
  const isAvailable = show.available !== false;
  const cls = [
    "show-card",
    isAvailable ? "" : "show-card--unavailable",
  ].filter(Boolean).join(" ");

  // Tinted accent stripe along the top of the card matches the show's
  // brand color. Same pattern .card-tribe-pip uses on contestant cards.
  const accentStripe = show.accentColor
    ? `<div class="show-card-accent" style="background:${escapeHtmlAttr(show.accentColor)}"></div>`
    : "";

  const cta = isAvailable
    ? `<button class="show-card-play-btn" data-show-id="${escapeHtmlAttr(show.id)}">
         Play →
       </button>`
    : `<div class="show-card-coming-soon">Coming Soon</div>`;

  return `
    <div class="${cls}">
      ${accentStripe}
      <div class="show-card-body">
        <h2 class="show-card-name">${escapeHtml(show.name)}</h2>
        <p class="show-card-tagline">${escapeHtml(show.tagline ?? "")}</p>
        <p class="show-card-description muted">${escapeHtml(show.description ?? "")}</p>
        <div class="show-card-cta">${cta}</div>
      </div>
    </div>
  `;
}

// Local fallback in case escapeHtmlAttr isn't loaded yet from another file.
// (escapeHtmlAttr is also defined in playerPortrait.js and a few screens —
// in script-tag world the last definition wins; this version is identical.)
if (typeof escapeHtmlAttr !== "function") {
  // eslint-disable-next-line no-var
  var escapeHtmlAttr = function (s) {
    if (s == null) return "";
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  };
}
