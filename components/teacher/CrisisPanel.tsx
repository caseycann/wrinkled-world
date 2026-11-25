'use client'

import { useState } from 'react'
import type { CountryState, CrisisState } from '@/lib/state'
import { cardLengthText, crisisDuration } from '@/components/shared/crisisText'

type Message = { text: string; tone: 'ok' | 'error' }

// Draw a crisis card for chosen countries, and mark crises solved. The cards
// (names, numbers, lengths) come from the Airtable Crises table. Mark solved
// takes two taps so a stray touch never ends a crisis.
export function CrisisPanel({
  crises,
  countries,
  onChanged,
  onUnauthorized,
}: {
  crises: CrisisState[]
  countries: CountryState[]
  onChanged: () => void
  onUnauthorized: () => void
}) {
  const [cardId, setCardId] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<Message | null>(null)

  const [confirming, setConfirming] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const onBoard = crises.filter(c => c.onBoard)
  const card = crises.find(c => c.id === cardId)
  // If the chosen card went on the board (another screen), make the teacher re-pick.
  const cardOk = card !== undefined && !card.onBoard
  const byId = new Map(countries.map(c => [c.id, c]))

  function toggle(id: string) {
    setChosen(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    setAddMsg(null)
  }

  async function post(body: object): Promise<{ ok: true } | { ok: false; error: string; unauthorized?: boolean }> {
    try {
      const res = await fetch('/api/crises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) return { ok: false, error: 'Enter the PIN, then try again.', unauthorized: true }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: json.error ?? 'Save failed. Try again.' }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'No connection. Nothing was changed. Try again.' }
    }
  }

  async function addCrisis() {
    if (!card || !cardOk || chosen.length === 0) return
    setAdding(true)
    setAddMsg(null)
    // Keep the countries in A–H order.
    const countryIds = countries.filter(c => chosen.includes(c.id)).map(c => c.id)
    const result = await post({ action: 'add', id: card.id, countryIds, note: note.trim() || undefined })
    setAdding(false)
    if (!result.ok) {
      setAddMsg({ text: result.error, tone: 'error' })
      if (result.unauthorized) onUnauthorized()
      return
    }
    setAddMsg({ text: `${card.name} added`, tone: 'ok' })
    setCardId('')
    setChosen([])
    setNote('')
    onChanged()
  }

  async function solve(c: CrisisState) {
    setBusyId(c.id)
    setRowErrors(prev => ({ ...prev, [c.id]: '' }))
    const result = await post({ action: 'solve', id: c.id })
    setBusyId(null)
    if (!result.ok) {
      setRowErrors(prev => ({ ...prev, [c.id]: result.error }))
      if (result.unauthorized) onUnauthorized()
      return
    }
    setConfirming(null)
    onChanged()
  }

  const chosenLetters = countries.filter(c => chosen.includes(c.id)).map(c => c.letter).join(', ')

  return (
    <section aria-labelledby="crises-heading" className="mt-10">
      <h2 id="crises-heading" className="mb-4 text-3xl font-black">Crises</h2>

      {/* ── On the board ───────────────────────────────────────────────── */}
      <h3 className="mb-3 text-2xl font-semibold text-gray-300">On the board</h3>
      {onBoard.length === 0 ? (
        <p className="mb-8 text-xl text-gray-400">No crises on the board.</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {onBoard.map(c => {
            const isConfirming = confirming === c.id
            const busy = busyId === c.id
            const hit = c.countriesHit.map(id => {
              const k = byId.get(id)
              return k ? `${k.letter} ${k.name}` : 'Unknown'
            }).join(', ')
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border-2 border-red-800 bg-red-950/40 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold">
                    <span className="mr-2 text-red-300">⚠</span>
                    {c.cardNumber !== null && <span className="text-gray-400">#{c.cardNumber} </span>}
                    {c.name}
                  </div>
                  <div className="text-xl text-gray-300">
                    {hit} <span className="mx-2 text-gray-600">·</span> {crisisDuration(c)}
                    <span className="mx-2 text-gray-600">·</span> started Round {c.startedRound}
                  </div>
                  {c.note && <div className="text-lg text-gray-400">“{c.note}”</div>}
                </div>

                <div className="flex shrink-0 justify-end gap-3">
                  {isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy}
                        className="h-16 rounded-xl border-2 border-gray-500 px-5 text-xl font-semibold hover:bg-gray-800 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void solve(c)}
                        disabled={busy}
                        className="h-16 rounded-xl bg-emerald-600 px-5 text-xl font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {busy ? 'Saving…' : 'Yes, solved'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setConfirming(c.id); setRowErrors(prev => ({ ...prev, [c.id]: '' })) }}
                      aria-label={`Mark ${c.name} solved`}
                      className="h-16 rounded-xl border-2 border-emerald-500 px-6 text-xl font-semibold text-emerald-200 hover:bg-emerald-950"
                    >
                      ✓ Mark solved
                    </button>
                  )}
                </div>

                {rowErrors[c.id] && (
                  <div role="alert" className="basis-full text-lg font-semibold text-red-300">
                    ⚠ {rowErrors[c.id]}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Add a crisis ───────────────────────────────────────────────── */}
      <h3 className="mb-3 text-2xl font-semibold text-gray-300">Add a crisis</h3>
      <div className="flex flex-col gap-4 rounded-xl border-2 border-gray-700 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="crisis-card" className="text-xl text-gray-300">Card</label>
          <select
            id="crisis-card"
            value={cardId}
            onChange={e => { setCardId(e.target.value); setAddMsg(null) }}
            className="h-16 min-w-[32rem] rounded-lg border-2 border-gray-600 bg-gray-950 px-3 text-xl"
          >
            <option value="">Pick a card…</option>
            {crises.map(c => (
              <option key={c.id} value={c.id} disabled={c.onBoard}>
                {c.cardNumber !== null ? `#${c.cardNumber} ` : ''}{c.name} ({cardLengthText(c)}){c.onBoard ? ' — on the board' : ''}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-2 text-xl text-gray-300">Countries hit</legend>
          <div className="grid grid-cols-4 gap-3 xl:grid-cols-8">
            {countries.map(c => {
              const on = chosen.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(c.id)}
                  className={[
                    'h-20 rounded-xl border-2 px-2 text-left',
                    on ? 'border-red-400 bg-red-900 text-white' : 'border-gray-600 bg-gray-950 text-gray-300 hover:bg-gray-800',
                  ].join(' ')}
                >
                  <div className="text-2xl font-black">{on ? '✓ ' : ''}{c.letter}/{c.number}</div>
                  <div className="truncate text-base">{c.name}</div>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="crisis-note" className="text-xl text-gray-300">Note</label>
          <input
            id="crisis-note"
            type="text"
            value={note}
            maxLength={2000}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional"
            className="h-16 min-w-0 flex-1 rounded-lg border-2 border-gray-600 bg-gray-950 px-3 text-xl placeholder:text-gray-700 focus:outline-none focus:ring-4 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            role="status"
            className={`text-2xl ${addMsg?.tone === 'error' ? 'font-semibold text-red-300' : 'text-emerald-300'}`}
          >
            {addMsg
              ? `${addMsg.tone === 'error' ? '⚠ ' : '✓ '}${addMsg.text}`
              : card && !cardOk
                ? <span className="text-amber-300">⚠ {card.name} is already on the board. Pick another card.</span>
                : <span className="text-gray-500">
                    {!card ? 'Pick a card.' : chosen.length === 0 ? 'Pick the countries it hits.' : `${card.name} for ${chosenLetters}`}
                  </span>}
          </div>
          <button
            type="button"
            onClick={() => void addCrisis()}
            disabled={!cardOk || chosen.length === 0 || adding}
            className="h-20 w-64 rounded-2xl bg-red-700 text-3xl font-bold text-white hover:bg-red-600 disabled:opacity-40"
          >
            {adding ? 'Adding…' : 'Add crisis'}
          </button>
        </div>
      </div>
    </section>
  )
}
