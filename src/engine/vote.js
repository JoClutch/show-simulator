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

  // v5.39 / v5.42: scale alliance protection by THIS voter's loyalty to
  // THIS specific alliance. A formal pact-mate whose actual commitment has
  // eroded (loyalty 2) protects at ~0.76× the previous strength; a fully-
  // loyal pact-mate (loyalty 9) protects at ~1.32×. Loyalty 5 (neutral) is
  // a no-op (1.0×).
  // v5.42: range tightened from [0.5, 1.5] to [0.6, 1.4] — the earlier
  // amplification combined with bondProtection, social capital, and inner-
  // circle protection was over-shielding highly-loyal allies. Tighter
  // range preserves the shape of the effect without dominating other layers.
  let voterLoyaltyMult = 1;
  if (sharedAlliance && typeof getAllianceLoyalty === "function") {
    const personalLoyalty = getAllianceLoyalty(state, sharedAlliance.id, voter.id);
    voterLoyaltyMult = 0.6 + (personalLoyalty / 12.5);   // 0.6 .. 1.4
  }
  const allianceProtection = baseAllianceProtection * loyalty * voterLoyaltyMult;

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
  // each only partially express. Below 6 it adds nothing.
  // v5.37: magnitudes tuned down (4/3/2 → 3/2/1). Layered on top of the
  // already-substantial bondProtection (+8/+20) and allianceProtection
  // (up to +15), the original values were over-protecting tight bonds.
  // Subtle additive layer is the right read.
  let innerCircleProtection = 0;
  if (typeof getInnerCircleBond === "function") {
    const bond = getInnerCircleBond(state, voter.id, c.id);
    if      (bond >= 8) innerCircleProtection = 3;
    else if (bond >= 7) innerCircleProtection = 2;
    else if (bond >= 6) innerCircleProtection = 1;
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

  // v6.2: alliance consensus pull. After per-candidate scoring, voters who
  // are part of an alliance bias their vote toward whatever name dominates
  // among their alliance members' preferences. Strength of the pull scales
  // with the voter's own loyalty — disengaged members deviate, committed
  // ones stick to the plan. Models the camp-life-into-tribal flow where
  // alliances coordinate before walking in.
  const consensus = getAllianceConsensus(state, voter, others);
  if (consensus && consensus.dominantId) {
    const voterLoyaltyAvg = getAverageVoterAllianceLoyalty(state, voter);
    // pullStrength: 0.0 at loyalty 0, 1.0 at loyalty 10
    const pullStrength = Math.max(0, Math.min(1, voterLoyaltyAvg / 10));

    // Idol fear of the consensus target weakens the main-target pull — even
    // a loyal voter may waver if they think the alliance is walking into an
    // idol play. v6.3 layers a separate BACKUP-target pull on top of this
    // when fear is high enough that hedging makes sense.
    const mainFear = (typeof getIdolFear === "function")
      ? getIdolFear(state, voter.id, consensus.dominantId) : 0;
    let fearDampener = 1;
    if      (mainFear >= 7) fearDampener = 0.55;
    else if (mainFear >= 5) fearDampener = 0.75;

    // Apply main-target pull: the consensus target's score gets a downward
    // push (lower score = more attractive vote target). Magnitude up to ~−5
    // for fully loyal voters with no fear; ~−1.5 for low-loyalty / high-fear.
    const pullMagnitude = 5.0 * pullStrength * fearDampener;
    for (const result of scored) {
      if (result.contestant.id === consensus.dominantId) {
        result.score -= pullMagnitude;
        if (VOTE_DEBUG) {
          console.log(
            `  [CONSENSUS] ${voter.name} pulled toward ${result.contestant.name}: ` +
            `loyalty=${voterLoyaltyAvg.toFixed(1)} pull=${pullMagnitude.toFixed(1)} ` +
            `fearDampener=${fearDampener.toFixed(2)}`
          );
        }
      }
    }

    // ── v6.3: idol-fear backup-target hedge ──────────────────────────
    // When fear of the main consensus target is meaningful, some voters
    // hedge to a backup target instead. The hedge decision is per-voter
    // and based on:
    //   • Strategy: low-strategy AIs hedge more (they don't trust the
    //                                            flush math)
    //   • Archetype: paranoid +; sneaky − (would flush); loyal − (sticks)
    //   • Loyalty: low loyalty pushes toward hedge
    //   • Social position: peripheral / expendable hedge more (can't
    //                       afford a wrong vote); influential / central
    //                       commit more (they shape outcomes)
    //   • Random jitter
    //
    // When the hedge fires, the backup target gets its OWN downward pull
    // — which combined with the dampened main pull lets the voter's
    // sort find the backup as the most attractive vote target.
    if (mainFear >= 5) {
      const backupId = getAllianceBackupTarget(
        state, voter, others, consensus.dominantId, consensus
      );
      if (backupId) {
        let hedgeScore = (mainFear - 4) * 0.4;
        hedgeScore += Math.max(0, 6 - (voter.strategy ?? 5)) * 0.4;
        const arch = voter.archetype || "balanced";
        if (arch === "paranoid") hedgeScore += 1.5;
        if (arch === "sneaky")   hedgeScore -= 1.0;
        if (arch === "loyal")    hedgeScore -= 0.5;
        hedgeScore -= (voterLoyaltyAvg - 5) * 0.3;
        if (typeof getSocialPosition === "function") {
          const pos = getSocialPosition(state, voter.id).position;
          if (pos === "peripheral" || pos === "expendable") hedgeScore += 1.0;
          if (pos === "influential" || pos === "central")   hedgeScore -= 0.5;
        }
        hedgeScore += (Math.random() - 0.5) * 1.5;

        if (hedgeScore > 0) {
          const backupPullMagnitude = 4.0 * Math.min(1, hedgeScore / 3);
          for (const result of scored) {
            if (result.contestant.id === backupId) {
              result.score -= backupPullMagnitude;
              if (VOTE_DEBUG) {
                console.log(
                  `  [BACKUP] ${voter.name} hedged toward ${result.contestant.name}: ` +
                  `mainFear=${mainFear.toFixed(1)} hedgeScore=${hedgeScore.toFixed(2)} ` +
                  `pull=${backupPullMagnitude.toFixed(1)}`
                );
              }
            }
          }
        }
      }
    }
  }

  scored.sort((a, b) => a.score - b.score);

  if (VOTE_DEBUG) {
    console.log(`  → ${voter.name} votes: ${scored[0].contestant.name}`);
  }

  return scored[0].contestant;
}

