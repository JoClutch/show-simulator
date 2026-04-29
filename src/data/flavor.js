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

// Opening line when Jeff begins reading the votes.
const REVEAL_INTROS = [
  "Jeff reaches into the urn…",
  "Jeff pulls the first vote from the urn…",
  "Jeff steps to the podium. The urn is in his hands…",
  "Once the votes are read, the decision is final…",
  "Jeff opens the first parchment…",
  "Jeff retrieves the urn. The tribe waits…",
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
