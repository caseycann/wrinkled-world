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
    'h-20 w-24 border border-ww-line bg-ww-cell font-mono text-4xl font-semibold hover:bg-ww-line-soft active:bg-ww-line'

  return (
    <Overlay>
      <div className="text-[28px] font-semibold uppercase tracking-[0.14em]">Teacher PIN</div>
      <div className="mt-4 flex h-12 items-center gap-3" aria-label={`${pin.length} digits entered`}>
        {pin.length === 0 ? (
          <span className="text-2xl text-ww-soft">Enter PIN</span>
        ) : (
          Array.from(pin).map((_, i) => (
            <span key={i} className="h-4 w-4 bg-ww-amber" />
          ))
        )}
      </div>
      <div className="h-8 text-2xl font-semibold text-ww-alert" role="alert">
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
          className={`${keyCls} !font-sans !text-xl`}
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
            className="h-16 w-40 border border-ww-line text-2xl font-semibold hover:bg-ww-cell"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!pin || checking}
          className="h-16 w-40 bg-ww-amber text-2xl font-semibold text-ww-bg hover:bg-ww-amber-hover disabled:opacity-50"
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
      <div className="flex flex-col items-center border border-t-4 border-ww-line border-t-ww-amber bg-ww-panel px-16 py-12 text-ww-text">
        {children}
      </div>
    </div>
  )
}
