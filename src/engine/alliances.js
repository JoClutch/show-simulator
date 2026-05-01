// alliances.js — Alliance data model and lifecycle
//
// An alliance is a persistent commitment between two or more contestants to
// vote together and protect each other. It is a SHARED state (one record
// affects all members) — different from pair-relationships and trust which
// describe how two specific people feel about each other.
//
// ── Lifecycle ─────────────────────────────────────────────────────────────────
//
//   formed    : two members agree (via player camp action or AI auto-formation)
//   active    : strength 4–10, normal operation (members protect each other)
//   weakened  : strength 1–3, on the verge of falling apart
//   dissolved : strength 0 OR fewer than 2 members remain
//
// A dissolved alliance is kept in state.alliances for history, but is filtered
// out of all gameplay queries (getAlliancesForMember, isInSameAlliance, etc.).
//
// ── Strength ──────────────────────────────────────────────────────────────────
//
//   0    gone — alliance is treated as dissolved
//   1–3  weakened — barely a pact; members are looking for exits
//   4–6  loose — typical functional alliance
//   7–10 tight — ride-or-die territory
//
// Strength is a float internally (allows half-step drift) but displayed as an
// integer. Adjustments come from:
//   • Camp interactions among members      (small ±)
//   • Voting alignment at tribal           (large ±: +1 unanimous, −2 split)
//   • Suspicion on a member                (−)
//   • Round-end drift toward "natural fit" (avg pair rel/trust)
//
// ── Multi-alliance ────────────────────────────────────────────────────────────
//
// A contestant can be in multiple alliances simultaneously. Voting protection
// uses the STRONGEST shared alliance (max, not sum) to avoid double-counting
// when two members happen to overlap across alliances.
//
// ── Architecture ──────────────────────────────────────────────────────────────
//
//   Engine functions mutate state.alliances.
//   UI functions only read alliance data.
//   alliance.memberIds is the source of truth for membership.

// ── Alliance ID counter ──────────────────────────────────────────────────────
// Module-scoped, monotonic. Restarts at 1 each page load (a session is a
// single playthrough — there's no save/load to coordinate with). Plain
// counter is fine; uniqueness only needs to hold within one game.
let _allianceIdCounter = 1;

function _nextAllianceId() {
  return `all-${_allianceIdCounter++}`;
}

// ── Naming ────────────────────────────────────────────────────────────────────

// Pulls a name from the ALLIANCE_NAMES pool (in flavor.js), avoiding any
// already in use this game. If the pool is exhausted, falls back to a
// numbered placeholder so we never reuse names.
function _pickAllianceName(state) {
  const used = new Set((state.alliances ?? []).map(a => a.name));
  const available = ALLIANCE_NAMES.filter(n => !used.has(n));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return `The ${100 + (state.alliances?.length ?? 0)}`;
}

// ── Construction ──────────────────────────────────────────────────────────────

// Creates a new alliance and pushes it onto state.alliances.
// `members` is an array of contestant objects (length ≥ 2).
// Returns the new alliance object.
function createAlliance(state, members, founderId, initialStrength = 5) {
  const strength = Math.max(1, Math.min(10, initialStrength));
  const alliance = {
    id:                  _nextAllianceId(),
    name:                _pickAllianceName(state),
    memberIds:           members.map(m => m.id),
    founderId:           founderId ?? members[0].id,
    formedRound:         state.round,
    // Treat formation itself as the most recent reinforcement. A brand-new
    // alliance won't get hit by the staleness penalty in its first round.
    lastReinforcedRound: state.round,
    strength,
    status:              "active",
    // v5.13: tier is a player-facing read on the alliance's depth, derived
    // from strength. core = ride-or-die; loose = functional but uncommitted;
    // weakened = hanging by a thread. Distinct from voting blocs, which are
    // ephemeral single-tribal coordinations stored in state.votingBlocs.
    tier:                _strengthToTier(strength),
  };
  state.alliances.push(alliance);

  // v5.17: alliance formation seeds an "alliance" rumor. Members start as
  // knowers (they obviously know about their own pact); the rumor will
  // leak to close contacts via spread. Only seed for 2-member pacts —
  // larger alliances are noisier and will get picked up via observation.
  if (typeof seedRumor === "function" && members.length === 2) {
    const [m0, m1] = members;
    const r = seedRumor(state, "alliance", m0.id, m1.id, m0.id, 1.0);
    if (!r.knownBy[m1.id]) {
      r.knownBy[m1.id] = {
        confidence: 1.0, distortion: 0, fromId: m0.id,
        learnedRound: state.round ?? 0, slantedObjectId: null,
      };
    }
  }

  // Event log: surface to the player only if they're a member; AI-only
  // alliances are recorded for dev visibility but not the Season Log.
  const playerInvolved = state.player && members.some(m => m.id === state.player.id);
  logEvent(state, {
    category:      "alliance",
    type:          "formed",
    text: playerInvolved
      ? `You formed an alliance — "${alliance.name}".`
      : `${members.map(m => m.name).join(" + ")} formed "${alliance.name}".`,
    playerVisible: playerInvolved,
    meta: { allianceId: alliance.id, memberIds: alliance.memberIds.slice() },
  });

  return alliance;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

// Returns all non-dissolved alliances containing the given contestant.
function getAlliancesForMember(state, contestantId) {
  return (state.alliances ?? []).filter(a =>
    a.status !== "dissolved" && a.memberIds.includes(contestantId)
  );
}

// True if both contestants share at least one non-dissolved alliance.
function isInSameAlliance(state, idA, idB) {
  return getStrongestSharedAlliance(state, idA, idB) !== null;
}

// Returns the highest-strength alliance both contestants are members of, or
// null if they share none. Used by vote.js for alliance protection — taking
// the max prevents double-counting when overlap exists.
function getStrongestSharedAlliance(state, idA, idB) {
  let strongest = null;
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (!a.memberIds.includes(idA)) continue;
    if (!a.memberIds.includes(idB)) continue;
    if (!strongest || a.strength > strongest.strength) strongest = a;
  }
  return strongest;
}

