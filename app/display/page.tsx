'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { GameState } from '@/lib/state'
import { CountryCard } from '@/components/display/CountryCard'
import { StageButton } from '@/components/display/StageButton'
import { CrisisStrip } from '@/components/display/CrisisStrip'
import { DiceCam } from '@/components/display/DiceCam'

type DisplayState = GameState & { clockOffsetMs: number }

// Measures how far this computer's clock is from the server's, so the stage
// countdown is right even if the projector's clock is off.
const fetcher = async (url: string): Promise<DisplayState> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const json = (await r.json()) as GameState & { serverNow?: string }
  const serverMs = json.serverNow ? Date.parse(json.serverNow) : NaN
  return { ...json, clockOffsetMs: Number.isNaN(serverMs) ? 0 : serverMs - Date.now() }
}

export default function DisplayPage() {
  const { data, error, mutate } = useSWR<DisplayState>('/api/state', fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: false,
    isPaused: () => typeof document !== 'undefined' && document.hidden,
  })

  // Tick every second for the "Updated N s ago" counter.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsAgo =
    data?.fetchedAt != null
      ? Math.max(0, Math.floor((now - new Date(data.fetchedAt).getTime()) / 1000))
      : null

  if (!data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-ww-bg">
        <span className="text-[36px] text-ww-soft">
          {error ? 'Could not connect. Retrying…' : 'Loading…'}
        </span>
      </div>
    )
  }

  const left  = data.countries.filter(c => c.number <= 4)
  const right = data.countries.filter(c => c.number >= 5)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ww-bg text-ww-text">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-ww-line px-6">
        <span className="text-[24px] font-semibold uppercase tracking-[0.14em]">Wrinkled World</span>
        <span className="font-mono text-[22px] text-ww-soft">
          {error && <span className="mr-6 text-ww-alert">Connection problem. Showing last data.</span>}
          {secondsAgo !== null
            ? secondsAgo === 0
              ? 'Updated just now'
              : `Updated ${secondsAgo}s ago`
            : 'Connecting…'}
        </span>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_500px_1fr] gap-4 p-4">

        {/* Left: countries 1–4 */}
        <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
          {left.map(c => <CountryCard key={c.id} country={c} />)}
        </div>

        {/* Center: stage panel (countdown, room, PIN-unlocked advance/undo) and dice cam */}
        <div className="flex min-h-0 flex-col justify-center gap-4 px-2.5">
          <StageButton
            stage={data.currentStage}
            clockOffsetMs={data.clockOffsetMs}
            onChanged={() => void mutate()}
          />
          <DiceCam />
        </div>

        {/* Right: countries 5–8 */}
        <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
          {right.map(c => <CountryCard key={c.id} country={c} />)}
        </div>
      </div>

      {/* ── Crises strip ───────────────────────────────────────────────── */}
      <CrisisStrip crises={data.crises} countries={data.countries} />

    </div>
  )
}
