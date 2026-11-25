'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { GameState, CrisisState, CountryState } from '@/lib/state'
import { CountryCard } from '@/components/display/CountryCard'

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<GameState>
  })

export default function DisplayPage() {
  const { data, error } = useSWR<GameState>('/api/state', fetcher, {
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

  const visibleCrises = data.crises.filter(c => {
    if (c.status === 'Solved') return false
    if (c.lengthType === 'Fixed rounds') return (c.roundsLeft ?? 0) > 0
    return true
  })

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white">

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 grid grid-cols-[2fr_480px_2fr] gap-4 p-4">

        {/* Left: countries 1–4 */}
        <div className="grid grid-cols-2 grid-rows-2 gap-3">
          {left.map(c => <CountryCard key={c.id} country={c} />)}
        </div>

        {/* Center: round + stage */}
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {data.isGameOver ? (
            <div className="text-5xl font-black text-yellow-400">Game Over</div>
          ) : data.currentStage ? (
            <>
              {data.currentStage.round > 0 && (
                <div className="text-3xl font-semibold text-gray-400">
                  Round {data.currentStage.round}
                </div>
              )}
              <div className="text-5xl font-black">{data.currentStage.stage}</div>
              <div className="text-2xl text-gray-300">{data.currentStage.room}</div>
              {data.currentStage.minutes > 0 && (
                <div className="text-2xl text-gray-500">{data.currentStage.minutes} min</div>
              )}
            </>
          ) : null}
        </div>

        {/* Right: countries 5–8 */}
        <div className="grid grid-cols-2 grid-rows-2 gap-3">
          {right.map(c => <CountryCard key={c.id} country={c} />)}
        </div>
      </div>

      {/* ── Crises strip ───────────────────────────────────────────────── */}
      <div className="flex h-20 shrink-0 items-center gap-4 overflow-hidden border-t border-gray-700 bg-gray-900 px-6">
        {visibleCrises.length === 0 ? (
          <span className="text-2xl text-gray-500">No active crises</span>
        ) : (
          <>
            <span className="shrink-0 text-2xl font-bold text-red-400">Crises:</span>
            <div className="flex flex-wrap gap-3 overflow-hidden">
              {visibleCrises.map(c => (
                <CrisisBadge key={c.id} crisis={c} countries={data.countries} />
              ))}
            </div>
          </>
        )}
      </div>

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

// ── Crisis badge ──────────────────────────────────────────────────────────────

function CrisisBadge({
  crisis,
  countries,
}: {
  crisis: CrisisState
  countries: CountryState[]
}) {
  const hitLetters = crisis.countriesHit
    .map(id => countries.find(c => c.id === id)?.letter ?? '?')
    .join(', ')

  const duration =
    crisis.lengthType === 'Fixed rounds'
      ? `${crisis.roundsLeft ?? 0} round${crisis.roundsLeft === 1 ? '' : 's'} left`
      : `${crisis.runningFor ?? 1} round${crisis.runningFor === 1 ? '' : 's'}`

  return (
    <div className="shrink-0 rounded-lg border border-red-700 bg-red-900/50 px-4 py-1 text-xl">
      <span className="font-bold text-red-200">{crisis.name}</span>
      {hitLetters && <span className="ml-2 text-red-300">({hitLetters})</span>}
      <span className="ml-2 text-red-400">— {duration}</span>
    </div>
  )
}
