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
    CONTESTANTS.push({
      id:        c.id,
      name:      c.name,
      challenge: c.challenge,
      social:    c.social,
      strategy:  c.strategy,
      // Runtime fields. tribe may be pre-assigned by the template or null.
      tribe:     c.tribe ?? null,
      active:    true,
      suspicion: 0,
      ...(c.description !== undefined ? { description: c.description } : {}),
    });
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
