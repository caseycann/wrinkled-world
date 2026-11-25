import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { bustCache } from '@/lib/cache'
import {
  createRecords,
  deleteRecords,
  fetchCountries,
  fetchRoundSnapshots,
  fetchStageLog,
  patchRecords,
} from '@/lib/airtable'
import { getMockDb, mockCountriesNow, newMockId } from '@/lib/mock'
import {
  TABLES,
  roundSnapshotCreateFields,
  stageLogCreateFields,
  stageLogRestartFields,
  stageLogUndoneFields,
} from '@/lib/schema'
import {
  advanceNeedsSnapshots,
  currentStageRecord,
  locationOf,
  planAdvance,
  planStart,
  planUndo,
  undoSnapshotRound,
  type AdvancePlan,
  type UndoPlan,
} from '@/lib/stage'

// POST { action: "advance" | "undo", expect: <current Stage Log record ID> }
//
// `expect` is the stage the button showed when it was tapped. If the stage has
// changed since (double tap, or the other teacher), nothing is written and the
// route answers 409, so one tap can never move the game two steps.
//
// POST { action: "start" }
//
// Only when the Stage Log has no current stage: adds the Session 0 row. If the
// game has already started, writes nothing and answers 409.
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('advance'), expect: z.string().min(1) }),
  z.object({ action: z.literal('undo'), expect: z.string().min(1) }),
])

export async function POST(request: NextRequest) {
  const denied = requireAuth(request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { action } = parsed.data
  const live = process.env.AIRTABLE_MODE === 'live'
  const now = new Date().toISOString()

  try {
    // Always read the Stage Log fresh (never from the 2 s cache) so we act on
    // what is really current. Other tables are read only when needed.
    const stageLog = live ? await fetchStageLog() : getMockDb().stageLog

    if (parsed.data.action === 'start') {
      const plan = planStart(stageLog, now)
      if (!plan) {
        return NextResponse.json(
          { error: 'The game has already started. Showing the latest.', code: 'stale' },
          { status: 409 },
        )
      }
      const fields = stageLogCreateFields({ ...plan.to, startedAt: plan.startedAt })
      if (live) {
        await createRecords(TABLES.StageLog, [fields])
      } else {
        getMockDb().stageLog.push({
          id: newMockId('Stage'), createdTime: plan.startedAt, fields: { ...fields, Undone: false },
        })
      }
      bustCache()
      return NextResponse.json({ ok: true, round: 0, stage: 'Session 0' })
    }

    const current = currentStageRecord(stageLog)
    if (!current || current.id !== parsed.data.expect) {
      return NextResponse.json(
        { error: 'The stage changed. Showing the latest.', code: 'stale' },
        { status: 409 },
      )
    }

    if (action === 'advance') {
      const needsSnapshots = advanceNeedsSnapshots(locationOf(current))
      const [countries, roundSnapshots] = !needsSnapshots
        ? [[], []]
        : live
          ? await Promise.all([fetchCountries(), fetchRoundSnapshots()])
          : [mockCountriesNow(), getMockDb().roundSnapshots]

      const plan = planAdvance(stageLog, { countries, roundSnapshots }, now)
      if (!plan) {
        return NextResponse.json({ error: 'No current stage' }, { status: 409 })
      }
      await (live ? applyAdvanceLive(plan) : applyAdvanceMock(plan))
      bustCache()
      return NextResponse.json({ ok: true, round: plan.to.round, stage: plan.to.stage })
    }

    // Undo
    const needsSnapshots = undoSnapshotRound(stageLog) !== null
    const roundSnapshots = !needsSnapshots
      ? []
      : live
        ? await fetchRoundSnapshots()
        : getMockDb().roundSnapshots

    const plan = planUndo(stageLog, roundSnapshots, now)
    if (!plan) {
      return NextResponse.json(
        { error: 'Nothing to undo.', code: 'nothing-to-undo' },
        { status: 409 },
      )
    }
    await (live ? applyUndoLive(plan) : applyUndoMock(plan))
    bustCache()
    return NextResponse.json({ ok: true, round: plan.restored.round, stage: plan.restored.stage })
  } catch (err) {
    console.error(`POST /api/stage (${action}):`, err)
    bustCache()
    return NextResponse.json({ error: 'Stage change failed' }, { status: 500 })
  }
}

// ── Live (Airtable) ───────────────────────────────────────────────────────────
// Order matters on a rollover: snapshots are written before the new Stage Log
// row, so a failure partway leaves the stage unchanged and a retry is safe
// (planAdvance deletes any leftover snapshots for that round first).

async function applyAdvanceLive(plan: AdvancePlan): Promise<void> {
  if (plan.deleteSnapshotIds.length > 0) {
    await deleteRecords(TABLES.RoundSnapshots, plan.deleteSnapshotIds)
  }
  if (plan.createSnapshots.length > 0) {
    await createRecords(TABLES.RoundSnapshots, plan.createSnapshots.map(roundSnapshotCreateFields))
  }
  await createRecords(TABLES.StageLog, [
    stageLogCreateFields({ ...plan.to, startedAt: plan.startedAt }),
  ])
}

// Undo marks the stage undone first, so a failure partway never leaves the
// round's snapshots missing while the rollover still shows as current.
async function applyUndoLive(plan: UndoPlan): Promise<void> {
  await patchRecords(TABLES.StageLog, [
    { id: plan.undoneId, fields: stageLogUndoneFields() },
    { id: plan.restoredId, fields: stageLogRestartFields(plan.startedAt) },
  ])
  if (plan.deleteSnapshotIds.length > 0) {
    await deleteRecords(TABLES.RoundSnapshots, plan.deleteSnapshotIds)
  }
}

// ── Mock (in-memory) ──────────────────────────────────────────────────────────

async function applyAdvanceMock(plan: AdvancePlan): Promise<void> {
  const db = getMockDb()
  const drop = new Set(plan.deleteSnapshotIds)
  db.roundSnapshots = db.roundSnapshots.filter(s => !drop.has(s.id))
  for (const snap of plan.createSnapshots) {
    db.roundSnapshots.push({
      id: newMockId('Snap'),
      createdTime: plan.startedAt,
      fields: roundSnapshotCreateFields(snap),
    })
  }
  db.stageLog.push({
    id: newMockId('Stage'),
    createdTime: plan.startedAt,
    fields: { ...stageLogCreateFields({ ...plan.to, startedAt: plan.startedAt }), Undone: false },
  })
}

async function applyUndoMock(plan: UndoPlan): Promise<void> {
  const db = getMockDb()
  db.stageLog = db.stageLog.map(r => {
    if (r.id === plan.undoneId) return { ...r, fields: { ...r.fields, ...stageLogUndoneFields() } }
    if (r.id === plan.restoredId) {
      return { ...r, fields: { ...r.fields, ...stageLogRestartFields(plan.startedAt) } }
    }
    return r
  })
  const drop = new Set(plan.deleteSnapshotIds)
  db.roundSnapshots = db.roundSnapshots.filter(s => !drop.has(s.id))
}
