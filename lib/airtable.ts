// Server-only module. Never import from client code.
// Reads AIRTABLE_TOKEN and AIRTABLE_BASE_ID from env; both must be set when
// AIRTABLE_MODE=live.

import { z } from 'zod'
import {
  TABLES,
  CountryRecordSchema,
  TransactionRecordSchema,
  StageLogRecordSchema,
  RoundSnapshotRecordSchema,
  CrisisRecordSchema,
  type CountryRecord,
  type TransactionRecord,
  type StageLogRecord,
  type RoundSnapshotRecord,
  type CrisisRecord,
} from './schema'

function baseUrl(): string {
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!baseId) throw new Error('AIRTABLE_BASE_ID env var is not set')
  return `https://api.airtable.com/v0/${baseId}`
}

function authHeader(): string {
  const token = process.env.AIRTABLE_TOKEN
  if (!token) throw new Error('AIRTABLE_TOKEN env var is not set')
  return `Bearer ${token}`
}

// ── Low-level HTTP ────────────────────────────────────────────────────────────

async function airtableFetch(url: string, init?: RequestInit): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  }
  let res = await fetch(url, merged)
  if (res.status === 429) {
    // Airtable rate-limit: wait 30 s then retry once (may exceed serverless timeout on
    // very short function limits, but 429s are not expected in normal operation).
    await new Promise(resolve => setTimeout(resolve, 30_000))
    res = await fetch(url, merged)
  }
  return res
}

const ListResponseSchema = z.object({
  records: z.array(
    z.object({ id: z.string(), createdTime: z.string(), fields: z.record(z.unknown()) }),
  ),
  offset: z.string().optional(),
})

async function fetchAllRecords(table: string): Promise<unknown[]> {
  const records: unknown[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ pageSize: '100' })
    if (offset) params.set('offset', offset)
    const url = `${baseUrl()}/${encodeURIComponent(table)}?${params}`
    const res = await airtableFetch(url)
    if (!res.ok) {
      throw new Error(`Airtable GET ${table} failed: ${res.status} ${res.statusText}`)
    }
    const data = ListResponseSchema.parse(await res.json())
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

// ── Table fetches ─────────────────────────────────────────────────────────────

export async function fetchCountries(): Promise<CountryRecord[]> {
  const raw = await fetchAllRecords(TABLES.Countries)
  return raw.map(r => CountryRecordSchema.parse(r))
}

export async function fetchTransactions(): Promise<TransactionRecord[]> {
  const raw = await fetchAllRecords(TABLES.Transactions)
  return raw.map(r => TransactionRecordSchema.parse(r))
}

export async function fetchStageLog(): Promise<StageLogRecord[]> {
  const raw = await fetchAllRecords(TABLES.StageLog)
  return raw.map(r => StageLogRecordSchema.parse(r))
}

export async function fetchRoundSnapshots(): Promise<RoundSnapshotRecord[]> {
  const raw = await fetchAllRecords(TABLES.RoundSnapshots)
  return raw.map(r => RoundSnapshotRecordSchema.parse(r))
}

export async function fetchCrises(): Promise<CrisisRecord[]> {
  const raw = await fetchAllRecords(TABLES.Crises)
  return raw.map(r => CrisisRecordSchema.parse(r))
}

// ── Generic write helpers (used by route handlers) ────────────────────────────

/**
 * Create up to N records in one table, automatically splitting into batches of
 * 10 (Airtable's per-request maximum). Returns the created record IDs in order.
 */
export async function createRecords(
  table: string,
  fieldSets: Record<string, unknown>[],
): Promise<{ id: string }[]> {
  const created: { id: string }[] = []
  for (let i = 0; i < fieldSets.length; i += 10) {
    const chunk = fieldSets.slice(i, i + 10)
    const res = await airtableFetch(`${baseUrl()}/${encodeURIComponent(table)}`, {
      method: 'POST',
      body: JSON.stringify({ records: chunk.map(fields => ({ fields })) }),
    })
    if (!res.ok) {
      throw new Error(`Airtable POST ${table} failed: ${res.status} ${res.statusText}`)
    }
    const data = ListResponseSchema.parse(await res.json())
    created.push(...data.records.map(r => ({ id: r.id })))
  }
  return created
}

/**
 * Update existing records (PATCH). Splits into batches of 10 automatically.
 */
export async function patchRecords(
  table: string,
  updates: { id: string; fields: Record<string, unknown> }[],
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10)
    const res = await airtableFetch(`${baseUrl()}/${encodeURIComponent(table)}`, {
      method: 'PATCH',
      body: JSON.stringify({ records: chunk }),
    })
    if (!res.ok) {
      throw new Error(`Airtable PATCH ${table} failed: ${res.status} ${res.statusText}`)
    }
  }
}

/**
 * Delete records by ID. Splits into batches of 10 automatically.
 */
export async function deleteRecords(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const params = new URLSearchParams()
    chunk.forEach(id => params.append('records[]', id))
    const res = await airtableFetch(
      `${baseUrl()}/${encodeURIComponent(table)}?${params}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      throw new Error(`Airtable DELETE ${table} failed: ${res.status} ${res.statusText}`)
    }
  }
}
