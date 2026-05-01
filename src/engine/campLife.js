// campLife.js — camp action definitions and execution logic
//
// Each action the player can take is defined in CAMP_ACTIONS.
// executeAction() is the single entry point: it mutates state.relationships,
// state.trust, and/or contestant.suspicion, then returns { feedback, hint }.
// No DOM access happens here.
//
// ── How the social stats shape outcomes ───────────────────────────────────────
//
//   social    : determines how well relationship-building actions land;
//               reduces backfire chance; affects how readable the player is
//               when doing risky things like lobbying or idol searching.
//
//   strategy  : determines how well strategic conversations go; scales the
//               effectiveness of lobbying; improves trust alignment in debates.
//
//   challenge : not used in camp actions (it is a physical/mental stat for
//               immunity challenges only).
//
// ── Trust tiers (for actions that read trust) ────────────────────────────────
//
//   0–2  distrustful — will mislead or give useless intel
//   3–5  guarded     — vague but honest; default starting state
//   6–10 open        — candid, cooperative, easier to work with
//
// ── v5 foundation ────────────────────────────────────────────────────────────
//
// Camp Life is being expanded into a deeper menu-driven experience. v5.0 lays
// the structural groundwork without changing observable behavior:
//
//   • CAMP_ACTION_CATEGORIES groups actions by intent (social / strategy /
//     personal). The UI renders them in sections — foundation for future
//     submenu navigation, deeper action sets, and category-aware AI.
//
//   • state.campTargets (declared in season.js, helpers below) tracks
//     per-contestant vote intent during camp — foundation for the end-of-camp
//     target list and AI strategic planning.
//
//   • runAICampActions() is a stub that future versions will fill in to make
//     AI take camp-life actions, contributing to a more active camp world.
//
// All existing actions and their gameplay effects are unchanged. Each action
// just gained a `category` field for grouping.

// Categories for grouping CAMP_ACTIONS in the UI. Order here is the order
// the camp screen renders categories in. Each action's `category` field
// references one of these ids. New categories can be added safely; the UI
// just renders any category that has at least one action.
//
// v5.2: the camp screen now uses these categories as a two-step submenu —
// the player picks a category first, then an action within it. Adding a new
// action only requires adding an entry to CAMP_ACTIONS with the right
// category id; the UI auto-routes it into the correct submenu.
// v5.21: action architecture refactor — preparing for consolidation.
//
// CATEGORIES added "alliances" (separate from strategy). The Camp Life menu
// now has four top-level slots:
//
//   • Social    — relationships, trust, repair, observation
//   • Strategy  — votes, intel, influence, third-party reads
//   • Alliances — pact formation and reinforcement
//   • Island    — solo / non-social actions (camp, idols, low profile)
//
// ACTION OBJECTS now carry an optional `consolidationGroup` string. Actions
// with the same group are tagged as candidates to be merged into a single
// player-facing action in a future phase. The engine logic for each is
// preserved as-is during this phase — the tag is purely structural so we
// can build the consolidated dispatcher safely.
//
// ── Identified overlap groups ──────────────────────────────────────────────
//
//   group: "spendTime"         — talk, confide
//                                Both build pair social standing; depth
//                                varies by trust. Future merged action picks
//                                between them based on context.
//
//   group: "repairBond"        — smoothOver, checkIn
//                                Both repair social damage. checkIn handles
//                                recent specific conflict; smoothOver handles
//                                ambient strain. Future merged action auto-
//                                detects which mode to apply.
//
//   group: "readCamp"          — observeCamp, readRoom
//                                Both surface broad camp dynamics. observeCamp
//                                returns concrete pair signals; readRoom
//                                returns vibe/mood. Future merged action
//                                returns a blended read scaled by social.
//
//   group: "playerIntel"       — observePair, compareNotes
//                                Both gather intel about a non-self target.
//                                observePair watches passively; compareNotes
//                                routes through a partner. Future merged
//                                action picks the path based on whether a
//                                viable partner exists.
//
//   group: "alliancePact"      — proposeAlliance
//                                Already self-contained (form / strengthen
//                                via the same action). Tagged for the new
//                                Alliances category move; future expansions
//                                may add reinforce / dissolve here.
//
// Strategy actions (strategy / askVote / lobby) and Island actions are not
// consolidation candidates in the current design — each fills a distinct
// strategic role.
//
// ── Backward compatibility guarantee ───────────────────────────────────────
// Every legacy action id continues to work end-to-end through this phase.
// executeAction(legacyId, ...) routes to the same engine function as before.
// recordCampAction logs the legacy id; getCanonicalActionId(legacyId) maps
// it to the canonical group id for role-detection rollups.

const CAMP_ACTION_CATEGORIES = [
  {
    id:    "social",
    label: "Social",
    description: "Build relationships, repair bonds, read the room.",
  },
  {
    id:    "strategy",
    label: "Strategy",
    description: "Float votes, fish for intel, push targets, trade reads.",
  },
  {
    id:    "alliances",
    label: "Alliances",
    description: "Form pacts and reinforce existing alliances.",
  },
  {
    id:    "island",
    label: "Island",
    description: "Tend camp, search for advantages, manage your profile.",
  },
];

const CAMP_ACTIONS = [
  {
    // v5.22: consolidates legacy "talk" + "confide". The dispatcher picks
    // depth automatically — casual hangout when trust/rel are still
    // forming, deeper opening-up when the foundation is there. Same
    // engine functions (actionTalk / actionConfide) still power the
    // outcomes; only the menu and routing changed.
    id: "spendTime",
    label: "Spend time with someone",
    detail: "Hang out and build the bond. The conversation goes deep when the trust is already there.",
    needsTarget: true,
    targetPrompt: "Who do you want to spend time with?",
    category: "social",
    consolidationGroup: "spendTime",
  },
  {
    // v5.22: consolidates legacy "smoothOver" + "checkIn". The dispatcher
    // detects whether there's a recent specific conflict to address vs.
    // ambient strain to soften, and routes to the right engine path.
    id: "mendBond",
    label: "Mend things",
    detail: "Reach out across friction. Works whether the rift is fresh or quietly cooling.",
    needsTarget: true,
    targetPrompt: "Who do you want to mend things with?",
    category: "social",
    consolidationGroup: "repairBond",
  },
  {
    // v5.22: consolidates legacy "observeCamp" + "readRoom". A single
    // observation action that returns vibe + concrete dynamics together,
    // scaled by player.social — low-social players get the vibe read,
    // higher-social players also get the specific pair signals.
    id: "readCamp",
    label: "Read the camp",
    detail: "Step back and watch. You'll pick up the temperature and the dynamics that are visible.",
    needsTarget: false,
    category: "social",
    consolidationGroup: "readCamp",
  },
  {
    // v5.23: consolidates legacy "strategy" + "askVote" + "compareNotes".
    // The dispatcher picks the conversation angle (alignment talk, vote
    // ask, or third-party read trade) based on trust, alliance ties, and
    // weighted random — preserving the v5.10 truth/lie nuance, the v5.13
    // alliance-tier candor scaling, and the v5.17 rumor-transfer hooks
    // that lived in compareNotes.
    id: "talkStrategy",
    label: "Talk strategy with someone",
    detail: "Trade reads, float a vote, ask where their head is. What you get back depends on where you stand.",
    needsTarget: true,
    targetPrompt: "Who do you want to talk strategy with?",
    category: "strategy",
    consolidationGroup: "strategyTalk",
  },
  {
    id: "lobby",
    label: "Push a vote",
    // v5.4 deepened — three-tier outcome (persuaded / heard / backfired)
    // and smart listener selection. The pitch may shift the listener's
    // read on the target, or push them away from you entirely.
    detail: "Pitch a target to a tribemate. Lands hard, lands soft, or blows up — depending on who you pick and how it reads.",
    needsTarget: true,
    targetPrompt: "Who do you want to draw attention toward?",
    category: "strategy",
  },
  {
    id: "proposeAlliance",
    label: "Propose an alliance",
    // v5.4 deepened — when you're already allied with the target, this
    // action strengthens that pact instead of being a no-op. Same option,
    // smart engine.
    // v5.21: moved from "strategy" to the new "alliances" category.
    detail: "Form a new pact — or deepen one you already share. Needs trust to land.",
    needsTarget: true,
    targetPrompt: "Who do you want to bring in?",
    category: "alliances",
    consolidationGroup: "alliancePact",
  },
  {
    // v5.4: targeted observation of a single player's social position.
    id: "observePair",
    label: "Observe a player",
    detail: "Watch one tribemate closely. Pick up on who they're drawn to and who they avoid.",
    needsTarget: true,
    targetPrompt: "Who do you want to watch?",
    category: "strategy",
    consolidationGroup: "playerIntel",
  },
  {
    // v5.5: renamed from "improvecamp" / "Improve camp" (was Social).
    // Tribe-wide goodwill + suspicion drop, plus a tend-camp credit
    // that quietly boosts your next idol search.
    id: "tendCamp",
    label: "Tend camp",
    detail: "Pull your weight around camp. The tribe sees it — and being visible buys you a little cover.",
    needsTarget: false,
    category: "island",
  },
  {
    id: "searchidol",
    label: "Search for an idol",
    detail: "Slip away into the jungle. Being seen raises suspicion — but tending camp first softens the blow.",
    needsTarget: false,
    category: "island",
  },
  {
    id: "laylow",
    label: "Keep a low profile",
    detail: "Stay quiet and unthreatening. Eases suspicion when you're in the crosshairs.",
    needsTarget: false,
    category: "island",
  },
];

// v5.21: action registry — id → action def. Built once from CAMP_ACTIONS so
// dispatcher code can look up an action's metadata (category, group, target
// requirements, label) without an O(n) scan. Single source of truth.
const CAMP_ACTION_REGISTRY = Object.fromEntries(CAMP_ACTIONS.map(a => [a.id, a]));

// v5.21: returns all actions sharing a consolidation group. Used by the
// camp-role roll-up so that future merged actions can claim their group's
// share of action history without duplicate counting. Returns [] for
// actions with no group set.
function getActionsInGroup(group) {
  if (!group) return [];
  return CAMP_ACTIONS.filter(a => a.consolidationGroup === group);
}

// v5.21: canonical-id resolver. Currently identity for legacy ids; future
// merged-action phases will remap legacy ids to their canonical merged id
// (e.g. getCanonicalActionId("talk") → "spendTime") once a merged action
// exists. Used by camp-role detection and any analytics layer that needs
// to roll legacy + merged ids together.
// v5.22: legacy → canonical id remap. AI dispatch still calls actionTalk /
// actionConfide / etc. directly and recordCampAction logs the legacy id.
// This map ensures role-detection rolls those legacy entries up under the
// merged action's group bucket so cumulative behavior counts correctly.
const CAMP_ACTION_LEGACY_MAP = {
  talk:         "spendTime",
  confide:      "spendTime",
  smoothOver:   "mendBond",
  checkIn:      "mendBond",
  observeCamp:  "readCamp",
  readRoom:     "readCamp",
  // v5.23
  strategy:     "talkStrategy",
  askVote:      "talkStrategy",
  compareNotes: "talkStrategy",
};

function getCanonicalActionId(actionId) {
  if (CAMP_ACTION_LEGACY_MAP[actionId]) return CAMP_ACTION_LEGACY_MAP[actionId];
  const def = CAMP_ACTION_REGISTRY[actionId];
  if (def) return def.id;
  return actionId;
}

// v5.21: group lookup. Returns the consolidationGroup for an action id, or
// null if the action isn't part of a group. Used by the consolidation-aware
// dispatcher to detect when a merged action should fire instead.
function getActionConsolidationGroup(actionId) {
  return CAMP_ACTION_REGISTRY[actionId]?.consolidationGroup ?? null;
}

