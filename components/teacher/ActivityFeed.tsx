'use client'

import { useState } from 'react'
import type { CountryState, RecentTransaction } from '@/lib/state'

const CHANGE_PARTS: { key: keyof RecentTransaction; label: string; money?: boolean }[] = [
  { key: 'moneyChange',            label: 'Money', money: true },
  { key: 'militaryChange',         label: 'Military' },
  { key: 'healthChange',           label: 'Health' },
  { key: 'educationChange',        label: 'Education' },
  { key: 'standardOfLivingChange', label: 'Standard of Living' },
]

function signed(n: number, money: boolean): string {
  const sign = n < 0 ? '−' : '+'
  return money ? `${sign}$${Math.abs(n)}B` : `${sign}${Math.abs(n)}`
}

function changeSummary(t: RecentTransaction): string {
  const parts = CHANGE_PARTS.flatMap(p => {
    const n = t[p.key] as number
    return n === 0 ? [] : [`${p.label} ${signed(n, p.money ?? false)}`]
  })
  return parts.length > 0 ? parts.join(' · ') : 'No change'
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// The last 20 Transactions rows, newest first. Void takes two taps so a stray
// touch never removes a row. Voided rows stay listed, struck through.
export function ActivityFeed({
  transactions,
  countries,
  onVoided,
  onUnauthorized,
}: {
  transactions: RecentTransaction[]
  countries: CountryState[]
  onVoided: () => void
  onUnauthorized: () => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const byId = new Map(countries.map(c => [c.id, c]))

  function setError(id: string, message: string | null) {
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })
  }

  async function voidRow(id: string) {
    setBusyId(id)
    setError(id, null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', id }),
      })
      if (res.status === 401) {
        setError(id, 'Enter the PIN, then press Void again.')
        onUnauthorized()
        return
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        setError(id, json.error ?? 'Void failed. Try again.')
        return
      }
      setConfirming(null)
      onVoided()
    } catch {
      setError(id, 'No connection. Nothing was changed. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="activity-heading" className="mt-10 pb-12">
      <h2 id="activity-heading" className="mb-4 text-3xl font-black">Recent changes</h2>
      {transactions.length === 0 ? (
        <p className="text-xl text-gray-400">Nothing saved yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {transactions.map(t => {
            const c = byId.get(t.countryId)
            const isConfirming = confirming === t.id
            const busy = busyId === t.id
            return (
              <li
                key={t.id}
                className={[
                  'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border-2 px-5 py-4',
                  t.voided ? 'border-gray-800 bg-gray-950 text-gray-500' : 'border-gray-700 bg-gray-900',
                ].join(' ')}
              >
                <div className="w-48 shrink-0">
                  <div className="text-2xl font-black">{c ? `${c.letter}/${c.number}` : '?'}</div>
                  <div className="text-base text-gray-400">{c?.name ?? 'Unknown country'}</div>
                </div>

                <div className={`min-w-0 flex-1 ${t.voided ? 'line-through' : ''}`}>
                  <div className="text-xl">
                    <span className="font-semibold">{t.type}</span>
                    <span className="mx-2 text-gray-600">·</span>
                    <span className="tabular-nums">{changeSummary(t)}</span>
                  </div>
                  {t.note && <div className="text-lg text-gray-400">“{t.note}”</div>}
                </div>

                <div className="text-right text-base text-gray-400">
                  <div>{t.round > 0 ? `Round ${t.round} · ${t.stage}` : t.stage}</div>
                  <div>{timeOf(t.createdTime)}</div>
                </div>

                <div className="flex w-72 shrink-0 justify-end gap-3">
                  {t.voided ? (
                    <span className="rounded-lg border-2 border-gray-700 px-4 py-2 text-xl font-semibold">
                      ⊘ Voided
                    </span>
                  ) : isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setConfirming(null); setError(t.id, null) }}
                        disabled={busy}
                        className="h-16 rounded-xl border-2 border-gray-500 px-5 text-xl font-semibold hover:bg-gray-800 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void voidRow(t.id)}
                        disabled={busy}
                        className="h-16 rounded-xl bg-red-700 px-5 text-xl font-bold text-white hover:bg-red-600 disabled:opacity-40"
                      >
                        {busy ? 'Voiding…' : 'Yes, void'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setConfirming(t.id); setError(t.id, null) }}
                      aria-label={`Void ${t.type} for ${c ? `${c.letter}/${c.number} ${c.name}` : 'unknown country'}`}
                      className="h-16 w-32 rounded-xl border-2 border-red-500 text-xl font-semibold text-red-200 hover:bg-red-950"
                    >
                      Void
                    </button>
                  )}
                </div>

                {errors[t.id] && (
                  <div role="alert" className="basis-full text-lg font-semibold text-red-300">
                    ⚠ {errors[t.id]}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
