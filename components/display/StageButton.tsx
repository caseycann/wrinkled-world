'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  advanceStartsNewRound,
  formatCountdown,
  nextStageLocation,
  stageSecondsLeft,
} from '@/lib/rules'
import type { StageState } from '@/lib/state'
import { enableChime, playChime } from './chime'
import { Overlay, PinPad } from '@/components/shared/PinPad'

type Modal = 'none' | 'pin' | 'confirm'

const authFetcher = (url: string) =>
  fetch(url).then(r => r.json() as Promise<{ unlocked: boolean }>)

export function StageButton({
  stage,
  clockOffsetMs,
  onChanged,
}: {
  stage: StageState | null
  clockOffsetMs: number      // server time minus this computer's time
  onChanged: () => void      // re-fetch /api/state after a change
}) {
  const { data: auth, mutate: mutateAuth } = useSWR('/api/auth', authFetcher, {
    revalidateOnFocus: false,
  })
  const unlocked = auth?.unlocked === true

  const [modal, setModal] = useState<Modal>('none')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // ── Countdown ───────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const hasTimer = stage != null && stage.minutes > 0
  const secondsLeft = hasTimer
    ? stageSecondsLeft(Date.parse(stage.startedAt), stage.minutes, now + clockOffsetMs)
    : 0
  const timeUp = hasTimer && secondsLeft === 0

  // Chime once when this screen sees the countdown reach 0. Not on page load
  // when time is already up, and not when a different stage appears.
  const lastSeen = useRef<{ id: string; left: number } | null>(null)
  useEffect(() => {
    if (!stage || !hasTimer) {
      lastSeen.current = null
      return
    }
    const prev = lastSeen.current
    if (prev && prev.id === stage.id && prev.left > 0 && secondsLeft === 0) playChime()
    lastSeen.current = { id: stage.id, left: secondsLeft }
  }, [stage, hasTimer, secondsLeft])

  // Any tap on the page lets the browser play sound.
  useEffect(() => {
    document.addEventListener('pointerdown', enableChime)
    return () => document.removeEventListener('pointerdown', enableChime)
  }, [])

  // Clear a status message after a few seconds.
  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(id)
  }, [message])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (action: 'advance' | 'undo') => {
      if (!stage || busy) return
      setBusy(true)
      try {
        const res = await fetch('/api/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, expect: stage.id }),
        })
        if (res.status === 401) {
          await mutateAuth({ unlocked: false }, { revalidate: false })
          setModal('pin')
          return
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          setMessage(j.error ?? 'Something went wrong. Try again.')
        }
      } catch {
        setMessage('No connection. Try again.')
      } finally {
        setBusy(false)
        onChanged()
      }
    },
    [stage, busy, mutateAuth, onChanged],
  )

  if (!stage) {
    return <div className="text-4xl text-gray-400">Waiting for the game to start</div>
  }

  const next = nextStageLocation(stage)
  const startsNewRound = advanceStartsNewRound(stage)

  function onMainTap() {
    enableChime()
    if (busy) return
    if (!unlocked) return setModal('pin')
    if (startsNewRound) return setModal('confirm')
    void send('advance')
  }

  const nextLabel = startsNewRound ? `Round ${next.round}` : next.stage

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={onMainTap}
        disabled={busy}
        aria-label={
          unlocked ? `Next stage: ${nextLabel}` : 'Stage button (locked, tap to enter PIN)'
        }
        className={[
          'relative flex h-[440px] w-[440px] flex-col items-center justify-center gap-1 rounded-[48px]',
          'border-4 bg-gray-800 text-center transition-colors',
          unlocked ? 'cursor-pointer hover:bg-gray-700 active:bg-gray-600' : 'cursor-default',
          timeUp ? 'animate-pulse border-amber-400 ring-8 ring-amber-400/60' : 'border-gray-600',
          busy ? 'opacity-60' : '',
        ].join(' ')}
      >
        {!unlocked && (
          <span className="absolute right-5 top-4 text-2xl text-gray-500" aria-hidden>
            🔒
          </span>
        )}

        {stage.round > 0 && (
          <div className="text-3xl font-semibold text-gray-400">Round {stage.round}</div>
        )}
        <div className="text-5xl font-black leading-tight">{stage.stage}</div>

        {hasTimer && (
          <div
            className={`text-9xl font-black tabular-nums leading-none ${
              timeUp ? 'text-amber-300' : 'text-white'
            }`}
          >
            {formatCountdown(secondsLeft)}
          </div>
        )}

        <div className="text-3xl font-semibold text-sky-300">
          <span aria-hidden>📍 </span>
          {stage.room}
        </div>

        <div className={`h-8 text-2xl ${timeUp ? 'font-bold text-amber-300' : 'text-gray-400'}`}>
          {timeUp ? '⏰ Time’s up' : unlocked ? `Tap for ${nextLabel}` : ''}
        </div>
      </button>

      <div className="flex h-16 items-center gap-4">
        {unlocked && stage.stage !== 'Session 0' && (
          <button
            type="button"
            onClick={() => void send('undo')}
            disabled={busy}
            className="h-16 rounded-xl border-2 border-gray-500 bg-gray-900 px-8 text-2xl font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            ↶ Undo
          </button>
        )}
      </div>

      <div className="h-8 text-2xl text-orange-300" role="status">
        {message}
      </div>

      {modal === 'pin' && (
        <PinPad
          onCancel={() => setModal('none')}
          onUnlocked={async () => {
            await mutateAuth({ unlocked: true }, { revalidate: false })
            setModal('none')
          }}
        />
      )}

      {modal === 'confirm' && (
        <ConfirmRound
          round={next.round}
          onCancel={() => setModal('none')}
          onConfirm={() => {
            setModal('none')
            void send('advance')
          }}
        />
      )}
    </div>
  )
}

// ── Round confirmation ──────────────────────────────────────────────────────

function ConfirmRound({
  round,
  onConfirm,
  onCancel,
}: {
  round: number
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <Overlay>
      <div className="text-6xl font-black">Start Round {round}?</div>
      <div className="mt-8 flex gap-6">
        <button
          type="button"
          onClick={onCancel}
          className="h-20 w-56 rounded-2xl border-2 border-gray-500 text-3xl font-semibold hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="h-20 w-72 rounded-2xl bg-emerald-600 text-3xl font-bold text-white hover:bg-emerald-500"
        >
          ✓ Start Round {round}
        </button>
      </div>
    </Overlay>
  )
}
