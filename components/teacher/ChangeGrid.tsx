'use client'

import { useState } from 'react'
import {
  CHANGE_KEYS,
  applyChanges,
  parseWholeChange,
  tokensBelowZero,
  type ChangeKey,
  type Totals,
} from '@/lib/rules'
import { CONSOLE_TX_TYPES } from '@/lib/schema'
import type { CountryState } from '@/lib/state'

type ConsoleType = (typeof CONSOLE_TX_TYPES)[number]

interface Draft {
  values: Record<ChangeKey, string>
  type: ConsoleType | ''
  note: string
}

const COLUMNS: { key: ChangeKey; label: string; icon: string; cls: string }[] = [
  { key: 'federalReserve',   label: 'Money ($B)',         icon: '💰', cls: 'border-yellow-500 text-yellow-200' },
  { key: 'military',         label: 'Military',           icon: '⚔️', cls: 'border-red-500 text-red-200' },
  { key: 'health',           label: 'Health',             icon: '❤️', cls: 'border-white text-white' },
  { key: 'education',        label: 'Education',          icon: '📘', cls: 'border-blue-500 text-blue-200' },
  { key: 'standardOfLiving', label: 'Standard of Living', icon: '🏠', cls: 'border-green-500 text-green-200' },
]

function emptyDraft(): Draft {
  return {
    values: { federalReserve: '', military: '', health: '', education: '', standardOfLiving: '' },
    type: '',
    note: '',
  }
}

function totalsOf(c: CountryState): Totals {
  return {
    federalReserve: c.federalReserve,
    military: c.military,
    health: c.health,
    education: c.education,
    standardOfLiving: c.standardOfLiving,
  }
}

// Everything the UI needs to know about one row, recomputed on each render
// from the draft and the latest totals.
function analyse(draft: Draft, country: CountryState) {
  const parsed = Object.fromEntries(
    CHANGE_KEYS.map(k => [k, parseWholeChange(draft.values[k])]),
  ) as Record<ChangeKey, ReturnType<typeof parseWholeChange>>

  const changes = Object.fromEntries(
    CHANGE_KEYS.map(k => {
      const p = parsed[k]
      return [k, p.ok ? p.value : 0]
    }),
  ) as Totals

  const invalid = CHANGE_KEYS.filter(k => !parsed[k].ok)
  const hasNumbers = CHANGE_KEYS.some(k => draft.values[k].trim() !== '')
  const hasChange = CHANGE_KEYS.some(k => changes[k] !== 0)
  const touched = hasNumbers || draft.note.trim() !== '' || draft.type !== ''
  const newTotals = applyChanges(totalsOf(country), changes)
  const below = new Set<ChangeKey>(tokensBelowZero(newTotals))

  const problems: string[] = []
  if (invalid.length > 0) problems.push('Whole numbers only.')
  if (below.size > 0) problems.push("Tokens can't go below 0.")
  if (touched && invalid.length === 0 && !hasChange) problems.push('Enter a change, or clear this row.')
  if (hasChange && draft.type === '') problems.push('Pick a type.')

  return { parsed, changes, newTotals, below, touched, ready: touched && problems.length === 0, problems }
}