// ── Mutation ──────────────────────────────────────────────────────────────────

// Applies a delta and updates status. Strength is a float internally; the
// UI rounds for display. status follows strength tiers automatically.
function adjustAllianceStrength(alliance, delta) {
  alliance.strength = Math.max(0, Math.min(10, alliance.strength + delta));
  if      (alliance.strength <= 0) { alliance.status = "dissolved"; alliance.strength = 0; }
  else if (alliance.strength <= 3) { alliance.status = "weakened"; }
  else                             { alliance.status = "active";   }
  alliance.tier = _strengthToTier(alliance.strength);
}

// v5.13: tier mapping. Designed to be read by the candor/info-share system
// and the UI rather than swapped in for "strength" directly — strength
// remains the underlying float that drives drift; tier is the categorical
// surface read.
//
//   strength ≥ 7  → "core"      (ride-or-die)
//   strength 4–6  → "loose"     (functional cooperation)
//   strength 1–3  → "weakened"  (hanging by a thread)
//   strength 0    → handled as dissolved upstream
function _strengthToTier(strength) {
  if (strength >= 7) return "core";
  if (strength >= 4) return "loose";
  return "weakened";
}

function getAllianceTier(alliance) {
  if (!alliance) return null;
  return alliance.tier ?? _strengthToTier(alliance.strength ?? 0);
}

// Returns the tier of the strongest shared alliance between two contestants,
// or null if they share none. Used by the conversation candor model to scale
// information sharing.
function getSharedAllianceTier(state, idA, idB) {
  const a = getStrongestSharedAlliance(state, idA, idB);
  return a ? getAllianceTier(a) : null;
}

// Applies a delta to every active alliance that contains BOTH members.
// Used by camp interactions where two specific members did something
// together (deep talk, confide, aligned strategy talk).
//
// Positive deltas also bump lastReinforcedRound — the alliance is being
// actively maintained. Negative deltas (erosion events) don't reset it;
// nothing has been done to keep the pact warm.
function strengthenSharedAlliances(state, idA, idB, delta) {
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (a.memberIds.includes(idA) && a.memberIds.includes(idB)) {
      adjustAllianceStrength(a, delta);
      if (delta > 0) a.lastReinforcedRound = state.round;
    }
  }
}

// Removes a contestant from every alliance they belong to. Called when
// someone is eliminated. Alliances dropping below 2 members are dissolved.
function removeMemberFromAlliances(state, contestantId) {
  const removed = findContestant(state, contestantId);
  for (const a of state.alliances ?? []) {
    const idx = a.memberIds.indexOf(contestantId);
    if (idx === -1) continue;

    // Snapshot membership BEFORE removal so we can determine whether the
    // player was in this alliance when the dissolution happens.
    const wasPlayerMember = state.player && a.memberIds.includes(state.player.id);

    a.memberIds.splice(idx, 1);

    if (a.memberIds.length < 2 && a.status !== "dissolved") {
      a.status   = "dissolved";
      a.strength = 0;
      logEvent(state, {
        category:      "alliance",
        type:          "dissolved",
        text: wasPlayerMember
          ? `Your alliance "${a.name}" dissolved when ${removed?.name ?? "a member"} was voted out.`
          : `"${a.name}" dissolved when ${removed?.name ?? "a member"} was voted out.`,
        playerVisible: wasPlayerMember,
        meta: { allianceId: a.id, reason: "member-eliminated", eliminatedId: contestantId },
      });
    }
  }
}

// ── v5.26: Membership management ────────────────────────────────────────────
//
// Three player-driven membership changes: invite, boot, leave. Each is
// gated on existing social state (rel/trust/alliance tier) and produces
// believable consequences via the existing relationship + suspicion +
// alliance-strength systems. Returns { feedback, accepted } so the UI can
// surface the outcome through the standard feedback log path.

// Compute average member-vs-candidate rel + trust. Used by both invite
// (does this candidate fit?) and boot (do members back the booter?).
function _allianceMemberAverages(state, alliance, candidateId) {
  let relSum = 0, trustSum = 0, count = 0;
  for (const mid of alliance.memberIds) {
    if (mid === candidateId) continue;
    relSum   += getRelationship(state, mid, candidateId);
    trustSum += getTrust(state, mid, candidateId);
    count++;
  }
  return {
    avgRel:   count > 0 ? relSum   / count : 0,
    avgTrust: count > 0 ? trustSum / count : 3,
    count,
  };
}

