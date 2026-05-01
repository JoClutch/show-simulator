// relationships.js — social state API: relationships, trust, and suspicion
//
// ── Relationships ─────────────────────────────────────────────────────────────
//   state.relationships[idA][idB] = number
//   Symmetric. Range roughly –50 to +50. Starts at 0.
//   Main driver of AI vote targeting.
//
// ── Trust ────────────────────────────────────────────────────────────────────
//   state.trust[idA][idB] = number
//   Symmetric. Range 0–10. Starts at 3 (slight baseline goodwill).
//   Affects intel quality from askVote and effectiveness of strategy/confide.
//
//   Reading:
//     0–2  : distrustful — will mislead or refuse to share intel
//     3–5  : guarded     — gives vague answers, lukewarm cooperation (default)
//     6–10 : open        — honest intel, easier strategy alignment
//
// ── Suspicion ─────────────────────────────────────────────────────────────────
//   contestant.suspicion = number
//   Stored on the contestant object (not in nested state) since it is a
//   property of the person, not of a pair. Range 0–10. Starts at 0.
//   Each point applies a –2 penalty in AI vote scoring, making suspicious
//   players more likely to be voted out regardless of their relationships.

// ── Initialisation ────────────────────────────────────────────────────────────

// Builds relationship and trust entries for every active contestant pair.
// Called once after the player is selected (and tribes are already set).
function initRelationships(state) {
  const all = [...state.tribes.A, ...state.tribes.B];

  for (const c of all) {
    state.relationships[c.id] = {};
    state.trust[c.id]         = {};
    // v5.13: assign each contestant a soft archetype based on their stats.
    // Archetypes are tendencies — they tilt action selection and
    // conversation behavior but never override active context.
    if (!c.archetype) c.archetype = pickArchetype(c);
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].id;
      const b = all[j].id;

      state.relationships[a][b] = 0;
      state.relationships[b][a] = 0;

      state.trust[a][b] = 3;   // baseline: slight goodwill, not yet earned
      state.trust[b][a] = 3;
    }
  }
}

// ── v5.13: Soft archetypes ───────────────────────────────────────────────────
//
// Six archetypes, picked once per contestant via stat-biased weighted random.
// Multiple contestants with identical stats can still land different
// archetypes (random component) so cast variety persists even with similar
// templates.
//
//   loyal           — sticks to alliances, candid, low deception flip
//   sneaky          — high deception flip, more evasive, pushes lobbies
//   paranoid        — quick to read schemes, suspicious mood-tilt, lays low
//   socialButterfly — talkative, oversharing, weights talk/confide
//   workhorse       — quiet labor, weights tendCamp, candor-neutral
//   challengeBeast  — stat-defined, neutral social tilt, slight evasiveness
//
// Stored on contestant.archetype as a string; default "balanced" if missing
// (e.g. legacy save data) so all archetype-aware code falls through cleanly.
const ARCHETYPES = ["loyal", "sneaky", "paranoid", "socialButterfly", "workhorse", "challengeBeast"];

function pickArchetype(c) {
  const social    = c.social    ?? 5;
  const strategy  = c.strategy  ?? 5;
  const challenge = c.challenge ?? 5;

  // Each archetype gets a baseline 1 weight so any cast composition is
  // possible; stat fits add additional weight.
  const w = {
    loyal:           1 + (social >= 6 ? 1 : 0) + (strategy <= 6 ? 1 : 0),
    sneaky:          1 + (strategy >= 7 ? 2 : 0) + (social <= 5 ? 1 : 0),
    paranoid:        1 + (strategy >= 6 ? 1 : 0) + (social <= 5 ? 1 : 0),
    socialButterfly: 1 + (social >= 7 ? 2 : 0),
    workhorse:       1 + (challenge >= 6 && social <= 5 ? 2 : 0),
    challengeBeast:  1 + (challenge >= 8 ? 3 : 0),
  };

  const total = Object.values(w).reduce((s, v) => s + v, 0);
  let roll = Math.random() * total;
  for (const arch of ARCHETYPES) {
    if ((roll -= w[arch]) <= 0) return arch;
  }
  return "loyal";
}

// ── Relationship API ──────────────────────────────────────────────────────────

function getRelationship(state, idA, idB) {
  return state.relationships[idA]?.[idB] ?? 0;
}

// Applies delta to both directions. No clamp — relationships can go very
// negative (enemies) or positive (close allies) over many rounds.
//
// v5.12: every pair adjustment is also logged as an "interaction" in
// state.recentInteractions, so the round-end passive drift pass knows which
// pairs DIDN'T engage (and should drift). Material drops (delta ≤ −2) also
// stamp state.lastConflicts, used by the Check In After Conflict action to
// detect a recent rift.
function adjustRelationship(state, idA, idB, delta) {
  if (!state.relationships[idA] || !state.relationships[idB]) return;
  state.relationships[idA][idB] = (state.relationships[idA][idB] ?? 0) + delta;
  state.relationships[idB][idA] = (state.relationships[idB][idA] ?? 0) + delta;

  if (state.recentInteractions) {
    if (!state.recentInteractions[idA]) state.recentInteractions[idA] = {};
    if (!state.recentInteractions[idB]) state.recentInteractions[idB] = {};
    state.recentInteractions[idA][idB] = true;
    state.recentInteractions[idB][idA] = true;
  }

  if (delta <= -2 && state.lastConflicts) {
    if (!state.lastConflicts[idA]) state.lastConflicts[idA] = {};
    if (!state.lastConflicts[idB]) state.lastConflicts[idB] = {};
    const entry = { round: state.round ?? 0, severity: -delta, kind: "rel" };
    state.lastConflicts[idA][idB] = entry;
    state.lastConflicts[idB][idA] = entry;
  }
}

// ── Trust API ─────────────────────────────────────────────────────────────────

function getTrust(state, idA, idB) {
  return state.trust[idA]?.[idB] ?? 3;
}

// Applies delta to both directions, clamped to [0, 10].
function adjustTrust(state, idA, idB, delta) {
  if (!state.trust[idA] || !state.trust[idB]) return;
  state.trust[idA][idB] = Math.max(0, Math.min(10, (state.trust[idA][idB] ?? 3) + delta));
  state.trust[idB][idA] = Math.max(0, Math.min(10, (state.trust[idB][idA] ?? 3) + delta));
}

// ── Suspicion API ─────────────────────────────────────────────────────────────

// Looks up a contestant from the active tribes by id.
// Searches A, B, and merged so this works both pre- and post-merge.
// Returns null if not found (e.g. already eliminated — should not happen in practice).
function findContestant(state, id) {
  for (const label of ["A", "B", "merged"]) {
    const c = state.tribes[label]?.find(c => c.id === id);
    if (c) return c;
  }
  return null;
}

