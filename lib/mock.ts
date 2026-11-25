// Mock data for development (AIRTABLE_MODE=mock) and tests.
// Game state: Round 2, "Plan" stage.
// Country A health=3 and E standard-of-living=3 are both in warning territory.

import type {
  CountryRecord,
  TransactionRecord,
  StageLogRecord,
  RoundSnapshotRecord,
  CrisisRecord,
} from './schema'

// ── Stable fake record IDs ────────────────────────────────────────────────────

const CID = {
  A: 'recCountryAAAAAAAA',
  B: 'recCountryBBBBBBBB',
  C: 'recCountryCCCCCCCC',
  D: 'recCountryDDDDDDDD',
  E: 'recCountryEEEEEEEE',
  F: 'recCountryFFFFFFFF',
  G: 'recCountryGGGGGGGG',
  H: 'recCountryHHHHHHHH',
} as const

// ── Countries ─────────────────────────────────────────────────────────────────
// Federal Reserve and token totals are the rollup of all non-voided transactions.
// A: 25B, Health 3 (warning). E: 30B, Sol 3 (warning). C: Military 10 (Tier 2).

export const mockCountries: CountryRecord[] = [
  { id: CID.A, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'A', Number: 1, Name: 'Arvenia', Council: 'Finance',
    'Federal Reserve': 25, Military: 8, Health: 3, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.B, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'B', Number: 2, Name: 'Boralia', Council: 'Justice',
    'Federal Reserve': 26, Military: 8, Health: 4, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.C, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'C', Number: 3, Name: 'Crystara', Council: 'Defense',
    'Federal Reserve': 22, Military: 10, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.D, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'D', Number: 4, Name: 'Dravos', Council: 'Ratification',
    'Federal Reserve': 28, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.E, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'E', Number: 5, Name: 'Eryndor', Council: 'Finance',
    'Federal Reserve': 30, Military: 8, Health: 8, Education: 8, 'Standard of Living': 3,
  }},
  { id: CID.F, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'F', Number: 6, Name: 'Frosveld', Council: 'Justice',
    'Federal Reserve': 30, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.G, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'G', Number: 7, Name: 'Golmaria', Council: 'Defense',
    'Federal Reserve': 28, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: CID.H, createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Letter: 'H', Number: 8, Name: 'Heyvon', Council: 'Ratification',
    'Federal Reserve': 26, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
]

// ── Transactions ──────────────────────────────────────────────────────────────
// Round 0: starting roll for each country (+20B, +8 each token).
// Round 1: income, one purchase (C), and crisis damage (A, B, E).

export const mockTransactions: TransactionRecord[] = [
  // Round 0 — starting rolls
  { id: 'recTxn001', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.A], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn002', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.B], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn003', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.C], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn004', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.D], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn005', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.E], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn006', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.F], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn007', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.G], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn008', createdTime: '2026-11-23T09:01:00.000Z', fields: {
    Country: [CID.H], Round: 0, Stage: 'Session 0', Type: 'Starting roll',
    'Money Change': 20, 'Military Change': 8, 'Health Change': 8, 'Education Change': 8, 'Standard of Living Change': 8,
    'Entered By': 'Luke', Voided: false,
  }},

  // Round 1 — income (Report stage)
  { id: 'recTxn009', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.A], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 5, 'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn010', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.B], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 6, 'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn011', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.C], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 8, 'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn012', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.D], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 8, 'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn013', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.E], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 10, 'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn014', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.F], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 10, 'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn015', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.G], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 8, 'Entered By': 'Luke', Voided: false,
  }},
  { id: 'recTxn016', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Country: [CID.H], Round: 1, Stage: 'Report', Type: 'Income',
    'Money Change': 6, 'Entered By': 'Luke', Voided: false,
  }},

  // Round 1 — C buys 2 military tokens (Act/Negotiate)
  { id: 'recTxn017', createdTime: '2026-11-24T09:12:00.000Z', fields: {
    Country: [CID.C], Round: 1, Stage: 'Act/Negotiate', Type: 'Purchase',
    'Money Change': -6, 'Military Change': 2, Note: 'Bought 2 military',
    'Entered By': 'Casey', Voided: false,
  }},

  // Round 1 — Health Pandemic crisis damages A and B (Consequences)
  { id: 'recTxn018', createdTime: '2026-11-24T09:36:00.000Z', fields: {
    Country: [CID.A], Round: 1, Stage: 'Consequences', Type: 'Crisis damage',
    'Health Change': -5, Note: 'Health Pandemic',
    'Entered By': 'Casey', Voided: false,
  }},
  { id: 'recTxn019', createdTime: '2026-11-24T09:36:00.000Z', fields: {
    Country: [CID.B], Round: 1, Stage: 'Consequences', Type: 'Crisis damage',
    'Health Change': -4, Note: 'Health Pandemic',
    'Entered By': 'Casey', Voided: false,
  }},

  // Round 1 — Trade War damages E's standard of living (Consequences)
  { id: 'recTxn020', createdTime: '2026-11-24T09:36:00.000Z', fields: {
    Country: [CID.E], Round: 1, Stage: 'Consequences', Type: 'Crisis damage',
    'Standard of Living Change': -5, Note: 'Trade War',
    'Entered By': 'Luke', Voided: false,
  }},
]