export function ChangeGrid({
  countries,
  onSaved,
  onUnauthorized,
}: {
  countries: CountryState[]
  onSaved: () => void
  onUnauthorized: () => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const draftFor = (id: string) => drafts[id] ?? emptyDraft()

  function update(id: string, change: (d: Draft) => Draft) {
    setDrafts(prev => ({ ...prev, [id]: change(prev[id] ?? emptyDraft()) }))
    setServerErrors(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setMessage(null)
  }

  const rows = countries.map(c => ({ country: c, draft: draftFor(c.id), a: analyse(draftFor(c.id), c) }))
  const touchedRows = rows.filter(r => r.a.touched)
  const canSave = !busy && touchedRows.length > 0 && touchedRows.every(r => r.a.ready)

  function setAllTypes(type: ConsoleType) {
    setDrafts(prev => {
      const next = { ...prev }
      for (const c of countries) next[c.id] = { ...(prev[c.id] ?? emptyDraft()), type }
      return next
    })
  }

  function clearAll() {
    setDrafts({})
    setServerErrors({})
    setMessage(null)
  }

  async function save() {
    if (!canSave) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: touchedRows.map(r => ({
            countryId: r.country.id,
            type: r.draft.type,
            note: r.draft.note.trim() || undefined,
            changes: r.a.changes,
          })),
        }),
      })
      if (res.status === 401) {
        setMessage({ text: 'Enter the PIN, then press Save again. Your entries are kept.', tone: 'error' })
        onUnauthorized()
        return
      }
      const json = (await res.json().catch(() => ({}))) as {
        saved?: number
        error?: string
        errors?: { countryId: string | null; message: string }[]
      }
      if (!res.ok) {
        const perRow: Record<string, string> = {}
        for (const e of json.errors ?? []) if (e.countryId) perRow[e.countryId] = e.message
        setServerErrors(perRow)
        const general = (json.errors ?? []).find(e => e.countryId === null)?.message
        setMessage({ text: general ?? json.error ?? 'Save failed. Try again.', tone: 'error' })
        return
      }
      setDrafts({})
      setServerErrors({})
      const n = json.saved ?? touchedRows.length
      setMessage({ text: `Saved ${n} ${n === 1 ? 'country' : 'countries'}.`, tone: 'ok' })
      onSaved()
    } catch {
      setMessage({ text: 'No connection. Nothing was saved. Try again.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-3 text-xl">
        <label htmlFor="set-all-type" className="text-gray-300">Set every row&apos;s type to</label>
        <select
          id="set-all-type"
          value=""
          onChange={e => e.target.value && setAllTypes(e.target.value as ConsoleType)}
          className="h-14 rounded-lg border-2 border-gray-600 bg-gray-900 px-3 text-xl"
        >
          <option value="">Choose…</option>
          {CONSOLE_TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] border-separate border-spacing-x-2 border-spacing-y-3">
          <thead>
            <tr className="text-left text-xl">
              <th className="w-56 px-2 font-semibold text-gray-300">Country</th>
              {COLUMNS.map(col => (
                <th key={col.key} className="px-1">
                  <span className={`inline-flex items-center gap-2 border-b-4 pb-1 font-semibold ${col.cls}`}>
                    <span aria-hidden>{col.icon}</span>
                    {col.label}
                  </span>
                </th>
              ))}
              <th className="w-48 px-1 font-semibold text-gray-300">Type</th>
              <th className="px-1 font-semibold text-gray-300">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ country: c, draft, a }) => {
              const problem = serverErrors[c.id] ?? (a.touched ? a.problems.join(' ') : '')
              return (
                <tr key={c.id} className="align-top">
                  <th scope="row" className="px-2 pt-2 text-left">
                    <div className="text-3xl font-black">
                      {c.letter}/{c.number}
                    </div>
                    <div className="text-lg font-normal text-gray-400">{c.name}</div>
                    {problem && (
                      <div role="alert" className="mt-1 text-base font-semibold text-red-300">
                        ⚠ {problem}
                      </div>
                    )}
                  </th>

                  {COLUMNS.map(col => {
                    const p = a.parsed[col.key]
                    const now = c[col.key]
                    const next = a.newTotals[col.key]
                    const isMoney = col.key === 'federalReserve'
                    const bad = !p.ok || a.below.has(col.key)
                    const changed = p.ok && p.value !== 0
                    return (
                      <td key={col.key} className="px-1">
                        <input
                          type="text"
                          autoComplete="off"
                          aria-label={`${col.label} change for ${c.letter}/${c.number} ${c.name}`}
                          aria-invalid={bad}
                          value={draft.values[col.key]}
                          onChange={e => {
                            const v = e.target.value
                            update(c.id, d => ({ ...d, values: { ...d.values, [col.key]: v } }))
                          }}
                          placeholder="0"
                          className={[
                            'h-16 w-full rounded-lg border-2 bg-gray-900 px-3 text-center text-3xl tabular-nums',
                            'placeholder:text-gray-700 focus:outline-none focus:ring-4 focus:ring-sky-500',
                            bad ? 'border-red-500' : 'border-gray-600',
                          ].join(' ')}
                        />
                        <div className="mt-1 text-center text-lg tabular-nums" aria-live="polite">
                          {!p.ok ? (
                            <span className="font-semibold text-red-300">{p.reason}</span>
                          ) : changed ? (
                            <span className={bad ? 'font-semibold text-red-300' : isMoney && next < 0 ? 'font-semibold text-amber-300' : 'text-gray-200'}>
                              {fmt(now, isMoney)} → <b>{fmt(next, isMoney)}</b>
                              {bad && ' ✕'}
                              {isMoney && next < 0 && ' (loan)'}
                            </span>
                          ) : (
                            <span className="text-gray-500">now {fmt(now, isMoney)}</span>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  <td className="px-1">
                    <select
                      aria-label={`Type for ${c.letter}/${c.number} ${c.name}`}
                      value={draft.type}
                      onChange={e => {
                        const v = e.target.value as ConsoleType | ''
                        update(c.id, d => ({ ...d, type: v }))
                      }}
                      className={[
                        'h-16 w-full rounded-lg border-2 bg-gray-900 px-2 text-xl',
                        a.problems.includes('Pick a type.')
                          ? 'border-red-500'
                          : 'border-gray-600',
                      ].join(' ')}
                    >
                      <option value="">Type…</option>
                      {CONSOLE_TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  <td className="px-1">
                    <input
                      type="text"
                      aria-label={`Note for ${c.letter}/${c.number} ${c.name}`}
                      value={draft.note}
                      maxLength={2000}
                      onChange={e => {
                        const v = e.target.value
                        update(c.id, d => ({ ...d, note: v }))
                      }}
                      placeholder="Optional"
                      className="h-16 w-full rounded-lg border-2 border-gray-600 bg-gray-900 px-3 text-xl placeholder:text-gray-700 focus:outline-none focus:ring-4 focus:ring-sky-500"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-6 border-t border-gray-700 bg-gray-950 py-4">
        <div
          role="status"
          className={`text-2xl ${message?.tone === 'error' ? 'font-semibold text-red-300' : 'text-emerald-300'}`}
        >
          {message?.text ??
            (touchedRows.length === 0
              ? <span className="text-gray-500">Type a change in any row.</span>
              : <span className="text-gray-300">{touchedRows.length} {touchedRows.length === 1 ? 'country' : 'countries'} to save</span>)}
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={clearAll}
            disabled={busy || touchedRows.length === 0}
            className="h-20 rounded-2xl border-2 border-gray-500 px-8 text-2xl font-semibold hover:bg-gray-800 disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="h-20 w-64 rounded-2xl bg-emerald-600 text-3xl font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy ? 'Saving…' : '✓ Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function fmt(n: number, money: boolean): string {
  if (!money) return String(n)
  return n < 0 ? `-$${-n}B` : `$${n}B`
}