// INVITE — adds a new member to an existing alliance if accepted.
//   accept chance = 0.25
//                 + avgRel × 0.02
//                 + (avgTrust − 3) × 0.04
//                 + inviter.social × 0.02
//                 − invitee.suspicion × 0.03
//                 clamped [0.05, 0.85]
//
// On accept:  invitee added; alliance.strength +0.5; rel +1 between the
//             invitee and each existing member.
// On reject:  inviter's trust with invitee −1; inviter's contestant.suspicion
//             +1 (asking too early reads as scrambling).
function inviteToAlliance(state, allianceId, inviterId, inviteeId) {
  const alliance = (state.alliances ?? []).find(a => a.id === allianceId);
  if (!alliance || alliance.status === "dissolved") {
    return { feedback: "That alliance is no longer in play.", accepted: false };
  }
  if (!alliance.memberIds.includes(inviterId)) {
    return { feedback: "You aren't part of that pact.", accepted: false };
  }
  if (alliance.memberIds.includes(inviteeId)) {
    return { feedback: "They're already in.", accepted: false };
  }

  const inviter = findContestant(state, inviterId);
  const invitee = findContestant(state, inviteeId);
  if (!inviter || !invitee) {
    return { feedback: "There was no one available to bring in.", accepted: false };
  }

  const { avgRel, avgTrust } = _allianceMemberAverages(state, alliance, inviteeId);
  const acceptChance = Math.max(0.05, Math.min(0.85,
    0.25
    + avgRel * 0.02
    + (avgTrust - 3) * 0.04
    + (inviter.social ?? 5) * 0.02
    - (invitee.suspicion ?? 0) * 0.03
  ));

  if (Math.random() < acceptChance) {
    alliance.memberIds.push(inviteeId);
    adjustAllianceStrength(alliance, +0.5);
    alliance.lastReinforcedRound = state.round ?? 0;

    // Bond glue between invitee and existing members.
    for (const mid of alliance.memberIds) {
      if (mid === inviteeId) continue;
      adjustRelationship(state, inviteeId, mid, 1);
    }

    logEvent(state, {
      category:      "alliance",
      type:          "member-added",
      text: state.player && state.player.id === inviterId
        ? `You brought ${invitee.name} into "${alliance.name}".`
        : `${inviter.name} brought ${invitee.name} into "${alliance.name}".`,
      playerVisible: state.player && (
        state.player.id === inviterId ||
        state.player.id === inviteeId ||
        alliance.memberIds.includes(state.player.id)
      ),
      meta: { allianceId, inviterId, inviteeId },
    });

    return {
      feedback: `${invitee.name} accepted. They're now part of "${alliance.name}".`,
      accepted: true,
    };
  }

  adjustTrust(state, inviterId, inviteeId, -1);
  adjustSuspicion(state, inviterId, +1);
  return {
    feedback: `${invitee.name} thanked you for the offer but said they weren't ready to commit. The ask landed wrong — you'll feel it for a beat.`,
    accepted: false,
  };
}

// BOOT — votes (in-alliance) to remove another member. The booter doesn't
// get to act unilaterally; the OTHER members effectively decide based on
// who they're closer to.
//
//   support[booter] = 1                    // counts the booter themselves
//   support[target] = 1                    // counts the target themselves
//   for each other member m:
//     if rel(m, booter) > rel(m, target) + 2 → +1 booter
//     elif rel(m, target) > rel(m, booter) + 2 → +1 target
//     else 50/50 random
//
// Booter wins:  target removed, alliance.strength −1, target's rel toward
//               booter −5, trust −3. If alliance drops below 2 members,
//               it dissolves.
// Booter loses: alliance.strength −2; booter's rel with each remaining
//               member −2; booter's contestant.suspicion +2 (reads as
//               trying to dismantle the pact).
function bootFromAlliance(state, allianceId, booterId, targetId) {
  const alliance = (state.alliances ?? []).find(a => a.id === allianceId);
  if (!alliance || alliance.status === "dissolved") {
    return { feedback: "That alliance is no longer in play.", accepted: false };
  }
  if (!alliance.memberIds.includes(booterId)) {
    return { feedback: "You aren't part of that pact.", accepted: false };
  }
  if (!alliance.memberIds.includes(targetId)) {
    return { feedback: "They're not in this alliance.", accepted: false };
  }
  if (booterId === targetId) {
    return { feedback: "You can't push yourself out — leave instead.", accepted: false };
  }

  const target = findContestant(state, targetId);
  const booter = findContestant(state, booterId);
  if (!target || !booter) {
    return { feedback: "There was no one to push out.", accepted: false };
  }

  let booterSupport = 1, targetSupport = 1;
  for (const mid of alliance.memberIds) {
    if (mid === booterId || mid === targetId) continue;
    const relB = getRelationship(state, mid, booterId);
    const relT = getRelationship(state, mid, targetId);
    if (relB > relT + 2)      booterSupport++;
    else if (relT > relB + 2) targetSupport++;
    else if (Math.random() < 0.5) booterSupport++;
    else                          targetSupport++;
  }

  if (booterSupport > targetSupport) {
    alliance.memberIds = alliance.memberIds.filter(id => id !== targetId);
    adjustAllianceStrength(alliance, -1);
    adjustRelationship(state, booterId, targetId, -5);
    adjustTrust(state, booterId, targetId, -3);
    if (alliance.memberIds.length < 2) {
      alliance.status = "dissolved";
      alliance.strength = 0;
    }
    logEvent(state, {
      category:      "alliance",
      type:          "member-removed",
      text: state.player && state.player.id === booterId
        ? `You pushed ${target.name} out of "${alliance.name}".`
        : `${booter.name} pushed ${target.name} out of "${alliance.name}".`,
      playerVisible: state.player && (
        state.player.id === booterId ||
        state.player.id === targetId ||
        alliance.memberIds.includes(state.player.id)
      ),
      meta: { allianceId, booterId, removedId: targetId },
    });
    return {
      feedback: `The room moved with you. ${target.name} is out of "${alliance.name}". They're not going to forget this.`,
      accepted: true,
    };
  }

  // Boot fails.
  adjustAllianceStrength(alliance, -2);
  for (const mid of alliance.memberIds) {
    if (mid === booterId) continue;
    adjustRelationship(state, booterId, mid, -2);
  }
  adjustSuspicion(state, booterId, +2);
  return {
    feedback: `${target.name} stays. The pitch went over the room's head — and the room read you as the problem.`,
    accepted: false,
  };
}

