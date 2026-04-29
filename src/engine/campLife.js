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

const CAMP_ACTIONS = [
  {
    id: "talk",
    label: "Talk to a tribemate",
    detail: "Get to know someone. Builds the relationship over time.",
    needsTarget: true,
  },
  {
    id: "improvecamp",
    label: "Improve camp",
    detail: "Pull your weight. The whole tribe notices.",
    needsTarget: false,
  },
  {
    id: "searchidol",
    label: "Search for an idol",
    detail: "Slip away into the jungle. Being seen raises suspicion.",
    needsTarget: false,
  },
  {
    id: "strategy",
    label: "Discuss strategy",
    detail: "Float vote ideas. Works best when you think alike.",
    needsTarget: true,
  },
  {
    id: "askVote",
    label: "Ask who they want out",
    detail: "Fish for intel. What you hear depends on how much they trust you.",
    needsTarget: true,
  },
  {
    id: "confide",
    label: "Open up to someone",
    detail: "Share something real. The fastest way to build genuine trust.",
    needsTarget: true,
  },
  {
    id: "lobby",
    label: "Push a vote",
    detail: "Steer attention toward someone. Strategy and social skill determine how it lands.",
    needsTarget: true,
    targetPrompt: "Who do you want to draw attention toward?",
  },
  {
    id: "laylow",
    label: "Keep a low profile",
    detail: "Stay quiet and unthreatening. Eases suspicion when you're in the crosshairs.",
    needsTarget: false,
  },
];

// ── Entry point ───────────────────────────────────────────────────────────────

// Executes one camp action. Mutates state and/or contestant objects.
// Returns { feedback: string, hint: string|null }
// hint carries a name when an action reveals who someone is watching.
function executeAction(state, actionId, player, tribemates, target) {
  switch (actionId) {
    case "talk":        return actionTalk(state, player, target);
    case "improvecamp": return actionImprovecamp(state, player, tribemates);
    case "searchidol":  return actionSearchIdol(state, player, tribemates);
    case "strategy":    return actionStrategy(state, player, target);
    case "askVote":     return actionAskVote(state, player, target, tribemates);
    case "confide":     return actionConfide(state, player, target);
    case "lobby":       return actionLobby(state, player, tribemates, target);
    case "laylow":      return actionLayLow(state, player, tribemates);
    default:            return { feedback: "Nothing happened.", hint: null };
  }
}

// ── Action implementations ────────────────────────────────────────────────────

// TALK — relationship builder.
//
// Backfire chance starts at 20% and drops by 2% per trust point with the target,
// so a trusted ally (trust 8) has only a 4% chance of an awkward conversation.
// A strong deep connection (delta ≥ 5) also yields a small trust gain.
//
// Formula:
//   backfireChance = max(0, 0.20 − trust × 0.02)
//   delta (success) = floor(social / 3) + rand(1, 3)   [roughly 2–6 for social 5]
//   delta (backfire) = −rand(1, 3)
//   trust gain on deep connection (delta ≥ 5): +1
function actionTalk(state, player, target) {
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
    ]), hint: null };
  }

  const delta = Math.floor(player.social / 3) + rand(1, 3);
  adjustRelationship(state, player.id, target.id, delta);

  if (delta >= 5) {
    adjustTrust(state, player.id, target.id, 1);
    return { feedback: pickFrom([
      `You and ${target.name} talked for a long time by the fire. It felt like a real connection.`,
      `${target.name} opened up about their life back home. You listened. It seemed to matter.`,
      `The conversation with ${target.name} went deep. You learned something real about them.`,
    ]), hint: null };
  }

  return { feedback: pickFrom([
    `You had a pleasant chat with ${target.name} while gathering water. Easy and comfortable.`,
    `You and ${target.name} talked briefly about camp life. Nothing deep, but friendly.`,
    `You checked in on ${target.name}. Short conversation, but they seemed to appreciate it.`,
  ]), hint: null };
}

