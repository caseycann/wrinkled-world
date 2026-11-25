import { describe, it, expect } from 'vitest'
import {
  tierFromTokens,
  TIER_DICE,
  ROUND_STAGES,
  SESSION_ZERO,
  nextStageLocation,
  stageOrder,
  advanceStartsNewRound,
  advanceSnapshotRound,
  stageDefinition,
  stageSecondsLeft,
  formatCountdown,
  undoDeletesSnapshotRound,
  crisisRoundsLeft,
  crisisRunningFor,
  parseWholeChange,
  applyChanges,
  tokensBelowZero,
  hasAnyChange,
  type Tier,
} from '@/lib/rules'

describe('tierFromTokens', () => {
  // All boundary edges required by CLAUDE.md
  it.each([
    [0,  0],
    [1,  1],
    [5,  1],
    [6,  2],
    [10, 2],
    [11, 3],
    [15, 3],
    [16, 4],
    [25, 4],
  ] as [number, Tier][])('tierFromTokens(%i) → tier %i', (tokens, expected) => {
    expect(tierFromTokens(tokens)).toBe(expected)
  })

  it('tier 4 has no upper cap', () => {
    expect(tierFromTokens(100)).toBe(4)
    expect(tierFromTokens(999)).toBe(4)
  })

  it('floors decimals: 5.9 → tier 1, not tier 2', () => {
    expect(tierFromTokens(5.9)).toBe(1)
  })

  it('floors decimals: 0.9 → tier 0', () => {
    expect(tierFromTokens(0.9)).toBe(0)
  })

  it('negative input → tier 0', () => {
    expect(tierFromTokens(-1)).toBe(0)
    expect(tierFromTokens(-100)).toBe(0)
  })
})

describe('TIER_DICE', () => {
  it('tier 0 — no dice (exiled)', () => {
    expect(TIER_DICE[0]).toEqual({ military: 'none', health: 'none', education: 'none' })
  })

  it('tier 1 dice', () => {
    expect(TIER_DICE[1]).toEqual({ military: 'D4', health: 'D20', education: 'D4' })
  })

  it('tier 2 dice', () => {
    expect(TIER_DICE[2]).toEqual({ military: 'D6', health: 'D12', education: 'D6' })
  })

  it('tier 3 dice', () => {
    expect(TIER_DICE[3]).toEqual({ military: 'D12', health: 'D8', education: 'D12' })
  })

  it('tier 4 dice', () => {
    expect(TIER_DICE[4]).toEqual({ military: 'D20', health: 'D4', education: 'D20' })
  })

  it('military and education dice are identical at every tier', () => {
    for (const tier of [0, 1, 2, 3, 4] as Tier[]) {
      expect(TIER_DICE[tier].military).toBe(TIER_DICE[tier].education)
    }
  })

  it('health die descends as tier rises (inverse relationship)', () => {
    // D20 at tier 1 → D4 at tier 4
    const healthDice = [1, 2, 3, 4].map((t) => TIER_DICE[t as Tier].health)
    expect(healthDice).toEqual(['D20', 'D12', 'D8', 'D4'])
  })
})

describe('ROUND_STAGES', () => {
  it('has exactly 6 stages', () => {
    expect(ROUND_STAGES).toHaveLength(6)
  })

  it('stage names are in order', () => {
    expect(ROUND_STAGES.map((s) => s.name)).toEqual([
      'Stage Setting',
      'Plan',
      'Negotiate',
      'Report',
      'Reaction',
      'Consequences',
    ])
  })

  it('minutes match the schedule', () => {
    expect(ROUND_STAGES.map((s) => s.minutes)).toEqual([5, 5, 10, 10, 5, 10])
  })

  it('rooms alternate correctly', () => {
    expect(ROUND_STAGES.map((s) => s.room)).toEqual([
      'Media Lab',
      'Media Lab',
      'CDL',
      'Media Lab',
      'CDL',
      'Media Lab',
    ])
  })

  it('last stage is Consequences', () => {
    expect(ROUND_STAGES[ROUND_STAGES.length - 1].name).toBe('Consequences')
  })
})

