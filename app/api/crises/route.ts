import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { bustCache } from '@/lib/cache'
import { fetchCountries, fetchCrises, fetchStageLog, patchRecords } from '@/lib/airtable'
import { getMockDb, mockCountriesNow } from '@/lib/mock'
import { TABLES, type CrisisRecord } from '@/lib/schema'
import { CrisisBodySchema, planAddCrisis, planSolveCrisis } from '@/lib/crises'

// POST { action: "add", id, countryIds, note? }
//
// Draws a crisis card: fills in that card's Crises row (Countries Hit, Started
// Round = current round, Status = Active). The Crises table has one row per
// card, so this never creates or deletes a row.
//
// POST { action: "solve", id }
//
// Sets Status = Solved and Solved Round = current round. Works on any active
// crisis. Solving a crisis that is not active changes nothing.
//
// Both read fresh data (never the 2 s cache) and write one PATCH request.
export async function POST(request: NextRequest) {
  const denied = requireAuth(request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CrisisBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Pick a crisis card and at least one country.' },
      { status: 400 },
    )
  }

  const live = process.env.AIRTABLE_MODE === 'live'

  try {
    const req = parsed.data
    let plan
    if (req.action === 'add') {
      const [crises, countries, stageLog] = live
        ? await Promise.all([fetchCrises(), fetchCountries(), fetchStageLog()])
        : [getMockDb().crises, mockCountriesNow(), getMockDb().stageLog]
      plan = planAddCrisis(req, crises, countries, stageLog)
    } else {
      const [crises, stageLog] = live
        ? await Promise.all([fetchCrises(), fetchStageLog()])
        : [getMockDb().crises, getMockDb().stageLog]
      plan = planSolveCrisis(req, crises, stageLog)
    }

    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status })
    if (plan.fields === null) return NextResponse.json({ ok: true, changed: false })

    if (live) {
      await patchRecords(TABLES.Crises, [{ id: plan.id, fields: plan.fields }])
    } else {
      const card = getMockDb().crises.find(c => c.id === plan.id)
      if (card) card.fields = patchMockFields(card.fields, plan.fields)
    }

    bustCache()
    return NextResponse.json({ ok: true, changed: true })
  } catch (err) {
    console.error('POST /api/crises:', err)
    bustCache()
    return NextResponse.json({ error: 'Save failed. Try again.' }, { status: 500 })
  }
}

// Applies a PATCH to a mock row the way Airtable does: null clears a field.
function patchMockFields(
  fields: CrisisRecord['fields'],
  patch: Record<string, unknown>,
): CrisisRecord['fields'] {
  const next: Record<string, unknown> = { ...fields }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else next[k] = v
  }
  return next as CrisisRecord['fields']
}