// LEAVE — voluntarily remove yourself from an alliance. No vote check;
// you can always leave. Consequences: rel −1 + trust −2 with each remaining
// member, alliance.strength −2, your own suspicion +1 (reads as flaky).
// If alliance drops below 2, it dissolves.
function leaveAlliance(state, allianceId, leaverId) {
  const alliance = (state.alliances ?? []).find(a => a.id === allianceId);
  if (!alliance || alliance.status === "dissolved") {
    return { feedback: "That alliance is no longer in play.", accepted: false };
  }
  if (!alliance.memberIds.includes(leaverId)) {
    return { feedback: "You aren't part of that pact.", accepted: false };
  }

  const leaver = findContestant(state, leaverId);

  alliance.memberIds = alliance.memberIds.filter(id => id !== leaverId);
  for (const mid of alliance.memberIds) {
    adjustRelationship(state, leaverId, mid, -1);
    adjustTrust(state, leaverId, mid, -2);
  }
  adjustAllianceStrength(alliance, -2);
  adjustSuspicion(state, leaverId, +1);

  if (alliance.memberIds.length < 2) {
    alliance.status = "dissolved";
    alliance.strength = 0;
  }

  logEvent(state, {
    category:      "alliance",
    type:          "member-left",
    text: state.player && state.player.id === leaverId
      ? `You stepped away from "${alliance.name}".`
      : `${leaver?.name ?? "Someone"} left "${alliance.name}".`,
    playerVisible: state.player && (
      state.player.id === leaverId ||
      alliance.memberIds.includes(state.player.id)
    ),
    meta: { allianceId, leaverId },
  });

  return {
    feedback: `You walked out of "${alliance.name}". Word travels fast in a small camp.`,
    accepted: true,
  };
}

