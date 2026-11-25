// Pure stage-control planning: given the current Airtable (or mock) records,
// work out exactly which rows an Advance or Undo should create, update or
// delete. No I/O here — /api/stage executes the plan.

import {
  advanceSnapshotRound,
  nextStageLocation,
  undoDeletesSnapshotRound,
  type StageLocation,
} from './rules'
import type { CountryRecord, RoundSnapshotRecord, StageLogRecord } from './schema'

// Non-undone Stage Log rows, oldest first. The last one is the current stage.
export function activeStageLog(stageLog: StageLogRecord[]): StageLogRecord[] {
  return stageLog
    .filter(r => !r.fields.Undone)
    .sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime))
}

export function currentStageRecord(stageLog: StageLogRecord[]): StageLogRecord | null {
  return activeStageLog(stageLog).at(-1) ?? null
}

export function locationOf(record: StageLogRecord): StageLocation {
  return { round: record.fields.Round, stage: record.fields.Stage }
}

// ── Start ─────────────────────────────────────────────────────────────────────

export interface StartPlan {
  to: StageLocation
  startedAt: string
}

// Starts the game with a Session 0 row. Only when the Stage Log has no current
// stage; otherwise returns null (the game is already running).
export function planStart(stageLog: StageLogRecord[], now: string): StartPlan | null {
  if (currentStageRecord(stageLog)) return null
  return { to: { round: 0, stage: 'Session 0' }, startedAt: now }
}

// ── Advance ───────────────────────────────────────────────────────────────────

export interface SnapshotPlan {
  round: number
  countryId: string
  federalReserve: number
  military: number
  health: number
  education: number
  standardOfLiving: number
}

export interface AdvancePlan {
  from: StageLocation
  to: StageLocation
  startedAt: string
  // Rollover only: one row per country with its totals right now.
  createSnapshots: SnapshotPlan[]
  // Rollover only: leftover snapshots for the same round (e.g. from a write
  // that failed halfway). Deleted first so a round never has duplicates.
  deleteSnapshotIds: string[]
}

// True when advancing from the current stage needs Countries and Round
// Snapshots loaded (so the route can skip those reads otherwise).
export function advanceNeedsSnapshots(current: StageLocation): boolean {
  return advanceSnapshotRound(current) !== null
}

export function planAdvance(
  stageLog: StageLogRecord[],
  data: { countries: CountryRecord[]; roundSnapshots: RoundSnapshotRecord[] },
  now: string,
): AdvancePlan | null {
  const current = currentStageRecord(stageLog)
  if (!current) return null

  const from = locationOf(current)
  const to = nextStageLocation(from)
  const snapRound = advanceSnapshotRound(from)

  let createSnapshots: SnapshotPlan[] = []
  let deleteSnapshotIds: string[] = []
  if (snapRound !== null) {
    if (data.countries.length === 0) {
      throw new Error('Round rollover needs country totals, but none were loaded')
    }
    createSnapshots = data.countries.map(c => ({
      round: snapRound,
      countryId: c.id,
      federalReserve: c.fields['Federal Reserve'],
      military: c.fields.Military,
      health: c.fields.Health,
      education: c.fields.Education,
      standardOfLiving: c.fields['Standard of Living'],
    }))
    deleteSnapshotIds = data.roundSnapshots
      .filter(s => s.fields.Round === snapRound)
      .map(s => s.id)
  }

  return { from, to, startedAt: now, createSnapshots, deleteSnapshotIds }
}

// ── Undo ──────────────────────────────────────────────────────────────────────

export interface UndoPlan {
  undoneId: string        // row to mark Undone
  undone: StageLocation
  restoredId: string      // row that becomes current again; its timer restarts
  restored: StageLocation
  startedAt: string
  deleteSnapshotIds: string[]
}

// The round whose snapshots an undo would delete, or null. Lets the route skip
// reading Round Snapshots when nothing needs deleting.
export function undoSnapshotRound(stageLog: StageLogRecord[]): number | null {
  const current = currentStageRecord(stageLog)
  return current ? undoDeletesSnapshotRound(locationOf(current)) : null
}

// Returns null when there is nothing to undo (only Session 0, or an empty log).
export function planUndo(
  stageLog: StageLogRecord[],
  roundSnapshots: RoundSnapshotRecord[],
  now: string,
): UndoPlan | null {
  const active = activeStageLog(stageLog)
  if (active.length < 2) return null

  const undone = active[active.length - 1]
  const restored = active[active.length - 2]
  const deleteRound = undoDeletesSnapshotRound(locationOf(undone))

  return {
    undoneId: undone.id,
    undone: locationOf(undone),
    restoredId: restored.id,
    restored: locationOf(restored),
    startedAt: now,
    deleteSnapshotIds:
      deleteRound === null
        ? []
        : roundSnapshots.filter(s => s.fields.Round === deleteRound).map(s => s.id),
  }
}
