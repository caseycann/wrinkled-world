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
      <h2 id="crises-heading" className="mb-4 text-2xl font-semibold uppercase tracking-[0.12em] text-ww-soft">Crises</h2>

      {/* ── On the board ───────────────────────────────────────────────── */}
      <h3 className="mb-3 text-xl font-semibold">On the board</h3>
      {onBoard.length === 0 ? (
        <p className="mb-8 text-xl text-ww-soft">No crises on the board.</p>
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
                className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-l-4 border-ww-line border-l-ww-alert bg-ww-panel px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-semibold">
                    {c.cardNumber !== null && <span className="font-mono text-ww-soft">#{c.cardNumber} </span>}
                    {c.name}
                  </div>
                  <div className="text-xl text-ww-soft">
                    {hit} <span className="mx-2">·</span> {crisisDuration(c)}
                    <span className="mx-2">·</span> started Round {c.startedRound}
                  </div>
                  {c.note && <div className="text-lg text-ww-soft">“{c.note}”</div>}
                </div>

                <div className="flex shrink-0 justify-end gap-3">
                  {isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy}
                        className="h-16 border border-ww-line px-5 text-xl font-semibold hover:bg-ww-cell disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void solve(c)}
                        disabled={busy}
                        className="h-16 bg-ww-amber px-5 text-xl font-semibold text-ww-bg hover:bg-ww-amber-hover disabled:opacity-40"
                      >
                        {busy ? 'Saving…' : 'Yes, solved'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setConfirming(c.id); setRowErrors(prev => ({ ...prev, [c.id]: '' })) }}
                      aria-label={`Mark ${c.name} solved`}
                      className="h-16 border border-ww-line px-6 text-xl font-semibold hover:bg-ww-cell"
                    >
                      Mark solved
                    </button>
                  )}
                </div>

                {rowErrors[c.id] && (
                  <div role="alert" className="basis-full text-lg font-semibold text-ww-alert">
                    {rowErrors[c.id]}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Add a crisis ───────────────────────────────────────────────── */}
      <h3 className="mb-3 text-xl font-semibold">Add a crisis</h3>
      <div className="flex flex-col gap-4 border border-ww-line bg-ww-panel p-5">
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="crisis-card" className="text-xl text-ww-soft">Card</label>
          <select
            id="crisis-card"
            value={cardId}
            onChange={e => { setCardId(e.target.value); setAddMsg(null) }}
            className="h-16 min-w-[32rem] border border-ww-line bg-ww-cell px-3 text-xl"
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
          <legend className="mb-2 text-xl text-ww-soft">Countries hit</legend>
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
                    'h-20 border px-3 text-left',
                    on ? 'border-2 border-ww-amber bg-ww-cell text-ww-text' : 'border-ww-line bg-ww-bg text-ww-soft hover:bg-ww-cell',
                  ].join(' ')}
                >
                  <div className="font-mono text-2xl font-semibold"><span className={on ? 'text-ww-amber' : ''}>{c.letter}</span>{on ? ' ✓' : ''}</div>
                  <div className="truncate text-base">{c.name}</div>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="crisis-note" className="text-xl text-ww-soft">Note</label>
          <input
            id="crisis-note"
            type="text"
            value={note}
            maxLength={2000}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional"
            className="h-16 min-w-0 flex-1 border border-ww-line bg-ww-cell px-3 text-xl placeholder:text-ww-soft"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            role="status"
            className={`text-2xl ${addMsg?.tone === 'error' ? 'font-semibold text-ww-alert' : 'text-ww-ok'}`}
          >
            {addMsg
              ? addMsg.text
              : card && !cardOk
                ? <span className="text-ww-amber">{card.name} is already on the board. Pick another card.</span>
                : <span className="text-ww-soft">
                    {!card ? 'Pick a card.' : chosen.length === 0 ? 'Pick the countries it hits.' : `${card.name} for ${chosenLetters}`}
                  </span>}
          </div>
          <button
            type="button"
            onClick={() => void addCrisis()}
            disabled={!cardOk || chosen.length === 0 || adding}
            className="h-20 w-64 bg-ww-amber text-3xl font-semibold text-ww-bg hover:bg-ww-amber-hover disabled:opacity-40"
          >
            {adding ? 'Adding…' : 'Add crisis'}
          </button>
        </div>
      </div>
    </section>
  )
}