// ── v5.27: Alliance-wide vote coordination ───────────────────────────────────
//
// Pushes a vote plan to every other member of the given alliance. Each
// member responds independently based on their relationship with the
// coordinator, current personal vote intent, suspicion of the coordinator,
// alliance tier, archetype, and a small random component. Six response
// kinds:
//
//   agree       — full commitment; their campTarget is set to the proposed
//                 target; rel +1 with coordinator
//   soft-agree  — verbally on board but no commitment recorded; rel +1
//   hesitate    — non-committal; no mechanical change
//   mislead     — says yes but actually plans to vote a different name; small
//                 trust drop (the dishonesty quietly registers)
//   leak        — confides the plan to a non-member; seeds a "targeting"
//                 rumor with the coordinator as subject, low confidence;
//                 coordinator suspicion +1
//   reject      — refuses; rel −2 with coordinator; alliance strength −0.5
//
// Aggregate effects:
//   • Target's contestant.suspicion rises proportional to agreement count
//   • Alliance strength shifts: +0.5 on broad consensus, −0.5 if 2+ rejects
//   • Coordinator's suspicion rises by 1 per leak
//
// Returns { responses: [{memberId, name, response}], target, ... } so the
// UI can render a per-member breakdown card.
function coordinateAllianceVote(state, allianceId, coordinatorId, targetId) {
  const alliance = (state.alliances ?? []).find(a => a.id === allianceId);
  if (!alliance || alliance.status === "dissolved") {
    return { responses: [], error: "That alliance is no longer in play." };
  }
  if (!alliance.memberIds.includes(coordinatorId)) {
    return { responses: [], error: "You aren't part of that pact." };
  }
  const target = findContestant(state, targetId);
  const coordinator = findContestant(state, coordinatorId);
  if (!target || !coordinator) {
    return { responses: [], error: "There was no one to push the plan against." };
  }

  // Tier-based base bias on member willingness.
  const tier = alliance.tier ?? (alliance.strength >= 7 ? "core" : alliance.strength >= 4 ? "loose" : "weakened");
  const tierBonus =
      tier === "core"     ?  1.5
    : tier === "loose"    ?  0.5
    :                       -0.5;

  // Coordinator's broad standing also factors in.
  const coordCapital = (typeof getSocialCapital === "function")
    ? getSocialCapital(state, coordinatorId) : 5;

  const responses = [];
  for (const mid of alliance.memberIds) {
    if (mid === coordinatorId) continue;
    const member = findContestant(state, mid);
    if (!member) continue;

    const trust         = getTrust(state, mid, coordinatorId);
    const rel           = getRelationship(state, mid, coordinatorId);
    const memberRelToT  = getRelationship(state, mid, targetId);
    const memberSusp    = state.suspicionMemory?.[mid]?.[coordinatorId] ?? 0;
    const memberIntent  = (typeof getCampTargetForContestant === "function")
      ? getCampTargetForContestant(state, mid) : null;
    const archetype     = member.archetype || "balanced";

    // ── Compose support score ─────────────────────────────────────────
    let score = 0;
    score += (trust - 3) * 1.0;            // trust dominates
    score += rel * 0.15;                   // rapport reinforces
    score += tierBonus;                    // alliance tier baseline
    score -= memberRelToT * 0.20;          // the closer they are to the
                                           //   proposed target, the more
                                           //   they resist
    score -= memberSusp * 0.50;            // private memory of coordinator
                                           //   shadiness erodes willingness
    score += (coordCapital - 5) * 0.20;    // broad standing helps

    if (memberIntent && memberIntent.targetId === targetId)      score += 2.0;
    else if (memberIntent && memberIntent.targetId !== targetId) score -= 1.0;

    // Archetype tilts (soft).
    if (archetype === "loyal")    score += 1.0;
    if (archetype === "sneaky")   score -= 0.7;
    if (archetype === "paranoid") score -= 0.6;
    if (archetype === "socialButterfly") score += 0.3;

    // Per-member jitter so equivalent contexts can break differently.
    score += (Math.random() - 0.5) * 2;

    // ── Map score to response ─────────────────────────────────────────
    let response;
    if      (score >=  4) response = "agree";
    else if (score >=  2) response = "soft-agree";
    else if (score >=  0) response = "hesitate";
    else if (score >= -2) {
      // Could be hesitate or a sneaky mislead.
      response = (archetype === "sneaky" && Math.random() < 0.35)
        ? "mislead" : "hesitate";
    } else if (score >= -4) {
      // Could be reject or a leak (leak is more likely with sneaky / paranoid).
      const leakChance =
          archetype === "sneaky"   ? 0.45
        : archetype === "paranoid" ? 0.30
        :                            0.10;
      response = Math.random() < leakChance ? "leak" : "reject";
    } else {
      response = "reject";
    }

    // ── Apply per-member effects ──────────────────────────────────────
    switch (response) {
      case "agree":
        if (typeof setCampTargetForContestant === "function") {
          setCampTargetForContestant(state, mid, targetId, 7);
        }
        adjustRelationship(state, mid, coordinatorId, +1);
        break;
      case "soft-agree":
        adjustRelationship(state, mid, coordinatorId, +1);
        break;
      case "hesitate":
        // No mechanical effect.
        break;
      case "mislead":
        // Says yes but doesn't commit. Trust quietly bleeds.
        adjustTrust(state, mid, coordinatorId, -1);
        break;
      case "leak":
        adjustSuspicion(state, coordinatorId, +1);
        if (typeof seedRumor === "function") {
          // Member becomes the originator of the leaked-targeting rumor.
          seedRumor(state, "targeting", coordinatorId, targetId, mid, 0.8);
        }
        break;
      case "reject":
        adjustRelationship(state, mid, coordinatorId, -2);
        adjustAllianceStrength(alliance, -0.5);
        break;
    }

    responses.push({ memberId: mid, name: member.name, response });
  }

  // ── Aggregate effects ───────────────────────────────────────────────
  const agreeCount  = responses.filter(r => r.response === "agree").length;
  const softCount   = responses.filter(r => r.response === "soft-agree").length;
  const rejectCount = responses.filter(r => r.response === "reject").length;
  const leakCount   = responses.filter(r => r.response === "leak").length;
  const totalAgree  = agreeCount + softCount;

  // Target gets a public-suspicion bump per agreement landed (the room is
  // tilting on them).
  if (totalAgree >= 1) {
    adjustSuspicion(state, targetId, totalAgree);
  }

  // Alliance strength shifts based on outcome distribution.
  if (responses.length > 0) {
    if (totalAgree >= Math.ceil(responses.length / 2) && rejectCount === 0) {
      adjustAllianceStrength(alliance, +0.5);
      alliance.lastReinforcedRound = state.round ?? 0;
    } else if (rejectCount >= 2) {
      adjustAllianceStrength(alliance, -0.5);
    }
  }

  logEvent(state, {
    category:      "alliance",
    type:          "vote-coordinated",
    text: state.player && state.player.id === coordinatorId
      ? `You pushed a vote plan against ${target.name} through "${alliance.name}".`
      : `${coordinator.name} pushed a vote plan against ${target.name} through "${alliance.name}".`,
    playerVisible: state.player && (
      state.player.id === coordinatorId ||
      alliance.memberIds.includes(state.player.id)
    ),
    meta: { allianceId, coordinatorId, targetId, responses: responses.map(r => r.response) },
  });

  return {
    responses,
    target,
    alliance,
    agreeCount, softCount, rejectCount, leakCount,
    totalAgree,
  };
}

