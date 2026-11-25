import { z } from 'zod'

// ── Table name constants ──────────────────────────────────────────────────────

export const TABLES = {
  Countries: 'Countries',
  Transactions: 'Transactions',
  StageLog: 'Stage Log',
  RoundSnapshots: 'Round Snapshots',
  Crises: 'Crises',
} as const

// ── Single-select option sets ─────────────────────────────────────────────────

export const COUNCIL_OPTIONS = ['Ratification', 'Finance', 'Justice', 'Defense'] as const
export const STAGE_OPTIONS = [
  'Session 0', 'Stage Setting', 'Plan', 'Act/Negotiate',
  'Report', 'Reaction', 'Consequences',
] as const
export const TX_TYPE_OPTIONS = [
  'Starting roll', 'Income', 'Purchase', 'Auction', 'Fine',
  'Crisis damage', 'Gift', 'Loan', 'Repayment', 'Correction', 'Global Boom',
] as const
// The Type choices the teacher console offers.
export const CONSOLE_TX_TYPES = [
  'Income', 'Purchase', 'Auction', 'Fine', 'Crisis damage', 'Gift', 'Loan', 'Correction',
] as const satisfies readonly (typeof TX_TYPE_OPTIONS)[number][]
export const LENGTH_TYPE_OPTIONS = ['Until solved', 'Fixed rounds'] as const
export const CRISIS_STATUS_OPTIONS = ['Active', 'Solved'] as const

// ── Field schemas ─────────────────────────────────────────────────────────────
// These reflect what the Airtable API returns in record.fields.
// Formula, rollup, created-time, and inverse link fields are read-only;
// they are included here for parsing but never sent in writes.

export const CountryFieldsSchema = z.object({
  Letter: z.string(),
  Number: z.number().int(),
  Name: z.string(),
  Council: z.enum(COUNCIL_OPTIONS),
  // Rollups computed by Airtable from non-voided Transactions
  'Federal Reserve': z.number().default(0),
  Military: z.number().int().default(0),
  Health: z.number().int().default(0),
  Education: z.number().int().default(0),
  'Standard of Living': z.number().int().default(0),
})

export const TransactionFieldsSchema = z.object({
  Country: z.array(z.string()).default([]),      // link to Countries (single record)
  Round: z.number().int(),
  Stage: z.enum(STAGE_OPTIONS),
  Type: z.enum(TX_TYPE_OPTIONS),
  // Airtable omits number fields when value is 0; treat undefined as 0 at read time
  'Money Change': z.number().optional(),
  'Military Change': z.number().int().optional(),
  'Health Change': z.number().int().optional(),
  'Education Change': z.number().int().optional(),
  'Standard of Living Change': z.number().int().optional(),
  Note: z.string().optional(),
  Voided: z.boolean().default(false),
})

export const StageLogFieldsSchema = z.object({
  Round: z.number().int(),
  Stage: z.enum(STAGE_OPTIONS),
  'Started At': z.string(),                      // ISO datetime
  Undone: z.boolean().default(false),
})

export const RoundSnapshotFieldsSchema = z.object({
  Round: z.number().int(),
  Country: z.array(z.string()).default([]),      // link to Countries (single record)
  'Federal Reserve': z.number().default(0),
  Military: z.number().int().default(0),
  Health: z.number().int().default(0),
  Education: z.number().int().default(0),
  'Standard of Living': z.number().int().default(0),
})

export const CrisisFieldsSchema = z.object({
  Name: z.string(),
  'Card Number': z.number().int(),
  'Countries Hit': z.array(z.string()).default([]),  // link to Countries (multiple)
  'Started Round': z.number().int(),
  'Length Type': z.enum(LENGTH_TYPE_OPTIONS),
  Rounds: z.number().int().optional(),              // only for Fixed rounds crises
  Status: z.enum(CRISIS_STATUS_OPTIONS),
  'Solved Round': z.number().int().optional(),
  Note: z.string().optional(),
})

// ── Airtable record wrappers ──────────────────────────────────────────────────

function airtableRecord<F extends z.ZodTypeAny>(fields: F) {
  return z.object({ id: z.string(), createdTime: z.string(), fields })
}

export const CountryRecordSchema = airtableRecord(CountryFieldsSchema)
export const TransactionRecordSchema = airtableRecord(TransactionFieldsSchema)
export const StageLogRecordSchema = airtableRecord(StageLogFieldsSchema)
export const RoundSnapshotRecordSchema = airtableRecord(RoundSnapshotFieldsSchema)
export const CrisisRecordSchema = airtableRecord(CrisisFieldsSchema)

// ── Write-field builders ──────────────────────────────────────────────────────
// Route handlers build Airtable `fields` objects only through these, so field
// names stay in this file. Never include formula/rollup/created-time fields.

export function stageLogCreateFields(p: {
  round: number
  stage: (typeof STAGE_OPTIONS)[number]
  startedAt: string
}): Pick<StageLogFields, 'Round' | 'Stage' | 'Started At'> {
  return { Round: p.round, Stage: p.stage, 'Started At': p.startedAt }
}

export function transactionCreateFields(p: {
  countryId: string
  round: number
  stage: (typeof STAGE_OPTIONS)[number]
  type: (typeof TX_TYPE_OPTIONS)[number]
  changes: { federalReserve: number; military: number; health: number; education: number; standardOfLiving: number }
  note?: string
}): Omit<TransactionFields, 'Voided'> {
  const f: Omit<TransactionFields, 'Voided'> = {
    Country: [p.countryId],
    Round: p.round,
    Stage: p.stage,
    Type: p.type,
    'Money Change': p.changes.federalReserve,
    'Military Change': p.changes.military,
    'Health Change': p.changes.health,
    'Education Change': p.changes.education,
    'Standard of Living Change': p.changes.standardOfLiving,
  }
  if (p.note) f.Note = p.note
  return f
}

export function stageLogUndoneFields(): Pick<StageLogFields, 'Undone'> {
  return { Undone: true }
}

export function stageLogRestartFields(startedAt: string): Pick<StageLogFields, 'Started At'> {
  return { 'Started At': startedAt }
}

export function roundSnapshotCreateFields(p: {
  round: number
  countryId: string
  federalReserve: number
  military: number
  health: number
  education: number
  standardOfLiving: number
}): RoundSnapshotFields {
  return {
    Round: p.round,
    Country: [p.countryId],
    'Federal Reserve': p.federalReserve,
    Military: p.military,
    Health: p.health,
    Education: p.education,
    'Standard of Living': p.standardOfLiving,
  }
}

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type CountryFields = z.infer<typeof CountryFieldsSchema>
export type TransactionFields = z.infer<typeof TransactionFieldsSchema>
export type StageLogFields = z.infer<typeof StageLogFieldsSchema>
export type RoundSnapshotFields = z.infer<typeof RoundSnapshotFieldsSchema>
export type CrisisFields = z.infer<typeof CrisisFieldsSchema>

export type CountryRecord = z.infer<typeof CountryRecordSchema>
export type TransactionRecord = z.infer<typeof TransactionRecordSchema>
export type StageLogRecord = z.infer<typeof StageLogRecordSchema>
export type RoundSnapshotRecord = z.infer<typeof RoundSnapshotRecordSchema>
export type CrisisRecord = z.infer<typeof CrisisRecordSchema>
