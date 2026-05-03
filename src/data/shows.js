// shows.js — registry of available reality shows (v10.0)
//
// Single source of truth for what shows exist on the site. Read by the
// landing page (src/ui/screenLanding.js) to render show cards.
//
// Adding a new show is one entry edit — no other code changes needed.
// Set `available: false` to render the show as a dimmed "Coming Soon"
// tile. Set `available: true` once the show is playable.
//
// ── Field reference ───────────────────────────────────────────────────────
//   id           string   Unique key. Used in season records (showId) and
//                         in routing (e.g. seasons-for-show lookups).
//   name         string   Display name on the show card.
//   tagline      string   Short hook (~10 words). Sits under the name.
//   description  string   One-sentence summary of what the show is about.
//   accentColor  string   CSS color used as the show card's accent stripe.
//   available    boolean  Hide the "Play" button + dim the card if false.
//
// Architecture rule: this file is plain data. No DOM, no engine code, no
// state mutation. UI components consume the array; tests assert against
// it directly.

const SHOWS = [
  {
    id:          "survivor",
    name:        "Survivor",
    tagline:     "Eighteen castaways. Thirty-nine days. One sole survivor.",
    description: "Tribal politics, immunity challenges, hidden idols, and one final vote.",
    accentColor: "#e8b346",
    available:   true,
  },
  // Examples for future expansion (left commented to keep the active list
  // intentional; uncomment + flip `available` when a show is ready):
  //
  // {
  //   id:          "bigbrother",
  //   name:        "Big Brother",
  //   tagline:     "Three months in a house. One winner.",
  //   description: "Veto competitions, nominations, eviction night.",
  //   accentColor: "#3a8fd4",
  //   available:   false,
  // },
];

// Returns the show object with the given id, or null. Used by the show
// page to look up which show the user clicked into.
function getShowById(id) {
  return SHOWS.find(s => s.id === id) || null;
}
