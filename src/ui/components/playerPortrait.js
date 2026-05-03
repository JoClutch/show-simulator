// playerPortrait.js — reusable player portrait / display-name helpers (v9.3)
//
// Two pure functions, both returning HTML strings designed for direct
// interpolation into template literals (matching the existing pattern in
// buildTribeRosterHTML and friends).
//
//   renderPlayerPortrait(contestant, opts)  → portrait box (image or initials)
//   getPlayerDisplayName(contestant, fmt)   → name string (full / first / initials)
//
// PHASE 2 SCOPE: These exist for later phases to consume. No screen file is
// migrated to use them yet — that lands in Phase 3+. Adding this file alone
// changes nothing visually.
//
// ── Loading order ────────────────────────────────────────────────────────────
// index.html must load this script BEFORE any UI screen that calls into it.
// Because the project is plain script-tags (no modules), placing this file
// after src/util.js but before the screen files is enough.

// ── Name formatting ──────────────────────────────────────────────────────────

// Returns a display string for a contestant in the requested format.
// Caller is still responsible for HTML-escaping the returned string before
// interpolating into innerHTML — we don't escape here so the helper is
// usable in non-HTML contexts (event log entries, console traces, tests).
//
//   "full"     → contestant.name verbatim                    "Marcus Webb"
//   "first"    → first whitespace-delimited token            "Marcus"
//   "initials" → first letter of first + last token          "MW"
//                Single-token names yield a single letter.    ("Madonna" → "M")
//
// Defensive: a null/undefined contestant or empty name returns "" so call
// sites don't have to null-check.
function getPlayerDisplayName(contestant, format = "full") {
  const raw = contestant && typeof contestant.name === "string"
    ? contestant.name.trim()
    : "";
  if (raw === "") return "";

  if (format === "full") return raw;

  const tokens = raw.split(/\s+/);

  if (format === "first") return tokens[0];

  if (format === "initials") {
    if (tokens.length === 1) return tokens[0][0].toUpperCase();
    const first = tokens[0][0];
    const last  = tokens[tokens.length - 1][0];
    return (first + last).toUpperCase();
  }

  return raw;   // unknown format → safe default
}

// Default name format per screen, derived from the v9.3 spec:
//   episodeRecap / challenge / elimination / finalTribal / results /
//   merge / swap / select  → "full"
//   campLife / tribal                                                → "first"
// Call sites usually pass FORMAT_BY_SCREEN[name] but can override per call.
const FORMAT_BY_SCREEN = {
  select:       "full",
  episodeRecap: "full",
  challenge:    "full",
  campLife:     "first",
  tribal:       "first",
  elimination:  "full",
  finalTribal:  "full",
  results:      "full",
  merge:        "full",
  swap:         "full",
};

// ── Portrait rendering ───────────────────────────────────────────────────────

// Returns an HTML string for a contestant's portrait box. Designed for
// template-literal interpolation:
//
//   container.innerHTML = `
//     <div class="card">
//       ${renderPlayerPortrait(c, { size: "md" })}
//       <div class="card-name">${escapeHtml(getPlayerDisplayName(c, "full"))}</div>
//     </div>
//   `;
//
// opts.size:        "sm" | "md" | "lg"   (default "md")
//                   sm = 32px (chips, dense lists)
//                   md = 56px (rosters, voting cards)
//                   lg = 96px (headlines, elimination card)
// opts.shape:       "square" | "circle"  (default "square" — BrantSteele-like)
// opts.tintColor:   override the placeholder background color. Default uses
//                   contestant.originalTribe color when present, falling back
//                   to a neutral dark surface. The tint is only visible on
//                   the placeholder (initials box); image portraits cover it.
// opts.extraClass:  optional additional CSS class for layout tweaks
//                   (e.g. "is-eliminated" to dim a portrait in jury chips).
// opts.alt:         override the <img alt=""> text. Defaults to the
//                   contestant's full name.
//
// Behavior:
//   • If contestant.portraitUrl is set      → renders an <img> (covers box)
//   • Otherwise                              → renders a <div> with centered
//                                              initials over the tint color
//
// The OUTER class list is identical in both cases (`player-portrait` plus
// size/shape modifiers), so swapping the placeholder for real art later
// requires no call-site changes — just set portraitUrl on the contestant.
// v9.12: canonical size names. Pass any of:
//   "small"  | "sm" → 32 px   (compact lists, dense rows)
//   "medium" | "md" → 48 px   (per-row roster cards, default)
//   "large"  | "lg" → 64 px   (focal/hero cards: selection, winner, boot, idol-reveal)
// Aliases keep older opts.size: "sm"|"md"|"lg" callers working unchanged.
const _SIZE_ALIAS = {
  small:  "sm",
  medium: "md",
  large:  "lg",
  sm: "sm", md: "md", lg: "lg",
};

function renderPlayerPortrait(contestant, opts = {}) {
  if (!contestant) return "";

  // Default is "medium". Aliasing happens here so the rest of the function
  // and the CSS rules can keep using the short suffixes.
  const sizeRaw    = opts.size       || "medium";
  const size       = _SIZE_ALIAS[sizeRaw] || "md";
  const shape      = opts.shape      || "square";
  const tintColor  = opts.tintColor  || _portraitTintFor(contestant);
  const extraClass = opts.extraClass || "";
  const altText    = opts.alt ?? getPlayerDisplayName(contestant, "full");

  const classList = [
    "player-portrait",
    `player-portrait--${size}`,
    `player-portrait--${shape}`,
    extraClass,
  ].filter(Boolean).join(" ");

  // Real art path — inline <img> covers the box.
  if (typeof contestant.portraitUrl === "string" && contestant.portraitUrl.trim() !== "") {
    return `
      <span class="${classList}" aria-hidden="false">
        <img class="player-portrait__img"
             src="${escapeHtmlAttr(contestant.portraitUrl)}"
             alt="${escapeHtmlAttr(altText)}"
             loading="lazy" />
      </span>
    `;
  }

  // Placeholder path — dark box with centered initials.
  const initials = getPlayerDisplayName(contestant, "initials") || "?";
  return `
    <span class="${classList} player-portrait--placeholder"
          style="background-color:${escapeHtmlAttr(tintColor)}"
          role="img"
          aria-label="${escapeHtmlAttr(altText)}">
      <span class="player-portrait__initials">${escapeHtml(initials)}</span>
    </span>
  `;
}

// Pick a sensible default tint for the placeholder based on the contestant's
// original tribe. Falls back to a neutral dark surface if the tribe color
// isn't resolvable (e.g. during cast editor preview before assignTribes).
function _portraitTintFor(contestant) {
  // SEASON_CONFIG is a global from src/data/season.js (script-tag world).
  const tribeColors = (typeof SEASON_CONFIG !== "undefined" && SEASON_CONFIG?.tribeColors) || {};
  const orig = contestant.originalTribe;
  if (orig && tribeColors[orig]) return tribeColors[orig];
  return "#1a1a1a";   // neutral dark surface for placeholder
}

// HTML-escape for use inside double-quoted attributes. Same rules as
// escapeHtml in src/util.js — duplicated here so this file is self-contained
// (placing it in src/util.js would couple loading order more tightly).
function escapeHtmlAttr(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