// Applies delta to contestant.suspicion, clamped to [0, 10].
function adjustSuspicion(state, id, delta) {
  const c = findContestant(state, id);
  if (!c) return;
  c.suspicion = Math.max(0, Math.min(10, (c.suspicion ?? 0) + delta));
}

// ── Idol suspicion API ───────────────────────────────────────────────────────
//
// Each contestant privately tracks how strongly they believe each other
// contestant holds a hidden immunity idol. Asymmetric — A's belief about B is
// independent of B's belief about A.
//
//   state.idolSuspicion[observerId][holderId] = number   // 0–10, default 0
//
// Tiers (by score):
//   0–2  unaware  : no real reason to suspect them
//   3–6  suspect  : a hunch — saw something, heard something
//   7–10 confident: pretty sure they have one
//
// At tribal council, voters with high idol suspicion of a candidate adjust
// their vote (see vote.js): strategic voters lean into a flush, less strategic
// voters avoid wasting a vote. See spreadIdolSuspicion below for how beliefs
// propagate between close allies overnight.

function getIdolSuspicion(state, observerId, holderId) {
  return state.idolSuspicion?.[observerId]?.[holderId] ?? 0;
}

// Applies a delta clamped to [0, 10].
// Lazily creates the inner observer object — no need to pre-init for every pair.
function adjustIdolSuspicion(state, observerId, holderId, delta) {
  if (!state.idolSuspicion) state.idolSuspicion = {};
  if (!state.idolSuspicion[observerId]) state.idolSuspicion[observerId] = {};
  const cur = state.idolSuspicion[observerId][holderId] ?? 0;
  state.idolSuspicion[observerId][holderId] = Math.max(0, Math.min(10, cur + delta));
}

// Returns the categorical tier name for an idol suspicion score.
function idolSuspicionTier(score) {
  if (score >= 7) return "confident";
  if (score >= 3) return "suspect";
  return "unaware";
}

// ── Idol suspicion: gossip / spread ──────────────────────────────────────────
//
// Once per pre-tribal step, close allies in the same active pool may share
// what they suspect about idol possession. Suspicion ≥5 in observer A about
// holder X has a chance to nudge each close-ally B's suspicion of X up by 1.
//
// "Close ally" gate: relationship ≥5 AND trust ≥4 between A and B.
// Spread chance scales lightly with the gossiper's social skill — natural
// communicators get their read across more reliably.
//
// pool — the array of contestants among whom gossip happens (one tribe pre-merge,
//        the merged tribe post-merge).
//
// This is intentionally restrained: only meaningful suspicions spread, only to
// already-close allies, and only one point at a time. Suspicion forms slow,
// realistic clusters around alliances rather than spreading like wildfire.
// ── v5.12: Suspicion memory API ──────────────────────────────────────────────
//
// Asymmetric, persistent: state.suspicionMemory[observerId][actorId] = score.
// Range 0–10. Logged when an actor does something visibly shady in the
// observer's range — idol search, hard lobbying, an exposed lie, scrambling.
// Decays gradually each round so a clean stretch lets reputation recover, but
// nothing wipes overnight.
//
// Read by AI vote scoring as a small additional penalty; read by the camp
// UI in tooltips so the player can see why someone has cooled on them.
function getSuspicionMemory(state, observerId, actorId) {
  return state.suspicionMemory?.[observerId]?.[actorId] ?? 0;
}

function adjustSuspicionMemory(state, observerId, actorId, delta) {
  if (!state.suspicionMemory) state.suspicionMemory = {};
  if (!state.suspicionMemory[observerId]) state.suspicionMemory[observerId] = {};
  const cur = state.suspicionMemory[observerId][actorId] ?? 0;
  state.suspicionMemory[observerId][actorId] = Math.max(0, Math.min(10, cur + delta));
}

// Records a flagged behavior. `reason` is a short tag for debugging/UI.
// `weight` defaults to 1 — pass higher for more egregious acts.
function recordSuspiciousAct(state, observerId, actorId, reason, weight = 1) {
  if (observerId === actorId) return;
  adjustSuspicionMemory(state, observerId, actorId, weight);
  // Stamp a lightweight conflict marker so Check In knows there's something
  // to repair even if rel hasn't yet dropped below the −2 threshold.
  if (state.lastConflicts) {
    if (!state.lastConflicts[observerId]) state.lastConflicts[observerId] = {};
    if (!state.lastConflicts[actorId])    state.lastConflicts[actorId]    = {};
    const entry = { round: state.round ?? 0, severity: weight, kind: reason };
    state.lastConflicts[observerId][actorId] = entry;
    state.lastConflicts[actorId][observerId] = entry;
  }
}

// Round-end pass: every observer's memory of every actor decays by 0.4.
// v5.15: tuned down from 0.5 — reputation should fade gradually but persist
// long enough to matter. A single suspicious act now lingers ~3 rounds; a
// concentrated burst persists 6–7 rounds even with a clean stretch after.
// Heavy memory (≥ 4) decays at 0.6 so genuine reputation cliffs (caught in
// repeated lies) don't linger forever once the player corrects course.
function decaySuspicionMemory(state) {
  if (!state.suspicionMemory) return;
  for (const observerId of Object.keys(state.suspicionMemory)) {
    const inner = state.suspicionMemory[observerId];
    for (const actorId of Object.keys(inner)) {
      const cur = inner[actorId] ?? 0;
      const decay = cur >= 4 ? 0.6 : 0.4;
      inner[actorId] = Math.max(0, cur - decay);
      if (inner[actorId] === 0) delete inner[actorId];
    }
    if (Object.keys(inner).length === 0) delete state.suspicionMemory[observerId];
  }
}

// ── v5.12: Passive relationship drift ────────────────────────────────────────
//
// Round-end pass. For every pair that did NOT have a recorded interaction
// during the just-finished round, rel drifts gently toward 0:
//
//   • Allies (sharing an active alliance): exempt — alliance system already
//     manages their drift.
//   • Anchored bonds (rel ≥ 20): exempt — past a certain depth a bond
//     doesn't fade from a single quiet round.
//   • Otherwise: rel moves 1 point toward 0 (positive rel decays down,
//     negative rel softens up). Caps at 0 (never crosses).
//
// Doesn't run on contestants who are already eliminated. Runs across the
// merged pool post-merge or both tribes pre-merge.
function passiveDrift(state) {
  const pool = state.merged
    ? [...(state.tribes?.merged || [])]
    : [...(state.tribes?.A || []), ...(state.tribes?.B || [])];

  // Build a quick lookup of allied pairs to skip them.
  const alliedPairs = new Set();
  if (state.alliances) {
    for (const a of state.alliances) {
      if (a.dissolved || a.status === "dissolved") continue;
      const ids = a.memberIds || [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          alliedPairs.add(ids[i] + "|" + ids[j]);
          alliedPairs.add(ids[j] + "|" + ids[i]);
        }
      }
    }
  }

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i].id;
      const b = pool[j].id;

      // Skip if they engaged this round.
      if (state.recentInteractions?.[a]?.[b]) continue;
      // Skip allied pairs.
      if (alliedPairs.has(a + "|" + b)) continue;

      const rel = getRelationship(state, a, b);
      // v5.15: anchor threshold tightened to ±18 — past that, the bond is
      // genuinely settled and one quiet round shouldn't budge it.
      if (rel >= 18 || rel <= -18) continue;

      // v5.15: drift fires 60% of rounds rather than always. Same long-term
      // expected magnitude but less mechanically predictable — players can't
      // count on rel ticking down by exactly 1 per quiet round.
      if (Math.random() >= 0.60) continue;

      // Drift toward 0 by 1 point. Never cross zero.
      let drift;
      if (rel > 0)      drift = -1;
      else if (rel < 0) drift = +1;
      else continue;

      // Apply directly without re-marking interaction (drift isn't engagement).
      state.relationships[a][b] = (state.relationships[a][b] ?? 0) + drift;
      state.relationships[b][a] = (state.relationships[b][a] ?? 0) + drift;
    }
  }
}

