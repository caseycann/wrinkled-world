import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPin, setSessionCookie } from '@/lib/auth'

const Body = z.object({ pin: z.string() })

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing pin' }, { status: 400 })
  }

  if (!checkPin(parsed.data.pin)) {
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  }

  return setSessionCookie(NextResponse.json({ ok: true }))
}
