// challenge.js — immunity challenge calculation
//
// Two entry points:
//   runChallenge(tribes)              — pre-merge tribal immunity; returns winner/loser tribe labels
//   runIndividualChallenge(members)   — post-merge individual immunity; returns winner contestant
//
// Neither function mutates state — they compute and return result objects.

// ── Tribal challenges (pre-merge) ─────────────────────────────────────────────

const CHALLENGES = [
  {
    name: "Obstacle Course",
    description: "Both tribes crashed through a water obstacle course, hauling heavy crates across the finish line.",
  },
  {
    name: "Puzzle Race",
    description: "Tribes raced to assemble a massive puzzle under the blazing afternoon sun. Every second counted.",
  },
  {
    name: "Endurance Hold",
    description: "Contestants gripped a weighted log above their heads for as long as they could. One tribe held on longer.",
  },
  {
    name: "Fire-Making Relay",
    description: "A fire-making relay stretched every competitor to their limit. Technique and composure decided it.",
  },
  {
    name: "Memory Test",
    description: "A sequence-based memory challenge where one costly mistake at the end spelled disaster.",
  },
  {
    name: "Rope Maze",
    description: "Tribes untangled an enormous rope maze while keeping a ball suspended. Focus won the day.",
  },
  {
    name: "Balance Beam",
    description: "Contestants moved across narrow balance beams over open water. One tribe kept their footing.",
  },
];

// ── Individual challenges (post-merge) ───────────────────────────────────────

const INDIVIDUAL_CHALLENGES = [
  {
    name: "Perch Challenge",
    description: "Players stood motionless on narrow perches above open water. Willpower and balance decided it.",
  },
  {
    name: "Weight Hang",
    description: "Players held their body weight suspended above the ground for as long as they could. One refused to let go.",
  },
  {
    name: "Endurance Puzzle",
    description: "A grueling individual puzzle under the midday sun. One player solved it first.",
  },
  {
    name: "Memory Sequence",
    description: "A long sequence of symbols, recalled under pressure. One player's memory didn't crack.",
  },
  {
    name: "Balance Maze",
    description: "Players navigated a ball through a tilting maze course. Only one made it to the end.",
  },
  {
    name: "Fire-Making Duel",
    description: "Every player had to make fire from scratch, racing against each other and the clock. One flame burned brightest.",
  },
  {
    name: "Simmotion Obstacle",
    description: "Players pushed through a series of physical obstacles and a final puzzle. Strength and focus both mattered.",
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
function calcTribeScore(members) {
  const base  = members.reduce((total, c) => total + c.challenge, 0);
  const noise = Math.floor(Math.random() * members.length * 2.5);
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
    score: c.challenge + Math.random() * 4,
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
