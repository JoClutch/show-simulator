// voteRevealCard.js — vote-reveal card content (v9.17)
//
// Returns the INNER HTML string for a `.reveal-card` element shown during
// the dramatic per-vote reveal at Tribal Council. Portrait above the
// voted-for player's name, with a VOID badge appended when an idol
// protects the target.
//
// Companion to voteTargetCard.js — both vote-flow surfaces (casting and
// reveal) now route through purpose-named helpers that compose the
// shared PlayerPortrait + name-formatting building blocks. Outer card
// classes (`.reveal-card`, `.reveal-card-danger`, `.reveal-card-decisive`,
// `.reveal-card-voided`) and the reveal animation lifecycle are still
// owned by the caller — this helper only handles the INSIDE of the card.
//
// ── Loading order ───────────────────────────────────────────────────────────
// Loaded after playerPortrait.js (depends on renderPlayerPortrait + the
// FORMAT_BY_SCREEN map and getPlayerDisplayName) and before screenTribal.js.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//
//   const card = document.createElement("div");
//   card.className = "reveal-card " + (isDecisive ? "reveal-card-decisive" : "");
//   card.innerHTML = renderVoteRevealCardHTML(target, { isDecisive, isVoided });
//   cardsEl.appendChild(card);
//
// opts.isDecisive: boolean — the lock-in vote that punctuates the reveal.
//                   Uses a larger portrait so the final beat lands harder.
// opts.isVoided:   boolean — vote was nullified by an idol. Appends a
//                   VOID badge; CSS handles strikethrough on the name.
function renderVoteRevealCardHTML(target, opts = {}) {
  if (!target) return "";

  const { isDecisive = false, isVoided = false } = opts;
  const portraitSize = isDecisive ? "large" : "medium";

  const portraitHTML = renderPlayerPortrait(target, {
    size:       portraitSize,
    extraClass: "player-portrait--stacked",
  });

  const nameHTML = `<span class="reveal-card-name">${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.tribal))}</span>`;

  const voidBadge = isVoided
    ? `<span class="reveal-card-void-badge">VOID</span>`
    : "";

  return `${portraitHTML}${nameHTML}${voidBadge}`;
}
