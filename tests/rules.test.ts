import { describe, it, expect } from 'vitest'
import {
  tierFromTokens,
  TIER_DICE,
  ROUND_STAGES,
  SESSION_ZERO,
  nextStageLocation,
  advanceSnapshotRound,
  undoDeletesSnapshotRound,
  crisisRoundsLeft,
  crisisRunningFor,
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
      'Act/Negotiate',
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

  it('Plan → Act/Negotiate', () => {
    expect(nextStageLocation({ round: 1, stage: 'Plan' }))
      .toEqual({ round: 1, stage: 'Act/Negotiate' })
  })

  it('Act/Negotiate → Report', () => {
    expect(nextStageLocation({ round: 1, stage: 'Act/Negotiate' }))
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

  it('Round 9 Consequences → null (game over, no new log row)', () => {
    expect(nextStageLocation({ round: 9, stage: 'Consequences' })).toBeNull()
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

  it('Round 9 Consequences → round 9 (game-over advance still writes snapshots)', () => {
    expect(advanceSnapshotRound({ round: 9, stage: 'Consequences' })).toBe(9)
  })
})

// ── undoDeletesSnapshotRound ──────────────────────────────────────────────────

describe('undoDeletesSnapshotRound', () => {
  it('game over (gameIsOver=true) → 9', () => {
    expect(undoDeletesSnapshotRound({ round: 9, stage: 'Consequences' }, true)).toBe(9)
  })

  it('Stage Setting round 1 → null (came from Session 0, no snapshots written)', () => {
    expect(undoDeletesSnapshotRound({ round: 1, stage: 'Stage Setting' }, false)).toBeNull()
  })

  it('Stage Setting round 2 → 1', () => {
    expect(undoDeletesSnapshotRound({ round: 2, stage: 'Stage Setting' }, false)).toBe(1)
  })

  it('Stage Setting round 9 → 8', () => {
    expect(undoDeletesSnapshotRound({ round: 9, stage: 'Stage Setting' }, false)).toBe(8)
  })

  it('Plan round 3 → null', () => {
    expect(undoDeletesSnapshotRound({ round: 3, stage: 'Plan' }, false)).toBeNull()
  })

  it('Consequences round 9 without game over → null', () => {
    expect(undoDeletesSnapshotRound({ round: 9, stage: 'Consequences' }, false)).toBeNull()
  })

  it('repeated undo — Stage Setting round 5 → 4', () => {
    expect(undoDeletesSnapshotRound({ round: 5, stage: 'Stage Setting' }, false)).toBe(4)
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
