// challenge.js — immunity challenge calculation
//
// Two entry points:
//   runChallenge(tribes)              — pre-merge tribal immunity; returns winner/loser tribe labels
//   runIndividualChallenge(members)   — post-merge individual immunity; returns winner contestant
//
// Neither function mutates state — they compute and return result objects.
//
// v9.1 — Per-contestant challenge skill is split into three sub-skills:
//   physicalChallengeSkill, mentalChallengeSkill, enduranceChallengeSkill.
// The legacy `challenge` field is preserved as a derived stored value
// (round of the average of the three) so any reader that hasn't been
// migrated keeps working unchanged. Phase 3 will tag every CHALLENGES /
// INDIVIDUAL_CHALLENGES entry with a `type` and route the resolution math
// through `getChallengeSkillForType(c, type)`.

// ── Skill helpers (v9.1) ──────────────────────────────────────────────────────

// Returns the overall composite of a contestant's three challenge sub-skills,
// or falls back to the legacy `challenge` field if the new fields haven't
// been populated yet (e.g. during a partial mid-load state).
//
// Returned as a float in [1, 10]; UI / rounding is the caller's choice.
function getOverallChallengeSkill(c) {
  if (!c) return 5;
  const p = c.physicalChallengeSkill;
  const m = c.mentalChallengeSkill;
  const e = c.enduranceChallengeSkill;
  if (typeof p === "number" && typeof m === "number" && typeof e === "number") {
    return (p + m + e) / 3;
  }
  return c.challenge ?? 5;
}

// Returns the relevant sub-skill for a given challenge type. "mixed" averages
// either a relevant pair or all three; until Phase 3 tags challenges, the
// function returns the overall composite for unknown types.
//
// Phase 3 will pass type values like "physical" / "mental" / "endurance" /
// "mixed" from CHALLENGES entries.
function getChallengeSkillForType(c, type) {
  if (!c) return 5;
  const fallback = c.challenge ?? 5;
  switch (type) {
    case "physical":  return c.physicalChallengeSkill  ?? fallback;
    case "mental":    return c.mentalChallengeSkill    ?? fallback;
    case "endurance": return c.enduranceChallengeSkill ?? fallback;
    case "mixed":
    default:          return getOverallChallengeSkill(c);
  }
}

// Backfills missing skill fields and recomputes the legacy `challenge`
// field to equal the rounded average of the three sub-skills. Idempotent —
// safe to call repeatedly. Run once per contestant at the boot / template-
// apply boundary; everywhere else can read `c.challenge` (legacy) or
// `getOverallChallengeSkill(c)` (modern) and get a coherent number.
//
// Migration rules:
//   • If the three sub-skills are already present, recompute legacy
//     `challenge` from them. The sub-skills are the source of truth.
//   • If only legacy `challenge` is present, mirror it to all three sub-
//     skills (preserves existing balance until the user specializes).
//   • If nothing is present, default everything to 5.
function normalizeContestantStats(c) {
  if (!c) return c;
  const has = (v) => typeof v === "number" && !Number.isNaN(v);
  const legacy = has(c.challenge) ? c.challenge : null;

  if (!has(c.physicalChallengeSkill))  c.physicalChallengeSkill  = legacy ?? 5;
  if (!has(c.mentalChallengeSkill))    c.mentalChallengeSkill    = legacy ?? 5;
  if (!has(c.enduranceChallengeSkill)) c.enduranceChallengeSkill = legacy ?? 5;

  // Clamp every sub-skill to [1, 10] integer (matches social/strategy domain).
  const clamp = (n) => Math.max(1, Math.min(10, Math.round(n)));
  c.physicalChallengeSkill  = clamp(c.physicalChallengeSkill);
  c.mentalChallengeSkill    = clamp(c.mentalChallengeSkill);
  c.enduranceChallengeSkill = clamp(c.enduranceChallengeSkill);

  // Recompute legacy `challenge` as round(avg). Stored, not derived-on-read,
  // so any consumer that touches `c.challenge` directly gets a coherent
  // value with zero call-site changes.
  c.challenge = clamp(
    (c.physicalChallengeSkill + c.mentalChallengeSkill + c.enduranceChallengeSkill) / 3
  );
  return c;
}

