// vote.js — AI voting logic, tallying, and dramatic reveal ordering

// ── Vote collection ───────────────────────────────────────────────────────────

// Collects one vote per tribe member. The player's vote is already decided
// and prepended; every other tribe member votes via the AI.
// Returns an array of { voter, target } objects.
function collectAiVotes(state, tribe, playerVoteTarget, player) {
  const votes = [{ voter: player, target: playerVoteTarget }];

  for (const voter of tribe) {
    if (voter.id === player.id) continue;
    votes.push({ voter, target: pickVoteTarget(state, voter, tribe) });
  }

  return votes;
}

// AI picks who to vote against.
//
// Score for each candidate (lower = more likely to be voted for):
//   - Relationship score : main driver. Disliked people score low.
//   - Threat penalty     : strategic voters penalise high-challenge,
//                          high-social opponents they can't control.
//   - Suspicion penalty  : each suspicion point subtracts 2 from score,
//                          making a suspicious player a target even if
//                          their relationships are otherwise decent.
//   - Random noise       : scaled inversely by voter's strategy stat,
//                          so high-strategy players vote more predictably.
function pickVoteTarget(state, voter, candidates) {
  const others = candidates.filter(c => c.id !== voter.id);

  const scored = others.map(c => {
    const rel       = getRelationship(state, voter.id, c.id);
    const threat    = (c.challenge + c.social) * (voter.strategy / 20);
    const suspicion = (c.suspicion ?? 0) * 2;
    const noise     = (Math.random() - 0.5) * (11 - voter.strategy) * 2;
    return { contestant: c, score: rel - threat - suspicion + noise };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].contestant;
}

// ── Tallying ──────────────────────────────────────────────────────────────────

// Returns the contestant object who received the most votes.
// Calls resolveTie() when multiple candidates are tied at the top.
function tallyVotes(votes, state) {
  const counts = {};

  for (const { target } of votes) {
    counts[target.id] = (counts[target.id] ?? 0) + 1;
  }

  const max     = Math.max(...Object.values(counts));
  const tiedIds = Object.entries(counts)
    .filter(([, n]) => n === max)
    .map(([id]) => id);

  const eliminatedId = resolveTie(tiedIds, votes, state);

  return votes.map(v => v.target).find(c => c.id === eliminatedId);
}

// Phase 1 stub — ties are broken by random draw.
// Replace this function in Phase 2+ to add re-vote, fire-making, etc.
function resolveTie(tiedIds, votes, state) {
  return tiedIds[Math.floor(Math.random() * tiedIds.length)];
}

// ── Dramatic reveal ordering ──────────────────────────────────────────────────

// Orders votes so the reveal feels like Survivor:
//
//   1. Votes for the eliminated person and votes for others are interleaved —
//      so the counts swing back and forth and the outcome stays unclear.
//   2. One vote for the eliminated person is held back as the decisive final
//      reveal. The last vote shown always clinches the result.
//
// If everyone voted the same way (landslide) the votes still reveal in a
// random order with the last one saved as the "clincher."
function buildRevealOrder(votes, eliminatedId) {
  const forEliminated = shuffleArray(votes.filter(v => v.target.id === eliminatedId));
  const forOthers     = shuffleArray(votes.filter(v => v.target.id !== eliminatedId));

  // Edge case: unanimous vote. Just shuffle and hold the last back.
  if (forOthers.length === 0) {
    const decisive = forEliminated.pop();
    return [...forEliminated, decisive];
  }

  // Save the decisive vote for last.
  const decisive = forEliminated.pop();

  // Interleave: one for others, one for eliminated, alternating.
  const ordered = [];
  const len     = Math.max(forEliminated.length, forOthers.length);

  for (let i = 0; i < len; i++) {
    if (i < forOthers.length)     ordered.push(forOthers[i]);
    if (i < forEliminated.length) ordered.push(forEliminated[i]);
  }

  ordered.push(decisive);
  return ordered;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Fisher-Yates shuffle — produces a uniformly random permutation.
// The sort-based alternative (sort(() => Math.random() - 0.5)) is biased
// because JS sort algorithms assume a consistent comparator.
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