// ── Round-end drift ───────────────────────────────────────────────────────────
//
// Once per round, each active alliance's strength drifts based on five
// signals. Each is small on its own; together they make alliances feel like
// living organisms that need ongoing care.
//
//   1. Natural fit       — avg pair rel/trust drives ±0.5 / ±1 drift
//   2. Suspicion penalty — −0.5 per member with public suspicion ≥ 6
//   3. Challenge threat  — −0.2 per member with challenge ≥ 9 (flush targets)
//   4. Staleness         — −0.5 if no positive member interaction for 2+ rounds
//   5. Partial fracture  — outlier members drift out (avg rel < −3, trust < 2)
//
// Called from main.js advanceRound() at the end of each round.
function updateAlliances(state) {
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (a.memberIds.length < 2) {
      a.status = "dissolved";
      a.strength = 0;
      continue;
    }

    // ── Partial fracture ──────────────────────────────────────────────────
    // For 3+ member alliances, find any member whose ties to the rest have
    // genuinely collapsed — they silently drift out before drift is computed
    // (so the post-fracture alliance isn't double-penalised by their hostility).
    if (a.memberIds.length >= 3) {
      _ejectFractureOutliers(state, a);
      // Re-check size after potential ejections.
      if (a.memberIds.length < 2) {
        a.status = "dissolved";
        a.strength = 0;
        continue;
      }
    }

    // ── 1. Natural fit (avg rel/trust drift) ──────────────────────────────
    let pairCount = 0, relSum = 0, trustSum = 0;
    for (let i = 0; i < a.memberIds.length; i++) {
      for (let j = i + 1; j < a.memberIds.length; j++) {
        relSum   += getRelationship(state, a.memberIds[i], a.memberIds[j]);
        trustSum += getTrust(state, a.memberIds[i], a.memberIds[j]);
        pairCount++;
      }
    }
    if (pairCount === 0) continue;

    const avgRel   = relSum   / pairCount;
    const avgTrust = trustSum / pairCount;

    if (avgRel >= 8 && avgTrust >= 5) {
      adjustAllianceStrength(a, +0.5);
    } else if (avgRel < 0 || avgTrust < 3) {
      adjustAllianceStrength(a, -1);
    } else if (avgRel < 5 || avgTrust < 4) {
      adjustAllianceStrength(a, -0.5);
    }

    // ── 2. Suspicion penalty ──────────────────────────────────────────────
    let highSuspCount = 0;
    for (const id of a.memberIds) {
      const c = findContestant(state, id);
      if (c && (c.suspicion ?? 0) >= 6) highSuspCount++;
    }
    if (highSuspCount > 0) adjustAllianceStrength(a, -0.5 * highSuspCount);

    // ── 3. Challenge threat ───────────────────────────────────────────────
    // High-stat physical players read as flush targets to outsiders, which
    // creates ongoing destabilisation pressure on the alliance protecting them.
    let threatCount = 0;
    for (const id of a.memberIds) {
      const c = findContestant(state, id);
      if (c && c.challenge >= 9) threatCount++;
    }
    if (threatCount > 0) adjustAllianceStrength(a, -0.2 * threatCount);

    // ── 4. Staleness ──────────────────────────────────────────────────────
    // An alliance that hasn't seen a positive interaction in a couple rounds
    // bleeds. This is the v3.5 "active maintenance" pressure — alliances
    // need talking, confiding, aligned strategy to stay sharp.
    const lastReinforced = a.lastReinforcedRound ?? a.formedRound;
    if (state.round - lastReinforced >= 2) {
      adjustAllianceStrength(a, -0.5);
    }

    // ── 5. v5.19: post-merge reassessment churn ───────────────────────────
    // After the merge, alliances aren't anchored by tribe-strength logic
    // anymore. People reassess value more often. Add a small extra drift
    // pressure so post-merge alliances are inherently less rigid — 5%
    // chance per round of an extra ±0.5 wobble, biased by current natural
    // fit (so a thriving alliance still trends up, just bumpier).
    if (state.merged && Math.random() < 0.50) {
      const wobbleDir = avgRel >= 5 ? +0.5 : -0.5;
      adjustAllianceStrength(a, wobbleDir);
    }
  }
}

// Ejects any member whose average relationship and trust with the rest of the
// alliance has collapsed below a fracture threshold. Returns silently — the
// member just leaves; their hostility is already encoded in the rel/trust
// values. The alliance loses 1 strength to commemorate the loss (members will
// need to recommit to absorb the destabilisation).
function _ejectFractureOutliers(state, alliance) {
  // Iterate over a snapshot — we may mutate alliance.memberIds inside the loop.
  for (const candidateId of [...alliance.memberIds]) {
    if (alliance.memberIds.length < 3) break;   // never fracture below 3 → 2

    const others = alliance.memberIds.filter(id => id !== candidateId);
    if (others.length === 0) continue;

    let relSum = 0, trustSum = 0;
    for (const otherId of others) {
      relSum   += getRelationship(state, candidateId, otherId);
      trustSum += getTrust(state, candidateId, otherId);
    }
    const avgRel   = relSum   / others.length;
    const avgTrust = trustSum / others.length;

    if (avgRel < -3 && avgTrust < 2) {
      const idx = alliance.memberIds.indexOf(candidateId);
      if (idx !== -1) alliance.memberIds.splice(idx, 1);
      adjustAllianceStrength(alliance, -1);
    }
  }
}

