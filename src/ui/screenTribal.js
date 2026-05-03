// screenTribal.js — Tribal Council: vote → idol play → reveal
//
// Pre-merge:  only the losing tribe attends; state.tribalTribe = "A" | "B"
// Post-merge: full cast attends; state.tribalTribe = "merged";
//             the immunity holder cannot receive votes but still casts one
//
// Sub-phases (in order):
//   1.  Voting grid           — player picks one target; AI votes computed
//   1.5 Idol play (v3.3)      — player prompt + AI decisions; protects holders
//                                from votes against them. See runIdolPlayPhase.
//   2.  Dramatic reveal       — votes read; voided votes shown with "VOID"
//                                badge but never count toward the tally.
//
// Flavor text (openers, reveal intros, idol play lines) is sourced from
// src/data/flavor.js.

function renderTribalScreen(container, state) {
  if (state.merged) {
    renderMergedTribalScreen(container, state);
  } else {
    renderPreMergeTribalScreen(container, state);
  }
}

// ── Pre-merge: one tribe votes ────────────────────────────────────────────────

function renderPreMergeTribalScreen(container, state) {
  const tribeLabel = state.tribalTribe;
  const tribe      = state.tribes[tribeLabel];
  const tribeName  = SEASON_CONFIG.tribeNames[tribeLabel];
  const tribeColor = SEASON_CONFIG.tribeColors[tribeLabel];
  const player     = state.player;
  const eligible   = tribe.filter(c => c.id !== player.id);

  let playerVote = null;

  container.innerHTML = `
    <div class="screen">
      <div class="tribal-header">
        <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
        <h2>Tribal Council</h2>
        <div class="tribal-meta">
          <span style="color:${tribeColor}">${escapeHtml(tribeName)}</span>
          &nbsp;·&nbsp; ${tribe.length} members attending
          ${state.jury && state.jury.length > 0
            ? `&nbsp;·&nbsp; Jury of ${state.jury.length}`
            : ""}
        </div>
      </div>

      <p class="tribal-opener muted">${getTribalOpener(state)}</p>

      ${buildTribalAttendeesRibbonHTML(tribe, state)}
      ${buildTribalReadingCardHTML(state, tribe)}

      <p class="tribal-host-line">${pickFlavor(TRIBAL_PRE_VOTE_LINES)}</p>
      <p class="tribal-prompt">
        Vote for one tribemate to leave the game.
        Once your vote is cast it cannot be changed.
      </p>

      <div class="contestant-grid-2col" id="vote-grid"></div>

      <div class="spacer">
        <button id="cast-btn" disabled>Cast My Vote</button>
      </div>
    </div>
  `;

  buildVotingGrid(container, eligible, () => playerVote, v => { playerVote = v; });

  container.querySelector("#cast-btn").addEventListener("click", () => {
    if (!playerVote) return;
    const allVotes = collectAiVotes(state, tribe, playerVote, player);
    // Update alliance strength based on how members voted — runs on raw vote
    // intent (before idol play) since loyalty is tested by what people put in
    // the urn, not by what survives the count.
    processVotingAftermath(state, allVotes);
    detectVotingBlocs(state, allVotes);
    showTallyingBeat(container, state, () => {
      runIdolPlayPhase(container, state, tribe, protectedIds => {
        runVoteResolution(container, state, tribe, allVotes, protectedIds);
      });
    });
  });
}

// ── Post-merge: full cast votes ───────────────────────────────────────────────