// ── nextStageLocation ─────────────────────────────────────────────────────────

describe('nextStageLocation', () => {
  it('Session 0 → Round 1 Stage Setting', () => {
    expect(nextStageLocation({ round: 0, stage: 'Session 0' }))
      .toEqual({ round: 1, stage: 'Stage Setting' })
  })

  it('Stage Setting → Plan (same round)', () => {
    expect(nextStageLocation({ round: 1, stage: 'Stage Setting' }))
      .toEqual({ round: 1, stage: 'Plan' })
  })

  it('Plan → Negotiate', () => {
    expect(nextStageLocation({ round: 1, stage: 'Plan' }))
      .toEqual({ round: 1, stage: 'Negotiate' })
  })

  it('Negotiate → Report', () => {
    expect(nextStageLocation({ round: 1, stage: 'Negotiate' }))
      .toEqual({ round: 1, stage: 'Report' })
  })

  it('Report → Reaction', () => {
    expect(nextStageLocation({ round: 1, stage: 'Report' }))
      .toEqual({ round: 1, stage: 'Reaction' })
  })

  it('Reaction → Consequences', () => {
    expect(nextStageLocation({ round: 1, stage: 'Reaction' }))
      .toEqual({ round: 1, stage: 'Consequences' })
  })

  it('Round 1 Consequences → Round 2 Stage Setting (rollover)', () => {
    expect(nextStageLocation({ round: 1, stage: 'Consequences' }))
      .toEqual({ round: 2, stage: 'Stage Setting' })
  })

  it('Round 8 Consequences → Round 9 Stage Setting', () => {
    expect(nextStageLocation({ round: 8, stage: 'Consequences' }))
      .toEqual({ round: 9, stage: 'Stage Setting' })
  })

  it('Round 9 Consequences → Round 10 Stage Setting (no round limit, no game over)', () => {
    expect(nextStageLocation({ round: 9, stage: 'Consequences' }))
      .toEqual({ round: 10, stage: 'Stage Setting' })
  })

  it('Round 12 Consequences → Round 13 Stage Setting', () => {
    expect(nextStageLocation({ round: 12, stage: 'Consequences' }))
      .toEqual({ round: 13, stage: 'Stage Setting' })
  })
})

// ── advanceSnapshotRound ──────────────────────────────────────────────────────

describe('advanceSnapshotRound', () => {
  it('Session 0 → null (no snapshots on this transition)', () => {
    expect(advanceSnapshotRound({ round: 0, stage: 'Session 0' })).toBeNull()
  })

  it('Stage Setting → null', () => {
    expect(advanceSnapshotRound({ round: 1, stage: 'Stage Setting' })).toBeNull()
  })

  it('Plan → null', () => {
    expect(advanceSnapshotRound({ round: 1, stage: 'Plan' })).toBeNull()
  })

  it('Round 1 Consequences → round 1', () => {
    expect(advanceSnapshotRound({ round: 1, stage: 'Consequences' })).toBe(1)
  })

  it('Round 9 Consequences → round 9', () => {
    expect(advanceSnapshotRound({ round: 9, stage: 'Consequences' })).toBe(9)
  })
})

// ── undoDeletesSnapshotRound ──────────────────────────────────────────────────

describe('undoDeletesSnapshotRound', () => {
  it('Stage Setting round 1 → null (came from Session 0, no snapshots written)', () => {
    expect(undoDeletesSnapshotRound({ round: 1, stage: 'Stage Setting' })).toBeNull()
  })

  it('Stage Setting round 2 → 1', () => {
    expect(undoDeletesSnapshotRound({ round: 2, stage: 'Stage Setting' })).toBe(1)
  })

  it('Stage Setting round 9 → 8', () => {
    expect(undoDeletesSnapshotRound({ round: 9, stage: 'Stage Setting' })).toBe(8)
  })

  it('Plan round 3 → null', () => {
    expect(undoDeletesSnapshotRound({ round: 3, stage: 'Plan' })).toBeNull()
  })

  it('Consequences round 9 → null', () => {
    expect(undoDeletesSnapshotRound({ round: 9, stage: 'Consequences' })).toBeNull()
  })

  it('Stage Setting round 10 → 9 (past Round 9 works the same)', () => {
    expect(undoDeletesSnapshotRound({ round: 10, stage: 'Stage Setting' })).toBe(9)
  })

  it('repeated undo — Stage Setting round 5 → 4', () => {
    expect(undoDeletesSnapshotRound({ round: 5, stage: 'Stage Setting' })).toBe(4)
  })
})

