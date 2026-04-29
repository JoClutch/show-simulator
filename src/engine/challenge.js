// challenge.js — immunity challenge calculation
//
// runChallenge() is the single entry point. It does not mutate state —
// it just computes and returns a result object. main.js stores what it needs.

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
