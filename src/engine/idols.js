// idols.js — Hidden Immunity Idol data model and lifecycle management
//
// This module defines the idol system foundation: data structures, validity
// rules, and lifecycle hooks. Search and play mechanics are intentionally
// absent — see the extension-point stubs at the bottom of this file.
//
// ── Idol lifecycle ────────────────────────────────────────────────────────────
//
//   "hidden"  → idol is in the game but no contestant holds it  (initial state)
//   "held"    → a contestant found the idol and is carrying it
//   "played"  → the idol was used at a Tribal Council
//   "expired" → the idol is permanently removed from play:
//                 • an unfound pre-merge tribal idol expires when merge fires
//                   (the tribal camp is abandoned; the idol is lost)
//                 • any held idol expires when Final Tribal Council begins
//                   (idols cannot be used at FTC)
//
// ── Three idols per season (Phase 1 defaults) ─────────────────────────────────
//
//   tribeA  — hidden at Tribe A's camp pre-merge
//   tribeB  — hidden at Tribe B's camp pre-merge
//   merged  — hidden at the merged camp; only becomes searchable after merge
//
// To add more idols (e.g., a second merge idol, a re-hidden idol), add a new
// entry to IDOL_SLOTS below — no other code needs to change.
//
// ── Architecture rules ────────────────────────────────────────────────────────
//
//   Engine functions mutate state.idols.
//   UI functions must only read state.idols — never mutate directly.
//   Lifecycle hooks (expirePreMergeIdols, expireHeldIdols) are called by main.js.

// ── Idol slot definitions ─────────────────────────────────────────────────────
//
// One entry per idol in the game. Each entry defines the idol's id (used as a
// unique key) and its scope (where it is hidden and who can search for it).
//
// scope — "A" | "B" | "merged"
//   Pre-merge tribal idols: scope "A" or "B" matches their tribe label.
//   Merge idol: scope "merged" means it only appears after the merge fires.
//
// To add a new idol, add one entry here. createIdol() will do the rest.
const IDOL_SLOTS = {
  tribeA: { scope: "A"      },
  tribeB: { scope: "B"      },
  merged: { scope: "merged" },
};

// ── Factory ───────────────────────────────────────────────────────────────────

// Creates a fresh idol object with its initial "hidden" state.
//
// id    — unique string key (from IDOL_SLOTS)
// scope — "A" | "B" | "merged"
function createIdol(id, scope) {
  return {
    id,
    scope,

    // Current lifecycle state.
    status: "hidden",  // "hidden" | "held" | "played" | "expired"

    // Who holds this idol. null unless status === "held".
    // Stores the contestant's id string, not the contestant object itself —
    // so the idol stays valid even if the contestant object is later mutated.
    holder: null,

    // Round tracking — useful for history display and future rule variants
    // (e.g., an idol found before merge that expires N rounds after it is found).
    foundRound:  null,   // round when a contestant picked up this idol
    playedRound: null,   // round when this idol was played at Tribal Council
  };
}

// ── Initialization ────────────────────────────────────────────────────────────

// Populates state.idols with one idol object per IDOL_SLOTS entry.
// Called once at game start (after assignTribes), before the first screen.
// state.idols is initialized as [] in createSeasonState(); this fills it.
function initIdols(state) {
  state.idols = Object.entries(IDOL_SLOTS).map(([id, def]) =>
    createIdol(id, def.scope)
  );
}

// ── Lookups ───────────────────────────────────────────────────────────────────

// Returns the idol object with the given id, or undefined if not found.
function getIdol(state, id) {
  return state.idols.find(idol => idol.id === id);
}

// Returns all idols still "in play" — not expired and not yet played.
// An idol is in play if it is either hidden (searchable) or held (playable).
function getActiveIdols(state) {
  return state.idols.filter(idol =>
    idol.status !== "expired" && idol.status !== "played"
  );
}

// Returns all idols currently held by a specific contestant.
// A contestant can hold more than one idol in theory (e.g., traded or given one).
// contestantId — the contestant's id string
function getHeldIdols(state, contestantId) {
  return state.idols.filter(idol =>
    idol.status === "held" && idol.holder === contestantId
  );
}

// Returns true if at least one idol is hidden (not yet found) in the given scope.
// Use this to decide whether a search attempt has anything to find.
// scope — "A" | "B" | "merged"
function hasHiddenIdolInScope(state, scope) {
  return state.idols.some(idol =>
    idol.status === "hidden" && idol.scope === scope
  );
}

// ── Availability ──────────────────────────────────────────────────────────────

// Returns true if the idol is currently searchable — hidden in the game AND
// accessible given the current game phase.
//
// Rules:
//   • Pre-merge tribal idols (scope "A" or "B") are available before merge.
//     Once merge fires, any unfound tribal idol is expired by expirePreMergeIdols().
//   • The merge idol (scope "merged") is only available after merge fires.
//     There is nothing to find at the merge camp until the tribes consolidate.
//
// This is the gate for future search logic: idolSearch() should call
// isIdolAvailable() before attempting to award an idol.
function isIdolAvailable(idol, state) {
  if (idol.status !== "hidden") return false;
  if (idol.scope === "merged") return state.merged;   // only after merge
  return !state.merged;                               // tribal idols only pre-merge
}

