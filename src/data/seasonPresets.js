// seasonPresets.js — concrete season templates + apply + JSON round-trip
//
// This file provides:
//
//   1. DEFAULT_SEASON_TEMPLATE — a SeasonTemplate (per schema.js) that mirrors
//      the existing built-in season exactly. References the bundled CONTESTANTS
//      array by reference so we don't duplicate the cast.
//
//   2. applyTemplate(template) — populates SEASON_CONFIG (and CONTESTANTS if
//      the template's cast differs from the existing array) from a template.
//      Validation runs first; invalid templates are refused with a console error
//      and applyTemplate returns false.
//
//   3. exportSetupToJson / importSetupFromJson — round-trip helpers for future
//      save/load UI. Uses the SavedSetup wrapper format from schema.js.
//
// ── Design notes ──────────────────────────────────────────────────────────────
//
// The legacy globals SEASON_CONFIG (in season.js) and CONTESTANTS (in
// contestants.js) are kept as the runtime view of the active template. The
// engine and UI continue to read them directly — applyTemplate just rewrites
// their contents in place. Mutating in-place preserves the references that
// other modules captured at load time.
//
// At boot, main.js calls applyTemplate(DEFAULT_SEASON_TEMPLATE). Because the
// default template's values are identical to the inline values in season.js,
// this is functionally a no-op: gameplay is unchanged. But the indirection
// means a custom template can be applied before bootScreen() to start a
// different season entirely.

// ── Bundled default cast ─────────────────────────────────────────────────────
//
// A stable deep copy of the contestants from contestants.js, captured at
// module load before anything else can mutate them. The cast editor's
// "Reset to Default Cast" reads from here so resets always restore the
// original 16-contestant Broken Compass roster, not whatever was applied last.
//
// Contains only schema fields (id, name, stats) — no runtime fields like
// tribe/active/suspicion. applyTemplate stamps those when copying into the
// runtime CONTESTANTS array.
const BUNDLED_DEFAULT_CAST = CONTESTANTS.map(c => ({
  id:        c.id,
  name:      c.name,
  // v9.1: write all four challenge fields. The three sub-skills are the
  // source of truth; legacy `challenge` is included so older readers
  // (and external tooling) still see a coherent value.
  physicalChallengeSkill:  c.physicalChallengeSkill,
  mentalChallengeSkill:    c.mentalChallengeSkill,
  enduranceChallengeSkill: c.enduranceChallengeSkill,
  challenge: c.challenge,
  social:    c.social,
  strategy:  c.strategy,
  ...(c.description !== undefined ? { description: c.description } : {}),
}));

// ── Default season template ──────────────────────────────────────────────────
//
// Mirrors the existing SEASON_CONFIG (in season.js) and the bundled cast.
// References BUNDLED_DEFAULT_CAST so the default template is stable even if
// CONTESTANTS gets rewritten by a custom applyTemplate.
const DEFAULT_SEASON_TEMPLATE = {
  schemaVersion: SCHEMA_VERSION,

  meta: {
    id:          "season-1-broken-compass",
    name:        "Season 1: Broken Compass",
    description: "The default test season — sixteen contestants, two starting tribes, " +
                 "swap at 12 remaining, merge at 10, Final Tribal Council with three finalists.",
    isDefault:   true,
  },

  tribes: {
    initial: [
      { label: "A", name: "Kaleo", color: "#e87c2b", size: 8 },
      { label: "B", name: "Vanta", color: "#3a8fd4", size: 8 },
    ],
  },

  swap: {
    enabled:      true,
    triggerCount: 12,
  },

  merge: {
    triggerCount: 10,
    tribeName:    "Maji",
    tribeColor:   "#9b59b6",
  },

  jury: {
    startTrigger:     "atMerge",
    customStartCount: null,
  },

  finalTribal: {
    finalists: 3,
  },

  idols: {
    enabled: true,
  },

  pacing: {
    campActionsPerRound: 3,
  },

  // Cast references the bundled default cast (deep-copied at module load).
  // Custom templates would inline their own cast.
  cast: BUNDLED_DEFAULT_CAST,
};

// Tracks the most recently applied template. The cast editor reads this as the
// base for any edits — preserving non-cast config (tribes, swap, merge, etc.)
// while letting the editor swap out just the cast portion. Initialized when
// applyTemplate runs at boot.
let _activeTemplate = null;

function getActiveTemplate() {
  return _activeTemplate;
}

