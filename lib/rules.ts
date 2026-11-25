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
  | 'Negotiate'
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

// Every round from 1 on cycles through these six stages in order.
// There is no round limit: the game ends when the win conditions are met,
// which the Game Master decides in the room. The app has no end-game step.
export const ROUND_STAGES: readonly StageDefinition[] = [
  { name: 'Stage Setting', minutes: 5,  room: 'Media Lab' },
  { name: 'Plan',          minutes: 5,  room: 'Media Lab' },
  { name: 'Negotiate', minutes: 10, room: 'CDL'       },
  { name: 'Report',        minutes: 10, room: 'Media Lab' },
  { name: 'Reaction',      minutes: 5,  room: 'CDL'       },
  { name: 'Consequences',  minutes: 10, room: 'Media Lab' },
]

export function stageDefinition(stage: StageName): StageDefinition {
  if (stage === 'Session 0') return SESSION_ZERO
  const def = ROUND_STAGES.find(s => s.name === stage)
  if (!def) throw new Error(`Unknown stage: ${stage}`)
  return def
}

// ── Stage navigation ──────────────────────────────────────────────────────────

export interface StageLocation {
  round: number
  stage: StageName
}

// Position of a stage in the whole game: Session 0 is 0, then every round's
// stages count up in order. Rows that are not undone always move forward, so
// this orders the Stage Log reliably even when Airtable gives two rows the same
// created time (it only keeps whole seconds).
export function stageOrder(loc: StageLocation): number {
  if (loc.stage === 'Session 0') return 0
  const idx = ROUND_STAGES.findIndex(s => s.name === loc.stage)
  return loc.round * ROUND_STAGES.length + idx + 1
}

// Returns the stage log entry that an Advance action should write.
export function nextStageLocation(current: StageLocation): StageLocation {
  const { round, stage } = current
  if (stage === 'Session 0') {
    return { round: 1, stage: 'Stage Setting' }
  }
  const idx = ROUND_STAGES.findIndex(s => s.name === stage)
  if (idx < ROUND_STAGES.length - 1) {
    return { round, stage: ROUND_STAGES[idx + 1].name }
  }
  // Consequences → next round's Stage Setting (no round limit)
  return { round: round + 1, stage: 'Stage Setting' }
}

// True when advancing from `current` starts a new round (Session 0 → Round 1,
// or Consequences → next round). The UI asks "Start Round N?" only then.
export function advanceStartsNewRound(current: StageLocation): boolean {
  return nextStageLocation(current).round !== current.round
}

// Returns the round whose 8 Round Snapshot rows should be written when
// advancing from `current`, or null if no snapshots are needed.
export function advanceSnapshotRound(current: StageLocation): number | null {
  return current.stage === 'Consequences' ? current.round : null
}

// Returns the round whose 8 Round Snapshot rows should be deleted when
// undoing `entryBeingUndone`, or null if no snapshot deletion is needed.
// A Stage Setting at round > 1 was produced by a rollover that also wrote
// snapshots for the previous round. Round 1 Stage Setting came from Session 0,
// which writes none.
export function undoDeletesSnapshotRound(entryBeingUndone: StageLocation): number | null {
  if (entryBeingUndone.stage === 'Stage Setting' && entryBeingUndone.round > 1) {
    return entryBeingUndone.round - 1
  }
  return null
}

// ── Stage countdown ───────────────────────────────────────────────────────────

// Whole seconds left in a stage, never below 0. Rounded up so the display
// reads 0:00 only once time is truly up. The app never auto-advances at 0.
export function stageSecondsLeft(startedAtMs: number, minutes: number, nowMs: number): number {
  const endMs = startedAtMs + minutes * 60_000
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000))
}

// "M:SS" for a countdown value in seconds.
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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

// ── Teacher console changes ───────────────────────────────────────────────────
// Students do the math; the teacher types whole-number changes. These helpers
// only check the input and preview the new totals. They never compute income,
// damage, prices or any other game amount.

export const TOKEN_KEYS = ['military', 'health', 'education', 'standardOfLiving'] as const
export type TokenKey = (typeof TOKEN_KEYS)[number]
export const CHANGE_KEYS = ['federalReserve', ...TOKEN_KEYS] as const
export type ChangeKey = (typeof CHANGE_KEYS)[number]

// A country's money (whole billions) and token totals, or a change to them.
export type Totals = Record<ChangeKey, number>

export type ParsedChange = { ok: true; value: number } | { ok: false; reason: string }

// Reads one change field. Blank means 0. Accepts an optional + or - sign and
// digits only: no decimals, no commas, no exponents.
export function parseWholeChange(text: string): ParsedChange {
  const s = text.trim()
  if (s === '') return { ok: true, value: 0 }
  if (!/^[+-]?\d+$/.test(s)) return { ok: false, reason: 'Whole numbers only' }
  const value = Number(s)
  if (!Number.isSafeInteger(value)) return { ok: false, reason: 'Number too big' }
  return { ok: true, value: value === 0 ? 0 : value } // turns -0 into 0
}

export function applyChanges(totals: Totals, changes: Totals): Totals {
  return {
    federalReserve: totals.federalReserve + changes.federalReserve,
    military: totals.military + changes.military,
    health: totals.health + changes.health,
    education: totals.education + changes.education,
    standardOfLiving: totals.standardOfLiving + changes.standardOfLiving,
  }
}

// Token counts never go below 0. Money may (that country has a loan).
export function tokensBelowZero(totals: Totals): TokenKey[] {
  return TOKEN_KEYS.filter(k => totals[k] < 0)
}

export function hasAnyChange(changes: Totals): boolean {
  return CHANGE_KEYS.some(k => changes[k] !== 0)
}