// v5.21: lookup an action's metadata by id without leaking the registry
// constant outside this module. Returns null for unknown ids.
function getCampActionDef(actionId) {
  return CAMP_ACTION_REGISTRY[actionId] ?? null;
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Executes one camp action. Mutates state and/or contestant objects.
// Returns { feedback: string, hint: string|null }
// hint carries a name when an action reveals who someone is watching.
//
// v5.21: dispatch is registry-aware. The switch below stays as the
// authoritative routing layer — every legacy id continues to route to its
// existing engine function, preserving end-to-end behavior. When a future
// phase introduces a merged action (e.g. "spendTime"), it can be added as
// a new switch case AND its consolidationGroup members can be optionally
// removed from CAMP_ACTIONS without further engine surgery.
function executeAction(state, actionId, player, tribemates, target) {
  // v5.14: log every camp action against the actor for camp-role detection.
  recordCampAction(state, player.id, actionId);
  switch (actionId) {
    // v5.22: consolidated social actions. Each merged id picks the legacy
    // engine path based on context, preserving the depth of behavior the
    // legacy actions implemented. AI continues to call actionTalk /
    // actionConfide / etc. directly; only the player-facing dispatch is
    // consolidated here.
    case "spendTime":   return dispatchSpendTime(state, player, target);
    case "mendBond":    return dispatchMendBond(state, player, target);
    case "readCamp":    return dispatchReadCamp(state, player, tribemates);

    // v5.23: consolidated strategy talk. Picks one of three legacy paths
    // (alignment / vote-ask / third-party-read) per call based on context
    // + weighted random — preserving v5.10's truth-band model, v5.13's
    // alliance-tier candor, and v5.17's rumor transfer hooks.
    case "talkStrategy": return dispatchTalkStrategy(state, player, target, tribemates);

    case "tendCamp":    return actionTendCamp(state, player, tribemates);
    case "searchidol":  return actionSearchIdol(state, player, tribemates);
    case "lobby":       return actionLobby(state, player, tribemates, target);
    case "laylow":      return actionLayLow(state, player, tribemates);
    case "proposeAlliance": return actionProposeAlliance(state, player, target);
    case "observePair":     return actionObservePair(state, player, tribemates, target);
    default:            return { feedback: "Nothing happened.", hint: null };
  }
}

// ── v5.22: Consolidated-action dispatchers ───────────────────────────────────
//
// These are the canonical entry points the player menu now invokes. Each
// dispatcher inspects current pair / camp context and routes to the
// appropriate legacy engine function. The legacy functions remain in the
// file (still called by AI directly) so the depth of v5.x behavior is
// preserved end-to-end.

// Spend time — picks depth based on existing trust + rel between the pair.
// Trusted, established pairs naturally fall into "open up" mode (deeper
// trust gain via actionConfide). New / cool pairs default to "hang out"
// mode (rel momentum via actionTalk).
function dispatchSpendTime(state, player, target) {
  const trust = getTrust(state, player.id, target.id);
  const rel   = getRelationship(state, player.id, target.id);
  if (trust >= 5 && rel >= 5) {
    return actionConfide(state, player, target);
  }
  return actionTalk(state, player, target);
}

// Mend things — picks repair mode by checking for a recent specific
// conflict. If one exists (within 2 rounds) OR the target has built up
// suspicion-memory of the player, the dispatcher routes to the
// post-conflict check-in path. Otherwise the ambient-strain smoothing
// path runs.
function dispatchMendBond(state, player, target) {
  const conflict = (typeof getRecentConflict === "function")
    ? getRecentConflict(state, player.id, target.id) : null;
  const memory   = (typeof getSuspicionMemory === "function")
    ? getSuspicionMemory(state, target.id, player.id) : 0;
  if (conflict || memory >= 1.5) {
    return actionCheckIn(state, player, target);
  }
  return actionSmoothOver(state, player, target);
}

// v5.23: Talk strategy — picks one of three legacy strategy modes per call.
// Each mode produces a meaningfully different conversation outcome:
//   • alignment (actionStrategy)   — float vote ideas, gauge agreement
//   • vote ask  (actionAskVote)    — fish for who they want out
//   • read trade (actionCompareNotes) — exchange reads on third parties
//
// Weights are biased by trust + alliance + relationship so the conversation
// type tilts toward what the standing between the pair actually supports —
// closer pairs are more likely to share specific intel (askVote / compareNotes);
// thinner ties stay at alignment talk. Random component within those tilts
// preserves the v5.10 unpredictability so two consecutive calls between the
// same pair can land on different angles.
function dispatchTalkStrategy(state, player, target, tribemates) {
  const trust    = getTrust(state, player.id, target.id);
  const rel      = getRelationship(state, player.id, target.id);
  const allyTier = (typeof getSharedAllianceTier === "function")
    ? getSharedAllianceTier(state, player.id, target.id) : null;

  // Each mode starts with a baseline so any can fire in any conversation.
  const w = { alignment: 1.2, askVote: 1.0, compareNotes: 0.8 };

  // Trust pushes specific-intel modes (vote ask / read trade) over alignment.
  if (trust >= 4) { w.askVote += 0.6; w.compareNotes += 0.4; }
  if (trust >= 6) { w.askVote += 0.5; w.compareNotes += 0.5; }
  if (trust <= 2) { w.alignment += 0.6; w.askVote -= 0.3; }

  // Alliance tier amplifies — core allies share more freely; loose allies
  // tilt only mildly; weakened allies behave like acquaintances.
  if (allyTier === "core")     { w.askVote += 0.6; w.compareNotes += 0.5; }
  if (allyTier === "loose")    { w.askVote += 0.3; w.compareNotes += 0.2; }

  // Relationship floor pushes alignment-only when rel is genuinely cool.
  if (rel < 0) { w.alignment += 0.5; w.askVote -= 0.4; w.compareNotes -= 0.4; }

  // Per-call jitter so equivalent contexts don't always pick the same mode.
  for (const k of Object.keys(w)) {
    w[k] = Math.max(0.1, w[k] * (0.85 + Math.random() * 0.30));
  }

  // Need at least 2 other tribemates to discuss third parties — compareNotes
  // is meaningless in a 2-person scope. Filter the option out if so.
  const others = tribemates.filter(c => c.id !== target.id);
  if (others.length < 2) w.compareNotes = 0;

  const total = w.alignment + w.askVote + w.compareNotes;
  let roll = Math.random() * total;
  if ((roll -= w.alignment)    <= 0) return actionStrategy(state, player, target);
  if ((roll -= w.askVote)      <= 0) return actionAskVote(state, player, target, tribemates);
  return actionCompareNotes(state, player, tribemates, target);
}

// Read the camp — combines vibe (readRoom) with concrete dynamics
// (observeCamp). Low-social players get vibe-only; social ≥ 6 players also
// get the specific pair / suspicion / isolation signals appended. Both
// underlying actions are pure-information; running both is safe.
function dispatchReadCamp(state, player, tribemates) {
  const room = actionReadRoom(state, player, tribemates);
  if ((player.social ?? 5) >= 6) {
    const observe = actionObserveCamp(state, player, tribemates);
    if (observe?.feedback) {
      return {
        feedback: room.feedback + "\n\n" + observe.feedback,
        hint:     room.hint ?? observe.hint ?? null,
      };
    }
  }
  return room;
}

// ── v5.10: Conversation mood + truthfulness model ────────────────────────────
//
// Two layered helpers shared by every strategic conversation action. The
// first picks the FEEL of the exchange (mood); the second picks the QUALITY
// of any information shared (truthfulness band). They draw on overlapping
// signals but resolve independently — a "warm" exchange can still produce
// misleading info, and a "tense" exchange can produce a frustrated truth.
//
// Inputs both helpers consider:
//
//   • relationship (rel)       — does the target like the player?
//   • trust                    — does the target rely on the player's word?
//   • alliance ties            — bound partners share more than acquaintances
//   • current vote alignment   — if both want the same person out, candor rises
//   • target.suspicion         — visible-scheming heat the target is feeling
//   • target's idol-suspicion of the player — paranoia about the player
//                                              specifically
//   • player.strategy          — smoother players coax more out of others
//   • target.strategy          — strategic NPCs hedge more, deceive better
//   • personality archetype    — light hooks via stat profile (high social =
//                                more warm/awkward, high strategy = more
//                                evasive/misleading under pressure)
//
// Crucially: candor never produces a deterministic verdict. Even at very high
// candor scores there's a small chance of deception (long-game players who
// lie smiling at their closest allies); even at very low candor there's a
// small chance of an unexpected truth (frustration, slip-ups, oversharing).
// This is intentional — it's what makes strategic information feel human.

// Computes the shared candor context once per conversation. All callers pass
// the same shape into pickConversationMood and pickTruthfulnessBand so the
// two outputs share consistent inputs.
function buildConversationContext(state, player, target) {
  const rel       = getRelationship(state, player.id, target.id);
  const trust     = getTrust(state, player.id, target.id);
  // v5.13: alliance tier shapes how candidly an ally talks. Core allies share
  // freely; loose allies hedge; weakened allies behave like acquaintances.
  const allyTier  = (typeof getSharedAllianceTier === "function")
    ? getSharedAllianceTier(state, player.id, target.id)
    : (isInSameAlliance(state, player.id, target.id) ? "loose" : null);
  const ally      = allyTier !== null;
  const idolSusp  = state.idolSuspicion?.[target.id]?.[player.id] ?? 0;
  const targetSusp= target.suspicion ?? 0;
  const playerSusp= player.suspicion ?? 0;

  // Vote alignment — if the target's current camp target matches who the
  // player has been pressuring (or vice versa), candor rises sharply.
  // We approximate "who the player wants out" via state.campTargets[player.id]
  // since players can set vote intent during camp; otherwise fallback to 0.
  const playerIntent = getCampTargetForContestant(state, player.id);
  const targetIntent = getCampTargetForContestant(state, target.id);
  let voteAlignment = 0;
  if (playerIntent && targetIntent) {
    if (playerIntent.targetId === targetIntent.targetId) voteAlignment = 3;
    else                                                  voteAlignment = -1;
  }

  return {
    rel, trust, ally, allyTier, idolSusp, targetSusp, playerSusp,
    voteAlignment,
    playerStrategy: player.strategy ?? 5,
    playerSocial:   player.social   ?? 5,
    targetStrategy: target.strategy ?? 5,
    targetSocial:   target.social   ?? 5,
    // v5.13: archetype tendencies. Default to "balanced" if unset (e.g. for
    // older save data) so the candor/mood model continues to work unchanged.
    playerArchetype: player.archetype ?? "balanced",
    targetArchetype: target.archetype ?? "balanced",
  };
}

// v5.13: alliance-tier candor weight. Used by both mood and truthfulness
// pickers so a "core" co-member shares dramatically more than a "loose" one.
function _allyCandor(allyTier) {
  switch (allyTier) {
    case "core":     return 6;
    case "loose":    return 3;
    case "weakened": return 1;
    default:         return 0;
  }
}

// Picks the conversation mood. Returns one of:
//   "productive" | "warm" | "awkward" | "tense" | "suspicious" | "evasive"
//
// Weighted-random over signals. No hard thresholds — every mood is at least
// faintly possible in any conversation, so the player can't fully predict
// how a given attempt will land.
function pickConversationMood(state, player, target, ctx) {
  ctx = ctx || buildConversationContext(state, player, target);
  const { rel, trust, ally, targetSusp, idolSusp,
          playerSocial, targetStrategy, voteAlignment } = ctx;

  // Each weight starts with a baseline floor so every mood is reachable.
  // v5.15: positive moods keep a baseline of 1.0 — most camp conversations
  // are at least cordial. Negative moods drop to 0.6 so they only surface
  // when there's real signal, not from baseline noise.
  const weights = {
    productive: 1.0,
    warm:       1.0,
    awkward:    0.8,
    tense:      0.6,
    suspicious: 0.6,
    evasive:    0.6,
  };

  // Positive standing pushes productive/warm. v5.13: alliance tier scales
  // these — core allies are dramatically more productive than loose ones.
  const allyCandor = _allyCandor(ctx.allyTier);
  weights.productive += Math.max(0, trust * 0.6) + Math.max(0, rel * 0.15)
                       + allyCandor + Math.max(0, voteAlignment);
  weights.warm       += Math.max(0, rel * 0.25) + (playerSocial * 0.15)
                       + (ally ? 1.5 : 0);

  // v5.13: archetype tilts. Soft tendencies — they shift weights, never
  // override. Combined effect of multiple signals still dominates.
  switch (ctx.targetArchetype) {
    case "loyal":
      weights.productive += 1.5;
      weights.warm       += 1.0;
      weights.suspicious -= 0.5;
      weights.evasive    -= 0.5;
      break;
    case "sneaky":
      weights.evasive    += 1.5;
      weights.suspicious += 0.8;
      weights.warm       -= 0.3;
      break;
    case "paranoid":
      weights.suspicious += 2.0;
      weights.tense      += 0.6;
      weights.productive -= 0.5;
      break;
    case "socialButterfly":
      weights.warm       += 2.0;
      weights.productive += 0.5;
      weights.awkward    -= 0.5;
      weights.tense      -= 0.4;
      break;
    case "workhorse":
      weights.awkward    += 0.8;
      weights.warm       += 0.4;
      weights.suspicious -= 0.3;
      break;
    case "challengeBeast":
      weights.warm       += 0.5;
      weights.evasive    += 0.4;
      break;
  }

  // Mid-low rapport without hostility leans awkward.
  weights.awkward    += Math.max(0, 4 - Math.abs(rel) * 0.3)
                       + (trust < 2 ? 1.5 : 0);

  // Active hostility leans tense.
  weights.tense      += Math.max(0, -rel * 0.25) + Math.max(0, -trust * 0.4);

  // Heat on the target → suspicious mood. The target reads the conversation
  // as part of a wider campaign against them.
  weights.suspicious += Math.max(0, targetSusp * 0.35) + Math.max(0, idolSusp * 0.25)
                       + (targetStrategy * 0.05);

  // Strategic targets who don't trust the player pivot to evasive.
  weights.evasive    += Math.max(0, (targetStrategy - 4) * 0.25)
                       + Math.max(0, (4 - trust) * 0.35)
                       + Math.max(0, idolSusp * 0.15);

  // Smooth players (high social) shave a bit off awkward/tense — they keep
  // the exchange afloat even when the underlying signal is bad.
  weights.awkward = Math.max(0.2, weights.awkward - playerSocial * 0.08);
  weights.tense   = Math.max(0.2, weights.tense   - playerSocial * 0.06);

  // v5.15: small per-call jitter on each weight (±10%) so consecutive
  // conversations with the same target feel different in flavor without
  // contradicting the model's overall direction. Keeps replays varied.
  for (const k of Object.keys(weights)) {
    weights[k] = Math.max(0.1, weights[k] * (0.9 + Math.random() * 0.2));
  }

  // v5.19: jury-aware softening. Once the jury exists, every active player
  // is a future juror or a future juror-vote-recipient. Conversations
  // visibly soften — fewer tense exchanges, more warm/awkward ones.
  if (state.merged && (state.jury?.length ?? 0) >= 1) {
    weights.tense      *= 0.8;
    weights.suspicious *= 0.85;
    weights.warm       *= 1.15;
    weights.awkward    *= 1.10;
  }

  // Weighted pick.
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [mood, w] of Object.entries(weights)) {
    if ((roll -= w) <= 0) return mood;
  }
  return "awkward";
}

// Applies relationship/trust/suspicion side effects from a conversation
// mood. Strategic actions call this once per resolution. The deltas are
// small and additive — they layer on top of whatever the action's primary
// effect was (e.g. the rel bump for being consulted in actionAskVote).
function applyMoodEffects(state, player, target, mood) {
  switch (mood) {
    case "productive":
      adjustRelationship(state, player.id, target.id, +1);
      adjustTrust(state, player.id, target.id, +1);
      break;
    case "warm":
      adjustRelationship(state, player.id, target.id, +2);
      break;
    case "awkward":
      // No mechanical effect; the conversation just doesn't go anywhere.
      break;
    case "tense":
      adjustRelationship(state, player.id, target.id, -rand(1, 2));
      break;
    case "suspicious":
      // The target reads the conversation as scheming. Their picture of the
      // player tightens, not the relationship itself.
      adjustIdolSuspicion(state, target.id, player.id, +1);
      adjustSuspicion(state, player.id, +1);
      break;
    case "evasive":
      // Brief social cost — the deflection is read as "they didn't want to
      // be in this conversation with me", which stings a little.
      adjustRelationship(state, player.id, target.id, -1);
      break;
  }
}

// Picks a truthfulness band for an information request. Returns one of:
//   "truthful" | "mostly" | "incomplete" | "vague" | "evasive" |
//   "misleading" | "false"
//
// Computes a candor score from the same context, then maps it to a band
// with deliberate noise — even high candor can deceive (~12% chance);
// even low candor occasionally tells the truth (~12% chance).
function pickTruthfulnessBand(state, player, target, ctx) {
  ctx = ctx || buildConversationContext(state, player, target);
  const { rel, trust, ally, idolSusp, targetSusp, playerSusp,
          voteAlignment, playerStrategy, targetStrategy } = ctx;

  // v5.13: alliance-tier candor uses _allyCandor instead of a flat +4 for ally.
  // Archetype hooks: loyal targets disclose more; sneaky disclose less.
  let archetypeShift = 0;
  switch (ctx.targetArchetype) {
    case "loyal":          archetypeShift += 1.0; break;
    case "sneaky":         archetypeShift -= 1.5; break;
    case "paranoid":       archetypeShift -= 0.8; break;
    case "socialButterfly":archetypeShift += 0.4; break;
    case "challengeBeast": archetypeShift -= 0.3; break;
    // workhorse is candor-neutral
  }

  // v5.14: camp-role identity also shifts how others read you. A known
  // "Social Connector" gets warmer engagement; a known "Schemer" gets
  // hedged answers; "Provider" reputation buys a small candor cushion.
  // v5.15: "leaning:X" roles apply at half magnitude — the read is forming
  // but hasn't fully committed in others' minds.
  const askerRole = getCampRole(state, player.id);
  const roleCore  = (askerRole || "").replace(/^leaning:/, "");
  const roleScale = (askerRole || "").startsWith("leaning:") ? 0.5 : 1.0;
  switch (roleCore) {
    case "socialConnector": archetypeShift += 1.0 * roleScale; break;
    case "provider":        archetypeShift += 0.5 * roleScale; break;
    case "schemer":         archetypeShift -= 1.0 * roleScale; break;
    case "drifter":         archetypeShift -= 0.3 * roleScale; break;
    // strategist is candor-neutral here; their role shows up via lobby
  }

  // v5.16: asker's social capital lightly shifts how candidly they're
  // received. Well-liked askers earn a small benefit-of-the-doubt; askers
  // whose stock is low get answers a band cooler than candor would predict.
  const askerCapital = (typeof getSocialCapital === "function")
    ? getSocialCapital(state, player.id) : 5;
  const capitalShift = (askerCapital - 5) * 0.20;

  const candor =
      trust * 1.0
    + rel  * 0.25
    + _allyCandor(ctx.allyTier)
    + voteAlignment
    + playerStrategy * 0.15
    - targetStrategy * 0.20
    - idolSusp        * 0.50
    - targetSusp      * 0.20
    - playerSusp      * 0.20
    + archetypeShift
    + capitalShift;

  // v5.15: jitter widened from ±1.0 to ±1.4 so band selection isn't too
  // mechanical — two near-identical conversations might land one band
  // apart and feel different in flavor without contradicting the model.
  const jitter = (Math.random() - 0.5) * 2.8;
  const score  = candor + jitter;

  // Long-game deception flip: chance the target lies even at high candor.
  // v5.13: sneaky archetypes flip more often (sometimes betray smiling);
  // loyal archetypes flip much less.
  let deceptionFlip = 0.12;
  if (ctx.targetArchetype === "sneaky") deceptionFlip = 0.20;
  if (ctx.targetArchetype === "loyal")  deceptionFlip = 0.04;
  if (score >= 6 && Math.random() < deceptionFlip) {
    return Math.random() < 0.5 ? "misleading" : "incomplete";
  }
  // Frustrated-truth flip: chance of an unexpected real disclosure even at
  // low candor. v5.13: social butterflies overshare more, paranoid players
  // less.
  let truthFlip = 0.12;
  if (ctx.targetArchetype === "socialButterfly") truthFlip = 0.20;
  if (ctx.targetArchetype === "paranoid")        truthFlip = 0.05;
  if (score < 2 && Math.random() < truthFlip) {
    return Math.random() < 0.5 ? "mostly" : "incomplete";
  }

  if (score >= 8)  return "truthful";
  if (score >= 5)  return "mostly";
  if (score >= 3)  return "incomplete";
  if (score >= 1)  return "vague";
  if (score >= -1) return "evasive";
  if (score >= -3) return "misleading";
  return "false";
}

// Short adverb fragment to colour a feedback line based on mood.
// Caller composes it into the larger feedback string. Keep these short —
// they prefix or suffix the truth-band line, not replace it.
function moodFlavor(mood, target) {
  switch (mood) {
    case "productive": return `${target.name} leaned in, focused.`;
    case "warm":       return `${target.name} smiled — the exchange felt easy.`;
    case "awkward":    return `${target.name} shifted, glanced past you.`;
    case "tense":      return `${target.name}'s tone went flat.`;
    case "suspicious": return `${target.name}'s eyes narrowed.`;
    case "evasive":    return `${target.name} kept finding reasons to look away.`;
    default:           return "";
  }
}

// ── Action implementations ────────────────────────────────────────────────────

// TALK / "Spend time with someone" — relationship builder.
//
// Backfire chance starts at 20% and drops by 2% per trust point with the target,
// so a trusted ally (trust 8) has only a 4% chance of an awkward conversation.
// A strong deep connection (delta ≥ 5) also yields a small trust gain.
//
// v5.3: rel-momentum modifier shapes the delta toward "repeated investment in
// one person matters". A high existing relationship makes new conversations
// land harder; an existing rift makes them feel awkward and produce less.
//
// Formula:
//   backfireChance = max(0, 0.20 − trust × 0.02)
//   momentum       = +2 if rel ≥ 12, +1 if rel ≥ 5, −1 if rel < −5, 0 otherwise
//   delta (success) = floor(social / 3) + rand(1, 3) + momentum
//                       (clamped at minimum 1 — every honest hangout is at least
//                        a tiny step forward, even with friction)
//   delta (backfire) = −rand(1, 3)
//   trust gain on deep connection (delta ≥ 5): +1
function actionTalk(state, player, target) {
  const rel          = getRelationship(state, player.id, target.id);
  const trust        = getTrust(state, player.id, target.id);
  const backfireChance = Math.max(0, 0.20 - trust * 0.02);
  const backfire     = Math.random() < backfireChance;

  if (backfire) {
    const delta = -rand(1, 3);
    adjustRelationship(state, player.id, target.id, delta);
    return { feedback: pickFrom([
      `You tried to talk with ${target.name}, but the conversation went nowhere. Awkward.`,
      `${target.name} seemed distracted during your conversation. Something felt off.`,
      `You and ${target.name} couldn't find a rhythm today. The silence stretched too long.`,
      `You sat next to ${target.name} for a while, but neither of you knew what to say. By the time you got up, it felt worse than before.`,
      `${target.name} answered your questions, but their eyes never quite met yours. You walked away wishing you hadn't tried.`,
    ]), hint: null };
  }

  // v5.3: momentum reflects how "in rhythm" the pair already is. Existing
  // closeness makes new conversations land more meaningfully; existing
  // friction makes them mildly awkward and less productive.
  const momentum =
    rel >=  12 ?  2 :
    rel >=   5 ?  1 :
    rel <   -5 ? -1 :
    0;
  // v5.8: cap delta at 6 so a single conversation can't dominate the relationship curve.
  const delta = Math.max(1, Math.min(6, Math.floor(player.social / 3) + rand(1, 3) + momentum));
  adjustRelationship(state, player.id, target.id, delta);

  if (delta >= 5) {
    adjustTrust(state, player.id, target.id, 1);
    // Deep connection reinforces any pact they've made together.
    strengthenSharedAlliances(state, player.id, target.id, 0.5);

    // v3.7: post-swap cross-tribe deep talks carry a different flavor —
    // these are people who were enemies a week ago. The mechanical effect
    // is the same; the moment just reads differently.
    const crossTribePostSwap =
      state.swapped && !state.merged
      && player.originalTribe !== target.originalTribe;

    if (crossTribePostSwap) {
      return { feedback: pickFrom([
        `You and ${target.name} talked through the strangeness of the swap. Old enemies sharing a fire — and somehow it landed.`,
        `${target.name} was on the other side a week ago. Today you found something real to talk about. The old lines feel softer now.`,
        `The conversation with ${target.name} cut past the awkwardness of being on opposite tribes. You came in strangers. You left as something else.`,
      ]), hint: null };
    }

    return { feedback: pickFrom([
      `You and ${target.name} talked for a long time by the fire. It felt like a real connection.`,
      `${target.name} opened up about their life back home. You listened. It seemed to matter.`,
      `The conversation with ${target.name} went deep. You learned something real about them.`,
      `You and ${target.name} ended up sitting on the beach long after the others had drifted off. Neither of you was in any hurry to leave.`,
      `${target.name} told you a story about their family that they probably hadn't planned to share. You could tell it landed for both of you.`,
    ]), hint: null };
  }

  return { feedback: pickFrom([
    `You had a pleasant chat with ${target.name} while gathering water. Easy and comfortable.`,
    `You and ${target.name} talked briefly about camp life. Nothing deep, but friendly.`,
    `You checked in on ${target.name}. Short conversation, but they seemed to appreciate it.`,
    `You ate next to ${target.name} and traded a few jokes. Nothing remarkable, but the warmth was real.`,
    `You and ${target.name} swapped small talk while sorting firewood. The kind of moment that quietly adds up.`,
    `You and ${target.name} sat through a long stretch of nothing-conversation. Easy silence broken by easy words. The bones of trust.`,
    `${target.name} asked how you were holding up — actually asked. You gave a real answer. They listened.`,
  ]), hint: null };
}

