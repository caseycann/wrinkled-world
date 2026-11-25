'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { GameState } from '@/lib/state'
import { ChangeGrid } from '@/components/teacher/ChangeGrid'
import { ActivityFeed } from '@/components/teacher/ActivityFeed'
import { PinPad } from '@/components/shared/PinPad'

const stateFetcher = async (url: string): Promise<GameState> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as GameState
}

const authFetcher = (url: string) =>
  fetch(url).then(r => r.json() as Promise<{ unlocked: boolean }>)

export default function TeacherPage() {
  const { data: auth, mutate: mutateAuth } = useSWR('/api/auth', authFetcher, {
    revalidateOnFocus: false,
  })
  // Same 3 s poll as the display. /api/state serves a 2 s cache, so this adds
  // at most one Airtable read per cache window, shared with every screen.
  const { data, error, mutate } = useSWR<GameState>('/api/state', stateFetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: false,
    isPaused: () => typeof document !== 'undefined' && document.hidden,
  })

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsAgo = data
    ? Math.max(0, Math.floor((now - Date.parse(data.fetchedAt)) / 1000))
    : null

  const stage = data?.currentStage
  const lockConsole = () => void mutateAuth({ unlocked: false }, { revalidate: false })

  // Re-reads Airtable into the server cache, then reloads this page's data.
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  async function refreshFromAirtable() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch('/api/refresh', { method: 'POST' })
      if (res.status === 401) {
        setRefreshMsg({ text: 'Enter the PIN first.', tone: 'error' })
        lockConsole()
        return
      }
      if (!res.ok) {
        setRefreshMsg({ text: 'Refresh failed. Try again.', tone: 'error' })
        return
      }
      await mutate()
      setRefreshMsg({ text: 'Refreshed', tone: 'ok' })
    } catch {
      setRefreshMsg({ text: 'No connection. Try again.', tone: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-6 pt-6 text-white">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-4xl font-black">Teacher Console</h1>
        <div className="text-2xl text-gray-300">
          {stage ? (
            <>
              {stage.round > 0 && <span className="font-semibold">Round {stage.round} · </span>}
              {stage.stage}
            </>
          ) : data ? (
            'Game not started'
          ) : null}
        </div>
        <div className="text-lg text-gray-500">
          {secondsAgo === null
            ? error ? '' : 'Loading…'
            : secondsAgo === 0 ? 'Updated just now' : `Updated ${secondsAgo}s ago`}
          {error && <span className="ml-4 text-red-400">⚠ Connection problem. Showing last data.</span>}
        </div>
        <div className="flex items-center gap-4">
          {refreshMsg && (
            <span
              role="status"
              className={`text-xl ${refreshMsg.tone === 'error' ? 'font-semibold text-red-300' : 'text-emerald-300'}`}
            >
              {refreshMsg.tone === 'ok' ? '✓ ' : '⚠ '}{refreshMsg.text}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshFromAirtable()}
            disabled={refreshing}
            className="h-16 rounded-xl border-2 border-sky-500 px-6 text-xl font-semibold text-sky-200 hover:bg-sky-950 disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh from Airtable'}
          </button>
        </div>
      </header>

      {data ? (
        <>
          <ChangeGrid
            countries={data.countries}
            onSaved={() => void mutate()}
            onUnauthorized={lockConsole}
          />
          <ActivityFeed
            transactions={data.recentTransactions}
            countries={data.countries}
            onVoided={() => void mutate()}
            onUnauthorized={lockConsole}
          />
        </>
      ) : (
        <div className="py-24 text-center text-3xl text-gray-400">
          {error ? 'Could not connect. Retrying…' : 'Loading…'}
        </div>
      )}

      {auth && !auth.unlocked && (
        <PinPad
          onUnlocked={async () => {
            await mutateAuth({ unlocked: true }, { revalidate: false })
          }}
        />
      )}
    </div>
  )
}
