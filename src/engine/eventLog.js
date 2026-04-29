// eventLog.js — unified season event recording
//
// state.eventLog is a chronological list of milestones the simulator has
// produced. Two consumers:
//
//   • Dev panel — shows all events (including AI-only) for inspection.
//   • Player UI — shows only events flagged playerVisible (a "Season Log").
//
// The visibility flag is the privacy boundary: it keeps hidden information
// hidden in normal play (e.g. AI-only alliances forming silently) while still
// recording everything for debug and balance work.
//
// Event shape:
//   {
//     round:         current round at log time
//     day:           current in-game day
//     category:      "idol" | "alliance" | "swap" | "merge" | "tribal" | "game"
//     type:          short slug for the specific event ("found", "played", ...)
//     text:          one-line human-readable description (used in UI)
//     playerVisible: bool — does the player UI surface this entry?
//     meta:          optional structured detail (e.g. { allianceId, idolId })
//   }
//
// Engine functions push into state.eventLog via logEvent(). They never read
// from it. UI functions read; only the helper here writes.

// Pushes one event onto state.eventLog.
// fields = { category, type, text, playerVisible?, meta? }
// round/day are stamped from current state automatically — callers don't pass them.
function logEvent(state, fields) {
  if (!state.eventLog) state.eventLog = [];
  state.eventLog.push({
    round:         state.round,
    day:           getDay(state),
    category:      fields.category,
    type:          fields.type,
    text:          fields.text,
    playerVisible: fields.playerVisible ?? true,
    meta:          fields.meta ?? {},
  });
}

// Convenience filter for the player Season Log UI.
// Returns events flagged playerVisible, in chronological order (oldest first).
// The UI is responsible for reversing if it wants newest-first display.
function getPlayerVisibleEvents(state) {
  return (state.eventLog ?? []).filter(e => e.playerVisible);
}
