import { createHash } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'teacher_session'
const COOKIE_MAX_AGE = 60 * 60 * 12 // 12 hours

// Derives a session token from the PIN so the PIN itself is never stored in the cookie.
function sessionToken(pin: string): string {
  return createHash('sha256').update(`wrinkled-world:${pin}`).digest('hex')
}

export function checkPin(pin: string): boolean {
  const expected = process.env.TEACHER_PIN
  if (!expected) return false
  return pin === expected
}

export function setSessionCookie(response: NextResponse): NextResponse {
  const pin = process.env.TEACHER_PIN ?? ''
  response.cookies.set(COOKIE_NAME, sessionToken(pin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}

// Returns null when the request is authenticated, or a 401 NextResponse.
// Usage: const denied = requireAuth(request); if (denied) return denied;
export function requireAuth(request: NextRequest): NextResponse | null {
  const pin = process.env.TEACHER_PIN
  if (!pin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const token = request.cookies.get(COOKIE_NAME)?.value
  if (token === sessionToken(pin)) return null

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
