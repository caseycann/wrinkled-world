import { type NextRequest, NextResponse } from 'next/server'
import { buildGameState } from '@/lib/state'
import { setCachedState } from '@/lib/cache'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const denied = requireAuth(request)
  if (denied) return denied

  try {
    const state = await buildGameState()
    setCachedState(state)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/refresh:', err)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
