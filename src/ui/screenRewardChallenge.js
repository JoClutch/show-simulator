// screenRewardChallenge.js — reward challenge phase (v10.5)
//
// Polished reward challenge UI sitting between Camp Life phase 1 and the
// Immunity Challenge. Visually mirrors the Immunity Challenge screen so
// the two phases feel like the same kind of beat — same eyebrow, same
// roster grid, same description block, same outcome layout, same player
// status banner, same Continue affordance.
//
// What's different from the Immunity Challenge screen:
//   • Title reads "Reward Challenge" (vs "Immunity Challenge" /
//     "Individual Immunity").
//   • Outcome panels read "Reward" / "No Reward" (vs "Immunity" /
//     "Tribal Council"). Sub-copy never says "safe from the vote",
//     "someone goes home", or anything implying immunity stakes.
//   • The player-status banner uses reward-specific flavor — joy /
//     disappointment about the reward — and never references safety
//     from voting.
//   • Continue button reads "Continue to Immunity Challenge →" so the
//     player understands what's next.
//   • Outcome cards use a softer green/neutral pairing (reward feels
//     like an unalloyed positive moment, not a stakes split).
//
// DESIGN RULE (do not violate without spec change):
//   The reward outcome MUST NOT alter strategic state. State.rewardWinner
//   and state.rewardChallenge are written for display purposes only.
//   No idol clues, no immunity, no advantages, no AI shifts. Reward is
//   pure flavor.

function renderRewardChallengeScreen(container, state) {
  // v10.7 safety: snapshot strategic fields BEFORE running the reward
  // render. The renderer is allowed to write rewardWinner / rewardChallenge,
  // but everything else must be unchanged when the user clicks Continue.
  // The Continue handler in main.js (onRewardChallengeResolved) verifies
  // the snapshot and logs a loud error if any strategic field drifted.
  state._rewardStrategicSnapshot = snapshotStrategicFields(state);

  if (state.merged) {
    renderIndividualRewardScreen(container, state);
  } else {
    renderTribalRewardScreen(container, state);
  }

  // Immediate post-render check — catches any sync mutations that happen
  // during the render itself. The Continue check catches anything the
  // user-facing render queues for later. Two checks ensure the boundary
  // holds whether mutations are sync or async.
  assertStrategicFieldsUnchanged(state, state._rewardStrategicSnapshot, "reward (render)");
}

// ── Pre-merge: tribal reward ────────────────────────────────────────────────

