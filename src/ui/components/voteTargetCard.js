// voteTargetCard.js — vote-casting-mode card content (v9.15)
//
// Returns the INNER HTML string for a `.contestant-card` used during the
// vote-casting phase at Tribal Council. Portrait + name only — explicitly
// no stats, no meta, no badges. The caller still creates the outer
// `<div class="contestant-card">` and attaches click/select handlers
// (so selection state, keyboard behavior, and the existing card chrome
// continue to work unchanged).
//
// Why a dedicated component instead of a flag on the player card:
// "I don't want stats while voting" is a strong, persistent rule about
// the casting context. Making it a separately named function makes that
// rule visible at every call site — you can't miss what it's doing —
// and prevents a future refactor from accidentally pulling stats back
// into the casting UI by flipping an opts default.
//
// ── Loading order ───────────────────────────────────────────────────────────
// Loaded after playerPortrait.js (uses renderPlayerPortrait + getPlayerDisplayName)
// and before any screen file that calls it.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//
//   for (const c of eligible) {
//     const card = document.createElement("div");
//     card.className = "contestant-card";
//     card.innerHTML = renderVoteTargetCardHTML(c);
//     card.addEventListener("click", () => { ... });
//     grid.appendChild(card);
//   }
function renderVoteTargetCardHTML(contestant) {
  if (!contestant) return "";
  return `
    ${renderPlayerPortrait(contestant, { size: "large", extraClass: "player-portrait--stacked" })}
    <div class="card-name">${escapeHtml(getPlayerDisplayName(contestant, FORMAT_BY_SCREEN.tribal))}</div>
  `;
}