// Round-end housekeeping: clear per-round interaction log and per-round
// check-in records. Called from advanceRound() AFTER passiveDrift and
// decaySuspicionMemory have done their work.
function clearRoundEphemera(state) {
  state.recentInteractions = {};
  state.checkInsThisRound  = {};
}

// ── v5.16: Social capital ────────────────────────────────────────────────────
//
// Hidden derived metric. Returns a float roughly in [0, 10] representing how
// well a contestant is "doing" socially across the WHOLE tribe — not just
// in any one pair. Computed on demand from existing state (no new storage)
// so it never goes stale and remains easy to tune in one place.
//
// Why derive instead of store: every camp action already mutates the inputs
// (rel, suspicion, action history, suspicion memory, conflicts). Recomputing
// on demand keeps the metric exactly synchronized with current state without
// adding a fanout problem (where to update from each event).
//
// ── Inputs ────────────────────────────────────────────────────────────────────
//   • Likability       — average rel with active tribemates
//   • Provider rep     — share of tendCamp in action history
//   • Consistency      — variety bonus when action history isn't one-note
//   • Strategic heat   — share of lobby + searchidol in action history (penalty)
//   • Suspicion        — contestant.suspicion (penalty)
//   • Conflict load    — count of unresolved recent conflicts (penalty)
//   • Memory cliff     — sum of all observers' suspicion memory of them (penalty)
//   • Camp role        — provider/socialConnector/drifter +; schemer −
//
// Final value clamped to [0, 10]. Baseline (no signal) sits near 5.0.
//
// ── Where it's read ───────────────────────────────────────────────────────────
//   • vote.js scoreVoteTarget — low capital adds vote pressure (consensus
//                                target); high capital adds light protection
//   • campLife.js pickTruthfulnessBand — asker's capital lightly shifts candor
//   • campLife.js actionLobby — listener resists pitches against high-capital
//                                targets ("everyone likes them")
//   • campLife.js actionReadRoom — surfaces a hedged self-read about the
//                                   player's standing in the camp
//
// Not exposed as a number anywhere in the UI. Player feedback is purely
// indirect — voting outcomes, conversation tone, and hedged observation lines.
function getSocialCapital(state, contestantId) {
  // Pool: active tribemates the contestant currently shares camp with.
  const c = findContestant(state, contestantId);
  if (!c) return 5;

  const pool = state.merged
    ? (state.tribes?.merged || [])
    : (state.tribes?.[c.tribe] || []);
  const tribemates = pool.filter(m => m.id !== contestantId);
  if (tribemates.length === 0) return 5;

  // ── Likability — avg rel across tribemates, mapped onto [0, 10] ────────────
  let relSum = 0;
  for (const m of tribemates) relSum += getRelationship(state, contestantId, m.id);
  const avgRel = relSum / tribemates.length;
  // Map avgRel −15..+15 onto roughly −2.5..+2.5
  const likability = Math.max(-2.5, Math.min(2.5, avgRel * 0.16));

  // ── Action-history derived signals ────────────────────────────────────────
  const hist = state.actionHistory?.[contestantId] ?? {};
  let totalActions = 0;
  for (const k of Object.keys(hist)) totalActions += hist[k];

  const providerCount = (hist.tendCamp ?? 0);
  const schemerCount  = (hist.lobby ?? 0) + (hist.searchidol ?? 0);
  const providerShare = totalActions > 0 ? providerCount / totalActions : 0;
  const schemerShare  = totalActions > 0 ? schemerCount  / totalActions : 0;

  const providerRep   = providerShare * 1.5;       // 0..1.5
  const strategicHeat = schemerShare  * 1.8;       // 0..1.8

  // Consistency bonus — well-roundedness. Count distinct categories used.
  const distinctActions = Object.keys(hist).filter(k => hist[k] > 0).length;
  const consistency = totalActions >= 4
    ? Math.min(1.0, distinctActions * 0.18)        // 0..1.0
    : 0;

  // ── Suspicion ─────────────────────────────────────────────────────────────
  const suspicion = (c.suspicion ?? 0) * 0.35;     // 0..3.5

  // ── Conflict load ─────────────────────────────────────────────────────────
  // Count active conflicts within 2 rounds, weighted by severity.
  let conflictLoad = 0;
  const conflicts = state.lastConflicts?.[contestantId] ?? {};
  const round = state.round ?? 0;
  for (const otherId of Object.keys(conflicts)) {
    const e = conflicts[otherId];
    if (!e) continue;
    const age = round - (e.round ?? 0);
    if (age > 2) continue;
    conflictLoad += Math.min(2, e.severity ?? 1) * 0.25;
  }
  conflictLoad = Math.min(2.0, conflictLoad);

  // ── Aggregate suspicion memory against this contestant ────────────────────
  // Sum every observer's memory of them; map to a small penalty.
  let memorySum = 0;
  for (const obs of Object.keys(state.suspicionMemory ?? {})) {
    memorySum += state.suspicionMemory[obs][contestantId] ?? 0;
  }
  const memoryPenalty = Math.min(2.5, memorySum * 0.10);

  // ── Camp role identity ────────────────────────────────────────────────────
  let roleShift = 0;
  if (typeof getCampRole === "function") {
    const role     = getCampRole(state, contestantId) || "";
    const core     = role.replace(/^leaning:/, "");
    const scale    = role.startsWith("leaning:") ? 0.5 : 1.0;
    if      (core === "provider")        roleShift = +0.8 * scale;
    else if (core === "socialConnector") roleShift = +0.7 * scale;
    else if (core === "drifter")         roleShift = +0.2 * scale;
    else if (core === "schemer")         roleShift = -0.7 * scale;
    // strategist is capital-neutral — high strategy reads as neither vibe
  }

  // ── Compose ───────────────────────────────────────────────────────────────
  const baseline = 5.0;
  const capital  =
      baseline
    + likability
    + providerRep
    + consistency
    + roleShift
    - strategicHeat
    - suspicion
    - conflictLoad
    - memoryPenalty;

  return Math.max(0, Math.min(10, capital));
}

