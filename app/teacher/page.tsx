'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { GameState } from '@/lib/state'
import { ChangeGrid } from '@/components/teacher/ChangeGrid'
import { ActivityFeed } from '@/components/teacher/ActivityFeed'
import { CrisisPanel } from '@/components/teacher/CrisisPanel'
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
    <div className="min-h-screen bg-ww-bg px-6 pt-6 text-ww-text">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-ww-line pb-4">
        <h1 className="text-2xl font-semibold uppercase tracking-[0.14em]">Wrinkled World <span className="text-ww-soft">· Teacher console</span></h1>
        <div className="font-mono text-2xl">
          {stage ? (
            <>
              {stage.round > 0 && <span className="font-semibold">Round {stage.round} · </span>}
              {stage.stage}
            </>
          ) : data ? (
            'Game not started'
          ) : null}
        </div>
        <div className="font-mono text-lg text-ww-soft">
          {secondsAgo === null
            ? error ? '' : 'Loading…'
            : secondsAgo === 0 ? 'Updated just now' : `Updated ${secondsAgo}s ago`}
          {error && <span className="ml-4 text-ww-alert">Connection problem. Showing last data.</span>}
        </div>
        <div className="flex items-center gap-4">
          {refreshMsg && (
            <span
              role="status"
              className={`text-xl ${refreshMsg.tone === 'error' ? 'font-semibold text-ww-alert' : 'text-ww-ok'}`}
            >
              {refreshMsg.text}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshFromAirtable()}
            disabled={refreshing}
            className="h-16 border border-ww-line px-6 text-xl font-semibold hover:bg-ww-cell disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh from Airtable'}
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
          <CrisisPanel
            crises={data.crises}
            countries={data.countries}
            onChanged={() => void mutate()}
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
        <div className="py-24 text-center text-3xl text-ww-soft">
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