// Convenience: normalize an array of contestants in place.
function normalizeAllContestants(list) {
  for (const c of list) normalizeContestantStats(c);
  return list;
}

// ── Effective performance rating (v9.2) ──────────────────────────────────────
//
// Centralized formula combining a contestant's three sub-skills with a
// challenge's per-skill weights. Returns a number on roughly the same
// 1–10 scale as the underlying skills, so existing math (which currently
// reads `c.challenge` and lives on a 1–10 scale) can be migrated to this
// without rebalancing thresholds.
//
//   eff = physical * w.physical + mental * w.mental + endurance * w.endurance
//
// Worked examples (with skills physical=8, mental=4, endurance=6):
//   • Pure physical (0.7/0.1/0.2):  8*0.7 + 4*0.1 + 6*0.2 = 5.6 + 0.4 + 1.2 = 7.2
//   • Pure mental    (0.1/0.7/0.2): 8*0.1 + 4*0.7 + 6*0.2 = 0.8 + 2.8 + 1.2 = 4.8
//   • Pure endurance (0.2/0.1/0.7): 8*0.2 + 4*0.1 + 6*0.7 = 1.6 + 0.4 + 4.2 = 6.2
//   • 50/50 phys+mental (0.5/0.5/0): 8*0.5 + 4*0.5 + 6*0 = 4 + 2 + 0 = 6.0
//
// This is the ONE place that decides "how does a player perform at this
// challenge?". Phase 4 will switch calcTribeScore and runIndividualChallenge
// to call this helper instead of reading c.challenge directly.
//
// Defensive defaults:
//   • If `challenge` is null/undefined or has no weights, falls back to the
//     overall composite (equivalent to all-three weighted equally).
//   • If a weight is missing, treats it as 0.
//   • Weights don't have to sum to exactly 1.0 — the function returns the
//     dot product as-is. Designers should still write weights that sum to 1
//     so the result stays on the 1–10 scale; this is a documented expectation,
//     not enforced.
function getEffectiveChallengePerformance(contestant, challenge) {
  if (!contestant) return 5;

  const p = contestant.physicalChallengeSkill  ?? contestant.challenge ?? 5;
  const m = contestant.mentalChallengeSkill    ?? contestant.challenge ?? 5;
  const e = contestant.enduranceChallengeSkill ?? contestant.challenge ?? 5;

  const weights = challenge && challenge.challengeSkillWeights;
  if (!weights) {
    // No challenge metadata → fall back to the overall composite.
    return (p + m + e) / 3;
  }

  const wp = weights.physical  ?? 0;
  const wm = weights.mental    ?? 0;
  const we = weights.endurance ?? 0;

  return p * wp + m * wm + e * we;
}

// ── Challenge typing (v9.2) ───────────────────────────────────────────────────
//
// Every challenge carries a `challengeType` and a `challengeSkillWeights`
// triple. The type is a label for UI / flavor / future filtering ("Endurance
// Hold" reads as endurance to the player). The weights are the source of
// truth for how the three sub-skills combine into an effective performance
// rating; the type is descriptive, the weights are operative.
//
// Weights are positive numbers that sum to 1. The convention is:
//
//   physical:  [0..1]   strength, speed, raw power
//   mental:    [0..1]   puzzles, memory, recall
//   endurance: [0..1]   sustained holds, willpower, fatigue resistance
//
// Pure types follow a 70 / 20 / 10 split with the dominant skill carrying
// 70% of the weight, the secondary (most-relevant cross-skill) carrying 20%,
// and the third carrying 10%. Mixed challenges split among the relevant
// skills so the total still sums to 1.
//
// Why pure-type challenges still cite cross-skills at all:
//   • "Pure" doesn't mean "only" — a real obstacle course rewards endurance
//     as well as raw strength; a real puzzle race rewards composure under
//     fatigue. Giving the cross-skills a small floor (10–20%) lets a balanced
//     player overperform a one-trick specialist by a believable margin.
//   • The base multiplier on the dominant skill is still 7×; specialization
//     wins clearly without reducing every challenge to a coin flip.