// ── v5.31: Hidden trust clusters / inner circles ─────────────────────────────
//
// A pure-derived model of who genuinely trusts whom across the tribe. Like
// social capital (v5.16), nothing is stored — every read recomputes from the
// current state of trust, rel, alliance history, conflicts, suspicion
// memory, and social capital.
//
// "Inner circle" is intentionally distinct from formal alliances:
//   • Two members of the SAME alliance can have a low inner-circle bond if
//     conflict / suspicion memory has eroded the underlying trust, even
//     while the formal pact still holds.
//   • Two players NOT in any alliance can have a high inner-circle bond if
//     trust + rel + clean history support it (informal close ties).
//   • Bonds are ASYMMETRIC: A's bond toward B may differ from B's toward A
//     because suspicion memory and social capital are asymmetric. This
//     models the real Survivor pattern where one player feels "in the
//     core" and the other has already moved on.
//   • The threshold for "inner circle" is soft — bond is a continuous 0–10
//     float, and any system reading it can pick its own cutoff.
//
// ── Inputs ────────────────────────────────────────────────────────────────────
//   • Trust (primary)            — does A actually rely on B's word?
//   • Relationship (positive)    — bonus for warmth; negatives don't subtract
//                                  (you can mistrust someone you don't dislike)
//   • Shared alliance + tier     — formal anchor, scaled by tier
//   • Alliance maturity (rounds) — older pacts have built deeper trust
//   • Recent conflict severity   — fresh fractures eat into the bond
//   • Suspicion memory (A→B)     — private "I've watched them do shady things"
//   • A's social capital         — confident players have wider circles
//
// ── Used by ──────────────────────────────────────────────────────────────────
//   • vote.js scoreVoteTarget — small extra protection from voters who hold
//                                a high inner-circle bond toward the
//                                candidate (beyond bondProtection /
//                                allianceProtection / trustFactor)
//
// Surface is INDIRECT only. Voting outcomes that defy formal alliance lines
// (e.g. someone protecting their inner-circle ally over a same-alliance
// member they've been quietly losing trust in) is the player-facing signal.
// No UI panel, no number, no list.

function getInnerCircleBond(state, idA, idB) {
  if (idA === idB) return 0;

  const trust = getTrust(state, idA, idB);              // 0–10
  const rel   = getRelationship(state, idA, idB);       // mostly -30..+30

  // Trust dominates — inner circle is fundamentally a TRUST construct.
  let bond = trust * 0.5;                                // 0–5

  // Positive rel adds warmth; negative rel doesn't subtract (you can
  // mistrust someone you don't dislike). Bond is "would you put your
  // game in their hands", not "do you enjoy their company".
  bond += Math.max(0, rel) * 0.10;                       // 0 to ~3 typical

  // Shared alliance — formal anchor. Tier scales the bonus, and alliance
  // maturity (rounds since formation) gradually deepens the bond. Caps so
  // a 12-round-old core alliance doesn't fully dominate the score.
  const sharedAlliance = (typeof getStrongestSharedAlliance === "function")
    ? getStrongestSharedAlliance(state, idA, idB) : null;
  if (sharedAlliance) {
    const tier = sharedAlliance.tier ?? "loose";
    const tierBonus =
        tier === "core"     ? 1.5
      : tier === "loose"    ? 0.7
      :                       0.2;
    bond += tierBonus;
    const age = Math.max(0,
      (state.round ?? 0) - (sharedAlliance.formedRound ?? state.round ?? 0)
    );
    bond += Math.min(1.5, age * 0.25);
  }

  // Recent conflict eats into bond directly — even when rel/trust haven't
  // yet recorded the full hit. Models the lingering "we just had words"
  // hesitation.
  if (typeof getRecentConflict === "function") {
    const conflict = getRecentConflict(state, idA, idB);
    if (conflict) bond -= Math.min(2.0, (conflict.severity ?? 1) * 0.4);
  }

  // A's private suspicion memory of B drags A's bond toward B. Asymmetric:
  // B's view of A may not match.
  const memoryAtoB = state.suspicionMemory?.[idA]?.[idB] ?? 0;
  bond -= Math.min(2.5, memoryAtoB * 0.3);

  // Confident, well-liked players have a slightly wider inner circle.
  if (typeof getSocialCapital === "function") {
    const cap = getSocialCapital(state, idA);
    bond += (cap - 5) * 0.05;                            // ±0.25
  }

  return Math.max(0, Math.min(10, bond));
}

// Returns the contestant's inner circle as a sorted array of
//   { id, name, bond }
// where bond ≥ threshold. Default threshold 5 marks "actually trusts them";
// callers can pass a higher threshold (e.g. 7) for "ride-or-die only".
function getInnerCircle(state, contestantId, threshold = 5) {
  const c = findContestant(state, contestantId);
  if (!c) return [];
  const pool = state.merged
    ? (state.tribes?.merged || [])
    : (state.tribes?.[c.tribe] || []);
  const out = [];
  for (const other of pool) {
    if (other.id === contestantId) continue;
    const bond = getInnerCircleBond(state, contestantId, other.id);
    if (bond >= threshold) out.push({ id: other.id, name: other.name, bond });
  }
  out.sort((a, b) => b.bond - a.bond);
  return out;
}

