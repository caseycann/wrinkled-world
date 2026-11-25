// Single source of truth for every game number and pure rules function.
// Do not change a value here unless the user explicitly asks.

export type Tier = 0 | 1 | 2 | 3 | 4

export function tierFromTokens(tokens: number): Tier {
  const t = Math.floor(tokens)
  if (t <= 0) return 0
  if (t <= 5) return 1
  if (t <= 10) return 2
  if (t <= 15) return 3
  return 4
}

export type Die = 'D4' | 'D6' | 'D8' | 'D12' | 'D20' | 'none'

export const TIER_DICE: Record<Tier, { military: Die; health: Die; education: Die }> = {
  0: { military: 'none', health: 'none', education: 'none' },
  1: { military: 'D4',  health: 'D20', education: 'D4'  },
  2: { military: 'D6',  health: 'D12', education: 'D6'  },
  3: { military: 'D12', health: 'D8',  education: 'D12' },
  4: { military: 'D20', health: 'D4',  education: 'D20' },
}

export type StageName =
  | 'Session 0'
  | 'Stage Setting'
  | 'Plan'
  | 'Act/Negotiate'
  | 'Report'
  | 'Reaction'
  | 'Consequences'

export interface StageDefinition {
  name: StageName
  minutes: number
  room: string
}

// Round 0 has a single stage with no countdown.
export const SESSION_ZERO: StageDefinition = {
  name: 'Session 0',
  minutes: 0,
  room: 'Media Lab',
}

// Rounds 1–9 cycle through these six stages in order.
export const ROUND_STAGES: readonly StageDefinition[] = [
  { name: 'Stage Setting', minutes: 5,  room: 'Media Lab' },
  { name: 'Plan',          minutes: 5,  room: 'Media Lab' },
  { name: 'Act/Negotiate', minutes: 10, room: 'CDL'       },
  { name: 'Report',        minutes: 10, room: 'Media Lab' },
  { name: 'Reaction',      minutes: 5,  room: 'CDL'       },
  { name: 'Consequences',  minutes: 10, room: 'Media Lab' },
]

export const MAX_ROUND = 9

// ── Stage navigation ──────────────────────────────────────────────────────────

export interface StageLocation {
  round: number
  stage: StageName
}

// Returns the stage log entry that an Advance action should write, or null if
// advancing from Round 9 Consequences ends the game (no new log row is written).
export function nextStageLocation(current: StageLocation): StageLocation | null {
  const { round, stage } = current
  if (stage === 'Session 0') {
    return { round: 1, stage: 'Stage Setting' }
  }
  const idx = ROUND_STAGES.findIndex(s => s.name === stage)
  if (idx < ROUND_STAGES.length - 1) {
    return { round, stage: ROUND_STAGES[idx + 1].name }
  }
  // Consequences → next round, or game over at Round 9
  if (round >= MAX_ROUND) return null
  return { round: round + 1, stage: 'Stage Setting' }
}

// Returns the round whose 8 Round Snapshot rows should be written when
// advancing from `current`, or null if no snapshots are needed.
// Snapshots are always written when leaving Consequences (even on game over).
export function advanceSnapshotRound(current: StageLocation): number | null {
  return current.stage === 'Consequences' ? current.round : null
}

// Returns the round whose 8 Round Snapshot rows should be deleted when
// undoing `entryBeingUndone`, or null if no snapshot deletion is needed.
// Pass gameIsOver=true when no new stage log row was written (game-over advance).
export function undoDeletesSnapshotRound(
  entryBeingUndone: StageLocation,
  gameIsOver: boolean,
): number | null {
  // Game over: the advance that ended the game wrote Round 9 snapshots but no
  // new log row, so we detect it via gameIsOver rather than the entry's stage.
  if (gameIsOver) return MAX_ROUND
  // Normal rollover: Stage Setting at round > 1 was produced by an advance that
  // also wrote snapshots for the previous round.
  if (entryBeingUndone.stage === 'Stage Setting' && entryBeingUndone.round > 1) {
    return entryBeingUndone.round - 1
  }
  return null
}

// ── Crisis countdown ──────────────────────────────────────────────────────────

// Rounds remaining for a Fixed-rounds crisis (may be 0 or negative when over).
export function crisisRoundsLeft(
  totalRounds: number,
  startedRound: number,
  currentRound: number,
): number {
  return totalRounds - (currentRound - startedRound)
}

// How many rounds an Until-solved crisis has been running (inclusive).
export function crisisRunningFor(startedRound: number, currentRound: number): number {
  return currentRound - startedRound + 1
}
