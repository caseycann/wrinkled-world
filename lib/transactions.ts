// Pure planner for the teacher console's Save. The route reads fresh data,
// calls planSave, and writes what it returns. No I/O here, so it is testable.

import { z } from 'zod'
import { applyChanges, hasAnyChange, tokensBelowZero, type Totals } from './rules'
import { currentStageRecord } from './stage'
import {
  CONSOLE_TX_TYPES,
  transactionCreateFields,
  type CountryRecord,
  type StageLogRecord,
} from './schema'

const WholeNumber = z.number().int().safe()

export const SaveRowSchema = z.object({
  countryId: z.string().min(1),
  type: z.enum(CONSOLE_TX_TYPES),
  note: z.string().max(2000).optional(),
  changes: z.object({
    federalReserve: WholeNumber,
    military: WholeNumber,
    health: WholeNumber,
    education: WholeNumber,
    standardOfLiving: WholeNumber,
  }),
})

export const SaveBodySchema = z.object({
  rows: z.array(SaveRowSchema).min(1).max(8),
})

export type SaveRow = z.infer<typeof SaveRowSchema>

export interface SaveError {
  countryId: string | null   // null for a problem with the whole save
  message: string
}

export type SavePlan =
  | { ok: true; records: ReturnType<typeof transactionCreateFields>[] }
  | { ok: false; errors: SaveError[] }

const TOKEN_LABELS: Record<string, string> = {
  military: 'Military',
  health: 'Health',
  education: 'Education',
  standardOfLiving: 'Standard of Living',
}

export function totalsOf(c: CountryRecord): Totals {
  return {
    federalReserve: c.fields['Federal Reserve'],
    military: c.fields.Military,
    health: c.fields.Health,
    education: c.fields.Education,
    standardOfLiving: c.fields['Standard of Living'],
  }
}

// Checks every row against the latest totals. Writes all rows or none.
// Round and Stage come from the current Stage Log row, not from the browser.
export function planSave(
  rows: SaveRow[],
  countries: CountryRecord[],
  stageLog: StageLogRecord[],
): SavePlan {
  const errors: SaveError[] = []

  const current = currentStageRecord(stageLog)
  if (!current) {
    return { ok: false, errors: [{ countryId: null, message: 'The game has not started yet.' }] }
  }

  const byId = new Map(countries.map(c => [c.id, c]))
  const seen = new Set<string>()

  for (const row of rows) {
    const country = byId.get(row.countryId)
    if (!country) {
      errors.push({ countryId: row.countryId, message: 'Unknown country.' })
      continue
    }
    if (seen.has(row.countryId)) {
      errors.push({ countryId: row.countryId, message: 'Country listed twice.' })
      continue
    }
    seen.add(row.countryId)

    if (!hasAnyChange(row.changes)) {
      errors.push({ countryId: row.countryId, message: 'No changes to save.' })
      continue
    }
    const below = tokensBelowZero(applyChanges(totalsOf(country), row.changes))
    if (below.length > 0) {
      const names = below.map(k => TOKEN_LABELS[k]).join(', ')
      errors.push({ countryId: row.countryId, message: `${names} can't go below 0.` })
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    records: rows.map(row =>
      transactionCreateFields({
        countryId: row.countryId,
        round: current.fields.Round,
        stage: current.fields.Stage,
        type: row.type,
        changes: row.changes,
        note: row.note?.trim() || undefined,
      }),
    ),
  }
}