// ── v5.33: Hidden idol fear / paranoia ──────────────────────────────────────
//
// "Idol fear" = how strongly an observer fears a specific holder may have an
// idol or advantage, INDEPENDENT of whether they actually do. Built on top
// of the existing idolSuspicion mechanic but additionally factors in:
//
//   • Reputation: holders read as Schemer/Strategist invite extra paranoia
//   • Stats: very high strategy (≥ 8) reads as "would absolutely play one"
//   • Rumors: any "suspicious" rumors known by the observer about the holder
//
// This is a DERIVED function — no new storage. idolSuspicion remains the
// authoritative numeric belief; idol fear is the layered read AIs use when
// deciding whether to push someone publicly. It can produce surprising
// outcomes:
//   • A Schemer with 8 strategy and an active "suspicious" rumor against
//     them can have idol fear ~5 from observers, even with idolSuspicion 0
//     (they LOOK like an idol holder even when they aren't)
//   • A workhorse-archetype with low strategy and an actual idol can have
//     idol fear ~1 (the room reads them as not the type)
//
// Used by Camp Life behavior:
//   • AI lobby weight scales DOWN against high-fear targets (don't push a
//     name that might just play an idol on you)
//   • Alliance vote-coordination response: members resist proposals against
//     high-fear targets (wasted vote risk)
//   • Read the camp surfaces a hedged "X feels like they might have
//     something" line at high fear
//
// Surface is fully indirect — no UI panel, no number anywhere.
function getIdolFear(state, observerId, holderId) {
  if (observerId === holderId) return 0;

  // Direct belief — the existing idolSuspicion scalar (0–10).
  const direct = state.idolSuspicion?.[observerId]?.[holderId] ?? 0;
  let fear = direct;

  // v5.37: reputation contribution accumulated separately and capped, so
  // a Schemer with strategy 9 + a couple of vague rumors can't reach the
  // high-impact fear threshold (≥6) on perception alone — direct evidence
  // (idolSuspicion) is still needed to push fear into the strong-effect
  // range. Caps reputation-only fear at ~3.
  let reputation = 0;

  // Reputation lift — schemers and strategists read as more likely to
  // hold/play advantages, regardless of whether they do.
  if (typeof getCampRole === "function") {
    const role = (getCampRole(state, holderId) || "").replace(/^leaning:/, "");
    if (role === "schemer")    reputation += 1.0;
    if (role === "strategist") reputation += 0.5;
  }

  // High-strategy stat: "I'd bet they have one even if I haven't seen it."
  const holder = findContestant(state, holderId);
  if (holder && (holder.strategy ?? 5) >= 8) reputation += 1.0;

  // Active "suspicious" rumors about the holder that the observer knows
  // about each contribute up to +0.5 fear scaled by confidence.
  if (state.rumors) {
    for (const r of state.rumors) {
      if (r.kind !== "suspicious") continue;
      if (r.subjectId !== holderId) continue;
      const k = r.knownBy?.[observerId];
      if (!k) continue;
      reputation += (k.confidence ?? 0) * 0.5;
    }
  }

  // Cap the reputation-only contribution at 3.0. Direct idolSuspicion can
  // still push fear above this, but pure perception alone caps mid-range.
  fear += Math.min(3.0, reputation);

  return Math.max(0, Math.min(10, fear));
}

// ── v5.35: Camp temperature / tribe mood ────────────────────────────────────
//
// A summary layer over the existing v5.x social and strategic systems. Returns
//   { tier, heat, factors }
//
//   tier   : "calm" | "steady" | "uneasy" | "tense" | "chaotic"
//   heat   : float 0–10 (continuous; tier is just a band)
//   factors: object exposing each input's normalized contribution for tuning
//
// Camp temperature is intentionally a SUMMARY, not a replacement. Every
// underlying system (suspicion, rumors, target pressure, scramble, conflicts,
// alliance instability, trust strain, idol fear) keeps its own logic and
// player-facing surface. Temperature gives the camp a single readable mood
// reading that captures the gestalt for use in summary surfaces (Read the
// camp, future mood-driven narration) without flattening the inputs.
//
// Pure-derived (no new state). Recomputed on demand from current state — so
// it always reflects whatever just happened.

function getCampTemperature(state, pool) {
  if (!Array.isArray(pool) || pool.length < 2) {
    return { tier: "steady", heat: 5, factors: {} };
  }

  // ── Suspicion: average public-suspicion across active tribe ─────────
  let suspSum = 0;
  for (const c of pool) suspSum += (c.suspicion ?? 0);
  const avgSusp = suspSum / pool.length;

  // ── Recent conflicts: pairs with a logged conflict in last 2 rounds ─
  // Each pair gets counted twice (A→B and B→A); halve to compensate.
  let recentConflicts = 0;
  const round = state.round ?? 0;
  for (const c of pool) {
    const conflicts = state.lastConflicts?.[c.id] || {};
    for (const otherId of Object.keys(conflicts)) {
      const e = conflicts[otherId];
      if (!e) continue;
      const age = round - (e.round ?? 0);
      if (age <= 2) recentConflicts += 0.5;
    }
  }

  // ── Alliance instability: ratio of weakened-or-near-dissolution pacts ─
  let weakAlliances = 0, totalAlliances = 0;
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    totalAlliances++;
    if ((a.strength ?? 0) < 4) weakAlliances++;
  }
  const allianceInstability = totalAlliances > 0 ? weakAlliances / totalAlliances : 0;

  // ── Rumor load: total active-rumor confidence per capita ─────────────
  let rumorSignal = 0;
  for (const r of state.rumors ?? []) {
    if (r.dissolved) continue;
    const knowers = Object.values(r.knownBy || {});
    if (knowers.length === 0) continue;
    const avgConf = knowers.reduce((s, k) => s + (k.confidence ?? 0), 0) / knowers.length;
    rumorSignal += avgConf;
  }
  rumorSignal = rumorSignal / pool.length;

  // ── Scramble count: only meaningful in phase 2 ──────────────────────
  let scrambling = 0;
  if (state.campPhase === 2 && typeof isScrambling === "function") {
    for (const c of pool) {
      if (isScrambling(state, c.id)) scrambling++;
    }
  }

  // ── High-pressure candidates: count above the consensus threshold ────
  let highPressureCount = 0;
  if (typeof getPressureScore === "function") {
    for (const c of pool) {
      if (getPressureScore(state, c.id) >= 6.5) highPressureCount++;
    }
  }

  // ── Idol fear load: ratio of pairs with meaningful fear ─────────────
  let idolFearPairs = 0;
  if (typeof getIdolFear === "function") {
    for (const obs of pool) {
      for (const holder of pool) {
        if (obs.id === holder.id) continue;
        if (getIdolFear(state, obs.id, holder.id) >= 5) idolFearPairs++;
      }
    }
  }
  const idolFearLoad = pool.length > 1
    ? idolFearPairs / (pool.length * (pool.length - 1))
    : 0;

  // ── Trust-cluster strain: ratio of formal-alliance pairs with low bond ─
  // High strain means alliances exist on paper but the trust under them has
  // hollowed out. A major mood signal — papered-over fractures feel tense.
  let strainedPairs = 0, totalFormalPairs = 0;
  if (typeof getInnerCircleBond === "function") {
    for (const a of state.alliances ?? []) {
      if (a.status === "dissolved") continue;
      for (let i = 0; i < a.memberIds.length; i++) {
        for (let j = i + 1; j < a.memberIds.length; j++) {
          totalFormalPairs++;
          const avgBond = (
            getInnerCircleBond(state, a.memberIds[i], a.memberIds[j]) +
            getInnerCircleBond(state, a.memberIds[j], a.memberIds[i])
          ) / 2;
          if (avgBond < 4) strainedPairs++;
        }
      }
    }
  }
  const trustStrain = totalFormalPairs > 0 ? strainedPairs / totalFormalPairs : 0;

  // ── Compose heat ─────────────────────────────────────────────────────
  // Baseline 2.0 → most quiet camps land near steady. Each factor adds its
  // typical contribution; aggregate clamps to [0, 10].
  let heat = 2.0;
  heat += avgSusp           * 0.40;     // ~0–4 typical
  heat += recentConflicts   * 0.30;     // ~0–2 typical
  heat += allianceInstability * 1.50;   // 0–1.5
  heat += rumorSignal       * 1.50;     // ~0–1.5 typical
  heat += scrambling        * 0.50;     // ~0–2 typical
  heat += highPressureCount * 0.50;     // ~0–2 typical
  heat += idolFearLoad      * 2.00;     // 0–2
  heat += trustStrain       * 1.00;     // 0–1
  heat = Math.max(0, Math.min(10, heat));

  // ── Map to tier band ─────────────────────────────────────────────────
  let tier;
  if      (heat <= 2.5) tier = "calm";
  else if (heat <= 4.5) tier = "steady";
  else if (heat <= 6.0) tier = "uneasy";
  else if (heat <= 7.5) tier = "tense";
  else                  tier = "chaotic";

  return {
    tier,
    heat,
    factors: {
      avgSusp,
      recentConflicts,
      allianceInstability,
      rumorSignal,
      scrambling,
      highPressureCount,
      idolFearLoad,
      trustStrain,
    },
  };
}

