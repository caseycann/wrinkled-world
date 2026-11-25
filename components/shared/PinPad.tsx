'use client'

import { useCallback, useEffect, useState } from 'react'

// Teacher PIN entry. POSTs to /api/auth, which sets the httpOnly session cookie.
export function PinPad({
  onUnlocked,
  onCancel,
}: {
  onUnlocked: () => void | Promise<void>
  onCancel?: () => void   // omit to hide the Cancel button
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = useCallback(async () => {
    if (!pin || checking) return
    setChecking(true)
    setError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (res.ok) {
        await onUnlocked()
        return
      }
      setError(res.status === 401 ? 'Wrong PIN' : 'Could not check PIN')
      setPin('')
    } catch {
      setError('No connection')
    } finally {
      setChecking(false)
    }
  }, [pin, checking, onUnlocked])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin(p => (p.length < 12 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
      else if (e.key === 'Enter') void submit()
      else if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit, onCancel])

  const keyCls =
    'h-20 w-24 rounded-xl bg-gray-800 text-4xl font-bold hover:bg-gray-700 active:bg-gray-600'

  return (
    <Overlay>
      <div className="text-4xl font-bold">Teacher PIN</div>
      <div className="mt-4 flex h-12 items-center gap-3" aria-label={`${pin.length} digits entered`}>
        {pin.length === 0 ? (
          <span className="text-2xl text-gray-500">Enter PIN</span>
        ) : (
          Array.from(pin).map((_, i) => (
            <span key={i} className="h-5 w-5 rounded-full bg-white" />
          ))
        )}
      </div>
      <div className="h-8 text-2xl font-semibold text-red-400" role="alert">
        {error}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" className={keyCls} onClick={() => setPin(p => p + d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className={`${keyCls} text-2xl`}
          onClick={() => setPin('')}
        >
          Clear
        </button>
        <button type="button" className={keyCls} onClick={() => setPin(p => p + '0')}>
          0
        </button>
        <button
          type="button"
          className={keyCls}
          aria-label="Delete last digit"
          onClick={() => setPin(p => p.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
      <div className="mt-6 flex gap-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-16 w-40 rounded-xl border-2 border-gray-500 text-2xl font-semibold hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!pin || checking}
          className="h-16 w-40 rounded-xl bg-sky-600 text-2xl font-bold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Unlock
        </button>
      </div>
    </Overlay>
  )
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <div className="flex flex-col items-center rounded-3xl border border-gray-600 bg-gray-900 px-16 py-12 text-white">
        {children}
      </div>
    </div>
  )
}