// ── advanceStartsNewRound ─────────────────────────────────────────────────────

describe('advanceStartsNewRound (when to ask "Start Round N?")', () => {
  it('Session 0 → yes (starts Round 1)', () => {
    expect(advanceStartsNewRound({ round: 0, stage: 'Session 0' })).toBe(true)
  })

  it('Consequences → yes', () => {
    expect(advanceStartsNewRound({ round: 4, stage: 'Consequences' })).toBe(true)
    expect(advanceStartsNewRound({ round: 9, stage: 'Consequences' })).toBe(true)
  })

  it.each(['Stage Setting', 'Plan', 'Negotiate', 'Report', 'Reaction'] as const)(
    '%s → no',
    stage => {
      expect(advanceStartsNewRound({ round: 3, stage })).toBe(false)
    },
  )
})

// ── stageDefinition ───────────────────────────────────────────────────────────

describe('stageDefinition', () => {
  it('Session 0 → SESSION_ZERO', () => {
    expect(stageDefinition('Session 0')).toBe(SESSION_ZERO)
  })

  it('Negotiate → 10 min in CDL', () => {
    expect(stageDefinition('Negotiate')).toEqual({ name: 'Negotiate', minutes: 10, room: 'CDL' })
  })
})

// ── stageSecondsLeft / formatCountdown ────────────────────────────────────────

