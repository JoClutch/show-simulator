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
  let raw;
  if (!weights) {
    // No challenge metadata → fall back to the overall composite.
    raw = (p + m + e) / 3;
  } else {
    const wp = weights.physical  ?? 0;
    const wm = weights.mental    ?? 0;
    const we = weights.endurance ?? 0;
    raw = p * wp + m * wm + e * we;
  }

  // Optional non-linear scaling. Default exponent of 1 = no-op. See the
  // CHALLENGE_RATING_EXPONENT tuning block above for what other values do.
  if (CHALLENGE_RATING_EXPONENT === 1) return raw;
  // Pow on a 1–10 input keeps output on a finite, monotonic curve. We
  // re-scale so the maximum still lands at 10 — otherwise raising the
  // exponent would silently amplify the noise term's relative weight.
  const maxRaw = 10;
  return Math.pow(raw / maxRaw, CHALLENGE_RATING_EXPONENT) * maxRaw;
}

// Test/tooling hook — set the exponent at runtime. Returns the previous
// value so callers can restore it (used by the test suite to verify the
// curve effect without leaking state into other tests).
function setChallengeRatingExponent(value) {
  const prev = CHALLENGE_RATING_EXPONENT;
  CHALLENGE_RATING_EXPONENT = value;
  return prev;
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

// ─────────────────────────────────────────────────────────────────────────────
// TUNING CONSTANTS — pure-type weight share presets.
// ─────────────────────────────────────────────────────────────────────────────
//
// The three "share" constants below define how a pure-type challenge splits
// weight across the three sub-skills. Editing these three numbers re-tunes
// every pure-type challenge (Obstacle Course, Puzzle Race, Endurance Hold,
// Memory Test) at once — mixed challenges are written inline and unaffected.
//
// Must sum to 1.0 so the effective rating stays on the same 1–10 scale as
// the underlying skills (and the existing noise / threshold tuning stays
// calibrated).
//
//   PURE_DOMINANT_SHARE   — weight on the matching skill. Higher = sharper
//                           specialization. 0.85 makes specialists almost
//                           untouchable; 0.5 reverts to "mild specialty."
//                           Default 0.7.
//   PURE_SECONDARY_SHARE  — weight on the most-relevant cross-skill.
//                           For physical challenges this is endurance; for
//                           mental challenges, endurance again (long focus);
//                           for endurance challenges, physical (raw strength
//                           buys you the first stretch). Default 0.2.
//   PURE_TERTIARY_SHARE   — weight on the least-relevant cross-skill.
//                           Small floor (default 0.1) so balanced players
//                           still beat one-trick specialists by a believable
//                           margin even on pure challenges.
const PURE_DOMINANT_SHARE  = 0.7;
const PURE_SECONDARY_SHARE = 0.2;
const PURE_TERTIARY_SHARE  = 0.1;

// Convenience constants — pure-type weight presets, derived from the shares
// above. Don't edit these inline; edit the three share constants and let the
// presets follow.
const CHALLENGE_WEIGHT_PHYSICAL  = { physical: PURE_DOMINANT_SHARE,  mental: PURE_TERTIARY_SHARE,  endurance: PURE_SECONDARY_SHARE };
const CHALLENGE_WEIGHT_MENTAL    = { physical: PURE_TERTIARY_SHARE,  mental: PURE_DOMINANT_SHARE,  endurance: PURE_SECONDARY_SHARE };
const CHALLENGE_WEIGHT_ENDURANCE = { physical: PURE_SECONDARY_SHARE, mental: PURE_TERTIARY_SHARE,  endurance: PURE_DOMINANT_SHARE  };

// ─────────────────────────────────────────────────────────────────────────────
// TUNING CONSTANTS — non-linear scaling hook.
// ─────────────────────────────────────────────────────────────────────────────
//
// Optional exponent applied to the per-contestant effective rating before it
// enters the score sum. Default 1 (linear, no effect). Raising this above 1
// makes high-skill players disproportionately dominant; lowering it below 1
// flattens the curve so even low-skill players have a real chance.
//
//   1.0  — linear (default; behavior identical to v9.2.0)
//   1.5  — strong skill amplification: a 9-rated player swamps a 5-rated one
//   0.7  — flatter curve: 9-rated still favored but 5-rated is competitive
//
// Defined as a let so dev panel / tests can override at runtime. Read once
// per call — there's no caching, so live changes take effect immediately.
let CHALLENGE_RATING_EXPONENT = 1.0;

// ── Tribal challenges (pre-merge) ─────────────────────────────────────────────
//
// v10.6 schema (additive — older callers ignore unknown fields):
//   name                  string   Display name on the challenge type label.
//   description           string   Physical description of what happened.
//   challengeType         string   "physical" | "mental" | "endurance" | "mixed".
//   challengeSkillWeights object   { physical, mental, endurance } summing to 1.
//   purpose               string   "immunity" | "reward" — distinguishes the
//                                  two pools at the data layer. Lets future
//                                  code filter / assert / branch on category
//                                  without inspecting which array an entry
//                                  came from.
//
//   Reward-only fields (REWARD_CHALLENGES / INDIVIDUAL_REWARD_CHALLENGES):
//   rewardType            string   Generic category — "food" | "comfort" |
//                                  "supplies" | "communication" | "luxury" |
//                                  "family". Used for sorting / filtering /
//                                  future reward-system gating.
//   rewardLabel           string   What the winner gets, written to fit a
//                                  sentence: "Wins {rewardLabel}".
//                                  Examples: "a beachside picnic",
//                                  "letters from home", "fishing supplies".
//   rewardSubcopy         string   One-line richer description shown under
//                                  the winner. E.g. "Fresh fruit, grilled
//                                  fish, cold drinks. Worth every step."

const CHALLENGES = [
  {
    name: "Obstacle Course",
    description: "Both tribes crashed through a water obstacle course, hauling heavy crates across the finish line.",
    challengeType:         "physical",
    challengeSkillWeights: CHALLENGE_WEIGHT_PHYSICAL,
    purpose:               "immunity",
  },
  {
    name: "Puzzle Race",
    description: "Tribes raced to assemble a massive puzzle under the blazing afternoon sun. Every second counted.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
    purpose:               "immunity",
  },
  {
    name: "Endurance Hold",
    description: "Contestants gripped a weighted log above their heads for as long as they could. One tribe held on longer.",
    challengeType:         "endurance",
    challengeSkillWeights: CHALLENGE_WEIGHT_ENDURANCE,
    purpose:               "immunity",
  },
  {
    // Fire-making rewards steady technique under physical strain — equal parts
    // craft (mental composure) and physical control. Endurance matters less
    // because rounds are short.
    name: "Fire-Making Relay",
    description: "A fire-making relay stretched every competitor to their limit. Technique and composure decided it.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.4, endurance: 0.2 },
    purpose:               "immunity",
  },
  {
    name: "Memory Test",
    description: "A sequence-based memory challenge where one costly mistake at the end spelled disaster.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
    purpose:               "immunity",
  },
  {
    // Rope maze is a pattern-recognition + spatial reasoning task with a
    // suspended ball requiring steady hands. Mental dominant, physical
    // secondary, endurance light.
    name: "Rope Maze",
    description: "Tribes untangled an enormous rope maze while keeping a ball suspended. Focus won the day.",
    challengeType:         "mental",
    challengeSkillWeights: { physical: 0.2, mental: 0.7, endurance: 0.1 },
    purpose:               "immunity",
  },
  {
    // Balance beams over water are mostly endurance + body control; one slip
    // ends the run. Physical strength matters less than balance held under
    // fatigue. Mental focus is small but present.
    name: "Balance Beam",
    description: "Contestants moved across narrow balance beams over open water. One tribe kept their footing.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.2, mental: 0.1, endurance: 0.7 },
    purpose:               "immunity",
  },
];

// ── Reward challenges (v10.4 → v10.6) ────────────────────────────────────────
//
// Reward challenges are a *flavor* phase added before each immunity
// challenge. They use the same skill-weighting and noise math as immunity
// challenges (the engine doesn't distinguish them), but the resolution
// screen reads from this pool instead of CHALLENGES so the names + flavor
// read as rewards (food, comfort, supplies, family visits) rather than
// immunity stakes (obstacle courses, puzzles).
//
// v10.6: each reward entry now also carries:
//   purpose:       "reward"     — distinguishes from "immunity" pool entries
//   rewardType:    string       — generic category (food / comfort / supplies
//                                 / communication / luxury / family)
//   rewardLabel:   string       — fits "Wins {rewardLabel}" in the outcome card
//   rewardSubcopy: string       — richer one-line description below the winner
//
// DESIGN RULE: reward outcomes are FLAVOR ONLY through v10.6. They don't
// grant idol clues, don't change immunity, don't affect alliances, don't
// touch AI. The fields written to gameState.rewardWinner / rewardChallenge
// exist for display purposes only.

// Generic reward type vocabulary. Centralized so the screen / future
// camp-resource system / dev panel filtering all share the same set.
const REWARD_TYPES = {
  FOOD:          "food",          // meals, snacks, comfort food
  COMFORT:       "comfort",       // spa, rest, soft beds
  SUPPLIES:      "supplies",      // tarp, fishing gear, spices, blankets
  COMMUNICATION: "communication", // letters, video, calls home
  LUXURY:        "luxury",        // sailing, helicopter, sunset cruise
  FAMILY:        "family",        // family / loved one visit (rare)
};

const REWARD_CHALLENGES = [
  {
    name: "Beach Picnic",
    description: "Tribes raced through a sand-dune obstacle to a beachside spread of fresh fruit, grilled fish, and cold drinks.",
    challengeType:         "physical",
    challengeSkillWeights: CHALLENGE_WEIGHT_PHYSICAL,
    purpose:               "reward",
    rewardType:            REWARD_TYPES.FOOD,
    rewardLabel:           "a beachside picnic",
    rewardSubcopy:         "Fresh fruit, grilled fish, and cold drinks under a palm canopy.",
  },
  {
    name: "Sailboat Cruise",
    description: "A late-afternoon sailboat cruise around the bay was the prize — but only for the tribe that solved the navigation puzzle first.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
    purpose:               "reward",
    rewardType:            REWARD_TYPES.LUXURY,
    rewardLabel:           "an afternoon sailing the bay",
    rewardSubcopy:         "Wind, salt spray, and a cooler of beers — three hours away from camp.",
  },
  {
    name: "Pizza Drop",
    description: "Stacked pizza boxes hung at the top of a slick pole. The tribe with the strongest climbers feasted first.",
    challengeType:         "physical",
    challengeSkillWeights: { physical: 0.65, mental: 0.1, endurance: 0.25 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.FOOD,
    rewardLabel:           "a pizza-and-beer feast",
    rewardSubcopy:         "Hot, greasy, exactly what nobody at camp has tasted in weeks.",
  },
  {
    name: "Letters from Home",
    description: "Tribes pulled rope through a gauntlet of stations. The first to deliver their tribemates' letters got the longest read.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.5, mental: 0.3, endurance: 0.2 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.COMMUNICATION,
    rewardLabel:           "letters from home",
    rewardSubcopy:         "Pages of news from family, read aloud or in silent corners of camp.",
  },
  {
    name: "Camp Upgrade",
    description: "Tribes hauled crates of building supplies across a shallow channel. The faster tribe earned the better camp materials.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.45, mental: 0.05, endurance: 0.5 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.SUPPLIES,
    rewardLabel:           "a tarp, blankets, and a real cooking pot",
    rewardSubcopy:         "Camp gets warmer, drier, and a meal feels like a meal again.",
  },
  {
    name: "Spice Box Relay",
    description: "A relay-and-puzzle hybrid. The tribe that finished both halves first claimed the prize box.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.35, mental: 0.45, endurance: 0.2 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.SUPPLIES,
    rewardLabel:           "a spice box and cooking oil",
    rewardSubcopy:         "Fish stew with actual flavor tonight, instead of just rice and salt.",
  },
  {
    name: "Fishing Gear Race",
    description: "Tribes paddled out to retrieve crates from offshore buoys. Whoever reached camp first kept the gear.",
    challengeType:         "physical",
    challengeSkillWeights: { physical: 0.55, mental: 0.1, endurance: 0.35 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.SUPPLIES,
    rewardLabel:           "a tackle box, fishing line, and a spear",
    rewardSubcopy:         "Real gear means real protein for the rest of the season.",
  },
  {
    name: "Sunset Helicopter",
    description: "Tribes raced to assemble a flagged ladder up a sea cliff. The first to plant their banner caught the last seats out.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.3, endurance: 0.3 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.LUXURY,
    rewardLabel:           "a sunset helicopter ride",
    rewardSubcopy:         "Forty-five minutes over the archipelago, then dinner waiting on the beach.",
  },
];

// ── Individual reward challenges (post-merge) ────────────────────────────────
const INDIVIDUAL_REWARD_CHALLENGES = [
  {
    name: "Solo Picnic",
    description: "A guided trek up a coastal cliff to a private picnic with chilled wine and a sunset view.",
    challengeType:         "endurance",
    challengeSkillWeights: CHALLENGE_WEIGHT_ENDURANCE,
    purpose:               "reward",
    rewardType:            REWARD_TYPES.FOOD,
    rewardLabel:           "a private cliff-top picnic",
    rewardSubcopy:         "Chilled wine, a real meal, and a view that doesn't include a Tribal Council mat.",
  },
  {
    name: "Family Visit",
    description: "A loved one waited at a comfort camp on the far side of the island. Only one player would reach them today.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.35, endurance: 0.25 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.FAMILY,
    rewardLabel:           "an afternoon with a loved one",
    rewardSubcopy:         "Three hours of being known again. Worth more than anything in the game.",
  },
  {
    name: "Helicopter Tour",
    description: "An aerial sightseeing tour over the archipelago — the first to thread a marble through a tilting maze claimed the seat.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
    purpose:               "reward",
    rewardType:            REWARD_TYPES.LUXURY,
    rewardLabel:           "a helicopter tour of the archipelago",
    rewardSubcopy:         "An hour above the water, then dinner at a private overlook.",
  },
  {
    name: "Spa Reward",
    description: "A massage, a hot meal, and an actual bed. Contestants raced to be the one player who slept somewhere soft tonight.",
    challengeType:         "physical",
    challengeSkillWeights: { physical: 0.55, mental: 0.15, endurance: 0.3 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.COMFORT,
    rewardLabel:           "a spa night with a hot meal and a real bed",
    rewardSubcopy:         "Massage, shower, fresh sheets. Back to camp tomorrow as a different person.",
  },
  {
    name: "Letters and Care Package",
    description: "Players raced through a memory-sequence course. The first to recall every symbol earned a sealed package from home.",
    challengeType:         "mental",
    challengeSkillWeights: { physical: 0.1, mental: 0.7, endurance: 0.2 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.COMMUNICATION,
    rewardLabel:           "a care package and a video from home",
    rewardSubcopy:         "Photos, a hand-written note, and ten minutes of footage of people who love you.",
  },
  {
    name: "Camp Resupply",
    description: "A solo endurance hang. The longest hold won an island-wide supply drop for their personal use at camp.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.25, mental: 0.05, endurance: 0.7 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.SUPPLIES,
    rewardLabel:           "a tarp, blanket, and pillow for camp",
    rewardSubcopy:         "Three things that make every remaining night easier.",
  },
  {
    name: "Steak Dinner",
    description: "A grueling water-balance task. Last player standing claimed a steak dinner with all the trimmings.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.3, mental: 0.1, endurance: 0.6 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.FOOD,
    rewardLabel:           "a steak dinner with all the sides",
    rewardSubcopy:         "Real protein, real fat, real seasoning. The body remembers.",
  },
  {
    name: "Sunset Cruise",
    description: "A puzzle-and-paddle race to a moored sailboat. The first to board kept it for the evening.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.4, endurance: 0.2 },
    purpose:               "reward",
    rewardType:            REWARD_TYPES.LUXURY,
    rewardLabel:           "a sunset sailing trip",
    rewardSubcopy:         "Two hours on open water with a meal, a drink, and quiet that camp never has.",
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
    purpose:               "immunity",
  },
  {
    // Weight hang — pure endurance/grip strength. Slight physical weighting
    // because raw strength buys you the first 30 seconds.
    name: "Weight Hang",
    description: "Players held their body weight suspended above the ground for as long as they could. One refused to let go.",
    challengeType:         "endurance",
    challengeSkillWeights: { physical: 0.25, mental: 0.05, endurance: 0.7 },
    purpose:               "immunity",
  },
  {
    // Endurance Puzzle — long puzzle under brutal sun. Mental dominant but
    // endurance is the second axis; physical barely matters.
    name: "Endurance Puzzle",
    description: "A grueling individual puzzle under the midday sun. One player solved it first.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.05, mental: 0.55, endurance: 0.4 },
    purpose:               "immunity",
  },
  {
    name: "Memory Sequence",
    description: "A long sequence of symbols, recalled under pressure. One player's memory didn't crack.",
    challengeType:         "mental",
    challengeSkillWeights: CHALLENGE_WEIGHT_MENTAL,
    purpose:               "immunity",
  },
  {
    // Balance Maze — tilting maze controlled with the body / hands. Reads as
    // mental (pattern + control) with meaningful physical-balance support.
    name: "Balance Maze",
    description: "Players navigated a ball through a tilting maze course. Only one made it to the end.",
    challengeType:         "mental",
    challengeSkillWeights: { physical: 0.25, mental: 0.6, endurance: 0.15 },
    purpose:               "immunity",
  },
  {
    // Individual fire-making — speed under pressure. Like the relay variant
    // but solo: weight mental composure and physical technique evenly.
    name: "Fire-Making Duel",
    description: "Every player had to make fire from scratch, racing against each other and the clock. One flame burned brightest.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.4, mental: 0.4, endurance: 0.2 },
    purpose:               "immunity",
  },
  {
    // Simmotion Obstacle — physical obstacles + final puzzle, classic two-act
    // immunity. Roughly even physical and mental, light endurance.
    name: "Simmotion Obstacle",
    description: "Players pushed through a series of physical obstacles and a final puzzle. Strength and focus both mattered.",
    challengeType:         "mixed",
    challengeSkillWeights: { physical: 0.45, mental: 0.4, endurance: 0.15 },
    purpose:               "immunity",
  },
];

// ── Per-episode challenge schedule (v10.11) ─────────────────────────────────
//
// Pre-built seasons can pin specific challenges to specific episodes via
// gameState.season.episodes (which startGame copies from template.episodes).
// This resolver looks up the current episode's entry, finds the named
// challenge in the right pool, and returns the challenge object — which
// the screen layer then passes to runChallenge / runIndividualChallenge
// as a forced override of the random pick.
//
// Returns null when:
//   • The current season has no schedule (gameState.season.episodes is
//     empty or missing) — the demo case.
//   • The current episode index has no entry in the schedule — partial
//     authoring case (Episode 1 scheduled, Episode 2 unscheduled).
//   • The entry doesn't carry a challenge for this purpose (e.g., an
//     entry with only `immunity` set, asking for `reward`).
//   • The named challengeRef can't be found in the appropriate pool —
//     logs a console.error so misnamed refs surface in dev.
//
// Caller treats null as "fall back to random pick" — same behavior as
// every season had before this resolver existed.
//
// Episode numbering: 1-indexed in the data layer (matches gameState.round).
// We index into the array as round - 1.
//
//   purpose: "reward" | "immunity"
function getScheduledChallenge(state, purpose) {
  const episodes = state?.season?.episodes;
  if (!Array.isArray(episodes) || episodes.length === 0) return null;

  const round = state.round ?? 1;
  const entry = episodes[round - 1];
  if (!entry) return null;

  const slot = entry[purpose];
  if (!slot) return null;

  const isMerged = !!state.merged;
  const pool =
    purpose === "reward"
      ? (isMerged ? INDIVIDUAL_REWARD_CHALLENGES : REWARD_CHALLENGES)
      : (isMerged ? INDIVIDUAL_CHALLENGES        : CHALLENGES);

  // Inline custom challenge — slot has its own name + description (and
  // optionally weights, reward labels). Used for one-off bespoke
  // challenges that don't exist in any pool.
  if (typeof slot.name === "string" && !slot.challengeRef) {
    return _materializeInlineChallenge(slot, purpose);
  }

  // Reference into the engine pool by name.
  const ref = slot.challengeRef;
  if (typeof ref !== "string" || ref.trim() === "") return null;

  const found = pool.find(c => c.name === ref);
  if (!found) {
    console.error(
      `[getScheduledChallenge] season '${state.season?.seasonId}' episode ${round} ` +
      `references unknown ${purpose} challengeRef '${ref}'. ` +
      `Falling back to random pick.`
    );
    return null;
  }
  return found;
}

// Builds a complete challenge object from an inline schedule entry.
// Fills in sensible defaults for any field the author left out so the
// existing scoring + display code can consume it without special cases.
function _materializeInlineChallenge(slot, purpose) {
  const c = {
    name:                  slot.name,
    description:           slot.description ?? "",
    challengeType:         slot.challengeType ?? "mixed",
    challengeSkillWeights: slot.challengeSkillWeights ?? { physical: 1/3, mental: 1/3, endurance: 1/3 },
    purpose,
  };
  if (purpose === "reward") {
    c.rewardType    = slot.rewardType    ?? "supplies";
    c.rewardLabel   = slot.rewardLabel   ?? "the reward";
    c.rewardSubcopy = slot.rewardSubcopy ?? "";
  }
  return c;
}

// ── Tunable balance constants (v9.2) ─────────────────────────────────────────
//
// Centralized so designers can tweak feel without hunting through math.
// All multiplied by window.DEV_CONFIG?.challengeRandomness (default 1) so
// dev panel can dial randomness up/down at runtime without code changes.
//
// TRIBE_NOISE_PER_MEMBER:
//   Per-member random noise added to the tribe sum. With members=8 and
//   the default 2.5, max noise per tribe is 8 * 2.5 = 20 — meaningful next
//   to a base sum around 40–60, so upsets are possible but not common.
//   Lower this to make skill more decisive; raise it for more variance.
//
// INDIVIDUAL_NOISE_RANGE:
//   The flat ±range of noise added to each individual contestant's
//   effective rating. With the rating on a 1–10 scale, a value of 4 means
//   noise can add up to +4 — enough that a 6-rated player can occasionally
//   beat a 9-rated one but won't usually.
const TRIBE_NOISE_PER_MEMBER  = 2.5;
const INDIVIDUAL_NOISE_RANGE  = 4;

// Threshold for the "close finish" tag on tribe results — relative gap
// below which the result reads as a near-miss rather than a blowout.
const TRIBE_CLOSE_FINISH_RATIO    = 0.15;
const INDIVIDUAL_CLOSE_FINISH_GAP = 1.5;

// Returns a plain result object — no state is mutated here.
//
// result.winner          "A" | "B"   — tribe that wins immunity
// result.loser           "A" | "B"   — tribe attending Tribal Council
// result.wasClose        boolean     — scores within TRIBE_CLOSE_FINISH_RATIO
// result.name            string      — challenge name for display
// result.description     string      — one-sentence flavor description
// result.challengeType   string      — "physical" | "mental" | "endurance" | "mixed"
// result.topPerformer    contestant  — best effective-rating contestant in winning tribe
// result.weakestPerformer contestant — worst effective-rating contestant in losing tribe
//
// v9.2: scoring now goes through getEffectiveChallengePerformance, so the
// chosen challenge's per-skill weights drive the result. A tribe stacked
// with mental specialists will reliably win Puzzle Race; an endurance-heavy
// tribe will reliably win Endurance Hold.
// v10.4: optional `pool` argument lets reward challenges reuse this same
// resolution math without duplicating the function. Default = CHALLENGES
// (immunity), so existing callers are unchanged.
//
// v10.11: optional `forceChallenge` argument lets a pre-built season pin
// a specific challenge to this round. When non-null, the random pick is
// skipped and the supplied challenge object is used. Skill-weighting +
// noise math run identically — only the choice of which challenge is
// fixed.
function runChallenge(tribes, pool = CHALLENGES, forceChallenge = null) {
  const challenge = forceChallenge ?? pool[Math.floor(Math.random() * pool.length)];

  const evalA = evaluateTribe(tribes.A, challenge);
  const evalB = evaluateTribe(tribes.B, challenge);

  const winner   = evalA.score >= evalB.score ? "A" : "B";
  const loser    = winner === "A" ? "B" : "A";
  const gap      = Math.abs(evalA.score - evalB.score);
  const wasClose = gap / Math.max(evalA.score, evalB.score) < TRIBE_CLOSE_FINISH_RATIO;

  const winningEval = winner === "A" ? evalA : evalB;
  const losingEval  = winner === "A" ? evalB : evalA;

  return {
    winner,
    loser,
    wasClose,
    name:             challenge.name,
    description:      challenge.description,
    challengeType:    challenge.challengeType,
    topPerformer:     winningEval.top,        // for narrative hooks
    weakestPerformer: losingEval.weakest,     // for narrative hooks
    // v10.6: pass-through fields for reward challenges. undefined when the
    // pool is the immunity CHALLENGES array — reward consumers null-check.
    purpose:          challenge.purpose,
    rewardType:       challenge.rewardType,
    rewardLabel:      challenge.rewardLabel,
    rewardSubcopy:    challenge.rewardSubcopy,
  };
}

// Computes a tribe's aggregate score plus picks the best/worst performer
// for narrative use. Pure: doesn't mutate, doesn't read state.
//
// Aggregate is the sum of effective ratings (each 1–10) plus per-member noise.
// Sum (not average) because larger tribes legitimately have more total work
// done — matters when tribes get uneven through swap/elimination.
function evaluateTribe(members, challenge) {
  if (!members || members.length === 0) {
    return { score: 0, ratings: [], top: null, weakest: null };
  }

  const randomnessMul = window.DEV_CONFIG?.challengeRandomness ?? 1;

  // Per-member effective ratings — useful for both aggregate and narrative.
  const ratings = members.map(c => ({
    contestant: c,
    rating:     getEffectiveChallengePerformance(c, challenge),
  }));

  const base  = ratings.reduce((sum, r) => sum + r.rating, 0);
  const noise = Math.random() * members.length * TRIBE_NOISE_PER_MEMBER * randomnessMul;

  // Best / worst by effective rating (skill, not roll-affected). The tribe
  // result tells you who carried it, regardless of who got lucky on noise.
  const sorted  = [...ratings].sort((a, b) => b.rating - a.rating);
  const top     = sorted[0]?.contestant ?? null;
  const weakest = sorted[sorted.length - 1]?.contestant ?? null;

  return { score: base + noise, ratings, top, weakest };
}

// Legacy helper — kept as a wrapper so any caller outside engine/challenge.js
// that imported it still works. New code should use evaluateTribe directly.
// challengeRandomness=0 makes the stronger tribe win every time.
function calcTribeScore(members, challenge) {
  return evaluateTribe(members, challenge ?? null).score;
}

// ── Individual immunity (post-merge) ─────────────────────────────────────────

// Returns a plain result object — no state is mutated here.
//
// result.winner          contestant — the player who wins the necklace
// result.runnerUp        contestant — second place, for narrative hooks
// result.wasClose        boolean    — top two within INDIVIDUAL_CLOSE_FINISH_GAP
// result.name            string     — challenge name for display
// result.description     string     — one-sentence flavour description
// result.challengeType   string     — "physical" | "mental" | "endurance" | "mixed"
// result.weakestPerformer contestant — lowest effective rating, for narrative
//
// v9.2: each player's score uses getEffectiveChallengePerformance against
// the chosen challenge's weights, plus noise. Higher relevant skill = more
// likely to win; upsets remain possible via the noise term.
// v10.4: optional `pool` argument; default = INDIVIDUAL_CHALLENGES (immunity).
// v10.11: optional `forceChallenge` argument; when supplied, pins the
// challenge instead of picking randomly from the pool.
function runIndividualChallenge(members, pool = INDIVIDUAL_CHALLENGES, forceChallenge = null) {
  const challenge = forceChallenge ?? pool[Math.floor(Math.random() * pool.length)];

  const randomnessMul = window.DEV_CONFIG?.challengeRandomness ?? 1;

  const scored = members.map(c => {
    const rating = getEffectiveChallengePerformance(c, challenge);
    return {
      contestant: c,
      rating,
      score:      rating + Math.random() * INDIVIDUAL_NOISE_RANGE * randomnessMul,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const winner   = scored[0].contestant;
  const runnerUp = scored.length > 1 ? scored[1].contestant : null;
  const wasClose = scored.length > 1 &&
                   (scored[0].score - scored[1].score) < INDIVIDUAL_CLOSE_FINISH_GAP;

  // Weakest performer (by skill, not by roll) for narrative — useful for
  // "X never had a chance at this one" flavor in future copy.
  const sortedByRating = [...scored].sort((a, b) => a.rating - b.rating);
  const weakestPerformer = sortedByRating[0]?.contestant ?? null;

  return {
    winner,
    runnerUp,
    wasClose,
    name:             challenge.name,
    description:      challenge.description,
    challengeType:    challenge.challengeType,
    weakestPerformer,
    // v10.6: reward pass-through fields (undefined for immunity pool).
    purpose:          challenge.purpose,
    rewardType:       challenge.rewardType,
    rewardLabel:      challenge.rewardLabel,
    rewardSubcopy:    challenge.rewardSubcopy,
  };
}
