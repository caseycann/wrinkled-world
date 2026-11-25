import { NextResponse } from 'next/server'
import { buildGameState } from '@/lib/state'
import { getCachedState, setCachedState } from '@/lib/cache'

// `serverNow` lets the display correct for a projector whose clock is off, so
// the stage countdown matches the server's `Started at`.
export async function GET() {
  try {
    let state = getCachedState()
    if (!state) {
      state = await buildGameState()
      setCachedState(state)
    }
    return NextResponse.json({ ...state, serverNow: new Date().toISOString() })
  } catch (err) {
    console.error('GET /api/state:', err)
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 })
  }
}