// ── Voting aftermath ──────────────────────────────────────────────────────────
//
// Runs once per Tribal Council, immediately after votes are cast (before the
// dramatic reveal). Two passes per alliance:
//
//   1. BETRAYAL DETECTION — was any member's vote cast against a fellow ally?
//      • Betrayer/betrayed pair: relationship −8, trust −4 (catastrophic)
//      • Witness members:        relationship −3, trust −2 (everyone saw it)
//      • Alliance structural:    strength −3
//      • Betrayer is EJECTED from the alliance
//
//   2. ALIGNMENT — among the REMAINING members (post-ejection):
//      unanimous (all same target)            → +1 strength
//      majority (most agree but a split)      → −0.5 strength
//      fragmented (<50% agree on top target)  → −2 strength
//
// This is the alliance's true test. Camps look unified; votes reveal the truth.
function processVotingAftermath(state, allVotes) {
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (a.memberIds.length < 2) continue;

    // ── Betrayal pass ─────────────────────────────────────────────────────
    // Snapshot memberIds at the start — ejections happen below and we want
    // "witness" hits to land on every member as of the moment the vote was cast.
    const memberSnapshot = [...a.memberIds];
    const betrayals = [];

    for (const v of allVotes) {
      if (!memberSnapshot.includes(v.voter.id))  continue;   // not a member
      if (!memberSnapshot.includes(v.target.id)) continue;   // didn't target ally
      if (v.voter.id === v.target.id)            continue;   // (sanity)
      betrayals.push({ voterId: v.voter.id, targetId: v.target.id });
    }

    for (const { voterId, targetId } of betrayals) {
      // The betrayed pair takes the heaviest hit.
      adjustRelationship(state, voterId, targetId, -8);
      adjustTrust(state, voterId, targetId, -4);

      // Witness members — every other member of the alliance saw it too.
      // Their trust in the betrayer collapses; relationship hardens.
      for (const witnessId of memberSnapshot) {
        if (witnessId === voterId || witnessId === targetId) continue;
        adjustRelationship(state, voterId, witnessId, -3);
        adjustTrust(state, voterId, witnessId, -2);
      }

      // Structural damage to the alliance and ejection of the betrayer.
      adjustAllianceStrength(a, -3);
      const idx = a.memberIds.indexOf(voterId);
      if (idx !== -1) a.memberIds.splice(idx, 1);

      // Event log: the player only sees betrayals involving their alliance.
      const playerInAlliance = state.player && memberSnapshot.includes(state.player.id);
      const betrayer = findContestant(state, voterId);
      const betrayed = findContestant(state, targetId);
      const playerIsBetrayer = state.player && voterId === state.player.id;
      const playerIsBetrayed = state.player && targetId === state.player.id;

      let text;
      if (playerIsBetrayer)        text = `You broke from "${a.name}" — voting against ${betrayed?.name ?? "an ally"}.`;
      else if (playerIsBetrayed)   text = `${betrayer?.name ?? "An ally"} betrayed you, voting against you in "${a.name}".`;
      else                         text = `${betrayer?.name ?? "Someone"} betrayed "${a.name}" — voting against ${betrayed?.name ?? "an ally"}.`;

      logEvent(state, {
        category:      "alliance",
        type:          "betrayal",
        text,
        playerVisible: playerInAlliance,
        meta: { allianceId: a.id, betrayerId: voterId, betrayedId: targetId },
      });
    }

    // Post-ejection sanity: alliance may have collapsed.
    if (a.memberIds.length < 2) {
      const playerWasMember = state.player && memberSnapshot.includes(state.player.id);
      logEvent(state, {
        category:      "alliance",
        type:          "dissolved",
        text: playerWasMember
          ? `Your alliance "${a.name}" has dissolved.`
          : `"${a.name}" has dissolved.`,
        playerVisible: playerWasMember,
        meta: { allianceId: a.id, reason: "betrayal-cascade" },
      });

      a.status = "dissolved";
      a.strength = 0;
      continue;
    }

    // ── Alignment pass (on remaining members only) ────────────────────────
    const remainingVotes = allVotes.filter(v => a.memberIds.includes(v.voter.id));
    if (remainingVotes.length < 2) continue;

    const counts = {};
    for (const v of remainingVotes) {
      counts[v.target.id] = (counts[v.target.id] ?? 0) + 1;
    }
    const top   = Math.max(...Object.values(counts));
    const ratio = top / remainingVotes.length;

    if (ratio === 1) {
      adjustAllianceStrength(a, +1);
      // Voting together IS active maintenance — refresh the staleness clock.
      a.lastReinforcedRound = state.round;
    } else if (ratio < 0.5) {
      adjustAllianceStrength(a, -2);
    } else {
      adjustAllianceStrength(a, -0.5);
    }
  }
}

