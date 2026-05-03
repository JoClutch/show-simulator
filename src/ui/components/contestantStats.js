// contestantStats.js — shared stat-block renderer (v9.8)
//
// Returns the HTML for the standard contestant stat block: five labeled
// rows + bars (Physical / Mental / Endurance / Social / Strategy). One
// canonical layout, reused everywhere a player's stats are shown so
// formatting can't drift between screens again.
//
// Loading order in index.html: must come after playerPortrait.js (both
// live in src/ui/components/) and before any screen file that calls it.
//
// ── Usage ─────────────────────────────────────────────────────────────────
//
//   container.innerHTML = `
//     <div class="contestant-card">
//       ${renderPlayerPortrait(c, { size: "md" })}
//       <div class="card-name">${escapeHtml(getPlayerDisplayName(c, "first"))}</div>
//       ${renderContestantStatsHTML(c)}
//     </div>
//   `;

// Renders the standard five-bar contestant stat block. The wrapper element
// keeps the existing .card-stats class so background + border-top styling
// from styles.css still applies. Each stat reuses the existing .stat-row /
// .stat-bar / .stat-bar-fill rules.
//
// Reads the three sub-skills directly. normalizeContestantStats() runs at
// boot, so every contestant on a live game state is guaranteed to have all
// three; defensive ?? fallbacks cover edge cases (mid-load, hand-built
// objects in tests).
function renderContestantStatsHTML(contestant) {
  if (!contestant) return "";

  const p   = contestant.physicalChallengeSkill  ?? contestant.challenge ?? 5;
  const m   = contestant.mentalChallengeSkill    ?? contestant.challenge ?? 5;
  const e   = contestant.enduranceChallengeSkill ?? contestant.challenge ?? 5;
  const soc = contestant.social   ?? 5;
  const str = contestant.strategy ?? 5;

  return `
    <div class="card-stats">
      ${_statRow("Physical",  p)}
      ${_statRow("Mental",    m)}
      ${_statRow("Endurance", e)}
      ${_statRow("Social",    soc)}
      ${_statRow("Strategy",  str)}
    </div>
  `;
}

function _statRow(label, value) {
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
    </div>
    <div class="stat-bar"><div class="stat-bar-fill" style="width:${value * 10}%"></div></div>
  `;
}
