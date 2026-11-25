import { NextResponse } from 'next/server'
import { buildGameState } from '@/lib/state'
import { getCachedState, setCachedState } from '@/lib/cache'

export async function GET() {
  try {
    const cached = getCachedState()
    if (cached) return NextResponse.json(cached)

    const state = await buildGameState()
    setCachedState(state)
    return NextResponse.json(state)
  } catch (err) {
    console.error('GET /api/state:', err)
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 })
  }
}