// ── Stage Log ─────────────────────────────────────────────────────────────────
// Current stage is the newest non-undone row: Round 2, Plan.

export const mockStageLog: StageLogRecord[] = [
  { id: 'recStage01', createdTime: '2026-11-23T09:00:00.000Z', fields: {
    Round: 0, Stage: 'Session 0', 'Started At': '2026-11-23T09:00:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
  { id: 'recStage02', createdTime: '2026-11-24T09:00:00.000Z', fields: {
    Round: 1, Stage: 'Stage Setting', 'Started At': '2026-11-24T09:00:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
  { id: 'recStage03', createdTime: '2026-11-24T09:05:00.000Z', fields: {
    Round: 1, Stage: 'Plan', 'Started At': '2026-11-24T09:05:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
  { id: 'recStage04', createdTime: '2026-11-24T09:10:00.000Z', fields: {
    Round: 1, Stage: 'Act/Negotiate', 'Started At': '2026-11-24T09:10:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
  { id: 'recStage05', createdTime: '2026-11-24T09:20:00.000Z', fields: {
    Round: 1, Stage: 'Report', 'Started At': '2026-11-24T09:20:00.000Z',
    Undone: false, 'Entered By': 'Luke',
  }},
  { id: 'recStage06', createdTime: '2026-11-24T09:30:00.000Z', fields: {
    Round: 1, Stage: 'Reaction', 'Started At': '2026-11-24T09:30:00.000Z',
    Undone: false, 'Entered By': 'Luke',
  }},
  { id: 'recStage07', createdTime: '2026-11-24T09:35:00.000Z', fields: {
    Round: 1, Stage: 'Consequences', 'Started At': '2026-11-24T09:35:00.000Z',
    Undone: false, 'Entered By': 'Luke',
  }},
  { id: 'recStage08', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 2, Stage: 'Stage Setting', 'Started At': '2026-11-25T09:00:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
  { id: 'recStage09', createdTime: '2026-11-25T09:05:00.000Z', fields: {
    Round: 2, Stage: 'Plan', 'Started At': '2026-11-25T09:05:00.000Z',
    Undone: false, 'Entered By': 'Casey',
  }},
]

// ── Round Snapshots ───────────────────────────────────────────────────────────
// Written when Round 1 Consequences advanced to Round 2 Stage Setting.
// Values match the country totals at the end of Round 1.

export const mockRoundSnapshots: RoundSnapshotRecord[] = [
  { id: 'recSnap1A', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.A], 'Federal Reserve': 25, Military: 8, Health: 3, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1B', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.B], 'Federal Reserve': 26, Military: 8, Health: 4, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1C', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.C], 'Federal Reserve': 22, Military: 10, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1D', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.D], 'Federal Reserve': 28, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1E', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.E], 'Federal Reserve': 30, Military: 8, Health: 8, Education: 8, 'Standard of Living': 3,
  }},
  { id: 'recSnap1F', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.F], 'Federal Reserve': 30, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1G', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.G], 'Federal Reserve': 28, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
  { id: 'recSnap1H', createdTime: '2026-11-25T09:00:00.000Z', fields: {
    Round: 1, Country: [CID.H], 'Federal Reserve': 26, Military: 8, Health: 8, Education: 8, 'Standard of Living': 8,
  }},
]

// ── Crises ────────────────────────────────────────────────────────────────────
// Two active until-solved crises both started in Round 1.

export const mockCrises: CrisisRecord[] = [
  { id: 'recCrisis111', createdTime: '2026-11-24T09:00:00.000Z', fields: {
    Name: 'Health Pandemic', 'Card Number': 4,
    'Countries Hit': [CID.A, CID.B],
    'Started Round': 1, 'Length Type': 'Until solved', Status: 'Active',
  }},
  { id: 'recCrisis222', createdTime: '2026-11-24T09:00:00.000Z', fields: {
    Name: 'Trade War', 'Card Number': 11,
    'Countries Hit': [CID.E],
    'Started Round': 1, 'Length Type': 'Until solved', Status: 'Active',
  }},
]

// ── Convenience bundle ────────────────────────────────────────────────────────

export const mockAirtableData = {
  countries: mockCountries,
  transactions: mockTransactions,
  stageLog: mockStageLog,
  roundSnapshots: mockRoundSnapshots,
  crises: mockCrises,
}
