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

// ── Relationship API ──────────────────────────────────────────────────────────

function getRelationship(state, idA, idB) {
  return state.relationships[idA]?.[idB] ?? 0;
}

// Applies delta to both directions. No clamp — relationships can go very
// negative (enemies) or positive (close allies) over many rounds.
function adjustRelationship(state, idA, idB, delta) {
  if (!state.relationships[idA] || !state.relationships[idB]) return;
  state.relationships[idA][idB] = (state.relationships[idA][idB] ?? 0) + delta;
  state.relationships[idB][idA] = (state.relationships[idB][idA] ?? 0) + delta;
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

        // Base 20%, +2% per gossiper social point — capped at 40%.
        const chance = Math.min(0.40, 0.20 + gossiper.social * 0.02);
        if (Math.random() < chance) {
          adjustIdolSuspicion(state, listener.id, holderId, 1);
        }
      }
    }
  }
}
