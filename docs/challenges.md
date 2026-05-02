# Challenge System (v9.2)

Developer reference for how immunity challenges are scored, how to add new
challenges, and how to tune balance.

## Three challenge skills

Every contestant has three challenge sub-skills, each an integer 1–10:

| Field                     | Captures                                              |
| ------------------------- | ----------------------------------------------------- |
| `physicalChallengeSkill`  | Strength, speed, raw athleticism                      |
| `mentalChallengeSkill`    | Puzzles, memory, pattern recognition                  |
| `enduranceChallengeSkill` | Sustained holds, willpower, fatigue resistance        |

A legacy field `challenge` is still stored on each contestant as the rounded
average of the three. It exists so non-resolution code (AI threat math, dev
panel, flavor thresholds) can keep reading a single composite without changes.
The three sub-skills are the source of truth — the legacy field is recomputed
by `normalizeContestantStats()` on every cast load and on every cast-editor
save.

## Challenge typing

Each entry in `CHALLENGES` (pre-merge) and `INDIVIDUAL_CHALLENGES` (post-merge)
in `src/engine/challenge.js` carries:

```js
{
  name:                  "Obstacle Course",
  description:           "...",
  challengeType:         "physical",   // descriptive label (UI / flavor)
  challengeSkillWeights: { physical: 0.7, mental: 0.1, endurance: 0.2 },
}
```

`challengeType` is one of `"physical" | "mental" | "endurance" | "mixed"`.
The label is for UI / future filtering — the resolution math reads weights
only, so a "mixed" challenge with `{ physical: 0.5, mental: 0.5, endurance: 0 }`
behaves exactly as written, regardless of the type tag.

`challengeSkillWeights` should sum to **1.0** so the effective rating stays
on a 1–10 scale. The weights are not validated at runtime — designers are
expected to keep them honest.

## Effective performance rating

A single function in `src/engine/challenge.js`:

```js
getEffectiveChallengePerformance(contestant, challenge)
  → physical * w.physical + mental * w.mental + endurance * w.endurance
```

This is the only place that decides "how does a player perform at this
challenge?". Resolution paths (`runChallenge`, `runIndividualChallenge`) call
it for every participant.

For a player with `physical=8, mental=4, endurance=6` the rating is:

| Challenge       | Weights         | Rating |
| --------------- | --------------- | ------ |
| Obstacle Course | 0.7 / 0.1 / 0.2 | 7.2    |
| Puzzle Race     | 0.1 / 0.7 / 0.2 | 4.8    |
| Endurance Hold  | 0.2 / 0.1 / 0.7 | 6.2    |

Same player, three very different threat profiles.

## Adding a new challenge

1. Decide the dominant feel — physical, mental, endurance, or mixed.
2. Pick weights that sum to 1.
   - Pure type → use `CHALLENGE_WEIGHT_PHYSICAL`, `_MENTAL`, or `_ENDURANCE`.
   - Mixed → write inline weights, e.g. `{ physical: 0.4, mental: 0.4, endurance: 0.2 }`.
3. Append to `CHALLENGES` (pre-merge tribal) or `INDIVIDUAL_CHALLENGES` (post-
   merge individual). No other code edits required.

Example:

```js
{
  name: "Slingshot Targets",
  description: "Each tribe took turns firing slingshots at distant targets.",
  challengeType:         "mixed",
  challengeSkillWeights: { physical: 0.3, mental: 0.6, endurance: 0.1 },
},
```

## Tuning balance

All tuning constants are at the top of `src/engine/challenge.js`. Editing
them re-tunes the system without touching individual challenge entries.

### Pure-type weight shares

```js
PURE_DOMINANT_SHARE  = 0.7;   // weight on the matching skill
PURE_SECONDARY_SHARE = 0.2;   // weight on the most-relevant cross-skill
PURE_TERTIARY_SHARE  = 0.1;   // weight on the least-relevant cross-skill
```

- **Sharper specialization** (mental specialists destroy puzzles): raise
  `PURE_DOMINANT_SHARE` toward 0.85, drop the others.
- **Softer specialization** (more like the old generic stat): push toward
  equal thirds (e.g. 0.5 / 0.25 / 0.25).

### Randomness

```js
TRIBE_NOISE_PER_MEMBER     = 2.5;   // per-member tribe-score noise cap
INDIVIDUAL_NOISE_RANGE     = 4;     // per-contestant individual noise cap
TRIBE_CLOSE_FINISH_RATIO   = 0.15;  // "wasClose" trigger for tribal results
INDIVIDUAL_CLOSE_FINISH_GAP = 1.5;  // "wasClose" trigger for individual results
```

- **More skill, less luck:** lower the two `_NOISE_` constants.
- **More chaos, more upsets:** raise them.
- **Live tuning:** all noise is multiplied by `window.DEV_CONFIG.challengeRandomness`
  (default 1). Setting it to 0 makes outcomes deterministic by skill alone;
  setting it to 2 doubles all variance.

### Non-linear curve

```js
CHALLENGE_RATING_EXPONENT = 1.0;
```

Optional exponent applied to the rating before scoring (re-scaled so the
max still lands at 10 — exponent doesn't silently amplify noise).

- **1.0** — linear, behavior identical to v9.2.0 (default)
- **1.5** — strong skill amplification: high-skill players disproportionately dominant
- **0.7** — flatter curve: low-skill still has a real shot

Use `setChallengeRatingExponent(value)` to change at runtime; it returns the
previous value so callers (e.g., tests) can restore it.

## Resolution flow

Pre-merge tribe challenge:

```
runChallenge(tribes)
  → pick random challenge from CHALLENGES
  → evaluateTribe(tribes.A, challenge) — sums effective rating per member + noise
  → evaluateTribe(tribes.B, challenge)
  → higher score wins; "wasClose" if relative gap < TRIBE_CLOSE_FINISH_RATIO
  → returns { winner, loser, wasClose, name, description, challengeType,
              topPerformer, weakestPerformer }
```

Post-merge individual challenge:

```
runIndividualChallenge(members)
  → pick random challenge from INDIVIDUAL_CHALLENGES
  → for each member: score = effectiveRating + Math.random() * INDIVIDUAL_NOISE_RANGE
  → highest score wins
  → returns { winner, runnerUp, wasClose, name, description, challengeType,
              weakestPerformer }
```

`topPerformer` / `weakestPerformer` are picked by **rating** (skill-only),
not by the noise-affected score, so the narrative honestly tells you who
should have been the standout — not who got the luckiest roll.

## Testing

Run `tests-challenges.html` in a browser. The suite uses statistical bias
(1,000 trials per scenario) to verify that:

- Physical specialists win physical challenges with a clear majority.
- Mental specialists win mental challenges with a clear majority.
- Endurance specialists win endurance challenges with a clear majority.
- Specialists do *not* dominate challenges of the wrong type.
- Increasing `CHALLENGE_RATING_EXPONENT` widens the win margin.
- Increasing randomness narrows the win margin toward 50/50.
