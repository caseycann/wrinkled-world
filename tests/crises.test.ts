import { describe, it, expect } from 'vitest'
import {
  AddCrisisBodySchema,
  CrisisBodySchema,
  cardLength,
  crisisOnBoard,
  fixedRounds,
  planAddCrisis,
  planSolveCrisis,
  type AddCrisisBody,
} from '@/lib/crises'
import { mockCountries, mockCrises, mockStageLog } from '@/lib/mock'
import type { CrisisFields, CrisisRecord, StageLogRecord } from '@/lib/schema'

// Mock game is in Round 2.
const A = mockCountries.find(c => c.fields.Letter === 'A')!
const B = mockCountries.find(c => c.fields.Letter === 'B')!
const card = (n: number) => mockCrises.find(c => c.fields['Card Number'] === n)!
const PANDEMIC = card(2)          // until solved, on the board since Round 1
const AUTOMATION = card(12)       // 2 rounds, on the board since Round 2
const MELTDOWN = card(1)          // never drawn

function fields(f: Partial<CrisisFields>): CrisisFields {
  return { Name: 'Test', 'Countries Hit': [], ...f }
}

function withFields(rec: CrisisRecord, f: Partial<CrisisFields>): CrisisRecord {
  return { ...rec, fields: { ...rec.fields, ...f } }
}

function stageLogAtRound(round: number): StageLogRecord[] {
  return [{
    id: 'recStageX', createdTime: '2026-11-25T10:00:00.000Z',
    fields: { Round: round, Stage: 'Plan', 'Started At': '2026-11-25T10:00:00.000Z', Undone: false },
  }]
}

function add(extra: Partial<AddCrisisBody> = {}): AddCrisisBody {
  return { action: 'add', id: MELTDOWN.id, countryIds: [A.id, B.id], ...extra }
}

// ── Length ────────────────────────────────────────────────────────────────────

describe('cardLength / fixedRounds', () => {
  it('blank Rounds → Until solved', () => {
    expect(cardLength(fields({}))).toBe('Until solved')
    expect(fixedRounds(fields({}))).toBeNull()
  })

  it('a number in Rounds → Fixed rounds', () => {
    expect(cardLength(fields({ Rounds: 3 }))).toBe('Fixed rounds')
    expect(fixedRounds(fields({ Rounds: 1 }))).toBe(1)
  })

  it('Rounds 0 is treated as blank', () => {
    expect(cardLength(fields({ Rounds: 0 }))).toBe('Until solved')
  })
})

// ── On the board ──────────────────────────────────────────────────────────────

describe('crisisOnBoard', () => {
  it('a card never drawn is hidden', () => {
    expect(crisisOnBoard(fields({}), 3)).toBe(false)
  })

  it('a solved crisis is hidden', () => {
    expect(crisisOnBoard(fields({ Status: 'Solved', 'Started Round': 1, 'Solved Round': 2 }), 3)).toBe(false)
  })

  it('an until-solved crisis stays on the board in later rounds', () => {
    expect(crisisOnBoard(fields({ Status: 'Active', 'Started Round': 1 }), 1)).toBe(true)
    expect(crisisOnBoard(fields({ Status: 'Active', 'Started Round': 1 }), 12)).toBe(true)
  })

  it('a fixed crisis shows with 1 round left and is hidden at 0 or below', () => {
    const f = fields({ Status: 'Active', 'Started Round': 4, Rounds: 2 })
    expect(crisisOnBoard(f, 4)).toBe(true)   // 2 left
    expect(crisisOnBoard(f, 5)).toBe(true)   // 1 left
    expect(crisisOnBoard(f, 6)).toBe(false)  // 0 left
    expect(crisisOnBoard(f, 7)).toBe(false)  // -1 left
  })

  it('a crisis started in a later round is hidden (after an Undo), and returns at that round', () => {
    const f = fields({ Status: 'Active', 'Started Round': 5, Rounds: 3 })
    expect(crisisOnBoard(f, 4)).toBe(false)
    expect(crisisOnBoard(f, 5)).toBe(true)
  })

  it('works past Round 9', () => {
    expect(crisisOnBoard(fields({ Status: 'Active', 'Started Round': 9, Rounds: 2 }), 10)).toBe(true)
  })
})

// ── Input checks ──────────────────────────────────────────────────────────────

describe('CrisisBodySchema', () => {
  it('accepts add and solve', () => {
    expect(CrisisBodySchema.safeParse(add()).success).toBe(true)
    expect(CrisisBodySchema.safeParse({ action: 'solve', id: PANDEMIC.id }).success).toBe(true)
  })

  it('refuses no countries', () => {
    expect(AddCrisisBodySchema.safeParse(add({ countryIds: [] })).success).toBe(false)
  })

  it('refuses a missing or malformed card id', () => {
    expect(CrisisBodySchema.safeParse({ action: 'add', countryIds: [A.id] }).success).toBe(false)
    expect(CrisisBodySchema.safeParse(add({ id: '7' })).success).toBe(false)
  })

  it('refuses an unknown action', () => {
    expect(CrisisBodySchema.safeParse({ action: 'delete', id: PANDEMIC.id }).success).toBe(false)
  })
})

// ── Add ───────────────────────────────────────────────────────────────────────

