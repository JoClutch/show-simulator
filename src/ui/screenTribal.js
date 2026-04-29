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
          <span style="color:${tribeColor}">${tribeName}</span>
          &nbsp;·&nbsp; ${tribe.length} members attending
        </div>
      </div>

      <p class="tribal-opener muted">${getTribalOpener(state)}</p>

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
    runIdolPlayPhase(container, state, tribe, protectedIds => {
      const eliminated  = tallyVotes(allVotes, state, protectedIds);
      const revealOrder = buildRevealOrder(allVotes, eliminated.id);
      renderRevealPhase(container, state, revealOrder, eliminated, protectedIds);
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
          <span style="color:${mergeColor}">${mergeName}</span>
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
          <strong>${holder.id === player.id ? "You hold" : `${holder.name} holds`}
          Individual Immunity</strong> and cannot be voted out tonight.
        </div>
      ` : ""}

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
    runIdolPlayPhase(container, state, tribe, protectedIds => {
      const eliminated  = tallyVotes(allVotes, state, protectedIds);
      const revealOrder = buildRevealOrder(allVotes, eliminated.id);
      renderRevealPhase(container, state, revealOrder, eliminated, protectedIds);
    });
  });
}

// ── Shared: voting card grid ──────────────────────────────────────────────────

// Builds and appends contestant cards to #vote-grid.
// getVote / setVote are closures so the two tribal branches manage their own
// playerVote variable without sharing mutable state.
function buildVotingGrid(container, eligible, getVote, setVote) {
  const grid    = container.querySelector("#vote-grid");
  const castBtn = container.querySelector("#cast-btn");

  for (const c of eligible) {
    const card = document.createElement("div");
    card.className = "contestant-card";
    card.innerHTML = `
      <div class="card-name">${c.name}</div>
      <div class="card-stats">
        <div class="stat-row">
          <span class="stat-label">Challenge</span>
          <span class="stat-value">${c.challenge}</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${c.challenge * 10}%"></div></div>
        <div class="stat-row">
          <span class="stat-label">Social</span>
          <span class="stat-value">${c.social}</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${c.social * 10}%"></div></div>
        <div class="stat-row">
          <span class="stat-label">Strategy</span>
          <span class="stat-value">${c.strategy}</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${c.strategy * 10}%"></div></div>
      </div>
    `;
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
  const announcement = getAIIdolPlayLine(contestant.name);
  const effect       = getIdolPlayedEffectLine(contestant.name);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Hidden Immunity Idol</h2>

      <div class="idol-reveal-card idol-reveal-ai">
        <div class="idol-reveal-icon">◆</div>
        <div class="idol-reveal-headline">${contestant.name} plays an idol!</div>
        <p class="idol-reveal-line">${announcement}</p>
        <p class="idol-reveal-effect">${effect}</p>
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

function renderRevealPhase(container, state, revealOrder, eliminated, protectedIds = new Set()) {
  const player     = state.player;
  const revealIntro = pickFlavor(REVEAL_INTROS);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Reading the Votes</h2>
      <p class="tribal-reading-note muted">${revealIntro}</p>

      <div id="reveal-cards" class="reveal-cards"></div>

      <div id="tally-board" class="tally-board"></div>

      <div id="reveal-footer" class="reveal-footer"></div>
    </div>
  `;

  const cardsEl  = container.querySelector("#reveal-cards");
  const tallyEl  = container.querySelector("#tally-board");
  const footerEl = container.querySelector("#reveal-footer");

  const liveTally = {};
  let   i         = 0;

  function revealNext() {
    if (i >= revealOrder.length) {
      setTimeout(showFinishButton, 900);
      return;
    }

    const { target }      = revealOrder[i];
    const isAgainstPlayer = target.id === player.id;
    const isDecisive      = i === revealOrder.length - 1;
    // Votes targeting an idol-protected contestant are still revealed (for
    // drama) but flagged so they read as voided and don't increment the tally.
    const isVoided        = protectedIds.has(target.id);

    const card = document.createElement("div");
    card.className = [
      "reveal-card",
      isAgainstPlayer && !isVoided ? "reveal-card-danger"   : "",
      isVoided                     ? "reveal-card-voided"   : "",
      isDecisive                   ? "reveal-card-decisive" : "",
    ].filter(Boolean).join(" ");
    card.innerHTML = isVoided
      ? `<span class="reveal-card-name">${target.name}</span>
         <span class="reveal-card-void-badge">VOID</span>`
      : `<span class="reveal-card-name">${target.name}</span>`;
    cardsEl.appendChild(card);

    requestAnimationFrame(() => card.classList.add("revealed"));

    // Voided votes don't update the live tally — they don't count toward
    // the elimination at all. They still get the dramatic reveal moment.
    if (!isVoided) {
      liveTally[target.id] ??= { name: target.name, count: 0 };
      liveTally[target.id].count++;
      renderTally(tallyEl, liveTally);
    }

    i++;

    const delay = isDecisive ? 0 : (i === 1 ? 700 : 1200);
    setTimeout(revealNext, delay);
  }

  function showFinishButton() {
    const isElimPlayer = eliminated.id === player.id;
    const btn = document.createElement("button");
    btn.className   = "tribal-finish-btn";
    btn.textContent = isElimPlayer
      ? "The tribe has spoken."
      : "The tribe has spoken →";
    btn.addEventListener("click", () => onTribalDone(eliminated));
    footerEl.appendChild(btn);
  }

  setTimeout(revealNext, 500);
}

// ── Tally board ───────────────────────────────────────────────────────────────

function renderTally(container, liveTally) {
  const sorted = Object.values(liveTally).sort((a, b) => b.count - a.count);

  container.innerHTML = sorted.map(entry => `
    <div class="tally-row">
      <span class="tally-name">${entry.name}</span>
      <span class="tally-pips">${"●".repeat(entry.count)}</span>
      <span class="tally-count">${entry.count}</span>
    </div>
  `).join("");
}