// v6.2: alliance-consensus helper. For a given voter, returns the dominant
// vote target preference across their alliance(s):
//   { dominantId, dominantWeight, counts }
//
// For each alliance the voter is in:
//   • Tier weight (core 1.5 / loose 1.0 / weakened 0.5) scales each member's
//     contribution to the consensus vote.
//   • Each other member's preferred target is determined by their campTarget
//     (set during camp life via individual intent or coordinated vote plan)
//     OR, if no intent is set, computed via their natural top scoreVoteTarget
//     pick from the eligible pool.
//   • The contribution is scaled by that member's own loyalty to the
//     alliance — disengaged members count less toward the plan.
//
// Returns null if the voter is in no alliances. Self-preferences don't
// count — the voter's own pick isn't part of "consensus".
function getAllianceConsensus(state, voter, eligibleCandidates) {
  if (typeof getAlliancesForMember !== "function") return null;
  const alliances = getAlliancesForMember(state, voter.id);
  if (!alliances || alliances.length === 0) return null;

  const counts = {};

  for (const a of alliances) {
    if (a.status === "dissolved") continue;
    const tier = a.tier ?? (a.strength >= 7 ? "core" : a.strength >= 4 ? "loose" : "weakened");
    const tierWeight = tier === "core" ? 1.5 : tier === "loose" ? 1.0 : 0.5;

    for (const mid of a.memberIds) {
      if (mid === voter.id) continue;

      const member = (typeof findContestant === "function")
        ? findContestant(state, mid) : null;
      if (!member) continue;

      // Member's preferred target: campTarget if set, else natural top pick.
      let preferredId = null;
      if (typeof getCampTargetForContestant === "function") {
        const intent = getCampTargetForContestant(state, mid);
        if (intent && intent.targetId) preferredId = intent.targetId;
      }
      if (!preferredId) {
        const memberCandidates = eligibleCandidates.filter(c => c.id !== mid);
        if (memberCandidates.length === 0) continue;
        let bestScore = Infinity, bestId = null;
        for (const c of memberCandidates) {
          const s = scoreVoteTarget(state, member, c);
          if (s < bestScore) { bestScore = s; bestId = c.id; }
        }
        preferredId = bestId;
      }
      if (!preferredId) continue;

      // Member's contribution scales with their own loyalty in this alliance.
      let memberLoyalty = 5;
      if (typeof getAllianceLoyalty === "function") {
        memberLoyalty = getAllianceLoyalty(state, a.id, mid);
      }
      const confidence = Math.max(0.3, memberLoyalty / 10);

      counts[preferredId] = (counts[preferredId] ?? 0) + tierWeight * confidence;
    }
  }

  let dominantId = null, dominantWeight = 0;
  for (const id of Object.keys(counts)) {
    if (counts[id] > dominantWeight) {
      dominantWeight = counts[id];
      dominantId = id;
    }
  }
  if (!dominantId) return null;

  return { dominantId, dominantWeight, counts };
}

