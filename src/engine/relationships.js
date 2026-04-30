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
