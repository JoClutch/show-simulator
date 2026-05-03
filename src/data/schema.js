// schema.js — formal data schemas + validators (v4 groundwork)
//
// This file defines the SHAPE of customizable game data: season templates and
// individual contestants. It is purely descriptive (JSDoc typedefs) and
// validating (functions returning arrays of error strings). It contains no
// game data and no runtime state.
//
// ── Design ────────────────────────────────────────────────────────────────────
//
// Two clean concepts are formalized here:
//
//   1. SeasonTemplate — a complete, self-contained description of a season:
//      who's in it, how the tribes are set up, when swaps and merges fire,
//      how many finalists, how many camp actions per round. A template is the
//      "save format" — round-trippable to JSON.
//
//   2. ContestantSchema — the formal definition of a contestant for editing
//      and validation. Excludes runtime fields (tribe, suspicion, sentiment)
//      which the engine stamps as the game progresses.
//
// ── Config vs runtime ────────────────────────────────────────────────────────
//
// Config (this file's domain): season identity, tribe setup, swap/merge/jury
//   triggers, finalist count, pacing constants, cast roster. Immutable per game.
//
// Runtime (NOT this file's domain — see season.js createSeasonState): the
//   round counter, current camp phase, active tribe arrays, eliminations,
//   jury, relationships, trust, suspicion, idols, alliances, voting blocs,
//   event log. Mutated continuously during play.
//
// ── Versioning ────────────────────────────────────────────────────────────────
//
// schemaVersion lives at the top of every template and saved setup. Bump it
// when the schema changes in a non-backward-compatible way; importers can
// then refuse or migrate older versions.

// Stat range constants — single source of truth for validators and future UI.
const STAT_MIN = 1;
const STAT_MAX = 10;

// Current schema version. Bump when SeasonTemplate's shape changes.
const SCHEMA_VERSION = 1;

// ── Type definitions (JSDoc) ─────────────────────────────────────────────────
//
// These typedefs are purely documentary in vanilla JS — they have no runtime
// effect. They serve as the contract between schema authors, validators, and
// future editing UI.

/**
 * @typedef {Object} SeasonTemplate
 * @property {number}             schemaVersion  Bumped when shape changes.
 * @property {SeasonMeta}         meta
 * @property {TribeConfig}        tribes
 * @property {SwapConfig}         swap
 * @property {MergeConfig}        merge
 * @property {JuryConfig}         jury
 * @property {FinalTribalConfig}  finalTribal
 * @property {IdolsConfig}        idols
 * @property {PacingConfig}       pacing
 * @property {ContestantSchema[]} cast
 */

/**
 * @typedef {Object} IdolsConfig
 * @property {boolean} enabled  When false, the idol system is disabled
 *                              entirely (no idols spawn, no search action,
 *                              no idol play phase at tribal).
 */

/**
 * @typedef {Object} SeasonMeta
 * @property {string}   id           Unique slug (e.g. "season-1-broken-compass").
 * @property {string}   name         Display name (e.g. "Season 1: Broken Compass").
 * @property {string}   [description]
 * @property {boolean}  [isDefault]  True for the bundled default season.
 */

/**
 * @typedef {Object} TribeConfig
 * @property {InitialTribeDef[]} initial  At least 2 entries required.
 */

/**
 * @typedef {Object} InitialTribeDef
 * @property {"A"|"B"|"C"|"D"} label  Internal id; current code only handles A and B.
 * @property {string}          name   Display name (e.g. "Kaleo").
 * @property {string}          color  CSS color string.
 * @property {number}          size   How many contestants start on this tribe.
 */

/**
 * @typedef {Object} SwapConfig
 * @property {boolean}     enabled
 * @property {number|null} triggerCount  Fires when remaining ≤ this. null = disabled.
 */

/**
 * @typedef {Object} MergeConfig
 * @property {number} triggerCount  Fires when remaining ≤ this.
 * @property {string} tribeName     Display name for the merged tribe.
 * @property {string} tribeColor    CSS color string.
 */

/**
 * @typedef {Object} JuryConfig
 * @property {"atMerge"|"custom"} startTrigger  Most seasons use "atMerge".
 * @property {number|null}        customStartCount  Used when startTrigger === "custom".
 */

/**
 * @typedef {Object} FinalTribalConfig
 * @property {number} finalists  How many remain at FTC. Typically 2 or 3.
 */

/**
 * @typedef {Object} PacingConfig
 * @property {number} campActionsPerRound
 */

