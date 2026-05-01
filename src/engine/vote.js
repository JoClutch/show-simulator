// vote.js — AI voting logic, tallying, and dramatic reveal ordering

// ── Dev flag ──────────────────────────────────────────────────────────────────
// Set to true to log each AI voter's full score breakdown to the console.
const VOTE_DEBUG = false;

// ── Vote collection ───────────────────────────────────────────────────────────

// Collects one vote per tribe member. The player's vote is already decided
// and prepended; every other tribe member votes via the AI.
//
// Two-pass system for natural convergence:
//   Pass 1 — each voter independently scores all candidates.
//   Pass 2 — socially aware voters may swing toward the emerging plurality,
//             simulating tribal dynamics without an explicit alliance engine.
//
// Parameters:
//   tribe     — everyone who CASTS a vote (includes the immunity holder if any)
//   candidates — who can RECEIVE votes (pass tribe.filter(...immunityHolder) for
//                post-merge; omit or pass undefined to default to tribe)
//
// Returns an array of { voter, target } objects.
function collectAiVotes(state, tribe, playerVoteTarget, player, candidates) {
  const votePool = candidates ?? tribe;   // who AI voters may target
  const aiVoters = tribe.filter(v => v.id !== player.id);

  // ── Pass 1: independent scoring ───────────────────────────────────────────
  if (VOTE_DEBUG) console.log(`[VOTE] Pass 1 — independent scoring:`);

  const firstPassTargets = {};
  for (const voter of aiVoters) {
    firstPassTargets[voter.id] = pickVoteTarget(state, voter, votePool);
  }

  // ── Find plurality target from pass 1 ─────────────────────────────────────
  const tally = {};
  for (const target of Object.values(firstPassTargets)) {
    tally[target.id] = (tally[target.id] ?? 0) + 1;
  }
  const topEntry    = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const pluralityId = topEntry?.[0] ?? null;
  const plurality   = pluralityId ? votePool.find(c => c.id === pluralityId) : null;

  if (VOTE_DEBUG && plurality) {
    console.log(`[VOTE] Plurality target after pass 1: ${plurality.name} (${topEntry[1]} votes)`);
  }

  // ── Pass 2: convergence check ─────────────────────────────────────────────
  if (VOTE_DEBUG) console.log(`[VOTE] Pass 2 — convergence check:`);

  const votes = [{ voter: player, target: playerVoteTarget }];

  for (const voter of aiVoters) {
    let finalTarget = firstPassTargets[voter.id];

    // Social players pick up on tribal dynamics and may swing toward the plurality.
    // Only applies if the plurality target isn't the voter themselves and they
    // weren't already voting that way.
    if (plurality && plurality.id !== voter.id && finalTarget.id !== plurality.id) {
      const convergenceChance = voter.social / 22;  // max ~45% at social 10
      if (Math.random() < convergenceChance) {
        finalTarget = plurality;
        if (VOTE_DEBUG) {
          console.log(`  [CONV] ${voter.name} swings from ${firstPassTargets[voter.id].name} → ${plurality.name}`);
        }
      }
    }

    votes.push({ voter, target: finalTarget });
  }

  return votes;
}

