// Server-only module-level cache for GameState.
// TTL is 2 s. Any write route should call bustCache() so the next GET reflects
// the change. In Vercel production each warm instance has its own cache, which
// is correct — a stale secondary instance is at most 2 s behind.

import type { GameState } from './state'

interface CacheEntry {
  state: GameState
  expiresAt: number
}

const TTL_MS = 2_000

let entry: CacheEntry | null = null

export function getCachedState(): GameState | null {
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.state
}

export function setCachedState(state: GameState): void {
  entry = { state, expiresAt: Date.now() + TTL_MS }
}

export function bustCache(): void {
  entry = null
}
