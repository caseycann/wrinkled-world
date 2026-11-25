// Builds a GameState from raw Airtable records or mock data.
// This module is server-only. Caching lives in /api/state/route.ts.
// Set AIRTABLE_MODE=live to read from Airtable; anything else (including unset)
// uses mock data.

import { ROUND_STAGES, SESSION_ZERO, crisisRoundsLeft, crisisRunningFor } from './rules'
import { mockAirtableData } from './mock'
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
  id: string
  round: number
  stage: string
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
  currentStage: StageState | null     // null when game is over
  isGameOver: boolean
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
  const activeLogs = stageLog
    .filter(r => !r.fields.Undone)
    .sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime())

  const latestLog = activeLogs.at(-1)

  let currentStage: StageState | null = null
  let currentRound = 0
  let isGameOver = false

  if (latestLog) {
    const { Round, Stage, 'Started At': startedAt } = latestLog.fields
    currentRound = Round

    // Game over: advanced past Round 9 Consequences. The advance action writes
    // 8 Round Snapshots but adds no new Stage Log row, so the last log entry
    // stays at Round 9/Consequences. We detect completion by those snapshots.
    const hasRound9Snapshots = roundSnapshots.some(s => s.fields.Round === 9)
    if (Round === 9 && Stage === 'Consequences' && hasRound9Snapshots) {
      isGameOver = true
    } else {
      const def =
        Stage === 'Session 0' ? SESSION_ZERO : ROUND_STAGES.find(s => s.name === Stage)
      currentStage = {
        id: latestLog.id,
        round: Round,
        stage: Stage,
        startedAt,
        minutes: def?.minutes ?? 0,
        room: def?.room ?? '',
      }
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
    isGameOver,
    crises: crisisStates,
    recentTransactions,
    fetchedAt: new Date().toISOString(),
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function buildGameState(): Promise<GameState> {
  if (process.env.AIRTABLE_MODE !== 'live') {
    const { countries, transactions, stageLog, roundSnapshots, crises } = mockAirtableData
    return buildFromRecords(countries, transactions, stageLog, roundSnapshots, crises)
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
