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
