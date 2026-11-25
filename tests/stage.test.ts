// @vitest-environment node
import { createHash } from 'crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/stage/route'
import { getMockDb, mockCountries, mockRoundSnapshots, mockStageLog, resetMockDb } from '@/lib/mock'
import { buildGameState } from '@/lib/state'
import { bustCache } from '@/lib/cache'
import type { StageLogRecord } from '@/lib/schema'
import type { StageName } from '@/lib/rules'
import { currentStageRecord, planAdvance, planUndo } from '@/lib/stage'

const NOW = '2026-11-25T10:00:00.000Z'

function log(rows: [round: number, stage: StageName, undone?: boolean][]): StageLogRecord[] {
  return rows.map(([round, stage, undone], i) => ({
    id: `recS${i}`,
    createdTime: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString(),
    fields: { Round: round, Stage: stage, 'Started At': '2026-11-01T09:00:00.000Z', Undone: undone ?? false },
  }))
}

const noData = { countries: [], roundSnapshots: [] }

// ── planAdvance ───────────────────────────────────────────────────────────────

describe('planAdvance', () => {
  it('normal step: Plan → Act/Negotiate, no snapshots', () => {
    const plan = planAdvance(log([[0, 'Session 0'], [1, 'Stage Setting'], [1, 'Plan']]), noData, NOW)
    expect(plan).toEqual({
      from: { round: 1, stage: 'Plan' },
      to: { round: 1, stage: 'Act/Negotiate' },
      startedAt: NOW,
      createSnapshots: [],
      deleteSnapshotIds: [],
    })
  })

  it('Session 0 → Round 1 Stage Setting writes no snapshots', () => {
    const plan = planAdvance(log([[0, 'Session 0']]), noData, NOW)
    expect(plan?.to).toEqual({ round: 1, stage: 'Stage Setting' })
    expect(plan?.createSnapshots).toEqual([])
  })

  it('ignores undone rows when finding the current stage', () => {
    const plan = planAdvance(
      log([[0, 'Session 0'], [1, 'Stage Setting'], [1, 'Plan', true]]),
      noData,
      NOW,
    )
    expect(plan?.from).toEqual({ round: 1, stage: 'Stage Setting' })
    expect(plan?.to).toEqual({ round: 1, stage: 'Plan' })
  })

  it('round rollover writes 8 snapshots with current totals', () => {
    const plan = planAdvance(
      log([[2, 'Reaction'], [2, 'Consequences']]),
      { countries: mockCountries, roundSnapshots: mockRoundSnapshots },
      NOW,
    )!
    expect(plan.to).toEqual({ round: 3, stage: 'Stage Setting' })
    expect(plan.createSnapshots).toHaveLength(8)
    expect(plan.createSnapshots.every(s => s.round === 2)).toBe(true)
    const a = plan.createSnapshots.find(s => s.countryId === mockCountries[0].id)
    expect(a).toEqual({
      round: 2, countryId: mockCountries[0].id,
      federalReserve: 25, military: 8, health: 3, education: 8, standardOfLiving: 8,
    })
    // No leftover Round 2 snapshots in mock data
    expect(plan.deleteSnapshotIds).toEqual([])
  })

  it('rollover replaces leftover snapshots for the same round', () => {
    const plan = planAdvance(
      log([[1, 'Consequences']]),
      { countries: mockCountries, roundSnapshots: mockRoundSnapshots },
      NOW,
    )!
    expect(plan.deleteSnapshotIds).toHaveLength(8)
  })

  it('Round 9 Consequences → Round 10 (no game over)', () => {
    const plan = planAdvance(
      log([[9, 'Consequences']]),
      { countries: mockCountries, roundSnapshots: [] },
      NOW,
    )!
    expect(plan.to).toEqual({ round: 10, stage: 'Stage Setting' })
    expect(plan.createSnapshots).toHaveLength(8)
  })

  it('rollover without countries loaded throws', () => {
    expect(() => planAdvance(log([[3, 'Consequences']]), noData, NOW)).toThrow()
  })

  it('empty log → null', () => {
    expect(planAdvance([], noData, NOW)).toBeNull()
  })
})

// ── planUndo ──────────────────────────────────────────────────────────────────

describe('planUndo', () => {
  it('undo a normal step restores the previous stage with a fresh start time', () => {
    const plan = planUndo(log([[0, 'Session 0'], [1, 'Stage Setting'], [1, 'Plan']]), [], NOW)
    expect(plan).toEqual({
      undoneId: 'recS2',
      undone: { round: 1, stage: 'Plan' },
      restoredId: 'recS1',
      restored: { round: 1, stage: 'Stage Setting' },
      startedAt: NOW,
      deleteSnapshotIds: [],
    })
  })

  it('undo a rollover deletes the previous round’s 8 snapshots', () => {
    const plan = planUndo(mockStageLog.slice(0, 8), mockRoundSnapshots, NOW)!
    expect(plan.undone).toEqual({ round: 2, stage: 'Stage Setting' })
    expect(plan.restored).toEqual({ round: 1, stage: 'Consequences' })
    expect(plan.deleteSnapshotIds.sort()).toEqual(mockRoundSnapshots.map(s => s.id).sort())
  })

  it('undo Round 1 Stage Setting (from Session 0) deletes no snapshots', () => {
    const plan = planUndo(log([[0, 'Session 0'], [1, 'Stage Setting']]), mockRoundSnapshots, NOW)!
    expect(plan.restored).toEqual({ round: 0, stage: 'Session 0' })
    expect(plan.deleteSnapshotIds).toEqual([])
  })

  it('skips already-undone rows', () => {
    const plan = planUndo(
      log([[0, 'Session 0'], [1, 'Stage Setting'], [1, 'Plan', true], [1, 'Plan']]),
      [],
      NOW,
    )!
    expect(plan.undoneId).toBe('recS3')
    expect(plan.restoredId).toBe('recS1')
  })

  it('nothing to undo at Session 0', () => {
    expect(planUndo(log([[0, 'Session 0']]), [], NOW)).toBeNull()
    expect(planUndo([], [], NOW)).toBeNull()
  })
})