// TEND CAMP — tribe-wide goodwill, suspicion drop, idol-search support.
//
// v5.5: renamed from actionImprovecamp and moved from Social to Island. The
// reframing matches what the action actually represents on the island —
// physical labor at the camp itself, not interpersonal interaction. Every
// tribemate notices the contribution; the tribe-wide rel bump scales with
// social skill (warm contributors earn more goodwill than transactional ones).
//
// ── Effects ──────────────────────────────────────────────────────────────────
//
//   • All tribemates: rel + delta
//       delta = 2 if player.social ≥ 7, else 1
//
//   • Player suspicion −1 (visibly working = visibly not scheming)
//
//   • v5.5: tendCampBonus += 1 (capped at 2). Each credit gives the next
//     idol search +5% find chance. Consumed on use. Mechanically links Tend
//     Camp to Search for Idol — being seen at camp gives you cover for
//     slipping away briefly. Caps at 2 so you can't farm credits indefinitely
//     by tending all three camp slots.
//
// Tend Camp doesn't actively reveal the synergy in feedback text — the
// player discovers the idol-search interaction by playing.
function actionTendCamp(state, player, tribemates) {
  const delta = player.social >= 7 ? 2 : 1;

  // v5.8: 30% of the time the contribution lands "subtle" — only roughly half
  // the tribe consciously registers it. Not every chore is performative; some
  // days the work is genuinely invisible. Keeps Tend Camp from being a flat,
  // optimal tribe-wide rel bump every cycle.
  const subtle = Math.random() < 0.30;
  let landed = tribemates;
  if (subtle && tribemates.length > 1) {
    const half = Math.max(1, Math.ceil(tribemates.length / 2));
    landed = [...tribemates].sort(() => Math.random() - 0.5).slice(0, half);
  }
  for (const mate of landed) {
    adjustRelationship(state, player.id, mate.id, delta);
  }
  adjustSuspicion(state, player.id, -1);

  // v5.5: idol-search support credit. Capped at 2.
  // v5.6: only the human player's tends accumulate this credit — AI doesn't
  // search for idols, so AI tending shouldn't quietly buff the player's
  // next search. Tribe-wide rel + suspicion drop still apply for everyone.
  if (state.player && state.player.id === player.id) {
    state.tendCampBonus = Math.min(2, (state.tendCampBonus ?? 0) + 1);
  }

  if (subtle) {
    return { feedback: pickFrom([
      `You worked steadily around camp, but the others were spread out and busy. Some of them noticed; some didn't. Quiet contribution.`,
      `You spent hours on small fixes — nothing flashy. A couple of tribemates thanked you in passing. The rest never looked up.`,
      `You kept yourself useful all afternoon. Not everyone clocked it, but the people who did seemed to file it away.`,
    ]), hint: null };
  }

  return { feedback: pickFrom([
    `You spent the afternoon shoring up the shelter. A few tribemates thanked you. Being seen working has its own quiet value.`,
    `You collected firewood and kept the fire going all night. The tribe noticed — you were visible, helpful, not lurking.`,
    `You reorganized the food supply and cleaned up camp. Nobody said much, but they saw. You spent the day exactly where you should be.`,
    `You hauled water for hours without being asked. Small thing, but it was remembered. The kind of work that earns you the benefit of the doubt later.`,
    `You patched the roof of the shelter while the others sat around. By dinner everyone knew it was you. Small wins.`,
  ]), hint: null };
}

