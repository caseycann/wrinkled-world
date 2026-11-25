import { describe, it, expect } from 'vitest'
import {
  CountryRecordSchema,
  CrisisRecordSchema,
  StageLogRecordSchema,
  isBlankRow,
} from '@/lib/schema'

// Shapes copied from the real Airtable base (Airtable omits empty fields).
const rec = (fields: Record<string, unknown>) => ({ id: 'recX', createdTime: '2026-11-25T17:38:13.000Z', fields })

describe('Airtable record shapes', () => {
  it('reads a Countries row: Island name, text "Number ", no Council yet', () => {
    const r = CountryRecordSchema.parse(rec({
      Letter: 'A', 'Number ': '1', Island: 'Hot to Cold',
      'Federal Reserve': 0, Military: 0, Health: 0, Education: 0, 'Standard of Living': 0,
    }))
    expect(r.fields['Number ']).toBe(1)
    expect(r.fields.Island).toBe('Hot to Cold')
    expect(r.fields.Council).toBeUndefined()
  })

  it('reads a Council of … option', () => {
    const r = CountryRecordSchema.parse(rec({ Letter: 'B', 'Number ': '2', Island: 'X', Council: 'Council of Finance' }))
    expect(r.fields.Council).toBe('Council of Finance')
  })

  it('refuses a country number that is not a whole number', () => {
    expect(CountryRecordSchema.safeParse(rec({ Letter: 'B', 'Number ': 'two', Island: 'X' })).success).toBe(false)
  })

  it('reads a Stage Log row with "Started at" and the Negotiate stage', () => {
    const r = StageLogRecordSchema.parse(rec({ Round: 1, Stage: 'Negotiate', 'Started at': '2026-11-25T18:11:00.000Z' }))
    expect(r.fields.Undone).toBe(false)
  })

  it('reads a crisis card never drawn', () => {
    const r = CrisisRecordSchema.parse(rec({ 'Card Number': 13, Name: 'Airborne Disease' }))
    expect(r.fields.Status).toBeUndefined()
  })
})

describe('isBlankRow', () => {
  it('skips Airtable starter rows that only have formula and created-time fields', () => {
    expect(isBlankRow('Transactions', { Created: '2026-11-25T17:26:06.000Z', Label: 'R ·  · ' })).toBe(true)
    expect(isBlankRow('StageLog', { Created: '2026-11-25T17:38:13.000Z', Label: 'Round  · ' })).toBe(true)
    expect(isBlankRow('RoundSnapshots', { Label: 'R · ' })).toBe(true)
    expect(isBlankRow('Countries', {})).toBe(true)
    expect(isBlankRow('Crises', { Name: '', 'Countries Hit': [] })).toBe(true)
  })

  it('keeps any row with real data, so malformed rows still fail loudly', () => {
    expect(isBlankRow('StageLog', { Round: 0, Stage: 'Session 0' })).toBe(false)
    expect(isBlankRow('Transactions', { Country: ['recA'] })).toBe(false)
    expect(isBlankRow('RoundSnapshots', { Round: 1 })).toBe(false)
    expect(isBlankRow('Countries', { Letter: 'A' })).toBe(false)
  })
})
