'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { GameState } from '@/lib/state'
import { CountryCard } from '@/components/display/CountryCard'
import { StageButton } from '@/components/display/StageButton'
import { CrisisStrip } from '@/components/display/CrisisStrip'

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
      <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
        <span className="text-4xl text-white">
          {error ? 'Could not connect — retrying…' : 'Loading…'}
        </span>
      </div>
    )
  }

  const left  = data.countries.filter(c => c.number <= 4)
  const right = data.countries.filter(c => c.number >= 5)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white">

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 grid grid-cols-[2fr_480px_2fr] gap-4 p-4">

        {/* Left: countries 1–4 */}
        <div className="grid grid-cols-2 grid-rows-2 gap-3">
          {left.map(c => <CountryCard key={c.id} country={c} />)}
        </div>

        {/* Center: stage button (countdown, room, PIN-unlocked advance/undo) */}
        <div className="flex flex-col items-center justify-center text-center">
          <StageButton
            stage={data.currentStage}
            clockOffsetMs={data.clockOffsetMs}
            onChanged={() => void mutate()}
          />
        </div>

        {/* Right: countries 5–8 */}
        <div className="grid grid-cols-2 grid-rows-2 gap-3">
          {right.map(c => <CountryCard key={c.id} country={c} />)}
        </div>
      </div>

      {/* ── Crises strip ───────────────────────────────────────────────── */}
      <CrisisStrip crises={data.crises} countries={data.countries} />

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-t border-gray-800 bg-gray-900 px-6 text-lg text-gray-500">
        <span>World Builders</span>
        <span>
          {secondsAgo !== null
            ? secondsAgo === 0
              ? 'Updated just now'
              : `Updated ${secondsAgo}s ago`
            : 'Connecting…'}
          {error && <span className="ml-4 text-red-400">⚠ Connection error</span>}
        </span>
      </div>
    </div>
  )
}
