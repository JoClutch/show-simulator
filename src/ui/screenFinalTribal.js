// screenFinalTribal.js — Final Tribal Council UI
//
// Four sequential phases rendered inside the same container:
//   1. Ceremony    : finalists introduced, jury seated, "Begin" button
//   2. Speech      : player picks an opening statement theme (modifies jury scores)
//   3. Vote reveal : jury votes computed and revealed one by one
//   4. Winner      : hero declaration + "See Season Results" button
//
// Engine calls:
//   computeFinalVotes(state, finalists, speechBonus) → { voter, target }[]
//   tallyFinalVotes(votes)                           → winning contestant
//   buildRevealOrder(votes, winner.id)               → ordered reveal array
//   renderTally(el, liveTally)                       → updates tally board DOM

function renderFinalTribalScreen(container, state) {
  renderFTCCeremony(container, state);
}

// ── Phase 1: Ceremony ─────────────────────────────────────────────────────────

function renderFTCCeremony(container, state) {
  const finalists  = state.finalists;
  const jury       = state.jury;
  const player     = state.player;
  const mergeColor = SEASON_CONFIG.mergeTribeColor;
  const mergeName  = SEASON_CONFIG.mergeTribeName;

  const finalistCards = finalists.map(f => {
    const isPlayer  = f.id === player.id;
    const origColor = f.originalTribe
      ? SEASON_CONFIG.tribeColors[f.originalTribe]
      : mergeColor;
    const origName  = f.originalTribe
      ? SEASON_CONFIG.tribeNames[f.originalTribe]
      : mergeName;

    return `
      <div class="ftc-finalist-card ${isPlayer ? "ftc-finalist-player" : ""}">
        <div class="ftc-finalist-name">
          ${escapeHtml(f.name)}${isPlayer ? " <span class=\"ftc-you-tag\">(you)</span>" : ""}
        </div>
        <div class="ftc-finalist-origin" style="color:${origColor}">${escapeHtml(origName)}</div>
        <div class="ftc-finalist-stats" title="Challenge avg (Physical / Mental / Endurance) · Social · Strategy">
          <span>Chal&nbsp;${f.challenge}</span>
          <span>Soc&nbsp;${f.social}</span>
          <span>Str&nbsp;${f.strategy}</span>
        </div>
      </div>
    `;
  }).join("");

  const juryChips = jury.map(j => {
    const origColor = j.originalTribe
      ? SEASON_CONFIG.tribeColors[j.originalTribe]
      : mergeColor;
    const origName  = j.originalTribe
      ? SEASON_CONFIG.tribeNames[j.originalTribe]
      : "";

    return `
      <div class="ftc-jury-chip">
        <span class="ftc-jury-chip-name">${escapeHtml(j.name)}</span>
        <span class="ftc-jury-chip-seat" style="color:${origColor}">Juror ${j.juryNumber}</span>
      </div>
    `;
  }).join("");

  // Pick flavor text — a universal ceremony intro + player-specific note.
  const ceremonyIntro  = pickFlavor(FTC_CEREMONY_INTROS);
  const playerFinalist = finalists.some(f => f.id === player.id);
  const playerNote     = playerFinalist
    ? `<p class="ftc-intro-player muted">${pickFlavor(FTC_YOU_ARE_FINALIST_LINES)}</p>`
    : "";

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Day ${state.ftcDay} · ${escapeHtml(SEASON_CONFIG.name)}</p>
      <h2>Final Tribal Council</h2>
      <p class="ftc-intro muted">${ceremonyIntro}</p>
      ${playerNote}

      <div class="ftc-finalists">${finalistCards}</div>

      <div class="ftc-jury-section">
        <div class="ftc-jury-heading">
          The Jury &nbsp;·&nbsp; ${jury.length} member${jury.length !== 1 ? "s" : ""}
        </div>
        <div class="ftc-jury-chips">${juryChips}</div>
      </div>

      <div class="spacer">
        <button id="ftc-begin-btn">The jury will now speak →</button>
      </div>
    </div>
  `;

  container.querySelector("#ftc-begin-btn").addEventListener("click", () => {
    renderFTCSpeech(container, state);
  });
}

// ── Phase 2: Opening Statement ────────────────────────────────────────────────

// Each option grants a flat speechBonus applied to the player's jury score.
// The bonus scales with the stat most relevant to the narrative angle —
// rewarding players who "walk the walk" when they pick their argument.
const FTC_SPEECHES = [
  {
    id:       "loyalty",
    label:    "I played with loyalty",
    flavor:   "You emphasise the relationships you built and the alliances you kept.",
    getBonus: player => player.social * 0.4 + 3,
  },
  {
    id:       "strategy",
    label:    "I outplayed everyone strategically",
    flavor:   "You lay out every move you made and own them without apology.",
    getBonus: player => player.strategy * 0.4 + 1,
  },
  {
    id:       "challenge",
    label:    "I earned my spot in challenges",
    flavor:   "You point to your competition record as proof of dominance.",
    getBonus: player => player.challenge * 0.4 + 1,
  },
];

function renderFTCSpeech(container, state) {
  const player = state.player;

  const speechCards = FTC_SPEECHES.map((s, i) => `
    <div class="ftc-speech-card" data-speech-idx="${i}">
      <div class="ftc-speech-label">${s.label}</div>
      <div class="ftc-speech-flavor muted">${s.flavor}</div>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Day ${state.ftcDay} · Final Tribal Council</p>
      <h2>Your Opening Statement</h2>
      <p class="ftc-speech-prompt">
        The jury is watching. How will you frame your game?
      </p>

      <div class="ftc-speech-options">${speechCards}</div>

      <div class="spacer">
        <button id="ftc-speech-btn" disabled>Deliver Statement →</button>
      </div>
    </div>
  `;

  let selectedSpeech = null;
  const btn = container.querySelector("#ftc-speech-btn");

  container.querySelectorAll(".ftc-speech-card").forEach((card, i) => {
    card.addEventListener("click", () => {
      container.querySelectorAll(".ftc-speech-card")
        .forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedSpeech = FTC_SPEECHES[i];
      btn.disabled   = false;
    });
  });

  btn.addEventListener("click", () => {
    if (!selectedSpeech) return;
    const bonus       = selectedSpeech.getBonus(player);
    const speechBonus = { [player.id]: bonus };
    renderFTCReveal(container, state, speechBonus);
  });
}

// ── Phase 3: Vote Reveal ──────────────────────────────────────────────────────

function renderFTCReveal(container, state, speechBonus) {
  const finalists = state.finalists;
  const player    = state.player;

  // Compute all jury votes using the engine.
  const allVotes  = computeFinalVotes(state, finalists, speechBonus);
  const winner    = tallyFinalVotes(allVotes);

  // Reuse buildRevealOrder from vote.js: pass winner.id as the "decisive" target
  // so the winner's clinching vote is always last.
  const revealOrder = buildRevealOrder(allVotes, winner.id);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Day ${state.ftcDay} · Final Tribal Council</p>
      <h2>Reading the Votes</h2>
      <p class="ftc-reading-note muted">${pickFlavor(FTC_READING_INTROS)}</p>

      <div id="ftc-reveal-cards" class="reveal-cards"></div>
      <div id="ftc-tally"        class="tally-board"></div>
      <div id="ftc-reveal-footer" class="reveal-footer"></div>
    </div>
  `;

  const cardsEl  = container.querySelector("#ftc-reveal-cards");
  const tallyEl  = container.querySelector("#ftc-tally");
  const footerEl = container.querySelector("#ftc-reveal-footer");

  const liveTally = {};
  let   i         = 0;

  function revealNext() {
    if (i >= revealOrder.length) {
      setTimeout(showWinnerButton, 1200);
      return;
    }

    const { target }   = revealOrder[i];
    const isForPlayer  = target.id === player.id;
    const isForWinner  = target.id === winner.id;
    const isDecisive   = i === revealOrder.length - 1;

    const card = document.createElement("div");
    card.className = [
      "reveal-card",
      isForPlayer && !isForWinner ? "reveal-card-good"    : "",
      isDecisive                  ? "reveal-card-decisive": "",
    ].filter(Boolean).join(" ");
    card.innerHTML = `<span class="reveal-card-name">${escapeHtml(target.name)}</span>`;
    cardsEl.appendChild(card);
    requestAnimationFrame(() => card.classList.add("revealed"));

    liveTally[target.id] ??= { name: target.name, count: 0 };
    liveTally[target.id].count++;
    renderTally(tallyEl, liveTally);

    i++;
    const delay = isDecisive ? 0 : (i === 1 ? 700 : 1200);
    setTimeout(revealNext, delay);
  }

  function showWinnerButton() {
    const isPlayerWinner = winner.id === player.id;
    const btn = document.createElement("button");
    btn.className   = "ftc-finish-btn";
    btn.textContent = isPlayerWinner
      ? "You won! — Declare the winner →"
      : "Declare the winner →";
    btn.addEventListener("click", () => renderFTCWinner(container, state, winner, allVotes));
    footerEl.appendChild(btn);
  }

  setTimeout(revealNext, 600);
}

