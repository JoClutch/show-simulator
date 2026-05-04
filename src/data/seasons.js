// seasons.js — registry of seasons available within each show (v10.1)
//
// Single source of truth for what seasons exist on the site. Read by the
// show page (src/ui/screenShowSeasons.js) to render the season-card grid
// for whichever show the user clicked into.
//
// Adding a new season is one entry edit — no other code changes needed.
// Set `available: false` to render the season as a dimmed "Coming Soon"
// tile.
//
// ── Field reference ───────────────────────────────────────────────────────
//   id           string   Unique key across all seasons.
//   showId       string   Which show this season belongs to (matches a
//                         SHOWS entry id from src/data/shows.js).
//   name         string   Display name on the season card.
//   description  string   One-sentence summary shown beneath the name.
//   type         string   One of:
//                         "demo"     — bundled demonstration season; uses
//                                      the canonical default template.
//                         "prebuilt" — future authored seasons with their
//                                      own template constant.
//                         "custom"   — routes to the existing template /
//                                      cast / rules editor flow so the
//                                      user can build their own.
//   templateRef  string?  Name of the template constant to apply for
//                         demo / prebuilt seasons (resolved by
//                         resolveTemplate below). null for "custom".
//   ctaLabel     string?  Override for the action-button label. Defaults
//                         to "Play →" if omitted.
//   available    boolean  False renders a dimmed "Coming Soon" tile.
//
// Architecture rule: pure data. No DOM, no engine code, no state mutation.
// UI components consume the array; tests assert against it directly.

const SEASONS = [
  {
    id:          "survivor-demo",
    showId:      "survivor",
    name:        "Demo Season",
    description: "Sixteen castaways, two starting tribes (Kaleo vs Vanta), swap at 12, merge at 10, Final Tribal Council with three finalists.",
    type:        "demo",
    templateRef: "DEFAULT_SEASON_TEMPLATE",
    available:   true,
  },
  // v10.9: pre-built seasons. Authored season templates live one-per-file
  // under src/data/seasons/ and are referenced here by their constant
  // name. The dispatcher in startGame (src/main.js) treats type:"prebuilt"
  // identically to type:"demo" — applies the template, runs the standard
  // boot tail. The visual distinction (PRE-BUILT eyebrow tag on the
  // season card) is added by the show page renderer, not by the registry.
  //
  // Currently only one placeholder is wired in to prove the framework.
  // Real authored seasons (Borneo, Australia, etc.) will follow the
  // same registry pattern.
  {
    id:          "sample-prebuilt",
    showId:      "survivor",
    name:        "Sample Pre-Built Season",
    description: "A placeholder season to demonstrate the pre-built season pipeline. Sixteen castaways, two new tribes, standard rules, all stats pre-set to 5.",
    type:        "prebuilt",
    templateRef: "SAMPLE_PREBUILT_SEASON_TEMPLATE",
    available:   true,
  },

  {
    id:          "survivor-custom",
    showId:      "survivor",
    name:        "Build Your Own Season",
    description: "Roll your own cast and tweak the rules. Edit contestants, adjust merge / swap timing, save your setup for later.",
    type:        "custom",
    templateRef: null,
    ctaLabel:    "Build →",
    available:   true,
  },
  // Examples for future expansion (uncomment + author the matching template
  // constant in src/data/seasonPresets.js to bring a new season online):
  //
  // {
  //   id:          "survivor-borneo",
  //   showId:      "survivor",
  //   name:        "Borneo (1-of-Many)",
  //   description: "The original sixteen — the Pagong-Tagi rivalry that started it all.",
  //   type:        "prebuilt",
  //   templateRef: "SURVIVOR_BORNEO_TEMPLATE",
  //   available:   false,
  // },
];

// Returns all seasons for a given show id, in registry order.
function getSeasonsForShow(showId) {
  return SEASONS.filter(s => s.showId === showId);
}

// Returns the season object with the given id, or null. Used by the show
// page when the user clicks a season card and we need to look up its
// type / templateRef to start the right game flow.
function getSeasonById(seasonId) {
  return SEASONS.find(s => s.id === seasonId) || null;
}

// Resolves a templateRef string to the actual template constant. Templates
// are top-level globals declared in src/data/seasonPresets.js (script-tag
// world); we look them up via window so adding a new prebuilt season is
// just adding the const and adding a SEASONS entry that names it.
//
// Returns null if the ref isn't found — callers should treat that as a
// configuration error.
function resolveTemplate(templateRef) {
  if (!templateRef) return null;
  const template = window[templateRef];
  if (!template || typeof template !== "object") {
    console.error(`[resolveTemplate] template '${templateRef}' not found on window`);
    return null;
  }
  return template;
}