/**
 * @typedef {Object} ContestantSchema
 * @property {string}  id           Unique within the cast.
 * @property {string}  name
 * @property {number}  [physicalChallengeSkill]  1–10. v9.1 sub-skill — strength / speed.
 * @property {number}  [mentalChallengeSkill]    1–10. v9.1 sub-skill — puzzles / memory.
 * @property {number}  [enduranceChallengeSkill] 1–10. v9.1 sub-skill — sustained holds / will.
 * @property {number}  [challenge]  1–10. Legacy/derived stored field. When the three
 *                                  sub-skills are present this field is recomputed at
 *                                  boot as round(avg). When only `challenge` is present
 *                                  (older templates), normalizeContestantStats backfills
 *                                  the three sub-skills from it.
 * @property {number}  social       1–10.
 * @property {number}  strategy     1–10.
 * @property {string}  [description]Optional flavor.
 * @property {string}  [portraitUrl] Optional path/URL to a portrait image
 *                                  (e.g. "img/portraits/c01.png" or a CDN URL).
 *                                  When absent, renderPlayerPortrait falls
 *                                  back to a placeholder initials box.
 * @property {string|null} [tribe]  Optional initial tribe label (e.g. "A").
 *                                  When null/undefined, assignTribes randomizes.
 *                                  When set, must match a label from tribes.initial.
 *                                  Per-template rule: if any contestant has tribe set,
 *                                  ALL must have it (no partial assignments).
 */

/**
 * @typedef {Object} SavedSetup
 * @property {number}         schemaVersion
 * @property {string}         id          Unique identifier for storage management.
 * @property {string}         setupName   User-facing label for this saved entry.
 *                                        Defaults to template.meta.name on save.
 * @property {string}         savedAt     ISO 8601 timestamp.
 * @property {"json"}         format
 * @property {SeasonTemplate} template
 */

// ── Validators ────────────────────────────────────────────────────────────────
//
// Each returns a string[] of error messages. An empty array means valid.
// Validators do NOT throw — callers decide how to surface errors.

// Validates a single contestant entry. Used both standalone (custom-edit UI
// later) and as part of validateSeasonTemplate.
function validateContestant(c) {
  const errors = [];
  if (!c || typeof c !== "object") {
    errors.push("must be an object");
    return errors;
  }
  if (typeof c.id !== "string" || c.id.trim() === "") errors.push("id is required");
  if (typeof c.name !== "string" || c.name.trim() === "") errors.push("name is required");

  // v9.1: a contestant must have either the three new challenge sub-skills
  // OR the legacy `challenge` field (or both). normalizeContestantStats
  // will reconcile them downstream.
  const hasNum = (v) => typeof v === "number" && !Number.isNaN(v);
  const hasNewSkills =
    hasNum(c.physicalChallengeSkill) &&
    hasNum(c.mentalChallengeSkill)   &&
    hasNum(c.enduranceChallengeSkill);
  const hasLegacy = hasNum(c.challenge);
  if (!hasNewSkills && !hasLegacy) {
    errors.push("must define physicalChallengeSkill+mentalChallengeSkill+enduranceChallengeSkill (or legacy challenge)");
  }

  // Validate every present numeric stat. social and strategy remain required.
  const skillFields = [
    "physicalChallengeSkill",
    "mentalChallengeSkill",
    "enduranceChallengeSkill",
    "challenge",     // legacy; may be derived but must be in-range when present
    "social",
    "strategy",
  ];
  for (const stat of skillFields) {
    if (c[stat] === undefined) {
      // social and strategy are still required; skill fields are optional
      // individually because of the dual-format rule above.
      if (stat === "social" || stat === "strategy") {
        errors.push(`${stat} must be a number`);
      }
      continue;
    }
    const v = c[stat];
    if (typeof v !== "number" || Number.isNaN(v)) {
      errors.push(`${stat} must be a number`);
    } else if (v < STAT_MIN || v > STAT_MAX) {
      errors.push(`${stat} must be in range ${STAT_MIN}–${STAT_MAX}`);
    } else if (!Number.isInteger(v)) {
      errors.push(`${stat} must be a whole number`);
    }
  }

  if (c.description !== undefined && typeof c.description !== "string") {
    errors.push("description must be a string when provided");
  }

  // v9.3: optional portraitUrl. Browsers handle bad URLs gracefully so we
  // only check that it's a non-empty string when present.
  if (c.portraitUrl !== undefined) {
    if (typeof c.portraitUrl !== "string" || c.portraitUrl.trim() === "") {
      errors.push("portraitUrl must be a non-empty string when provided");
    }
  }

  // tribe is optional; null/undefined means "to be assigned at game start".
  // String values are validated against actual tribe labels in
  // validateSeasonTemplate's cross-field section (we don't have that context here).
  if (c.tribe !== undefined && c.tribe !== null && typeof c.tribe !== "string") {
    errors.push("tribe must be a string label or null");
  }

  return errors;
}