function renderMergedTribalScreen(container, state) {
  const tribe      = state.tribes.merged;
  const player     = state.player;
  const mergeColor = SEASON_CONFIG.mergeTribeColor;
  const mergeName  = SEASON_CONFIG.mergeTribeName;

  // The immunity holder cannot receive votes (but still casts one).
  // If the player IS the holder, eligible = everyone except the player.
  const eligible = tribe.filter(c =>
    c.id !== player.id && c.id !== state.immunityHolder
  );

  // Identify the holder for display — may be player or an AI.
  const holder = tribe.find(c => c.id === state.immunityHolder);

  let playerVote = null;

  container.innerHTML = `
    <div class="screen">
      <div class="tribal-header">
        <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
        <h2>Tribal Council</h2>
        <div class="tribal-meta">
          <span style="color:${mergeColor}">${escapeHtml(mergeName)}</span>
          &nbsp;·&nbsp; ${tribe.length} players attending
          ${state.jury.length > 0
            ? `&nbsp;·&nbsp; Jury of ${state.jury.length}`
            : ""}
        </div>
      </div>

      <p class="tribal-opener muted">${getTribalOpener(state)}</p>

      ${holder ? `
        <div class="tribal-immunity-note">
          <span class="immunity-icon">⬡</span>
          <strong>${holder.id === player.id ? "You hold" : `${escapeHtml(getPlayerDisplayName(holder, FORMAT_BY_SCREEN.tribal))} holds`}
          Individual Immunity</strong> and cannot be voted out tonight.
        </div>
      ` : ""}

      ${buildTribalAttendeesRibbonHTML(tribe, state)}
      ${buildTribalReadingCardHTML(state, tribe)}

      <p class="tribal-host-line">${pickFlavor(TRIBAL_PRE_VOTE_LINES)}</p>
      <p class="tribal-prompt">
        Vote for one player to leave the game.
        The immunity holder cannot receive votes.
        Once your vote is cast it cannot be changed.
      </p>

      <div class="contestant-grid-2col" id="vote-grid"></div>

      <div class="spacer">
        <button id="cast-btn" disabled>Cast My Vote</button>
      </div>
    </div>
  `;

  buildVotingGrid(container, eligible, () => playerVote, v => { playerVote = v; });

  container.querySelector("#cast-btn").addEventListener("click", () => {
    if (!playerVote) return;

    // Voters = everyone; candidates = everyone except immunity holder.
    const votePool = tribe.filter(c => c.id !== state.immunityHolder);
    const allVotes = collectAiVotes(state, tribe, playerVote, player, votePool);
    processVotingAftermath(state, allVotes);
    detectVotingBlocs(state, allVotes);
    showTallyingBeat(container, state, () => {
      runIdolPlayPhase(container, state, tribe, protectedIds => {
        runVoteResolution(container, state, tribe, allVotes, protectedIds);
      });
    });
  });
}

// v6.8: brief "I'll go tally the votes" beat between vote cast and idol
// play / reveal. Sits as a quiet interstitial — just a host-style line
// with a short hold so the moment doesn't slam straight from cast button
// to idol prompt or vote read.
function showTallyingBeat(container, state, onContinue) {
  const line = pickFlavor(TRIBAL_POST_VOTE_LINES);
  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Tribal Council</h2>
      <p class="tribal-host-line tribal-host-line-centered">${escapeHtml(line)}</p>
    </div>
  `;
  setTimeout(onContinue, 1100);
}

// ── v6.4: Tie / revote / rocks resolution ───────────────────────────────────
//
// Single entry point for tallying votes and handling the full Survivor-style
// tie-resolution flow:
//
//   1. Initial tally. If a single name leads → reveal phase as before.
//   2. If tied: announce the tie, run revote (player picks among tied;
//      tied players can't vote), tally again.
//   3. If still tied after revote: announce persistent tie, run rocks
//      (every non-tied non-immune attendee draws; random elimination).
//   4. Reveal phase plays the chosen original-vote ordering, but if tie-
//      resolution fired, an interstitial summary is shown first and the
//      eliminated identity comes from the resolution path.

function runVoteResolution(container, state, attendees, originalVotes, protectedIds) {
  const result = tallyVotes(originalVotes, state, protectedIds);

  if (result.kind === "decided") {
    if (!result.eliminated) {
      // Defensive: every vote was voided AND the fallback pool was empty.
      // Surface a graceful continue rather than trapping the player.
      renderTribalDeadEndScreen(container, state);
      return;
    }
    const revealOrder = buildRevealOrder(originalVotes, result.eliminated.id);
    // v6.6: stash fallout metadata on state so onTribalDone can read it.
    state._lastTribalMeta = {
      allVotes:       originalVotes,
      originalVotes,
      revoteVotes:    null,
      resolutionKind: "decided",
      protectedIds,
    };
    renderRevealPhase(container, state, revealOrder, result.eliminated, protectedIds, originalVotes);
    return;
  }

  // Tied — announce, then revote.
  showTieAnnouncement(container, state, attendees, result.tiedIds, result.counts, () => {
    runRevotePhase(container, state, attendees, originalVotes, result.tiedIds, protectedIds);
  });
}

function showTieAnnouncement(container, state, attendees, tiedIds, counts, onContinue) {
  const tiedNames = tiedIds
    .map(id => {
      const c = attendees.find(c => c.id === id);
      return c ? getPlayerDisplayName(c, FORMAT_BY_SCREEN.tribal) : "?";
    })
    .filter(n => n !== "?");
  const voteCount = counts[tiedIds[0]] ?? 0;

  // v6.7: rule-text variants so the moment doesn't read identically each
  // time a tie occurs. Each variant says the same thing in slightly
  // different words so the rules remain crystal clear.
  const ruleVariants = [
    "We will revote. Only the tied players can receive votes — and they themselves do not vote in this round.",
    "The tied players will not vote in the revote. Everyone else will choose between them.",
    "Revote: the rest of the tribe picks between the tied players. The tied themselves sit this one out.",
  ];
  const rule = ruleVariants[Math.floor(Math.random() * ruleVariants.length)];

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>The Vote Is Tied</h2>
      <div class="tribal-tie-card">
        <div class="tribal-tie-icon">⚖</div>
        <p class="tribal-tie-headline">
          ${tiedNames.map(n => `<strong>${escapeHtml(n)}</strong>`).join(" and ")}
          tied with ${voteCount} vote${voteCount !== 1 ? "s" : ""} each.
        </p>
        <p class="tribal-tie-rule">${escapeHtml(rule)}</p>
        <button id="tie-continue-btn" class="tribal-finish-btn">Continue to Revote →</button>
      </div>
    </div>
  `;
  container.querySelector("#tie-continue-btn").addEventListener("click", onContinue);
}