// ── v5.40: Social positioning / tribe hierarchy ─────────────────────────────
//
// Composite read of where a contestant sits in the tribe's social structure.
// Distinct from any single-axis metric — synthesizes how connected they are
// (embeddedness) AGAINST how exposed they are (vulnerability) into one of
// six positions:
//
//   "influential" — high embeddedness, low vulnerability, top of the room
//   "central"     — well-connected, comfortably safe
//   "protected"   — embedded enough that the room shields them mid-heat
//   "connected"   — average integration, neither central nor at risk
//   "peripheral"  — under-integrated; on the outside of the social fabric
//   "expendable"  — vulnerable AND under-integrated; the easy vote
//
// Pure-derived (no new state). Builds on social capital, inner circles,
// alliance loyalty, network rel, suspicion, target pressure, conflicts,
// and scramble status — all existing v5.x systems. Acts as a SUMMARY layer
// the same way camp temperature does for the tribe-wide mood.
//
// Returns { position, embeddedness, vulnerability, score, factors } so
// any consumer can either read the categorical label or work with the
// continuous embeddedness/vulnerability scores directly.
function getSocialPosition(state, contestantId) {
  const c = findContestant(state, contestantId);
  if (!c) {
    return { position: "peripheral", embeddedness: 0, vulnerability: 5, score: -5 };
  }
  const pool = state.merged
    ? (state.tribes?.merged || [])
    : (state.tribes?.[c.tribe] || []);
  const others = pool.filter(p => p.id !== contestantId);
  if (others.length === 0) {
    return { position: "central", embeddedness: 7, vulnerability: 2, score: 5 };
  }

  // ── Embeddedness components ─────────────────────────────────────────
  // Social capital — already aggregates broad standing, role, conflicts.
  const capital = (typeof getSocialCapital === "function")
    ? getSocialCapital(state, contestantId) : 5;

  // Mutual inner-circle ties — pairs where bond is strong both directions.
  let mutualCount = 0;
  if (typeof getInnerCircleBond === "function") {
    for (const other of others) {
      const myBondToThem = getInnerCircleBond(state, contestantId, other.id);
      const theirBondToMe = getInnerCircleBond(state, other.id, contestantId);
      if (myBondToThem >= 5 && theirBondToMe >= 5) mutualCount++;
    }
  }

  // Alliance integration: alliances they're in × tier × avg loyalty FROM
  // others toward them (how committed the room is to their inclusion).
  let allianceWeight = 0;
  for (const a of state.alliances ?? []) {
    if (a.status === "dissolved") continue;
    if (!a.memberIds.includes(contestantId)) continue;
    const tier = a.tier ?? (a.strength >= 7 ? "core" : a.strength >= 4 ? "loose" : "weakened");
    const tierMult = tier === "core" ? 1.5 : tier === "loose" ? 1.0 : 0.5;
    let otherLoyaltySum = 0, otherCount = 0;
    if (typeof getAllianceLoyalty === "function") {
      for (const mid of a.memberIds) {
        if (mid === contestantId) continue;
        otherLoyaltySum += getAllianceLoyalty(state, a.id, mid);
        otherCount++;
      }
    }
    const avgOtherLoyalty = otherCount > 0 ? otherLoyaltySum / otherCount : 5;
    allianceWeight += tierMult * (avgOtherLoyalty / 10);
  }

  // Network rel: avg rel from OTHERS toward this contestant — captures how
  // the room reads them, not just how they read the room.
  let relSum = 0;
  for (const other of others) relSum += getRelationship(state, other.id, contestantId);
  const avgRelToMe = relSum / others.length;

  let embeddedness = 4;                                  // baseline mid
  embeddedness += (capital - 5) * 0.5;                   // ±2.5
  embeddedness += mutualCount * 0.8;                     // 0..~5
  embeddedness += allianceWeight * 1.0;                  // 0..~3
  embeddedness += Math.max(0, avgRelToMe) * 0.10;        // 0..~2
  embeddedness = Math.max(0, Math.min(10, embeddedness));

  // ── Vulnerability components ─────────────────────────────────────────
  let vulnerability = 0;
  vulnerability += (c.suspicion ?? 0) * 0.5;             // 0..5

  if (typeof getPressureScore === "function") {
    const pressure = getPressureScore(state, contestantId);
    vulnerability += Math.max(0, pressure - 5) * 0.6;    // 0..3
  }

  let recentConflicts = 0;
  const conflicts = state.lastConflicts?.[contestantId] || {};
  for (const otherId of Object.keys(conflicts)) {
    const e = conflicts[otherId];
    if (!e) continue;
    const age = (state.round ?? 0) - (e.round ?? 0);
    if (age <= 2) recentConflicts++;
  }
  vulnerability += recentConflicts * 0.3;

  // Note: scramble status is intentionally NOT a vulnerability input to
  // avoid a circular dependency with isScrambling (which now consults
  // social position to lower its own threshold for peripheral players).
  // Pressure already covers the same signal — a scrambling contestant's
  // pressure score will be elevated, contributing through the pressure
  // factor above.
  vulnerability = Math.max(0, Math.min(10, vulnerability));

  // ── Map to position ─────────────────────────────────────────────────
  const score = embeddedness - vulnerability;
  let position;
  if      (embeddedness >= 7 && vulnerability <= 4) position = "influential";
  else if (embeddedness >= 6 && vulnerability <= 3) position = "central";
  else if (embeddedness >= 5 && vulnerability <= 5) position = "protected";
  else if (embeddedness >= 4)                       position = "connected";
  else if (vulnerability >= 6)                      position = "expendable";
  else                                              position = "peripheral";

  return {
    position,
    embeddedness,
    vulnerability,
    score,
    factors: {
      capital, mutualCount, allianceWeight, avgRelToMe,
      suspicion: c.suspicion ?? 0, recentConflicts,
    },
  };
}

