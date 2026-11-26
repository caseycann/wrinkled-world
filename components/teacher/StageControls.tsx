'use client'

import { useEffect, useState } from 'react'
import {
  advanceStartsNewRound,
  formatCountdown,
  nextStageLocation,
  stageSecondsLeft,
} from '@/lib/rules'
import type { StageState } from '@/lib/state'

// Start the game and move through stages from the teacher console, so nobody
// has to walk to the display computer. Uses the same /api/stage calls as the
// display's stage button: `expect` protects against double taps and two
// screens acting at once. A new round asks for confirmation first.
export function StageControls({
  stage,
  clockOffsetMs,
  onChanged,
  onUnauthorized,
}: {
  stage: StageState | null
  clockOffsetMs: number      // server time minus this computer's time
  onChanged: () => void
  onUnauthorized: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // A different stage (from this screen or another) cancels a pending confirmation.
  const stageId = stage?.id ?? null
  useEffect(() => { setConfirming(false) }, [stageId])

  async function send(body: object) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        setMessage('Enter the PIN, then try again.')
        onUnauthorized()
        return
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setMessage(j.error ?? 'Stage change failed. Try again.')
      }
    } catch {
      setMessage('No connection. Nothing was changed. Try again.')
    } finally {
      setBusy(false)
      setConfirming(false)
      onChanged()
    }
  }

  const btn = 'h-20 px-8 text-2xl font-semibold disabled:opacity-40'
  const primary = `${btn} bg-ww-amber text-ww-bg hover:bg-ww-amber-hover`
  const secondary = `${btn} border border-ww-line hover:bg-ww-cell`

  // ── Not started ────────────────────────────────────────────────────────────
  if (!stage) {
    return (
      <Panel>
        <div>
          <div className="font-mono text-lg uppercase tracking-[0.12em] text-ww-soft">Not started</div>
          <div className="text-3xl font-semibold">The game hasn’t started yet</div>
        </div>
        <Actions message={message}>
          <button type="button" disabled={busy} onClick={() => void send({ action: 'start' })} className={primary}>
            {busy ? 'Starting…' : 'Start game'}
          </button>
        </Actions>
      </Panel>
    )
  }

  // ── Running ────────────────────────────────────────────────────────────────
  const next = nextStageLocation(stage)
  const newRound = advanceStartsNewRound(stage)
  const nextLabel = newRound ? `Start Round ${next.round}` : `Next: ${next.stage}`
  const hasTimer = stage.minutes > 0
  const secondsLeft = hasTimer
    ? stageSecondsLeft(Date.parse(stage.startedAt), stage.minutes, now + clockOffsetMs)
    : 0
  const timeUp = hasTimer && secondsLeft === 0

  const advance = () => void send({ action: 'advance', expect: stage.id })
  const undo = () => void send({ action: 'undo', expect: stage.id })

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
        <div>
          <div className="font-mono text-lg uppercase tracking-[0.12em] text-ww-soft">
            {stage.round > 0 ? `Round ${stage.round}` : 'Before Round 1'}
          </div>
          <div className="text-3xl font-semibold">{stage.stage}</div>
        </div>
        {hasTimer && (
          <div className="font-mono text-5xl font-semibold tabular-nums text-ww-amber">
            {formatCountdown(secondsLeft)}
            {timeUp && <span className="ml-3 align-middle font-sans text-xl">Time’s up</span>}
          </div>
        )}
        <div className="text-xl">
          <span className="text-ww-soft">Room </span>
          <span className="font-semibold">{stage.room}</span>
        </div>
      </div>

      <Actions message={message}>
        {confirming ? (
          <>
            <span className="text-2xl font-semibold">Start Round {next.round}?</span>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondary}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={advance} className={primary} autoFocus>
              {busy ? 'Starting…' : `Yes, start Round ${next.round}`}
            </button>
          </>
        ) : (
          <>
            {stage.stage !== 'Session 0' && (
              <button type="button" disabled={busy} onClick={undo} className={secondary}>
                Undo
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => (newRound ? setConfirming(true) : advance())}
              className={primary}
            >
              {busy ? 'Saving…' : nextLabel}
            </button>
          </>
        )}
      </Actions>
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Stage controls"
      className="mb-8 flex flex-wrap items-center justify-between gap-6 border border-t-4 border-ww-line border-t-ww-amber bg-ww-panel px-6 py-5"
    >
      {children}
    </section>
  )
}

function Actions({ message, children }: { message: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-4">{children}</div>
      {message && <div role="status" className="text-lg font-semibold text-ww-alert">{message}</div>}
    </div>
  )
}
