// campLife.js — camp action definitions and execution logic
//
// Each action the player can take is defined in CAMP_ACTIONS.
// executeAction() is the single entry point: it mutates state.relationships
// and returns { feedback, hint } for the UI to display.
// No DOM access happens here.

const CAMP_ACTIONS = [
  {
    id: "talk",
    label: "Talk to a tribemate",
    detail: "Spend time getting to know someone.",
    needsTarget: true,
  },
  {
    id: "improvecamp",
    label: "Improve camp",
    detail: "Do chores. The tribe notices who pulls their weight.",
    needsTarget: false,
  },
  {
    id: "searchidol",
    label: "Search for idol",
    detail: "Slip away into the jungle. Risky if someone notices.",
    needsTarget: false,
  },
  {
    id: "strategy",
    label: "Discuss strategy",
    detail: "Float an idea about the next vote.",
    needsTarget: true,
  },
  {
    id: "askVote",
    label: "Ask who they want out",
    detail: "See where someone's head is at.",
    needsTarget: true,
  },
];

// Executes one camp action. Mutates state.relationships.
// Returns { feedback: string, hint: string|null }
// hint is a name string when an action reveals information; null otherwise.
function executeAction(state, actionId, player, tribemates, target) {
  switch (actionId) {
    case "talk":        return actionTalk(state, player, target);
    case "improvecamp": return actionImprovecamp(state, player, tribemates);
    case "searchidol":  return actionSearchIdol(state, player, tribemates);
    case "strategy":    return actionStrategy(state, player, target);
    case "askVote":     return actionAskVote(state, player, target, tribemates);
    default:            return { feedback: "Nothing happened.", hint: null };
  }
}

// ── Individual action implementations ────────────────────────────────────────

function actionTalk(state, player, target) {
  const backfire = Math.random() < 0.20;
  const delta    = backfire
    ? -rand(1, 3)
    : Math.floor(player.social / 3) + rand(1, 3);

  adjustRelationship(state, player.id, target.id, delta);

  if (delta >= 5) {
    return { feedback: pickFrom([
      `You and ${target.name} talked for a long time by the fire. It felt like a real connection.`,
      `${target.name} opened up about their life back home. You listened. It seemed to matter.`,
      `The conversation with ${target.name} went deep. You learned something real about them.`,
    ]), hint: null };
  }
  if (delta > 0) {
    return { feedback: pickFrom([
      `You had a pleasant chat with ${target.name} while gathering water. Easy and comfortable.`,
      `You and ${target.name} talked briefly about camp life. Nothing deep, but friendly.`,
      `You checked in on ${target.name}. Short conversation, but they seemed to appreciate it.`,
    ]), hint: null };
  }
  return { feedback: pickFrom([
    `You tried to talk with ${target.name}, but the conversation went nowhere. Awkward.`,
    `${target.name} seemed distracted during your conversation. Something felt off.`,
  ]), hint: null };
}

function actionImprovecamp(state, player, tribemates) {
  // High social players get a little more credit from the tribe.
  const delta = player.social >= 7 ? 2 : 1;
  for (const mate of tribemates) {
    adjustRelationship(state, player.id, mate.id, delta);
  }
  return { feedback: pickFrom([
    `You spent the afternoon shoring up the shelter. A few tribemates thanked you.`,
    `You collected firewood and kept the fire going all night. The tribe noticed.`,
    `You reorganized the food supply and cleaned up camp. Nobody said much, but they saw.`,
    `You hauled water for hours without being asked. Small thing, but it was remembered.`,
  ]), hint: null };
}

function actionSearchIdol(state, player, tribemates) {
  if (tribemates.length === 0) {
    return { feedback: "There was no chance to slip away from camp today.", hint: null };
  }
  // A random tribemate notices the absence.
  const witness = tribemates[Math.floor(Math.random() * tribemates.length)];
  adjustRelationship(state, player.id, witness.id, -rand(1, 2));

  return { feedback: pickFrom([
    `You slipped away into the jungle to search. You found nothing — and ${witness.name} was watching when you got back.`,
    `An hour in the trees, hands in the dirt. Nothing. ${witness.name} gave you a long look when you returned to camp.`,
    `You told the tribe you were getting water, then spent an hour searching. ${witness.name} seemed skeptical.`,
  ]), hint: null };
}

function actionStrategy(state, player, target) {
  // The closer your strategy stats, the better the conversation goes.
  const gap = Math.abs(player.strategy - target.strategy);
  let delta;
  if (gap <= 2)      delta = rand(2, 5);   // aligned thinkers
  else if (gap <= 5) delta = rand(0, 2);   // lukewarm
  else               delta = -rand(1, 3);  // different reads on the game

  adjustRelationship(state, player.id, target.id, delta);

  if (delta >= 3) {
    return { feedback: pickFrom([
      `${target.name} nodded as you talked through the vote. You seem to be on the same page.`,
      `Your read matched ${target.name}'s exactly. They leaned in. This could be the start of something.`,
      `${target.name} lit up when you shared your thinking. They'd been waiting for someone to say it.`,
    ]), hint: null };
  }
  if (delta >= 0) {
    return { feedback: pickFrom([
      `${target.name} listened to your pitch but stayed noncommittal. Hard to read.`,
      `The strategy talk with ${target.name} was polite but vague. They didn't bite.`,
      `${target.name} nodded along. You couldn't tell if they agreed or were just being polite.`,
    ]), hint: null };
  }
  return { feedback: pickFrom([
    `${target.name} didn't seem to like your read. They changed the subject quickly.`,
    `You pitched your plan to ${target.name}. They smiled and said nothing. That's a bad sign.`,
    `${target.name} pushed back. You see the game differently. That gap might matter later.`,
  ]), hint: null };
}

function actionAskVote(state, player, target, tribemates) {
  // Small trust boost — they feel you value their opinion.
  adjustRelationship(state, player.id, target.id, rand(1, 2));

  // Find who this person likes least among the other tribemates.
  const others    = tribemates.filter(m => m.id !== target.id);
  let worstScore  = Infinity;
  let worstTarget = null;

  for (const other of others) {
    const score = getRelationship(state, target.id, other.id);
    if (score < worstScore) {
      worstScore  = score;
      worstTarget = other;
    }
  }

  if (!worstTarget) {
    return {
      feedback: `${target.name} shrugged. "I'm keeping my options open," they said.`,
      hint: null,
    };
  }

  return {
    feedback: pickFrom([
      `${target.name} paused before answering. "I just don't fully trust ${worstTarget.name}," they said quietly.`,
      `${target.name} glanced around camp, then said, "I've got my eye on ${worstTarget.name}."`,
      `"Honestly?" ${target.name} said. "I'm worried about ${worstTarget.name}. Something feels off."`,
    ]),
    hint: worstTarget.name,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