function renderTribalRewardScreen(container, state) {
  // v10.11: scheduled reward override (if pre-built season pinned this
  // episode's reward) or random from REWARD_CHALLENGES.
  const scheduled = getScheduledChallenge(state, "reward");
  const result    = runChallenge(state.tribes, REWARD_CHALLENGES, scheduled);

  // Persist for downstream display (Camp Life flavor, Episode Recap, etc.).
  // Display-only — never read by AI, vote, alliance, or idol code.
  // v10.6: also carry rewardType / rewardLabel / rewardSubcopy so any later
  // surface (Camp Life "your tribe still has the spice box from yesterday"
  // line, dev panel, future camp resource system) can read what was won.
  state.rewardWinner    = result.winner;
  state.rewardChallenge = {
    name:          result.name,
    description:   result.description,
    challengeType: result.challengeType,
    purpose:       "reward",
    rewardType:    result.rewardType,
    rewardLabel:   result.rewardLabel,
    rewardSubcopy: result.rewardSubcopy,
  };

  const winnerName  = SEASON_CONFIG.tribeNames[result.winner];
  const loserName   = SEASON_CONFIG.tribeNames[result.loser];
  const winnerColor = SEASON_CONFIG.tribeColors[result.winner];
  const loserColor  = SEASON_CONFIG.tribeColors[result.loser];

  const playerTribeLabel = getPlayerTribeLabel();
  const playerWon        = playerTribeLabel === result.winner;

  const closeSuffix = result.wasClose ? pickFlavor(CHALLENGE_CLOSE_SUFFIXES) : "";
  const description = result.description + closeSuffix;

  const playerNote = playerWon
    ? "Your tribe heads back with the reward. Camp morale lifts a notch."
    : "Your tribe walks back empty-handed. Tonight's not the night for comfort.";

  const continueLabel = "Continue to Immunity Challenge →";

  // Tribe rosters — same shared component the Immunity screen uses.
  const rosterA = buildTribeRosterHTML("A", state.tribes.A, {
    name:          SEASON_CONFIG.tribeNames.A,
    color:         SEASON_CONFIG.tribeColors.A,
    isPlayerTribe: playerTribeLabel === "A",
    playerId:      state.player?.id,
  });
  const rosterB = buildTribeRosterHTML("B", state.tribes.B, {
    name:          SEASON_CONFIG.tribeNames.B,
    color:         SEASON_CONFIG.tribeColors.B,
    isPlayerTribe: playerTribeLabel === "B",
    playerId:      state.player?.id,
  });

  container.innerHTML = `
    <div class="screen" data-render-version="v10.5-reward-tribal">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Reward Challenge</h2>

      <div class="challenge-roster-grid">
        ${rosterA}
        ${rosterB}
      </div>

      <p class="challenge-type-label">${escapeHtml(result.name)}</p>
      <div class="event-log">
        <p>${escapeHtml(description)}</p>
      </div>

      <div class="challenge-outcome-grid">
        <div class="challenge-outcome-cell outcome-reward-win">
          <div class="outcome-label">Reward</div>
          <div class="outcome-tribe" style="color:${winnerColor}">${escapeHtml(winnerName)}</div>
          <div class="outcome-sub">Wins ${escapeHtml(result.rewardLabel ?? "the reward")}</div>
        </div>
        <div class="challenge-outcome-cell outcome-reward-loss">
          <div class="outcome-label">No Reward</div>
          <div class="outcome-tribe" style="color:${loserColor}">${escapeHtml(loserName)}</div>
          <div class="outcome-sub">Heads back to camp empty-handed</div>
        </div>
      </div>

      ${result.rewardSubcopy ? `
        <p class="reward-flavor-subcopy">${escapeHtml(result.rewardSubcopy)}</p>
      ` : ""}

      <div class="challenge-player-status ${playerWon ? "status-reward-win" : "status-reward-loss"}">
        <p>${escapeHtml(playerNote)}</p>
      </div>

      <div class="spacer">
        <button id="reward-continue-btn">${continueLabel}</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector("#reward-continue-btn");
  continueBtn.addEventListener("click", onRewardChallengeResolved);
  continueBtn.focus();
}

// ── Post-merge: individual reward ───────────────────────────────────────────

function renderIndividualRewardScreen(container, state) {
  const members = state.tribes.merged;
  // v10.11: scheduled override (if pre-built season pinned this episode's
  // reward) or random from INDIVIDUAL_REWARD_CHALLENGES.
  const scheduled = getScheduledChallenge(state, "reward");
  const result    = runIndividualChallenge(members, INDIVIDUAL_REWARD_CHALLENGES, scheduled);

  state.rewardWinner    = result.winner.id;
  state.rewardChallenge = {
    name:          result.name,
    description:   result.description,
    challengeType: result.challengeType,
  };

  const player    = state.player;
  const playerWon = result.winner.id === player.id;

  const closeSuffix = result.wasClose ? pickFlavor(CHALLENGE_CLOSE_SUFFIXES) : "";
  const description = result.description + closeSuffix;

  const playerNote = playerWon
    ? "You earned a real moment of comfort today. Tomorrow you're back in the game."
    : `${escapeHtml(getPlayerDisplayName(result.winner, "first"))} got the reward. You'll be hungry tonight.`;

  const continueLabel = "Continue to Immunity Challenge →";

  const mergedRoster = buildTribeRosterHTML("merged", members, {
    name:          SEASON_CONFIG.mergeTribeName,
    color:         SEASON_CONFIG.mergeTribeColor,
    isPlayerTribe: true,
    playerId:      state.player?.id,
  });

  container.innerHTML = `
    <div class="screen" data-render-version="v10.5-reward-individual">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.challenge}</p>
      <h2>Reward Challenge</h2>

      <div class="challenge-roster-grid challenge-roster-grid-single">
        ${mergedRoster}
      </div>

      <p class="challenge-type-label">${escapeHtml(result.name)}</p>
      <div class="event-log">
        <p>${escapeHtml(description)}</p>
      </div>

      <div class="indiv-reward-winner">
        <div class="reward-icon" aria-hidden="true">◈</div>
        ${renderPlayerPortrait(result.winner, { size: "large", extraClass: "player-portrait--stacked" })}
        <div class="reward-winner-name">${escapeHtml(getPlayerDisplayName(result.winner, FORMAT_BY_SCREEN.challenge))}</div>
        <div class="reward-winner-sub">
          wins ${escapeHtml(result.rewardLabel ?? "the reward")}
        </div>
        ${result.rewardSubcopy ? `
          <p class="reward-flavor-subcopy reward-winner-flavor">${escapeHtml(result.rewardSubcopy)}</p>
        ` : ""}
      </div>

      <div class="challenge-player-status ${playerWon ? "status-reward-win" : "status-reward-loss"}">
        <p>${playerNote}</p>
      </div>

      <div class="spacer">
        <button id="reward-continue-btn">${continueLabel}</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector("#reward-continue-btn");
  continueBtn.addEventListener("click", onRewardChallengeResolved);
  continueBtn.focus();
}
