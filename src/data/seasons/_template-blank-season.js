// _template-blank-season.js — Pre-Built Season Authoring Template (v10.10)
// ════════════════════════════════════════════════════════════════════════════
//
// PURPOSE
//   This file is a COPY-PASTE SOURCE, not a runtime season. The leading
//   underscore in the filename keeps it grouped at the top of this
//   directory and signals "not loaded by the game."
//
//   It is intentionally NOT included in index.html. If you load it,
//   nothing breaks — the constant just sits on window unused. But the
//   convention is: copy this file, rename, fill in, then add the new
//   file to index.html and to src/data/seasons.js.
//
// ── HOW TO USE ─────────────────────────────────────────────────────────────
//
//   1. Copy this file to src/data/seasons/<your-season-id>.js
//      (e.g., src/data/seasons/survivor-borneo.js).
//   2. Rename the constant from BLANK_SEASON_TEMPLATE to whatever your
//      season needs (e.g., SURVIVOR_BORNEO_SEASON_TEMPLATE). The name
//      MUST be globally unique because src/data/seasons.js looks it up
//      via window[templateRef].
//   3. Replace every value marked TODO. Required vs optional fields are
//      labeled in section comments.
//   4. Add a <script src> line for your new file in index.html, before
//      the existing <script src="src/data/seasons.js"> line.
//   5. Add a registry entry in src/data/seasons.js:
//        {
//          id:          "<your-season-id>",
//          showId:      "survivor",
//          name:        "<Display Name>",
//          description: "<one-line description for the card>",
//          type:        "prebuilt",
//          templateRef: "<YOUR_CONSTANT_NAME>",
//          available:   true,    // false → renders as "Coming Soon" tile
//        }
//   6. Hard-refresh and your season appears on the show page.
//
// ── REQUIRED VS OPTIONAL FIELDS (high-level) ───────────────────────────────
//
//   Required:
//     schemaVersion, meta.{id,name,description}, tribes.initial[],
//     swap, merge, jury, finalTribal, idols, pacing, cast[]
//
//   Optional:
//     meta.isPrebuilt (defaults true if you copy this), episodes[]
//     (per-episode challenge scheduling), per-contestant tribe
//     (omit and assignTribes randomizes), per-contestant description
//
// ── DESIGN RULES ───────────────────────────────────────────────────────────
//
//   • All cast stats default to 5 in this blank template (per the v10
//     authoring rule). Override individual values later if/when stats
//     are tuned per contestant.
//   • A pre-built season MUST load identically every time. Do not
//     introduce randomized fields here — randomness lives in the engine
//     (challenge resolution, AI behavior). The template is the fixed
//     "set-design" of the season.
//   • The episodes[] array is OPTIONAL. With it empty (the v10.10
//     default), challenges are drawn randomly from the engine pools
//     (same as the demo season). Filling in episodes[] makes that
//     specific episode's challenges fixed.
//
// ════════════════════════════════════════════════════════════════════════════