// SEARCH FOR IDOL — strategic risk/reward action.
//
// Calls idolSearch() (engine/idols.js) to resolve discovery. That function
// owns the success roll and all idol state changes. This function owns the
// social cost and feedback — consistent with every other camp action here.
//
// Success formula (owned by idols.js):
//   base 20% + strategy×2.5% + (prior searches in scope)×8%, capped at 65%
//
// Suspicion formula (owned here):
//   Player suspicion: +1 base; +1 if social < 4 (anxious, easy to read);
//                     +1 if ≥2 prior searches in this scope (tribe notices pattern)
//   Witness rel:      −rand(1,2) first search; −rand(2,3) repeat
//   Witness trust:    −1 first/second; −2 third+ (pattern erodes trust)
//
// Social skill affects how much suspicion is generated — better cover, less heat.
// Strategy determines find chance. Even a successful search costs suspicion;
// you cannot vanish for an hour without someone wondering why.
function actionSearchIdol(state, player, tribemates) {
  if (tribemates.length === 0) {
    return { feedback: "There was no chance to slip away from camp today.", hint: null };
  }

  // Read search count BEFORE idolSearch() increments it so feedback tiers
  // correctly reflect "this is your Nth attempt" from the player's perspective.
  const scope        = state.merged ? "merged" : player.tribe;
  const prevSearches = state.idolSearches?.[scope] ?? 0;

  // Attempt discovery. idolSearch() updates idol state on success and
  // increments state.idolSearches[scope] regardless of outcome.
  const { found, idol } = idolSearch(player, state);

  // ── Social costs (always paid — found or not) ─────────────────────────────
  const witness = pickFrom(tribemates);

  const baseSusp   = 1;
  const lowSocial  = player.social < 4 ? 1 : 0;
  const repeatHeat = prevSearches >= 2 ? 1 : 0;
  adjustSuspicion(state, player.id, baseSusp + lowSocial + repeatHeat);

  const relHit   = prevSearches >= 1 ? -rand(2, 3) : -rand(1, 2);
  const trustHit = prevSearches >= 2 ? -2 : -1;
  adjustRelationship(state, player.id, witness.id, relHit);
  adjustTrust(state, player.id, witness.id, trustHit);

  // ── Idol suspicion ────────────────────────────────────────────────────────
  //
  // The witness directly observed the player's behaviour. Their belief that
  // the player holds (or might soon hold) an idol jumps:
  //
  //   base       : rand(1, 2)
  //   strategist : +1 if witness.strategy ≥ 7 (pattern-aware)
  //   smooth     : –1 if player.social ≥ 8   (great cover)
  //   repeat     : +1 if prior searches in this scope ≥ 1
  //   tell       : +1 on success if player.social < 6 (couldn't quite hide it)
  //
  // Range: typically 1–5 added to the witness's idol suspicion of the player.
  const witnessGain =
    rand(1, 2)
    + (witness.strategy >= 7 ? 1 : 0)
    + (player.social   >= 8 ? -1 : 0)
    + (prevSearches    >= 1 ? 1 : 0)
    + (found && player.social < 6 ? 1 : 0);
  adjustIdolSuspicion(state, witness.id, player.id, Math.max(1, witnessGain));

  // v5.12: witness logs an "idol-search" memory against the player. Repeats
  // amplify — first catch is suspicious, third catch is reputation.
  // v5.14: camp-role identity adjusts the weight. A known Provider has built
  // up "they're not the type" reputation; a Schemer is read as "of course
  // they were doing that" and the witness pile-on is heavier.
  // v5.15: "leaning" roles only half-apply — the read is forming but the
  // tribe hasn't fully committed.
  let memoryWeight = prevSearches >= 2 ? 2 : 1;
  const _searchRole = getCampRole(state, player.id) || "";
  const _searchRoleCore  = _searchRole.replace(/^leaning:/, "");
  const _searchRoleScale = _searchRole.startsWith("leaning:") ? 0.5 : 1.0;
  if (_searchRoleCore === "provider") memoryWeight = Math.max(0.5, memoryWeight - 0.5 * _searchRoleScale);
  if (_searchRoleCore === "schemer")  memoryWeight += 0.5 * _searchRoleScale;
  recordSuspiciousAct(state, witness.id, player.id, "idolSearch", memoryWeight);

  // v5.17: witnessed idol search seeds a "suspicious" rumor. The witness
  // is the originator (their belief is highest); spread will carry it to
  // their close contacts at degraded confidence.
  if (typeof seedRumor === "function") {
    seedRumor(state, "suspicious", player.id, null, witness.id, 0.9);
  }

  // Ambient bleed: from the second repeat onward, other tribemates start
  // noticing the pattern even without seeing the search directly. Each
  // non-witness tribemate has a 40% chance to gain +1 idol suspicion.
  if (prevSearches >= 2) {
    for (const mate of tribemates) {
      if (mate.id === witness.id) continue;
      if (Math.random() < 0.40) {
        adjustIdolSuspicion(state, mate.id, player.id, 1);
        // v5.12: ambient memory — they didn't see it directly, but they're
        // adding the player to the "watch this person" list at lower weight.
        recordSuspiciousAct(state, mate.id, player.id, "scrambling", 0.5);
      }
    }
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  if (found) {
    return { feedback: pickFrom([
      `You ducked into the jungle and dug around the base of a large tree. Your fingers hit something hard — wrapped in cloth, wedged into a hollow root. A hidden immunity idol. You pocketed it and slipped back to camp. ${witness.name} gave you a searching look when you emerged from the trees.`,
      `You told the others you needed firewood and slipped away. After nearly an hour of methodical searching, you found it — nestled beneath a distinctive rock formation. An immunity idol. You tucked it into your bag and rejoined camp. ${witness.name} was watching when you came out of the trees.`,
      `You had a hunch and followed it. Deep in the jungle, wedged into a crevice exactly where you thought it might be — a hidden immunity idol. You concealed it and headed back. ${witness.name} seemed very curious about where you had been.`,
    ]), hint: "idol:found" };
  }

  // Failure — feedback varies by how many times they have searched.
  if (prevSearches === 0) {
    return { feedback: pickFrom([
      `You slipped away into the jungle and searched for nearly an hour. You found nothing — and ${witness.name} was watching when you got back.`,
      `An hour in the trees, hands in the dirt. Nothing. ${witness.name} gave you a long look when you returned to camp.`,
      `You told the tribe you were getting water, then spent an hour searching the tree line. ${witness.name} seemed skeptical when you came back empty-handed.`,
    ]), hint: null };
  }

  if (prevSearches === 1) {
    return { feedback: pickFrom([
      `You slipped away again. Another hour of searching, nothing to show for it. ${witness.name} was at the tree line when you returned — they'd clearly been watching.`,
      `You made another pass through the jungle. Still nothing. ${witness.name} didn't say a word when you came back, but they didn't have to.`,
      `You searched every corner of the jungle you hadn't tried yet. Empty-handed again. ${witness.name} had that look — the one that means they noticed.`,
    ]), hint: null };
  }

  // Third+ attempt — the tribe is starting to put it together.
  return { feedback: pickFrom([
    `You searched again. This is becoming a pattern — and ${witness.name} made no effort to hide their suspicion when you returned. People are starting to talk.`,
    `Another hour in the jungle, another fruitless search. ${witness.name} wasn't the only one watching this time. You're drawing too much attention.`,
    `You came back empty-handed again. ${witness.name} looked at you the way they look at someone they've already figured out. You need to be more careful.`,
  ]), hint: null };
}

// DISCUSS STRATEGY — alliance-building through shared game thinking.
//
// The closer your strategy stats, the better the conversation. But trust
// also gates how openly the target engages — a guarded player (trust 0–2)
// is more defensive across the board, worsening outcomes in each tier.
// A good strategy talk (delta ≥ 3) earns +1 trust — shared thinking builds bonds.
//
// Formula:
//   gap = |player.strategy − target.strategy|
//   lowTrust = getTrust(...) < 3
//   gap ≤ 2 (aligned)   → delta = rand(2, 5),     −1 if lowTrust
//   gap ≤ 5 (lukewarm)  → delta = rand(0, 2),     −1 if lowTrust (may go negative)
//   gap > 5 (divergent) → delta = −rand(1, 3),    −1 extra if lowTrust
//   trust +1 if delta ≥ 3
function actionStrategy(state, player, target) {
  // v5.10: routes through the shared mood/truth model. Strategy stat gap
  // still matters — it shapes the underlying relationship change — but the
  // CONVERSATION TONE comes from the mood model, and any read on how the
  // target actually sees the game comes from the truth band.
  const gap = Math.abs((player.strategy ?? 5) - (target.strategy ?? 5));

  const ctx  = buildConversationContext(state, player, target);
  const mood = pickConversationMood(state, player, target, ctx);
  const band = pickTruthfulnessBand(state, player, target, ctx);

  // Base relationship delta from strategic alignment. Mood effects layer on
  // top via applyMoodEffects.
  let delta;
  if (gap <= 2)      delta = rand(2, 4);
  else if (gap <= 5) delta = rand(0, 2);
  else               delta = -rand(1, 3);
  adjustRelationship(state, player.id, target.id, delta);
  applyMoodEffects(state, player, target, mood);

  // Aligned strategy talk among allies tightens the pact;
  // sharp disagreement between allies erodes it.
  if (delta >= 3)      strengthenSharedAlliances(state, player.id, target.id, 0.5);
  else if (delta < 0)  strengthenSharedAlliances(state, player.id, target.id, -0.5);

  const flavor = moodFlavor(mood, target);

  // The "what they shared" half of the line is determined by the truth band.
  // Strategy talk tends to surface feelings about another player, so we
  // pick a real person they have a strong feeling about (positive or negative)
  // and let the band decide how candidly they describe that feeling.
  const others = (state.tribes?.[target.tribe] || [])
    .filter(c => c.id !== target.id && c.id !== player.id);
  let warmest = null, coldest = null, warmRel = -Infinity, coldRel = Infinity;
  for (const c of others) {
    const r = getRelationship(state, target.id, c.id);
    if (r > warmRel) { warmRel = r; warmest = c; }
    if (r < coldRel) { coldRel = r; coldest = c; }
  }

  // Disclosure picks: real signal, or a decoy for misleading/false.
  const realPick =
      coldest && coldRel <= -3 ? { person: coldest, kind: "concern" } :
      warmest && warmRel >=  5 ? { person: warmest, kind: "ally"    } :
      null;
  const decoyPick = warmest && coldest
    ? { person: pickFrom([warmest, coldest]), kind: "concern" }
    : null;

  switch (band) {
    case "truthful":
      if (realPick) {
        const verb = realPick.kind === "concern"
          ? `wary of ${realPick.person.name}`
          : `tight with ${realPick.person.name}`;
        return { feedback: `${flavor} "Look, I'll just say it — I'm ${verb}. That's where my head is."`,
                 hint: realPick.person.name };
      }
      return { feedback: `${flavor} "Nothing's clicking yet. I'm reading the room and waiting for someone to make a move."`,
               hint: null };

    case "mostly":
      if (realPick) {
        return { feedback: `${flavor} "${realPick.person.name} is on my mind. I won't say more than that, but you can read between the lines."`,
                 hint: realPick.person.name };
      }
      return { feedback: `${flavor} "I've got reads. I'm just not ready to share all of them."`,
               hint: null };

    case "incomplete":
      return { feedback: `${flavor} "There's people I'm watching. I'd rather hear yours first, honestly."`,
               hint: null };

    case "vague":
      return { feedback: `${flavor} "I think we're all just feeling it out, right? It's still early."`,
               hint: null };

    case "evasive":
      return { feedback: `${flavor} ${target.name} steered the conversation toward camp logistics within thirty seconds.`,
               hint: null };

    case "misleading":
      if (decoyPick) {
        return { feedback: `${flavor} "Honestly, I'm worried about ${decoyPick.person.name}." It came out a little too clean.`,
                 hint: decoyPick.person.name };
      }
      return { feedback: `${flavor} "Honestly? I think we're solid." You weren't sure that was the read you'd been getting from them.`,
               hint: null };

    case "false":
    default:
      if (decoyPick) {
        return { feedback: `${flavor} "${decoyPick.person.name}. They've been working an angle." Their face gave away absolutely nothing.`,
                 hint: decoyPick.person.name };
      }
      return { feedback: `${flavor} "I think the tribe is in a great place," they said. The smile didn't reach their eyes.`,
               hint: null };
  }
}

// ASK WHO THEY WANT OUT — intel action gated on trust.
//
// What you learn depends entirely on how much the target trusts you.
// Everyone gets a small trust and relationship bump for being consulted —
// people like feeling valued. But the accuracy of the intel varies:
//
//   trust 0–2 (distrustful): 50% chance they give a decoy name to throw you off.
//               The other 50% they give a vague non-answer.
//   trust 3–5 (guarded): they give their honest read, but hedge it.
//               This is the default starting state.
//   trust 6+  (open): they tell you exactly who and why. The hint field is reliable.
//
// Formula (finding target's real preference): compare getRelationship scores
//   among all other tribemates; the person with the lowest score is their target.
function actionAskVote(state, player, target, tribemates) {
  // v5.10: every conversation now resolves through a shared mood + truth-
  // band model rather than fixed trust thresholds. The player can ASK anyone
  // anything; the answer's quality and tone is what varies, never access.

  // Everyone gets a small boost for being consulted.
  adjustRelationship(state, player.id, target.id, rand(1, 2));
  adjustTrust(state, player.id, target.id, 1);

  const others = tribemates.filter(m => m.id !== target.id);

  // Find the person this NPC actually wants gone (their real preference).
  let realTarget = null;
  let worstScore = Infinity;
  for (const other of others) {
    const score = getRelationship(state, target.id, other.id);
    if (score < worstScore) {
      worstScore  = score;
      realTarget  = other;
    }
  }

  // Pick mood and truthfulness band off the same context.
  const ctx   = buildConversationContext(state, player, target);
  const mood  = pickConversationMood(state, player, target, ctx);
  const band  = pickTruthfulnessBand(state, player, target, ctx);
  applyMoodEffects(state, player, target, mood);

  // Pick a decoy for misleading/false bands.
  const decoyPool = others.filter(o => !realTarget || o.id !== realTarget.id);
  const decoy     = decoyPool.length > 0 ? pickFrom(decoyPool) : null;

  const flavor = moodFlavor(mood, target);

  // No real target available? Fall through to a vague non-answer regardless
  // of band — there's literally nothing to disclose.
  if (!realTarget) {
    return {
      feedback: `${flavor} "I'm keeping my options open," ${target.name} said. "Too early to commit."`,
      hint: null,
    };
  }

  // Compose answer based on truth band.
  switch (band) {
    case "truthful":
      return { feedback: `${flavor} "${realTarget.name}. I've already talked to a couple people. Same page."`,
               hint: realTarget.name };

    case "mostly":
      return { feedback: `${flavor} "Probably ${realTarget.name}. I've got reasons, but I want to keep it loose for now."`,
               hint: realTarget.name };

    case "incomplete":
      return { feedback: `${flavor} "I've got someone in mind, but I'd rather not put a name on it yet — not until I know where you're at."`,
               hint: null };

    case "vague":
      return { feedback: `${flavor} "Honestly? I'm watching a few people. Nobody locked in."`,
               hint: null };

    case "evasive":
      return { feedback: `${flavor} ${target.name} changed the subject before you could finish the question.`,
               hint: null };

    case "misleading":
      if (decoy) {
        return { feedback: `${flavor} "I'm leaning ${decoy.name}, if I'm being honest." There was a beat of silence afterward that felt rehearsed.`,
                 hint: decoy.name };
      }
      return { feedback: `${flavor} "I really haven't decided," they said. You weren't sure you believed them.`,
               hint: null };

    case "false":
    default:
      if (decoy) {
        return { feedback: `${flavor} "${decoy.name}. No question." They held your gaze a second too long.`,
                 hint: decoy.name };
      }
      return { feedback: `${flavor} "I haven't decided yet," they said, flat as a closed door.`,
               hint: null };
  }
}

// CONFIDE — deep trust builder.
//
// You share something personal or vulnerable with the target. The fastest way
// to build real trust, but it carries a small backfire risk (15%) where the
// confession lands awkwardly and slightly damages the relationship.
//
// Formula:
//   trustGain = 2 + floor(social / 4)   [social 0–3: +2, 4–7: +3, 8–10: +4]
//   relationshipGain = rand(1, 3)
//   backfire chance = 15% → relationship −rand(1, 2), no trust change
function actionConfide(state, player, target) {
  // v5.8: backfire chance is rel-gated. Confiding in a near-stranger is risky;
  // confiding in someone who already likes you almost always lands. Floor 15%,
  // ceiling 35% when rel is deeply negative.
  const rel        = getRelationship(state, player.id, target.id);
  const backfireChance = Math.min(0.35, 0.15 + Math.max(0, (5 - rel)) * 0.02);
  const backfire   = Math.random() < backfireChance;
  const trustGain  = 2 + Math.floor(player.social / 4);

  if (backfire) {
    adjustRelationship(state, player.id, target.id, -rand(1, 2));
    // Cold confides (low rel) read differently — less "fell flat", more
    // "you misjudged the room". Pick from a wider pool when rel is low.
    const coldConfide = rel < 3;
    return { feedback: pickFrom(coldConfide ? [
      `You opened up to ${target.name} before you really knew them. They listened politely, but you could tell it was too much, too soon.`,
      `${target.name} barely knew you. When you started sharing something personal, you watched their face go careful. You'd misjudged the moment.`,
      `You said more to ${target.name} than you'd meant to. By the time you finished, the silence felt heavy in a way you hadn't planned for.`,
    ] : [
      `You opened up to ${target.name}, but the moment fell flat. They seemed uncomfortable. It didn't land the way you hoped.`,
      `You shared something personal with ${target.name}. They were polite, but there was an awkward pause after. You wished you hadn't said it.`,
      `${target.name} smiled in the right places, but their eyes told a different story. You felt the distance between you grow a little.`,
    ]), hint: null };
  }

  adjustTrust(state, player.id, target.id, trustGain);
  adjustRelationship(state, player.id, target.id, rand(1, 3));

  // Genuine vulnerability undercuts idol suspicion — someone who opens up about
  // their life back home doesn't read like someone playing idol games. Drop
  // the target's idol suspicion of the player by 1 (or 2 on a deep connection).
  adjustIdolSuspicion(state, target.id, player.id, trustGain >= 4 ? -2 : -1);

  // A real moment of vulnerability between allies is a meaningful bond-builder.
  strengthenSharedAlliances(state, player.id, target.id, 1);

  if (trustGain >= 4) {
    return { feedback: pickFrom([
      `You and ${target.name} sat by the water for a long time. You told them something real. They did too. You felt a genuine shift.`,
      `Something clicked between you and ${target.name}. You opened up, they opened up. This feels like the start of a real connection.`,
    ]), hint: null };
  }

  return { feedback: pickFrom([
    `You let ${target.name} in a little. They appreciated it. A quiet but meaningful exchange.`,
    `You shared something with ${target.name} you hadn't told the others. They were attentive. Something changed between you.`,
  ]), hint: null };
}

// LOBBY (PUSH A VOTE) — pitch a target to another tribemate (v5.4 deepened).
//
// "target" is the person you're steering attention toward. The engine picks a
// listener intelligently rather than at random — preferring someone who
// isn't tightly bonded with the target AND has decent rapport with the
// player, then randomizing among the top three so behavior isn't fully
// deterministic. If there's no available listener (tribe too small), the
// action fizzles harmlessly.
//
// ── Three-tier outcome roll ──────────────────────────────────────────────────
//
//   persuadeChance = 0.40 + social × 0.04 + strategy × 0.02
//                  + (listenerTrust − 3) × 0.04
//                  clamped to [0.10, 0.85]
//
//   roll < persuadeChance:                  PERSUADED
//     • target suspicion +(2 + strategy/4)
//     • listener-target rel −rand(1, 2)     (you planted real doubt)
//     • player+listener trust +1, rel +1    (shared confidence builds rapport)
//
//   roll < persuadeChance + 0.30:            HEARD
//     • target suspicion +(1 + strategy/6)  (smaller bump than persuaded)
//     • no rel/trust change                 (listener stayed neutral)
//
//   else:                                    BACKFIRED
//     • player+listener trust −1, rel −1
//     • player suspicion +1                 (campaigning came across as scheming)
//     • target suspicion unchanged          (the pitch didn't land at all)
//
// Listener trust gates the persuade chance because the pitch is fundamentally
// trust-mediated: someone who barely knows you is harder to convince of
// anything sensitive. Strategy stat helps slightly (you frame it well);
// social skill matters more (you read them well).
function actionLobby(state, player, tribemates, target) {
  const eligible = tribemates.filter(m => m.id !== target.id);
  if (eligible.length === 0) {
    return {
      feedback: `With so few of you left, pitching against ${target.name} openly felt too risky. You held back.`,
      hint: null,
    };
  }

  // Smart listener selection. Favor:
  //   • Listeners who AREN'T closely bonded with the target (rel < 10),
  //     since target's allies are unlikely to entertain a flip.
  //   • Listeners the player has rapport with (rel + trust score).
  // Pick randomly from the top 3 by rapport so behavior is varied.
  const filtered = eligible.filter(m =>
    getRelationship(state, m.id, target.id) < 10
  );
  const candidatePool = filtered.length > 0 ? filtered : eligible;
  const ranked = [...candidatePool].sort((a, b) => {
    const aScore = getRelationship(state, player.id, a.id) + getTrust(state, player.id, a.id);
    const bScore = getRelationship(state, player.id, b.id) + getTrust(state, player.id, b.id);
    return bScore - aScore;
  });
  const topPool = ranked.slice(0, Math.min(3, ranked.length));
  const listener = pickFrom(topPool);

  // Persuade chance — see header comment for the formula.
  // v5.14: known "Strategist" role gets a small bump; known "Schemer" gets
  // a small penalty (others are wary of their pitches even when correct).
  // v5.15: "leaning" roles half-apply.
  const listenerTrust = getTrust(state, listener.id, player.id);
  const _lobbyRole       = getCampRole(state, player.id) || "";
  const _lobbyRoleCore   = _lobbyRole.replace(/^leaning:/, "");
  const _lobbyRoleScale  = _lobbyRole.startsWith("leaning:") ? 0.5 : 1.0;
  const roleBonus = _lobbyRoleScale * (
      _lobbyRoleCore === "strategist"      ?  0.05 :
      _lobbyRoleCore === "socialConnector" ?  0.03 :
      _lobbyRoleCore === "schemer"         ? -0.05 : 0
  );
  // v5.16: target's broad social standing affects how willing the listener
  // is to entertain the pitch. Pitching against the camp's well-liked
  // anchor is harder than pitching against someone with weak standing.
  // Centered on 5 → up to ±0.10 swing.
  const targetCapital = (typeof getSocialCapital === "function")
    ? getSocialCapital(state, target.id) : 5;
  const capitalShield = (targetCapital - 5) * 0.02;

  const persuadeChance = Math.max(0.10, Math.min(0.85,
    0.40 + player.social * 0.04 + player.strategy * 0.02
       + (listenerTrust - 3) * 0.04
       + roleBonus
       - capitalShield
  ));

  const roll = Math.random();

  // PERSUADED — the pitch landed. Multiple effects.
  if (roll < persuadeChance) {
    const suspicionGain = 2 + Math.floor(player.strategy / 4);
    adjustSuspicion(state, target.id, suspicionGain);

    // The listener's read on the target sours, indirectly making them more
    // likely to vote target at the next tribal (rel feeds into pickVoteTarget).
    adjustRelationship(state, listener.id, target.id, -rand(1, 2));

    // Sharing a confidence builds rapport between you and the listener.
    adjustTrust(state, player.id, listener.id, 1);
    adjustRelationship(state, player.id, listener.id, 1);

    // v5.17: persuaded pitches plant a "targeting" rumor with both the
    // pitcher and the listener as initial knowers. The rumor will spread
    // through their close contacts in the round-end pass.
    if (typeof seedRumor === "function") {
      const r = seedRumor(state, "targeting", player.id, target.id, player.id, 1.0);
      if (!r.knownBy[listener.id]) {
        r.knownBy[listener.id] = {
          confidence: 0.85, distortion: 0.05, fromId: player.id,
          learnedRound: state.round ?? 0, slantedObjectId: null,
        };
      }
    }

    return { feedback: pickFrom([
      `You pulled ${listener.name} aside and made the case against ${target.name}. They listened — really listened — and by the end, they were nodding. The seed is planted.`,
      `${listener.name} hadn't been thinking about ${target.name}. By the time you walked away, they were. Quiet, careful work.`,
      `You laid out your read on ${target.name} with ${listener.name}. They asked smart follow-up questions, then said the magic words: "Yeah. I see it now."`,
      `${listener.name} bought the pitch. They didn't say it explicitly, but the way they glanced at ${target.name} the rest of the afternoon told you everything.`,
    ]), hint: null };
  }

  // HEARD — the pitch was noted but not committed to. Small effects.
  if (roll < persuadeChance + 0.30) {
    const suspicionGain = 1 + Math.floor(player.strategy / 6);
    adjustSuspicion(state, target.id, suspicionGain);
    return { feedback: pickFrom([
      `You raised concerns about ${target.name} with ${listener.name}. They listened, polite and noncommittal. You think they noted it.`,
      `${listener.name} heard you out about ${target.name} but didn't bite. "Maybe," they said. "I'll keep my eyes open."`,
      `Your pitch about ${target.name} landed somewhere between "interesting" and "maybe." ${listener.name} didn't push back, but didn't agree either.`,
      `${listener.name} shrugged after you finished. "Could be," they said. The conversation moved on. You're not sure if anything actually shifted.`,
    ]), hint: null };
  }

  // BACKFIRED — the pitch made the listener wary of you, not the target.
  adjustTrust(state, player.id, listener.id, -1);
  adjustRelationship(state, player.id, listener.id, -1);
  adjustSuspicion(state, player.id, 1);
  // v5.12: the listener remembers this — the player came at them with an
  // agenda that didn't pass the smell test.
  recordSuspiciousAct(state, listener.id, player.id, "agendaPushing", 2);
  return { feedback: pickFrom([
    `You pushed ${listener.name} on ${target.name}. They pushed back. "I'm not sure I'm comfortable with this conversation," they said. You may have made yourself the target.`,
    `${listener.name} listened to your pitch, then said something polite that meant "I don't trust this." They walked away. The conversation didn't help you.`,
    `Your campaigning against ${target.name} landed wrong with ${listener.name}. You could see them recalibrating their read on YOU rather than the person you were pitching against.`,
    `${listener.name} cut you off mid-sentence. "I think I'm gonna stay out of this one," they said. The way they said it told you they'd be remembering this conversation.`,
  ]), hint: null };
}

// LAY LOW — suspicion reducer. Safe but passive.
//
// You spend the day being visibly unthreatening — present, pleasant, and
// quiet. No scheming. This dispels suspicion more reliably than any other
// action and also earns a small relationship bump with a random tribemate
// (you seemed approachable and easy to be around).
//
// Formula:
//   player suspicion −rand(1, 2), clamped at 0
//   one random tribemate relationship +1
function actionLayLow(state, player, tribemates) {
  adjustSuspicion(state, player.id, -rand(1, 2));

  if (tribemates.length > 0) {
    const witness = pickFrom(tribemates);
    adjustRelationship(state, player.id, witness.id, 1);

    // Visibly mundane behaviour eases idol suspicion — that one tribemate's
    // mental picture of the player as "schemer" softens by a notch.
    adjustIdolSuspicion(state, witness.id, player.id, -1);
  }

  return { feedback: pickFrom([
    `You kept to yourself today. No scheming, no drama. Sometimes disappearing from the radar is the right call.`,
    `You stayed visible but quiet — near the fire, helping where needed, not overstepping. You felt the pressure ease.`,
    `You let the others do the talking today. You listened, smiled at the right moments, and faded into the background. Safer here.`,
    `You spent the afternoon just being a normal tribemate. No moves. Sometimes not making a move is the move.`,
    `You stayed where people could see you, said little, and let the day pass. By evening you could feel the heat coming off you.`,
    `You napped in the shade, helped with dinner, didn't push. A boring day on purpose — exactly what you needed.`,
  ]), hint: null };
}

// v5.24: actionTakeWalk removed. The "Take a walk" action no longer appears
// in the player menu. Self-insight reads now flow through the merged
// "Read the camp" action's self-pressure / capital lines and through the
// end-of-camp recap card. Lay Low remains the dedicated suspicion-management
// action; Tend Camp and Search for Idol fill out the Island category.

// PROPOSE ALLIANCE — explicit pact-making.
//
// Forms a new 2-person alliance between player and target on success.
// Acceptance is a function of relationship, trust, and player's social skill.
// (Strategy doesn't help here — alliances form on warmth, not gamesmanship.)
//
// Acceptance chance:
//   base 20% + rel × 2.5% + trust × 4% + social × 2%, clamped to [5%, 85%]
//
// On accept: alliance formed at strength 4–8 (depending on trust/rel),
//            relationship +2, trust +1 (the commitment binds)
// On reject: trust −1 (they were uncomfortable being approached too soon)
//
// v5.4: when already in a shared alliance, this action becomes "strengthen
// the existing pact" — adjusting strength on every shared alliance the pair
// is in, with a small rel/trust bump for the renewed commitment. Same UI
// option, smart engine. Per the prompt: alliance building should feel more
// authentic than a simple toggle.
function actionProposeAlliance(state, player, target) {
  if (isInSameAlliance(state, player.id, target.id)) {
    // Strengthen mode — the pact already exists, so this is a recommitment
    // beat. Boost rel and trust modestly, and bump alliance strength on
    // every alliance both members share.
    strengthenSharedAlliances(state, player.id, target.id, 1);
    adjustRelationship(state, player.id, target.id, rand(1, 2));
    adjustTrust(state, player.id, target.id, 1);
    return { feedback: pickFrom([
      `You and ${target.name} sat down and reaffirmed the plan. No new ground covered, but the commitment landed cleaner this time. The pact feels tighter.`,
      `${target.name} appreciated that you came to them directly. You compared notes on what could go wrong and walked away with a sharper plan together.`,
      `You took a quiet moment with ${target.name} to confirm you were still on the same page. They were. Sometimes alliances need that — explicit, not assumed.`,
      `${target.name} laughed a little when you brought it up. "We're still good," they said, and meant it. The pact stayed warm because you tended to it.`,
    ]), hint: null };
  }

  const rel   = getRelationship(state, player.id, target.id);
  const trust = getTrust(state, player.id, target.id);

  const acceptChance = Math.max(0.05, Math.min(0.85,
    0.20 + rel * 0.025 + trust * 0.04 + player.social * 0.02
  ));

  if (Math.random() < acceptChance) {
    const initialStrength = 4 + Math.floor(trust / 3) + (rel >= 10 ? 1 : 0);
    const alliance = createAlliance(state, [player, target], player.id, initialStrength);
    adjustRelationship(state, player.id, target.id, 2);
    adjustTrust(state, player.id, target.id, 1);
    return {
      feedback: getAllianceAcceptedLine(alliance.name, target),
      hint: `alliance:formed:${alliance.id}`,
    };
  }

  // Rejected — small trust hit (you misread the room)
  adjustTrust(state, player.id, target.id, -1);
  return { feedback: getAllianceRejectedLine(target), hint: null };
}

// SMOOTH THINGS OVER — repair a strained relationship (v5.3, new).
//
// Distinct from "spend time" — this is the action you take when you've
// already broken something with someone and want to actively mend it.
// Effectiveness scales inversely with how bad the rift is: shallow cool-downs
// can be patched up; deep grudges require time and luck.
//
// ── Outcome paths ───────────────────────────────────────────────────────────
//
//   rel >= 0 ......... no rift to repair → gentle backfire (rel −1).
//                      Trying to "smooth over" with someone who's fine reads
//                      as overstepping and makes things slightly worse.
//
//   rel < 0 .......... three-way roll based on success chance:
//     • Real repair    rel + (rand(1,2) + floor(social/4)); +1 trust if ≥4
//     • Partial mend   rel + 1 (small step in the right direction)
//     • Backfire       rel − rand(1, 3) (the apology dredged up worse stuff)
//
// ── Success chance ──────────────────────────────────────────────────────────
//
//   base    = max(0.15, 0.75 − severity × 0.04)   // shallower rift = easier
//   social  = (player.social − 5) × 0.04           // ±20% across the range
//   final   = clamp(0.10, 0.85, base + social)
//
//   shallow rift (rel −5),  social 5 → ~55%
//   deep grudge  (rel −15), social 5 → ~15%
//   deep grudge  (rel −15), social 10 → ~35%
//
// Backfire is intentional: not every repair lands. The prompt's goal — "this
// should feel like building trust, not pressing a buff button" — applies
// doubly to repair, where the wrong words can dig the rift deeper.
function actionSmoothOver(state, player, target) {
  const rel = getRelationship(state, player.id, target.id);

  // Already-positive path: nothing to repair. The act of trying to apologize
  // when there's nothing to apologize for reads as defensive or odd.
  if (rel >= 0) {
    adjustRelationship(state, player.id, target.id, -1);
    return { feedback: pickFrom([
      `You tried to clear the air with ${target.name}, but there was nothing to clear. The conversation came across as oddly defensive — they seemed to wonder what you were trying to fix.`,
      `You opened with an apology to ${target.name}. They looked confused. "It's fine," they said. "Everything's fine." It wasn't, after that.`,
      `${target.name} smiled politely while you tried to smooth something they hadn't even noticed. "Sure, no problem," they said. The "problem" was now you bringing it up.`,
    ]), hint: null };
  }

  // Repair path. Severity drives the floor of the success chance; social
  // skill modulates by ±20%; the dice handle the rest.
  const severity = Math.abs(rel);
  const baseChance   = Math.max(0.15, 0.75 - severity * 0.04);
  const socialMod    = (player.social - 5) * 0.04;
  const successChance = Math.max(0.10, Math.min(0.85, baseChance + socialMod));

  const roll = Math.random();

  // Real repair — they heard you, the air actually cleared.
  if (roll < successChance) {
    const gain = rand(1, 2) + Math.floor(player.social / 4);
    adjustRelationship(state, player.id, target.id, gain);
    if (gain >= 4) adjustTrust(state, player.id, target.id, 1);
    return { feedback: pickFrom([
      `You sat down with ${target.name} and named the tension instead of pretending it wasn't there. They listened. By the end, you'd both said things you'd been holding back. Something shifted.`,
      `${target.name} was guarded at first. You didn't push — just stayed honest. After a while their shoulders dropped. "Yeah. Okay," they said. The conversation kept going from there.`,
      `You apologized for what you actually did, not what they thought you did. ${target.name} noticed the difference. The walls didn't drop entirely, but they cracked.`,
      `It was a hard talk. ${target.name} called you on a few things. You owned them. By the end, you weren't best friends — but you were back to talking like adults.`,
    ]), hint: null };
  }

  // Partial mend — they didn't fully accept it, but it's not worse.
  // Wide window after the success roll so genuine backfires stay rare.
  if (roll < successChance + 0.30) {
    adjustRelationship(state, player.id, target.id, 1);
    return { feedback: pickFrom([
      `${target.name} heard you out. They didn't fully accept the apology, but they didn't dismiss it either. Small step.`,
      `The conversation with ${target.name} was awkward. Some of what you said landed. Some of it didn't. You're not back to normal — but you're not worse, either.`,
      `${target.name} thanked you for the effort, then changed the subject. You couldn't tell if they meant it. Probably halfway.`,
    ]), hint: null };
  }

  // Backfire — apology dredged up something worse, or landed wrong.
  const loss = rand(1, 3);
  adjustRelationship(state, player.id, target.id, -loss);
  return { feedback: pickFrom([
    `You tried to smooth things over with ${target.name}. They weren't ready to hear it. The conversation surfaced things you didn't even know they were upset about.`,
    `${target.name} cut you off mid-sentence. "You don't get to decide we're fine," they said. You backed off, but the damage stuck.`,
    `You apologized. ${target.name} didn't accept it — and now the rift was something they'd named out loud. That made it harder to let go.`,
    `${target.name} listened, then walked away mid-sentence. You stood there alone, replaying everything you'd just said. None of it had landed right.`,
  ]), hint: null };
}

// CHECK IN AFTER CONFLICT — recent-rift repair (v5.12, new).
//
// Distinct from Smooth Things Over (which targets ambient strain in any
// rel < 0 relationship). This action specifically addresses a RECENT,
// SPECIFIC friction: a bad conversation, a caught lie, an exposed agenda
// push, an idol-search the target witnessed. The engine looks at:
//
//   • state.lastConflicts[player][target]            (within 2 rounds)
//   • state.suspicionMemory[target][player]          (their memory of you)
//   • current rel and trust between you
//
// to determine how much there IS to repair, and how likely the attempt is
// to land. Repair is bounded — you can recover most of the rel hit and
// soften the suspicion memory, but you can't erase a conflict that just
// happened.
//
// ── Outcomes ───────────────────────────────────────────────────────────────
//
//   "received"  : repair lands. Rel +rand(2,4), trust +1, suspicionMemory −2.
//                 Conflict marker cleared.
//   "partial"   : they hear you out but don't fully forgive. Rel +1,
//                 suspicionMemory −1. Conflict NOT cleared.
//   "awkward"   : neutral. No mechanical change beyond a tiny rel +1 (the
//                 attempt itself signals you care).
//   "reopened"  : the check-in reminded them why they were upset. Rel −1,
//                 suspicionMemory +1, conflict marker re-stamped.
//
// Rate-limited: one check-in per pair per round. Repeating against the same
// target in the same round always returns the awkward branch.
//
// Outcome odds are shaped by:
//   • player.social        (smooth players land repair more reliably)
//   • severity of conflict (small rifts heal easier than deep ones)
//   • target.suspicionMemory of player (heavy memory resists repair)
//   • current rel          (warm baselines forgive faster)
function actionCheckIn(state, player, target) {
  // Rate limit: one per pair per round.
  const round = state.round ?? 0;
  if (state.checkInsThisRound?.[player.id]?.[target.id] === round) {
    return { feedback: pickFrom([
      `You'd already had this conversation with ${target.name} today. Going back to it now would only make things worse.`,
      `You'd already pulled ${target.name} aside earlier. Pressing again would feel desperate.`,
    ]), hint: null };
  }
  if (!state.checkInsThisRound[player.id]) state.checkInsThisRound[player.id] = {};
  state.checkInsThisRound[player.id][target.id] = round;

  const conflict = getRecentConflict(state, player.id, target.id);
  const memory   = getSuspicionMemory(state, target.id, player.id);
  const rel      = getRelationship(state, player.id, target.id);
  const trust    = getTrust(state, player.id, target.id);

  // No real conflict, no memory — there's nothing to repair, and bringing it
  // up just makes the conversation strange.
  if (!conflict && memory < 1.5 && rel >= 0) {
    return { feedback: pickFrom([
      `You went looking for ${target.name} to clear the air. They blinked at you. "We're good, aren't we?" You couldn't think of how to answer.`,
      `You tried to check in with ${target.name} after... whatever you'd been worried about. The conversation never quite found its shape.`,
      `${target.name} seemed surprised that you'd pulled them aside. "Did something happen?" they asked. You weren't sure how to say no without making it weirder.`,
    ]), hint: null };
  }

  // Compute a landing score.
  // Higher score = more likely to land cleanly.
  const severity   = conflict ? conflict.severity : Math.max(1, memory);
  const ageBonus   = conflict ? Math.min(2, conflict.age) : 0;   // older rifts a bit easier
  const score =
      (player.social ?? 5) * 0.35
    + Math.max(0, rel) * 0.10
    + (trust - 3) * 0.30
    + ageBonus
    - severity * 0.50
    - memory * 0.40
    + (Math.random() - 0.5) * 2;        // jitter

  // Resolve outcome.
  let outcome;
  if (score >= 3.5)  outcome = "received";
  else if (score >= 1.5) outcome = "partial";
  else if (score >= -0.5) outcome = "awkward";
  else outcome = "reopened";

  // Apply effects per outcome.
  switch (outcome) {
    case "received": {
      adjustRelationship(state, player.id, target.id, rand(2, 4));
      adjustTrust(state, player.id, target.id, 1);
      adjustSuspicionMemory(state, target.id, player.id, -2);
      clearConflict(state, player.id, target.id);
      return { feedback: pickFrom([
        `You found ${target.name} alone and told them what was on your mind. They softened — really softened — and said the words you needed to hear: "We're good."`,
        `You named the friction with ${target.name} out loud. Instead of getting defensive, they exhaled. "I'd been carrying that too," they said. The air cleared.`,
        `${target.name} listened as you owned your part. When you were done, they reached out and squeezed your shoulder. "Thank you for saying it. We're fine."`,
        `You sat down with ${target.name} and didn't talk strategy at all. Just the day, the wind, the fire. By the end, the thing between you wasn't a thing anymore.`,
        `${target.name} cut you off halfway through your apology. "It's okay. I get it. We're good." It was that simple, in the end.`,
      ]), hint: null };
    }
    case "partial": {
      adjustRelationship(state, player.id, target.id, 1);
      adjustSuspicionMemory(state, target.id, player.id, -1);
      // Conflict marker stays — they need more time.
      return { feedback: pickFrom([
        `You laid it out for ${target.name}. They listened, nodded, said the right things — but you could tell some of it was still there. Not gone. Just quieter.`,
        `${target.name} heard you out. "I appreciate you saying that," they said. The smile didn't quite reach their eyes. Progress, but not full repair.`,
        `You apologized as best you could. ${target.name} accepted it, but the conversation ended early. You'd done some of the work. Not all of it.`,
      ]), hint: null };
    }
    case "awkward": {
      adjustRelationship(state, player.id, target.id, 1);
      return { feedback: pickFrom([
        `You tried to check in with ${target.name}, but neither of you knew quite where to start. The conversation drifted into camp logistics. At least the effort was there.`,
        `${target.name} let you talk. They didn't engage much — just nodded in the right places. You weren't sure if you'd helped or just gone through the motions.`,
        `You'd meant to say something specific, but it came out generic. ${target.name} accepted the gesture without really hearing it. Not a loss. Not really a win either.`,
      ]), hint: null };
    }
    case "reopened":
    default: {
      adjustRelationship(state, player.id, target.id, -1);
      adjustSuspicionMemory(state, target.id, player.id, +1);
      // Re-stamp conflict so the next attempt knows it's still hot.
      if (!state.lastConflicts[player.id]) state.lastConflicts[player.id] = {};
      if (!state.lastConflicts[target.id]) state.lastConflicts[target.id] = {};
      const entry = { round, severity: severity + 1, kind: "reopened" };
      state.lastConflicts[player.id][target.id] = entry;
      state.lastConflicts[target.id][player.id] = entry;
      return { feedback: pickFrom([
        `Bringing it up with ${target.name} only reminded them why they'd been upset. Their face hardened halfway through your sentence. You should have left it alone.`,
        `${target.name} listened, but you could see the moment it landed wrong. "I wasn't even thinking about that until you brought it up," they said. The room got smaller.`,
        `You tried to clear the air with ${target.name}. By the end of the conversation, the air felt thicker than before.`,
      ]), hint: null };
    }
  }
}

// OBSERVE THE CAMP — read social dynamics without participating (v5.3, new).
//
// Generates one or two flavor-text observations about the current state of
// the tribe — close pairs, tense pairs, isolated players, suspicion targets.
// Doesn't mutate state significantly: this is the "step back and watch"
// action, the social equivalent of laying low.
//
// Observations are sourced from the actual relationship/suspicion graph, so
// they reflect reality. The player's social skill gates volume:
//   • social >= 7 → 2 observations
//   • social <  7 → 1 observation
//
// If nothing in the tribe stands out (everyone's middling), a generic "quiet
// day at camp" observation surfaces so the action never reads as broken.
//
// Future v5.x can extend this with: alliance suspicion ("X and Y were
// whispering"), idol-suspicion hints, or post-swap "old loyalties" callouts.
function actionObserveCamp(state, player, tribemates) {
  if (tribemates.length === 0) {
    return { feedback: "There was no one around to observe today.", hint: null };
  }

  // Build candidate observations. Each has a weight (used to prefer more
  // dramatic dynamics) and a text (one of several variants chosen at build).
  const candidates = [];

  // 1. Close pairs — strong mutual rel between two non-player tribemates.
  // v5.11: also picks up mid-strength pairs as suggestive ("growing close")
  // so the player has earlier read on forming bonds, not just locked-in ones.
  for (let i = 0; i < tribemates.length; i++) {
    for (let j = i + 1; j < tribemates.length; j++) {
      const a = tribemates[i];
      const b = tribemates[j];
      const rel = getRelationship(state, a.id, b.id);
      if (rel >= 12) {
        candidates.push({
          weight: rel,
          text: pickFrom([
            `You noticed ${a.name} and ${b.name} have been spending a lot of time together. Whatever they've got, it's real.`,
            `${a.name} and ${b.name} keep gravitating toward each other at camp. Something is forming there.`,
            `Watching the camp, you saw ${a.name} and ${b.name} pull away to talk in private — twice. They're tighter than they're letting on.`,
          ]),
        });
      } else if (rel >= 6) {
        // v5.11: hedged mid-tier — player can pick up the early shape of a bond.
        candidates.push({
          weight: rel * 0.6,
          text: pickFrom([
            `${a.name} and ${b.name} seem to be growing close. Hard to say how serious it is yet.`,
            `You caught ${a.name} and ${b.name} sharing a quiet laugh by the fire. Something's there — maybe.`,
            `${a.name} and ${b.name} have been finding excuses to end up next to each other. You'd bet on a bond forming.`,
          ]),
        });
      }
    }
  }

  // 2. Tense pairs — strong mutual hostility between two non-player tribemates.
  // v5.11: mid-tier friction is also surfaced, hedged.
  for (let i = 0; i < tribemates.length; i++) {
    for (let j = i + 1; j < tribemates.length; j++) {
      const a = tribemates[i];
      const b = tribemates[j];
      const rel = getRelationship(state, a.id, b.id);
      if (rel <= -10) {
        candidates.push({
          weight: Math.abs(rel),
          text: pickFrom([
            `There's clear tension between ${a.name} and ${b.name}. They barely speak.`,
            `You watched ${a.name} and ${b.name} avoid each other across camp. Something happened — and it didn't get resolved.`,
            `${a.name} and ${b.name} have a problem with each other. It's not loud, but it's there.`,
          ]),
        });
      } else if (rel <= -5) {
        candidates.push({
          weight: Math.abs(rel) * 0.6,
          text: pickFrom([
            `${a.name} and ${b.name} seemed a little off with each other today. Not loud — just cool.`,
            `You picked up a small chill between ${a.name} and ${b.name}. Maybe nothing, maybe something.`,
            `${a.name} kept finding ways to not be where ${b.name} was. Could be coincidence; probably isn't.`,
          ]),
        });
      }
    }
  }

  // v5.11 (new): quiet campaigners — tribemates who've been lobbying or
  // planting suggestions. Modeled as suspicion ≥ 3 AND at least one hostile
  // read against another tribemate. Hedged — the player isn't catching them
  // mid-pitch, just sensing the campaign's shape.
  for (const c of tribemates) {
    const susp = c.suspicion ?? 0;
    if (susp < 3 || susp >= 5) continue;   // ≥5 handled below as "on edge"
    // Look for a target this person has cooled on — that's who they're whispering about.
    const otherTribemates = tribemates.filter(o => o.id !== c.id);
    let coldest = null, coldestRel = Infinity;
    for (const o of otherTribemates) {
      const r = getRelationship(state, c.id, o.id);
      if (r < coldestRel) { coldestRel = r; coldest = o; }
    }
    if (coldest && coldestRel <= -3) {
      candidates.push({
        weight: 3 + susp,
        text: pickFrom([
          `${c.name} has been pulling people aside more than usual. You'd guess they're working an angle on ${coldest.name}.`,
          `Something about ${c.name}'s pacing today felt deliberate. You think they might be quietly campaigning — ${coldest.name} would be the read.`,
          `${c.name} kept their voice low whenever ${coldest.name} was around. They may be planting seeds.`,
        ]),
      });
    }
  }

  // 3. High-suspicion individuals — the camp is watching them.
  for (const c of tribemates) {
    const susp = c.suspicion ?? 0;
    if (susp >= 5) {
      candidates.push({
        weight: susp,
        text: pickFrom([
          `${c.name} seems on edge. Others have been keeping their distance.`,
          `${c.name} has been drawing nervous glances from around the camp. You're not the only one watching them.`,
          `You realized people stop talking when ${c.name} walks up. They're being read as a problem.`,
        ]),
      });
    }
  }

  // 4. Isolated members — low average rel with the rest of the tribe.
  for (const c of tribemates) {
    const others = tribemates.filter(o => o.id !== c.id);
    if (others.length === 0) continue;
    let total = 0;
    for (const o of others) total += getRelationship(state, c.id, o.id);
    const avg = total / others.length;
    if (avg < -3) {
      candidates.push({
        weight: Math.abs(avg) * 2,
        text: pickFrom([
          `${c.name} seems disconnected from the rest. Wherever they go, the conversations fade.`,
          `You realized ${c.name} hasn't been part of any of the camp's natural circles. They're alone in a crowd.`,
          `${c.name} eats by themselves more often than not. The tribe has quietly written them off.`,
        ]),
      });
    }
  }

  // Fallback — nothing notable surfaced. Make sure the action always returns
  // something; the absence of drama IS information.
  if (candidates.length === 0) {
    candidates.push({
      weight: 1,
      text: pickFrom([
        "You watched the camp without doing much yourself. Nothing stood out — yet. Sometimes the absence of drama is its own data.",
        "The afternoon was quiet. People moved around their routines. No one made a move worth noting today.",
        "You took a long look around. Everyone was being civil. Civil isn't always honest, but it isn't loud either.",
        "You spent the afternoon listening more than talking. The camp had no obvious cracks — at least not ones anyone was showing.",
        "You sat back and watched the rhythms of camp. Everyone was being careful. Too careful, maybe — but no one slipped today.",
        "The day passed without a clear headline. People held their cards close. You filed away the steadiness as its own kind of warning.",
      ]),
    });
  }

  // Pick observations. Higher social = more visibility into the dynamics.
  const count = player.social >= 7 ? 2 : 1;

  // Shuffle then take the first N. Random rather than weighted-top so the
  // same dynamics don't always read as the only headline.
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const picked   = shuffled.slice(0, count);

  return {
    feedback: picked.map(c => c.text).join(" "),
    hint:     null,
  };
}

// READ THE ROOM — broad camp mood and tempo read (v5.11, new).
//
// Distinct from "Observe the camp" — that action surfaces concrete pair
// dynamics (X and Y are close, A and B are tense). This action surfaces the
// FEEL of the camp at a higher altitude: how cohesive things are, how much
// scheming energy is in the air, who's been campaigning quietly, who looks
// anxious.
//
// Outputs are intentionally hedged ("seems", "appears", "you'd guess") and
// quality scales with three signals:
//
//   • player.social — clearer reads (more lines, less noise) at higher social
//   • chaos level   — average tribe suspicion + presence of strained alliances;
//                     higher chaos noisier (player picks up the wrong thing more
//                     often, lines lean less specific)
//   • how obvious   — strong dynamics dominate weak ones; subtle ones can
//                     remain unread even at high social
//
// Doesn't mutate game state — pure information.
// v5.17: render a rumor as a player-facing read line. Confidence shapes the
// hedging: high → "you've heard"; mid → "people have been suggesting"; low
// → "there's been a whisper, half-formed". Distortion warps the language
// further. Doesn't expose raw numbers — purely flavor.
function _buildRumorReadLine(state, player, heard) {
  const r = heard.rumor;
  const k = heard.knowledge;
  const conf = k.confidence;
  const dist = k.distortion;

  const subject = (typeof findContestant === "function") ? findContestant(state, r.subjectId) : null;
  if (!subject) return null;
  const objectId = k.slantedObjectId ?? r.objectId;
  const object   = objectId ? findContestant(state, objectId) : null;

  // Don't surface rumors where the player is the subject — that would read
  // as "you've heard you are scheming about X", which is incoherent.
  if (subject.id === player.id) return null;

  const hedge =
      conf >= 0.7 ? "You've been hearing"
    : conf >= 0.4 ? "There's been talk that"
    :               "Someone whispered, half-believed, that";

  const tail = dist >= 0.5 ? " — though the version you heard felt secondhand at best." : "";

  switch (r.kind) {
    case "targeting":
      if (!object) return null;
      return `${hedge} ${subject.name} has been working an angle against ${object.name}.${tail}`;
    case "suspicious":
      return `${hedge} ${subject.name} has been moving around camp in ways that don't quite add up.${tail}`;
    case "alliance":
      if (!object) return null;
      return `${hedge} ${subject.name} and ${object.name} may have something locked in between them.${tail}`;
    case "closeness":
      if (!object) return null;
      return `${hedge} ${subject.name} and ${object.name} have been a lot tighter than they're letting on.${tail}`;
    default:
      return null;
  }
}

function actionReadRoom(state, player, tribemates) {
  if (tribemates.length === 0) {
    return { feedback: "There was no one around camp to get a read on.", hint: null };
  }

  // ── Compute camp-level signals ────────────────────────────────────────────
  // Average pairwise relationship across non-player tribemates → cohesion.
  let pairCount = 0;
  let relSum    = 0;
  let strongBonds = 0;
  let strongRifts = 0;
  for (let i = 0; i < tribemates.length; i++) {
    for (let j = i + 1; j < tribemates.length; j++) {
      const r = getRelationship(state, tribemates[i].id, tribemates[j].id);
      relSum += r;
      pairCount++;
      if (r >=  10) strongBonds++;
      if (r <=  -7) strongRifts++;
    }
  }
  const avgRel = pairCount > 0 ? relSum / pairCount : 0;

  // Chaos: average suspicion plus a kicker for strained alliances. The more
  // chaotic the camp, the noisier the reads — high social can compensate.
  const avgSusp = tribemates.reduce((s, c) => s + (c.suspicion ?? 0), 0)
                / Math.max(1, tribemates.length);
  const fracturedAlliances = (state.alliances || [])
    .filter(a => !a.dissolved && (a.strength ?? 5) < 4).length;
  const chaos = avgSusp + fracturedAlliances * 0.5;

  // Active campaigner — the loudest individual scheme energy in the camp.
  let topCampaigner = null, topCampaignSusp = 0;
  for (const c of tribemates) {
    const s = c.suspicion ?? 0;
    if (s > topCampaignSusp) { topCampaignSusp = s; topCampaigner = c; }
  }

  // Most isolated — single-person isolation read at the camp level.
  let mostIsolated = null, isolationScore = -Infinity;
  for (const c of tribemates) {
    const others = tribemates.filter(o => o.id !== c.id);
    if (others.length === 0) continue;
    let total = 0;
    for (const o of others) total += getRelationship(state, c.id, o.id);
    const avg = total / others.length;
    const isoScore = -avg;
    if (isoScore > isolationScore) { isolationScore = isoScore; mostIsolated = c; }
  }

  // ── Build hedged candidate lines ──────────────────────────────────────────
  const candidates = [];

  // 1. Tribe-cohesion vibe.
  if (avgRel >= 5) {
    candidates.push({ weight: 3 + avgRel * 0.2, text: pickFrom([
      `Camp felt warm today. People are getting along — maybe more than they should be.`,
      `The mood around camp seems easy. Everyone's on speaking terms. That itself is information — nobody's playing hard yet.`,
      `There's a kind of comfort in the air. The tribe is bonding. The cracks haven't shown up yet.`,
    ])});
  } else if (avgRel <= -3) {
    candidates.push({ weight: 3 + Math.abs(avgRel) * 0.3, text: pickFrom([
      `The whole camp feels off today. People are short with each other. Something is going to break soon.`,
      `You could feel the tension in the air — small silences, half-finished sentences. The tribe is fraying.`,
      `Nobody's quite trusting anyone today. The camp has gone quiet in a way that isn't peaceful.`,
    ])});
  } else {
    candidates.push({ weight: 2, text: pickFrom([
      `The camp feels neutral. Not warm, not cold. Everyone is being careful.`,
      `It's a held-breath kind of day. People are reading each other and waiting.`,
      `You couldn't quite get a temperature on the camp. Maybe that's the temperature.`,
    ])});
  }

  // 2. Scheming energy.
  if (avgSusp >= 4) {
    candidates.push({ weight: 4 + avgSusp, text: pickFrom([
      `There's a lot of scheming energy in the air. People are pulling each other aside. Something is being built — or unbuilt.`,
      `The camp feels like it's mid-conversation with itself. Lots of small whispered exchanges, lots of glances.`,
      `You can feel the gears turning. Multiple people seem to be working on multiple things.`,
    ])});
  } else if (avgSusp <= 1.5) {
    candidates.push({ weight: 2, text: pickFrom([
      `Things feel calm — almost suspiciously so. Either nobody is making a move, or somebody's hiding it well.`,
      `Today felt like a rest day for the game. Nobody was visibly working.`,
    ])});
  }

  // 3. Quiet campaigner (hedged).
  if (topCampaigner && topCampaignSusp >= 3) {
    candidates.push({ weight: 3 + topCampaignSusp, text: pickFrom([
      `${topCampaigner.name} appears to be campaigning quietly. You can't tell who their target is — but they're working.`,
      `You'd guess ${topCampaigner.name} has been pitching something. They've been visible in pairs more than groups.`,
      `${topCampaigner.name}'s movement around camp looks deliberate. Probably planting seeds. Probably.`,
    ])});
  }

  // 4. Isolated player.
  if (mostIsolated && isolationScore >= 3) {
    candidates.push({ weight: 2 + isolationScore * 0.4, text: pickFrom([
      `${mostIsolated.name} seems isolated today. The conversations don't quite include them.`,
      `You'd say ${mostIsolated.name} is on the outside of every circle right now — at least the visible ones.`,
      `${mostIsolated.name} has been on the edges of camp life. Whether by choice or by drift, they're alone in the crowd.`,
    ])});
  }

  // 5. Forming-bonds count signal — how much pair-energy is locking in.
  if (strongBonds >= 2) {
    candidates.push({ weight: 3 + strongBonds, text: pickFrom([
      `It looks like a few real bonds have formed already. The pre-aligned have started to find each other.`,
      `You'd say at least a couple of pairs are locked in. The shape of the early game is settling.`,
    ])});
  }
  if (strongRifts >= 2) {
    candidates.push({ weight: 3 + strongRifts, text: pickFrom([
      `There are multiple grudges simmering at once. Whoever can ride the right one will own the next vote.`,
      `The camp has more than one open feud beneath the surface. You can feel the lines being drawn.`,
    ])});
  }

  // v5.19: post-merge specific reads. The shape of the camp is different
  // once tribes merge — old lines are softening, new partnerships are
  // forming, and resumes start to matter. These lines surface only when
  // state.merged is true and the merge has had at least one round to settle.
  if (state.merged) {
    candidates.push({ weight: 2.5, text: pickFrom([
      `The old tribe lines are still there, but you can feel them softening. People are testing new conversations.`,
      `It doesn't feel like two tribes anymore — it feels like ten people each running their own game. Different math.`,
      `The merged camp is louder than the tribe camp ever was. Everyone is talking to everyone. Most of it isn't accidental.`,
    ])});

    // Cross-original-tribe pair forming — surfaces if any non-allied pair
    // crosses originalTribe lines and has rel ≥ 8 (a meaningful new bond).
    if (state.swapped || tribemates.some(c => c.originalTribe)) {
      for (let i = 0; i < tribemates.length && candidates.length < 12; i++) {
        for (let j = i + 1; j < tribemates.length; j++) {
          const a = tribemates[i], b = tribemates[j];
          if (!a.originalTribe || !b.originalTribe) continue;
          if (a.originalTribe === b.originalTribe) continue;
          const rel = getRelationship(state, a.id, b.id);
          if (rel >= 8) {
            candidates.push({ weight: 3, text: pickFrom([
              `${a.name} and ${b.name} have been spending real time together. The old tribe line between them isn't holding anymore.`,
              `You'd never have predicted ${a.name} and ${b.name} on the same side. The merge has rewritten more than the camp roster.`,
            ])});
            break;
          }
        }
      }
    }

    // Jury-aware: once the jury has formed, surface a flavor line about
    // people watching their own behavior more carefully.
    const juryStarted = (state.jury?.length ?? 0) >= 1;
    if (juryStarted) {
      candidates.push({ weight: 2.5, text: pickFrom([
        `You can feel the jury in the air. People are saying less, choosing words more carefully. Everyone's playing for two audiences now.`,
        `The conversations have a layered quality post-jury — people aren't just talking to each other, they're talking through each other to the people on the bench.`,
        `Nobody's burning bridges loudly anymore. You can see them counting future jurors in their head as they speak.`,
      ])});
    }

    // Late-game resume awareness: small remaining count.
    const remaining = (state.tribes?.merged || []).length;
    if (remaining <= 7) {
      candidates.push({ weight: 3, text: pickFrom([
        `The conversations got sharper today. Everyone's running the math on who they could beat — and who they couldn't.`,
        `You felt the room start to look at people for who'd win, not who'd vote with them. The endgame is in the air.`,
        `Resumes are being weighed today, even if nobody's saying so out loud. The strongest games are starting to feel heavier.`,
      ])});
    }
  }

  // v5.18: scramble + pressure self-read. Phase 2 only.
  // Surface (a) tribemates visibly scrambling, (b) the consensus emerging,
  // (c) names that have faded from the conversation. Each is a hedged
  // social read, not a numeric leak.
  if (state.campPhase === 2 && typeof getPressureRanking === "function") {
    const pool = state.merged
      ? (state.tribes?.merged || [])
      : (state.tribes?.[player.tribe] || []);
    const ranked = getPressureRanking(state, pool);

    // Scrambler flavor — name AI tribemates visibly working too hard.
    const scramblers = pool.filter(c =>
      c.id !== player.id && typeof isScrambling === "function" && isScrambling(state, c.id)
    );
    if (scramblers.length > 0) {
      const named = scramblers[Math.floor(Math.random() * scramblers.length)];
      candidates.push({ weight: 5, text: pickFrom([
        `${named.name} has been working harder than usual today — pulling people aside, talking fast. Whatever they've sensed, they're reacting to it.`,
        `You watched ${named.name} make the rounds three different ways. They're scrambling. The shape of their day told you their name has been said.`,
        `${named.name} hasn't slowed down since lunch. Conversation, conversation, conversation. Someone working that hard is usually working from behind.`,
      ])});
    }

    // Consensus emerging — top-pressure AI (not the player).
    const topNonPlayer = ranked.find(r =>
      r.contestant.id !== player.id && r.pressure >= 6.5
    );
    if (topNonPlayer) {
      candidates.push({ weight: 4, text: pickFrom([
        `${topNonPlayer.contestant.name}'s name has been in the air all day. The room is tilting their way.`,
        `If you had to guess where the vote is heading, you'd say ${topNonPlayer.contestant.name} — and you wouldn't be the only one.`,
        `The conversations you couldn't quite hear seemed to circle ${topNonPlayer.contestant.name}. The consensus is forming.`,
      ])});
    }

    // Player-self pressure read.
    const playerPressure = getPressureScore(state, player.id);
    if (playerPressure >= 6.5) {
      candidates.push({ weight: 6, text: pickFrom([
        `Multiple conversations went quiet when you walked up today. Your name is being said in rooms you aren't in.`,
        `You felt the difference in how the camp talked to you. Polite, careful, contained. You're in the conversation — as a target, not a partner.`,
        `The energy around you today wasn't right. Eye contact held a beat too long, then released. You're being measured.`,
      ])});
    } else if (playerPressure <= 3.5 && state.tribalTribe) {
      candidates.push({ weight: 3, text: pickFrom([
        `Your name doesn't seem to be in the conversation today. You'd say you've drifted off the radar — which, tonight, is exactly where you want to be.`,
        `The room moved past you. Not coldly — past. Whatever heat is here, it isn't on you. Yet.`,
      ])});
    }
  }

  // v5.17: surface a rumor the player has actually picked up. Reads as a
  // hedged "you've been hearing" line — language scales to the player's
  // confidence in the rumor, so a high-confidence whisper sounds like a
  // real read while a low-confidence whisper sounds like noise. Only one
  // rumor surfaces per Read-the-Room invocation; the candidate is added
  // to the weighted pool and may or may not be selected.
  if (typeof getRumorsKnownBy === "function") {
    const heard = getRumorsKnownBy(state, player.id);
    if (heard.length > 0) {
      const pickedHeard = heard[Math.floor(Math.random() * heard.length)];
      const line = _buildRumorReadLine(state, player, pickedHeard);
      if (line) {
        candidates.push({ weight: 4 + heard.length * 0.5, text: line });
      }
    }
  }

  // v5.16: hedged self-read on the player's own social capital. Only
  // surfaces at the extremes (well above or well below baseline) so the
  // player gets useful indirect feedback without the model becoming a
  // numerical readout. Mid-range capital produces no line, intentionally.
  if (typeof getSocialCapital === "function") {
    const cap = getSocialCapital(state, player.id);
    if (cap >= 7) {
      candidates.push({ weight: 4, text: pickFrom([
        `The room reads warm toward you. People aren't actively talking about you — usually a good sign.`,
        `You'd say the tribe is broadly comfortable with you right now. Not loud allies, not enemies — just steady reads.`,
        `Whatever you've been doing, it's working. You can feel the room giving you a benefit of the doubt you haven't asked for.`,
      ])});
    } else if (cap <= 3.5) {
      candidates.push({ weight: 5, text: pickFrom([
        `You'd swear the tribe has cooled on you. Conversations don't quite include you the way they did. You're not paranoid — you're noticing.`,
        `Your stock is down with the camp. Multiple people seem to be holding something back. Whatever the read on you is, it isn't kind.`,
        `Something's shifted in how the camp talks to you. Shorter answers, fewer eye contacts. The vibe isn't on your side.`,
      ])});
    }
  }

  // ── Quality and noise ────────────────────────────────────────────────────
  // Player social shapes how many reads they get and how clean they are.
  // Chaos shapes how often a "noise" line replaces a real read.
  const social = player.social ?? 5;

  // Base count: 2 reads, +1 if social ≥ 7, −1 if social ≤ 3 but never below 1.
  let count = 2;
  if (social >= 7) count++;
  if (social <= 3) count = Math.max(1, count - 1);

  // Chaos noise: each picked line has a chance of being downgraded to a
  // generic "you couldn't quite parse" hedge. Higher chaos and lower social
  // both raise this chance. v5.15: ceiling lowered from 0.5 → 0.4 — even
  // a low-social player in a chaotic camp should usually get one real read.
  const noiseChance = Math.min(0.4, Math.max(0, (chaos - 2) * 0.10) + (5 - social) * 0.03);

  // Pick lines: weighted-random without replacement so we don't repeat.
  const pool = [...candidates];
  const lines = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * total;
    let chosenIdx = 0;
    for (let k = 0; k < pool.length; k++) {
      if ((roll -= pool[k].weight) <= 0) { chosenIdx = k; break; }
    }
    let text = pool[chosenIdx].text;
    if (Math.random() < noiseChance) {
      text = pickFrom([
        `Something was happening today, but you couldn't quite parse it. Too much movement at once.`,
        `You felt a shift in the room and couldn't put your finger on it. The signal was buried under the noise.`,
        `There was a current under everything today. Whatever it was, you didn't catch it cleanly.`,
        `Voices kept dropping right when you got close enough to hear. You came away with a feeling, not a read.`,
        `The camp was busy with itself. You'd need another day to make sense of what you were seeing.`,
        `You picked up that something mattered today. You couldn't say what — only that it did.`,
      ]);
    }
    lines.push(text);
    pool.splice(chosenIdx, 1);
  }

  if (lines.length === 0) {
    return { feedback: pickFrom([
      `You took a long beat to read the room. It read back as nothing in particular — which is itself a finding.`,
      `Nothing jumped out today. The camp was the camp. File it away.`,
    ]), hint: null };
  }

  return { feedback: lines.join(" "), hint: null };
}

