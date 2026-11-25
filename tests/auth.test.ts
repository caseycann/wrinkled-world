import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkPin } from '@/lib/auth'

describe('checkPin', () => {
  const originalPin = process.env.TEACHER_PIN

  beforeEach(() => {
    process.env.TEACHER_PIN = '5678'
  })

  afterEach(() => {
    if (originalPin === undefined) {
      delete process.env.TEACHER_PIN
    } else {
      process.env.TEACHER_PIN = originalPin
    }
  })

  it('returns true for the correct PIN', () => {
    expect(checkPin('5678')).toBe(true)
  })

  it('returns false for a wrong PIN', () => {
    expect(checkPin('0000')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(checkPin('')).toBe(false)
  })

  it('returns false when TEACHER_PIN is not set', () => {
    delete process.env.TEACHER_PIN
    expect(checkPin('5678')).toBe(false)
  })

  it('is case-sensitive / no trimming', () => {
    expect(checkPin(' 5678')).toBe(false)
    expect(checkPin('5678 ')).toBe(false)
  })
})
