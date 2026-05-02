// contestants.js — static roster for Season 1: Broken Compass
//
// Stats are fixed whole numbers from 1–10.
// tribe     : null at load; stamped "A" or "B" by assignTribes() at game start.
// suspicion : starts at 0; incremented by camp actions, read by AI vote scoring.
//             Range 0–10. Higher = more likely to be voted out regardless of relationships.
//
// v9.1 — Challenge skill split into three sub-skills:
//   physicalChallengeSkill   — strength, speed, raw athleticism
//   mentalChallengeSkill     — puzzles, memory, pattern recognition
//   enduranceChallengeSkill  — sustained holds, willpower, weight-hangs
// `challenge` is preserved as a derived value (round of the average of the
// three) so every legacy reader keeps working unchanged. normalizeContestantStats()
// in engine/challenge.js recomputes it at boot. Sub-skills are tuned so each
// contestant's average is ≈ their previous `challenge` value (preserves
// existing balance) while giving them a distinct profile.

const CONTESTANTS = [
  // id        name              tribe   active   physical / mental / endurance / soc / strat / susp
  { id: "c01", name: "Marcus Webb",   tribe: null, active: true, physicalChallengeSkill: 9, mentalChallengeSkill: 6, enduranceChallengeSkill: 9,  social: 5,  strategy: 6, suspicion: 0 },
  { id: "c02", name: "Dana Reyes",    tribe: null, active: true, physicalChallengeSkill: 3, mentalChallengeSkill: 5, enduranceChallengeSkill: 4,  social: 9,  strategy: 7, suspicion: 0 },
  { id: "c03", name: "Troy Okafor",   tribe: null, active: true, physicalChallengeSkill: 8, mentalChallengeSkill: 6, enduranceChallengeSkill: 7,  social: 6,  strategy: 5, suspicion: 0 },
  { id: "c04", name: "Simone Park",   tribe: null, active: true, physicalChallengeSkill: 4, mentalChallengeSkill: 7, enduranceChallengeSkill: 4,  social: 8,  strategy: 8, suspicion: 0 },
  { id: "c05", name: "Leo Hargrove",  tribe: null, active: true, physicalChallengeSkill:10, mentalChallengeSkill: 7, enduranceChallengeSkill:10,  social: 3,  strategy: 4, suspicion: 0 },
  { id: "c06", name: "Priya Nair",    tribe: null, active: true, physicalChallengeSkill: 3, mentalChallengeSkill: 8, enduranceChallengeSkill: 4,  social: 7,  strategy: 9, suspicion: 0 },
  { id: "c07", name: "Jake Winters",  tribe: null, active: true, physicalChallengeSkill: 6, mentalChallengeSkill: 6, enduranceChallengeSkill: 6,  social: 6,  strategy: 6, suspicion: 0 },
  { id: "c08", name: "Renata Silva",  tribe: null, active: true, physicalChallengeSkill: 2, mentalChallengeSkill: 4, enduranceChallengeSkill: 3,  social: 9,  strategy: 7, suspicion: 0 },
  { id: "c09", name: "Damon Cross",   tribe: null, active: true, physicalChallengeSkill: 8, mentalChallengeSkill: 7, enduranceChallengeSkill: 6,  social: 4,  strategy: 8, suspicion: 0 },
  { id: "c10", name: "Yuki Tanaka",   tribe: null, active: true, physicalChallengeSkill: 5, mentalChallengeSkill: 7, enduranceChallengeSkill: 6,  social: 8,  strategy: 5, suspicion: 0 },
  { id: "c11", name: "Bria Hollis",   tribe: null, active: true, physicalChallengeSkill: 3, mentalChallengeSkill: 5, enduranceChallengeSkill: 4,  social: 7,  strategy: 7, suspicion: 0 },
  { id: "c12", name: "Evan Driscoll", tribe: null, active: true, physicalChallengeSkill: 9, mentalChallengeSkill: 7, enduranceChallengeSkill: 8,  social: 5,  strategy: 5, suspicion: 0 },
  { id: "c13", name: "Nadia Flores",  tribe: null, active: true, physicalChallengeSkill: 4, mentalChallengeSkill: 6, enduranceChallengeSkill: 5,  social: 6,  strategy: 8, suspicion: 0 },
  { id: "c14", name: "Carl Stanton",  tribe: null, active: true, physicalChallengeSkill: 7, mentalChallengeSkill: 6, enduranceChallengeSkill: 8,  social: 4,  strategy: 6, suspicion: 0 },
  { id: "c15", name: "Mia Thornton",  tribe: null, active: true, physicalChallengeSkill: 2, mentalChallengeSkill: 4, enduranceChallengeSkill: 3,  social: 10, strategy: 6, suspicion: 0 },
  { id: "c16", name: "Omar Hassan",   tribe: null, active: true, physicalChallengeSkill:10, mentalChallengeSkill: 8, enduranceChallengeSkill: 9,  social: 5,  strategy: 7, suspicion: 0 },
];