// Scores each candidate against the voter and returns the lowest-scoring one
// (lower score = more likely to be voted for).
//
// Score components (higher = safer from this voter):
//   rel              : relationship — main driver; disliked people score low
//   bondProtection   : strong allies get a large safety bonus; decent allies a smaller one
//   trustFactor      : low trust makes you willing to vote someone; high trust protects them
//   suspicion        : −2 per point; a fully suspicious player takes −20
//   socialThreat     : high-social players targeted by strategic voters
//   challengeThreat  : high-challenge players targeted by strategic voters
//   noise            : small random element, narrower for high-strategy voters
// Returns the deterministic vote-target score for a single (voter, candidate)
// pair — same formula pickVoteTarget uses, minus the noise term. Pure: same
// inputs always produce the same number, so it's safe to call from analytics
// surfaces (target list, dev panel) without affecting future random rolls.
//
// Lower score = more likely to be voted out by this voter.
//
// All factors are documented inline. Modifying scoring rules here updates
// pickVoteTarget, the dev panel's predicted-target table, and the v5.7
// end-of-camp target list at once — no drift between analytics and reality.
function scoreVoteTarget(state, voter, c) {
  // Relationship: most important factor.
  const rel = getRelationship(state, voter.id, c.id);

  // Bond protection: strong allies are shielded.
  const bondProtection = rel >= 15 ? 20 : rel >= 8 ? 8 : 0;

  // Alliance protection: members of a shared alliance protect each other.
  // Layered ON TOP of bondProtection — alliances and friendships compound.
  // Uses the STRONGEST shared alliance (max, not sum) to avoid double-count
  // when overlapping memberships exist.
  //   loose alliance (str 4) → +6
  //   solid alliance (str 7) → +10.5
  //   tight alliance (str 10)→ +15
  //
  // Modulated by the voter's "loyalty factor" (v3.5):
  //   loyalty = 1 + (social − 5) × 0.05 − (strategy − 5) × 0.07
  //   clamped to [0.3, 2.0]
  //
  // High-social, low-strategy players are rocks — alliance protection
  // boosted up to ~×1.6. High-strategy, low-social players are flippers —
  // alliance protection halved to ~×0.5. Balanced 5/5 voters are neutral.
  const sharedAlliance = getStrongestSharedAlliance(state, voter.id, c.id);
  const baseAllianceProtection = sharedAlliance ? sharedAlliance.strength * 1.5 : 0;
  const loyalty = Math.max(0.3, Math.min(2.0,
    1 + (voter.social - 5) * 0.05 - (voter.strategy - 5) * 0.07
  ));
  const allianceProtection = baseAllianceProtection * loyalty;

  // Trust: shifted so trust 3 (baseline) = 0, trust 0 = −4.5, trust 10 = +10.5.
  const trust       = getTrust(state, voter.id, c.id);
  const trustFactor = (trust - 3) * 1.5;

  // Suspicion: each point adds −2. Easy target even if relationships are decent.
  const suspicion = (c.suspicion ?? 0) * 2;

  // Threat: split into social and challenge components.
  // Strategic voters weigh both more heavily.
  const socialThreat    = c.social    * (voter.strategy / 15);
  const challengeThreat = c.challenge * (voter.strategy / 25);

  // v3.7: post-swap, pre-merge cross-tribe dynamics — only fire after a swap
  // and before merge. Pre-swap they're tautologically zero (everyone on a
  // tribe shares originalTribe) and post-merge they're not the right model.
  let crossTribeFactor    = 0;
  let tribeStrengthFactor = 0;

  if (state.swapped && !state.merged) {
    const myTribe = state.tribes[voter.tribe] ?? [];
    const sameOrigCount = myTribe.filter(m =>
      m.originalTribe === voter.originalTribe
    ).length;
    const inMajority = sameOrigCount > myTribe.length / 2;
    const sameOrigin = voter.originalTribe === c.originalTribe;

    if (sameOrigin) {
      // Loyalty bonus — protective.
      let bonus = 5
                + (voter.social   - 5) * 0.5
                - (voter.strategy - 5) * 0.5;
      if (!inMajority) bonus *= 0.5;
      crossTribeFactor = Math.max(0, bonus);
    } else {
      // Outsider penalty — easier target.
      let penalty = 4
                  + (voter.strategy - 5) * 0.4
                  - (voter.social   - 5) * 0.3;
      if (!inMajority) penalty *= 0.3;
      crossTribeFactor = -Math.max(0, penalty);
    }

    // Tribe-strength preservation. Strategic voters (≥6) on a weaker tribe
    // protect strong members and target weak ones, regardless of original
    // tribe lines. Avg challenge stat compared to the OTHER tribe.
    if (voter.strategy >= 6) {
      const otherLabel = voter.tribe === "A" ? "B" : "A";
      const otherTribe = state.tribes[otherLabel] ?? [];
      if (myTribe.length > 0 && otherTribe.length > 0) {
        const myAvg    = myTribe.reduce((s, m) => s + m.challenge, 0) / myTribe.length;
        const otherAvg = otherTribe.reduce((s, m) => s + m.challenge, 0) / otherTribe.length;
        if (myAvg < otherAvg - 0.5) {
          // We're noticeably weaker. Map c.challenge (1–10, mean 5) to a
          // ±2.5 swing — high-challenge candidates protected, low targeted.
          tribeStrengthFactor = (c.challenge - 5) * 0.5;
        }
      }
    }
  }

  // Idol suspicion: how strongly THIS voter believes c is holding an idol.
  // Strategic voters (strategy ≥ 6) lean into a flush — a suspected idol
  // holder is MORE attractive to vote (lower score). Less strategic voters
  // avoid wasting a vote on someone who'll likely play it (higher score).
  //   suspicion 0–2 (unaware)   : no effect
  //   suspicion 3–6 (suspect)   : strategic ±2 swing
  //   suspicion 7–10 (confident): strategic flush −4, non-strategic avoid +6
  const idolSusp = getIdolSuspicion(state, voter.id, c.id);
  let idolFactor = 0;
  if (idolSusp >= 7) {
    idolFactor = voter.strategy >= 6 ? -4 : +6;
  } else if (idolSusp >= 3) {
    idolFactor = voter.strategy >= 6 ? -2 : +3;
  }

  // v5.34: idol-fear hesitation for less-strategic voters. Goes BEYOND raw
  // idol suspicion — picks up reputation (Schemer / high-strategy holder)
  // and active rumor signal as well. Strategic voters (≥6) have already
  // been handled by idolFactor's flush logic above; this layer specifically
  // models the camp's collective "let's not pile on the obvious target"
  // hesitation that emerges from broad fear, not just direct witness.
  if (voter.strategy < 6 && typeof getIdolFear === "function") {
    const fear = getIdolFear(state, voter.id, c.id);
    if      (fear >= 5) idolFactor += 2;
    else if (fear >= 3) idolFactor += 1;
  }

  // v5.16: social capital — broad tribe-standing nudge. High-capital targets
  // are slightly harder to vote out (the room defaults to giving them
  // benefit of the doubt); low-capital targets become consensus targets a
  // bit faster. Centered on 5 so it's a ±2.5 swing at the extremes.
  const capital = (typeof getSocialCapital === "function")
    ? getSocialCapital(state, c.id) : 5;
  const capitalFactor = (capital - 5) * 0.5;

  // v5.31: inner-circle protection. Voters give additional protection to
  // candidates they hold a high inner-circle bond toward — this captures
  // the COMBINATION of trust + alliance maturity + clean history that
  // bondProtection (rel-based) and allianceProtection (membership-based)
  // each only partially express. Subtle: +2 at bond ≥ 6, scaling up to
  // +4 at bond ≥ 8. Below 6 it adds nothing. Centers the "would I really
  // put this person on the chopping block" question on the soft trust
  // structure, not just on rel or alliance card.
  let innerCircleProtection = 0;
  if (typeof getInnerCircleBond === "function") {
    const bond = getInnerCircleBond(state, voter.id, c.id);
    if      (bond >= 8) innerCircleProtection = 4;
    else if (bond >= 7) innerCircleProtection = 3;
    else if (bond >= 6) innerCircleProtection = 2;
  }

  // v5.19: late-game resume-threat factor. Once the merge has happened AND
  // the field has narrowed, strategic voters consider who would beat them
  // at final tribal. Players with strong combined social + challenge stats
  // and / or strong perceived game read as future-finals threats and gain
  // additional vote pressure from strategy-minded voters.
  let resumeFactor = 0;
  if (state.merged) {
    const remaining = (state.tribes?.merged || []).length;
    if (remaining <= 7 && voter.strategy >= 6) {
      const resumeScore = (c.social ?? 5) + (c.challenge ?? 5);
      // Map resumeScore (typical range 6–18, mean 10) → −2 to +2 swing on
      // vote score. Strategic voter sees high-resume = vote them out.
      resumeFactor = -(resumeScore - 10) * 0.4;
    }
  }

  return rel + bondProtection + allianceProtection + trustFactor
       - suspicion - socialThreat - challengeThreat
       + idolFactor
       + crossTribeFactor + tribeStrengthFactor
       + capitalFactor
       + resumeFactor
       + innerCircleProtection;
}

