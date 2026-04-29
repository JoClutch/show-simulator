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
  const alliance = {
    id:          _nextAllianceId(),
    name:        _pickAllianceName(state),
    memberIds:   members.map(m => m.id),
    founderId:   founderId ?? members[0].id,
    formedRound: state.round,
    strength:    Math.max(1, Math.min(10, initialStrength)),
    status:      "active",
  };
  state.alliances.push(alliance);
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
}

// Applies a delta to every active alliance that contains BOTH members.
// Used by camp interactions where two specific members did something
// together (deep talk, confide, aligned strategy talk).
function strengthenSharedAlliances(state, idA, idB, delta) {
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (a.memberIds.includes(idA) && a.memberIds.includes(idB)) {
      adjustAllianceStrength(a, delta);
    }
  }
}

// Removes a contestant from every alliance they belong to. Called when
// someone is eliminated. Alliances dropping below 2 members are dissolved.
function removeMemberFromAlliances(state, contestantId) {
  for (const a of state.alliances ?? []) {
    const idx = a.memberIds.indexOf(contestantId);
    if (idx === -1) continue;
    a.memberIds.splice(idx, 1);
    if (a.memberIds.length < 2) {
      a.status   = "dissolved";
      a.strength = 0;
    }
  }
}

// ── Round-end drift ───────────────────────────────────────────────────────────
//
// Once per round, each active alliance's strength drifts toward its "natural
// fit" — the average relationship and trust among its members. Positive drift
// when members genuinely like and trust each other; negative when those bonds
// fray. Suspicion on members applies a separate penalty (suspicion is a public
// red flag that destabilizes alliances).
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

    // Average pair relationship & trust within the alliance.
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

    // Drift toward natural cohesion. Tuned so a healthy alliance slowly grows
    // and a fraying one slowly bleeds out — roughly ±1 strength per round.
    if (avgRel >= 8 && avgTrust >= 5) {
      adjustAllianceStrength(a, +0.5);
    } else if (avgRel < 0 || avgTrust < 3) {
      adjustAllianceStrength(a, -1);
    } else if (avgRel < 5 || avgTrust < 4) {
      adjustAllianceStrength(a, -0.5);
    }

    // Suspicion penalty: each high-suspicion member shaves another 0.5.
    let highSuspCount = 0;
    for (const id of a.memberIds) {
      const c = findContestant(state, id);
      if (c && (c.suspicion ?? 0) >= 6) highSuspCount++;
    }
    if (highSuspCount > 0) adjustAllianceStrength(a, -0.5 * highSuspCount);
  }
}

// ── Voting aftermath ──────────────────────────────────────────────────────────
//
// Run once per Tribal Council, immediately after votes are cast (before the
// dramatic reveal). Inspects each alliance's voting alignment:
//
//   unanimous (all same target)            → +1 strength  (shared move binds)
//   majority (most agree but a split)      → −0.5 strength (small fracture)
//   fragmented (<50% agree on top target)  → −2 strength  (real betrayal)
//
// This is the main "alliances test under pressure" moment. Camps look unified;
// votes reveal the truth.
function processVotingAftermath(state, allVotes) {
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;

    const memberVotes = allVotes.filter(v => a.memberIds.includes(v.voter.id));
    if (memberVotes.length < 2) continue;   // need at least 2 voters to align

    const counts = {};
    for (const v of memberVotes) {
      counts[v.target.id] = (counts[v.target.id] ?? 0) + 1;
    }
    const top   = Math.max(...Object.values(counts));
    const ratio = top / memberVotes.length;

    if (ratio === 1)        adjustAllianceStrength(a, +1);
    else if (ratio < 0.5)   adjustAllianceStrength(a, -2);
    else                    adjustAllianceStrength(a, -0.5);
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
      if (rel < 12 || trust < 6) continue;

      if (Math.random() >= 0.20) continue;   // 20% per qualifying pair

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