// OBSERVE A PLAYER — targeted observation of one tribemate's social position
// (v5.4, new).
//
// Distinct from the broader "Observe the camp" (v5.3, Social) — this action
// focuses on a single tribemate the player picks. It scans that target's
// relationships with each OTHER tribemate and surfaces:
//   • Their strongest bond  (rel ≥ 8 with someone)
//   • Their worst grudge     (rel ≤ −5 with someone)
//
// Strategy stat gates how much of that picture the player can read:
//   strategy ≥ 6 → up to 2 observations (bond + grudge if both exist)
//   strategy <  6 → 1 observation (whichever is stronger)
//
// If neither extreme exists, a generic "playing it close to the vest" line
// is returned. Doesn't mutate game state — pure information, like its v5.3
// cousin actionObserveCamp.
function actionObservePair(state, player, tribemates, target) {
  // Defensive: target must be a real tribemate. Filter out the target itself
  // from the comparison set so we don't surface "X is close to themselves".
  const others = tribemates.filter(c => c.id !== target.id);
  if (others.length === 0) {
    return {
      feedback: `You watched ${target.name} for a while, but no one else was around to read against.`,
      hint: null,
    };
  }

  // Find target's strongest bond and worst grudge.
  let topAlly = null,    topRel    = -Infinity;
  let worstFoe = null,   worstRel  =  Infinity;
  for (const c of others) {
    const rel = getRelationship(state, target.id, c.id);
    if (rel > topRel)   { topRel   = rel; topAlly  = c; }
    if (rel < worstRel) { worstRel = rel; worstFoe = c; }
  }

  const observations = [];

  if (topAlly && topRel >= 8) {
    observations.push({
      magnitude: topRel,
      text: pickFrom([
        `${target.name} and ${topAlly.name} have been spending real time together. There's a bond there — you can see it.`,
        `Watching ${target.name}, they kept finding excuses to be near ${topAlly.name}. That tracks: those two are tight.`,
        `${target.name} lights up around ${topAlly.name}. It's not subtle once you're looking for it.`,
      ]),
    });
  } else if (topAlly && topRel >= 4) {
    // v5.11: hedged mid-tier read — a bond may be forming. Lower confidence.
    observations.push({
      magnitude: topRel,
      text: pickFrom([
        `${target.name} and ${topAlly.name} seem to enjoy each other's company. You can't tell if it's strategy or just chemistry.`,
        `You'd guess ${target.name} likes ${topAlly.name} more than the others — but it's a soft read, not a certainty.`,
        `${target.name} has been a little more relaxed when ${topAlly.name} is around. Could be the start of something.`,
      ]),
    });
  }

  if (worstFoe && worstRel <= -5) {
    observations.push({
      magnitude: Math.abs(worstRel),
      text: pickFrom([
        `${target.name} has been keeping their distance from ${worstFoe.name}. Whatever happened between them, it's not over.`,
        `You watched ${target.name} go out of their way to avoid ${worstFoe.name}. The body language said it all.`,
        `${target.name} and ${worstFoe.name} have a problem. Neither will say it out loud, but they don't pretend to like each other either.`,
      ]),
    });
  } else if (worstFoe && worstRel <= -2) {
    // v5.11: hedged mid-tier — small friction the player picks up on.
    observations.push({
      magnitude: Math.abs(worstRel),
      text: pickFrom([
        `${target.name} seemed a little cooler around ${worstFoe.name} than the rest. Hard to say how deep it goes.`,
        `You noticed a small distance between ${target.name} and ${worstFoe.name}. Not hostility — just not warmth.`,
        `${target.name} doesn't quite click with ${worstFoe.name}. It's faint, but it's there.`,
      ]),
    });
  }

  // Fallback when neither bond nor grudge is strong enough.
  if (observations.length === 0) {
    return {
      feedback: pickFrom([
        `${target.name} seems neutral with most of the tribe — no strong bonds, no obvious feuds. They're playing it close to the vest.`,
        `You watched ${target.name} for a while. They moved through the camp like everyone was equally important. Hard to read.`,
        `${target.name} hasn't given you much to work with. They're disciplined about not picking sides — at least not visibly.`,
      ]),
      hint: null,
    };
  }

  // Strategy gates how much you can piece together. Lower-strategy players
  // see the bigger of the two signals; higher-strategy sees both.
  if (player.strategy < 6) {
    // Pick the most extreme one.
    observations.sort((a, b) => b.magnitude - a.magnitude);
    return { feedback: observations[0].text, hint: null };
  }

  return {
    feedback: observations.map(o => o.text).join(" "),
    hint: null,
  };
}