// pickVoteTarget — returns the contestant the given voter would vote for
// at tribal council. Calls scoreVoteTarget for the deterministic component,
// then layers strategy-scaled noise so high-strategy voters are more
// predictable than low-strategy ones.
function pickVoteTarget(state, voter, tribe) {
  const others = tribe.filter(c => c.id !== voter.id);

  const scored = others.map(c => {
    const baseScore = scoreVoteTarget(state, voter, c);

    // Noise — strategy 10 → ±1.5; strategy 1 → ±7.5. Set voteNoiseMultiplier=0
    // for fully deterministic votes (useful for tuning AI behaviour).
    const noiseRange = Math.max(3, (11 - voter.strategy) * 1.5)
                     * (window.DEV_CONFIG?.voteNoiseMultiplier ?? 1);
    const noise = (Math.random() - 0.5) * noiseRange;
    const score = baseScore + noise;

    if (VOTE_DEBUG) {
      console.log(
        `  [SCORE] ${voter.name} → ${c.name}: ` +
        `base=${baseScore.toFixed(1)} noise=${noise.toFixed(1)} = ${score.toFixed(1)}`
      );
    }

    return { contestant: c, score };
  });

  scored.sort((a, b) => a.score - b.score);

  if (VOTE_DEBUG) {
    console.log(`  → ${voter.name} votes: ${scored[0].contestant.name}`);
  }

  return scored[0].contestant;
}

