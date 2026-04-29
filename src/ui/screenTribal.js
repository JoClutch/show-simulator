// screenTribal.js — Tribal Council: voting phase then dramatic reveal phase
//
// Pre-merge:  only the losing tribe attends; state.tribalTribe = "A" | "B"
// Post-merge: full cast attends; state.tribalTribe = "merged";
//             the immunity holder cannot receive votes but still casts one

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

      <p class="tribal-prompt">
        You must vote for one tribemate to leave the game.
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
    const allVotes    = collectAiVotes(state, tribe, playerVote, player);
    const eliminated  = tallyVotes(allVotes, state);
    const revealOrder = buildRevealOrder(allVotes, eliminated.id);
    renderRevealPhase(container, state, revealOrder, eliminated);
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

      ${holder ? `
        <div class="tribal-immunity-note">
          <span class="immunity-icon">⬡</span>
          <strong>${holder.id === player.id ? "You hold" : `${holder.name} holds`}
          Individual Immunity</strong> and cannot be voted out tonight.
        </div>
      ` : ""}

      <p class="tribal-prompt">
        You must vote for one player to leave the game.
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
    const allVotes    = collectAiVotes(state, tribe, playerVote, player, votePool);
    const eliminated  = tallyVotes(allVotes, state);
    const revealOrder = buildRevealOrder(allVotes, eliminated.id);
    renderRevealPhase(container, state, revealOrder, eliminated);
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

// ── Phase 2: Dramatic reveal ──────────────────────────────────────────────────

function renderRevealPhase(container, state, revealOrder, eliminated) {
  const player = state.player;

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + DAY_OFFSETS.tribal}</p>
      <h2>Reading the Votes</h2>
      <p class="tribal-reading-note muted">Jeff reaches into the urn…</p>

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

    const card = document.createElement("div");
    card.className = [
      "reveal-card",
      isAgainstPlayer ? "reveal-card-danger" : "",
      isDecisive      ? "reveal-card-decisive" : "",
    ].filter(Boolean).join(" ");
    card.innerHTML = `<span class="reveal-card-name">${target.name}</span>`;
    cardsEl.appendChild(card);

    requestAnimationFrame(() => card.classList.add("revealed"));

    liveTally[target.id] ??= { name: target.name, count: 0 };
    liveTally[target.id].count++;
    renderTally(tallyEl, liveTally);

    i++;

    const delay = isDecisive ? 0 : (i === 1 ? 700 : 1200);
    setTimeout(revealNext, delay);
  }

  function showFinishButton() {
    const btn = document.createElement("button");
    btn.className   = "tribal-finish-btn";
    btn.textContent = "The tribe has spoken →";
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