// ── POST /api/stage (mock mode, end to end) ──────────────────────────────────

describe('POST /api/stage (mock mode)', () => {
  const PIN = '4321'
  const cookie = `teacher_session=${createHash('sha256').update(`wrinkled-world:${PIN}`).digest('hex')}`
  const originalPin = process.env.TEACHER_PIN
  const originalMode = process.env.AIRTABLE_MODE

  beforeEach(() => {
    process.env.TEACHER_PIN = PIN
    delete process.env.AIRTABLE_MODE
    resetMockDb()
    bustCache()
  })

  afterEach(() => {
    if (originalPin === undefined) delete process.env.TEACHER_PIN
    else process.env.TEACHER_PIN = originalPin
    if (originalMode === undefined) delete process.env.AIRTABLE_MODE
    else process.env.AIRTABLE_MODE = originalMode
  })

  function req(body: unknown, withCookie = true) {
    return new NextRequest('http://localhost/api/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })
  }

  const currentId = () => currentStageRecord(getMockDb().stageLog)!.id
  async function step(action: 'advance' | 'undo') {
    const res = await POST(req({ action, expect: currentId() }))
    return { status: res.status, body: await res.json() }
  }

  it('rejects requests without the teacher session (401)', async () => {
    const res = await POST(req({ action: 'advance', expect: currentId() }, false))
    expect(res.status).toBe(401)
    expect(getMockDb().stageLog).toHaveLength(mockStageLog.length)
  })

  it('rejects a bad action (400)', async () => {
    const res = await POST(req({ action: 'skip', expect: currentId() }))
    expect(res.status).toBe(400)
  })

  it('stale expect → 409 and nothing written (double tap protection)', async () => {
    const before = currentId()
    expect((await step('advance')).status).toBe(200)
    const res = await POST(req({ action: 'advance', expect: before }))
    expect(res.status).toBe(409)
    const state = await buildGameState()
    expect(state.currentStage?.stage).toBe('Act/Negotiate')
  })

  it('advance through a rollover and undo it, then undo repeatedly to Session 0', async () => {
    // Mock starts at Round 2 Plan
    for (const expected of ['Act/Negotiate', 'Report', 'Reaction', 'Consequences']) {
      const r = await step('advance')
      expect(r.body).toMatchObject({ ok: true, round: 2, stage: expected })
    }
    const rollover = await step('advance')
    expect(rollover.body).toMatchObject({ round: 3, stage: 'Stage Setting' })
    const r2 = getMockDb().roundSnapshots.filter(s => s.fields.Round === 2)
    expect(r2).toHaveLength(8)

    let state = await buildGameState()
    expect(state.currentStage).toMatchObject({ round: 3, stage: 'Stage Setting', minutes: 5, room: 'Media Lab' })
    // Change-since-last-round now compares against the Round 2 snapshots
    expect(state.countries[0].prevSnapshot?.federalReserve).toBe(25)

    // Undo the rollover: Round 2 snapshots are deleted, Consequences timer restarts
    const before = Date.now()
    const undo = await step('undo')
    expect(undo.body).toMatchObject({ ok: true, round: 2, stage: 'Consequences' })
    expect(getMockDb().roundSnapshots.filter(s => s.fields.Round === 2)).toHaveLength(0)
    expect(getMockDb().roundSnapshots.filter(s => s.fields.Round === 1)).toHaveLength(8)
    state = await buildGameState()
    expect(Date.parse(state.currentStage!.startedAt)).toBeGreaterThanOrEqual(before - 1000)

    // Keep undoing all the way back. 4 more steps in round 2, then 6 rows
    // through round 1 (including the round 1→2 rollover), then Session 0.
    let r = await step('undo')
    while (r.status === 200) r = await step('undo')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('nothing-to-undo')
    state = await buildGameState()
    expect(state.currentStage).toMatchObject({ round: 0, stage: 'Session 0' })
    // Undoing the Round 1 → 2 rollover removed Round 1's snapshots too
    expect(getMockDb().roundSnapshots).toHaveLength(0)
    // Ledger rows are untouched; Stage Log rows are marked, never deleted
    expect(getMockDb().stageLog).toHaveLength(mockStageLog.length + 5)
  })

  it('advance after an undo writes a new row instead of reviving the old one', async () => {
    await step('advance')        // → Act/Negotiate
    await step('undo')           // back to Plan
    const r = await step('advance')
    expect(r.body).toMatchObject({ round: 2, stage: 'Act/Negotiate' })
    const actRows = getMockDb().stageLog.filter(s => s.fields.Stage === 'Act/Negotiate' && s.fields.Round === 2)
    expect(actRows.map(s => s.fields.Undone)).toEqual([true, false])
  })
})