// One-line summary of a template's rules. Used by:
//   • the Active Setup panel on the select screen (v4.8)
//   • the live preview at the top of the rules editor (v4.8)
//   • the saved-setups card summary (v4.4)
//   • the templates screen card summary (v4.6)
//
// Centralized here so all surfaces speak the same shorthand. Extend cautiously
// — adding a part here adds it everywhere it's read.
function buildTemplateSummary(t) {
  if (!t) return "";
  const parts = [
    `${t.cast?.length ?? 0} cast`,
    t.swap?.enabled ? `Swap @${t.swap.triggerCount}` : "No swap",
    `Merge @${t.merge?.triggerCount ?? "?"}`,
    `Final ${t.finalTribal?.finalists ?? "?"}`,
    t.idols?.enabled ? "Idols on" : "Idols off",
    t.jury?.startTrigger === "custom"
      ? `Jury @${t.jury.customStartCount}`
      : "Jury at merge",
  ];
  return parts.join(" · ");
}

// ── Built-in templates (v4.6) ────────────────────────────────────────────────
//
// Each template is a complete SeasonTemplate (per schema.js). They all share
// the bundled default cast — variation lives in the RULES and THEME (tribe
// names/colors), not the contestant roster. Users pick a template as a
// starting point, then customize cast or rules to taste.
//
// Templates are intentionally fully self-contained (no spread-from-DEFAULT)
// so editing one never accidentally affects another via shared references.

// 2 — "No Twists": pure social/strategic play.
const TEMPLATE_NO_TWISTS = {
  schemaVersion: SCHEMA_VERSION,
  meta: {
    id:          "season-no-twists",
    name:        "No Twists",
    description: "Pure social game. No tribe swap, no hidden idols — just relationships, reads, and votes.",
    isDefault:   false,
  },
  tribes: {
    initial: [
      { label: "A", name: "North", color: "#5fa86f", size: 8 },
      { label: "B", name: "South", color: "#3a8090", size: 8 },
    ],
  },
  swap:        { enabled: false, triggerCount: null },
  merge:       { triggerCount: 10, tribeName: "Together", tribeColor: "#c89540" },
  jury:        { startTrigger: "atMerge", customStartCount: null },
  finalTribal: { finalists: 3 },
  idols:       { enabled: false },
  pacing:      { campActionsPerRound: 3 },
  cast:        BUNDLED_DEFAULT_CAST,
};

// 3 — "Old School": pre-2008 Survivor feel. Final 2, late jury, no twists.
const TEMPLATE_OLD_SCHOOL = {
  schemaVersion: SCHEMA_VERSION,
  meta: {
    id:          "season-old-school",
    name:        "Old School",
    description: "Early Survivor feel. No idols, no swap. Jury starts at Final 9. Final 2 endgame.",
    isDefault:   false,
  },
  tribes: {
    initial: [
      { label: "A", name: "Sole", color: "#c84030", size: 8 },
      { label: "B", name: "Mar",  color: "#d8a040", size: 8 },
    ],
  },
  swap:        { enabled: false, triggerCount: null },
  merge:       { triggerCount: 10, tribeName: "Allies", tribeColor: "#a06030" },
  jury:        { startTrigger: "custom", customStartCount: 9 },
  finalTribal: { finalists: 2 },
  idols:       { enabled: false },
  pacing:      { campActionsPerRound: 3 },
  cast:        BUNDLED_DEFAULT_CAST,
};

// 4 — "Late Merge": longer pre-merge tribal phase, more swing votes.
const TEMPLATE_LATE_MERGE = {
  schemaVersion: SCHEMA_VERSION,
  meta: {
    id:          "season-late-merge",
    name:        "Late Merge",
    description: "Longer tribal phase before merge. Swap and idols active. Eight pre-merge eliminations test alliances.",
    isDefault:   false,
  },
  tribes: {
    initial: [
      { label: "A", name: "Tide",  color: "#3a90b8", size: 8 },
      { label: "B", name: "Stone", color: "#807060", size: 8 },
    ],
  },
  swap:        { enabled: true, triggerCount: 12 },
  merge:       { triggerCount: 8, tribeName: "Crucible", tribeColor: "#b04580" },
  jury:        { startTrigger: "atMerge", customStartCount: null },
  finalTribal: { finalists: 3 },
  idols:       { enabled: true },
  pacing:      { campActionsPerRound: 3 },
  cast:        BUNDLED_DEFAULT_CAST,
};

// Registry — order here is the order the picker screen displays.
// DEFAULT_SEASON_TEMPLATE is first; the original "Classic 16" is preserved.
const BUILT_IN_TEMPLATES = [
  DEFAULT_SEASON_TEMPLATE,
  TEMPLATE_NO_TWISTS,
  TEMPLATE_OLD_SCHOOL,
  TEMPLATE_LATE_MERGE,
];

// ── apply ─────────────────────────────────────────────────────────────────────