// ── v5.17: Rumors / information spread ───────────────────────────────────────
//
// Camp life is socially loud. People talk about each other when no one is in
// the room. This system models that — imperfect information moving through
// the tribe via close ties, picking up distortion as it goes, occasionally
// being slanted on purpose.
//
// ── Rumor kinds ───────────────────────────────────────────────────────────
//   targeting   — subject is gunning for object
//   suspicious  — subject is acting shady (idol search, scrambling)
//   alliance    — subject and object may have a pact
//   closeness   — subject and object seem close
//
// ── Lifecycle ─────────────────────────────────────────────────────────────
// 1. Origin events (lobby, idol search, alliance formation, strong bond)
//    seed rumors via seedRumor(). The seeder is added to knownBy with high
//    confidence and zero distortion.
// 2. Each round, spreadRumors() walks every rumor and every knower; close
//    contacts of the knower may pick it up at degraded confidence and
//    increased distortion.
// 3. A holder's knowledge can be slanted at spread-time if they're sneaky
//    or schemer-leaning — the rumor's object gets swapped to a different
//    tribemate so the listener walks away with a strategically warped read.
// 4. applyRumorRoundEffects() applies small per-round behavioral consequences
//    based on what each contestant currently believes (extra suspicion
//    memory, light rel drift toward a perceived antagonist, etc.).
//
// Doesn't replace any existing system — relationships, alliances, suspicion
// memory, idol suspicion all keep their own logic. Rumors layer on top as
// the social conversation that flows between everything else.

let _rumorIdCounter = 1;

function _nextRumorId() {
  return "rmr-" + (_rumorIdCounter++);
}

// Find or create a rumor matching kind+subject+object so origin events
// don't pile duplicate rumors when an action repeats.
function _findRumor(state, kind, subjectId, objectId) {
  for (const r of state.rumors ?? []) {
    if (r.kind === kind && r.subjectId === subjectId && (r.objectId ?? null) === (objectId ?? null)) {
      return r;
    }
  }
  return null;
}

function seedRumor(state, kind, subjectId, objectId, originatorId, accuracy = 1.0) {
  if (!state.rumors) state.rumors = [];
  let rumor = _findRumor(state, kind, subjectId, objectId);
  if (!rumor) {
    rumor = {
      id:            _nextRumorId(),
      kind,
      subjectId,
      objectId:      objectId ?? null,
      createdRound:  state.round ?? 0,
      originatorId,
      accuracy,
      knownBy:       {},
    };
    state.rumors.push(rumor);
  }
  // Add originator to knownBy at full confidence, no distortion.
  if (!rumor.knownBy[originatorId]) {
    rumor.knownBy[originatorId] = {
      confidence:      1.0,
      distortion:      0,
      fromId:          null,
      learnedRound:    state.round ?? 0,
      slantedObjectId: null,
    };
  }
  return rumor;
}

// Returns all rumors known by a contestant, with their per-knower entry.
function getRumorsKnownBy(state, contestantId) {
  const out = [];
  for (const r of state.rumors ?? []) {
    const k = r.knownBy?.[contestantId];
    if (k) out.push({ rumor: r, knowledge: k });
  }
  return out;
}

// Walks every rumor, every knower, and may transmit to close contacts.
// Called once per camp phase from main.js (post-AI, pre-tribal) so the
// social conversation has time to move overnight.
//
// Spread chance per (knower → listener) pair:
//   base    : 0.18
//   social  : +0.02 × knower.social
//   alliance: +0.10 × tier weight (core 1.0, loose 0.6, weakened 0.3)
//   archetype: +0.06 if knower is socialButterfly; -0.04 if paranoid
//   close-rel/trust gate: rel ≥ 5 AND trust ≥ 4 OR shared alliance
function spreadRumors(state, pool) {
  if (!state.rumors || state.rumors.length === 0) return;
  if (!Array.isArray(pool) || pool.length < 2) return;

  // Snapshot — we mutate knownBy during iteration but only with NEW entries.
  // Iterate the list of rumors as captured at the start of the pass.
  const rumors = [...state.rumors];

  for (const rumor of rumors) {
    if (rumor.dissolved) continue;
    // Snapshot current knowers to avoid chain-spreading within one pass.
    const knowerEntries = Object.entries(rumor.knownBy);
    for (const [knowerId, knowerKnowledge] of knowerEntries) {
      const knower = pool.find(c => c.id === knowerId);
      if (!knower) continue;

      for (const listener of pool) {
        if (listener.id === knower.id) continue;
        if (rumor.knownBy[listener.id]) continue;   // already knows
        // Don't spread the rumor TO its subject (they wouldn't be told
        // their own scheme is being whispered about) unless they're the
        // object — see below.
        if (rumor.kind === "suspicious" && listener.id === rumor.subjectId) continue;

        const rel   = getRelationship(state, knower.id, listener.id);
        const trust = getTrust(state, knower.id, listener.id);
        const allyTier = (typeof getSharedAllianceTier === "function")
          ? getSharedAllianceTier(state, knower.id, listener.id)
          : null;
        const closeFriend = rel >= 5 && trust >= 4;
        // v5.32: high inner-circle bond is also a valid spread channel —
        // information naturally flows along trust lines, not just along
        // formal alliance / close-friend gates. Captures the realistic
        // pattern of "I told them because I trust them" outside paperwork.
        const bondGate = typeof getInnerCircleBond === "function"
          && getInnerCircleBond(state, knower.id, listener.id) >= 6;
        if (!allyTier && !closeFriend && !bondGate) continue;

        // Compose spread chance.
        let chance = 0.18 + (knower.social ?? 5) * 0.02;
        const allyBonus = allyTier === "core" ? 0.10 : allyTier === "loose" ? 0.06 : allyTier === "weakened" ? 0.03 : 0;
        chance += allyBonus;
        if (knower.archetype === "socialButterfly") chance += 0.06;
        if (knower.archetype === "paranoid")        chance -= 0.04;
        chance = Math.max(0.05, Math.min(0.55, chance));

        if (Math.random() >= chance) continue;

        // Compute the listener's version of the rumor.
        // Confidence degrades on each hop: knower's confidence × (0.7 to 1.0)
        // depending on trust. Trusted source = less degradation.
        const trustQ      = Math.max(0, Math.min(1, trust / 10));
        const confDecay   = 0.7 + 0.25 * trustQ;
        let newConfidence = knowerKnowledge.confidence * confDecay;
        // Distortion grows; sneaky knowers add extra warp.
        let newDistortion = Math.min(1, knowerKnowledge.distortion + 0.05 + (1 - trustQ) * 0.06);
        if (knower.archetype === "sneaky")   newDistortion = Math.min(1, newDistortion + 0.10);
        if (knower.archetype === "paranoid") newDistortion = Math.min(1, newDistortion + 0.05);
        if (knower.archetype === "loyal")    newDistortion = Math.max(0, newDistortion - 0.04);

        // Slant chance: knower with high distortion + sneaky/schemer-ish
        // tendency may swap the object to a third party. Only applies to
        // rumors that have a meaningful object (targeting / alliance /
        // closeness — not solo "suspicious").
        let slantedObjectId = knowerKnowledge.slantedObjectId ?? null;
        const role = (typeof getCampRole === "function") ? getCampRole(state, knower.id) : "undefined";
        const slantInclined =
            knower.archetype === "sneaky"
         || role === "schemer" || role === "leaning:schemer";
        if (rumor.kind !== "suspicious" && slantInclined && newDistortion >= 0.40 && Math.random() < 0.30) {
          // Pick a random other tribemate as the slanted object.
          const candidates = pool.filter(c =>
            c.id !== rumor.subjectId
            && c.id !== rumor.objectId
            && c.id !== knower.id
            && c.id !== listener.id
          );
          if (candidates.length > 0) {
            slantedObjectId = candidates[Math.floor(Math.random() * candidates.length)].id;
            // Slanted versions are believed but more confidently wrong.
            newConfidence = Math.min(1, newConfidence + 0.10);
            newDistortion = Math.min(1, newDistortion + 0.15);
          }
        }

        // Floor: don't spread genuinely useless versions (confidence < 0.15).
        if (newConfidence < 0.15) continue;

        rumor.knownBy[listener.id] = {
          confidence:      newConfidence,
          distortion:      newDistortion,
          fromId:          knower.id,
          learnedRound:    state.round ?? 0,
          slantedObjectId,
        };
      }
    }
  }
}

