// jury.js — jury membership and sentiment computation
//
// ── When jury begins ──────────────────────────────────────────────────────────
// Jury begins at the merge. Every player eliminated from the merge onward
// becomes a juror. For this season: merge at 10 players → up to 7 jurors
// (positions 10th through 4th) before the Final 3.
//
// ── Data stored per juror ─────────────────────────────────────────────────────
// Stamped onto the contestant object when they are added to state.jury:
//
//   juror.juryNumber   integer   — ordinal position (1 = first juror)
//   juror.sentiment    object    — { [survivorId]: number }, snapshotted at
//                                  the moment of elimination
//
// The sentiment snapshot is computed AFTER removeFromTribes() has run, so
// getAllActive() correctly returns only the survivors at that point.
//
// ── Sentiment formula ─────────────────────────────────────────────────────────
//   sentiment[survivorId] = relationship(juror → survivor) + (trust − 3) × 2
//
//   relationship: ranges roughly −50 to +50 from camp interactions
//   trust adjustment: shifts −6 (trust 0) to +14 (trust 10); baseline 3 = 0
//   combined range: roughly −56 to +64
//
//   Positive → juror inclined to favour that player at Final Tribal.
//   Negative → juror holds a grudge or distrust.
//
// ── Sentiment tiers (for UI display) ─────────────────────────────────────────
//   > +5  : "favorable"    shown in green
//   −5–+5 : "mixed"        shown in gray
//   < −5  : "unfavorable"  shown in red

// ── Core computation ──────────────────────────────────────────────────────────

// Returns a sentiment map { [survivorId]: score } for the given juror
// toward each surviving player at the time they are eliminated.
// Pure function — does not mutate state.
function buildJurySentiment(state, juror, survivors) {
  const sentiment = {};
  for (const survivor of survivors) {
    const rel   = getRelationship(state, juror.id, survivor.id);
    const trust = getTrust(state, juror.id, survivor.id);
    sentiment[survivor.id] = rel + (trust - 3) * 2;
  }
  return sentiment;
}

// ── Display helpers ───────────────────────────────────────────────────────────

// Classifies a raw sentiment score into a named display tier.
// Thresholds are tuned to the realistic post-gameplay score range: most players
// will have relationships in the −20 to +30 range after 6 rounds of camp.
function sentimentTier(score) {
  if (score >  5) return "favorable";
  if (score < -5) return "unfavorable";
  return "mixed";
}

// Human-readable label for a tier, used in tooltips and legend text.
function sentimentLabel(tier) {
  switch (tier) {
    case "favorable":   return "Favorable";
    case "unfavorable": return "Unfavorable";
    default:            return "Mixed";
  }
}
