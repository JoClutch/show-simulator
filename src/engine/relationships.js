// relationships.js — relationship data API
//
// Scores live in state.relationships as a nested object:
//   state.relationships[idA][idB] = number
//
// Both directions are always written together so either lookup order works.
// Scores are hidden from the player and influence AI voting at Tribal Council.
//
// Score guide:
//   +20 and above : close allies
//    +5 to  +19   : friendly
//    -4 to   +4   : neutral
//   -19 to   -5   : suspicious
//   -20 and below : enemies

// Builds an entry for every pair of active contestants, all starting at 0.
// Must be called after assignTribes() so state.tribes is populated.
function initRelationships(state) {
  const all = [...state.tribes.A, ...state.tribes.B];

  for (const c of all) {
    state.relationships[c.id] = {};
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      state.relationships[all[i].id][all[j].id] = 0;
      state.relationships[all[j].id][all[i].id] = 0;
    }
  }
}

// Returns the score idA has toward idB. Returns 0 for unknown pairs.
function getRelationship(state, idA, idB) {
  return state.relationships[idA]?.[idB] ?? 0;
}

// Applies delta to both directions of the relationship between idA and idB.
function adjustRelationship(state, idA, idB, delta) {
  if (!state.relationships[idA] || !state.relationships[idB]) return;
  state.relationships[idA][idB] = (state.relationships[idA][idB] ?? 0) + delta;
  state.relationships[idB][idA] = (state.relationships[idB][idA] ?? 0) + delta;
}