// Per-round behavioral consequences of belief. Walks each rumor each holder,
// applies small effects ONCE per learned-round (so a stale rumor doesn't
// keep biting). Tunable; tries to stay under the threshold of "noticeable
// flavor" per round.
function applyRumorRoundEffects(state) {
  if (!state.rumors) return;
  const round = state.round ?? 0;
  for (const rumor of state.rumors) {
    if (rumor.dissolved) continue;
    for (const holderId of Object.keys(rumor.knownBy)) {
      const k = rumor.knownBy[holderId];
      // Only apply on the round it's learned — avoids stacking each round.
      if (k.learnedRound !== round) continue;
      if (k.confidence < 0.25) continue;

      const effectiveObjectId = k.slantedObjectId ?? rumor.objectId;
      const weight = k.confidence;

      switch (rumor.kind) {
        case "targeting": {
          // Holder learns subject is targeting (probably) effectiveObjectId.
          // If the holder IS the (perceived) target → small rel drop toward subject,
          // small idol/suspicion memory bump.
          if (holderId === effectiveObjectId) {
            adjustRelationship(state, holderId, rumor.subjectId, -Math.round(weight));
            if (typeof recordSuspiciousAct === "function") {
              recordSuspiciousAct(state, holderId, rumor.subjectId, "rumored-targeting", weight * 0.6);
            }
          } else {
            // Bystander: small bump in suspicion memory of the subject.
            if (typeof adjustSuspicionMemory === "function") {
              adjustSuspicionMemory(state, holderId, rumor.subjectId, weight * 0.3);
            }
          }
          break;
        }
        case "suspicious": {
          // Holder hears subject is acting shady → suspicion memory bump.
          if (typeof adjustSuspicionMemory === "function") {
            adjustSuspicionMemory(state, holderId, rumor.subjectId, weight * 0.4);
          }
          break;
        }
        case "alliance": {
          // Holder hears subject + object are pacting up → idol/suspicion
          // of both rises slightly (they look like a coordinated threat).
          if (holderId !== rumor.subjectId && holderId !== effectiveObjectId) {
            if (typeof adjustSuspicionMemory === "function") {
              adjustSuspicionMemory(state, holderId, rumor.subjectId,        weight * 0.2);
              adjustSuspicionMemory(state, holderId, effectiveObjectId,      weight * 0.2);
            }
          }
          break;
        }
        case "closeness": {
          // Mild — just increases the holder's idol suspicion of the pair.
          if (holderId !== rumor.subjectId && holderId !== effectiveObjectId) {
            if (typeof adjustIdolSuspicion === "function") {
              adjustIdolSuspicion(state, holderId, rumor.subjectId,    1);
              adjustIdolSuspicion(state, holderId, effectiveObjectId,  1);
            }
          }
          break;
        }
      }
    }
  }
}

// ── v5.12: Conflict / repair accessors ──────────────────────────────────────
//
// "Has there been recent friction with this person?" — used by Check In
// After Conflict to gate its eligibility detection and shape its tone.
// A conflict counts as "recent" if logged within the last 2 rounds.
function getRecentConflict(state, idA, idB) {
  const entry = state.lastConflicts?.[idA]?.[idB];
  if (!entry) return null;
  const age = (state.round ?? 0) - (entry.round ?? 0);
  if (age > 2) return null;
  return { ...entry, age };
}

function clearConflict(state, idA, idB) {
  if (state.lastConflicts?.[idA]) delete state.lastConflicts[idA][idB];
  if (state.lastConflicts?.[idB]) delete state.lastConflicts[idB][idA];
}

function spreadIdolSuspicion(state, pool) {
  if (!pool || pool.length < 2) return;

  for (const gossiper of pool) {
    const beliefs = state.idolSuspicion?.[gossiper.id];
    if (!beliefs) continue;

    for (const [holderId, score] of Object.entries(beliefs)) {
      if (score < 5) continue;   // only meaningful suspicion is worth sharing

      for (const listener of pool) {
        if (listener.id === gossiper.id || listener.id === holderId) continue;

        const rel   = getRelationship(state, gossiper.id, listener.id);
        const trust = getTrust(state, gossiper.id, listener.id);
        if (rel < 5 || trust < 4) continue;   // only close allies trade reads

        // v5.13: idol gossip travels through CORE alliance ties most freely
        // and through loose ties at half rate. Pairs with no shared alliance
        // can still trade if they meet the rel/trust floor (informal close
        // friends), but at base rate.
        const allyTier = (typeof getSharedAllianceTier === "function")
          ? getSharedAllianceTier(state, gossiper.id, listener.id)
          : null;
        const tierMult = allyTier === "core"  ? 1.5 :
                         allyTier === "loose" ? 0.7 :
                         allyTier === "weakened" ? 0.4 : 1.0;

        // Base 20%, +2% per gossiper social point, scaled by alliance tier.
        const chance = Math.min(0.50, (0.20 + gossiper.social * 0.02) * tierMult);
        if (Math.random() < chance) {
          adjustIdolSuspicion(state, listener.id, holderId, 1);
        }
      }
    }
  }
}
