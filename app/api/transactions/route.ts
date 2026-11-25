import { type NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { bustCache } from '@/lib/cache'
import { createRecords, fetchCountries, fetchStageLog, patchRecords } from '@/lib/airtable'
import { getMockDb, mockCountriesNow, newMockId } from '@/lib/mock'
import { TABLES, transactionVoidFields } from '@/lib/schema'
import { planSave, SaveBodySchema, VoidBodySchema } from '@/lib/transactions'

// POST { rows: [{ countryId, type, note?, changes: { federalReserve, military,
//   health, education, standardOfLiving } }] }
//
// Appends one Transactions row per country. Totals are re-checked against a
// fresh read (never the 2 s cache), so no token count can go below 0 even if
// the console's preview was a few seconds old. All rows are written or none.
//
// POST { action: "void", id }
//
// Ticks Voided on one Transactions row. The row stays in the ledger; the
// country rollups drop it. Voiding an already-voided row changes nothing.
export async function POST(request: NextRequest) {
  const denied = requireAuth(request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const voidReq = VoidBodySchema.safeParse(body)
  if (voidReq.success) return voidTransaction(voidReq.data.id)

  const parsed = SaveBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Only whole numbers can be saved. Check the fields and try again.' },
      { status: 400 },
    )
  }

  const live = process.env.AIRTABLE_MODE === 'live'

  try {
    const [countries, stageLog] = live
      ? await Promise.all([fetchCountries(), fetchStageLog()])
      : [mockCountriesNow(), getMockDb().stageLog]

    const plan = planSave(parsed.data.rows, countries, stageLog)
    if (!plan.ok) {
      return NextResponse.json(
        { error: 'Nothing was saved. Fix the rows marked below.', errors: plan.errors },
        { status: 422 },
      )
    }

    if (live) {
      // Up to 8 rows, so this is a single Airtable request (10 per batch).
      await createRecords(TABLES.Transactions, plan.records)
    } else {
      const db = getMockDb()
      const now = new Date().toISOString()
      for (const fields of plan.records) {
        db.transactions.push({ id: newMockId('Txn'), createdTime: now, fields: { ...fields, Voided: false } })
      }
    }

    bustCache()
    return NextResponse.json({ ok: true, saved: plan.records.length })
  } catch (err) {
    console.error('POST /api/transactions:', err)
    bustCache()
    return NextResponse.json({ error: 'Save failed. Try again.' }, { status: 500 })
  }
}

async function voidTransaction(id: string) {
  try {
    if (process.env.AIRTABLE_MODE === 'live') {
      // One PATCH request. Never touches any other field.
      await patchRecords(TABLES.Transactions, [{ id, fields: transactionVoidFields() }])
    } else {
      const txn = getMockDb().transactions.find(t => t.id === id)
      if (!txn) return NextResponse.json({ error: 'That row was not found.' }, { status: 404 })
      txn.fields = { ...txn.fields, ...transactionVoidFields() }
    }
    bustCache()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/transactions (void):', err)
    bustCache()
    return NextResponse.json({ error: 'Void failed. Try again.' }, { status: 500 })
  }
}