// IMPROVE CAMP — tribe-wide relationship builder and suspicion reducer.
//
// High-social players earn more goodwill (tribe sees them as warm contributors,
// not just performing). Anyone actively working also dispels suspicion — a player
// clearly pulling their weight isn't plotting.
//
// Formula:
//   delta = 2 if social ≥ 7, else 1
//   all tribemates get that relationship delta
//   player's own suspicion −1 (clamped at 0)
function actionImprovecamp(state, player, tribemates) {
  const delta = player.social >= 7 ? 2 : 1;
  for (const mate of tribemates) {
    adjustRelationship(state, player.id, mate.id, delta);
  }
  adjustSuspicion(state, player.id, -1);

  return { feedback: pickFrom([
    `You spent the afternoon shoring up the shelter. A few tribemates thanked you.`,
    `You collected firewood and kept the fire going all night. The tribe noticed.`,
    `You reorganized the food supply and cleaned up camp. Nobody said much, but they saw.`,
    `You hauled water for hours without being asked. Small thing, but it was remembered.`,
  ]), hint: null };
}

// SEARCH FOR IDOL — high-risk recon action. No idol found yet (Phase 2+).
//
// A random tribemate always notices the absence. Their relationship and trust
// both drop — they saw you sneak away and now they're wondering why.
// The player's own suspicion increases based on how socially unaware they are.
// Players with very low social (< 4) were noticeably less subtle.
//
// Formula:
//   witness relationship: −rand(1, 2)
//   witness trust in player: −1
//   player suspicion: +rand(1, 2) base, +1 extra if social < 4
function actionSearchIdol(state, player, tribemates) {
  if (tribemates.length === 0) {
    return { feedback: "There was no chance to slip away from camp today.", hint: null };
  }

  const witness = pickFrom(tribemates);
  adjustRelationship(state, player.id, witness.id, -rand(1, 2));
  adjustTrust(state, player.id, witness.id, -1);

  const suspicionGain = rand(1, 2) + (player.social < 4 ? 1 : 0);
  adjustSuspicion(state, player.id, suspicionGain);

  return { feedback: pickFrom([
    `You slipped away into the jungle to search. You found nothing — and ${witness.name} was watching when you got back.`,
    `An hour in the trees, hands in the dirt. Nothing. ${witness.name} gave you a long look when you returned to camp.`,
    `You told the tribe you were getting water, then spent an hour searching. ${witness.name} seemed skeptical.`,
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
  const gap     = Math.abs(player.strategy - target.strategy);
  const lowTrust = getTrust(state, player.id, target.id) < 3;
  let delta;

  if (gap <= 2) {
    delta = rand(2, 5) + (lowTrust ? -1 : 0);
  } else if (gap <= 5) {
    delta = rand(0, 2) + (lowTrust ? -1 : 0);
  } else {
    delta = -rand(1, 3) + (lowTrust ? -1 : 0);
  }

  adjustRelationship(state, player.id, target.id, delta);
  if (delta >= 3) adjustTrust(state, player.id, target.id, 1);

  if (lowTrust && delta < 1) {
    return { feedback: pickFrom([
      `${target.name} listened to your pitch, but their arms were crossed the whole time. Something is off between you two.`,
      `You tried to open up about the vote with ${target.name}. They nodded along, but it felt guarded. You're not there yet.`,
    ]), hint: null };
  }

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
  const trust = getTrust(state, player.id, target.id);

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

  if (!realTarget) {
    return {
      feedback: `${target.name} shrugged. "I'm keeping my options open," they said.`,
      hint: null,
    };
  }

  // Trust 0–2: distrustful — may mislead.
  if (trust <= 2) {
    const mislead = Math.random() < 0.50;
    if (mislead) {
      // Pick a random decoy that isn't the real target or the player.
      const decoys = others.filter(o => o.id !== realTarget.id);
      const decoy  = decoys.length > 0 ? pickFrom(decoys) : realTarget;
      return {
        feedback: pickFrom([
          `${target.name} paused, then said, "Honestly? I've been thinking about ${decoy.name}." Something in their tone felt off.`,
          `"${decoy.name} is the one I'm worried about," ${target.name} said flatly. But their eyes didn't quite match their words.`,
        ]),
        hint: decoy.name,
      };
    }
    return {
      feedback: `${target.name} gave you a long look. "I haven't really decided yet," they said. You're not sure you believe them.`,
      hint: null,
    };
  }

  // Trust 3–5: guarded — honest but hedged.
  if (trust <= 5) {
    return {
      feedback: pickFrom([
        `${target.name} glanced around camp, then said, "I've been thinking about ${realTarget.name} — but I'm not locked in yet."`,
        `"Honestly?" ${target.name} said. "I've got my eye on ${realTarget.name}. Something feels off." They left it there.`,
        `${target.name} paused before answering. "I just don't fully trust ${realTarget.name}," they said quietly.`,
      ]),
      hint: realTarget.name,
    };
  }

  // Trust 6+: open — direct and candid.
  return {
    feedback: pickFrom([
      `${target.name} leaned in and spoke plainly. "${realTarget.name}. I've already talked to a couple people. We're on the same page."`,
      `"You want the truth?" ${target.name} said. "It's ${realTarget.name}. No question." They meant it.`,
      `${target.name} didn't hesitate. "${realTarget.name} is the one. I'll fill you in on everything later."`,
    ]),
    hint: realTarget.name,
  };
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
  const backfire   = Math.random() < 0.15;
  const trustGain  = 2 + Math.floor(player.social / 4);

  if (backfire) {
    adjustRelationship(state, player.id, target.id, -rand(1, 2));
    return { feedback: pickFrom([
      `You opened up to ${target.name}, but the moment fell flat. They seemed uncomfortable. It didn't land the way you hoped.`,
      `You shared something personal with ${target.name}. They were polite, but there was an awkward pause after. You wished you hadn't said it.`,
    ]), hint: null };
  }

  adjustTrust(state, player.id, target.id, trustGain);
  adjustRelationship(state, player.id, target.id, rand(1, 3));

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

// LOBBY (PUSH A VOTE) — suspicion raiser; risky for low-social players.
//
// "target" is the person you're steering attention toward. The engine picks a
// random listener from the remaining tribemates to receive your pitch.
// If there's no available listener (tribe too small), the action fizzles.
//
// How well it lands depends on your social and strategy stats:
//   social ≥ 6 or strategy ≥ 6 → clean execution, no backlash
//   social < 6 AND strategy < 6 → listener's trust in you −1 (it felt transparent)
//   social < 4 AND strategy < 4 → additionally, your own suspicion +1 (you seemed desperate)
//
// Suspicion added to target:
//   base = 1 + floor(strategy / 5)   [strategy 0–4: +1, 5–9: +2, 10: +3]
function actionLobby(state, player, tribemates, target) {
  const potentialListeners = tribemates.filter(m => m.id !== target.id);

  if (potentialListeners.length === 0) {
    return {
      feedback: `With so few of you left, pitching against ${target.name} openly felt too risky. You held back.`,
      hint: null,
    };
  }

  const listener      = pickFrom(potentialListeners);
  const suspicionGain = 1 + Math.floor(player.strategy / 5);
  adjustSuspicion(state, target.id, suspicionGain);

  const cleanExecution = player.social >= 6 || player.strategy >= 6;
  const desperate      = player.social < 4 && player.strategy < 4;

  if (desperate) {
    adjustSuspicion(state, player.id, 1);
    adjustTrust(state, player.id, listener.id, -1);
    return { feedback: pickFrom([
      `You pushed hard on ${target.name} with ${listener.name}, but your pitch came out wrong. ${listener.name} looked uncomfortable. You may have drawn attention to yourself.`,
      `Your campaigning against ${target.name} landed badly with ${listener.name}. You could see them pulling back. You may have made things worse.`,
    ]), hint: null };
  }

  if (!cleanExecution) {
    adjustTrust(state, player.id, listener.id, -1);
    return { feedback: pickFrom([
      `You pulled ${listener.name} aside and raised concerns about ${target.name}. They listened, but you could tell they were evaluating you as much as your pitch.`,
      `You made your case to ${listener.name} about ${target.name}. It landed okay — but something in ${listener.name}'s expression made you second-guess yourself.`,
    ]), hint: null };
  }

  return { feedback: pickFrom([
    `You had a quiet word with ${listener.name} about ${target.name}. They nodded. You think the seed is planted.`,
    `You raised your concerns about ${target.name} with ${listener.name} at just the right moment. They seemed receptive.`,
    `You steered the conversation toward ${target.name} with ${listener.name}. Smooth. You think it landed.`,
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
  }

  return { feedback: pickFrom([
    `You kept to yourself today. No scheming, no drama. Sometimes disappearing from the radar is the right call.`,
    `You stayed visible but quiet — near the fire, helping where needed, not overstepping. You felt the pressure ease.`,
    `You let the others do the talking today. You listened, smiled at the right moments, and faded into the background. Safer here.`,
    `You spent the afternoon just being a normal tribemate. No moves. Sometimes not making a move is the move.`,
  ]), hint: null };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
