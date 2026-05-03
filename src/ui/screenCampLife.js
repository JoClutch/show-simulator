// screenCampLife.js — interactive Camp Life phase
//
// Used for both campPhase 1 (before the challenge) and campPhase 2 (after).
// Works pre-merge (tribe context) and post-merge (full merged cast).
//
// Pre-merge:
//   campPhase 1 → onCampLifeDone → showScreen("challenge")
//   campPhase 2, lost → onCampLifeDone → showScreen("tribal")
//   campPhase 2, safe → onCampLifeDone → advanceRound()
//
// Post-merge:
//   campPhase 1 → onCampLifeDone → showScreen("challenge") [individual]
//   campPhase 2 → onCampLifeDone → showScreen("tribal")    [everyone goes]

function renderCampLifeScreen(container, state) {
  const tribeLabel = getPlayerTribeLabel();   // "A" | "B" | "merged"
  const player     = state.player;
  const maxActions = SEASON_CONFIG.campActionsPerRound;
  const isPhase2   = state.campPhase === 2;

  // Tribe identity — handle pre-merge and post-merge separately.
  const tribeName  = tribeLabel === "merged"
    ? SEASON_CONFIG.mergeTribeName
    : SEASON_CONFIG.tribeNames[tribeLabel];
  const tribeColor = tribeLabel === "merged"
    ? SEASON_CONFIG.mergeTribeColor
    : SEASON_CONFIG.tribeColors[tribeLabel];

  // Everyone in the player's current tribe (excluding the player themselves).
  const tribemates = state.tribes[tribeLabel].filter(c => c.id !== player.id);

  // ── Determine phase-2 outcome context ─────────────────────────────────────
  //
  // Pre-merge:
  //   goingToTribal = player's tribe lost the challenge
  //   isSafe        = player's tribe won
  //
  // Post-merge:
  //   goingToTribal = player is NOT the immunity holder (everyone else is vulnerable)
  //   isSafe        = player holds the necklace

  let goingToTribal = false;
  let isSafe        = false;

  if (isPhase2) {
    if (state.merged) {
      const isImmune = state.immunityHolder === player.id;
      goingToTribal  = !isImmune;
      isSafe         = isImmune;
    } else {
      goingToTribal = state.tribalTribe === tribeLabel;
      isSafe        = !goingToTribal;
    }
  }

  // Labels that change depending on phase and outcome.
  const phaseLabel    = isPhase2 ? "Evening at Camp" : "Camp Life";
  const stepNote      = isPhase2 ? "After the challenge" : "Before the challenge";

  // Episode opener — a brief atmospheric line shown only on the first camp
  // phase of each episode (phase 1). Sourced from flavor.js.
  const episodeOpener = !isPhase2
    ? `<p class="camp-episode-opener muted">${getEpisodeOpener(state)}</p>`
    : "";

  // After merge everyone always heads to tribal in phase 2 (even the immune
  // holder — they still attend and cast a vote).
  const continueLabel = !isPhase2
    ? "Head to the Challenge →"
    : (goingToTribal || state.merged) ? "Head to Tribal Council →"
    : "End the Day →";

  // Status banners — only shown in phase 2.
  let statusBanner = "";
  if (isPhase2) {
    if (goingToTribal) {
      const msg = state.merged
        ? "Everyone heads to Tribal Council tonight. You are vulnerable."
        : "Tribal Council is tonight. Make your moves count.";
      statusBanner = `<div class="camp-status-banner camp-status-danger">${msg}</div>`;
    } else if (isSafe) {
      const msg = state.merged
        ? "You hold Individual Immunity. You cannot be voted out tonight."
        : "Your tribe won immunity. You are safe tonight.";
      statusBanner = `<div class="camp-status-banner camp-status-safe">${msg}</div>`;
    }
  }

  let actionsLeft = maxActions;

  // v5.2 submenu navigation state.
  //   null         → top-level: show category cards
  //   "<category>" → drilled in: show actions for that category + Back link
  //
  // Reset to null on each camp phase render (this closure is rebuilt then).
  // Within a single phase, drilling/back/executing all preserve the user's
  // place — after taking an action they stay in the same category so they
  // can immediately pick another, matching the "spend N actions" budget.
  let _currentCategory = null;

  // v5.26: alliance inspector state. When non-null while _currentCategory
  // is "alliances", the inspector view renders for that specific alliance
  // instead of the generic Alliances overview. Cleared on category back.
  let _currentAllianceId = null;
  // v5.26 / v5.27: the inspector's pending sub-flow — when the player
  // clicks one of the inspector's action buttons, we render an inline
  // target picker before resolving. null = no sub-flow active.
  let _allianceSubAction = null;   // "invite" | "boot" | "vote" | null

  // ── Idol state for this screen ────────────────────────────────────────────
  //
  // idolScope: the scope the player can search at their current camp.
  //            Matches tribeLabel exactly ("A" | "B" | "merged").
  //
  // buildIdolBadgeHTML() and the currentHoldsScope check inside
  // showActionButtons() both re-read live state on every call — the player
  // may find an idol mid-session, which must update the badge and button
  // immediately without a full screen re-render.
  const idolScope = tribeLabel;

  // Badge HTML — shown whenever the player holds at least one idol.
  // Uses a named container so showActionButtons() can refresh it after each
  // action (the player may find an idol mid-session).
  function buildIdolBadgeHTML() {
    const held = getHeldIdols(state, player.id);
    if (held.length === 0) return "";
    const labels = held.map(i => {
      const scopeLabel = i.scope === "merged"
        ? SEASON_CONFIG.mergeTribeName
        : SEASON_CONFIG.tribeNames[i.scope];
      return `<span class="camp-idol-label">You hold a Hidden Immunity Idol <span class="camp-idol-scope">(${escapeHtml(scopeLabel)})</span></span>`;
    }).join("");
    return `<div class="camp-idol-badge"><span class="camp-idol-icon">◆</span>${labels}</div>`;
  }

  const idolBadgeHTML = buildIdolBadgeHTML();

  // Alliance block — shows the alliances the player is a member of.
  // Re-rendered after each action, like the idol badge: alliances can form
  // (proposeAlliance succeeded) or dissolve (member eliminated) mid-session.
  // Only displays alliances the PLAYER is in — the player can see their own
  // pacts but not those formed silently between AIs (info asymmetry).
  function buildAllianceBlockHTML() {
    const mine = getAlliancesForMember(state, player.id);
    if (mine.length === 0) return "";

    const cards = mine.map(a => {
      const strengthInt = Math.round(a.strength);
      const widthPct    = Math.max(5, strengthInt * 10);
      // v5.13: prefer the alliance.tier set by the engine; fall back to
      // strength-derived tier for older saves. Map engine tier names to
      // existing CSS class IDs so styling stays unchanged.
      const engineTier = a.tier ?? (
        strengthInt >= 7 ? "core" :
        strengthInt >= 4 ? "loose" :
        "weakened"
      );
      const tier =
        engineTier === "core"     ? "tight"    :
        engineTier === "loose"    ? "solid"    :
        "weakened";
      const tierLabel =
        engineTier === "core"     ? "Core"     :
        engineTier === "loose"    ? "Loose"    :
        "Weakened";

      // Staleness cue: alliance hasn't seen a positive member interaction in
      // 2+ rounds. The player's pact will start to bleed strength. Subtle visual.
      const lastReinforced = a.lastReinforcedRound ?? a.formedRound;
      const staleRounds    = state.round - lastReinforced;
      const isStale        = staleRounds >= 2;
      const staleBadge     = isStale
        ? `<span class="camp-alliance-stale-badge" title="No reinforcing interactions for ${staleRounds} rounds">needs attention</span>`
        : "";

      // Member chips — "You" first, then others by name. Eliminated members
      // are pruned in removeMemberFromAlliances so they won't appear.
      const memberChips = a.memberIds.map(id => {
        if (id === player.id) {
          return `<span class="camp-alliance-chip camp-alliance-chip-you">You</span>`;
        }
        const name = findContestant(state, id)?.name ?? "?";
        return `<span class="camp-alliance-chip">${name}</span>`;
      }).join("");

      return `
        <div class="camp-alliance-card camp-alliance-${tier}${isStale ? " camp-alliance-stale" : ""}">
          <div class="camp-alliance-header">
            <span class="camp-alliance-icon">⚐</span>
            <span class="camp-alliance-name">${escapeHtml(a.name)}</span>
            ${staleBadge}
            <span class="camp-alliance-strength-num">${strengthInt}/10</span>
          </div>
          <div class="camp-alliance-members">${memberChips}</div>
          <div class="camp-alliance-strength">
            <span class="camp-alliance-bar">
              <span class="camp-alliance-bar-fill" style="width:${widthPct}%"></span>
            </span>
            <span class="camp-alliance-tier">${tierLabel}</span>
          </div>
        </div>
      `;
    }).join("");

    return `<div class="camp-alliance-block">${cards}</div>`;
  }

  const allianceBlockHTML = buildAllianceBlockHTML();

  // ── Tribe relationship panel (v5.1) ───────────────────────────────────────
  //
  // Replaces the old chip row with a structured list showing the player's
  // current standing with each tribemate. Each row has a colored dot (visual
  // tier), the name, and a short text label. The raw numeric score is
  // available via the row's `title` tooltip but never the primary display —
  // the goal is a readable social dashboard, not a debug dump.
  //
  // Tier boundaries align with engine landmarks already in use:
  //   • rel ≥ 15  triggers bondProtection +20 in voting     → "Tight"
  //   • rel ≥ 8   triggers bondProtection +8                → folded into "Good"
  //   • rel ≥ 10  qualifies a pair for AI alliance auto-form
  //   • rel ≤ -3  is the existing "enemy" threshold for AI danger reads
  //
  // v5.9: relabeled to a five-tier Survivor-flavored scale —
  //   Tight / Good / Neutral / Shaky / Bad. Same underlying score, cleaner
  //   bucket names. The numeric rel and trust values are still shown in
  //   the tooltip for players who want to dig in.
  //
  // Refreshed live in showActionButtons() so labels move as actions land.

  function getRelationshipTier(rel) {
    if (rel >=  15) return { id: "tight",   label: "Tight"   };
    if (rel >=   5) return { id: "good",    label: "Good"    };
    if (rel >=  -4) return { id: "neutral", label: "Neutral" };
    if (rel >= -14) return { id: "shaky",   label: "Shaky"   };
    return                  { id: "bad",     label: "Bad"     };
  }

  // v5.9: trust is a separate dimension from relationship — it tracks how
  // much the target would actually back the player up, vs. just liking them.
  // We surface a small "✦" marker next to names where trust is high so the
  // player can read at a glance who's a real ally vs. a friendly acquaintance.
  function getTrustMarker(trust) {
    // v5.15: trust ranges 0-10 and starts at 3. ✦ now requires 7 (above
    // baseline AND beyond a single confide), ⚠ requires drop to 1 or below.
    if (trust >=  7) return { id: "trusted",   symbol: "✦", title: "Trusts you"           };
    if (trust <=  1) return { id: "distrusted", symbol: "⚠", title: "Doesn't trust you" };
    return null;
  }

  // ── v5.20: end-of-camp recap ──────────────────────────────────────────────
  //
  // When the player runs out of actions, instead of a blank "you've used
  // all your actions for today" line we surface a concise recap of what
  // shifted during the camp phase. Hidden systems stay hidden; the recap
  // speaks in social/strategic language only.
  //
  // Built by diffing the phase-entry snapshot against current state.

  function buildPhaseSnapshot() {
    const snap = {
      pairs:    {},   // [tribemateId] → { rel, trust, allyTier }
      alliances:{},   // [allianceId]  → strength
      pressure: 0,
      capital:  5,
      rumorCount: 0,
    };
    for (const c of tribemates) {
      const allyA = (typeof getStrongestSharedAlliance === "function")
        ? getStrongestSharedAlliance(state, player.id, c.id) : null;
      snap.pairs[c.id] = {
        rel:      getRelationship(state, player.id, c.id),
        trust:    getTrust(state, player.id, c.id),
        allyTier: allyA ? (allyA.tier ?? null) : null,
      };
    }
    for (const a of state.alliances ?? []) {
      if (a.status === "dissolved") continue;
      if (!a.memberIds.includes(player.id)) continue;
      snap.alliances[a.id] = a.strength;
    }
    snap.pressure   = (typeof getPressureScore   === "function") ? getPressureScore(state, player.id)   : 5;
    snap.capital    = (typeof getSocialCapital   === "function") ? getSocialCapital(state, player.id)    : 5;
    snap.rumorCount = (typeof getRumorsKnownBy   === "function") ? getRumorsKnownBy(state, player.id).length : 0;
    // v5.36: snapshot camp temperature tier so the recap can surface
    // mood-shift lines (e.g. "the camp slid from steady to tense today").
    if (typeof getCampTemperature === "function") {
      const tribePool = state.merged
        ? (state.tribes?.merged || [])
        : (state.tribes?.[player.tribe] || []);
      snap.moodTier = tribePool.length >= 2
        ? getCampTemperature(state, tribePool).tier
        : null;
    } else {
      snap.moodTier = null;
    }
    return snap;
  }

  function buildRecapHTML() {
    const snap = phaseSnapshot;
    const lines = [];

    // ── Per-pair shifts ─────────────────────────────────────────────────
    // We're interested in changes the player would actually feel: rel
    // moves of 3+, trust crossing the marker thresholds, alliance tier
    // flips. We pick at most 3 pair-lines so the recap stays readable.
    const pairChanges = [];
    for (const c of tribemates) {
      const before = snap.pairs[c.id];
      if (!before) continue;
      const relNow   = getRelationship(state, player.id, c.id);
      const trustNow = getTrust(state, player.id, c.id);
      const allyA = (typeof getStrongestSharedAlliance === "function")
        ? getStrongestSharedAlliance(state, player.id, c.id) : null;
      const tierNow = allyA ? (allyA.tier ?? null) : null;

      const dRel   = relNow   - before.rel;
      const dTrust = trustNow - before.trust;

      // Trust threshold crossings (markers were at 7 / 1 in v5.15)
      const wasTrusted     = before.trust   >= 7;
      const isTrusted      = trustNow       >= 7;
      const wasDistrusted  = before.trust   <= 1;
      const isDistrusted   = trustNow       <= 1;

      let line = null, weight = 0;

      if (!wasTrusted && isTrusted) {
        line = `${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} feels like a real ally now — they've started trusting you in a way they didn't this morning.`;
        weight = 10;
      } else if (wasTrusted && !isTrusted) {
        line = `Something cooled with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))}. You don't have the same standing with them you did this morning.`;
        weight = 9;
      } else if (!wasDistrusted && isDistrusted) {
        line = `${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} pulled back hard. Whatever's between you, they're not extending you the benefit of the doubt anymore.`;
        weight = 9;
      } else if (before.allyTier !== tierNow) {
        if (!before.allyTier && tierNow) {
          line = `You and ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} are now in something formal — a ${tierNow} alliance.`;
          weight = 9;
        } else if (before.allyTier && !tierNow) {
          line = `Your alliance with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} is no longer holding.`;
          weight = 9;
        } else if (before.allyTier === "loose" && tierNow === "core") {
          line = `Your bond with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} has hardened — that pact feels real now.`;
          weight = 8;
        } else if (before.allyTier === "core" && tierNow === "loose") {
          line = `Your tie with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} loosened today. Still allies, but the certainty has gone out of it.`;
          weight = 7;
        } else if (tierNow === "weakened") {
          line = `Your alliance with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} is hanging on by a thread.`;
          weight = 8;
        }
      } else if (dRel >= 4) {
        line = `You and ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} got closer today. Real ground was covered.`;
        weight = 5;
      } else if (dRel >= 2) {
        line = `Things with ${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} feel a touch warmer than this morning.`;
        weight = 3;
      } else if (dRel <= -4) {
        line = `${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} cooled on you noticeably. You'll feel that next time you talk.`;
        weight = 6;
      } else if (dRel <= -2) {
        line = `${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))} seems a little wary of you compared to this morning.`;
        weight = 4;
      }

      if (line) pairChanges.push({ line, weight });
    }
    pairChanges.sort((a, b) => b.weight - a.weight);
    for (const p of pairChanges.slice(0, 3)) lines.push(p.line);

    // ── Alliance strength shifts beyond the per-pair tier flip ─────────
    for (const a of state.alliances ?? []) {
      if (a.status === "dissolved") continue;
      if (!a.memberIds.includes(player.id)) continue;
      const before = snap.alliances[a.id];
      if (before === undefined) {
        // New alliance — already covered by pair-change line above when
        // tier flipped; skip duplicate.
        continue;
      }
      const dStrength = a.strength - before;
      if (dStrength >= 1.5) {
        lines.push(`Your alliance "${escapeHtml(a.name)}" tightened today.`);
      } else if (dStrength <= -1.5) {
        lines.push(`Your alliance "${escapeHtml(a.name)}" lost some footing today.`);
      }
    }

    // ── Pressure / target-list movement ────────────────────────────────
    const pressureNow = (typeof getPressureScore === "function")
      ? getPressureScore(state, player.id) : 5;
    const dPressure = pressureNow - snap.pressure;
    if (dPressure >= 1.0) {
      lines.push(`Your name is getting more momentum than it had this morning. The room is warming on you in the wrong way.`);
    } else if (dPressure <= -1.0) {
      lines.push(`Your name has faded a little since this morning. Heat is moving elsewhere.`);
    }

    // ── Social capital shift ───────────────────────────────────────────
    const capitalNow = (typeof getSocialCapital === "function")
      ? getSocialCapital(state, player.id) : 5;
    const dCapital = capitalNow - snap.capital;
    if (dCapital >= 0.8) {
      lines.push(`Your overall standing in the camp ticked up. People are reading you a touch more favorably.`);
    } else if (dCapital <= -0.8) {
      lines.push(`Your standing in the camp slipped today. The room read you a little colder by evening.`);
    }

    // ── New rumors picked up ───────────────────────────────────────────
    const rumorCountNow = (typeof getRumorsKnownBy === "function")
      ? getRumorsKnownBy(state, player.id).length : 0;
    const dRumors = rumorCountNow - snap.rumorCount;
    if (dRumors >= 2) {
      lines.push(`You picked up multiple new whispers today. Some of them might even be true.`);
    } else if (dRumors === 1) {
      lines.push(`You walked away from camp with one fresh whisper that wasn't there this morning.`);
    }

    // ── v5.36: camp mood shift ─────────────────────────────────────────
    // If the temperature tier crossed at least one band during the phase,
    // surface a short narration of the shift. Doesn't fire when mood
    // stayed put — quiet days don't need a temperature line.
    if (snap.moodTier && typeof getCampTemperature === "function") {
      const tribePool = state.merged
        ? (state.tribes?.merged || [])
        : (state.tribes?.[player.tribe] || []);
      if (tribePool.length >= 2) {
        const moodNow = getCampTemperature(state, tribePool).tier;
        const order = ["calm", "steady", "uneasy", "tense", "chaotic"];
        const before = order.indexOf(snap.moodTier);
        const after  = order.indexOf(moodNow);
        if (before >= 0 && after >= 0 && before !== after) {
          if (after > before) {
            lines.push(`The camp slid toward ${moodNow} today. The temperature came up.`);
          } else {
            lines.push(`The camp settled. Mood went from ${snap.moodTier} to ${moodNow} by evening.`);
          }
        }
      }
    }

    // ── Camp tone fallback ─────────────────────────────────────────────
    if (lines.length === 0) {
      const calm = pickFrom([
        `A quiet day at camp. Nothing moved that you can name.`,
        `The day didn't shift the picture much. Tomorrow is its own thing.`,
        `Camp held steady today. Whatever's coming, it's still coming.`,
      ]);
      lines.push(calm);
    }

    // Trim to a readable max — recap should land in one breath, not a wall.
    const final = lines.slice(0, 5);

    const items = final.map(l => `<li class="camp-recap-item">${l}</li>`).join("");
    return `
      <div class="camp-recap-card">
        <div class="camp-recap-header">
          <span class="camp-recap-eyebrow">End of camp</span>
          <span class="camp-recap-title">Today's read</span>
        </div>
        <ul class="camp-recap-list">${items}</ul>
        <p class="muted camp-recap-footer">You've used all your actions for today.</p>
      </div>
    `;
  }

  function pickFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // v5.36: camp mood pill builder. Returns a small thematic tag reflecting
  // the current camp temperature tier (calm / steady / uneasy / tense /
  // chaotic). Single hyphenated word, color-coded via data-mood attribute.
  // Reads getCampTemperature on demand so the pill always reflects current
  // state. Hidden gracefully if the helper isn't available.
  function buildCampMoodPillHTML() {
    if (typeof getCampTemperature !== "function") return "";
    const tribePool = state.merged
      ? (state.tribes?.merged || [])
      : (state.tribes?.[player.tribe] || []);
    if (tribePool.length < 2) return "";
    const temp = getCampTemperature(state, tribePool);
    const labelMap = {
      calm:    "Calm",
      steady:  "Steady",
      uneasy:  "Uneasy",
      tense:   "Tense",
      chaotic: "Chaotic",
    };
    const label = labelMap[temp.tier] ?? "Steady";
    return `
      <span class="camp-mood-pill" data-mood="${temp.tier}" title="The overall tribe mood right now">
        <span class="camp-mood-dot" aria-hidden="true"></span>
        <span class="camp-mood-label">${label}</span>
      </span>
    `;
  }

  // v5.14: emerging camp-role identity card. Reads state via the engine
  // helper and only renders once the player has enough action history
  // (≥ 5 actions and a dominant category share). Otherwise renders a quiet
  // "still finding your place" card so the slot doesn't visually jump
  // around mid-game.
  function buildCampRoleCardHTML() {
    const role  = (typeof getCampRole === "function")
      ? getCampRole(state, player.id) : "undefined";
    const total = (typeof getCampActionTotal === "function")
      ? getCampActionTotal(state, player.id) : 0;
    const label = (typeof getCampRoleLabel === "function")
      ? getCampRoleLabel(role) : "Finding your place";

    // v5.15: "leaning:X" is a third state — the read is forming but the
    // tribe hasn't committed yet. Use core flavor at half-confidence.
    const isLeaning = role && role.startsWith("leaning:");
    const coreRole  = isLeaning ? role.slice("leaning:".length) : role;

    const committedFlavor = {
      provider:        "The tribe sees you as someone who pulls weight. Quiet credit accumulates.",
      strategist:      "You're being read as a thinker. Pitches you make carry a little extra weight.",
      schemer:         "You've been visible enough that people are watching. Shady acts amplify.",
      socialConnector: "People talk to you. Conversations land warmer than the numbers say they should.",
      drifter:         "You're floating in the background. Suspicion fades a little faster on you each round.",
    };
    const leaningFlavor = {
      provider:        "Your hands have been busy lately. People are starting to file you under 'reliable.'",
      strategist:      "You've been thinking out loud more than most. The tribe is starting to read you that way.",
      schemer:         "Your activity hasn't gone unnoticed. A few people are starting to wonder.",
      socialConnector: "You've been in more conversations than most. The shape of a connector is forming.",
      drifter:         "You've been on the edges more than the center. Easy to miss. That has its uses.",
    };

    const flavor = role === "undefined"
      ? `Still early. The tribe doesn't have a fixed read on you yet. (${total} action${total === 1 ? "" : "s"} taken)`
      : isLeaning
        ? leaningFlavor[coreRole]
        : committedFlavor[coreRole];

    return `
      <div class="camp-role-card" data-role="${coreRole}"${isLeaning ? ` data-leaning="true"` : ""}>
        <div class="camp-role-header">
          <span class="camp-role-eyebrow">Your camp role</span>
          <span class="camp-role-label">${escapeHtml(label)}</span>
        </div>
        <div class="camp-role-flavor">${escapeHtml(flavor)}</div>
      </div>
    `;
  }

  // v5.14: short "recent strategic notes" feed sourced from the player-visible
  // event log. Filters to camp-relevant categories (alliance / idol / tribal)
  // so trivial-seeming entries don't crowd the column. Last 4 entries.
  function buildStrategicNotesHTML() {
    const log = state.eventLog ?? [];
    const interesting = log.filter(e =>
      e.playerVisible && ["alliance", "idol", "tribal", "strategy"].includes(e.category)
    );
    const recent = interesting.slice(-4).reverse();

    if (recent.length === 0) {
      return `
        <div class="strategic-notes-card">
          <div class="strategic-notes-header">
            <span class="strategic-notes-eyebrow">Strategic notes</span>
          </div>
          <div class="strategic-notes-empty">Nothing on the board yet.</div>
        </div>
      `;
    }

    const items = recent.map(e => `
      <li class="strategic-notes-item" data-cat="${e.category}">
        <span class="strategic-notes-round">R${e.round ?? "?"}</span>
        <span class="strategic-notes-text">${escapeHtml(e.text ?? "")}</span>
      </li>
    `).join("");

    return `
      <div class="strategic-notes-card">
        <div class="strategic-notes-header">
          <span class="strategic-notes-eyebrow">Strategic notes</span>
        </div>
        <ul class="strategic-notes-list">${items}</ul>
      </div>
    `;
  }

  function buildTribePanelHTML() {
    // Locale-aware alphabetical sort. Handles unicode names cleanly (accented
    // characters, mixed case, etc.). The player is rendered first as a self-
    // row, separate from the sort.
    const sorted = [...tribemates].sort((a, b) => a.name.localeCompare(b.name));
    const total  = sorted.length + 1;   // tribemates + the player

    const playerRow = `
      <li class="camp-tribe-row camp-tribe-row-self">
        <span class="camp-tribe-self-icon" aria-hidden="true">★</span>
        <span class="camp-tribe-name">You (${escapeHtml(getPlayerDisplayName(player, FORMAT_BY_SCREEN.campLife))})</span>
      </li>
    `;

    const tribemateRows = sorted.map(c => {
      const rel    = getRelationship(state, player.id, c.id);
      const trust  = getTrust(state, player.id, c.id);
      const tier   = getRelationshipTier(rel);
      const marker = getTrustMarker(trust);

      // Numeric values stay in the tooltip — readable on hover without
      // cluttering the panel. Trust line included so the marker isn't
      // mysterious when present.
      const tooltipParts = [`Relationship: ${rel.toFixed(0)}`, `Trust: ${trust.toFixed(0)}`];
      if (marker) tooltipParts.push(marker.title);
      const tooltip = tooltipParts.join(" · ");

      const markerHTML = marker
        ? `<span class="camp-tribe-trust-marker" data-trust="${marker.id}" aria-hidden="true">${marker.symbol}</span>`
        : "";

      return `
        <li class="camp-tribe-row" data-tier="${tier.id}" title="${escapeHtmlAttr(tooltip)}">
          <span class="camp-tribe-dot" aria-hidden="true"></span>
          <span class="camp-tribe-name">${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))}${markerHTML}</span>
          <span class="camp-tribe-tier-label">${tier.label}</span>
        </li>
      `;
    }).join("");

    return `
      <div class="camp-tribe-panel-header">
        <span class="camp-tribe-panel-title">Your Tribe</span>
        <span class="camp-tribe-panel-count">${total} member${total !== 1 ? "s" : ""}</span>
      </div>
      <ul class="camp-tribe-list">
        ${playerRow}
        ${tribemateRows}
      </ul>
    `;
  }

  // Local attribute-context escape helper — same impl as in setup screens.
  // Used by buildTribePanelHTML for the title tooltip text.
  function escapeHtmlAttr(s) {
    return escapeHtml(s);
  }

  // ── End-of-camp target list (v5.7) ───────────────────────────────────────
  //
  // Renders only during camp phase 2 when the player is going to tribal:
  //   • Pre-merge: their tribe must be the losing tribe (the one voting tonight)
  //   • Post-merge: always (every player attends every tribal)
  //
  // Top 3 ranked by aggregate vote pressure (getTopVoteTargets), then sorted
  // alphabetically for display so the ranking determines WHO is on the list
  // but not who's #1 — keeping it a read, not a spoiler.
  //
  // The immunity holder is filtered out by getTopVoteTargets directly, so
  // post-merge with a winning challenge result the panel shows the three
  // most-targeted vulnerable players.
  //
  // Refreshed inside showActionButtons so the picture updates live as the
  // player takes camp actions (lobby/talk/etc.) that shift the dynamics.
  function buildTargetListHTML() {
    if (state.campPhase !== 2) return "";

    // Pre-merge: only show when the player is heading to tribal.
    if (!state.merged && getPlayerTribeLabel() !== state.tribalTribe) return "";

    const attendees = state.merged
      ? state.tribes.merged
      : state.tribes[state.tribalTribe];
    if (!attendees || attendees.length < 2) return "";

    const top = getTopVoteTargets(state, attendees, 3);
    if (top.length === 0) return "";

    // Sort the displayed list alphabetically — the RANK determines membership,
    // alphabetical order doesn't reveal who's most in danger.
    const sorted = [...top].sort((a, b) =>
      a.contestant.name.localeCompare(b.contestant.name)
    );

    const playerInDanger = sorted.some(t => t.contestant.id === player.id);

    const rows = sorted.map(t => {
      const c = t.contestant;
      const isYou = c.id === player.id;
      return `
        <li class="target-row${isYou ? " target-row-you" : ""}">
          <span class="target-row-dot" aria-hidden="true">●</span>
          <span class="target-row-name">${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))}${isYou ? " (you)" : ""}</span>
        </li>
      `;
    }).join("");

    const headline = playerInDanger
      ? "You're on the list. Tonight could be the night."
      : "These three are drawing the most heat.";

    return `
      <div class="target-list-panel${playerInDanger ? " target-list-panel-danger" : ""}">
        <div class="target-list-header">
          <span class="target-list-title">Going Into Tribal</span>
        </div>
        <div class="target-list-subtitle">${escapeHtml(headline)}</div>
        <ul class="target-list">${rows}</ul>
        <div class="target-list-footer">
          A read on tribe pressure. Not a guarantee — votes can shift before they're cast.
        </div>
      </div>
    `;
  }

  const targetListHTML = buildTargetListHTML();

  // ── Shell ─────────────────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="screen" id="camp-screen">

      <div class="camp-header">
        <div class="camp-heading-block">
          <p class="screen-eyebrow">Episode ${state.round} · Day ${getDay(state) + (isPhase2 ? DAY_OFFSETS.campPhase2 : DAY_OFFSETS.campPhase1)}</p>
          <h2>${phaseLabel}</h2>
          <span class="camp-tribe-tag" style="color:${tribeColor}">${escapeHtml(tribeName)} tribe</span>
          <!-- v5.36: camp mood pill — single thematic word reflecting the
               current tribe temperature (calm/steady/uneasy/tense/chaotic).
               Updated live in showActionButtons as actions land. -->
          <span id="camp-mood-pill">${buildCampMoodPillHTML()}</span>
          <span class="camp-step-note">${stepNote}</span>
        </div>
        <div class="camp-header-right">
          <div id="actions-counter" class="actions-counter" data-state="${actionsLeft >= 3 ? 'fresh' : actionsLeft === 2 ? 'mid' : actionsLeft === 1 ? 'low' : 'empty'}">
            ${actionsLeft} of ${maxActions} actions left
          </div>
          <button class="season-log-btn" id="season-log-btn" title="Season Log">📜 Log</button>
        </div>
      </div>

      <div class="season-log-overlay hidden" id="season-log-overlay">
        <div class="season-log-panel">
          <div class="season-log-header">
            <span class="season-log-title">Season Log</span>
            <button class="season-log-close" id="season-log-close-btn" title="Close">✕</button>
          </div>
          <div class="season-log-list" id="season-log-list"></div>
        </div>
      </div>

      ${episodeOpener}

      ${statusBanner}

      <!-- v5.14: three-column camp layout. Left = Your Tribe; Center =
           action menus + outcome text; Right = alliances, target list,
           camp-role identity, strategic notes. The header above and the
           footer below remain full-width. -->
      <div class="camp-grid">

        <aside class="camp-col camp-col-left">
          <!-- v5.1: tribe relationship panel — populated by buildTribePanelHTML.
               Refreshed live in showActionButtons after each camp action so
               tier labels move as relationships change. -->
          <div id="camp-relationship-panel" class="camp-relationship-panel">
            ${buildTribePanelHTML()}
          </div>
        </aside>

        <main class="camp-col camp-col-center">
          <div id="action-area" class="action-area"></div>
          <div id="feedback-log" class="feedback-log"></div>
        </main>

        <aside class="camp-col camp-col-right">
          <div id="idol-badge-container">${idolBadgeHTML}</div>
          <div id="alliance-block-container">${allianceBlockHTML}</div>
          <!-- v5.7: end-of-camp target list — visible only during camp phase 2
               when the player is going to tribal. -->
          <div id="target-list-container">${targetListHTML}</div>
          <!-- v5.14: emerging camp-role identity card. Populated only after
               the player has taken at least 5 actions; otherwise quiet. -->
          <div id="camp-role-container">${buildCampRoleCardHTML()}</div>
          <!-- v5.14: recent strategic notes — last few player-visible event
               log entries relevant to camp strategy. -->
          <div id="strategic-notes-container">${buildStrategicNotesHTML()}</div>
        </aside>

      </div>

      <div class="camp-footer">
        <button id="continue-btn">${continueLabel}</button>
      </div>

    </div>
  `;

  const actionArea  = container.querySelector("#action-area");
  const feedbackLog = container.querySelector("#feedback-log");
  const counter     = container.querySelector("#actions-counter");

  container.querySelector("#continue-btn")
    .addEventListener("click", () => onCampLifeDone());

  // ── Season Log modal ──────────────────────────────────────────────────────
  // Player-visible event entries only. Refreshed each time the modal opens so
  // a search-then-open shows the latest find right away.
  const logOverlay  = container.querySelector("#season-log-overlay");
  const logListEl   = container.querySelector("#season-log-list");
  const logBtn      = container.querySelector("#season-log-btn");
  const logCloseBtn = container.querySelector("#season-log-close-btn");

  function refreshSeasonLog() {
    const events = getPlayerVisibleEvents(state).slice().reverse();   // newest first
    if (events.length === 0) {
      logListEl.innerHTML =
        `<p class="season-log-empty muted">No events yet — the season is just beginning.</p>`;
      return;
    }
    logListEl.innerHTML = events.map(e => {
      const tag = e.category[0].toUpperCase() + e.category.slice(1);
      return `
        <div class="season-log-entry season-log-entry-${e.category}">
          <div class="season-log-entry-meta">
            <span class="season-log-entry-day">Day ${e.day}</span>
            <span class="season-log-entry-tag">${tag}</span>
          </div>
          <div class="season-log-entry-text">${escapeHtml(e.text)}</div>
        </div>
      `;
    }).join("");
  }

  logBtn.addEventListener("click", () => {
    refreshSeasonLog();
    logOverlay.classList.remove("hidden");
  });
  logCloseBtn.addEventListener("click", () => {
    logOverlay.classList.add("hidden");
  });
  // Backdrop click closes too — but don't close when clicking inside the panel.
  logOverlay.addEventListener("click", e => {
    if (e.target === logOverlay) logOverlay.classList.add("hidden");
  });

  // v5.20: phase-entry snapshot — the comparison baseline for the
  // end-of-phase recap. Captured ONCE per camp screen render, before any
  // player action lands. Per-pair rel/trust + alliance strengths + the
  // player's pressure score and known-rumor count.
  const phaseSnapshot = buildPhaseSnapshot();

  showActionButtons();

  // ── Render phases ─────────────────────────────────────────────────────────

  function showActionButtons() {
    // Refresh the idol badge — the player may have just found one this action.
    const badgeContainer = container.querySelector("#idol-badge-container");
    if (badgeContainer) badgeContainer.innerHTML = buildIdolBadgeHTML();

    // Refresh the alliance block — proposeAlliance just succeeded, an existing
    // alliance just shifted strength tier, etc.
    const allianceContainer = container.querySelector("#alliance-block-container");
    if (allianceContainer) allianceContainer.innerHTML = buildAllianceBlockHTML();

    // v5.1: refresh the tribe relationship panel. Talk/confide/strategy/etc.
    // adjust relationships, so the tier labels need to follow.
    const tribePanel = container.querySelector("#camp-relationship-panel");
    if (tribePanel) tribePanel.innerHTML = buildTribePanelHTML();

    // v5.7: refresh the target list. Lobby/Push-a-vote can shift suspicion;
    // talk/confide can shift rel/trust; both move the pressure ranking.
    const targetListContainer = container.querySelector("#target-list-container");
    if (targetListContainer) targetListContainer.innerHTML = buildTargetListHTML();

    // v5.14: refresh the camp role card. Action history just changed —
    // role identity may have crossed a threshold this turn.
    const roleContainer = container.querySelector("#camp-role-container");
    if (roleContainer) roleContainer.innerHTML = buildCampRoleCardHTML();

    // v5.14: refresh strategic notes. Some actions push event log entries
    // (alliance formed, idol found) that should appear immediately.
    const notesContainer = container.querySelector("#strategic-notes-container");
    if (notesContainer) notesContainer.innerHTML = buildStrategicNotesHTML();

    // v5.36: refresh the camp mood pill. Most actions move underlying
    // signals (suspicion, rumors, conflicts, alliance strength) so the
    // tier may shift mid-phase as the player's camp moves accumulate.
    const moodPill = container.querySelector("#camp-mood-pill");
    if (moodPill) moodPill.innerHTML = buildCampMoodPillHTML();

    // Re-read live idol state for the search button — same reason.
    const currentHoldsScope = getHeldIdols(state, player.id)
      .some(i => i.scope === idolScope);

    actionArea.innerHTML = "";

    if (actionsLeft === 0) {
      // v5.20: end-of-camp recap replaces the bland "no actions left" line.
      // Diffs the phase-entry snapshot against current state and surfaces
      // the meaningful shifts in social/strategic language.
      actionArea.innerHTML = buildRecapHTML();
      return;
    }

    // v5.2: two-step submenu navigation.
    //   _currentCategory === null  → top-level category picker
    //   _currentCategory === "id"  → action list for that category + Back
    if (_currentCategory === null) {
      renderCategoryPicker(currentHoldsScope);
    } else {
      renderActionsInCategory(_currentCategory, currentHoldsScope);
    }
  }

  // Renders the top-level category picker — three cards (Social, Strategy,
  // Island), each labeled with the count of currently-available actions.
  //
  // Categories with zero available actions are skipped. This keeps the
  // picker tidy when, e.g. the idol system is disabled and Island shrinks
  // to one action — but if all of Island's actions are unavailable for
  // some reason, the card disappears entirely rather than dead-ending.
  function renderCategoryPicker(currentHoldsScope) {
    const grid = document.createElement("div");
    grid.className = "category-picker-grid";

    for (const category of CAMP_ACTION_CATEGORIES) {
      const actions = actionsForCategory(category.id);
      if (actions.length === 0) continue;

      const card = document.createElement("button");
      card.className = "category-card";
      card.innerHTML = `
        <div class="category-card-row">
          <span class="category-card-label">${category.label}</span>
          <span class="category-card-count">
            ${actions.length} action${actions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div class="category-card-desc">${category.description}</div>
        <span class="category-card-arrow" aria-hidden="true">→</span>
      `;
      card.addEventListener("click", () => {
        _currentCategory = category.id;
        showActionButtons();
      });
      grid.appendChild(card);
    }

    actionArea.appendChild(grid);
  }

  // Renders the action list inside a specific category. Includes a Back
  // link at the top that returns to the category picker. Reuses the
  // existing buildActionButton for each action, so per-action gating
  // (search disabled when idol already held, etc.) is preserved.
  function renderActionsInCategory(categoryId, currentHoldsScope) {
    const category = CAMP_ACTION_CATEGORIES.find(c => c.id === categoryId);

    // Defensive: if state.swapped or some external change invalidated the
    // category id, fall back to the picker rather than render nothing.
    if (!category) {
      _currentCategory = null;
      renderCategoryPicker(currentHoldsScope);
      return;
    }

    // Back link
    const back = document.createElement("button");
    back.className = "action-back-btn";
    back.textContent = "← Back to categories";
    back.addEventListener("click", () => {
      _currentCategory = null;
      showActionButtons();
    });
    actionArea.appendChild(back);

    // Category title + description, so the user knows where they are.
    const title = document.createElement("div");
    title.className = "category-section-title";
    title.innerHTML = `
      <span class="category-section-label">${category.label}</span>
      <span class="category-section-desc">${category.description}</span>
    `;
    actionArea.appendChild(title);

    // v5.25: Alliances category renders a management-area shell.
    // v5.26: when an alliance is selected via _currentAllianceId, render
    // the inspector view instead of the overview + action grid.
    if (categoryId === "alliances" && _currentAllianceId) {
      renderAllianceInspector(_currentAllianceId);
      return;
    }

    if (categoryId === "alliances") {
      const shell = document.createElement("div");
      shell.className = "alliance-shell";
      shell.innerHTML = buildAllianceShellHTML();
      actionArea.appendChild(shell);
      // v5.26: wire row clicks → inspector entry.
      for (const row of shell.querySelectorAll(".alliance-shell-row[data-alliance-id]")) {
        row.addEventListener("click", () => {
          _currentAllianceId = row.getAttribute("data-alliance-id");
          showActionButtons();
        });
      }
    }

    // Action grid for this category.
    const actions = actionsForCategory(category.id);
    const grid    = document.createElement("div");
    grid.className = "action-btn-grid";
    for (const action of actions) {
      grid.appendChild(buildActionButton(action, currentHoldsScope));
    }
    actionArea.appendChild(grid);

    // v5.25–v5.28: the forward-looking "planned tools" section has now been
    // fully implemented. Membership management, vote planning, and
    // preference reads all live in the inspector. The placeholder section
    // is no longer rendered.
  }

  // ── v5.26: Alliance inspector ─────────────────────────────────────────────
  //
  // Renders an alliance-specific management view inside the Alliances
  // category. The inspector shows the alliance name, tier, members with
  // their per-pair rel/trust read, an aggregate stability headline, and
  // three management actions: Bring someone in, Push someone out, Step
  // away. Each action consumes one of the player's daily action slots
  // through the standard resolveAction-style flow (decrements actionsLeft,
  // appends a feedback line, refreshes panels). When an action requires
  // selecting a target (invite / boot), an inline picker renders inside
  // the inspector rather than navigating away.

  function renderAllianceInspector(allianceId) {
    const alliance = (state.alliances ?? []).find(a => a.id === allianceId);

    // Defensive: if the alliance dissolved (e.g. last leave dropped it
    // below 2 members), fall back to the overview.
    if (!alliance || alliance.status === "dissolved") {
      _currentAllianceId = null;
      _allianceSubAction = null;
      showActionButtons();
      return;
    }

    // Inspector back link → returns to alliance overview.
    const back = document.createElement("button");
    back.className = "action-back-btn";
    back.textContent = "← Back to alliances";
    back.addEventListener("click", () => {
      _currentAllianceId = null;
      _allianceSubAction = null;
      showActionButtons();
    });
    actionArea.appendChild(back);

    // Header: alliance name + tier + stability headline.
    const tier = alliance.tier ?? (alliance.strength >= 7 ? "core" : alliance.strength >= 4 ? "loose" : "weakened");
    const tierLabel =
      tier === "core"     ? "Core"     :
      tier === "loose"    ? "Loose"    :
      "Weakened";
    const stability = buildAllianceStabilityHeadline(alliance);

    const header = document.createElement("div");
    header.className = "alliance-inspector-header";
    header.innerHTML = `
      <span class="alliance-inspector-eyebrow">Inspecting alliance</span>
      <span class="alliance-inspector-name">${escapeHtml(alliance.name)}</span>
      <span class="alliance-inspector-meta">
        <span class="alliance-inspector-tier" data-tier="${tier}">${tierLabel}</span>
        <span class="alliance-inspector-strength">${Math.round(alliance.strength ?? 0)}/10</span>
      </span>
      <span class="alliance-inspector-stability">${escapeHtml(stability)}</span>
    `;
    actionArea.appendChild(header);

    // Member list: each member's name + per-pair rel/trust read with the player.
    const memberList = document.createElement("ul");
    memberList.className = "alliance-inspector-members";
    for (const id of alliance.memberIds) {
      const c = findContestant(state, id);
      if (!c) continue;
      const isYou = id === player.id;
      const rel   = isYou ? null : getRelationship(state, player.id, id);
      const trust = isYou ? null : getTrust(state, player.id, id);
      const subline = isYou
        ? "(you)"
        : `${getRelationshipTier(rel).label.toLowerCase()} · trust ${trust.toFixed(0)}/10`;
      memberList.innerHTML += `
        <li class="alliance-inspector-member${isYou ? " alliance-inspector-member-self" : ""}">
          <span class="alliance-inspector-member-name">${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))}</span>
          <span class="alliance-inspector-member-sub">${escapeHtml(subline)}</span>
        </li>
      `;
    }
    actionArea.appendChild(memberList);

    // ── Sub-flow: target picker for invite / boot / vote ─────────────────
    if (_allianceSubAction === "invite" || _allianceSubAction === "boot" || _allianceSubAction === "vote") {
      renderAllianceTargetPicker(alliance);
      return;
    }

    // ── Action buttons ───────────────────────────────────────────────────
    const grid = document.createElement("div");
    grid.className = "alliance-inspector-actions";

    // Invite — only enabled if there are non-members in the active pool.
    const tribePool = state.merged
      ? (state.tribes?.merged || [])
      : (state.tribes?.[player.tribe] || []);
    // v5.29: button order goes from least-disruptive (information) to most
    // (membership changes, exit). The flow reads as: "find out → decide →
    // act → restructure → leave" so the player can navigate the inspector
    // without having to scan every button each time.

    // 1. Check alliance target — pure information, no consequences.
    // (v5.38: renamed from "Get a read on the alliance" for clearer intent —
    // the action specifically surfaces who each member is leaning toward
    // for the next vote.)
    const canRead = alliance.memberIds.length >= 2;
    grid.appendChild(buildAllianceActionButton({
      label: "Check alliance target",
      detail: "Ask each member who they're leaning toward. Some will be candid, some won't, and some may misdirect you.",
      disabled: !canRead,
      onClick: () => resolveAllianceAction("read", alliance, null),
    }));

    // 2. Push a vote plan — coordinated strategic move.
    const canCoordinate = alliance.memberIds.length >= 2 &&
      tribePool.some(c => c.id !== player.id);
    grid.appendChild(buildAllianceActionButton({
      label: "Push a vote plan",
      detail: "Pick a name and rally the alliance behind it. Some members will commit, some will hesitate, some may leak.",
      disabled: !canCoordinate,
      onClick: () => { _allianceSubAction = "vote"; showActionButtons(); },
    }));

    // 3. Bring someone new in — additive membership change.
    const inviteCandidates = tribePool.filter(c =>
      c.id !== player.id && !alliance.memberIds.includes(c.id)
    );
    grid.appendChild(buildAllianceActionButton({
      label: "Bring someone new in",
      detail: "Invite a tribemate. They may decline if the trust isn't there yet.",
      disabled: inviteCandidates.length === 0,
      onClick: () => { _allianceSubAction = "invite"; showActionButtons(); },
    }));

    // 4. Push someone out — disruptive membership change.
    const bootCandidates = alliance.memberIds.filter(id => id !== player.id);
    grid.appendChild(buildAllianceActionButton({
      label: "Push someone out",
      detail: "Move to remove a member. The other members decide whether it lands.",
      disabled: bootCandidates.length === 0,
      onClick: () => { _allianceSubAction = "boot"; showActionButtons(); },
    }));

    // 5. Step away — exit the alliance entirely.
    grid.appendChild(buildAllianceActionButton({
      label: "Step away from this pact",
      detail: "Walk out. Members will not take it well — and the camp will read you flaky.",
      disabled: false,
      onClick: () => resolveAllianceAction("leave", alliance, null),
    }));

    actionArea.appendChild(grid);
  }

  // Inline target picker for invite / boot sub-flows. Renders a list of
  // valid candidates with rel/trust hints; clicking resolves the action.
  function renderAllianceTargetPicker(alliance) {
    const cancel = document.createElement("button");
    cancel.className = "action-back-btn";
    cancel.textContent = "← Cancel";
    cancel.addEventListener("click", () => {
      _allianceSubAction = null;
      showActionButtons();
    });
    actionArea.appendChild(cancel);

    const heading = document.createElement("div");
    heading.className = "alliance-inspector-subheading";
    heading.textContent =
        _allianceSubAction === "invite" ? "Who do you want to bring in?"
      : _allianceSubAction === "boot"   ? "Who do you want to push out?"
      :                                   "Whose name do you want to push?";
    actionArea.appendChild(heading);

    const tribePool = state.merged
      ? (state.tribes?.merged || [])
      : (state.tribes?.[player.tribe] || []);

    let candidates = [];
    if (_allianceSubAction === "invite") {
      candidates = tribePool.filter(c =>
        c.id !== player.id && !alliance.memberIds.includes(c.id)
      );
    } else if (_allianceSubAction === "boot") {
      candidates = alliance.memberIds
        .filter(id => id !== player.id)
        .map(id => findContestant(state, id))
        .filter(Boolean);
    } else {
      // v5.27: vote target — any active tribemate other than the player.
      // Targeting an alliance member is allowed but obviously high-friction
      // (those members are likely to reject); the engine handles the fallout.
      candidates = tribePool.filter(c => c.id !== player.id);
    }

    if (candidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = _allianceSubAction === "invite"
        ? "There's no one available to bring in right now."
        : "There's no one to push out.";
      actionArea.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "target-chip-row";
    for (const c of candidates) {
      const rel   = getRelationship(state, player.id, c.id);
      const trust = getTrust(state, player.id, c.id);
      const tier  = getRelationshipTier(rel);
      const chip = document.createElement("button");
      chip.className = "target-chip";
      chip.innerHTML = `
        <span>${escapeHtml(getPlayerDisplayName(c, FORMAT_BY_SCREEN.campLife))}</span>
        <span class="target-chip-sub">${tier.label.toLowerCase()} · trust ${trust.toFixed(0)}</span>
      `;
      chip.addEventListener("click", () => {
        const sub = _allianceSubAction;
        _allianceSubAction = null;
        resolveAllianceAction(sub, alliance, c);
      });
      list.appendChild(chip);
    }
    actionArea.appendChild(list);
  }

  // Resolves a membership action through the engine helper, decrements the
  // action budget, appends a feedback line, and refreshes the inspector.
  function resolveAllianceAction(kind, alliance, target) {
    let result;
    if (kind === "invite") {
      result = inviteToAlliance(state, alliance.id, player.id, target.id);
    } else if (kind === "boot") {
      result = bootFromAlliance(state, alliance.id, player.id, target.id);
    } else if (kind === "leave") {
      result = leaveAlliance(state, alliance.id, player.id);
    } else if (kind === "vote") {
      result = coordinateAllianceVote(state, alliance.id, player.id, target.id);
    } else if (kind === "read") {
      result = readAlliancePreferences(state, alliance.id, player.id);
    } else {
      return;
    }

    // Action cost — these are real camp moves and consume an action slot.
    actionsLeft--;
    counter.textContent = actionsLeft > 0
      ? `${actionsLeft} of ${maxActions} actions left`
      : "No actions left";
    counter.dataset.state =
      actionsLeft >= 3 ? "fresh" :
      actionsLeft === 2 ? "mid" :
      actionsLeft === 1 ? "low" : "empty";

    // Feedback log line — uses the same path as other actions.
    const labelText =
      kind === "invite" ? `Bring in · ${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife))}` :
      kind === "boot"   ? `Push out · ${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife))}` :
      kind === "vote"   ? `Vote plan · ${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife))}` :
      kind === "read"   ? `Check alliance target · ${escapeHtml(alliance.name)}` :
      "Step away from alliance";
    const entry = document.createElement("div");
    entry.className = "feedback-entry";
    if (kind === "vote") {
      // v5.27: per-member breakdown card. Replaces the single feedback line
      // with a structured response list so the player can see who's with
      // them and who isn't.
      entry.innerHTML = `
        <span class="feedback-action-tag">${labelText}</span>
        ${buildVoteCoordinationFeedbackHTML(result, target, alliance)}
      `;
    } else if (kind === "read") {
      // v5.28: per-member preference read card. Same shape as the vote-
      // coordination breakdown but surfaces what each member SAID rather
      // than what they committed to.
      entry.innerHTML = `
        <span class="feedback-action-tag">${labelText}</span>
        ${buildAlliancePreferenceReadHTML(result, alliance)}
      `;
    } else {
      entry.innerHTML = `
        <span class="feedback-action-tag">${labelText}</span>
        <span class="feedback-text">${escapeHtml(result.feedback ?? "")}</span>
      `;
    }
    feedbackLog.prepend(entry);

    // If leaving dissolved the player's perspective on this alliance, drop
    // the inspector back to the overview. Otherwise re-render inspector.
    const stillIn = (state.alliances ?? []).some(a =>
      a.id === alliance.id && a.status !== "dissolved" && a.memberIds.includes(player.id)
    );
    if (!stillIn) _currentAllianceId = null;

    showActionButtons();
  }

  // v5.27: builds the per-member breakdown card for a vote-coordination
  // outcome. Renders one row per alliance member's response, plus a small
  // headline summarizing the overall result. Survivor-flavored language;
  // no raw scores leak.
  function buildVoteCoordinationFeedbackHTML(result, target, alliance) {
    if (result.error) {
      return `<span class="feedback-text">${escapeHtml(result.error)}</span>`;
    }
    if (!result.responses || result.responses.length === 0) {
      return `<span class="feedback-text">You laid out the plan against ${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife))}, but there was nobody else in "${escapeHtml(alliance.name)}" to respond.</span>`;
    }

    const RESPONSE_FLAVOR = {
      "agree":      { icon: "✓", label: "agreed",       color: "agree"     },
      "soft-agree": { icon: "~", label: "soft yes",     color: "softagree" },
      "hesitate":   { icon: "?", label: "hesitated",    color: "hesitate"  },
      "mislead":    { icon: "≈", label: "said yes...",  color: "mislead"   },
      "leak":       { icon: "‼", label: "leaked it",    color: "leak"      },
      "reject":     { icon: "✗", label: "rejected",     color: "reject"    },
    };

    const rows = result.responses.map(r => {
      const f = RESPONSE_FLAVOR[r.response] ?? RESPONSE_FLAVOR.hesitate;
      return `
        <li class="vote-coord-row" data-response="${f.color}">
          <span class="vote-coord-icon">${f.icon}</span>
          <span class="vote-coord-name">${escapeHtml(getPlayerDisplayName(r, FORMAT_BY_SCREEN.campLife))}</span>
          <span class="vote-coord-label">${f.label}</span>
        </li>
      `;
    }).join("");

    // Headline: synthesize the overall read.
    const total = result.responses.length;
    const fullAgree = result.agreeCount ?? 0;
    const totalYes  = result.totalAgree ?? 0;
    const rejects   = result.rejectCount ?? 0;
    const leaks     = result.leakCount ?? 0;

    let headline;
    if (totalYes === total && rejects === 0 && leaks === 0) {
      headline = `The room was with you. "${alliance.name}" is locked in on ${getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife)}.`;
    } else if (totalYes >= Math.ceil(total / 2) && rejects === 0) {
      headline = `Most of "${alliance.name}" came along. You have a majority pointing at ${getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife)}.`;
    } else if (rejects >= 2) {
      headline = `The pitch hit a wall. "${alliance.name}" is fracturing — multiple members refused to commit to ${getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife)}.`;
    } else if (leaks >= 1) {
      headline = `The plan didn't stay in the room. Word about ${getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife)} is going to travel.`;
    } else if (fullAgree === 0) {
      headline = `Nobody fully committed. The pitch landed somewhere between "maybe" and "not yet."`;
    } else {
      headline = `Mixed read. Some came along, some didn't. The plan is alive but not decided.`;
    }

    return `
      <div class="vote-coord-card">
        <p class="vote-coord-headline">${escapeHtml(headline)}</p>
        <ul class="vote-coord-list">${rows}</ul>
      </div>
    `;
  }

  // v5.28: builds the per-member preference-read card for an alliance read.
  // Structurally mirrors the vote-coordination breakdown — headline + colored
  // per-member rows. The headline reflects what the asker would BELIEVE
  // (misleading reads count toward the named target on purpose).
  function buildAlliancePreferenceReadHTML(result, alliance) {
    if (result.error) {
      return `<span class="feedback-text">${escapeHtml(result.error)}</span>`;
    }
    if (!result.reads || result.reads.length === 0) {
      return `<span class="feedback-text">There was nobody else in "${escapeHtml(alliance.name)}" to read.</span>`;
    }

    const READ_FLAVOR = {
      "aligned":     { icon: "✓", label: "candid",       color: "agree"     },
      "hedged":      { icon: "~", label: "hinting",      color: "softagree" },
      "uncommitted": { icon: "·", label: "no read yet",  color: "hesitate"  },
      "vague":       { icon: "?", label: "evasive",      color: "hesitate"  },
      "misleading":  { icon: "≈", label: "named someone",color: "mislead"   },
      "silent":      { icon: "—", label: "wouldn't say", color: "reject"    },
    };

    const rows = result.reads.map(r => {
      const f = READ_FLAVOR[r.kind] ?? READ_FLAVOR.vague;
      const detail =
          r.kind === "aligned"    ? `leaning ${r.target.name}`
        : r.kind === "hedged"     ? `hinted at ${r.target.name}`
        : r.kind === "misleading" ? `named ${r.target.name}`
        : "";
      return `
        <li class="vote-coord-row" data-response="${f.color}">
          <span class="vote-coord-icon">${f.icon}</span>
          <span class="vote-coord-name">${escapeHtml(getPlayerDisplayName(r, FORMAT_BY_SCREEN.campLife))}${detail ? ` <span class="vote-coord-detail">— ${escapeHtml(detail)}</span>` : ""}</span>
          <span class="vote-coord-label">${f.label}</span>
        </li>
      `;
    }).join("");

    // Headline synthesis. The dominant-target read CAN be a misleading read;
    // we deliberately show what the player would believe based on what was
    // said. The "(could be soft)" hedge fires when committed reads are mixed
    // with misleading or silent ones, telegraphing that the read isn't clean.
    const total       = result.total;
    const committed   = result.committedCount;
    const dominant    = result.dominantTargetName;
    const dominantN   = result.dominantCount;
    const distinct    = result.distinctTargets;
    const silent      = result.silentCount;
    const uncommitted = result.uncommittedCount;
    const misleading  = result.misleadingCount;

    let headline;
    if (committed === 0 && uncommitted === total) {
      headline = `No one's locked in. The alliance hasn't formed an opinion yet.`;
    } else if (committed === 0) {
      headline = `Nobody would give you a real name. The room closed up.`;
    } else if (dominantN === total) {
      headline = `The alliance reads aligned on ${dominant}.`;
    } else if (dominantN >= Math.ceil(total / 2) && distinct === 1) {
      headline = `Most of the alliance is leaning ${dominant}.`;
    } else if (distinct >= 2) {
      headline = `The alliance is split — different members named different people.`;
    } else if (silent + uncommitted >= Math.ceil(total / 2)) {
      headline = `The room was mostly quiet. ${dominant ? `${dominant}'s name came up — but only from one corner.` : "Hard to tell where the consensus lies."}`;
    } else {
      headline = `Mixed read. ${dominant ? `${dominant} surfaced, but the picture isn't clean.` : "Nobody's clearly committed."}`;
    }

    // Hedge if there's noise (mislead / silent) clouding the read.
    const noisy = misleading + silent;
    if (noisy >= Math.ceil(total / 2) && committed > 0) {
      headline += " Take this with a grain of salt — too many people weren't being straight.";
    }

    return `
      <div class="vote-coord-card">
        <p class="vote-coord-headline">${escapeHtml(headline)}</p>
        <ul class="vote-coord-list">${rows}</ul>
      </div>
    `;
  }

  // Aggregates a one-line stability read from current alliance state.
  // Hedged language only; no numeric leak. Used at the top of the
  // inspector so the player has a high-level read without parsing the
  // raw strength bar.
  function buildAllianceStabilityHeadline(alliance) {
    const strength = alliance.strength ?? 0;
    let pairCount = 0, relSum = 0, trustSum = 0;
    for (let i = 0; i < alliance.memberIds.length; i++) {
      for (let j = i + 1; j < alliance.memberIds.length; j++) {
        relSum   += getRelationship(state, alliance.memberIds[i], alliance.memberIds[j]);
        trustSum += getTrust(state, alliance.memberIds[i], alliance.memberIds[j]);
        pairCount++;
      }
    }
    const avgRel   = pairCount > 0 ? relSum / pairCount : 0;
    const avgTrust = pairCount > 0 ? trustSum / pairCount : 3;

    if (strength >= 8 && avgRel >= 8 && avgTrust >= 6) {
      return "This pact feels solid. Members aren't looking for the door.";
    }
    if (strength >= 6 && avgTrust >= 5) {
      return "Functional. Not yet ride-or-die, but steady.";
    }
    if (strength <= 3) {
      return "Hanging by a thread. One bad round could end this.";
    }
    if (avgTrust < 4) {
      return "The math works on paper. The trust under it doesn't.";
    }
    return "Workable, but uneven. Different members feel different things.";
  }

  // Tiny helper: builds an inspector-style action button with a label,
  // detail line, and click handler. Disabled buttons are visually muted
  // and click-inert.
  function buildAllianceActionButton({ label, detail, disabled, onClick }) {
    const btn = document.createElement("button");
    btn.className = "action-btn alliance-inspector-action-btn"
      + (disabled ? " action-btn-unavail" : "");
    btn.disabled = !!disabled;
    btn.innerHTML = `
      <span class="action-btn-label">${label}</span>
      <span class="action-btn-detail">${detail}</span>
    `;
    if (!disabled) btn.addEventListener("click", onClick);
    return btn;
  }

  // v5.25: builds the alliance overview block shown at the top of the
  // Alliances category section. Lists every active alliance the player is
  // in with members, strength, and tier — a management-context snapshot
  // distinct from the right-column block (which surfaces the same info
  // passively across all categories). This panel ALSO surfaces an empty
  // state when the player isn't in any alliance, prompting them toward
  // the Propose action below.
  function buildAllianceShellHTML() {
    const myAlliances = (state.alliances ?? []).filter(a =>
      a.status !== "dissolved" && a.memberIds.includes(player.id)
    );

    const intro = `
      <div class="alliance-shell-header">
        <span class="alliance-shell-eyebrow">Manage your alliances</span>
        <span class="alliance-shell-title">${myAlliances.length === 0
          ? "You're unaligned right now."
          : `${myAlliances.length} active pact${myAlliances.length !== 1 ? "s" : ""}`}</span>
      </div>
    `;

    if (myAlliances.length === 0) {
      return intro + `
        <div class="alliance-shell-empty">
          You haven't locked in a partnership yet. Propose one below to get started.
        </div>
      `;
    }

    const rows = myAlliances.map(a => {
      const tier   = a.tier ?? (a.strength >= 7 ? "core" : a.strength >= 4 ? "loose" : "weakened");
      const tierLabel =
        tier === "core"     ? "Core"     :
        tier === "loose"    ? "Loose"    :
        "Weakened";
      const others = a.memberIds
        .filter(id => id !== player.id)
        .map(id => findContestant(state, id)?.name ?? "?")
        .map(n => `<span class="alliance-shell-chip">${escapeHtml(n)}</span>`)
        .join("");
      const strengthInt = Math.round(a.strength ?? 0);
      const widthPct    = Math.max(5, strengthInt * 10);
      return `
        <div class="alliance-shell-row alliance-shell-row-clickable"
             data-tier="${tier}"
             data-alliance-id="${escapeHtml(a.id)}"
             title="Click to inspect and manage">
          <div class="alliance-shell-row-top">
            <span class="alliance-shell-name">${escapeHtml(a.name)}</span>
            <span class="alliance-shell-tier">${tierLabel}</span>
          </div>
          <div class="alliance-shell-members">${others}</div>
          <div class="alliance-shell-strength">
            <span class="alliance-shell-bar"><span class="alliance-shell-bar-fill" style="width:${widthPct}%"></span></span>
            <span class="alliance-shell-strength-num">${strengthInt}/10</span>
          </div>
          <span class="alliance-shell-arrow" aria-hidden="true">→</span>
        </div>
      `;
    }).join("");

    return intro + `<div class="alliance-shell-list">${rows}</div>`;
  }

  // v5.25: placeholder structure for future deep alliance management.
  // Each row is purely informational — it shows the player what kinds of
  // tools will land here, without any clickable behavior yet. Marked with
  // a "coming soon" pill so the player isn't confused about availability.
  // v5.28: planned-tools placeholder retired. All originally-placeholdered
  // alliance tools — overview, membership management, vote planning, and
  // preference reads — are now fully implemented in the alliance inspector.

  // Helper: returns the actions in a given category that should currently
  // render (some are gated by season config — e.g. searchidol when idols are
  // disabled). Used both by the picker (for counts) and the in-category view.
  function actionsForCategory(categoryId) {
    return CAMP_ACTIONS
      .filter(a => a.category === categoryId)
      .filter(a => actionShouldRender(a));
  }

  // Returns false for actions that should be hidden entirely from this run
  // (e.g. idol search when the idol system is disabled in season config).
  // Disabling-but-visible cases (idol already held) are handled in
  // buildActionButton by setting the `unavailable` flag — those still render.
  function actionShouldRender(action) {
    if (action.id === "searchidol" && SEASON_CONFIG.idolsEnabled === false) return false;
    return true;
  }

  // Builds a single action button. Extracted from showActionButtons so
  // category sections share the per-button logic and future v5.x submenu
  // variants can reuse it without duplicating click wiring.
  function buildActionButton(action, currentHoldsScope) {
    const btn = document.createElement("button");
    btn.className = "action-btn";

    // The search action is disabled once there is nothing left to find in
    // the current scope. The badge already tells the player they have it,
    // so the detail text just confirms why this option is locked.
    let detailText  = action.detail;
    let unavailable = false;
    if (action.id === "searchidol" && currentHoldsScope) {
      detailText  = "You already hold the idol hidden at this camp.";
      unavailable = true;
    }

    btn.innerHTML = `
      <span class="action-btn-label">${action.label}</span>
      <span class="action-btn-detail">${detailText}</span>
    `;

    if (unavailable) {
      btn.disabled = true;
      btn.classList.add("action-btn-unavail");
    } else {
      btn.addEventListener("click", () => onActionClick(action));
    }

    return btn;
  }

  function showTargetPicker(action) {
    actionArea.innerHTML = "";

    const picker = document.createElement("div");
    picker.className = "target-picker";
    picker.innerHTML = `
      <p class="target-picker-prompt">
        <strong>${action.label}</strong> — ${action.targetPrompt ?? "choose someone"}:
      </p>
      <div class="target-chip-row" id="target-chips"></div>
      <button id="cancel-target-btn" class="cancel-btn">← Cancel</button>
    `;

    const chipRow = picker.querySelector("#target-chips");
    for (const mate of tribemates) {
      const chip = document.createElement("button");
      chip.className = "target-chip";
      chip.textContent = mate.name;
      chip.addEventListener("click", () => onTargetSelected(action, mate));
      chipRow.appendChild(chip);
    }

    picker.querySelector("#cancel-target-btn")
      .addEventListener("click", () => showActionButtons());

    actionArea.appendChild(picker);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function onActionClick(action) {
    if (actionsLeft === 0) return;
    if (action.needsTarget) {
      showTargetPicker(action);
    } else {
      resolveAction(action, null);
    }
  }

  function onTargetSelected(action, target) {
    resolveAction(action, target);
  }

  function resolveAction(action, target) {
    const result = executeAction(state, action.id, player, tribemates, target);
    actionsLeft--;
    appendFeedback(action, target, result.feedback);
    counter.textContent = actionsLeft > 0
      ? `${actionsLeft} of ${maxActions} actions left`
      : "No actions left";
    counter.dataset.state =
      actionsLeft >= 3 ? "fresh" :
      actionsLeft === 2 ? "mid" :
      actionsLeft === 1 ? "low" : "empty";
    showActionButtons();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function appendFeedback(action, target, text) {
    const tag   = target ? `${action.label} · ${escapeHtml(getPlayerDisplayName(target, FORMAT_BY_SCREEN.campLife))}` : action.label;
    const entry = document.createElement("div");
    entry.className = "feedback-entry";
    entry.innerHTML = `
      <span class="feedback-action-tag">${tag}</span>
      <span class="feedback-text">${escapeHtml(text)}</span>
    `;
    feedbackLog.insertBefore(entry, feedbackLog.firstChild);
  }
}