// v6.3: returns the backup-target id for a voter — the second-most-preferred
// candidate across their alliance(s), excluding the dominant main target.
// Used by the idol-fear hedge logic to give voters a coherent "if not the
// main name, then this name" alternative rather than letting them scatter
// to any random runner-up.
//
// Returns null when no meaningful backup exists (alliance support too thin
// outside the main target). The caller should treat null as "no hedge
// possible" and fall back to the voter's natural scoreVoteTarget pick.
//
// `consensus` may be passed if already computed; otherwise computes fresh.
function getAllianceBackupTarget(state, voter, eligibleCandidates, mainTargetId, consensus) {
  const c = consensus || getAllianceConsensus(state, voter, eligibleCandidates);
  if (!c) return null;

  let backupId = null, backupWeight = 0;
  for (const id of Object.keys(c.counts)) {
    if (id === mainTargetId) continue;
    if (c.counts[id] > backupWeight) {
      backupWeight = c.counts[id];
      backupId = id;
    }
  }

  // Require meaningful backup support so the hedge points at a real
  // alternative rather than a random runner-up with one half-vote behind it.
  if (backupWeight < 0.5) return null;
  return backupId;
}

// Helper: averages a voter's loyalty across all alliances they're in.
// Returns 5 (neutral) if they're in none.
function getAverageVoterAllianceLoyalty(state, voter) {
  if (typeof getAlliancesForMember !== "function" ||
      typeof getAllianceLoyalty   !== "function") return 5;
  const alliances = getAlliancesForMember(state, voter.id);
  if (!alliances || alliances.length === 0) return 5;
  let sum = 0, n = 0;
  for (const a of alliances) {
    if (a.status === "dissolved") continue;
    sum += getAllianceLoyalty(state, a.id, voter.id);
    n++;
  }
  return n > 0 ? sum / n : 5;
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

// ── v6.1: Tribal arrival reading ────────────────────────────────────────────
//
// Synthesizes a player-facing summary of how Tribal is shaping up before any
// vote is cast. Returns { mood, stability, headline } where:
//   mood       : "calm" | "steady" | "uneasy" | "tense" | "chaotic"
//                (drawn from camp temperature tier — same scale the player
//                already sees via the mood pill in Camp Life)
//   stability  : "stable" | "shaky" | "volatile" | "open"
//   headline   : a short hedged sentence describing the room
//
// Uses the existing v5.x systems — pressure ranking spread, scramble count,
// camp temperature, idol fear load, recent rumor activity — to produce a
// qualitative read that gives the player a "feel" for the danger and
// unpredictability of the vote without exposing any raw numbers.
function getTribalReading(state, attendees) {
  if (!Array.isArray(attendees) || attendees.length < 2) {
    return { mood: "steady", stability: "open", headline: "A short Tribal." };
  }

  // Camp temperature for the mood read.
  const temp = (typeof getCampTemperature === "function")
    ? getCampTemperature(state, attendees)
    : { tier: "steady" };
  const mood = temp.tier;

  // Pressure spread: highest vs runner-up across every voteable attendee.
  // Filter out the immunity holder if applicable — they can't be voted, so
  // their pressure shouldn't shape the read of who's "the target".
  const candidates = state.merged
    ? attendees.filter(c => c.id !== state.immunityHolder)
    : attendees;
  const pressures = candidates.map(c => ({
    c,
    pressure: (typeof getPressureScore === "function")
      ? getPressureScore(state, c.id) : 5,
  }));
  pressures.sort((a, b) => b.pressure - a.pressure);

  const topPressure  = pressures[0]?.pressure ?? 5;
  const runnerUp     = pressures[1]?.pressure ?? 5;
  const gap          = topPressure - runnerUp;
  const highPressureCount = pressures.filter(p => p.pressure >= 6.5).length;

  // Count scrambling attendees.
  let scrambling = 0;
  if (typeof isScrambling === "function") {
    for (const c of attendees) {
      if (isScrambling(state, c.id)) scrambling++;
    }
  }

  // Idol fear load — how many pairs sit at meaningful fear (≥5)?
  let idolFearPairs = 0;
  if (typeof getIdolFear === "function") {
    for (const obs of attendees) {
      for (const holder of attendees) {
        if (obs.id === holder.id) continue;
        if (getIdolFear(state, obs.id, holder.id) >= 5) idolFearPairs++;
      }
    }
  }
  const fearLoad = attendees.length > 1
    ? idolFearPairs / (attendees.length * (attendees.length - 1))
    : 0;

  // ── Compose stability ───────────────────────────────────────────────
  let stability;
  if (topPressure >= 7 && gap >= 1.5 && scrambling <= 1 && fearLoad < 0.3) {
    // Clear consensus on one name; nobody's panicking; idol fear isn't
    // muddying the picture.
    stability = "stable";
  } else if (highPressureCount >= 2 && scrambling >= 2) {
    // Multiple targets, multiple people running for cover — anything goes.
    stability = "volatile";
  } else if (topPressure < 6 && gap < 1.0) {
    // Nobody's clearly the target; the vote could go anywhere.
    stability = "open";
  } else {
    // Probable target exists but the room isn't bunkered around it.
    stability = "shaky";
  }

  // ── Compose headline ────────────────────────────────────────────────
  // Cross-product of mood and stability produces a one-liner. Headlines
  // are intentionally short and hedged — they describe the room, they
  // don't predict the outcome.
  const headlines = {
    "calm:stable":      "A quiet vote. The room knows where it's going.",
    "calm:shaky":       "Quiet on the surface, but the read isn't fully locked.",
    "calm:open":        "Easy room, undecided vote. Anyone could be the name.",
    "calm:volatile":    "The calm is misleading. Pieces are still in motion.",
    "steady:stable":    "Steady room, locked target. Tonight is going by the book.",
    "steady:shaky":     "Steady room, but the name on the urn isn't fully decided.",
    "steady:open":      "A working Tribal — no clear consensus walking in.",
    "steady:volatile":  "The room reads steady, but the vote underneath is anything but.",
    "uneasy:stable":    "Tension in the air, even though most people seem to know the name.",
    "uneasy:shaky":     "Off-balance. The room has a target in mind, but it could shift.",
    "uneasy:open":      "Uneasy and undecided. Watch carefully.",
    "uneasy:volatile":  "Multiple plans in motion. This Tribal could break in pieces.",
    "tense:stable":     "Tense room, but the consensus is holding. For now.",
    "tense:shaky":      "Sharp edges in the room, and the vote itself isn't certain.",
    "tense:open":       "Tense and unresolved. This is the kind of Tribal where reputations get made.",
    "tense:volatile":   "On a knife's edge. Nobody's safe walking in.",
    "chaotic:stable":   "Loud, fast, but the vote itself is locked. Surprising.",
    "chaotic:shaky":    "Chaos at the surface, and the target may shift before votes are read.",
    "chaotic:open":     "Pure chaos. No name is locked, and nobody's calm.",
    "chaotic:volatile": "Everyone's scrambling, and nothing is settled. This is the wild Tribal.",
  };
  const headline = headlines[`${mood}:${stability}`]
    ?? "The room is what it is. Time to vote.";

  return { mood, stability, headline };
}

// ── Tallying ──────────────────────────────────────────────────────────────────

// v6.4: returns a richer result object so the caller can handle ties with
// a proper revote flow. Two outcomes:
//
//   { kind: "decided", eliminated, validVotes, counts }
//     — single highest-vote candidate; eliminated is the contestant object
//
//   { kind: "tied", tiedIds, validVotes, counts }
//     — two or more candidates tied at the top; tiedIds is the array of
//       contestant ids tied. The caller (typically the Tribal screen) is
//       expected to run a revote phase among the tied players via
//       collectRevoteVotes / drawRocks helpers below.
//
// Edge case: if every vote was voided (e.g. an idol play protected the
// only target everyone voted for), we still return a "decided" result by
// falling back to a random non-protected, non-immune attendee. This is
// the original v3.3 behavior — keeps the chaos-of-the-moment plausible
// without bolting on a separate special-case flow.
function tallyVotes(votes, state, protectedIds = new Set()) {
  const validVotes = votes.filter(v => !protectedIds.has(v.target.id));

  if (validVotes.length === 0) {
    const fallbackPool = votes
      .map(v => v.voter)
      .filter(v => !protectedIds.has(v.id) && v.id !== state.immunityHolder);
    if (fallbackPool.length === 0) {
      return { kind: "decided", eliminated: null, validVotes: [], counts: {} };
    }
    const eliminated = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
    return { kind: "decided", eliminated, validVotes: [], counts: {} };
  }

  const counts = {};
  for (const { target } of validVotes) {
    counts[target.id] = (counts[target.id] ?? 0) + 1;
  }

  const max     = Math.max(...Object.values(counts));
  const tiedIds = Object.entries(counts)
    .filter(([, n]) => n === max)
    .map(([id]) => id);

  if (tiedIds.length === 1) {
    const eliminated = validVotes.map(v => v.target).find(c => c.id === tiedIds[0]);
    return { kind: "decided", eliminated, validVotes, counts };
  }

  return { kind: "tied", tiedIds, validVotes, counts };
}

// v6.4: collects AI revotes during a tie-revote phase. Tied players don't
// vote; everyone else (including the immunity holder, if not tied) revotes
// — but only among the tied players. Players cannot vote for themselves.
//
// Returns the same { voter, target } shape as collectAiVotes so the reveal
// pipeline can treat revote ballots identically.
function collectRevoteVotes(state, attendees, tiedIds, playerRevote) {
  const tiedSet = new Set(tiedIds);
  const tiedContestants = attendees.filter(c => tiedSet.has(c.id));
  const eligibleVoters  = attendees.filter(c => !tiedSet.has(c.id));

  const ballots = [];
  const player = state.player;

  for (const voter of eligibleVoters) {
    if (voter.id === player.id) {
      // Player's revote is supplied directly.
      if (playerRevote && tiedSet.has(playerRevote.id)) {
        ballots.push({ voter, target: playerRevote });
      }
      continue;
    }

    // AI revote: pick the most-attractive tied target via scoreVoteTarget.
    // Don't filter by self because the voter isn't tied; if voter were
    // somehow tied they'd already be filtered out above.
    let best = null, bestScore = Infinity;
    for (const cand of tiedContestants) {
      if (cand.id === voter.id) continue;     // safety
      const s = scoreVoteTarget(state, voter, cand);
      const noise = (Math.random() - 0.5) * Math.max(2, (11 - voter.strategy) * 1.0);
      const total = s + noise;
      if (total < bestScore) { bestScore = total; best = cand; }
    }
    if (best) ballots.push({ voter, target: best });
  }

  return ballots;
}

// v6.4: rocks resolution. When a revote produces a second tie, every
// attendee who isn't tied AND isn't the immunity holder draws a rock.
// One person — chosen at random from the eligible pool — drew the odd
// rock and is eliminated. If the eligible pool is empty (e.g. final 4
// edge case where only tied + immune attendees remain), falls back to a
// random pick from the tied players.
//
// Returns { eliminated, rockDrawers, eliminatedFromTied }
//   eliminated:           the contestant who goes home
//   rockDrawers:          the array of contestants who drew rocks (animation)
//   eliminatedFromTied:   true if fallback fired (no neutral pool available)
function drawRocks(state, attendees, tiedIds) {
  const tiedSet = new Set(tiedIds);
  const eligible = attendees.filter(c =>
    !tiedSet.has(c.id) && c.id !== state.immunityHolder
  );

  if (eligible.length === 0) {
    // No neutral drawers — final-4 / final-3 edge case where the rule
    // can't apply. Eliminate a random tied player instead (modern Survivor
    // typically uses fire-making here; we approximate with random pick).
    const tied = attendees.filter(c => tiedSet.has(c.id));
    const eliminated = tied[Math.floor(Math.random() * tied.length)];
    return { eliminated, rockDrawers: [], eliminatedFromTied: true };
  }

  const eliminated = eligible[Math.floor(Math.random() * eligible.length)];
  return { eliminated, rockDrawers: eligible, eliminatedFromTied: false };
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
