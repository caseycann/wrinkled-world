import { describe, it, expect } from 'vitest'
import { planSave, SaveBodySchema, type SaveRow } from '@/lib/transactions'
import { mockCountries, mockTransactions, mockStageLog, rollUpCountries } from '@/lib/mock'
import type { StageLogRecord } from '@/lib/schema'

const A = mockCountries.find(c => c.fields.Letter === 'A')!   // $25B, Health 3
const C = mockCountries.find(c => c.fields.Letter === 'C')!
const zero = { federalReserve: 0, military: 0, health: 0, education: 0, standardOfLiving: 0 }

function row(countryId: string, changes: Partial<SaveRow['changes']>, extra: Partial<SaveRow> = {}): SaveRow {
  return { countryId, type: 'Income', changes: { ...zero, ...changes }, ...extra }
}

describe('planSave', () => {
  it('writes one row per country with Round and Stage from the current stage', () => {
    const plan = planSave(
      [row(A.id, { federalReserve: 5 }, { note: '  rolled a 5  ' }), row(C.id, { military: -2 }, { type: 'Fine' })],
      mockCountries,
      mockStageLog,
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.records).toHaveLength(2)
    expect(plan.records[0]).toEqual({
      Country: [A.id], Round: 2, Stage: 'Plan', Type: 'Income',
      'Money Change': 5, 'Military Change': 0, 'Health Change': 0, 'Education Change': 0,
      'Standard of Living Change': 0, Note: 'rolled a 5',
    })
    expect(plan.records[1].Type).toBe('Fine')
    expect(plan.records[1]).not.toHaveProperty('Note')
  })

  it('never writes computed or removed fields', () => {
    const plan = planSave([row(A.id, { health: 1 })], mockCountries, mockStageLog)
    if (!plan.ok) throw new Error('expected ok')
    for (const f of ['Label', 'Created', 'Voided', 'Entered By']) {
      expect(plan.records[0]).not.toHaveProperty(f)
    }
  })

  it('allows a token to land exactly on 0 and money to go negative', () => {
    const plan = planSave([row(A.id, { health: -3, federalReserve: -40 })], mockCountries, mockStageLog)
    expect(plan.ok).toBe(true)
  })

  it('refuses the whole save if any token would go below 0', () => {
    const plan = planSave([row(C.id, { federalReserve: 1 }), row(A.id, { health: -4 })], mockCountries, mockStageLog)
    expect(plan).toEqual({ ok: false, errors: [{ countryId: A.id, message: "Health can't go below 0." }] })
  })

  it('refuses a row with no changes', () => {
    const plan = planSave([row(A.id, {})], mockCountries, mockStageLog)
    expect(plan.ok).toBe(false)
  })

  it('refuses unknown and duplicate countries', () => {
    const plan = planSave(
      [row('recNope', { health: 1 }), row(A.id, { health: 1 }), row(A.id, { health: 1 })],
      mockCountries,
      mockStageLog,
    )
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.errors.map(e => e.message)).toEqual(['Unknown country.', 'Country listed twice.'])
  })

  it('refuses to save before the game has started', () => {
    const allUndone: StageLogRecord[] = mockStageLog.map(r => ({ ...r, fields: { ...r.fields, Undone: true } }))
    const plan = planSave([row(A.id, { health: 1 })], mockCountries, allUndone)
    expect(plan).toEqual({ ok: false, errors: [{ countryId: null, message: 'The game has not started yet.' }] })
  })
})

describe('SaveBodySchema', () => {
  const body = (changes: Record<string, unknown>, type = 'Income') => ({
    rows: [{ countryId: A.id, type, changes: { ...zero, ...changes } }],
  })

  it('accepts whole numbers', () => {
    expect(SaveBodySchema.safeParse(body({ federalReserve: -3, health: 2 })).success).toBe(true)
  })

  it.each([[1.5], ['5'], [null], [Number.NaN], [Infinity]])('refuses a change of %j', v => {
    expect(SaveBodySchema.safeParse(body({ health: v })).success).toBe(false)
  })

  it('refuses a missing change field', () => {
    expect(SaveBodySchema.safeParse({ rows: [{ countryId: A.id, type: 'Income', changes: { health: 1 } }] }).success).toBe(false)
  })

  it('refuses types the console does not offer', () => {
    expect(SaveBodySchema.safeParse(body({ health: 1 }, 'Starting roll')).success).toBe(false)
  })

  it('refuses an empty save and more than 8 rows', () => {
    expect(SaveBodySchema.safeParse({ rows: [] }).success).toBe(false)
    const nine = Array.from({ length: 9 }, () => body({ health: 1 }).rows[0])
    expect(SaveBodySchema.safeParse({ rows: nine }).success).toBe(false)
  })
})

describe('mock rollups', () => {
  it('match the mock country totals', () => {
    const rolled = rollUpCountries(mockCountries, mockTransactions)
    for (const c of mockCountries) {
      const r = rolled.find(x => x.id === c.id)!
      expect(r.fields).toEqual(c.fields)
    }
  })

  it('skip voided rows', () => {
    const txns = mockTransactions.map(t => (t.id === 'recTxn009' ? { ...t, fields: { ...t.fields, Voided: true } } : t))
    const a = rollUpCountries(mockCountries, txns).find(x => x.id === A.id)!
    expect(a.fields['Federal Reserve']).toBe(A.fields['Federal Reserve'] - 5)
  })
})