// ── Top vote targets (v5.7) ─────────────────────────────────────────────────
//
// Returns the top N candidates ranked by aggregate vote pressure across all
// attendees. "Pressure" = average -score from every voter (lower vote-score
// means more attractive as a target, so negating gives a positive pressure
// reading where bigger = more in danger).
//
// Filters out the immunity holder post-merge — they can't be voted out.
// Pre-merge there's no immunity holder, so all attendees are valid candidates.
//
// Stable: same state always produces the same ranking. The end-of-camp target
// list relies on this so the player gets a consistent read; if pressure
// flickered between renders, the list wouldn't feel like a strategic read.
function getTopVoteTargets(state, attendees, count = 3) {
  if (!Array.isArray(attendees) || attendees.length < 2) return [];

  const candidates = state.merged
    ? attendees.filter(c => c.id !== state.immunityHolder)
    : attendees;

  if (candidates.length === 0) return [];

  const ranked = candidates.map(candidate => {
    let pressureSum = 0;
    let voterCount  = 0;
    for (const voter of attendees) {
      if (voter.id === candidate.id) continue;
      pressureSum += -scoreVoteTarget(state, voter, candidate);
      voterCount++;
    }
    return {
      contestant: candidate,
      pressure:   voterCount > 0 ? pressureSum / voterCount : 0,
    };
  });

  // Sort descending by pressure; take top N.
  ranked.sort((a, b) => b.pressure - a.pressure);
  return ranked.slice(0, count);
}

// ── Tallying ──────────────────────────────────────────────────────────────────

// Returns the contestant object who received the most VALID votes.
// Calls resolveTie() when multiple candidates are tied at the top.
//
// protectedIds — optional Set of contestant ids whose received votes must be
//                discarded (idol plays). Defaults to an empty set, preserving
//                pre-v3.3 behavior for any caller that doesn't pass it.
//
// Edge case: if every vote was voided (everyone tried to vote out the same
// idol-protected contestant) we fall back to a random non-protected attendee.
// This is rare and approximates the chaos that a real re-vote would create
// without bolting on a full re-vote system.
function tallyVotes(votes, state, protectedIds = new Set()) {
  const validVotes = votes.filter(v => !protectedIds.has(v.target.id));

  if (validVotes.length === 0) {
    // All votes were voided. Pick a random attendee who isn't currently
    // protected (immunity necklace or idol). Use the voter pool from the
    // original ballots so the fallback only considers people in the room.
    const fallbackPool = votes
      .map(v => v.voter)
      .filter(v => !protectedIds.has(v.id) && v.id !== state.immunityHolder);
    if (fallbackPool.length === 0) return null;
    return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }

  const counts = {};
  for (const { target } of validVotes) {
    counts[target.id] = (counts[target.id] ?? 0) + 1;
  }

  const max     = Math.max(...Object.values(counts));
  const tiedIds = Object.entries(counts)
    .filter(([, n]) => n === max)
    .map(([id]) => id);

  const eliminatedId = resolveTie(tiedIds, validVotes, state);

  return validVotes.map(v => v.target).find(c => c.id === eliminatedId);
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
