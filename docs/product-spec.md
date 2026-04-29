# Product Spec — Survivor Season Simulator

## Overview

A browser-based game where the player picks one of 16 fictional contestants and plays through a Survivor-style season. The game simulates camp life, immunity challenges, and tribal councils.

## Platform

Static web app. Runs entirely in the browser. No server or login required.

## Season Setup

- 16 fictional contestants, pre-defined in a data file
- Split into 2 tribes of 8 at the start
- Player selects one contestant before the game begins
- Player cannot change their contestant once chosen

## Contestant Stats

Each contestant has three numeric stats (each 1–10):

| Stat | What It Does |
|---|---|
| **Challenge** | Affects odds of winning immunity challenges |
| **Social** | Affects relationship gains/losses at camp |
| **Strategy** | Affects how well the AI votes and reads alliances |

Stats are fixed — they do not level up in Phase 1.

## Game Screens

### 1. Intro / Contestant Select
- Display all 16 contestants with their stats
- Player clicks one to play as
- Confirm and start the game

### 2. Camp Life
- Displays 2–3 flavor-text events involving the player and tribemates
- Each event slightly increases or decreases a relationship value
- Player reads the events (no choices yet in Phase 1)
- Relationship values are hidden from the player but influence votes

### 3. Challenge
- Simple text/animation describing the challenge
- Winner is determined by a weighted random roll using contestant Challenge stats
- Result: one tribe wins immunity, the other goes to Tribal Council
- Winning tribe sees a "You're safe!" screen; losing tribe proceeds

### 4. Tribal Council
- Losing tribe assembles
- Player selects one contestant to vote for
- AI contestants each cast a vote based on relationships and strategy stats
- Votes are revealed one at a time in random order with a pause between each
- The contestant with the most votes is eliminated
- Tie-breaking rule: a re-vote among tied contestants (simplified in Phase 1)

### 5. Elimination Screen
- Shows who was voted out
- Brief flavor text about their departure
- Transition to next round

## Win/Loss Conditions

- **Player eliminated:** Game over screen, show placement (e.g., "You finished 14th")
- **Player wins:** Not implemented in Phase 1 (game ends at final 3 placeholder)

## Out of Scope (Phase 1)

- Idols, advantages
- Tribe swaps
- Merge
- Final Tribal Council / jury
- Player strategic choices beyond voting
- Saving/loading game
- Multiplayer
- Sound or music