// ── Validity (playability) ────────────────────────────────────────────────────

// Returns true if this idol can be played at a Tribal Council right now.
//
// An idol is playable when all of the following hold:
//   1. Its status is "held" — someone has the idol in hand.
//   2. The game is not yet in the Final Tribal Council phase.
//      state.finalists being non-null means FTC has started; idols expire then.
//   3. (Optional) The specific holder matches. Pass contestantId to confirm that
//      the contestant trying to play the idol is actually its holder —
//      prevents one player from claiming another's idol.
//
// contestantId is optional. Omit it for a general "is this idol playable at all"
// check; pass it for a "can THIS person play this idol" check.
function isIdolPlayable(idol, state, contestantId) {
  if (idol.status !== "held") return false;
  if (state.finalists !== null) return false;   // FTC has started — too late

  // If a specific contestant is being checked, confirm they hold it.
  if (contestantId !== undefined && idol.holder !== contestantId) return false;

  return true;
}

// ── Expiry ────────────────────────────────────────────────────────────────────

// Expires all unfound pre-merge tribal idols when merge fires.
// Called inside doMerge() in main.js, after state.merged is set to true.
//
// Any tribal idol that was found before the merge (status "held") is NOT expired —
// the holder carries it into the merged game and can still play it at tribal.
// Only idols still sitting hidden at abandoned tribal camps are lost.
function expirePreMergeIdols(state) {
  for (const idol of state.idols) {
    if ((idol.scope === "A" || idol.scope === "B") && idol.status === "hidden") {
      idol.status = "expired";
    }
  }
}

