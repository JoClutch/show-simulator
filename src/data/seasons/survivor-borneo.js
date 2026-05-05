// survivor-borneo.js — Survivor: Borneo (v10.12)
// ════════════════════════════════════════════════════════════════════════════
//
// Authored from the official spec one episode at a time. Every value
// here was provided by the season author except:
//   • meta.description — not provided; tightly summarized from facts above.
//   • Episode 1 immunity challengeType / challengeSkillWeights — not
//     specified; defaulted to "mixed" with equal thirds since "Quest for
//     Fire" rewards rafting (physical), torch-lighting strategy (mental),
//     and sustained effort (endurance) roughly evenly.
//
// All other fields are exactly as authored.

const SURVIVOR_BORNEO_SEASON_TEMPLATE = {
  schemaVersion: SCHEMA_VERSION,

  meta: {
    id:          "survivor-borneo",
    name:        "Borneo",
    description: "The original sixteen. Pagong vs. Tagi, no idols, no swap, Final 2.",
    isPrebuilt:  true,
  },

  tribes: {
    initial: [
      { label: "A", name: "Pagong", color: "#FEE105", size: 8 },
      { label: "B", name: "Tagi",   color: "#FF7F00", size: 8 },
    ],
  },

  swap:        { enabled: false, triggerCount: null },
  merge:       { triggerCount: 10, tribeName: "Rattana", tribeColor: "#7CFC00" },
  jury:        { startTrigger: "atMerge", customStartCount: null },
  finalTribal: { finalists: 2 },                    // Borneo = Final 2
  idols:       { enabled: false },                  // Borneo had no idols
  pacing:      { campActionsPerRound: 3 },

  // ── Cast — all stats set to 5 per spec ───────────────────────────────
  cast: [
    // Pagong (Tribe A — yellow)
    { id: "bo-01", name: "B.B. Andersen",     physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-02", name: "Colleen Haskell",    physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-03", name: "Gervase Peterson",   physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-04", name: "Greg Buis",          physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-05", name: "Gretchen Cordy",     physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-06", name: "Jenna Lewis",        physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-07", name: "Joel Klug",          physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "bo-08", name: "Ramona Gray",        physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },

    // Tagi (Tribe B — orange)
    { id: "bo-09", name: "Dirk Been",          physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-10", name: "Kelly Wiglesworth",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-11", name: "Richard Hatch",      physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-12", name: "Rudy Boesch",        physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-13", name: "Sean Kenniff",       physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-14", name: "Sonja Christopher",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-15", name: "Stacey Stillman",    physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "bo-16", name: "Susan Hawk",         physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
  ],

  // ── Per-episode schedule (filling in one episode at a time) ──────────
  episodes: [
    // ─── Episode 1 ────────────────────────────────────────────────────
    // Reward Challenge: NONE in Episode 1 (per author spec). The flag
    // skipRewardChallenge:true tells the flow router to route Camp Life
    // phase 1 → Immunity directly, bypassing the Reward Challenge phase
    // entirely for this episode only.
    {
      number: 1,
      skipRewardChallenge: true,
      immunity: {
        name:        "Quest for Fire",
        description: "Tribes guide a raft while lighting torches along the way, keeping at least one hand on it at all times. Once ashore, they light the remaining torches and ignite their side of the fire spirit. The first tribe to do so wins. <a href=\"https://survivor.fandom.com/wiki/Quest_for_Fire\" target=\"_blank\" rel=\"noopener noreferrer\">Survivor Wiki</a>",
        // challengeType + weights not specified by author; defaulted to
        // "mixed" with equal thirds since the challenge rewards rafting
        // (physical), strategic torch-lighting (mental), and sustained
        // effort (endurance) roughly evenly.
        challengeType:         "mixed",
        challengeSkillWeights: { physical: 1/3, mental: 1/3, endurance: 1/3 },
      },
    },

    // Episodes 2+ are unauthored. Engine falls back to random pool
    // selection until they're filled in.
  ],
};