function runRevotePhase(container, state, attendees, originalVotes, tiedIds, protectedIds) {
  const tiedSet = new Set(tiedIds);
  const tiedContestants = attendees.filter(c => tiedSet.has(c.id));
  const player          = state.player;
  const playerIsTied    = tiedSet.has(player.id);

  // If the player IS tied, they don't get to revote — go straight to AI revote.
  if (playerIsTied) {
    const revoteBallots = collectRevoteVotes(state, attendees, tiedIds, null);
    finishRevote(container, state, attendees, originalVotes, tiedIds, revoteBallots, protectedIds);
    return;
  }

  // Player is eligible to revote. Render a focused picker showing only the
  // tied players as candidates.
  let playerRevote = null;

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Revote</h2>
      <p class="tribal-revote-instruction">
        Vote for one of the tied players to leave the game.
        <br><span class="muted">Tied players are not voting in this round.</span>
      </p>

      <div class="contestant-grid-2col" id="revote-grid"></div>

      <div class="spacer">
        <button id="revote-cast-btn" disabled>Cast My Revote</button>
      </div>
    </div>
  `;

  const grid = container.querySelector("#revote-grid");
  const castBtn = container.querySelector("#revote-cast-btn");
  for (const c of tiedContestants) {
    const card = document.createElement("div");
    card.className = "contestant-card contestant-card-vote";
    card.innerHTML = renderVoteTargetCardHTML(c);
    card.addEventListener("click", () => {
      grid.querySelectorAll(".contestant-card").forEach(el => el.classList.remove("selected"));
      card.classList.add("selected");
      playerRevote = c;
      castBtn.disabled = false;
    });
    grid.appendChild(card);
  }

  castBtn.addEventListener("click", () => {
    if (!playerRevote) return;
    const revoteBallots = collectRevoteVotes(state, attendees, tiedIds, playerRevote);
    finishRevote(container, state, attendees, originalVotes, tiedIds, revoteBallots, protectedIds);
  });
}

function finishRevote(container, state, attendees, originalVotes, tiedIds, revoteBallots, protectedIds) {
  // v6.6: cache for rocks-branch fallout in case revote also ties.
  state._lastTribalOriginalVotes = originalVotes;
  state._lastTribalRevoteVotes   = revoteBallots;
  state._lastTribalProtectedIds  = protectedIds;
  // Tally revote ballots. No idol play in the revote phase (idols are spent
  // pre-vote in the modern format), so protectedIds is empty for this tally.
  const result = tallyVotes(revoteBallots, state, new Set());

  if (result.kind === "decided" && result.eliminated) {
    // Revote resolved cleanly. Use the revote ballots for the reveal order
    // so the player sees how the room broke when forced to choose between
    // the tied players. The original-round votes are already history.
    const revealOrder = buildRevealOrder(revoteBallots, result.eliminated.id);
    // v6.6: stash fallout metadata. The "all votes" used for fallout is
    // the REVOTE — that's what produced the elimination.
    state._lastTribalMeta = {
      allVotes:       revoteBallots,
      originalVotes,
      revoteVotes:    revoteBallots,
      resolutionKind: "tie-revote",
      protectedIds,
    };
    showRevoteResolvedBeat(container, state, () => {
      renderRevealPhase(container, state, revealOrder, result.eliminated, new Set(), revoteBallots);
    });
    return;
  }

  // Revote still tied — escalate to rocks.
  showPersistentTieAnnouncement(container, state, attendees, result.tiedIds, () => {
    runRocksPhase(container, state, attendees, result.tiedIds);
  });
}

function showRevoteResolvedBeat(container, state, onContinue) {
  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Revote Cast</h2>
      <p class="tribal-reading-note muted">The room has decided. Reading the new votes…</p>
    </div>
  `;
  setTimeout(onContinue, 1400);
}