const BLANK_SEASON_TEMPLATE = {
  // ── Schema version ──────────────────────────────────────────────────────
  // Required. Always set to SCHEMA_VERSION (declared in seasonPresets.js).
  // The validator rejects templates from a future schema version.
  schemaVersion: SCHEMA_VERSION,

  // ── Season metadata ─────────────────────────────────────────────────────
  // All three fields are required. Used by the season-select card and by
  // any future tooling that lists / filters seasons.
  meta: {
    id:          "TODO-season-id",            // unique slug, lowercase + dashes
    name:        "TODO Season Name",          // shown on the season card
    description: "TODO one-sentence summary shown under the card name.",
    isPrebuilt:  true,                        // marks this as a pre-built season
  },

  // ── Tribes ──────────────────────────────────────────────────────────────
  // Required. Each entry is a starting tribe. Pre-built seasons typically
  // ship two tribes; the engine supports more if needed.
  //
  //   label string  Internal id ("A", "B", "C", ...). Referenced by
  //                 contestant.tribe.
  //   name  string  Display name (e.g. "Pagong").
  //   color string  CSS hex used for the tribe stripe + portrait tint.
  //   size  int     How many contestants start on this tribe. Sum of
  //                 sizes MUST equal cast.length.
  tribes: {
    initial: [
      { label: "A", name: "TODO Tribe A Name", color: "#cccccc", size: 8 },
      { label: "B", name: "TODO Tribe B Name", color: "#888888", size: 8 },
    ],
  },

  // ── Swap (optional but field is required) ──────────────────────────────
  // For seasons without a tribe swap, set enabled:false and triggerCount:null.
  // For seasons with a swap, enabled:true and triggerCount = remaining
  // count at which the swap fires (e.g., 12).
  swap: {
    enabled:      false,
    triggerCount: null,
  },

  // ── Merge ───────────────────────────────────────────────────────────────
  // Required. Merge fires when remaining cast falls to triggerCount.
  // Standard Survivor merge is at 10–13 remaining; tune to match the
  // season being recreated.
  merge: {
    triggerCount: 10,
    tribeName:    "TODO Merge Tribe Name",
    tribeColor:   "#9b59b6",
  },

  // ── Jury ────────────────────────────────────────────────────────────────
  // Required. Determines when boots start joining the jury.
  //   "atMerge"  — every post-merge boot becomes a juror (most common)
  //   "custom"   — jury starts when remaining ≤ customStartCount
  jury: {
    startTrigger:     "atMerge",
    customStartCount: null,
  },

  // ── Finale format ───────────────────────────────────────────────────────
  // Required. finalists = number of players at Final Tribal Council.
  // Most modern Survivor seasons are 3; classic seasons (Borneo through
  // Palau) were 2.
  finalTribal: {
    finalists: 3,
  },

  // ── Idols / advantages / twists ─────────────────────────────────────────
  // Required. For v10 only the on/off toggle exists; per-season idol
  // counts, hidden-vs-earned variants, and other twist mechanics will
  // extend this section additively in future schema versions.
  idols: {
    enabled: true,
  },

  // ── Pacing ──────────────────────────────────────────────────────────────
  // Required. How many camp actions the player gets per camp life phase.
  // Standard is 3; lower for shorter rounds, higher for richer roleplay.
  pacing: {
    campActionsPerRound: 3,
  },

  // ── Cast ────────────────────────────────────────────────────────────────
  // Required. Array of 16 (typically) contestant objects. cast.length
  // must equal the sum of tribes.initial[].size.
  //
  // All stats default to 5 per the v10 authoring rule. Override on a
  // per-contestant basis once skill values are tuned.
  //
  // Required fields per contestant:
  //   id     string   unique within this season's cast
  //   name   string   display name
  //   physicalChallengeSkill   1–10 integer (default 5)
  //   mentalChallengeSkill     1–10 integer (default 5)
  //   enduranceChallengeSkill  1–10 integer (default 5)
  //   social                   1–10 integer (default 5)
  //   strategy                 1–10 integer (default 5)
  //   suspicion                runtime field, always 0
  //
  // Optional:
  //   tribe        string  pre-assigns to a tribe label. If ALL
  //                        contestants have it, assignTribes honors
  //                        the assignment; otherwise the engine
  //                        randomizes.
  //   description  string  flavor blurb shown on the cast card
  cast: [
    // —— Tribe A (8 contestants) ——
    { id: "TODO-01", name: "TODO Player Name 1",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-02", name: "TODO Player Name 2",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-03", name: "TODO Player Name 3",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-04", name: "TODO Player Name 4",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-05", name: "TODO Player Name 5",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-06", name: "TODO Player Name 6",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-07", name: "TODO Player Name 7",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },
    { id: "TODO-08", name: "TODO Player Name 8",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "A" },

    // —— Tribe B (8 contestants) ——
    { id: "TODO-09", name: "TODO Player Name 9",  physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-10", name: "TODO Player Name 10", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-11", name: "TODO Player Name 11", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-12", name: "TODO Player Name 12", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-13", name: "TODO Player Name 13", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-14", name: "TODO Player Name 14", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-15", name: "TODO Player Name 15", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
    { id: "TODO-16", name: "TODO Player Name 16", physicalChallengeSkill: 5, mentalChallengeSkill: 5, enduranceChallengeSkill: 5, social: 5, strategy: 5, suspicion: 0, tribe: "B" },
  ],

  // ── Episodes (optional) ─────────────────────────────────────────────────
  // An array of per-episode entries. Each entry pins the reward and
  // immunity challenges for that specific episode. Entries are read by
  // index — episodes[gameState.round - 1].
  //
  // Leave empty (or omit later episodes) and the engine falls back to
  // random pool selection — same behavior as the demo season. This is
  // the "fill in one episode at a time" workflow: a partially-authored
  // season is still playable end-to-end, with random challenges past
  // the last authored episode.
  //
  // ── Episode entry shape ────────────────────────────────────────────────
  //
  //   number    int       Required. 1-indexed. Matches gameState.round.
  //   title     string?   Optional. Short flavor like "The Marooning".
  //                       May be surfaced in future Episode Recap copy.
  //   reward    object?   Optional. Pins the Reward Challenge. See below.
  //   immunity  object?   Optional. Pins the Immunity Challenge.
  //   notes     string?   Optional. Author-only dev notes (not rendered).
  //
  // ── Challenge entry shape (used inside reward / immunity) ──────────────
  //
  //   The simplest authoring path is to reference an existing challenge
  //   from the engine pool by name:
  //
  //     reward:   { challengeRef: "Beach Picnic" }
  //     immunity: { challengeRef: "Obstacle Course" }
  //
  //   `challengeRef` looks up REWARD_CHALLENGES / INDIVIDUAL_REWARD_CHALLENGES
  //   (for reward) or CHALLENGES / INDIVIDUAL_CHALLENGES (for immunity)
  //   in src/engine/challenge.js. The right pool is auto-selected based
  //   on whether the game is pre- or post-merge. Description, skill
  //   weights, reward labels, etc. are inherited from the pool entry.
  //
  //   For one-off custom challenges that don't exist in the engine pool,
  //   inline the full challenge fields instead. Same shape as a pool
  //   entry (see src/engine/challenge.js for examples):
  //
  //     reward: {
  //       name:                  "Custom Reward Name",
  //       description:           "Tribes raced through a custom course...",
  //       challengeType:         "physical",
  //       challengeSkillWeights: { physical: 0.7, mental: 0.1, endurance: 0.2 },
  //       rewardType:            "food",
  //       rewardLabel:           "a special prize",
  //       rewardSubcopy:         "Flavor copy for the winner card.",
  //     }
  //
  //   `challengeRef` and inline fields can be combined — the inline
  //   values override anything pulled from the pool — but the typical
  //   case is one or the other. Per-episode resolver code will land in
  //   a future phase; for v10.10 the schedule shape is documented here
  //   so authoring can begin.
  //
  // ── Available challengeRef names (as of v10.10) ────────────────────────
  //
  //   Pre-merge IMMUNITY challenges (CHALLENGES in engine/challenge.js):
  //     "Obstacle Course"      physical
  //     "Puzzle Race"          mental
  //     "Endurance Hold"       endurance
  //     "Fire-Making Relay"    mixed (physical + mental)
  //     "Memory Test"          mental
  //     "Rope Maze"            mental
  //     "Balance Beam"         endurance
  //
  //   Post-merge IMMUNITY challenges (INDIVIDUAL_CHALLENGES):
  //     "Perch Challenge"      endurance
  //     "Weight Hang"          endurance
  //     "Endurance Puzzle"     mental + endurance
  //     "Memory Sequence"      mental
  //     "Balance Maze"         mental
  //     "Fire-Making Duel"     mixed
  //     "Simmotion Obstacle"   mixed (physical + mental)
  //
  //   Pre-merge REWARD challenges (REWARD_CHALLENGES):
  //     "Beach Picnic"         food
  //     "Sailboat Cruise"      luxury
  //     "Pizza Drop"           food
  //     "Letters from Home"    communication
  //     "Camp Upgrade"         supplies
  //     "Spice Box Relay"      supplies
  //     "Fishing Gear Race"    supplies
  //     "Sunset Helicopter"    luxury
  //
  //   Post-merge REWARD challenges (INDIVIDUAL_REWARD_CHALLENGES):
  //     "Solo Picnic"          food
  //     "Family Visit"         family
  //     "Helicopter Tour"      luxury
  //     "Spa Reward"           comfort
  //     "Letters and Care Package"  communication
  //     "Camp Resupply"        supplies
  //     "Steak Dinner"         food
  //     "Sunset Cruise"        luxury
  //
  //   To add a new entry to a pool, edit src/engine/challenge.js and
  //   append to the appropriate array. Then it becomes referenceable by
  //   name from any season template.
  //
  // ── Example episodes (commented out — uncomment + customize) ───────────
  /*
  episodes: [
    {
      number: 1,
      title:  "TODO Episode 1 Title",
      reward:   { challengeRef: "Beach Picnic" },
      immunity: { challengeRef: "Obstacle Course" },
      notes:    "First episode — typically a 'getting to know you' beat.",
    },
    {
      number: 2,
      title:  "TODO Episode 2 Title",
      reward:   { challengeRef: "Sailboat Cruise" },
      immunity: { challengeRef: "Puzzle Race" },
    },
    // ... add more episodes one at a time as you author them ...
  ],
  */
  episodes: [],
};