// Convenience constants — pure-type weight presets.
const CHALLENGE_WEIGHT_PHYSICAL  = { physical: 0.7, mental: 0.1, endurance: 0.2 };
const CHALLENGE_WEIGHT_MENTAL    = { physical: 0.1, mental: 0.7, endurance: 0.2 };
const CHALLENGE_WEIGHT_ENDURANCE = { physical: 0.2, mental: 0.1, endurance: 0.7 };

// ── Tribal challenges (pre-merge) ─────────────────────────────────────────────

const CHALLENGES = [
  {
    name: "Obstacle Course",
    description: "Both tribes crashed through a water obstacle course, hauling heavy crates across the finish line.",
    challengeType:         "physical",
    challengeSkillWeights: CHALLENGE_WEIGHT_PHYSICAL,
  },
  {
    name: "Puzzle Race",
    description: "Tribes raced to assemble a massive puzzle under the blazing afternoon sun. Every second counted.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
  },
  {
    name: "Endurance Hold",
    description: "Contestants gripped a weighted log above their heads for as long as they could. One tribe held on longer.",
    challengeType:         "endurance",
    challengeSkillWeights: CHALLENGE_WEIGHT_ENDURANCE,
  },
  {
    // Fire-making rewards steady technique under physical strain — equal parts
    // craft (mental composure) and physical control. Endurance matters less
    // because rounds are short.
    name: "Fire-Making Relay",
    description: "A fire-making relay stretched every competitor to their limit. Technique and composure decided it.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.4, endurance: 0.2 },
  },
  {
    name: "Memory Test",
    description: "A sequence-based memory challenge where one costly mistake at the end spelled disaster.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
  },
  {
    // Rope maze is a pattern-recognition + spatial reasoning task with a
    // suspended ball requiring steady hands. Mental dominant, physical
    // secondary, endurance light.
    name: "Rope Maze",
    description: "Tribes untangled an enormous rope maze while keeping a ball suspended. Focus won the day.",
    challengeType:         "mental",
    challengeSkillWeights: { physical: 0.2, mental: 0.7, endurance: 0.1 },
  },
  {
    // Balance beams over water are mostly endurance + body control; one slip
    // ends the run. Physical strength matters less than balance held under
    // fatigue. Mental focus is small but present.
    name: "Balance Beam",
    description: "Contestants moved across narrow balance beams over open water. One tribe kept their footing.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.2, mental: 0.1, endurance: 0.7 },
  },
];

// ── Individual challenges (post-merge) ───────────────────────────────────────