function showPersistentTieAnnouncement(container, state, attendees, tiedIds, onContinue) {
  const tiedNames = tiedIds
    .map(id => {
      const c = attendees.find(c => c.id === id);
      return c ? getPlayerDisplayName(c, FORMAT_BY_SCREEN.tribal) : "?";
    })
    .filter(n => n !== "?");

  // v6.7: variant rocks-rule lines so persistent ties don't all read
  // identically. Substance is identical across variants.
  const ruleVariants = [
    `We are going to rocks. Everyone except the tied players ${state.immunityHolder ? "and the Immunity holder " : ""}will draw a rock. Whoever draws the odd rock leaves the game.`,
    `Drawing rocks. The tied players ${state.immunityHolder ? "and the Immunity holder are " : "are "}safe. Everyone else has a chance of going home.`,
    `It comes down to chance now. Tied players ${state.immunityHolder ? "and Immunity " : ""}don't draw. The odd rock from the rest of the tribe is going home.`,
  ];
  const rule = ruleVariants[Math.floor(Math.random() * ruleVariants.length)];

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Still Tied</h2>
      <div class="tribal-tie-card tribal-tie-card-rocks">
        <div class="tribal-tie-icon">⬢</div>
        <p class="tribal-tie-headline">
          The revote is also tied between
          ${tiedNames.map(n => `<strong>${escapeHtml(n)}</strong>`).join(" and ")}.
        </p>
        <p class="tribal-tie-rule">${rule}</p>
        <button id="rocks-continue-btn" class="tribal-finish-btn">Continue to the Draw →</button>
      </div>
    </div>
  `;
  container.querySelector("#rocks-continue-btn").addEventListener("click", onContinue);
}

function runRocksPhase(container, state, attendees, tiedIds) {
  const result = drawRocks(state, attendees, tiedIds);

  if (!result.eliminated) {
    // Final guard — should never happen because drawRocks always returns
    // a contestant. Render a continue screen if it does.
    renderTribalDeadEndScreen(container, state);
    return;
  }

  // Render the rock-draw reveal.
  const drawerNames    = result.rockDrawers.map(c => getPlayerDisplayName(c, FORMAT_BY_SCREEN.tribal));
  const eliminatedName = getPlayerDisplayName(result.eliminated, FORMAT_BY_SCREEN.tribal);
  const fallbackNote = result.eliminatedFromTied
    ? `<p class="tribal-tie-rule muted">There was no neutral pool to draw from at this stage. The tie was resolved by chance among the tied players.</p>`
    : "";

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Drawing Rocks</h2>
      <div class="tribal-rocks-card">
        <div class="tribal-tie-icon">⬢</div>
        ${result.rockDrawers.length > 0 ? `
          <p class="tribal-tie-rule">
            Drawing rocks: ${drawerNames.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")}.
          </p>
        ` : ""}
        ${fallbackNote}
        <p class="tribal-rocks-result">
          The odd rock falls to <strong class="reveal-card-decisive">${escapeHtml(eliminatedName)}</strong>.
        </p>
        <button id="rocks-finish-btn" class="tribal-finish-btn">The tribe has spoken →</button>
      </div>
    </div>
  `;

  container.querySelector("#rocks-finish-btn").addEventListener("click", () => {
    // v6.6: stash fallout metadata for the rocks branch. allVotes here is
    // best-effort — we use the original ballots since rocks aren't ballots.
    // The resolutionKind drives the rocks-specific fallout effects.
    state._lastTribalMeta = {
      allVotes:       state._lastTribalOriginalVotes ?? [],
      originalVotes:  state._lastTribalOriginalVotes ?? [],
      revoteVotes:    state._lastTribalRevoteVotes ?? [],
      resolutionKind: "tie-rocks",
      protectedIds:   state._lastTribalProtectedIds ?? new Set(),
    };
    onTribalDone(result.eliminated);
  });
}

// Defensive dead-end screen: shows when tallyVotes returns no eliminable
// candidate. Should never fire in normal play but provides a graceful
// continue path so the player can never get trapped on Tribal.
function renderTribalDeadEndScreen(container, state) {
  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Tribal Council</h2>
      <p class="tribal-reading-note muted">No one was eliminated this Tribal — the votes resolved without a sendable target.</p>
      <button id="dead-end-btn" class="tribal-finish-btn">Continue →</button>
    </div>
  `;
  container.querySelector("#dead-end-btn").addEventListener("click", () => {
    advanceRound();
  });
}

// ── Shared: voting card grid ──────────────────────────────────────────────────

// Builds and appends contestant cards to #vote-grid.
// getVote / setVote are closures so the two tribal branches manage their own
// playerVote variable without sharing mutable state.
function buildVotingGrid(container, eligible, getVote, setVote) {
  const grid    = container.querySelector("#vote-grid");
  const castBtn = container.querySelector("#cast-btn");

  // v9.15: vote-casting cards intentionally show portrait + name ONLY — no
  // stat block. Players shouldn't be reading challenge/social/strategy
  // numbers while choosing whom to vote off; it pushes the choice toward
  // a calculator instead of a read of the room. Stats remain on the
  // Selection screen via screenSelect.js's renderContestantStatsHTML call.
  for (const c of eligible) {
    const card = document.createElement("div");
    card.className = "contestant-card contestant-card-vote";
    card.innerHTML = renderVoteTargetCardHTML(c);
    card.addEventListener("click", () => {
      container.querySelectorAll("#vote-grid .contestant-card")
        .forEach(el => el.classList.remove("selected"));
      card.classList.add("selected");
      setVote(c);
      castBtn.disabled = false;
    });
    grid.appendChild(card);
  }
}

// ── Phase 1.5: Idol play ──────────────────────────────────────────────────────
//
// Sits between vote casting and vote reveal. Mirrors the real Survivor moment
// where Jeff asks "does anyone want to play a hidden immunity idol?"
//
// Flow:
//   1. Find every attendee holding a playable idol (getIdolPlayCandidates).
//   2. If none, skip the phase entirely — straight to reveal.
//   3. If the player is among them, prompt the player first (they decide).
//   4. Then resolve each AI candidate one-by-one: shouldAIPlayIdol() decides;
//      if they play, animate a dramatic reveal card.
//   5. Call onComplete(protectedIds) — a Set of contestant ids whose votes
//      should be voided when tallyVotes runs.
//
// Order of resolution doesn't matter to the result (all plays are independent
// self-plays), but resolving the player first feels right narratively — they
// get to act on their own read before seeing AI reactions.

function runIdolPlayPhase(container, state, attendees, onComplete) {
  const candidates = getIdolPlayCandidates(state, attendees);

  if (candidates.length === 0) {
    onComplete(new Set());
    return;
  }

  const protectedIds      = new Set();
  const player            = state.player;
  const playerCandidate   = candidates.find(c => c.contestant.id === player.id);
  const aiCandidates      = candidates.filter(c => c.contestant.id !== player.id);

  // The player is on the immunity necklace? They have no danger to mitigate;
  // skip the prompt to spare them a confusing wasted-play decision.
  const playerIsImmune    = state.immunityHolder === player.id;
  const showPlayerPrompt  = playerCandidate && !playerIsImmune;

  // Step 1: player decision (if applicable).
  if (showPlayerPrompt) {
    showPlayerIdolPrompt(container, state, playerCandidate, played => {
      if (played) {
        const protectedId = idolPlay(playerCandidate.idol, state);
        if (protectedId) protectedIds.add(protectedId);
      }
      runAIIdolDecisions(container, state, aiCandidates, attendees, protectedIds, onComplete);
    });
  } else {
    runAIIdolDecisions(container, state, aiCandidates, attendees, protectedIds, onComplete);
  }
}

// Renders the player's idol-play decision screen.
// Two buttons: play (gold) or keep (subtle). The decision is irreversible.
function showPlayerIdolPrompt(container, state, candidate, onDecision) {
  const promptLine = pickFlavor(IDOL_PLAY_PROMPT_LINES);
  const bodyLine   = pickFlavor(IDOL_PLAY_PLAYER_BODY_LINES);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Hidden Immunity Idol</h2>
      <p class="tribal-reading-note muted">${promptLine}</p>

      <div class="idol-prompt-card">
        <div class="idol-prompt-icon">◆</div>
        <div class="idol-prompt-title">You hold a Hidden Immunity Idol.</div>
        <p class="idol-prompt-body">${bodyLine}</p>

        <div class="idol-prompt-buttons">
          <button id="idol-play-btn" class="idol-play-btn">Play the Idol</button>
          <button id="idol-keep-btn" class="idol-keep-btn">Keep It Hidden</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#idol-play-btn").addEventListener("click", () => {
    showPlayerIdolReveal(container, state, () => onDecision(true));
  });
  container.querySelector("#idol-keep-btn").addEventListener("click", () => {
    onDecision(false);
  });
}

// Brief gold-text dramatic moment for the player's own idol play.
// Auto-advances after a beat — no input needed.
function showPlayerIdolReveal(container, state, onContinue) {
  const line = pickFlavor(IDOL_PLAY_PLAYER_REVEAL_LINES);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Hidden Immunity Idol</h2>

      <div class="idol-reveal-card idol-reveal-player">
        <div class="idol-reveal-icon">◆</div>
        <div class="idol-reveal-headline">You play your idol.</div>
        <p class="idol-reveal-line">${line}</p>
        <p class="idol-reveal-effect">Every vote against you tonight will be voided.</p>
      </div>
    </div>
  `;

  setTimeout(onContinue, 2400);
}

// Resolves AI idol-play decisions sequentially.
// For each AI candidate: roll shouldAIPlayIdol(); if true, animate the reveal,
// add to protectedIds, advance after a beat. If false, advance silently.
function runAIIdolDecisions(container, state, aiCandidates, attendees, protectedIds, onComplete) {
  let i = 0;
  // Track whether ANY play happened (player or AI) so we can show the
  // "no one moves" beat only when at least one decision was actually made.
  // protectedIds.size > 0 covers plays already; the prompt-was-shown case is
  // already implied by getIdolPlayCandidates returning at least one candidate.
  const someoneHadDecision = aiCandidates.length > 0 || protectedIds.size > 0;

  function next() {
    if (i >= aiCandidates.length) {
      // If the entire phase concluded with no actual idol plays, give a brief
      // "no one moves" beat so the moment doesn't feel hollow. Otherwise go
      // straight to vote reveal.
      if (someoneHadDecision && protectedIds.size === 0) {
        showNoIdolPlayedBeat(container, state, () => onComplete(protectedIds));
      } else {
        onComplete(protectedIds);
      }
      return;
    }

    const { contestant, idol } = aiCandidates[i];
    i++;

    if (shouldAIPlayIdol(state, contestant, attendees)) {
      const protectedId = idolPlay(idol, state);
      if (protectedId) protectedIds.add(protectedId);
      showAIIdolReveal(container, state, contestant, () => next());
    } else {
      next();
    }
  }

  next();
}

// Shows the dramatic AI idol-play card and auto-advances after a beat.
function showAIIdolReveal(container, state, contestant, onContinue) {
  const displayName  = getPlayerDisplayName(contestant, FORMAT_BY_SCREEN.tribal);
  const announcement = getAIIdolPlayLine(displayName);
  const effect       = getIdolPlayedEffectLine(displayName);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Hidden Immunity Idol</h2>

      <div class="idol-reveal-card idol-reveal-ai">
        <div class="idol-reveal-icon">◆</div>
        ${renderPlayerPortrait(contestant, { size: "large", extraClass: "player-portrait--stacked" })}
        <div class="idol-reveal-headline">${escapeHtml(getPlayerDisplayName(contestant, FORMAT_BY_SCREEN.tribal))} plays an idol!</div>
        <p class="idol-reveal-line">${escapeHtml(announcement)}</p>
        <p class="idol-reveal-effect">${escapeHtml(effect)}</p>
      </div>
    </div>
  `;

  setTimeout(onContinue, 2400);
}

// Quiet "no one moves" interlude when the prompt happened but nothing was
// played. Keeps the rhythm of the moment from feeling like dead air.
function showNoIdolPlayedBeat(container, state, onContinue) {
  const line = pickFlavor(IDOL_NOT_PLAYED_LINES);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Hidden Immunity Idol</h2>
      <p class="tribal-reading-note muted">${line}</p>
    </div>
  `;

  setTimeout(onContinue, 1400);
}

// ── Phase 2: Dramatic reveal ──────────────────────────────────────────────────

function renderRevealPhase(container, state, revealOrder, eliminated, protectedIds = new Set(), fullVotes = null) {
  const player     = state.player;
  const revealIntro = pickFlavor(REVEAL_INTROS);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Reading the Votes</h2>
      <p class="tribal-reading-note muted">${revealIntro}</p>

      <p id="reveal-status" class="tribal-host-line tribal-reveal-status"></p>
      <div id="reveal-cards" class="reveal-cards"></div>

      <div id="tally-board" class="tally-board"></div>

      <div id="reveal-footer" class="reveal-footer"></div>
    </div>
  `;

  const cardsEl  = container.querySelector("#reveal-cards");
  const tallyEl  = container.querySelector("#tally-board");
  const footerEl = container.querySelector("#reveal-footer");
  const statusEl = container.querySelector("#reveal-status");

  const liveTally = {};
  let   i         = 0;

  function revealNext() {
    if (i >= revealOrder.length) {
      // v6.5: longer post-decisive beat so the result lands before the
      // finish button appears. Was 900ms, now 1500ms.
      setTimeout(showFinishButton, 1500);
      return;
    }

    const { target }      = revealOrder[i];
    const isAgainstPlayer = target.id === player.id;
    const isDecisive      = i === revealOrder.length - 1;
    const isFirstVote     = i === 0;
    // Votes targeting an idol-protected contestant are still revealed (for
    // drama) but flagged so they read as voided and don't increment the tally.
    const isVoided        = protectedIds.has(target.id);

    // v6.8: per-vote host-line caption above the cards. Shows "First vote"
    // on the opener, "Next vote" on each subsequent vote until the
    // decisive — the decisive then gets its own dedicated line below the
    // cards (rendered further down). No status line on the decisive vote
    // itself so the moment doesn't compete with the lock-in line.
    if (statusEl) {
      if (isDecisive && !isFirstVote) {
        // Empty during decisive — the decisive line takes over.
        statusEl.textContent = "";
      } else if (isFirstVote) {
        statusEl.textContent = pickFlavor(TRIBAL_HOST_TEXT.firstVote);
      } else {
        statusEl.textContent = pickFlavor(TRIBAL_HOST_TEXT.nextVote);
      }
    }

    const card = document.createElement("div");
    card.className = [
      "reveal-card",
      isAgainstPlayer && !isVoided ? "reveal-card-danger"   : "",
      isVoided                     ? "reveal-card-voided"   : "",
      isDecisive                   ? "reveal-card-decisive" : "",
    ].filter(Boolean).join(" ");
    // v9.17: reveal-card content extracted into renderVoteRevealCardHTML
    // (companion to renderVoteTargetCardHTML used by the casting cards).
    // The outer .reveal-card classes (danger / decisive / voided) and the
    // reveal animation lifecycle stay here; the helper just composes the
    // portrait + name + optional VOID badge.
    card.innerHTML = renderVoteRevealCardHTML(target, { isDecisive, isVoided });
    cardsEl.appendChild(card);

    requestAnimationFrame(() => card.classList.add("revealed"));

    // Voided votes don't update the live tally — they don't count toward
    // the elimination at all. They still get the dramatic reveal moment.
    if (!isVoided) {
      liveTally[target.id] ??= { name: getPlayerDisplayName(target, FORMAT_BY_SCREEN.tribal), count: 0 };
      liveTally[target.id].count++;
      renderTally(tallyEl, liveTally);
    }

    // v6.8: when the decisive (lock-in) vote lands, surface a host-style
    // "that's the count" line below the cards. The line appears alongside
    // the decisive card's animation so the player feels the moment lock.
    if (isDecisive) {
      const decisiveLine = document.createElement("p");
      decisiveLine.className = "tribal-host-line tribal-decisive-line";
      decisiveLine.textContent = pickFlavor(TRIBAL_DECISIVE_LINES);
      cardsEl.appendChild(decisiveLine);
      requestAnimationFrame(() => decisiveLine.classList.add("revealed"));
    }

    i++;

    // v6.5: pacing tuned for tension.
    //   • First reveal: 700ms (existing — gives the player a beat to read
    //     the intro before the first vote drops).
    //   • Mid reveals:  1100ms (was 1200ms — slight quicken so a long
    //     reveal doesn't drag).
    //   • Pre-decisive beat: a touch longer (1300ms) so the decisive
    //     reveal feels weighty when it lands.
    //   • Decisive itself: 0 — it animates immediately, the post-decisive
    //     setTimeout above handles the dramatic pause before the finish
    //     button.
    const isPreDecisive = i === revealOrder.length - 1;
    let delay;
    if (isDecisive)         delay = 0;
    else if (i === 1)       delay = 700;
    else if (isPreDecisive) delay = 1300;
    else                    delay = 1100;
    setTimeout(revealNext, delay);
  }

  function showFinishButton() {
    const isElimPlayer = eliminated.id === player.id;

    // v6.8: final tally summary line above the finish button.
    // v6.9 BUG FIX: when reveal stops early, the visible liveTally only
    // reflects the read votes, not the actual final count. If fullVotes
    // is provided, we compute the TRUE final tally (excluding voided
    // idol-protected votes) so the host-voice summary line accurately
    // reports the real outcome.
    let sortedCounts;
    if (fullVotes && fullVotes.length > 0) {
      const trueCounts = {};
      for (const v of fullVotes) {
        if (protectedIds.has(v.target.id)) continue;   // voided
        trueCounts[v.target.id] = (trueCounts[v.target.id] ?? 0) + 1;
      }
      sortedCounts = Object.values(trueCounts).sort((a, b) => b - a);
    } else {
      sortedCounts = Object.values(liveTally)
        .sort((a, b) => b.count - a.count)
        .map(entry => entry.count);
    }
    if (sortedCounts.length > 0) {
      const countsStr = sortedCounts.join(" to ");
      const template  = pickFlavor(TRIBAL_TALLY_SUMMARY_LINES);
      const summary   = template.replace("{counts}", countsStr);
      const summaryEl = document.createElement("p");
      summaryEl.className = "tribal-host-line tribal-tally-summary";
      summaryEl.textContent = summary;
      footerEl.appendChild(summaryEl);
    }

    // v6.8: farewell line above the finish button — host-style "the tribe
    // has spoken" beat without copying Probst's exact phrase.
    const farewellEl = document.createElement("p");
    farewellEl.className = "tribal-host-line tribal-farewell-line";
    farewellEl.textContent = pickFlavor(TRIBAL_FAREWELL_LINES);
    footerEl.appendChild(farewellEl);

    const btn = document.createElement("button");
    btn.className   = "tribal-finish-btn";
    btn.textContent = isElimPlayer
      ? "Walk out."
      : "Continue →";
    btn.addEventListener("click", () => onTribalDone(eliminated));
    footerEl.appendChild(btn);
  }

  setTimeout(revealNext, 500);
}

// ── Tally board ───────────────────────────────────────────────────────────────

// ── v6.1: Tribal arrival presentation ───────────────────────────────────────
//
// Two helpers that render above the vote grid to make Tribal feel like a
// real event:
//   • Attendees ribbon — every attendee chip with a marker for the player
//     and the immunity holder
//   • Reading card     — concise mood + stability read with a one-line
//     headline drawn from the v5.x social systems

function buildTribalAttendeesRibbonHTML(tribe, state) {
  const player = state.player;
  const holderId = state.immunityHolder;
  const chips = tribe.map(c => {
    const isYou       = c.id === player.id;
    const isHolder    = c.id === holderId;
    const cls = ["tribal-attendee-chip"];
    if (isYou)    cls.push("tribal-attendee-self");
    if (isHolder) cls.push("tribal-attendee-immune");
    const marker =
        isYou && isHolder ? `<span class="tribal-attendee-marker" aria-hidden="true">★ ⬡</span>`
      : isYou             ? `<span class="tribal-attendee-marker" aria-hidden="true">★</span>`
      : isHolder          ? `<span class="tribal-attendee-marker" aria-hidden="true">⬡</span>`
      : "";
    return `<span class="${cls.join(" ")}">${marker}<span class="tribal-attendee-name">${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.tribal))}</span></span>`;
  }).join("");

  return `
    <div class="tribal-attendees">
      <span class="tribal-attendees-eyebrow">Attending tonight</span>
      <div class="tribal-attendees-list">${chips}</div>
    </div>
  `;
}

function buildTribalReadingCardHTML(state, attendees) {
  if (typeof getTribalReading !== "function") return "";
  const reading = getTribalReading(state, attendees);
  const moodLabel = {
    calm:    "Calm",    steady:  "Steady",  uneasy: "Uneasy",
    tense:   "Tense",   chaotic: "Chaotic",
  }[reading.mood] ?? "Steady";
  const stabilityLabel = {
    stable:    "Stable",   shaky:    "Shaky",
    volatile:  "Volatile", open:     "Open",
  }[reading.stability] ?? "Open";

  return `
    <div class="tribal-reading-card">
      <div class="tribal-reading-header">
        <span class="tribal-reading-eyebrow">The room reads</span>
        <span class="tribal-reading-pills">
          <span class="tribal-reading-pill" data-axis="mood" data-value="${reading.mood}">
            <span class="tribal-reading-pill-dot" aria-hidden="true"></span>
            <span class="tribal-reading-pill-label">${moodLabel}</span>
          </span>
          <span class="tribal-reading-pill" data-axis="stability" data-value="${reading.stability}">
            <span class="tribal-reading-pill-dot" aria-hidden="true"></span>
            <span class="tribal-reading-pill-label">${stabilityLabel}</span>
          </span>
        </span>
      </div>
      <p class="tribal-reading-headline">${escapeHtml(reading.headline)}</p>
    </div>
  `;
}

function renderTally(container, liveTally) {
  const sorted = Object.values(liveTally).sort((a, b) => b.count - a.count);

  container.innerHTML = sorted.map(entry => `
    <div class="tally-row">
      <span class="tally-name">${escapeHtml(entry.name)}</span>
      <span class="tally-pips">${"●".repeat(entry.count)}</span>
      <span class="tally-count">${entry.count}</span>
    </div>
  `).join("");
}
