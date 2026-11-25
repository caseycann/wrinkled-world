// Builds a GameState from raw Airtable records or mock data.
// This module is server-only. Caching lives in /api/state/route.ts.
// Set AIRTABLE_MODE=live to read from Airtable; anything else (including unset)
// uses mock data.

import { stageDefinition, crisisRoundsLeft, crisisRunningFor, type StageName } from './rules'
import { getMockDb } from './mock'
import { currentStageRecord } from './stage'
import {
  fetchCountries,
  fetchTransactions,
  fetchStageLog,
  fetchRoundSnapshots,
  fetchCrises,
} from './airtable'
import type {
  CountryRecord,
  TransactionRecord,
  StageLogRecord,
  RoundSnapshotRecord,
  CrisisRecord,
} from './schema'

// ── GameState types ───────────────────────────────────────────────────────────

export interface PrevSnapshot {
  federalReserve: number
  military: number
  health: number
  education: number
  standardOfLiving: number
}

export interface CountryState {
  id: string
  letter: string
  number: number
  name: string
  council: string
  federalReserve: number
  military: number
  health: number
  education: number
  standardOfLiving: number
  prevSnapshot?: PrevSnapshot
}

export interface StageState {
  id: string          // Stage Log record ID; sent back as `expect` to /api/stage
  round: number
  stage: StageName
  startedAt: string   // ISO datetime
  minutes: number     // countdown length from rules.ts
  room: string
}

export interface CrisisState {
  id: string
  name: string
  cardNumber: number
  countriesHit: string[]    // Country record IDs
  startedRound: number
  lengthType: 'Until solved' | 'Fixed rounds'
  totalRounds?: number
  status: 'Active' | 'Solved'
  solvedRound?: number
  note?: string
  // Computed display fields
  roundsLeft?: number   // Fixed rounds only: rounds until automatically over
  runningFor?: number   // Until solved + Active only: rounds elapsed so far
}

export interface RecentTransaction {
  id: string
  countryId: string   // Country record ID
  round: number
  stage: string
  type: string
  moneyChange: number
  militaryChange: number
  healthChange: number
  educationChange: number
  standardOfLivingChange: number
  note?: string
  enteredBy?: string
  voided: boolean
  createdTime: string
}

export interface GameState {
  countries: CountryState[]           // sorted by Number (1–8)
  currentStage: StageState | null     // null only when the Stage Log is empty
  crises: CrisisState[]              // all crises; UI filters to what's visible
  recentTransactions: RecentTransaction[]  // last 20, newest first
  fetchedAt: string                   // ISO datetime for "Updated N seconds ago"
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildFromRecords(
  countries: CountryRecord[],
  transactions: TransactionRecord[],
  stageLog: StageLogRecord[],
  roundSnapshots: RoundSnapshotRecord[],
  crises: CrisisRecord[],
): GameState {
  // ── Countries ───────────────────────────────────────────────────────────────
  const countryStates: CountryState[] = countries
    .sort((a, b) => a.fields.Number - b.fields.Number)
    .map(r => ({
      id: r.id,
      letter: r.fields.Letter,
      number: r.fields.Number,
      name: r.fields.Name,
      council: r.fields.Council,
      federalReserve: r.fields['Federal Reserve'],
      military: r.fields.Military,
      health: r.fields.Health,
      education: r.fields.Education,
      standardOfLiving: r.fields['Standard of Living'],
    }))

  // ── Current stage ────────────────────────────────────────────────────────────
  // The current stage is the newest Stage Log row that is not undone.
  // There is no round limit and no game-over state: the Game Master ends the
  // game in the room when the win conditions are met.
  const latestLog = currentStageRecord(stageLog)

  let currentStage: StageState | null = null
  let currentRound = 0

  if (latestLog) {
    const { Round, Stage, 'Started At': startedAt } = latestLog.fields
    currentRound = Round
    const def = stageDefinition(Stage)
    currentStage = {
      id: latestLog.id,
      round: Round,
      stage: Stage,
      startedAt,
      minutes: def.minutes,
      room: def.room,
    }
  }

  // ── Previous round snapshots (for change-since-last-round display) ──────────
  if (currentRound > 0) {
    const prevRound = currentRound - 1
    const snapMap = new Map<string, PrevSnapshot>()
    for (const snap of roundSnapshots) {
      if (snap.fields.Round === prevRound) {
        const cid = snap.fields.Country[0]
        if (cid) snapMap.set(cid, {
          federalReserve: snap.fields['Federal Reserve'],
          military: snap.fields.Military,
          health: snap.fields.Health,
          education: snap.fields.Education,
          standardOfLiving: snap.fields['Standard of Living'],
        })
      }
    }
    for (const c of countryStates) {
      c.prevSnapshot = snapMap.get(c.id)
    }
  }

  // ── Crises ───────────────────────────────────────────────────────────────────
  const crisisStates: CrisisState[] = crises.map(r => {
    const f = r.fields
    const state: CrisisState = {
      id: r.id,
      name: f.Name,
      cardNumber: f['Card Number'],
      countriesHit: f['Countries Hit'],
      startedRound: f['Started Round'],
      lengthType: f['Length Type'],
      totalRounds: f.Rounds,
      status: f.Status,
      solvedRound: f['Solved Round'],
      note: f.Note,
    }
    if (f['Length Type'] === 'Fixed rounds' && f.Rounds !== undefined) {
      state.roundsLeft = crisisRoundsLeft(f.Rounds, f['Started Round'], currentRound)
    } else if (f['Length Type'] === 'Until solved' && f.Status === 'Active') {
      state.runningFor = crisisRunningFor(f['Started Round'], currentRound)
    }
    return state
  })

  // ── Recent transactions (last 20, newest first) ───────────────────────────────
  const recentTransactions: RecentTransaction[] = [...transactions]
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
    .slice(0, 20)
    .map(r => ({
      id: r.id,
      countryId: r.fields.Country[0] ?? '',
      round: r.fields.Round,
      stage: r.fields.Stage,
      type: r.fields.Type,
      moneyChange: r.fields['Money Change'] ?? 0,
      militaryChange: r.fields['Military Change'] ?? 0,
      healthChange: r.fields['Health Change'] ?? 0,
      educationChange: r.fields['Education Change'] ?? 0,
      standardOfLivingChange: r.fields['Standard of Living Change'] ?? 0,
      note: r.fields.Note,
      enteredBy: r.fields['Entered By'],
      voided: r.fields.Voided,
      createdTime: r.createdTime,
    }))

  return {
    countries: countryStates,
    currentStage,
    crises: crisisStates,
    recentTransactions,
    fetchedAt: new Date().toISOString(),
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function buildGameState(): Promise<GameState> {
  if (process.env.AIRTABLE_MODE !== 'live') {
    const { countries, transactions, stageLog, roundSnapshots, crises } = getMockDb()
    // Copy arrays: buildFromRecords sorts countries in place.
    return buildFromRecords([...countries], transactions, stageLog, roundSnapshots, crises)
  }

  const [countries, transactions, stageLog, roundSnapshots, crises] = await Promise.all([
    fetchCountries(),
    fetchTransactions(),
    fetchStageLog(),
    fetchRoundSnapshots(),
    fetchCrises(),
  ])
  return buildFromRecords(countries, transactions, stageLog, roundSnapshots, crises)
}
