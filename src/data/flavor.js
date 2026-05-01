// flavor.js — Narrative text pools for all screen transitions
//
// All exported identifiers are plain globals (non-module script).
// UI files call pickFlavor() or the contextual getter functions below.
//
// Design rules:
//   • Terse, present-tense, Survivor-flavored.
//   • Short sentences. Atmospheric over explanatory.
//   • Each pool has 4–6 variants — enough to feel alive, not overwhelming.
//   • Contextual getters (functions) react to game state; flat arrays are
//     for situations where any variant fits equally well.

// ── Utility ───────────────────────────────────────────────────────────────────

function pickFlavor(arr) {
  // Supports null entries — callers treat null as "no extra text".
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Camp Life: episode opener ─────────────────────────────────────────────────

// One atmospheric line shown at the top of camp phase 1 each episode.
// Varies by game phase and how far into the season we are.
function getEpisodeOpener(state) {
  const remaining = state.merged
    ? state.tribes.merged.length
    : (state.tribes.A?.length ?? 0) + (state.tribes.B?.length ?? 0);

  if (state.merged && remaining <= 4) {
    return pickFlavor([
      "The end is within reach. Every conversation could be your last chance.",
      `${remaining} players left. The jury is nearly full.`,
      "This deep in the game, everyone left is dangerous. Including you.",
    ]);
  }

  if (state.merged && state.jury.length > 0) {
    return pickFlavor([
      "The jury is watching. Every move you make gets evaluated.",
      "You're playing for two audiences now — the people still in and the ones sitting out.",
      "Post-merge. Each tribal council sends someone to the jury.",
      "The field is thinning. Everyone left has made it further than they expected.",
    ]);
  }

  if (state.merged) {
    return pickFlavor([
      "The old tribal lines are still there, even if the tribes aren't.",
      "Merge day. The game resets — sort of.",
      "Everyone is an ally. Everyone is a threat.",
    ]);
  }

  // Post-swap, pre-merge — the world has shifted. Old loyalties haven't
  // disappeared, but the people enforcing them are scattered.
  if (state.swapped) {
    return pickFlavor([
      "Post-swap. Old tribe lines bend, but they don't break easily.",
      "Your new tribemates are still strangers. Some of them were enemies a week ago.",
      "Everyone's reading the room. Old loyalties haven't disappeared — just gone underground.",
      "The swap rearranged the board. Now you have to figure out who actually stuck with you.",
      "Some of the people sleeping next to you were on the other beach a few days ago.",
    ]);
  }

  if (state.round <= 2) {
    return pickFlavor([
      "The game is just beginning. First impressions are becoming first reads.",
      "Day " + (getDay(state)) + ". The tribe is still figuring each other out.",
      "Early in the game. Nothing is locked in — including you.",
    ]);
  }

  return pickFlavor([
    "Another day. Another set of decisions.",
    "The game moves fast once people start making their move.",
    "There's no reset button. Only forward.",
    `Episode ${state.round}. The tribe is smaller and the stakes are higher.`,
  ]);
}

// ── Challenge screen ──────────────────────────────────────────────────────────

// Appended (with a leading space) to the challenge description on close finishes.
const CHALLENGE_CLOSE_SUFFIXES = [
  " It came down to the wire.",
  " The difference was razor thin.",
  " Both sides pushed to the limit — one didn't quite hold on.",
  " A single mistake decided it.",
];

// Shown to the player after their tribe wins tribal immunity.
const CHALLENGE_WIN_LINES = [
  "Your tribe held it together when it mattered. Enjoy the night off.",
  "Immunity secured. Tonight you're safe — someone else sweats.",
  "Your tribe takes it. Head back to camp.",
  "You made it through. The other tribe faces the vote.",
];

// Shown to the player after their tribe loses tribal immunity.
const CHALLENGE_LOSS_LINES = [
  "Your tribe is heading to Tribal Council tonight. The scrambling starts now.",
  "The challenge is over. The real game begins at camp.",
  "You'll face the vote tonight. Someone from your tribe is going home.",
  "Your tribe lost. The next few hours matter more than the last few days.",
];

// Shown to the player when they personally win individual immunity.
const INDIV_WIN_LINES = [
  "You can't be touched tonight. The necklace is yours.",
  "Individual Immunity is yours. You vote — and you can't be voted for.",
  "You're safe. Someone else goes home tonight.",
  "You won it. For one night, the game can't touch you.",
];

// Shown to the player when someone else wins individual immunity.
function getIndivLossLine(winnerName) {
  return pickFlavor([
    `${winnerName} is safe. Everyone else is vulnerable tonight.`,
    `${winnerName} takes the necklace. You'll have to survive the vote without it.`,
    `${winnerName} wins immunity. The target now falls on someone else — possibly you.`,
    `${winnerName} is protected. You'll need to find another way through tonight.`,
  ]);
}

// ── Tribal Council ────────────────────────────────────────────────────────────

// Atmospheric paragraph shown before the voting grid appears.
// Varies by merge status, jury presence, and round.
function getTribalOpener(state) {
  const remaining = state.merged
    ? state.tribes.merged.length
    : (state.tribes.A?.length ?? 0) + (state.tribes.B?.length ?? 0);

  // First merged tribal — big moment.
  if (state.merged && state.jury.length === 0) {
    return pickFlavor([
      "The merge changed everything. Old tribe loyalty is a liability now. Tonight's vote will tell you who to trust — and who has already stopped trusting you.",
      "Welcome to the merged game. Every person sitting here has been watching. One of them goes home tonight.",
      "Old lines, new game. The people you've been playing alongside may not be the people you should vote with. Think carefully.",
    ]);
  }

  // Late endgame — very few left, jury nearly full.
  if (state.merged && remaining <= 5) {
    return pickFlavor([
      `${remaining} players left. The jury is nearly full and they're watching every vote. Make this one count.`,
      "You're close enough to the end that every remaining vote sends someone to the jury. Be sure about this one.",
      "The game is almost over. Tonight's decision will follow you to Final Tribal Council.",
    ]);
  }

  // Mid-merge, jury forming.
  if (state.merged && state.jury.length > 0) {
    return pickFlavor([
      "Every vote from here builds your jury resume — or damages it. Choose who goes home wisely.",
      "The jury is growing. The person you vote out tonight will have a say in who wins.",
      "Everyone left is dangerous. The question is which kind of dangerous you can live with.",
      "You've made it this far by reading people right. You'll need to read them right again tonight.",
    ]);
  }

  // Post-swap, pre-merge — the first tribal at a redrawn camp is its own beat.
  // Old tribal lines are tested; people may flip, hold, or end up trapped.
  if (state.swapped) {
    return pickFlavor([
      "Tonight is the first real test of the swap. Old loyalties or new tribemates — pick one.",
      "Some of the people in this room played against you a week ago. Tonight you'll find out who's actually with you.",
      "The swap forced everyone into uneasy company. The vote tonight will reveal who held to old lines and who walked away from them.",
      "Old tribe versus new tribe. Numbers versus relationships. Tonight a side picks itself.",
    ]);
  }

  // Pre-merge, early.
  if (state.round <= 3) {
    return pickFlavor([
      "There are no practice votes. Someone's game ends tonight — and the tribe moves on.",
      "Alliances are still forming. Tonight's vote is the first real signal of where people stand.",
      "First impressions gave way to first reads. Now comes the first vote that matters.",
    ]);
  }

  // Pre-merge, later.
  return pickFlavor([
    "Every vote shifts the numbers. Think about where you want to be when the merge comes.",
    "The tribe is smaller. The relationships matter more now. Cast your vote carefully.",
    "Someone has to go. You already know who — the question is whether everyone else knows it too.",
  ]);
}

// ── v6.8: Tribal Council ritual messaging ───────────────────────────────────
//
// Short, host-style lines used to dress the tribal flow. Original phrasing —
// captures the cadence of the show without copying Jeff Probst's exact
// words. Each pool can be edited or extended freely; pickFlavor handles
// uniform random selection.

// Lines shown right above the vote grid: "it's time to vote".
const TRIBAL_PRE_VOTE_LINES = [
  "All right, the moment is here. Cast a vote.",
  "Time to settle this. One name.",
  "The talking is over. Pick a name and write it down.",
  "Let's vote.",
  "You've heard what you've heard. Cast your vote.",
];

// Brief beat shown after votes are cast, before the idol-play / reveal
// flow. Captures the "I'll go tally the votes" handoff.
const TRIBAL_POST_VOTE_LINES = [
  "Votes are in. Let me collect them.",
  "Once I have the votes, I'll be back.",
  "Stay where you are. I'll bring the urn.",
  "Hold on. Let me gather them.",
];

// Opening line when the host begins reading the votes.
const REVEAL_INTROS = [
  "We'll read them now.",
  "Once the names are read, the decision stands.",
  "The first vote.",
  "Eyes up. Here's the first.",
  "Reading the votes.",
];

// Line surfaced under the decisive (lock-in) vote card. Conveys the
// "that's X, that's enough" beat without copying Probst's exact phrasing.
const TRIBAL_DECISIVE_LINES = [
  "That's the count.",
  "That's the vote.",
  "Enough names to send someone home.",
  "And that locks it in.",
  "That's all I need to read.",
];

// Final-tally summary surfaced near the finish button. Substitutes vote
// counts in via the caller. e.g. "5 to 2 — that's the count tonight."
const TRIBAL_TALLY_SUMMARY_LINES = [
  "{counts} — that's the count tonight.",
  "Final count: {counts}.",
  "{counts}. That's how the room broke.",
  "{counts} — and that's how it ends.",
];

// "The tribe has spoken" exit lines. Used on the finish button area or
// as a small farewell card under the eliminated player's name.
const TRIBAL_FAREWELL_LINES = [
  "The tribe has decided. It's time to go.",
  "Your time is done. Hand me the torch.",
  "The tribe has made its choice. Walk out with your head up.",
  "It's over. Time to leave.",
  "The torch is going out.",
];

// ── Elimination screen ────────────────────────────────────────────────────────

// One contextual sentence added below the vote-out message.
// Returns null when no extra line fits — callers skip it.
function getElimFlavor(eliminated, isPlayer, state) {
  if (isPlayer) return null;

  const susp   = eliminated.suspicion ?? 0;
  const merged = state.merged;
  const jurors = state.jury?.length ?? 0;
  const early  = state.eliminated.length <= 3;
  const late   = state.round >= 8;

  // High suspicion — the tribe had clearly been watching.
  if (susp >= 6) {
    return pickFlavor([
      "Their name had been circulating for days. Tonight the votes confirmed what everyone already knew.",
      "The tribe had been watching them closely. They acted on what they saw.",
      "They never quite shook the target. Eventually you stop running from it.",
    ]);
  }

  // High challenge stat, voted out post-merge.
  if (eliminated.challenge >= 8 && merged) {
    return pickFlavor([
      "A proven challenge performer removed before they could dominate the endgame. A calculated move.",
      "They won challenges and they paid for it. The tribe couldn't afford to keep them any longer.",
      jurors >= 2
        ? "The jury will note this vote. A threat removed — but at a cost."
        : "Physical threats rarely last deep into the game. They were no exception.",
    ]);
  }

  // High social, voted out post-merge with jury watching.
  if (eliminated.social >= 8 && merged && jurors >= 2) {
    return pickFlavor([
      "Everyone liked them — which is exactly why they're sitting in the jury box.",
      "The most dangerous player isn't always the one winning challenges.",
      "A jury threat. Someone decided the risk wasn't worth carrying them to the end.",
    ]);
  }

  // Early boot.
  if (early) {
    return pickFlavor([
      "The game is long. But it ended early for them.",
      "They never quite found their footing. The tribe moved on quickly.",
      null,
    ]);
  }

  // Late game.
  if (late) {
    return pickFlavor([
      "They made it further than most — but not far enough.",
      "So close to the finale. This vote will sit with them.",
      "The end was in sight. Someone decided they couldn't reach it.",
    ]);
  }

  // Generic — include nulls to keep variety feeling natural.
  return pickFlavor([
    "In the end, the alliances held. They weren't in the right ones.",
    "They played hard. The tribe decided they played too hard.",
    "The numbers told the story.",
    null,
    null,
  ]);
}

// Short sub-label shown beneath the vote count on the elimination card.
// Keeps the "tribe has spoken" feel without repeating the same phrase.
const ELIM_VOTE_LABELS = [
  "The tribe has spoken.",
  "The votes were cast.",
  "The decision is final.",
  "They have spoken.",
];

// ── Merge screen ─────────────────────────────────────────────────────────────

// Second paragraph shown on the merge screen below the rule summary.
const MERGE_FLAVOR_LINES = [
  "Old alliances are fractures waiting to open. New ones will form tonight.",
  "Everything you built before the merge brought you here. What you build now decides who wins.",
  "The game you've been playing is over. The real game starts now.",
  "Old tribal lines mean nothing — except they mean everything to the people who lived them.",
];

// ── Final Tribal Council ──────────────────────────────────────────────────────

// Intro text shown on the FTC ceremony screen.
const FTC_CEREMONY_INTROS = [
  "You've spent this entire season outwitting, outplaying, and outlasting. Tonight, the jury decides if your game was worthy of the title.",
  "The jury holds the power now. They were voted out, but they have the final word.",
  "Three players. The jury. One vote determines everything. Make your case.",
  "This is what the whole season has been building toward. The jury will decide who played the best game.",
];

// Additional line on the FTC ceremony screen when the player is a finalist.
const FTC_YOU_ARE_FINALIST_LINES = [
  "You're sitting at the end. Now you have to convince them you deserve to be here.",
  "You made it. Now justify it.",
  "You've outlasted thirteen other players. The jury wants to know how — and why.",
];

// Shown above the vote reveal in the FTC reveal phase.
const FTC_READING_INTROS = [
  "Jeff reaches into the urn one final time…",
  "Jeff steps to the podium. These are the votes that decide everything…",
  "Jeff opens the first parchment. The jury's decision is about to be revealed…",
  "After everything — every vote, every conversation, every day — it comes down to this…",
];

// Subheading shown on the winner card when the player wins.
const FTC_WINNER_PLAYER_SUBLINES = [
  "The jury has spoken. You are the Sole Survivor.",
  "You outplayed, outwitted, and outlasted every player in this game.",
  "From the first day to the final vote — your game was enough.",
];

// Subheading shown on the winner card when someone else wins.
function getFTCWinnerOtherLine(winnerName) {
  return pickFlavor([
    `The jury has spoken. ${winnerName} is the Sole Survivor.`,
    `${winnerName} played the game the jury respected most.`,
    `${winnerName} earned every vote. There's no arguing with the result.`,
  ]);
}

// ── Idol play (Tribal Council) ───────────────────────────────────────────────

// The "Jeff asks if anyone wants to play an idol" prompt — a single line
// shown above the player's idol decision, or the AI play sequence.
const IDOL_PLAY_PROMPT_LINES = [
  "If anybody has a hidden immunity idol and you'd like to play it, now would be the time to do so.",
  "Before I read the votes — does anyone want to play a hidden immunity idol?",
  "Last chance. If you have an idol, this is the moment.",
];

// Body text for the player's own idol prompt — explains the consequence
// without revealing how the votes actually fell.
const IDOL_PLAY_PLAYER_BODY_LINES = [
  "If you play it now, every vote against you tonight will be voided. The idol will be consumed either way.",
  "Played idols are gone for good. If you sense danger, this is your one move. If you don't, keep it for another night.",
  "Trust your read. If they're coming for you, the idol saves you. If they aren't, you've burned it for nothing.",
];

// Dramatic announcement when an AI plays an idol.
function getAIIdolPlayLine(name) {
  return pickFlavor([
    `${name} stands and reaches into their bag. They hold up a Hidden Immunity Idol.`,
    `${name} steps forward without a word. In their hand — a Hidden Immunity Idol.`,
    `${name} pulls something from a pocket and stands. It's a Hidden Immunity Idol.`,
    `${name} rises slowly and produces a Hidden Immunity Idol from their belongings.`,
  ]);
}

// Subline shown after the AI play announcement — explains the effect.
function getIdolPlayedEffectLine(name) {
  return pickFlavor([
    `Any votes cast against ${name} will not count.`,
    `${name} cannot be voted out tonight.`,
    `Every vote against ${name} will be voided.`,
  ]);
}

// The player's own play moment — gold-text dramatic line shown after they
// confirm. Reads as their own thought / declaration.
const IDOL_PLAY_PLAYER_REVEAL_LINES = [
  "You stand, reach into your bag, and hold up the idol. The tribe goes still.",
  "You pull the idol out without ceremony and place it on the bench in front of Jeff. Eyes everywhere.",
  "You stand. The idol is in your hand. Several tribemates audibly inhale.",
];

// Quiet follow-up when no one plays an idol — keeps the moment from feeling
// like dead air. Used only when at least one person held a playable idol but
// chose not to play it (i.e. the decision phase happened).
const IDOL_NOT_PLAYED_LINES = [
  "No one moves. Jeff nods once and reaches for the urn.",
  "The pause stretches. Nobody stands. The votes are read.",
  "A long beat passes. Nothing. Jeff turns to the urn.",
];

// ── Alliances ────────────────────────────────────────────────────────────────

// Pool of evocative names for newly-formed alliances. Engine/alliances.js
// avoids duplicates within a single playthrough by filtering the in-use names
// before picking. If the pool is exhausted (rare), engine falls back to a
// numbered name ("The 17").
const ALLIANCE_NAMES = [
  "The Pact",
  "The Inner Circle",
  "Ride or Die",
  "The Underdogs",
  "The Quiet Ones",
  "The Originals",
  "The Outliers",
  "The Final Card",
  "The Movement",
  "The Shadows",
  "The Three",
  "The Camp",
  "The Long Game",
  "The Roundtable",
];

// Player feedback when their alliance proposal is accepted.
// `name` is the alliance's chosen name; `target` is the proposed partner.
function getAllianceAcceptedLine(name, target) {
  return pickFlavor([
    `You laid out the case to ${target.name} quietly. Ride together, vote together, take this far. They agreed. "${name}" is on.`,
    `${target.name} listened, weighed it, and then nodded. "Yeah. Let's do this." You're in an alliance — "${name}".`,
    `You and ${target.name} talked it through behind the shelter. By the end, you had a real pact. You're calling it "${name}".`,
    `${target.name} extended a hand. You shook on it. "${name}" — that's what you'll call this. It's real now.`,
  ]);
}

// Player feedback when their alliance proposal is rejected.
function getAllianceRejectedLine(target) {
  return pickFlavor([
    `You floated the idea to ${target.name}, but they pushed back. "Let's just keep playing it day by day." It didn't land.`,
    `${target.name} smiled politely when you proposed working together. "Maybe down the line," they said. Translation: not now.`,
    `Your alliance pitch with ${target.name} fell flat. They weren't comfortable being locked in. The conversation got awkward.`,
    `${target.name} listened, then looked away. "I appreciate it, but I'm just trying to keep my options open." A no, dressed up.`,
  ]);
}

// ── Tribe swap ───────────────────────────────────────────────────────────────

// One-line atmospheric subhead for the swap screen. Picked once at swap time.
const SWAP_FLAVOR_LINES = [
  "Drop your buffs.",
  "The tribes are reshaping.",
  "Old loyalties meet new tribemates.",
  "Your camp just got smaller — and stranger.",
  "The game just changed shape.",
  "New buffs. Same game. Higher stakes.",
];

// Quiet line shown when player tries to propose to an existing ally.
function getAllianceAlreadyLine(target) {
  return pickFlavor([
    `You and ${target.name} already have a pact. No need to formalize twice.`,
    `${target.name} laughed. "We already have an alliance. You getting paranoid?"`,
    `You started to make the pitch, but ${target.name} cut you off. "We're already in this together. Save the speech."`,
  ]);
}