// Populates SEASON_CONFIG (and CONTESTANTS if needed) from a template.
// Returns true on success, false if the template fails validation.
//
// Mutates SEASON_CONFIG and CONTESTANTS in place — every other module's
// references to those globals stay valid.
//
// For the cast: if template.cast IS the existing CONTESTANTS reference (the
// default-template case) we skip rewriting it. Otherwise we replace the
// CONTESTANTS array contents in place (length=0 + push) so the same array
// reference holds the new roster.
function applyTemplate(template) {
  const errors = validateSeasonTemplate(template);
  if (errors.length > 0) {
    console.error("[applyTemplate] template failed validation; not applied:", errors);
    return false;
  }

  // ── SEASON_CONFIG fields used by existing engine/UI ──
  SEASON_CONFIG.name = template.meta.name;

  // tribeNames / tribeColors keyed by label — flat maps for lookup.
  // Reset both objects in place to drop any stale labels from prior templates.
  for (const k of Object.keys(SEASON_CONFIG.tribeNames))  delete SEASON_CONFIG.tribeNames[k];
  for (const k of Object.keys(SEASON_CONFIG.tribeColors)) delete SEASON_CONFIG.tribeColors[k];
  for (const tr of template.tribes.initial) {
    SEASON_CONFIG.tribeNames[tr.label]  = tr.name;
    SEASON_CONFIG.tribeColors[tr.label] = tr.color;
  }

  SEASON_CONFIG.tribesCount         = template.tribes.initial.length;
  // Existing assignTribes assumes a single tribeSize — use the first tribe's
  // size. Future heterogeneous-size support would require updating that path.
  SEASON_CONFIG.tribeSize           = template.tribes.initial[0].size;

  SEASON_CONFIG.campActionsPerRound = template.pacing.campActionsPerRound;
  SEASON_CONFIG.swapTriggerCount    = template.swap.enabled ? template.swap.triggerCount : null;
  SEASON_CONFIG.mergeTriggerCount   = template.merge.triggerCount;
  SEASON_CONFIG.mergeTribeName      = template.merge.tribeName;
  SEASON_CONFIG.mergeTribeColor     = template.merge.tribeColor;
  SEASON_CONFIG.finalCount          = template.finalTribal.finalists;

  // v4.2 additions — jury start configuration and idol system toggle.
  // Fields the runtime reads via SEASON_CONFIG.* to honor template settings.
  SEASON_CONFIG.juryStartTrigger    = template.jury.startTrigger;
  SEASON_CONFIG.juryStartCount      = template.jury.customStartCount ?? null;
  SEASON_CONFIG.idolsEnabled        = template.idols.enabled;

  // ── Cast ──
  // Always rewrite CONTESTANTS contents in place — deep-copies template
  // contestants and stamps fresh runtime fields. Mutating in place preserves
  // the array reference that other modules captured at load time.
  //
  // The `tribe` field from the template (if set) is preserved into the
  // runtime contestant. assignTribes() reads it: when ALL contestants have
  // a pre-assigned tribe, the assignment is honored; otherwise a random
  // shuffle runs (matching the original behavior).
  CONTESTANTS.length = 0;
  for (const c of template.cast) {
    const fresh = {
      id:        c.id,
      name:      c.name,
      // v9.1: copy the three challenge sub-skills if present; legacy
      // `challenge` is also copied so normalizeContestantStats has a
      // fallback when a template predates the split.
      physicalChallengeSkill:  c.physicalChallengeSkill,
      mentalChallengeSkill:    c.mentalChallengeSkill,
      enduranceChallengeSkill: c.enduranceChallengeSkill,
      challenge: c.challenge,
      social:    c.social,
      strategy:  c.strategy,
      // Runtime fields. tribe may be pre-assigned by the template or null.
      tribe:     c.tribe ?? null,
      active:    true,
      suspicion: 0,
      ...(c.description !== undefined ? { description: c.description } : {}),
    };
    // v9.1: backfill missing sub-skills from legacy `challenge` (or 5),
    // and recompute legacy `challenge` from the three sub-skills.
    // Idempotent — safe whether the template has the new fields or not.
    normalizeContestantStats(fresh);
    CONTESTANTS.push(fresh);
  }

  _activeTemplate = template;
  return true;
}

// ── JSON round-trip ──────────────────────────────────────────────────────────
//
// Wraps a template in a SavedSetup envelope (schemaVersion + timestamp) and
// stringifies it. Pretty-printed with 2-space indent for human inspection.

function exportSetupToJson(template) {
  /** @type {SavedSetup} */
  const wrapper = {
    schemaVersion: SCHEMA_VERSION,
    savedAt:       new Date().toISOString(),
    format:        "json",
    template,
  };
  return JSON.stringify(wrapper, null, 2);
}

// Parses a SavedSetup JSON string and returns the inner SeasonTemplate.
// Throws on invalid JSON OR validation failure. The thrown Error carries a
// .errors array of validation messages when validation is the cause.
function importSetupFromJson(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`saved setup is not valid JSON: ${e.message}`);
  }

  const errors = validateSavedSetup(parsed);
  if (errors.length > 0) {
    const err = new Error(`saved setup failed validation: ${errors.join("; ")}`);
    err.errors = errors;
    throw err;
  }

  return parsed.template;
}