// ── Voting blocs ─────────────────────────────────────────────────────────────
//
// Detects ephemeral voting coalitions from the round's actual votes. Any
// group of 2+ voters who picked the same target counts as a bloc. Blocs are
// observational primarily — they expose the de-facto coordination structure
// of a vote, separate from the persistent alliance graph.
//
// A bloc "crosses alliances" if its members aren't all in one shared alliance.
// Cross-alliance blocs grant a small relationship +1 between every pair of
// members — "we worked together this round" — which over time can seed new
// alliances.
//
// Cleared at the start of each round in advanceRound().
function detectVotingBlocs(state, allVotes) {
  // Group voters by their chosen target.
  const groups = {};
  for (const v of allVotes) {
    if (!groups[v.target.id]) groups[v.target.id] = [];
    groups[v.target.id].push(v.voter);
  }

  for (const targetId of Object.keys(groups)) {
    const voters = groups[targetId];
    if (voters.length < 2) continue;

    // Crosses alliances if any two voters in the bloc share NO common alliance.
    let crossesAlliances = false;
    outer: for (let i = 0; i < voters.length; i++) {
      for (let j = i + 1; j < voters.length; j++) {
        if (!isInSameAlliance(state, voters[i].id, voters[j].id)) {
          crossesAlliances = true;
          break outer;
        }
      }
    }

    state.votingBlocs.push({
      id:               `bloc-${state.votingBlocs.length + 1}-r${state.round}`,
      memberIds:        voters.map(v => v.id),
      targetId,
      formedRound:      state.round,
      crossesAlliances,
    });

    // "We worked together" affinity — only for cross-alliance blocs, since
    // members of an existing alliance don't need this nudge (they're already
    // accumulating relationship through the alliance's own dynamics).
    if (crossesAlliances) {
      for (let i = 0; i < voters.length; i++) {
        for (let j = i + 1; j < voters.length; j++) {
          // Only bump for pairs not already in a shared alliance — pairs
          // inside the same alliance get plenty of upside elsewhere.
          if (isInSameAlliance(state, voters[i].id, voters[j].id)) continue;
          adjustRelationship(state, voters[i].id, voters[j].id, 1);
        }
      }
    }
  }
}

// ── AI auto-formation ─────────────────────────────────────────────────────────
//
// Runs at end of each camp phase 2 for the relevant pool (one tribe pre-merge,
// the merged tribe post-merge). For each pair of NPCs not yet sharing an
// alliance, with high relationship AND trust, there's a per-round chance to
// form or join one.
//
//   threshold to consider a pair: rel ≥ 12 AND trust ≥ 6
//   per-round formation chance:   20%
//
// Decision branches:
//   • Both unaligned                  → form a new 2-person alliance
//   • One in an active alliance       → invite the other to join (if str ≥ 5)
//   • Both already in alliances       → no action (separate spheres)
//
// The player is excluded from this pass — they form alliances explicitly via
// the proposeAlliance camp action. Otherwise alliances would silently appear
// around the player without their input.
function aiFormAlliances(state, pool) {
  const npcs = pool.filter(c => c.id !== state.player?.id);

  for (let i = 0; i < npcs.length; i++) {
    for (let j = i + 1; j < npcs.length; j++) {
      const a = npcs[i];
      const b = npcs[j];

      if (isInSameAlliance(state, a.id, b.id)) continue;

      const rel   = getRelationship(state, a.id, b.id);
      const trust = getTrust(state, a.id, b.id);

      // v3.7: cross-original-tribe pairs face a higher bar post-swap.
      // Pre-swap, everyone in a tribe shares originalTribe, so this gate is
      // a no-op. Post-swap, cross-tribe pairs need stronger rel/trust AND
      // form at half the rate — old enemies don't lock arms quickly.
      // v5.19: post-merge, old tribe lines still mean SOMETHING (people
      // remember where they came from) but they're a much softer factor.
      // Cross-original-tribe pacts post-merge form at lower barriers and
      // higher rates than during a swap, because the old tribe identity
      // no longer maps onto a meaningful sub-group.
      const sameOrigin   = a.originalTribe === b.originalTribe;
      const postMerge    = !!state.merged;
      const minRel       = sameOrigin ? 12 : (postMerge ? 12 : 14);
      const minTrust     = sameOrigin ? 6  : (postMerge ? 5  : 7);
      let   formChance   = sameOrigin
        ? (postMerge ? 0.25 : 0.20)
        : (postMerge ? 0.18 : 0.10);
      // v5.13: archetype tilt on formation. Loyal pairs lock in faster;
      // sneaky pairs hesitate (less interested in committed pacts);
      // paranoid pairs hesitate (don't trust the structure).
      const tilt = (arch) =>
        arch === "loyal"    ?  0.08 :
        arch === "sneaky"   ? -0.05 :
        arch === "paranoid" ? -0.04 : 0;
      formChance = Math.max(0.02, Math.min(0.50,
        formChance + tilt(a.archetype) + tilt(b.archetype)
      ));
      if (rel < minRel || trust < minTrust) continue;
      if (Math.random() >= formChance) continue;

      const aAlliances = getAlliancesForMember(state, a.id);
      const bAlliances = getAlliancesForMember(state, b.id);

      // Both unaligned: form new 2-person alliance
      if (aAlliances.length === 0 && bAlliances.length === 0) {
        createAlliance(state, [a, b], a.id, 4 + Math.floor(trust / 3));
        continue;
      }

      // One in an alliance, the other not: invite into the strongest
      const inviter = aAlliances.length > 0 ? aAlliances : bAlliances;
      const newcomer = aAlliances.length > 0 ? b : a;
      const target = inviter.find(al => al.strength >= 5);
      if (target) {
        target.memberIds.push(newcomer.id);
        // Light strength bump — newcomer brings energy, but trust is unproven
        adjustAllianceStrength(target, +0.5);
      }
      // Both in their own alliances: skip (overlapping spheres are fine but
      // shouldn't auto-merge — that would be too aggressive)
    }
  }
}