// COMPARE NOTES — share strategic intel with someone (v5.4, new).
//
// Distinct from "Ask who they want out" (which targets the partner's own
// vote intent) — this action asks the partner what they've SEEN about
// THIRD parties. Returns information about the social graph (who's bonding,
// who's feuding) with accuracy gated by trust, mirroring askVote's truth tiers.
//
// ── Truth tiers (by trust between player and partner) ──────────────────────
//
//   trust 0–2: 50% chance the partner gives misleading info, otherwise
//              they hedge to the point of uselessness
//   trust 3–5: vague but honest hint about a real bond/feud
//   trust 6+:  candid, specific observation
//
// ── Always-applies side effect ───────────────────────────────────────────
//
//   trust(player, partner) +1
//   rel(player, partner)   +1
//
// Trading reads is itself a trust-building act, regardless of what the
// partner shares — you walked into camp with a piece of game and they took
// the meeting. Even when the intel is unreliable, the act of comparing
// notes builds rapport.
//
// Per the prompt: "Information should be imperfect. Some players should lie,
// dodge, or mislead." Misleading info at low trust uses real tribemate names
// to feel plausible — the partner asserts a connection that doesn't exist.
function actionCompareNotes(state, player, tribemates, partner) {
  const others = tribemates.filter(c => c.id !== partner.id);
  if (others.length === 0) {
    return {
      feedback: `${partner.name} had nothing to share — there was no one else to talk about.`,
      hint: null,
    };
  }

  // v5.10: routes through the shared mood/truth model. Mutual trust + rel
  // bump for collaborating still applies regardless of intel quality.
  adjustTrust(state, player.id, partner.id, 1);
  adjustRelationship(state, player.id, partner.id, 1);

  const ctx  = buildConversationContext(state, player, partner);
  const mood = pickConversationMood(state, player, partner, ctx);
  const band = pickTruthfulnessBand(state, player, partner, ctx);
  applyMoodEffects(state, player, partner, mood);

  const flavor = moodFlavor(mood, partner);

  // v5.17: chance the partner shares a rumor they know with the player.
  // The transfer further degrades confidence and adds a small distortion
  // step — same model the round-end spread uses, but inline. Only fires
  // on warm-mood, non-evasive bands. Adds the rumor to the player's
  // knownBy if successful.
  if ((band === "truthful" || band === "mostly" || band === "incomplete")
      && (mood === "productive" || mood === "warm")
      && typeof getRumorsKnownBy === "function") {
    const partnerHeard = getRumorsKnownBy(state, partner.id)
      .filter(h => !h.rumor.knownBy[player.id]);
    if (partnerHeard.length > 0) {
      const pick = partnerHeard[Math.floor(Math.random() * partnerHeard.length)];
      const trustQ      = Math.max(0, Math.min(1, getTrust(state, partner.id, player.id) / 10));
      const newConf     = pick.knowledge.confidence * (0.7 + 0.25 * trustQ);
      const newDistort  = Math.min(1, pick.knowledge.distortion + 0.06);
      if (newConf >= 0.20) {
        pick.rumor.knownBy[player.id] = {
          confidence:      newConf,
          distortion:      newDistort,
          fromId:          partner.id,
          learnedRound:    state.round ?? 0,
          slantedObjectId: pick.knowledge.slantedObjectId ?? null,
        };
        const line = _buildRumorReadLine(state, player, {
          rumor: pick.rumor,
          knowledge: pick.rumor.knownBy[player.id],
        });
        if (line) {
          return { feedback: `${flavor} ${line}`, hint: null };
        }
      }
    }
  }

  // Pick a subject and find the strongest real signal about them
  // (top ally OR worst foe, whichever is more pronounced).
  const subject = pickFrom(others);
  const subjectOthers = others.filter(c => c.id !== subject.id);
  let topAlly = null, topRel = -Infinity, worstFoe = null, worstRel = Infinity;
  for (const c of subjectOthers) {
    const r = getRelationship(state, subject.id, c.id);
    if (r > topRel)   { topRel   = r; topAlly  = c; }
    if (r < worstRel) { worstRel = r; worstFoe = c; }
  }
  const realBond  = topAlly  && topRel   >=  5 ? topAlly  : null;
  const realGrudge= worstFoe && worstRel <= -5 ? worstFoe : null;
  const realPick  = realBond || realGrudge;
  // Decoy: someone the subject is actually middling with.
  let decoyPick = null;
  if (subjectOthers.length > 0) {
    const middling = subjectOthers
      .map(c => ({ c, r: getRelationship(state, subject.id, c.id) }))
      .sort((a, b) => Math.abs(a.r) - Math.abs(b.r));
    if (middling.length > 0) decoyPick = middling[0].c;
  }

  switch (band) {
    case "truthful":
      if (realBond) {
        return { feedback: `${flavor} "${subject.name} and ${realBond.name} are running together. Watch them."`,
                 hint: null };
      }
      if (realGrudge) {
        return { feedback: `${flavor} "${subject.name} can't stand ${realGrudge.name}. There's a vote brewing there."`,
                 hint: null };
      }
      return { feedback: `${flavor} "${subject.name} hasn't shown me anything yet. That itself is data."`,
               hint: null };

    case "mostly":
      if (realPick) {
        return { feedback: `${flavor} "${subject.name} and ${realPick.name} — there's something there. I won't go further than that."`,
                 hint: null };
      }
      return { feedback: `${flavor} "${subject.name} is being careful. Real careful."`,
               hint: null };

    case "incomplete":
      return { feedback: `${flavor} "I've got reads on ${subject.name}, but I'd rather not put it all on the table yet."`,
               hint: null };

    case "vague":
      return { feedback: `${flavor} "${subject.name}? I haven't been paying close attention to be honest."`,
               hint: null };

    case "evasive":
      return { feedback: `${flavor} ${partner.name} pivoted to small talk. The window closed.`,
               hint: null };

    case "misleading":
      if (decoyPick) {
        return { feedback: `${flavor} "${subject.name} and ${decoyPick.name} are tighter than people think." It sounded plausible. You filed it without certainty.`,
                 hint: null };
      }
      return { feedback: `${flavor} "Honestly, I think ${subject.name} is locked in with the majority." You weren't sure they meant it.`,
               hint: null };

    case "false":
    default:
      if (decoyPick) {
        return { feedback: `${flavor} "${subject.name} told me they're targeting ${decoyPick.name}. Take that for what it's worth." Their delivery was rehearsed.`,
                 hint: null };
      }
      return { feedback: `${flavor} "${subject.name} is the most loyal person here," they said. It landed wrong.`,
               hint: null };
  }
}

