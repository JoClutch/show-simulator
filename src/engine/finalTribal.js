// finalTribal.js — Final Tribal Council jury vote engine
//
// ── Format ────────────────────────────────────────────────────────────────────
// Final 3: three finalists face a jury of up to 7.
// Each juror casts one vote FOR the finalist they want to win.
// The finalist with the most votes is declared Sole Survivor.
//
// ── Jury vote model ───────────────────────────────────────────────────────────
// Each juror scores all finalists and votes for the highest-scoring one.
// Score = sentiment + speechBonus − suspicion + social + strategy + noise(±5)
//
//   sentiment   : snapshotted at the juror's elimination; the dominant factor
//   speechBonus : flat bonus applied only to the player (set by opening speech)
//   suspicion   : each point = −2; jurors punish perceived dirty gameplay
//   social      : +0.8 per point; likeable players earn respect
//   strategy    : +0.5 per point; jurors recognise good game play
//   noise       : ±5 random element — jury votes are never certain

// ── Dev flag ──────────────────────────────────────────────────────────────────
const FINAL_TRIBAL_DEBUG = false;

// ── Vote computation ──────────────────────────────────────────────────────────

// Returns an array of { voter: juror, target: finalist } objects — one per juror.
//
// speechBonus: optional { [finalistId]: number } — flat bonus added to a
// finalist's score from every juror. Pass { [player.id]: bonus } to apply
// the player's opening speech without affecting AI finalists.
function computeFinalVotes(state, finalists, speechBonus) {
  speechBonus = speechBonus ?? {};

  return state.jury.map(juror => {
    const target = pickJuryVoteTarget(juror, finalists, speechBonus);
    if (FINAL_TRIBAL_DEBUG) {
      console.log(`[FTC] ${juror.name} → ${target.name}`);
    }
    return { voter: juror, target };
  });
}

// Scores each finalist and returns the one this juror prefers most.
function pickJuryVoteTarget(juror, finalists, speechBonus) {
  const scored = finalists.map(finalist => ({
    contestant: finalist,
    score:      scoreFinalist(juror, finalist, speechBonus[finalist.id] ?? 0),
  }));

  scored.sort((a, b) => b.score - a.score);

  if (FINAL_TRIBAL_DEBUG) {
    console.log(
      `  ${juror.name} scores: ` +
      scored.map(s => `${s.contestant.name}=${s.score.toFixed(1)}`).join(", ")
    );
  }

  return scored[0].contestant;
}

// Computes a juror's preference score for a single finalist.
// Higher score = juror is more likely to vote for this finalist.
function scoreFinalist(juror, finalist, speechBonus) {
  const sentiment = juror.sentiment?.[finalist.id] ?? 0;
  const suspicion = (finalist.suspicion ?? 0) * 2;
  const social    = finalist.social    * 0.8;
  const strategy  = finalist.strategy  * 0.5;
  const noise     = (Math.random() - 0.5) * 10     // ±5 base
                  * (window.DEV_CONFIG?.voteNoiseMultiplier ?? 1);

  const score = sentiment + speechBonus - suspicion + social + strategy + noise;

  if (FINAL_TRIBAL_DEBUG) {
    console.log(
      `    ${finalist.name}: sent=${sentiment.toFixed(1)} ` +
      `speech=+${speechBonus.toFixed(1)} ` +
      `susp=${(-suspicion).toFixed(1)} ` +
      `soc=+${social.toFixed(1)} str=+${strategy.toFixed(1)} ` +
      `noise=${noise.toFixed(1)} → ${score.toFixed(1)}`
    );
  }

  return score;
}

// ── Tallying ──────────────────────────────────────────────────────────────────

// Returns the finalist who received the most jury votes.
// Ties broken by random draw (can occur with an even-numbered jury).
function tallyFinalVotes(votes) {
  const counts = {};
  for (const { target } of votes) {
    counts[target.id] = (counts[target.id] ?? 0) + 1;
  }

  const max      = Math.max(...Object.values(counts));
  const tiedIds  = Object.keys(counts).filter(id => counts[id] === max);
  const winnerId = tiedIds[Math.floor(Math.random() * tiedIds.length)];

  return votes.find(v => v.target.id === winnerId).target;
}