// ── Phase 4: Winner Declaration ───────────────────────────────────────────────

function renderFTCWinner(container, state, winner, allVotes) {
  const player     = state.player;
  const isPlayer   = winner.id === player.id;
  const finalists  = state.finalists;

  const voteCounts = {};
  for (const { target } of allVotes) {
    voteCounts[target.id] = (voteCounts[target.id] ?? 0) + 1;
  }

  const voteRows = finalists
    .slice()
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
    .map(f => {
      const count     = voteCounts[f.id] ?? 0;
      const isWinner  = f.id === winner.id;
      const isMe      = f.id === player.id;
      return `
        <div class="ftc-result-row ${isWinner ? "ftc-result-winner" : "ftc-result-loser"}">
          <span class="ftc-result-name">
            ${escapeHtml(f.name)}${isMe ? " (you)" : ""}${isWinner ? " 🏆" : ""}
          </span>
          <span class="ftc-result-votes">${count} vote${count !== 1 ? "s" : ""}</span>
        </div>
      `;
    }).join("");

  const origColor = winner.originalTribe
    ? SEASON_CONFIG.tribeColors[winner.originalTribe]
    : SEASON_CONFIG.mergeTribeColor;
  const origName  = winner.originalTribe
    ? SEASON_CONFIG.tribeNames[winner.originalTribe]
    : SEASON_CONFIG.mergeTribeName;

  const headline = isPlayer
    ? "You Are the Sole Survivor!"
    : `${escapeHtml(winner.name)} Wins!`;
  const subhead  = isPlayer
    ? pickFlavor(FTC_WINNER_PLAYER_SUBLINES)
    : getFTCWinnerOtherLine(winner.name);

  container.innerHTML = `
    <div class="screen">
      <p class="screen-eyebrow">Day ${state.ftcDay} · ${escapeHtml(SEASON_CONFIG.name)}</p>
      <h1 class="ftc-winner-headline">${headline}</h1>
      <p class="ftc-winner-subhead">${escapeHtml(subhead)}</p>

      <div class="ftc-winner-card">
        <div class="ftc-winner-name">${escapeHtml(winner.name)}</div>
        <div class="ftc-winner-origin" style="color:${origColor}">${escapeHtml(origName)}</div>
        <div class="ftc-winner-label">Sole Survivor</div>
      </div>

      <div class="ftc-vote-breakdown">
        <h3>Final Jury Vote</h3>
        <div class="ftc-result-list">${voteRows}</div>
      </div>

      <div class="spacer">
        <button id="ftc-results-btn">See Season Results →</button>
      </div>
    </div>
  `;

  container.querySelector("#ftc-results-btn").addEventListener("click", () => {
    onFinalTribalDone(winner, allVotes);
  });
}
