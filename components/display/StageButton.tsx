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

  // No stage yet: the Stage Log is empty. A teacher starts Session 0 here.
  if (!stage) {
    const startGame = async () => {
      if (busy) return
      if (!unlocked) return setModal('pin')
      setBusy(true)
      try {
        const res = await fetch('/api/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
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
    }

    return (
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => { enableChime(); void startGame() }}
          disabled={busy}
          aria-label={unlocked ? 'Start the game' : 'Start the game (locked, tap to enter PIN)'}
          className={[PANEL, unlocked ? PANEL_LIVE : 'cursor-default', busy ? 'opacity-60' : ''].join(' ')}
        >
          <PanelTop label="Not started" locked={!unlocked} />
          <div className="text-[56px] font-semibold leading-tight">Start game</div>
          <div className="flex-1" />
          <div className="text-[24px] text-ww-soft">
            {unlocked ? 'Tap to begin Session 0' : 'Tap to enter the teacher PIN'}
          </div>
        </button>
        <div className="h-14 text-[24px] text-ww-alert" role="status">{message}</div>
        {modal === 'pin' && (
          <PinPad
            onCancel={() => setModal('none')}
            onUnlocked={async () => {
              await mutateAuth({ unlocked: true }, { revalidate: false })
              setModal('none')
            }}
          />
        )}
      </div>
    )
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

  const fraction = hasTimer ? secondsLeft / (stage.minutes * 60) : 0

  return (
    <div className="flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={onMainTap}
        disabled={busy}
        aria-label={
          unlocked ? `Next stage: ${nextLabel}` : 'Stage button (locked, tap to enter PIN)'
        }
        className={[PANEL, unlocked ? PANEL_LIVE : 'cursor-default', busy ? 'opacity-60' : ''].join(' ')}
      >
        {/* Time's up: a pulsing amber ring around the panel. Never auto-advances. */}
        {timeUp && (
          <span aria-hidden className="pointer-events-none absolute inset-0 animate-pulse ring-4 ring-inset ring-ww-amber" />
        )}

        <PanelTop label={stage.round > 0 ? `Round ${stage.round}` : 'Before Round 1'} locked={!unlocked} />
        <div className="text-[56px] font-semibold leading-tight">{stage.stage}</div>

        {hasTimer ? (
          <>
            <div className="mt-1.5 font-mono text-[132px] font-semibold leading-none tabular-nums text-ww-amber">
              {formatCountdown(secondsLeft)}
            </div>
            <div className="relative mt-2 h-2.5 w-full bg-ww-line" aria-hidden>
              <span
                className="absolute inset-y-0 left-0 bg-ww-amber transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1" />
        )}

        <div className="mt-auto flex items-baseline justify-between gap-4 pt-2">
          <span className="text-[24px]">
            <span className="text-ww-soft">Room </span>
            <span className="font-semibold">{stage.room}</span>
          </span>
          {timeUp ? (
            <span className="text-[24px] font-semibold text-ww-amber">Time’s up</span>
          ) : (
            <span className="font-mono text-[22px] text-ww-soft">
              {unlocked ? `Tap for ${nextLabel}` : `Next: ${nextLabel}`}
            </span>
          )}
        </div>
      </button>

      <div className="flex h-14 items-center justify-between gap-4">
        {unlocked && stage.stage !== 'Session 0' ? (
          <button
            type="button"
            onClick={() => void send('undo')}
            disabled={busy}
            className="h-14 shrink-0 border border-ww-line bg-ww-panel px-7 text-[22px] font-semibold text-ww-text hover:bg-ww-cell disabled:opacity-50"
          >
            Undo
          </button>
        ) : <span />}
        <div className="text-right text-[22px] text-ww-alert" role="status">
          {message}
        </div>
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
      <div className="text-[56px] font-semibold">Start Round {round}?</div>
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="h-20 w-56 border border-ww-line text-[28px] font-semibold hover:bg-ww-cell"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="h-20 w-80 bg-ww-amber text-[28px] font-semibold text-ww-bg hover:bg-ww-amber-hover"
        >
          Start Round {round}
        </button>
      </div>
    </Overlay>
  )
}

// ── Panel pieces ────────────────────────────────────────────────────────────

const PANEL = [
  'relative flex h-[440px] w-full flex-col px-[30px] pb-6 pt-[22px] text-left',
  'border border-t-4 border-ww-line border-t-ww-amber bg-ww-panel transition-colors',
].join(' ')
const PANEL_LIVE = 'cursor-pointer hover:bg-ww-cell active:bg-ww-line-soft'

function PanelTop({ label, locked }: { label: string; locked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[26px] uppercase tracking-[0.12em] text-ww-soft">{label}</span>
      {locked && (
        <span className="border border-ww-line px-2.5 py-0.5 font-mono text-[18px] uppercase tracking-widest text-ww-soft">
          Locked
        </span>
      )}
    </div>
  )
}
