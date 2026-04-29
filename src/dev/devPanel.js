// devPanel.js — Developer debug and balancing panel
//
// ── Access ────────────────────────────────────────────────────────────────────
//   Keyboard : press ` (backtick) at any time to toggle
//   Mouse    : click the ⚙ DEV pill fixed in the bottom-left corner
//
// ── Three tabs ────────────────────────────────────────────────────────────────
//   STATE    — episode, phase, merge status, jury, active player table
//   INSPECT  — per-player relationships / trust / suspicion; deterministic vote
//              target predictions (no noise) for all active voters
//   BALANCE  — live sliders for merge trigger, final count, vote noise ×,
//              challenge randomness ×
//
// ── Architecture ─────────────────────────────────────────────────────────────
//   • Reads window.gameState (mutated in place by main.js — var, not let).
//   • Reads global functions: getDay, getRelationship, getTrust,
//     sentimentTier, sentimentLabel, SEASON_CONFIG.
//   • Never mutates game state directly. Balance sliders write only to
//     window.DEV_CONFIG (noise multipliers) or SEASON_CONFIG config fields
//     (merge/final counts). Engine files read these on each call.
//   • Wrapped in an IIFE — only window.DEV_CONFIG leaks to global scope.

// ── Runtime balance config ────────────────────────────────────────────────────
// Engine files read these via (window.DEV_CONFIG?.field ?? defaultValue).
// Changing a value here takes effect on the very next engine call.
window.DEV_CONFIG = {
  voteNoiseMultiplier:  1,   // 0 = deterministic AI votes; 2 = very chaotic
  challengeRandomness:  1,   // 0 = stat-only result;       2 = heavy upset risk
};