// ── Camp intent / target tracking (v5 foundation) ────────────────────────────
//
// Per-contestant vote intent during camp. v5.0 declares the API and storage;
// behavior is added incrementally in v5.x:
//
//   • End-of-camp target list — the player sees a summary "you're leaning
//     toward voting X tonight" before tribal.
//
//   • AI strategic planning — AI contestants set their own intents during
//     camp so their behavior pre-tribal is consistent (e.g. an AI lobbying
//     against X likely votes X at tribal).
//
// state.campTargets shape (lazy — entries are created on first set):
//   { [contestantId]: { targetId, confidence: 0–10, setRound } }
//
// Cleared each round in advanceRound() (handler to be added when behavior is
// wired in v5.x). For v5.0 the structure exists but is untouched by gameplay.

function getCampTargetForContestant(state, contestantId) {
  return state.campTargets?.[contestantId] ?? null;
}

function setCampTargetForContestant(state, contestantId, targetId, confidence = 5) {
  if (!state.campTargets) state.campTargets = {};
  state.campTargets[contestantId] = {
    targetId,
    confidence: Math.max(0, Math.min(10, confidence)),
    setRound: state.round,
  };
}

function clearCampTargets(state) {
  state.campTargets = {};
}

// ── AI camp actions (v5.6) ────────────────────────────────────────────────────
//
// Each non-player contestant in the pool takes ONE camp action per phase,
// chosen by weighted random across the same engine functions the player
// uses. AI personality emerges from how the weights interact with stats:
//
//   high social    → talk / confide / strengthen-alliance dominate
//   high strategy  → lobby / askVote / formAlly dominate
//   high challenge → small Tend Camp boost (visibly contributing)
//   high suspicion → Lay low temporarily takes priority
//
// Call sites are in main.js at every camp-phase entry (runAICampPhase). The
// player.id is filtered out so this function is safe to call with the full
// tribe pool — the human's actions are still driven by the camp screen UI.
//
// State mutations propagate through the existing engine (rel/trust/suspicion/
// alliance), so the camp screen's relationship panel and alliance block
// surface the results on the next render.

// ── v5.14: Camp role identity ────────────────────────────────────────────────
//
// Camp role identity emerges from what a contestant repeatedly DOES, not
// from their stat sheet. Five roles, mapped from action-history fingerprints:
//
//   provider         — heavy tendCamp share
//   strategist       — heavy strategy/askVote/observePair/compareNotes share
//   schemer          — heavy lobby + searchidol share
//   socialConnector  — heavy talk/confide/checkIn/smoothOver share
//   drifter          — heavy laylow/readCamp share
//
// A role is only "emerged" once the contestant has taken at least 5 camp
// actions total (otherwise it's "undefined" — we don't read someone from
// one round of behavior). The dominant category needs ≥ 35% share to
// commit; below that, identity stays "undefined" so it doesn't snap on
// thin evidence.
//
// Effects are LIGHT — meant to color how others read the player, not to
// override active context:
//   • provider        — witnesses on idol search are slightly slower to bump
//                       suspicion-memory (reputation cushion)
//   • strategist      — small flat +5% lobby persuade chance
//   • schemer         — witnesses bump suspicion-memory faster on shady acts
//   • socialConnector — small +1 candor shift in conversation context
//   • drifter         — small natural suspicion drop each round (ambient
//                       background presence reads as nonthreatening)

// v5.22: role-category lists use CANONICAL action ids. Legacy ids logged
// against AI behavior are resolved to canonical via getCanonicalActionId
// inside computeCampRoleShares, so AI's direct calls to actionTalk /
// actionConfide / etc. roll up to the same buckets as the player's
// merged-action choices.
const CAMP_ROLE_CATEGORIES = {
  provider:        ["tendCamp"],
  strategist:      ["talkStrategy", "observePair"],
  schemer:         ["lobby", "searchidol"],
  socialConnector: ["spendTime", "mendBond", "proposeAlliance"],
  drifter:         ["laylow", "readCamp"],
};

const CAMP_ROLE_LABELS = {
  provider:        "Provider",
  strategist:      "Strategist",
  schemer:         "Schemer",
  socialConnector: "Social Connector",
  drifter:         "Drifter",
};

function recordCampAction(state, contestantId, actionId) {
  if (!state.actionHistory) state.actionHistory = {};
  if (!state.actionHistory[contestantId]) state.actionHistory[contestantId] = {};
  state.actionHistory[contestantId][actionId] =
    (state.actionHistory[contestantId][actionId] ?? 0) + 1;
}

function getCampActionTotal(state, contestantId) {
  const hist = state.actionHistory?.[contestantId];
  if (!hist) return 0;
  let total = 0;
  for (const k of Object.keys(hist)) total += hist[k];
  return total;
}

// Computes role shares for a contestant. Returns
//   { totals: {role: count}, shares: {role: 0..1}, total }
//
// v5.22: history keys are passed through getCanonicalActionId so legacy
// ids logged by AI behavior (actionTalk → "talk", etc.) roll up to their
// merged canonical bucket ("spendTime"). Player history already records
// the canonical id directly. This means the same role detection works
// uniformly for both player and AI activity.
function computeCampRoleShares(state, contestantId) {
  const rawHist = state.actionHistory?.[contestantId] ?? {};

  // Build a canonicalized history: merge counts from legacy ids into their
  // canonical equivalents.
  const hist = {};
  for (const id of Object.keys(rawHist)) {
    const canonical = getCanonicalActionId(id);
    hist[canonical] = (hist[canonical] ?? 0) + rawHist[id];
  }

  const totals = {};
  let total = 0;
  for (const [role, actionIds] of Object.entries(CAMP_ROLE_CATEGORIES)) {
    let count = 0;
    for (const id of actionIds) count += hist[id] ?? 0;
    totals[role] = count;
    total += count;
  }
  const shares = {};
  for (const role of Object.keys(totals)) {
    shares[role] = total > 0 ? totals[role] / total : 0;
  }
  return { totals, shares, total };
}

// Returns the camp role id. v5.15: three states —
//   "undefined"        : < 3 actions OR no category over 25% share
//   "leaning:<role>"   : 3+ actions AND best share ≥ 25% but < 40%
//   "<role>"           : 5+ actions AND best share ≥ 40%
// Tightened the commit threshold from 35% → 40% so the role doesn't snap
// in too early; introduced the leaning state so the player gets feedback
// on the direction their behavior is pulling them well before commitment.
function getCampRole(state, contestantId) {
  const { totals: _t, shares, total } = computeCampRoleShares(state, contestantId);
  if (total < 3) return "undefined";

  let bestRole = null, bestShare = 0;
  for (const role of Object.keys(shares)) {
    if (shares[role] > bestShare) { bestShare = shares[role]; bestRole = role; }
  }
  if (bestShare < 0.25) return "undefined";
  if (total >= 5 && bestShare >= 0.40) return bestRole;
  return "leaning:" + bestRole;
}

function getCampRoleLabel(roleId) {
  if (roleId && roleId.startsWith("leaning:")) {
    const real = roleId.slice("leaning:".length);
    return "Leaning " + (CAMP_ROLE_LABELS[real] ?? "their way");
  }
  return CAMP_ROLE_LABELS[roleId] ?? "Finding their place";
}

function runAICampActions(state, pool) {
  if (!Array.isArray(pool) || pool.length < 2) return;

  for (const ai of pool) {
    // Skip the human player — their actions come from the camp screen UI.
    if (state.player && ai.id === state.player.id) continue;
    runOneAICampAction(state, ai, pool);
  }
}