const INDIVIDUAL_CHALLENGES = [
  {
    // Perch Challenge — classic motionless stand. Endurance dominant.
    name: "Perch Challenge",
    description: "Players stood motionless on narrow perches above open water. Willpower and balance decided it.",
    challengeType:         "endurance",
    challengeSkillWeights: CHALLENGE_WEIGHT_ENDURANCE,
  },
  {
    // Weight hang — pure endurance/grip strength. Slight physical weighting
    // because raw strength buys you the first 30 seconds.
    name: "Weight Hang",
    description: "Players held their body weight suspended above the ground for as long as they could. One refused to let go.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.25, mental: 0.05, endurance: 0.7 },
  },
  {
    // Endurance Puzzle — long puzzle under brutal sun. Mental dominant but
    // endurance is the second axis; physical barely matters.
    name: "Endurance Puzzle",
    description: "A grueling individual puzzle under the midday sun. One player solved it first.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.05, mental: 0.55, endurance: 0.4 },
  },
  {
    name: "Memory Sequence",
    description: "A long sequence of symbols, recalled under pressure. One player's memory didn't crack.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
  },
  {
    // Balance Maze — tilting maze controlled with the body / hands. Reads as
    // mental (pattern + control) with meaningful physical-balance support.
    name: "Balance Maze",
    description: "Players navigated a ball through a tilting maze course. Only one made it to the end.",
    challengeType:         "mental",
    challengeSkillWeights: { physical: 0.25, mental: 0.6, endurance: 0.15 },
  },
  {
    // Individual fire-making — speed under pressure. Like the relay variant
    // but solo: weight mental composure and physical technique evenly.
    name: "Fire-Making Duel",
    description: "Every player had to make fire from scratch, racing against each other and the clock. One flame burned brightest.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.4, endurance: 0.2 },
  },
  {
    // Simmotion Obstacle — physical obstacles + final puzzle, classic two-act
    // immunity. Roughly even physical and mental, light endurance.
    name: "Simmotion Obstacle",
    description: "Players pushed through a series of physical obstacles and a final puzzle. Strength and focus both mattered.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.45, mental: 0.4, endurance: 0.15 },
  },
];

// Returns a plain result object — no state is mutated here.
//
// result.winner      "A" | "B"   — tribe that wins immunity
// result.loser       "A" | "B"   — tribe attending Tribal Council
// result.wasClose    boolean     — true if scores were within ~15% of each other
// result.name        string      — challenge name for display
// result.description string      — one-sentence flavor description
function runChallenge(tribes) {
  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];

  const scoreA = calcTribeScore(tribes.A);
  const scoreB = calcTribeScore(tribes.B);

  const winner   = scoreA >= scoreB ? "A" : "B";
  const loser    = winner === "A" ? "B" : "A";
  const gap      = Math.abs(scoreA - scoreB);
  const wasClose = gap / Math.max(scoreA, scoreB) < 0.15;

  return {
    winner,
    loser,
    wasClose,
    name:        challenge.name,
    description: challenge.description,
  };
}

// Sums the challenge stats of all tribe members, then adds bounded random noise.
// Noise scales with tribe size so upset probability stays consistent.
// Strong tribes still win most of the time; weaker tribes can pull off upsets.
// challengeRandomness=0 makes the stronger tribe win every time.
function calcTribeScore(members) {
  const base  = members.reduce((total, c) => total + c.challenge, 0);
  const noise = Math.floor(
    Math.random() * members.length * 2.5
    * (window.DEV_CONFIG?.challengeRandomness ?? 1)
  );
  return base + noise;
}

// ── Individual immunity (post-merge) ─────────────────────────────────────────

// Returns a plain result object — no state is mutated here.
//
// result.winner      contestant — the player who wins the necklace
// result.wasClose    boolean    — true if the top two scores were within 2 pts
// result.name        string     — challenge name for display
// result.description string     — one-sentence flavour description
//
// Each player's score = challenge stat + random noise (0–4).
// Higher challenge stat means more likely to win; upsets are possible.
function runIndividualChallenge(members) {
  const challenge = INDIVIDUAL_CHALLENGES[
    Math.floor(Math.random() * INDIVIDUAL_CHALLENGES.length)
  ];

  const scored = members.map(c => ({
    contestant: c,
    score: c.challenge + Math.random() * 4 * (window.DEV_CONFIG?.challengeRandomness ?? 1),
  }));
  scored.sort((a, b) => b.score - a.score);

  const winner   = scored[0].contestant;
  const wasClose = scored.length > 1 && (scored[0].score - scored[1].score) < 1.5;

  return {
    winner,
    wasClose,
    name:        challenge.name,
    description: challenge.description,
  };
}