(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────

  const DEFAULTS = {
    mergeTriggerCount:   10,
    finalCount:           3,
    voteNoiseMultiplier:  1,
    challengeRandomness:  1,
  };

  // ── Build panel DOM ─────────────────────────────────────────────────────────

  // Small always-visible toggle pill (bottom-left corner).
  const pill = document.createElement("button");
  pill.id        = "dev-pill";
  pill.className = "dev-pill";
  pill.textContent = "⚙ DEV";
  document.body.appendChild(pill);

  // Main panel (right-side drawer).
  const panel = document.createElement("div");
  panel.id        = "dev-panel";
  panel.className = "dev-panel dev-hidden";
  panel.innerHTML = `
    <div class="dev-header">
      <span class="dev-title">⚙ Dev Panel</span>
      <button class="dev-close" id="dev-close">✕</button>
    </div>

    <div class="dev-tabs" role="tablist">
      <button class="dev-tab active" data-tab="state"   role="tab">State</button>
      <button class="dev-tab"        data-tab="inspect" role="tab">Inspect</button>
      <button class="dev-tab"        data-tab="balance" role="tab">Balance</button>
    </div>

    <div class="dev-body">
      <div class="dev-pane active" id="dev-pane-state"></div>
      <div class="dev-pane"        id="dev-pane-inspect"
           data-perspective-id=""></div>
      <div class="dev-pane"        id="dev-pane-balance"></div>
    </div>

    <div class="dev-footer">
      <button class="dev-refresh" id="dev-refresh">↺ Refresh</button>
      <span class="dev-hint">Backtick (\`) to toggle</span>
    </div>
  `;
  document.body.appendChild(panel);

  // ── Toggle ──────────────────────────────────────────────────────────────────

  let open = false;

  function show() {
    open = true;
    panel.classList.remove("dev-hidden");
    refresh();
  }

  function hide() {
    open = false;
    panel.classList.add("dev-hidden");
  }

  function toggle() { open ? hide() : show(); }

  pill.addEventListener("click", toggle);
  panel.querySelector("#dev-close").addEventListener("click", hide);
  panel.querySelector("#dev-refresh").addEventListener("click", refresh);

  document.addEventListener("keydown", e => {
    if (e.key !== "`") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    toggle();
  });

  // ── Tab switching ───────────────────────────────────────────────────────────

  panel.querySelectorAll(".dev-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      panel.querySelectorAll(".dev-tab").forEach(b => b.classList.remove("active"));
      panel.querySelectorAll(".dev-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      panel.querySelector(`#dev-pane-${btn.dataset.tab}`).classList.add("active");
      refresh();
    });
  });

  // ── Master refresh ──────────────────────────────────────────────────────────

  function refresh() {
    renderState();
    renderInspect();
    renderBalance();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function gs() { return window.gameState; }

  function activePlayers() {
    const g = gs();
    if (!g?.tribes) return [];
    if (g.merged) return [...(g.tribes.merged ?? [])];
    return [...(g.tribes.A ?? []), ...(g.tribes.B ?? [])];
  }

  function allKnownPlayers() {
    return [...activePlayers(), ...(gs()?.eliminated ?? [])];
  }

  // Deterministic vote score (no noise) — mirrors pickVoteTarget in vote.js.
  // Used for display only; does not affect the game.
  function debugScore(voter, candidate) {
    const g = gs();
    if (!g) return 0;
    const rel   = getRelationship(g, voter.id, candidate.id);
    const trust = getTrust(g, voter.id, candidate.id);

    const bondProtection  = rel >= 15 ? 20 : rel >= 8 ? 8 : 0;
    const trustFactor     = (trust - 3) * 1.5;
    const suspicion       = (candidate.suspicion ?? 0) * 2;
    const socialThreat    = candidate.social    * (voter.strategy / 15);
    const challengeThreat = candidate.challenge * (voter.strategy / 25);

    // Idol suspicion factor — must mirror pickVoteTarget exactly.
    const idolSusp = getIdolSuspicion(g, voter.id, candidate.id);
    let idolFactor = 0;
    if (idolSusp >= 7)      idolFactor = voter.strategy >= 6 ? -4 : +6;
    else if (idolSusp >= 3) idolFactor = voter.strategy >= 6 ? -2 : +3;

    // No noise — fully deterministic for inspection.
    return rel + bondProtection + trustFactor
         - suspicion - socialThreat - challengeThreat
         + idolFactor;
  }

  // Returns the 1-2 dominant reasons a voter targets a candidate.
  function voteReasons(voter, target) {
    const g = gs();
    if (!g) return "—";
    const rel       = getRelationship(g, voter.id, target.id);
    const trust     = getTrust(g, voter.id, target.id);
    const susp      = target.suspicion ?? 0;
    const socThreat = target.social    * (voter.strategy / 15);
    const chalThreat= target.challenge * (voter.strategy / 25);
    const idolSusp  = getIdolSuspicion(g, voter.id, target.id);
    const parts = [];
    // Idol-flush is the most narratively interesting reason — surface it first.
    if (idolSusp >= 7 && voter.strategy >= 6) parts.push("flush idol");
    else if (idolSusp >= 3 && voter.strategy >= 6) parts.push("idol hunch");
    if (rel   < -5)  parts.push(`rel ${rel.toFixed(0)}`);
    if (trust < 2.5) parts.push(`trust ${trust.toFixed(0)}`);
    if (susp  >= 5)  parts.push(`susp ${susp.toFixed(0)}`);
    if (socThreat  > 4) parts.push("soc threat");
    if (chalThreat > 3) parts.push("chal threat");
    return parts.slice(0, 2).join(", ") || "lowest score";
  }

  // CSS class for a signed numeric value.
  function signClass(v, hiThresh, loThresh) {
    if (v >= hiThresh)  return "dev-hi";
    if (v <= loThresh)  return "dev-lo";
    return "dev-mid";
  }

  function pane(id) { return panel.querySelector(`#dev-pane-${id}`); }

  function noGame(el) {
    el.innerHTML = `<p class="dev-note dev-dim">Game not started yet.</p>`;
  }

  // ── Tab: State ──────────────────────────────────────────────────────────────

  // Builds the alliance summary block for the State tab.
  // Shows ALL alliances (including AI-only ones the player can't normally see)
  // because dev panel exists to expose hidden state.
  function renderAlliances(g) {
    const list = g?.alliances ?? [];
    if (list.length === 0) return "";

    const rows = list.map(a => {
      const status = a.status;
      const cls =
        status === "dissolved" ? "dev-dim" :
        status === "weakened"  ? "dev-lo"  :
        a.strength >= 7        ? "dev-hi"  :
        "dev-mid";

      const members = a.memberIds.map(id => {
        const c = allKnownPlayers().find(c => c.id === id);
        const isMe = g.player && id === g.player.id;
        const name = c?.name ?? id;
        return isMe ? `${name}★` : name;
      }).join(", ") || "(empty)";

      return `<tr>
        <td class="dev-dim">${a.id}</td>
        <td>${a.name}</td>
        <td class="${cls}">${a.strength.toFixed(1)}</td>
        <td class="dev-dim">${status}</td>
        <td>${members}</td>
      </tr>`;
    }).join("");

    return `
      <div class="dev-section">
        <div class="dev-section-hd">Alliances</div>
        <table class="dev-table">
          <thead><tr><th>ID</th><th>Name</th><th>Str</th><th>Status</th><th>Members</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // Builds the idol summary block for the State tab.
  // Reads window.gameState.idols and calls isIdolAvailable() from idols.js.
  function renderIdols(g) {
    if (!g?.idols?.length) return "";

    const rows = g.idols.map(idol => {
      const scopeName = idol.scope === "merged"
        ? SEASON_CONFIG.mergeTribeName
        : (SEASON_CONFIG.tribeNames[idol.scope] ?? idol.scope);

      const holderName = idol.holder
        ? (allKnownPlayers().find(c => c.id === idol.holder)?.name ?? idol.holder)
        : "—";

      const available  = isIdolAvailable(idol, g);
      const playable   = isIdolPlayable(idol, g);

      // Status label with availability note for hidden idols
      let statusLabel = idol.status;
      if (idol.status === "hidden") {
        statusLabel += available ? " ✦" : " (locked)";
      }
      if (idol.status === "held" && playable) {
        statusLabel += " ✦";
      }

      const statusCls =
        idol.status === "held"    ? "dev-hi"  :
        idol.status === "hidden" && available ? "dev-mid" :
        "dev-dim";

      return `<tr>
        <td class="dev-dim">${idol.id}</td>
        <td>${scopeName}</td>
        <td class="${statusCls}">${statusLabel}</td>
        <td>${holderName}</td>
      </tr>`;
    }).join("");

    return `
      <div class="dev-section">
        <div class="dev-section-hd">Idols &nbsp;<span class="dev-dim" style="font-weight:normal">✦ = active</span></div>
        <table class="dev-table">
          <thead><tr><th>ID</th><th>Scope</th><th>Status</th><th>Holder</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderState() {
    const el = pane("state");
    const g  = gs();
    if (!g) { noGame(el); return; }

    const active = activePlayers();
    const day    = getDay(g);
    const juryMax = SEASON_CONFIG.mergeTriggerCount - SEASON_CONFIG.finalCount;

    // Immunity holder label
    const holder = g.merged && g.immunityHolder
      ? active.find(c => c.id === g.immunityHolder)
      : null;

    // Build active-player rows
    const playerRows = active.map(c => {
      const isMe   = g.player && c.id === g.player.id;
      const susp   = c.suspicion ?? 0;
      const sCls   = susp >= 7 ? "dev-lo" : susp >= 3 ? "dev-mid" : "dev-hi";
      const origin = c.originalTribe
        ? `${SEASON_CONFIG.tribeNames[c.originalTribe] ?? c.originalTribe}`
        : (SEASON_CONFIG.tribeNames[c.tribe] ?? c.tribe);
      return `
        <tr class="${isMe ? "dev-row-you" : ""}">
          <td>${c.name}${isMe ? " ★" : ""}</td>
          <td>${origin}</td>
          <td class="${sCls}">${susp.toFixed(1)}</td>
          <td class="dev-dim">${c.challenge}·${c.social}·${c.strategy}</td>
        </tr>`;
    }).join("");

    // Jury block
    const juryHTML = g.jury?.length > 0
      ? renderJurySentiment(g)
      : "";

    el.innerHTML = `
      <div class="dev-section">
        <div class="dev-kv"><span class="dev-k">Phase</span>
          <span class="dev-tag">${g.phase ?? "—"}</span></div>
        <div class="dev-kv"><span class="dev-k">Episode / Day</span>
          <span class="dev-v">${g.round} / Day ${day + (g.campPhase === 2 ? 2 : 0)}</span></div>
        <div class="dev-kv"><span class="dev-k">Camp phase</span>
          <span class="dev-v">${g.campPhase}</span></div>
        <div class="dev-kv"><span class="dev-k">Merge</span>
          <span class="dev-v">${g.merged
            ? `<span class="dev-tag dev-tag-merge">Merged · ${active.length} left</span>`
            : `<span class="dev-tag">Pre-merge · ${active.length} left</span>`}</span></div>
        <div class="dev-kv"><span class="dev-k">Tribal tribe</span>
          <span class="dev-v">${g.tribalTribe ?? "—"}</span></div>
        <div class="dev-kv"><span class="dev-k">Jury</span>
          <span class="dev-v">${g.jury?.length ?? 0} / ${juryMax}</span></div>
        ${holder ? `
        <div class="dev-kv"><span class="dev-k">Immunity ⬡</span>
          <span class="dev-v dev-hi">${holder.name}</span></div>` : ""}
        <div class="dev-kv"><span class="dev-k">Player</span>
          <span class="dev-v">${g.player?.name ?? "—"}</span></div>
      </div>

      <div class="dev-section">
        <div class="dev-section-hd">Active (${active.length}) — Name / Tribe / Susp / Ch·So·St</div>
        <table class="dev-table">
          <thead><tr><th>Name</th><th>Tribe</th><th>Susp</th><th>Stats</th></tr></thead>
          <tbody>${playerRows}</tbody>
        </table>
      </div>

      ${renderIdols(g)}

      ${renderAlliances(g)}

      ${juryHTML}
    `;
  }

  function renderJurySentiment(g) {
    const player = g.player;
    const rows = g.jury.map(j => {
      const raw  = player && j.sentiment ? (j.sentiment[player.id] ?? null) : null;
      const tier = raw !== null ? sentimentTier(raw) : "mixed";
      const cls  = tier === "favorable" ? "dev-hi" : tier === "unfavorable" ? "dev-lo" : "dev-mid";
      return `<tr>
        <td>${j.name}</td>
        <td class="dev-dim">Juror ${j.juryNumber}</td>
        <td class="${cls}">${raw !== null ? raw.toFixed(1) : "—"}</td>
        <td class="dev-dim">${raw !== null ? sentimentLabel(tier) : ""}</td>
      </tr>`;
    }).join("");

    return `
      <div class="dev-section">
        <div class="dev-section-hd">Jury → ${player?.name ?? "Player"} sentiment</div>
        <table class="dev-table">
          <thead><tr><th>Juror</th><th>Seat</th><th>Score</th><th>Tier</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── Tab: Inspect ─────────────────────────────────────────────────────────────

  function renderInspect() {
    const el = pane("inspect");
    const g  = gs();
    if (!g?.player) { noGame(el); return; }

    const all    = allKnownPlayers();
    const active = activePlayers();

    // Restore or default the perspective
    const savedId   = el.dataset.perspectiveId;
    const current   = (savedId && all.find(c => c.id === savedId))
                    ?? g.player;

    const options = all.map(c => {
      const isElim = g.eliminated?.some(e => e.id === c.id);
      return `<option value="${c.id}" ${c.id === current.id ? "selected" : ""}>
        ${c.name}${isElim ? " (elim)" : ""}
      </option>`;
    }).join("");

    // Relationship / trust / general susp / idol susp table
    // The "IdolSusp" column is current → c: how strongly the perspective
    // person believes c holds an idol. (0=unaware, 3+=suspect, 7+=confident.)
    const others = all.filter(c => c.id !== current.id);
    const relRows = others.map(c => {
      const rel       = getRelationship(g, current.id, c.id);
      const trust     = getTrust(g, current.id, c.id);
      const susp      = c.suspicion ?? 0;
      const idolSusp  = getIdolSuspicion(g, current.id, c.id);
      const isElim    = g.eliminated?.some(e => e.id === c.id);

      const rCls = signClass(rel,   10, -5);
      const tCls = signClass(trust,  6,  2);
      const sCls = susp >= 5 ? "dev-lo" : susp >= 2 ? "dev-mid" : "";
      const iCls = idolSusp >= 7 ? "dev-lo" : idolSusp >= 3 ? "dev-mid" : "dev-dim";

      return `<tr class="${isElim ? "dev-row-elim" : ""}">
        <td>${c.name}${isElim ? " <span class='dev-dim'>†</span>" : ""}</td>
        <td class="${rCls}">${rel.toFixed(1)}</td>
        <td class="${tCls}">${trust.toFixed(1)}</td>
        <td class="${sCls}">${susp.toFixed(1)}</td>
        <td class="${iCls}">${idolSusp.toFixed(0)}</td>
      </tr>`;
    }).join("");

    // Vote target predictions (deterministic, current as voter)
    // Also show all-voters summary
    const votePool = active.filter(c =>
      c.id !== (g.merged ? (g.immunityHolder ?? "__none__") : "__none__")
    );

    const voteRows = active.map(voter => {
      const candidates = votePool.filter(c => c.id !== voter.id);
      if (candidates.length === 0) {
        return `<tr><td>${voter.name}</td><td colspan="3" class="dev-dim">—</td></tr>`;
      }
      const scored = candidates
        .map(c => ({ c, score: debugScore(voter, c) }))
        .sort((a, b) => a.score - b.score);  // lowest = most likely target
      const top     = scored[0];
      const isMe    = g.player && top.c.id === g.player.id;
      const isCur   = voter.id === current.id;
      return `<tr class="${isMe ? "dev-row-danger" : ""} ${isCur ? "dev-row-you" : ""}">
        <td>${voter.name}${isCur ? " ★" : ""}</td>
        <td>→ ${top.c.name}</td>
        <td class="dev-lo">${top.score.toFixed(1)}</td>
        <td class="dev-dim">${voteReasons(voter, top.c)}</td>
      </tr>`;
    }).join("");

    el.innerHTML = `
      <div class="dev-section">
        <div class="dev-kv">
          <label class="dev-k" for="dev-persp">Perspective</label>
          <select class="dev-select" id="dev-persp">${options}</select>
        </div>
      </div>

      <div class="dev-section">
        <div class="dev-section-hd">${current.name} → others (rel / trust / susp / idol susp)</div>
        <table class="dev-table">
          <thead><tr><th>Name</th><th>Rel</th><th>Trust</th><th>Susp</th><th>Idol</th></tr></thead>
          <tbody>${relRows}</tbody>
        </table>
      </div>

      <div class="dev-section">
        <div class="dev-section-hd">Vote targets — no noise (★ = current perspective)</div>
        <table class="dev-table">
          <thead><tr><th>Voter</th><th>Target</th><th>Score</th><th>Reasons</th></tr></thead>
          <tbody>${voteRows}</tbody>
        </table>
      </div>
    `;

    // Persist perspective selection across refreshes
    el.querySelector("#dev-persp").addEventListener("change", e => {
      el.dataset.perspectiveId = e.target.value;
      renderInspect();
    });
  }

  // ── Tab: Balance ─────────────────────────────────────────────────────────────

  function renderBalance() {
    const el = pane("balance");

    el.innerHTML = `
      <div class="dev-section">
        <div class="dev-section-hd">Season thresholds</div>
        <p class="dev-note dev-dim">
          Changes take effect at the next round check — safe to adjust mid-game.
        </p>

        ${slider({
          id:    "dev-merge",
          label: "Merge / jury trigger",
          min: 4, max: 14, step: 1,
          value: SEASON_CONFIG.mergeTriggerCount,
          hint:  "players remaining when merge fires",
        })}

        ${slider({
          id:    "dev-final",
          label: "Final Tribal count",
          min: 2, max: 5, step: 1,
          value: SEASON_CONFIG.finalCount,
          hint:  "players remaining when FTC fires",
        })}
      </div>

      <div class="dev-section">
        <div class="dev-section-hd">Randomness multipliers</div>
        <p class="dev-note dev-dim">
          Apply immediately to all future dice rolls. 0 = fully deterministic.
        </p>

        ${slider({
          id:    "dev-vnoise",
          label: "Vote noise ×",
          min: 0, max: 3, step: 0.1,
          value: DEV_CONFIG.voteNoiseMultiplier,
          hint:  "scales AI vote noise range (tribal + FTC)",
        })}

        ${slider({
          id:    "dev-crand",
          label: "Challenge rand ×",
          min: 0, max: 3, step: 0.1,
          value: DEV_CONFIG.challengeRandomness,
          hint:  "scales tribal and individual challenge randomness",
        })}
      </div>

      <div class="dev-section">
        <button class="dev-reset-btn" id="dev-reset">Reset all to defaults</button>
      </div>
    `;

    // Wire sliders
    wireSlider("dev-merge", v => { SEASON_CONFIG.mergeTriggerCount = v; });
    wireSlider("dev-final", v => { SEASON_CONFIG.finalCount        = v; });
    wireSlider("dev-vnoise",v => { DEV_CONFIG.voteNoiseMultiplier  = v; });
    wireSlider("dev-crand", v => { DEV_CONFIG.challengeRandomness  = v; });

    el.querySelector("#dev-reset").addEventListener("click", () => {
      SEASON_CONFIG.mergeTriggerCount  = DEFAULTS.mergeTriggerCount;
      SEASON_CONFIG.finalCount         = DEFAULTS.finalCount;
      DEV_CONFIG.voteNoiseMultiplier   = DEFAULTS.voteNoiseMultiplier;
      DEV_CONFIG.challengeRandomness   = DEFAULTS.challengeRandomness;
      renderBalance();
    });
  }

  // Generates the HTML string for a labelled range slider with a live readout.
  function slider({ id, label, min, max, step, value, hint }) {
    const fmt = step < 1 ? value.toFixed(1) : String(value);
    return `
      <div class="dev-slider-row">
        <div class="dev-slider-top">
          <label class="dev-k" for="${id}">${label}</label>
          <span class="dev-slider-val" id="${id}-val">${fmt}</span>
        </div>
        <input class="dev-slider" type="range"
               id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <span class="dev-note dev-dim">${hint}</span>
      </div>`;
  }

  function wireSlider(id, onUpdate) {
    const input  = panel.querySelector(`#${id}`);
    const valEl  = panel.querySelector(`#${id}-val`);
    if (!input) return;
    input.addEventListener("input", () => {
      const v   = parseFloat(input.value);
      const fmt = parseFloat(input.step) < 1 ? v.toFixed(1) : String(v);
      valEl.textContent = fmt;
      onUpdate(v);
    });
  }

})();
