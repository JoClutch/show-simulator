// screenRewardChallenge.js — reward challenge phase (v10.4 placeholder)
//
// New phase between Camp Life phase 1 and the Immunity Challenge. Resolves
// a reward outcome from the REWARD_CHALLENGES / INDIVIDUAL_REWARD_CHALLENGES
// engine pools and writes the result onto state.rewardWinner +
// state.rewardChallenge so any downstream code (Camp Life flavor, Episode
// Recap of the reward, etc.) can read it.
//
// v10.4 SCOPE: this is a deliberate placeholder. The flow + state wiring
// are the goal of this phase; the polished BrantSteele-style reward UI
// (tribe rosters, portraits, dramatic outcome card) lands in the next
// phase. The placeholder is functional — it runs the engine, shows the
// result, and routes to the Immunity Challenge on Continue.
//
// DESIGN RULE (do not violate without spec change):
//   The reward outcome MUST NOT alter any strategic state — no idol
//   clues, no immunity, no advantages, no AI relationship shifts. It is
//   pure flavor. The fields written here are read by display code only.

function renderRewardChallengeScreen(container, state) {
  const isMerged = !!state.merged;

  // Resolve the reward by reusing the existing challenge engine with the
  // reward-specific pool. Returns { winner, loser, ... } pre-merge, or
  // { winner, runnerUp, ... } post-merge — same shape as the immunity
  // resolver because they share the engine.
  const result = isMerged
    ? runIndividualChallenge(state.tribes.merged, INDIVIDUAL_REWARD_CHALLENGES)
    : runChallenge(state.tribes, REWARD_CHALLENGES);

  // Persist the outcome on state for any downstream display code.
  // Pre-merge: a tribe label. Post-merge: the winning contestant's id.
  state.rewardWinner    = isMerged ? result.winner.id : result.winner;
  state.rewardChallenge = {
    name:          result.name,
    description:   result.description,
    challengeType: result.challengeType,
  };

  const winnerLabel = _formatRewardWinnerLabel(state, result, isMerged);

  container.innerHTML = `
    <div class="screen reward-challenge-screen" data-render-version="v10.4-reward">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Reward Challenge</h2>
      <p class="challenge-type-label">${escapeHtml(result.name)}</p>

      <div class="event-log">
        <p>${escapeHtml(result.description)}</p>
      </div>

      <div class="reward-outcome-card">
        <div class="reward-outcome-label">Reward won by</div>
        <div class="reward-outcome-winner">${winnerLabel}</div>
        <p class="reward-outcome-flavor muted">
          A flavor moment, not a strategic one — no immunity is at stake here.
        </p>
      </div>

      <div class="spacer">
        <button id="reward-continue-btn">Continue to Immunity Challenge →</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector("#reward-continue-btn");
  continueBtn.addEventListener("click", onRewardChallengeResolved);
  continueBtn.focus();
}

// Returns a human-readable label of who won the reward, in the screen's
// FORMAT_BY_SCREEN context. Pre-merge: tribe color + name. Post-merge:
// individual contestant's first name + small portrait reference.
function _formatRewardWinnerLabel(state, result, isMerged) {
  if (isMerged) {
    const winner = result.winner;
    return `<span class="reward-outcome-winner-name">${escapeHtml(getPlayerDisplayName(winner, "first"))}</span>`;
  }
  // Pre-merge — winner is "A" or "B"
  const tribeName  = SEASON_CONFIG.tribeNames[result.winner];
  const tribeColor = SEASON_CONFIG.tribeColors[result.winner];
  return `<span class="reward-outcome-winner-name" style="color:${escapeHtmlAttr(tribeColor)}">${escapeHtml(tribeName)}</span>`;
}