// Expires any idol still held when Final Tribal Council begins.
// Called inside startFinalTribal() in main.js.
//
// In practice, players should have used or lost their idols before this point.
// This is a safety net that cleanly ends all idol business before FTC votes.
function expireHeldIdols(state) {
  for (const idol of state.idols) {
    if (idol.status === "held") {
      idol.status = "expired";
    }
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

// Attempts idol discovery for a contestant at their current camp.
// Called by actionSearchIdol() in campLife.js on each search action.
//
// Handles only idol state changes (status, holder, foundRound, search count).
// Suspicion and relationship penalties stay in campLife.js, which owns all
// social-cost logic for camp actions.
//
// Returns:
//   { found: true,  idol }       — player found it; idol object is now "held"
//   { found: false, idol: null } — nothing found this time
//
// ── Success formula ───────────────────────────────────────────────────────────
//
//   scope   : "A" | "B" (pre-merge, from player.tribe) or "merged" (post-merge)
//   base    : 20% — there is always meaningful uncertainty
//   strategy: +2.5% per point — methodical, pattern-aware searching
//   persist : +8% per prior search in this scope — each attempt narrows the area
//   cap     : 65% — finding an idol can never be a sure thing
//
// Strategy is the right driver here: it represents game awareness and the
// ability to read the environment methodically. Social skill is instead used
// by campLife.js to modulate how much suspicion the search generates.
function idolSearch(player, state) {
  // Determine which scope the player can search — their current camp.
  const scope = state.merged ? "merged" : player.tribe;

  // Find the idol for this scope. Undefined if the scope has no idol defined.
  const idol = state.idols.find(i => i.scope === scope);

  // Nothing available: idol was never placed here, is already held/played,
  // or expired when the tribe camp was abandoned at merge.
  if (!idol || !isIdolAvailable(idol, state)) {
    return { found: false, idol: null };
  }

  // How many times has the player searched here before this attempt?
  // Capture BEFORE incrementing so campLife.js can use it for feedback tiers.
  const prevSearches = state.idolSearches[scope] ?? 0;
  state.idolSearches[scope] = prevSearches + 1;

  // ── Roll ──────────────────────────────────────────────────────────────────
  const baseChance   = 0.20;
  const stratBonus   = player.strategy * 0.025;   // strategy 10 → +25%
  const persistBonus = prevSearches    * 0.08;    // 3rd search    → +16%
  const findChance   = Math.min(baseChance + stratBonus + persistBonus, 0.65);

  if (Math.random() >= findChance) {
    return { found: false, idol: null };
  }

  // ── Found ─────────────────────────────────────────────────────────────────
  idol.status     = "held";
  idol.holder     = player.id;
  idol.foundRound = state.round;

  return { found: true, idol };
}

// ── Play ──────────────────────────────────────────────────────────────────────
//
// Idol play happens once per Tribal Council, before the votes are revealed.
// In v3.3 idols can only be played on the holder themselves (self-play).
// Transferring idols to other players is intentionally deferred to v3.4+.
//
// On success the idol is consumed (status → "played") and the protected
// contestant id is returned. The caller (screenTribal.js) collects all
// protected ids from this round's plays and passes them to tallyVotes(),
// which discards votes against any protected contestant.

// Marks the idol as played and returns the protected contestant id.
// Returns null if the idol is not currently valid to play — silently ignore
// the call rather than throw, so UI race-conditions can't corrupt state.
function idolPlay(idol, state) {
  if (!idol)                  return null;
  if (!isIdolPlayable(idol, state)) return null;

  idol.status      = "played";
  idol.playedRound = state.round;

  // v3.3 simplification: always self-play. The holder is the protected target.
  return idol.holder;
}

// Returns the first playable idol held by a given contestant, or null.
// Multi-idol holders are supported by the data model but only one idol can
// be played per Tribal Council per holder in v3.3. The "first" idol is
// arbitrary but stable (matches state.idols ordering — tribeA, tribeB, merged).
function getPlayableIdolForHolder(state, contestantId) {
  return state.idols.find(i =>
    isIdolPlayable(i, state, contestantId)
  ) ?? null;
}

// Returns all (contestant, idol) pairs eligible to play tonight, restricted to
// the contestants who are actually attending tribal (the attendees pool).
// This is what screenTribal.js iterates over when running the idol-play phase.
function getIdolPlayCandidates(state, attendees) {
  const candidates = [];
  for (const c of attendees) {
    const idol = getPlayableIdolForHolder(state, c.id);
    if (idol) candidates.push({ contestant: c, idol });
  }
  return candidates;
}

// ── AI idol-play decision ─────────────────────────────────────────────────────
//
// AI holders decide whether to play their idol from a heuristic read of the
// social state — they CANNOT see the actual votes. Three signals shape the
// estimate, mimicking what a contestant would feel "in the moment":
//
//   • Negative relationships and low trust toward strategic voters
//     suggest someone is hunting for them tonight.
//   • Other players' idol suspicion of the holder, combined with strategic
//     voters who tend to flush, raises the perceived flush threat.
//   • The holder's own general suspicion stat is a public-facing target marker.
//
// Strong allies (relationship ≥ 10) reduce the danger estimate — you have
// people who'll vote with you, so you probably aren't tonight's target.

// Returns 0–10. Higher = the holder reads more danger from this Tribal.
// "attendees" is everyone in the room (including the holder themselves);
// the holder is filtered out internally.
function estimateDangerToSelf(state, holder, attendees) {
  const others = attendees.filter(a => a.id !== holder.id);
  if (others.length === 0) return 0;

  let enemyCount      = 0;   // people likely to vote me on basic social grounds
  let flushThreatCount = 0;  // strategic voters who suspect my idol → flush risk
  let strongAllyCount = 0;   // people very unlikely to vote me

  for (const voter of others) {
    const rel      = getRelationship(state, voter.id, holder.id);
    const trust    = getTrust(state, voter.id, holder.id);
    const idolSusp = getIdolSuspicion(state, voter.id, holder.id);

    if (rel < -3) enemyCount++;
    else if (trust < 2 && voter.strategy >= 5) enemyCount++;

    if (idolSusp >= 7 && voter.strategy >= 6) flushThreatCount++;

    if (rel >= 10) strongAllyCount++;
  }

  const ownSuspicion = holder.suspicion ?? 0;

  // Weighted aggregate. Flush-threat voters carry slightly more weight than
  // generic enemies because they specifically WANT to make you play tonight.
  const danger =
      enemyCount       * 1.4
    + flushThreatCount * 1.6
    + ownSuspicion     * 0.4
    - strongAllyCount  * 0.8;

  return Math.max(0, Math.min(10, danger));
}

// Returns true if the AI holder decides to play their idol tonight.
//
// Thresholds:
//   strategy 10 → ~3 (sensitive — plays on subtle threats)
//   strategy  5 → ~5
//   strategy  1 → ~6.6 (only plays on blatant evidence — or panics)
//
// A small noise term (±1) keeps even high-strategy AI from being clinically
// optimal. Low-strategy holders can panic-play when their general suspicion
// is high — they over-read the temperature of the tribe and burn an idol.
function shouldAIPlayIdol(state, holder, attendees) {
  // Wearing the immunity necklace? Idol play is strictly wasteful.
  if (state.immunityHolder === holder.id) return false;

  const danger        = estimateDangerToSelf(state, holder, attendees);
  const baseThreshold = 7 - holder.strategy * 0.4;
  const noise         = (Math.random() - 0.5) * 2;

  // Panic play: low-strategy + high own suspicion can produce a wasted idol.
  // 35% chance per qualifying tribal — they feel the heat and crack.
  if (holder.strategy <= 3
      && (holder.suspicion ?? 0) >= 5
      && Math.random() < 0.35) {
    return true;
  }

  return danger > (baseThreshold + noise);
}