describe('planAddCrisis', () => {
  it('fills in the card row with Started Round = current round', () => {
    const plan = planAddCrisis(add({ note: '  drawn by C  ' }), mockCrises, mockCountries, mockStageLog)
    expect(plan).toEqual({
      ok: true,
      id: MELTDOWN.id,
      fields: {
        'Countries Hit': [A.id, B.id], 'Started Round': 2, Status: 'Active',
        'Solved Round': null, Note: 'drawn by C',
      },
    })
  })

  it('clears an old note when none is given', () => {
    const plan = planAddCrisis(add(), mockCrises, mockCountries, mockStageLog)
    if (!plan.ok || !plan.fields) throw new Error('expected fields')
    expect(plan.fields.Note).toBeNull()
  })

  it('never writes Name, Card Number or Rounds', () => {
    const plan = planAddCrisis(add(), mockCrises, mockCountries, mockStageLog)
    if (!plan.ok || !plan.fields) throw new Error('expected fields')
    for (const f of ['Name', 'Card Number', 'Rounds', 'Length Type']) {
      expect(plan.fields).not.toHaveProperty(f)
    }
  })

  it('works in Session 0 and past Round 9', () => {
    for (const round of [0, 10]) {
      const plan = planAddCrisis(add(), mockCrises, mockCountries, stageLogAtRound(round))
      if (!plan.ok || !plan.fields) throw new Error('expected fields')
      expect(plan.fields['Started Round']).toBe(round)
    }
  })

  it('refuses a card already on the board', () => {
    const plan = planAddCrisis(add({ id: PANDEMIC.id }), mockCrises, mockCountries, mockStageLog)
    expect(plan).toMatchObject({ ok: false, status: 409 })
  })

  it('re-draws a solved card and clears its Solved Round', () => {
    const crises = mockCrises.map(c => c.id === PANDEMIC.id
      ? withFields(c, { Status: 'Solved', 'Solved Round': 2 }) : c)
    const plan = planAddCrisis(add({ id: PANDEMIC.id }), crises, mockCountries, mockStageLog)
    expect(plan).toMatchObject({ ok: true, fields: { Status: 'Active', 'Solved Round': null } })
  })

  it('re-draws a fixed card whose rounds have run out', () => {
    const plan = planAddCrisis(add({ id: AUTOMATION.id }), mockCrises, mockCountries, stageLogAtRound(4))
    expect(plan.ok).toBe(true)
  })

  it('refuses an unknown card', () => {
    const plan = planAddCrisis(add({ id: 'recNoSuchCard' }), mockCrises, mockCountries, mockStageLog)
    expect(plan).toMatchObject({ ok: false, status: 404 })
  })

  it('refuses a country chosen twice', () => {
    const plan = planAddCrisis(add({ countryIds: [A.id, A.id] }), mockCrises, mockCountries, mockStageLog)
    expect(plan).toMatchObject({ ok: false, status: 422 })
  })

  it('refuses an unknown country', () => {
    const plan = planAddCrisis(add({ countryIds: ['recNoSuchCountry'] }), mockCrises, mockCountries, mockStageLog)
    expect(plan).toMatchObject({ ok: false, status: 422 })
  })

  it('refuses when the game has not started', () => {
    const plan = planAddCrisis(add(), mockCrises, mockCountries, [])
    expect(plan).toMatchObject({ ok: false, status: 409 })
  })
})

// ── Solve ─────────────────────────────────────────────────────────────────────

describe('planSolveCrisis', () => {
  it('solves an until-solved crisis in the current round', () => {
    const plan = planSolveCrisis({ action: 'solve', id: PANDEMIC.id }, mockCrises, mockStageLog)
    expect(plan).toEqual({ ok: true, id: PANDEMIC.id, fields: { Status: 'Solved', 'Solved Round': 2 } })
  })

  it('solves a fixed-length crisis early', () => {
    const plan = planSolveCrisis({ action: 'solve', id: AUTOMATION.id }, mockCrises, mockStageLog)
    expect(plan).toMatchObject({ ok: true, fields: { Status: 'Solved' } })
  })

  it('solving twice changes nothing', () => {
    const crises = mockCrises.map(c => c.id === PANDEMIC.id
      ? withFields(c, { Status: 'Solved', 'Solved Round': 2 }) : c)
    const plan = planSolveCrisis({ action: 'solve', id: PANDEMIC.id }, crises, stageLogAtRound(3))
    expect(plan).toEqual({ ok: true, id: PANDEMIC.id, fields: null })
  })

  it('a card never drawn changes nothing', () => {
    const plan = planSolveCrisis({ action: 'solve', id: MELTDOWN.id }, mockCrises, mockStageLog)
    expect(plan).toMatchObject({ ok: true, fields: null })
  })

  it('refuses an unknown crisis', () => {
    const plan = planSolveCrisis({ action: 'solve', id: 'recNoSuchCard' }, mockCrises, mockStageLog)
    expect(plan).toMatchObject({ ok: false, status: 404 })
  })
})

// ── Mock data matches the Airtable table ──────────────────────────────────────

describe('mock crisis cards', () => {
  it('has 19 cards with unique numbers 1–19', () => {
    const numbers = mockCrises.map(c => c.fields['Card Number']).sort((a, b) => a! - b!)
    expect(numbers).toEqual(Array.from({ length: 19 }, (_, i) => i + 1))
  })
})
