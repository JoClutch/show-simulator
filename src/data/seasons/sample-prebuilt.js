// sample-prebuilt.js — placeholder pre-built season (v10.9)
//
// FRAMEWORK DEMONSTRATION — this file exists to prove the pre-built
// season pipeline (template registry → dispatcher → boot tail → cast pick)
// works end-to-end with a season that isn't the demo. Real authored
// seasons (Borneo, Australia, etc.) will go in their own files in this
// same directory and follow the same shape.
//
// ── Authoring notes for future pre-built seasons ─────────────────────────
//
// • Declare ONE top-level constant per file. Name it
//   `<SEASON_NAME>_SEASON_TEMPLATE` so the seasons registry can resolve
//   it via window[templateRef].
// • Match the existing template shape from src/data/seasonPresets.js
//   (DEFAULT_SEASON_TEMPLATE) — the schema validator + applyTemplate
//   already handle the standard fields.
// • Add the corresponding entry to SEASONS in src/data/seasons.js.
// • Add a <script src> line to index.html before seasons.js so the
//   constant is on window when the registry loads.
// • Cast stats for pre-built seasons default to all 5 (per spec) until
//   per-contestant skill values are decided.
//
// Per-episode challenge scheduling (e.g., "Episode 3 always runs the Rope
// Maze immunity challenge") will be added in a later phase — for v10.9 the
// engine still uses random pool selection, exactly as it does for the demo.

const SAMPLE_PREBUILT_SEASON_TEMPLATE = {
  schemaVersion: SCHEMA_VERSION,

  meta: {
    id:          "sample-prebuilt",
    name:        "Sample Pre-Built Season",
    description: "A placeholder season used to demonstrate the pre-built season pipeline. Sixteen castaways, two tribes, standard rules. Real authored seasons will replace this.",
    isPrebuilt:  true,
  },

  tribes: {
    initial: [
      { label: "A", name: "Lumara", color: "#d4793b", size: 8 },
      { label: "B", name: "Volari", color: "#3a8c8f", size: 8 },
    ],
  },

  swap:        { enabled: false, triggerCount: null },
  merge:       { triggerCount: 10, tribeName: "Solstice", tribeColor: "#9b59b6" },
  jury:        { startTrigger: "atMerge", customStartCount: null },
  finalTribal: { finalists: 3 },
  idols:       { enabled: true },
  pacing:      { campActionsPerRound: 3 },

  // 16 placeholder contestants. All stats set to 5 per the v10.9 spec —
  // real authored seasons will tune per-contestant skills. Tribes are
  // pre-assigned so the season always plays out with the same opening
  // tribe composition (the "fixed template every time" contract).
  cast: [
    { id: "p01", name: "Aria Calder",   physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p02", name: "Beck Holloway", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p03", name: "Cleo Vasquez",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p04", name: "Devon Park",    physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p05", name: "Elena Ríos",    physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p06", name: "Finn Carrick",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p07", name: "Gigi Tanaka",   physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p08", name: "Holt Bremmer",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "p09", name: "Iris Donnelly", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p10", name: "Jude Mortensen", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p11", name: "Kira Albright", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p12", name: "Levi Strand",   physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p13", name: "Mira Okonkwo",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p14", name: "Noah Castellan", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p15", name: "Ophelia Wren",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "p16", name: "Pax Lindgren",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
  ],

  // ── Per-episode schedule (v10.9: framework only — empty for now) ──────
  // Future phases will fill this with episode entries that name specific
  // reward + immunity challenges. The engine falls back to random pool
  // selection for any episode without a scheduled entry.
  //
  // Future entry shape:
  //   { number: 1, title: "Episode title",
  //     reward:   { challengeRef: "Beach Picnic" },
  //     immunity: { challengeRef: "Obstacle Course" } }
  episodes: [],
};
