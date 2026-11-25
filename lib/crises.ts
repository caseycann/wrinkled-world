// Crisis cards and the pure planners behind POST /api/crises.
//
// The 19 cards live in the Airtable Crises table, one row per card, so their
// names, numbers and lengths can be changed there. Drawing a card fills in that
// card's row; solving it sets Status = Solved. Nothing counts down in Airtable:
// rounds left is computed from the current round, so Undo needs no crisis changes.
// No I/O here, so it is testable.

import { z } from 'zod'
import { crisisRoundsLeft } from './rules'
import { currentStageRecord } from './stage'
import {
  crisisAddFields,
  crisisSolveFields,
  type CountryRecord,
  type CrisisFields,
  type CrisisRecord,
  type StageLogRecord,
} from './schema'

export type LengthType = 'Until solved' | 'Fixed rounds'

// A card with a number in Rounds lasts that many rounds; a blank Rounds runs
// until a teacher marks it solved.
export function fixedRounds(f: Pick<CrisisFields, 'Rounds'>): number | null {
  return f.Rounds !== undefined && f.Rounds > 0 ? f.Rounds : null
}

export function cardLength(f: Pick<CrisisFields, 'Rounds'>): LengthType {
  return fixedRounds(f) === null ? 'Until solved' : 'Fixed rounds'
}

// True while a crisis should be shown on the board. Hidden when never drawn,
// solved, out of rounds, or started in a round later than the current one
// (after an Undo; it comes back when play reaches that round again).
export function crisisOnBoard(f: CrisisFields, currentRound: number): boolean {
  const started = f['Started Round']
  if (f.Status !== 'Active' || started === undefined) return false
  if (started > currentRound) return false
  const rounds = fixedRounds(f)
  return rounds === null || crisisRoundsLeft(rounds, started, currentRound) > 0
}

// ── Request bodies ────────────────────────────────────────────────────────────

const RecordId = z.string().regex(/^rec[A-Za-z0-9]+$/)

export const AddCrisisBodySchema = z.object({
  action: z.literal('add'),
  id: RecordId,                                        // the card's Crises row
  countryIds: z.array(RecordId).min(1).max(8),
  note: z.string().max(2000).optional(),
})

export const SolveCrisisBodySchema = z.object({
  action: z.literal('solve'),
  id: RecordId,
})

export const CrisisBodySchema = z.discriminatedUnion('action', [
  AddCrisisBodySchema,
  SolveCrisisBodySchema,
])

export type AddCrisisBody = z.infer<typeof AddCrisisBodySchema>
export type SolveCrisisBody = z.infer<typeof SolveCrisisBodySchema>

// ── Planners ──────────────────────────────────────────────────────────────────

export type CrisisPlan<F> =
  | { ok: true; id: string; fields: F | null }       // null fields = nothing to write
  | { ok: false; status: 404 | 409 | 422; error: string }

// Draws a card for the chosen countries. Started Round comes from the current
// Stage Log row, never from the browser. A card already on the board can't be
// drawn again; a solved or finished card can (its row is reused).
export function planAddCrisis(
  body: AddCrisisBody,
  crises: CrisisRecord[],
  countries: CountryRecord[],
  stageLog: StageLogRecord[],
): CrisisPlan<ReturnType<typeof crisisAddFields>> {
  const current = currentStageRecord(stageLog)
  if (!current) return { ok: false, status: 409, error: 'The game has not started yet.' }
  const round = current.fields.Round

  const card = crises.find(c => c.id === body.id)
  if (!card) return { ok: false, status: 404, error: 'That crisis card was not found.' }
  if (crisisOnBoard(card.fields, round)) {
    return { ok: false, status: 409, error: `${card.fields.Name} is already on the board.` }
  }

  if (new Set(body.countryIds).size !== body.countryIds.length) {
    return { ok: false, status: 422, error: 'A country was chosen twice.' }
  }
  const known = new Set(countries.map(c => c.id))
  if (body.countryIds.some(id => !known.has(id))) {
    return { ok: false, status: 422, error: 'Unknown country. Refresh and try again.' }
  }

  return {
    ok: true,
    id: card.id,
    fields: crisisAddFields({
      countryIds: body.countryIds,
      startedRound: round,
      note: body.note?.trim() || undefined,
    }),
  }
}

// Marks a crisis solved in the current round. Works on any active crisis,
// fixed-length or not. Solving one that is not active writes nothing.
export function planSolveCrisis(
  body: SolveCrisisBody,
  crises: CrisisRecord[],
  stageLog: StageLogRecord[],
): CrisisPlan<ReturnType<typeof crisisSolveFields>> {
  const current = currentStageRecord(stageLog)
  if (!current) return { ok: false, status: 409, error: 'The game has not started yet.' }

  const card = crises.find(c => c.id === body.id)
  if (!card) return { ok: false, status: 404, error: 'That crisis was not found.' }
  if (card.fields.Status !== 'Active') return { ok: true, id: card.id, fields: null }

  return { ok: true, id: card.id, fields: crisisSolveFields(current.fields.Round) }
}