describe('stageSecondsLeft', () => {
  const start = Date.parse('2026-11-25T09:00:00.000Z')

  it('full time at the start', () => {
    expect(stageSecondsLeft(start, 5, start)).toBe(300)
  })

  it('rounds partial seconds up', () => {
    expect(stageSecondsLeft(start, 5, start + 299_001)).toBe(1)
  })

  it('exactly at the end → 0', () => {
    expect(stageSecondsLeft(start, 5, start + 300_000)).toBe(0)
  })

  it('never below 0 after time is up (no auto-advance)', () => {
    expect(stageSecondsLeft(start, 5, start + 3_600_000)).toBe(0)
  })

  it('0-minute stage → 0', () => {
    expect(stageSecondsLeft(start, 0, start)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it.each([
    [600, '10:00'],
    [300, '5:00'],
    [61, '1:01'],
    [9, '0:09'],
    [0, '0:00'],
    [-5, '0:00'],
  ])('%i s → %s', (secs, expected) => {
    expect(formatCountdown(secs)).toBe(expected)
  })
})

// ── crisisRoundsLeft ──────────────────────────────────────────────────────────

describe('crisisRoundsLeft', () => {
  it('first round of a 3-round crisis → 3', () => {
    expect(crisisRoundsLeft(3, 1, 1)).toBe(3)
  })

  it('third round of a 3-round crisis → 1', () => {
    expect(crisisRoundsLeft(3, 1, 3)).toBe(1)
  })

  it('expired crisis → 0', () => {
    expect(crisisRoundsLeft(3, 1, 4)).toBe(0)
  })

  it('past expiry → negative', () => {
    expect(crisisRoundsLeft(3, 1, 5)).toBe(-1)
  })

  it('1-round crisis in its only round → 1', () => {
    expect(crisisRoundsLeft(1, 5, 5)).toBe(1)
  })

  it('2-round crisis, second round → 1', () => {
    expect(crisisRoundsLeft(2, 3, 4)).toBe(1)
  })
})

// ── crisisRunningFor ──────────────────────────────────────────────────────────

describe('crisisRunningFor', () => {
  it('started and still in first round → 1', () => {
    expect(crisisRunningFor(1, 1)).toBe(1)
  })

  it('started round 1, current round 3 → 3', () => {
    expect(crisisRunningFor(1, 3)).toBe(3)
  })

  it('started round 5, current round 7 → 3', () => {
    expect(crisisRunningFor(5, 7)).toBe(3)
  })
})

describe('SESSION_ZERO', () => {
  it('name is "Session 0"', () => {
    expect(SESSION_ZERO.name).toBe('Session 0')
  })

  it('room is Media Lab', () => {
    expect(SESSION_ZERO.room).toBe('Media Lab')
  })

  it('minutes is 0 (no countdown)', () => {
    expect(SESSION_ZERO.minutes).toBe(0)
  })
})

// ── Teacher console changes ───────────────────────────────────────────────────

describe('parseWholeChange', () => {
  it.each([
    ['', 0], ['   ', 0], ['0', 0], ['5', 5], ['+5', 5], ['-5', -5], [' 12 ', 12], ['-0', 0], ['007', 7],
  ])('accepts %j as %i', (text, value) => {
    expect(parseWholeChange(text)).toEqual({ ok: true, value })
  })

  it('turns -0 into 0 (not negative zero)', () => {
    const r = parseWholeChange('-0')
    expect(r.ok && Object.is(r.value, 0)).toBe(true)
  })

  it.each(['1.5', '2.0', '.5', '-', '+', 'abc', '5a', '1,000', '1e3', '- 5', '5-', 'Infinity', 'NaN'])(
    'refuses %j',
    text => {
      expect(parseWholeChange(text)).toEqual({ ok: false, reason: 'Whole numbers only' })
    },
  )

  it('refuses numbers too big to store exactly', () => {
    expect(parseWholeChange('99999999999999999999')).toEqual({ ok: false, reason: 'Number too big' })
  })
})

const base = { federalReserve: 10, military: 5, health: 3, education: 0, standardOfLiving: 16 }
const zero = { federalReserve: 0, military: 0, health: 0, education: 0, standardOfLiving: 0 }

describe('applyChanges', () => {
  it('adds each change to its total', () => {
    expect(applyChanges(base, { federalReserve: -4, military: 2, health: -1, education: 6, standardOfLiving: 0 }))
      .toEqual({ federalReserve: 6, military: 7, health: 2, education: 6, standardOfLiving: 16 })
  })

  it('lets money go below 0 (a loan)', () => {
    expect(applyChanges(base, { ...zero, federalReserve: -15 }).federalReserve).toBe(-5)
  })

  it('has no upper limit on tokens', () => {
    expect(applyChanges(base, { ...zero, standardOfLiving: 100 }).standardOfLiving).toBe(116)
  })
})

describe('tokensBelowZero', () => {
  it('allows a token to land exactly on 0', () => {
    expect(tokensBelowZero(applyChanges(base, { ...zero, health: -3 }))).toEqual([])
  })

  it('flags a token at -1', () => {
    expect(tokensBelowZero(applyChanges(base, { ...zero, health: -4 }))).toEqual(['health'])
  })

  it('flags every token below 0, and never money', () => {
    const t = applyChanges(base, { federalReserve: -50, military: -6, health: 0, education: -1, standardOfLiving: -17 })
    expect(tokensBelowZero(t)).toEqual(['military', 'education', 'standardOfLiving'])
  })
})

describe('hasAnyChange', () => {
  it('is false for all zeros', () => expect(hasAnyChange(zero)).toBe(false))
  it('is true for a money-only change', () => expect(hasAnyChange({ ...zero, federalReserve: -1 })).toBe(true))
  it('is true for a token-only change', () => expect(hasAnyChange({ ...zero, education: 1 })).toBe(true))
})

// ── stageOrder ────────────────────────────────────────────────────────────────

describe('stageOrder', () => {
  it('counts up through Session 0 and every round in order, past Round 9', () => {
    let loc = { round: 0, stage: 'Session 0' as const } as Parameters<typeof stageOrder>[0]
    let prev = stageOrder(loc)
    expect(prev).toBe(0)
    for (let i = 0; i < 6 * 11; i++) {
      loc = nextStageLocation(loc)
      const n = stageOrder(loc)
      expect(n).toBeGreaterThan(prev)
      prev = n
    }
    expect(loc.round).toBe(11)
  })
})