// Validates an entire SeasonTemplate object — top-level, sectional, and
// cross-field consistency checks (cast count = total tribe size, etc.).
function validateSeasonTemplate(t) {
  const errors = [];
  if (!t || typeof t !== "object") {
    errors.push("template must be an object");
    return errors;
  }

  if (typeof t.schemaVersion !== "number") {
    errors.push("schemaVersion must be a number");
  } else if (t.schemaVersion > SCHEMA_VERSION) {
    errors.push(`schemaVersion ${t.schemaVersion} is newer than this build supports (${SCHEMA_VERSION})`);
  }

  // ── Meta ──
  if (!t.meta || typeof t.meta !== "object") {
    errors.push("meta is required");
  } else {
    if (typeof t.meta.id !== "string" || t.meta.id.trim() === "")
      errors.push("meta.id is required");
    if (typeof t.meta.name !== "string" || t.meta.name.trim() === "")
      errors.push("meta.name (season title) cannot be blank");
  }

  // ── Tribes ──
  const initial = t.tribes?.initial;
  if (!Array.isArray(initial) || initial.length < 2) {
    errors.push("tribes.initial must be an array of at least 2 tribes");
  } else {
    const labels = new Set();
    for (let i = 0; i < initial.length; i++) {
      const tr = initial[i];
      const path = `tribes.initial[${i}]`;
      if (!tr || typeof tr !== "object") { errors.push(`${path} must be an object`); continue; }
      if (typeof tr.label !== "string" || tr.label === "") errors.push(`${path}.label is required`);
      else if (labels.has(tr.label)) errors.push(`${path}.label "${tr.label}" duplicated`);
      else labels.add(tr.label);
      // Trim-aware: blank or whitespace-only names are rejected so a stray
      // delete in an editor input fires a clear error rather than producing
      // an invisible tribe label in the UI.
      if (typeof tr.name !== "string" || tr.name.trim() === "") errors.push(`${path}.name cannot be blank`);
      if (typeof tr.color !== "string" || tr.color === "") errors.push(`${path}.color is required`);
      if (typeof tr.size !== "number" || tr.size < 1 || !Number.isInteger(tr.size))
        errors.push(`${path}.size must be a positive integer`);
    }
  }

  // ── Swap ──
  if (t.swap === undefined || t.swap === null) {
    errors.push("swap is required (set enabled:false to disable)");
  } else {
    if (typeof t.swap.enabled !== "boolean") errors.push("swap.enabled must be a boolean");
    if (t.swap.enabled) {
      if (typeof t.swap.triggerCount !== "number" || t.swap.triggerCount < 2)
        errors.push("swap.triggerCount must be a number ≥2 when swap is enabled");
    }
  }

  // ── Merge ──
  if (!t.merge || typeof t.merge !== "object") {
    errors.push("merge is required");
  } else {
    if (typeof t.merge.triggerCount !== "number" || t.merge.triggerCount < 2)
      errors.push("merge.triggerCount must be a number ≥2");
    if (typeof t.merge.tribeName !== "string" || t.merge.tribeName.trim() === "")
      errors.push("merge.tribeName cannot be blank");
    if (typeof t.merge.tribeColor !== "string" || t.merge.tribeColor === "")
      errors.push("merge.tribeColor is required");
  }

  // ── Jury ──
  if (!t.jury || typeof t.jury !== "object") {
    errors.push("jury is required");
  } else {
    if (t.jury.startTrigger !== "atMerge" && t.jury.startTrigger !== "custom")
      errors.push("jury.startTrigger must be \"atMerge\" or \"custom\"");
    if (t.jury.startTrigger === "custom" &&
        (typeof t.jury.customStartCount !== "number" || t.jury.customStartCount < 2))
      errors.push("jury.customStartCount required when startTrigger is \"custom\"");
  }

  // ── Final Tribal ──
  if (!t.finalTribal || typeof t.finalTribal !== "object") {
    errors.push("finalTribal is required");
  } else {
    if (typeof t.finalTribal.finalists !== "number"
        || t.finalTribal.finalists < 2 || t.finalTribal.finalists > 5)
      errors.push("finalTribal.finalists must be 2–5");
  }

  // ── Pacing ──
  if (!t.pacing || typeof t.pacing !== "object") {
    errors.push("pacing is required");
  } else {
    if (typeof t.pacing.campActionsPerRound !== "number" || t.pacing.campActionsPerRound < 1)
      errors.push("pacing.campActionsPerRound must be a positive integer");
  }

  // ── Idols ──
  if (!t.idols || typeof t.idols !== "object") {
    errors.push("idols is required (set enabled:false to disable)");
  } else {
    if (typeof t.idols.enabled !== "boolean")
      errors.push("idols.enabled must be a boolean");
  }

  // ── Cast ──
  if (!Array.isArray(t.cast)) {
    errors.push("cast must be an array");
  } else {
    const seenIds = new Set();
    t.cast.forEach((c, i) => {
      const cErrors = validateContestant(c);
      cErrors.forEach(e => errors.push(`cast[${i}].${e}`));
      if (typeof c?.id === "string") {
        if (seenIds.has(c.id)) errors.push(`cast[${i}].id "${c.id}" is duplicated`);
        seenIds.add(c.id);
      }
    });
  }

  // ── Cross-field consistency ──
  // Cast count must equal total tribe size — every contestant must be placed
  // on initial assignment.
  if (Array.isArray(initial) && Array.isArray(t.cast)) {
    const totalTribeSize = initial.reduce((sum, tr) => sum + (tr.size || 0), 0);
    if (t.cast.length !== totalTribeSize) {
      errors.push(`cast count (${t.cast.length}) must equal sum of tribe sizes (${totalTribeSize})`);
    }

    // Tribe pre-assignment rules:
    //   • If any contestant has tribe set, ALL must (partial states are ambiguous).
    //   • Each contestant's tribe must match a defined tribe label.
    //   • Per-tribe contestant counts must equal that tribe's `size`.
    const tribeLabels = new Set(initial.map(t => t.label));
    const someAssigned = t.cast.some(c => c?.tribe);
    const allAssigned  = t.cast.every(c => c?.tribe);

    if (someAssigned && !allAssigned) {
      errors.push("if any contestant has a starting tribe set, all must");
    }

    for (let i = 0; i < t.cast.length; i++) {
      const c = t.cast[i];
      if (c?.tribe && !tribeLabels.has(c.tribe)) {
        errors.push(`cast[${i}].tribe "${c.tribe}" is not a valid tribe label`);
      }
    }

    if (allAssigned) {
      for (const tr of initial) {
        const count = t.cast.filter(c => c.tribe === tr.label).length;
        if (count !== tr.size) {
          errors.push(`tribe "${tr.label}" has ${count} contestants assigned but config expects ${tr.size}`);
        }
      }
    }
  }

  // Swap must trigger before merge — otherwise merge fires first and swap
  // is never reached. Only enforce when swap is enabled.
  if (t.swap?.enabled
      && typeof t.swap.triggerCount === "number"
      && typeof t.merge?.triggerCount === "number"
      && t.swap.triggerCount <= t.merge.triggerCount) {
    errors.push("swap.triggerCount must be greater than merge.triggerCount");
  }

  // FTC must fire before merge would (otherwise no merge happens).
  if (typeof t.finalTribal?.finalists === "number"
      && typeof t.merge?.triggerCount === "number"
      && t.finalTribal.finalists >= t.merge.triggerCount) {
    errors.push("finalTribal.finalists must be less than merge.triggerCount");
  }

  // Custom jury start must leave room for a real jury before FTC fires —
  // and can't start before there's anyone to eliminate.
  if (t.jury?.startTrigger === "custom"
      && typeof t.jury.customStartCount === "number") {
    if (typeof t.finalTribal?.finalists === "number"
        && t.jury.customStartCount <= t.finalTribal.finalists) {
      errors.push("jury.customStartCount must be greater than finalTribal.finalists");
    }
    if (Array.isArray(t.cast) && t.jury.customStartCount > t.cast.length) {
      errors.push(
        `jury.customStartCount (${t.jury.customStartCount}) cannot exceed cast size (${t.cast.length})`
      );
    }
  }

  return errors;
}

// Validates a SavedSetup wrapper (the JSON round-trip format and the
// localStorage entry format used by savedSetups.js).
// Delegates to validateSeasonTemplate for the embedded template.
function validateSavedSetup(s) {
  const errors = [];
  if (!s || typeof s !== "object") {
    errors.push("saved setup must be an object");
    return errors;
  }
  if (typeof s.schemaVersion !== "number") errors.push("schemaVersion required");
  if (typeof s.id !== "string" || s.id.trim() === "")
    errors.push("id required (non-empty string)");
  if (typeof s.setupName !== "string" || s.setupName.trim() === "")
    errors.push("setupName required (non-empty string)");
  if (typeof s.savedAt !== "string")       errors.push("savedAt required (ISO timestamp string)");
  if (s.format !== "json")                 errors.push("format must be \"json\"");
  validateSeasonTemplate(s.template).forEach(e => errors.push(`template.${e}`));
  return errors;
}