// Picks one weighted action for the AI and dispatches it through the same
// per-action engine functions the player uses, so AI behavior is mechanically
// indistinguishable from a human's (besides not being driven by the menu).
function runOneAICampAction(state, ai, pool) {
  const others = pool.filter(c => c.id !== ai.id);
  if (others.length === 0) return;

  const choice = pickAIActionWeighted(state, ai, others);
  if (!choice) return;

  // v5.14: log AI actions against their camp-role history too. Internal
  // action labels for AI mirror the player ones where reasonable; "strengthen"
  // is logged as proposeAlliance since it's the same intent.
  const historyKey =
    choice.action === "strengthen" ? "proposeAlliance" :
    choice.action === "formAlly"   ? "proposeAlliance" :
    choice.action;
  recordCampAction(state, ai.id, historyKey);

  // v5.18: scrambling AIs are visibly desperate. Each strategic action they
  // take while scrambling adds a small public suspicion bump on themselves —
  // models the room reading their pacing. Doesn't apply to talk/tendCamp/
  // laylow since those are calming behaviors. This is the "scramble can
  // make things worse" mechanic — overdoing it tightens the noose.
  if (typeof isScrambling === "function" && isScrambling(state, ai.id)) {
    const SCRAMBLE_VISIBILITY = {
      lobby:      1,
      askVote:    1,
      formAlly:   1,
      strengthen: 0,    // already-allied conversation reads as normal
      confide:    0,    // confiding still reads as warmth
    };
    const susp = SCRAMBLE_VISIBILITY[choice.action];
    if (susp) adjustSuspicion(state, ai.id, susp);
  }

  switch (choice.action) {
    case "talk":
      actionTalk(state, ai, choice.target);
      break;
    case "confide":
      actionConfide(state, ai, choice.target);
      break;
    case "strengthen":
      // Mirror actionProposeAlliance's in-alliance "strengthen mode" branch
      // directly — same effects, no need to route through the dispatcher
      // which would re-check the in-alliance condition.
      strengthenSharedAlliances(state, ai.id, choice.target.id, 1);
      adjustRelationship(state, ai.id, choice.target.id, rand(1, 2));
      adjustTrust(state, ai.id, choice.target.id, 1);
      break;
    case "lobby":
      actionLobby(state, ai, others, choice.target);
      break;
    case "askVote":
      actionAskVote(state, ai, choice.target, others);
      break;
    case "formAlly":
      actionProposeAlliance(state, ai, choice.target);
      break;
    case "laylow":
      actionLayLow(state, ai, others);
      break;
    case "tendCamp":
      actionTendCamp(state, ai, others);
      break;
  }
}

// ── v5.18: Target pressure + scramble mode ───────────────────────────────────
//
// "Target pressure" is how strongly the room is leaning toward voting a
// given contestant out — averaged from every other voter's negated vote
// score against them, then normalized to a 0–10 reading. Built directly
// on top of the existing scoreVoteTarget so any system that already shifts
// vote scoring (rel, alliance, suspicion, social capital, rumors) feeds
// directly into pressure.
//
// "Scramble mode" is the behavioral state of an AI who senses they're at
// risk. Triggered only in camp phase 2 (the round actually heading to
// tribal) when their pressure score is high or they're in the top 3
// most-targeted. While scrambling, an AI's action weights shift toward
// strategic survival behavior — lobby-deflection, alliance-checking,
// vote-asking, defensive confiding — and away from passive options.
//
// Player-facing exposure is purely qualitative: scrambling AIs surface
// in Read the Room with hedged language ("X seems to be working harder
// than usual"). No numbers, no panels, no debug text.

// Returns a 0–10 normalized pressure score for one contestant.
// Cached per-call via a tiny memo so repeated AI calls in one phase don't
// recompute the full pairwise vote pass for every action.
function getPressureScore(state, contestantId) {
  const c = (typeof findContestant === "function") ? findContestant(state, contestantId) : null;
  if (!c) return 0;

  const pool = state.merged
    ? (state.tribes?.merged || [])
    : (state.tribes?.[c.tribe] || []);
  if (pool.length < 2) return 0;

  let pressureSum = 0, voterCount = 0;
  for (const voter of pool) {
    if (voter.id === contestantId) continue;
    pressureSum += -scoreVoteTarget(state, voter, c);
    voterCount++;
  }
  const avg = voterCount > 0 ? pressureSum / voterCount : 0;

  // Normalize: vote-score baselines hover near 0 with a few-point swing in
  // either direction. Empirically, pressure values run roughly −15 (totally
  // safe, strong protection layered on) to +15 (universally targeted).
  // Map to 0–10 with 5 as neutral.
  return Math.max(0, Math.min(10, 5 + avg * 0.4));
}

// Returns the top N most-pressured contestants in a pool, with their
// pressure scores. Distinct from getTopVoteTargets (which uses raw
// pressure for ranking but not normalization). Used internally by scramble
// detection and the player-facing Read the Room.
function getPressureRanking(state, pool) {
  if (!Array.isArray(pool) || pool.length < 2) return [];
  const ranked = pool.map(c => ({
    contestant: c,
    pressure:   getPressureScore(state, c.id),
  }));
  ranked.sort((a, b) => b.pressure - a.pressure);
  return ranked;
}

// Predicate: is this contestant currently in scramble mode? Only fires
// during camp phase 2 — in phase 1 the vote isn't imminent, so even
// high-pressure contestants don't trigger scramble behavior. Phase-1
// pressure still feeds normally into vote scoring; it just doesn't drive
// emergency action-selection.
//
// Triggers when ANY of:
//   • pressure ≥ 6.0
//   • contestant is in the top 3 of pressure ranking AND pressure ≥ 5.0
//   • contestant has accumulated suspicion-memory from ≥ 3 distinct observers
function isScrambling(state, contestantId) {
  if (state.campPhase !== 2) return false;
  // Don't scramble if the player isn't going to tribal pre-merge.
  if (!state.merged) {
    const c = findContestant(state, contestantId);
    if (!c) return false;
    if (state.tribalTribe && c.tribe !== state.tribalTribe) return false;
  }

  const pressure = getPressureScore(state, contestantId);
  if (pressure >= 6.0) return true;

  // Top-3 + meaningful pressure check
  const c = findContestant(state, contestantId);
  if (c) {
    const pool = state.merged
      ? (state.tribes?.merged || [])
      : (state.tribes?.[c.tribe] || []);
    const ranked = getPressureRanking(state, pool);
    const ix = ranked.findIndex(r => r.contestant.id === contestantId);
    if (ix >= 0 && ix < 3 && pressure >= 5.0) return true;
  }

  // Multiple-observer suspicion-memory check.
  let observerCount = 0;
  for (const obs of Object.keys(state.suspicionMemory ?? {})) {
    if ((state.suspicionMemory[obs][contestantId] ?? 0) >= 1.5) observerCount++;
  }
  if (observerCount >= 3) return true;

  return false;
}

// Picks a deflection target for a scrambling AI: someone other than the
// scrambler who can plausibly be redirected at. Prefers the next-most-
// pressured non-ally non-self. Used by lobby in scramble mode to model
// "throwing another name out".
function pickDeflectionTarget(state, scrambler, pool) {
  const candidates = pool.filter(c =>
    c.id !== scrambler.id
    && !isInSameAlliance(state, scrambler.id, c.id)
  );
  if (candidates.length === 0) return null;

  // Rank by pressure descending — deflect at someone the room is already
  // softer on, so the pitch has somewhere to land.
  const ranked = candidates.map(c => ({
    c,
    pressure: getPressureScore(state, c.id),
    rel:      getRelationship(state, scrambler.id, c.id),
  }));
  // Prefer high-pressure candidates the scrambler also doesn't like.
  ranked.sort((a, b) => (b.pressure - b.rel * 0.3) - (a.pressure - a.rel * 0.3));
  return ranked[0]?.c ?? null;
}

// Weighted random selection of an AI's next action.
// Returns { action, target } or null if no action is viable.
//
// Each action pushes an option onto a list with a weight. The picker then
// rolls a uniform random number across the total weight. Stats shape the
// weights, current state shapes target eligibility (e.g. lobby is only an
// option if the AI has someone they actually dislike to lobby against).
function pickAIActionWeighted(state, ai, others) {
  const options = [];
  // v5.13: archetype shapes action preference. "balanced" is the no-tilt default.
  const arch = ai.archetype ?? "balanced";

  // ── TALK ──
  // Pool: tribemates the AI hasn't already maxed out (rel < 12) and isn't
  // openly at odds with (rel > -8). Talking with active enemies is awkward;
  // talking with already-tight allies hits diminishing returns.
  const talkPool = others.filter(c => {
    const r = getRelationship(state, ai.id, c.id);
    return r > -8 && r < 12;
  });
  if (talkPool.length > 0) {
    let w = 4 + ai.social * 0.4;
    if (arch === "socialButterfly") w += 3;
    if (arch === "loyal")           w += 1;
    if (arch === "paranoid")        w -= 0.5;
    if (arch === "workhorse")       w -= 0.5;
    options.push({ action: "talk", weight: w, target: pickFrom(talkPool) });
  }

  // ── CONFIDE ──
  // Pool: tribemates with enough rel/trust foundation to make confiding
  // plausible. Without this floor confiding feels random and rarely
  // produces real bonds.
  const confidePool = others.filter(c =>
    getRelationship(state, ai.id, c.id) >= 5 &&
    getTrust(state, ai.id, c.id)        >= 4
  );
  if (confidePool.length > 0) {
    let w = 2 + ai.social * 0.4;
    if (arch === "socialButterfly") w += 1.5;
    if (arch === "loyal")           w += 1;
    if (arch === "sneaky")          w -= 1;
    if (arch === "paranoid")        w -= 1;
    options.push({ action: "confide", weight: Math.max(0.2, w), target: pickFrom(confidePool) });
  }

  // ── STRENGTHEN existing alliance ──
  // Pool: any active-alliance co-member who's currently in the same camp pool.
  // Allies on the other tribe (post-swap) can't be reinforced via camp
  // interaction — staleness will hit them naturally.
  const myAlliances = (typeof getAlliancesForMember === "function")
    ? getAlliancesForMember(state, ai.id)
    : [];
  const allyPool = [];
  for (const alliance of myAlliances) {
    for (const memberId of alliance.memberIds) {
      if (memberId === ai.id) continue;
      const member = others.find(c => c.id === memberId);
      if (member && !allyPool.includes(member)) allyPool.push(member);
    }
  }
  if (allyPool.length > 0) {
    let w = 3 + ai.social * 0.2;
    if (arch === "loyal")  w += 2;
    if (arch === "sneaky") w -= 1;
    options.push({ action: "strengthen", weight: Math.max(0.2, w), target: pickFrom(allyPool) });
  }

  // ── LOBBY ──
  // Pool: any tribemate the AI clearly dislikes (rel < -3). The most-
  // disliked is the natural target — that's who the AI wants gone.
  const enemyPool = others.filter(c =>
    getRelationship(state, ai.id, c.id) < -3
  );
  if (enemyPool.length > 0) {
    enemyPool.sort((a, b) =>
      getRelationship(state, ai.id, a.id) - getRelationship(state, ai.id, b.id)
    );
    let w = 2 + ai.strategy * 0.6;
    if (arch === "sneaky")    w += 2;
    if (arch === "paranoid")  w += 1;
    if (arch === "loyal")     w -= 1;
    if (arch === "workhorse") w -= 1;
    options.push({ action: "lobby", weight: Math.max(0.2, w), target: enemyPool[0] });
  }

  // ── ASK VOTE ──
  // Pool: tribemates the AI trusts enough to ask candidly (trust ≥ 4).
  // The truth tier tiers in actionAskVote already gate what comes back;
  // requiring trust ≥ 4 here just means AI doesn't waste actions asking
  // distrustful people.
  const askPool = others.filter(c => getTrust(state, ai.id, c.id) >= 4);
  if (askPool.length > 0) {
    let w = 1 + ai.strategy * 0.5;
    if (arch === "sneaky")   w += 1.5;
    if (arch === "paranoid") w += 1;
    options.push({ action: "askVote", weight: w, target: pickFrom(askPool) });
  }

  // ── FORM ALLIANCE ──
  // Pool: high-rel/trust candidates not already in a shared alliance.
  // Same gate as the engine's aiFormAlliances pass plus a per-pair
  // attempted-already check. The acceptance roll inside
  // actionProposeAlliance can still reject, which is fine — that's
  // texture.
  const formPool = others.filter(c =>
    getRelationship(state, ai.id, c.id) >= 10 &&
    getTrust(state, ai.id, c.id)        >= 5  &&
    !isInSameAlliance(state, ai.id, c.id)
  );
  if (formPool.length > 0) {
    formPool.sort((a, b) =>
      (getRelationship(state, ai.id, b.id) + getTrust(state, ai.id, b.id) * 2)
      - (getRelationship(state, ai.id, a.id) + getTrust(state, ai.id, a.id) * 2)
    );
    let w = 1 + ai.strategy * 0.4;
    if (arch === "loyal")    w += 1.5;
    if (arch === "sneaky")   w -= 0.5;
    if (arch === "paranoid") w -= 0.5;
    options.push({ action: "formAlly", weight: Math.max(0.2, w), target: formPool[0] });
  }

  // ── LAY LOW ──
  // Only when the AI has real heat. Otherwise laylow is a wasted action
  // for them. v5.13: paranoid archetypes lay low even with mild heat.
  const ownSusp = ai.suspicion ?? 0;
  const laylowFloor = arch === "paranoid" ? 2 : 4;
  if (ownSusp >= laylowFloor) {
    let w = 1 + ownSusp * 0.6;
    if (arch === "paranoid") w += 1.5;
    if (arch === "sneaky")   w += 0.5;
    options.push({ action: "laylow", weight: w, target: null });
  }

  // ── TEND CAMP ──
  // Always a valid baseline option (visible labor is always somewhat
  // useful). v5.13: workhorse archetypes lean heavily into it; challenge
  // beasts also weight it up; sneaky/social-butterfly weight it down.
  let tendW = 1 + (ai.challenge >= 7 ? 1 : 0);
  if (arch === "workhorse")       tendW += 3;
  if (arch === "challengeBeast")  tendW += 1.5;
  if (arch === "sneaky")          tendW -= 0.5;
  if (arch === "socialButterfly") tendW -= 0.5;
  options.push({ action: "tendCamp", weight: Math.max(0.2, tendW), target: null });

  if (options.length === 0) return null;

  // ── v5.19: post-merge behavioral tilt ─────────────────────────────────────
  // After the merge, every player is on their own. Action mix shifts toward
  // information-gathering and cross-pollination of new partnerships, away
  // from passive tribe-building. Jury awareness softens hostile actions
  // once the jury has started forming — burning a future juror is a real
  // cost. Layered as a multiplier overlay so existing weights still drive
  // the underlying personality of each AI.
  if (state.merged) {
    const POST_MERGE_MULT = {
      askVote:    1.4,
      lobby:      1.2,
      formAlly:   1.4,
      strengthen: 0.9,   // already-allied reinforcement matters less when
                         // alliances are fluid; new connections matter more
      talk:       0.85,
      tendCamp:   0.5,   // tribe strength irrelevant; nobody is impressed
      laylow:     1.1,
      confide:    1.1,
    };
    for (const opt of options) {
      const m = POST_MERGE_MULT[opt.action];
      if (m !== undefined) opt.weight *= m;
    }

    // Jury awareness: once the jury has started, soften hostile pitches
    // against tribemates — players consider that everyone they cross is a
    // future juror. Reduces lobby weight by 25%; observation/social up.
    const juryStarted = (state.jury?.length ?? 0) >= 1;
    if (juryStarted) {
      for (const opt of options) {
        if (opt.action === "lobby") opt.weight *= 0.75;
      }
    }

    // Late-game resume threat: when only a small group remains, AIs get
    // more aggressive about working against high-challenge / high-social
    // tribemates (they're future final-tribal threats). Modeled by scaling
    // up lobby weight specifically when the action's pre-selected target
    // is a resume threat.
    const remaining = (state.tribes?.merged || []).length;
    if (remaining <= 6) {
      const lobbyOpt = options.find(o => o.action === "lobby");
      if (lobbyOpt && lobbyOpt.target) {
        const t = lobbyOpt.target;
        const resumeThreat = (t.challenge ?? 5) + (t.social ?? 5);
        if (resumeThreat >= 14) lobbyOpt.weight *= 1.3;
      }
    }
  }

  // ── v5.18: scramble-mode overlay ──────────────────────────────────────────
  // If this AI senses they're in danger (camp phase 2 + high pressure), shift
  // weights toward survival behavior. Strategy spikes; passive options drop;
  // lobby gets redirected to a deflection target instead of their natural
  // grudge target.
  if (typeof isScrambling === "function" && isScrambling(state, ai.id)) {
    const SCRAMBLE_MULT = {
      lobby:        1.8,
      askVote:      1.6,
      formAlly:     1.5,
      strengthen:   1.5,
      confide:      1.4,
      talk:         0.6,
      tendCamp:     0.3,
      laylow:       0.4,   // laying low when they're already a target is wrong
    };
    for (const opt of options) {
      const m = SCRAMBLE_MULT[opt.action];
      if (m !== undefined) opt.weight *= m;
    }
    // Lobby deflection: in scramble mode, pivot the lobby target away from
    // the scrambler's natural grudge and toward whoever is also under heat
    // (so the pitch can plausibly land). Models "throwing another name out".
    const lobbyOpt = options.find(o => o.action === "lobby");
    if (lobbyOpt) {
      const deflection = pickDeflectionTarget(state, ai, others);
      if (deflection) lobbyOpt.target = deflection;
    } else {
      // Even if the AI had no natural enemy, scramble mode adds lobby as
      // a deflection-only option. They need to throw SOMETHING out there.
      const deflection = pickDeflectionTarget(state, ai, others);
      if (deflection) {
        options.push({
          action: "lobby",
          weight: 2.5 + ai.strategy * 0.4,
          target: deflection,
        });
      }
    }
  }

  // Weighted random pick.
  const totalWeight = options.reduce((s, o) => s + o.weight, 0);
  if (totalWeight <= 0) return null;

  let r = Math.random() * totalWeight;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt;
  }
  return options[options.length - 1];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
