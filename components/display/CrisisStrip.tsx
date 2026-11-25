'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { CountryState, CrisisState } from '@/lib/state'
import { crisisDuration, hitLetters } from '@/components/shared/crisisText'

// The crises strip along the bottom of the display. Shows only crises on the
// board. Badges never wrap or get cut off: any that don't fit are hidden and
// counted in a "+N more" badge, so the display never scrolls.
export function CrisisStrip({
  crises,
  countries,
}: {
  crises: CrisisState[]
  countries: CountryState[]
}) {
  const onBoard = crises.filter(c => c.onBoard)
  const rowRef = useRef<HTMLDivElement>(null)
  const [fitCount, setFitCount] = useState(onBoard.length)

  // Count how many badges fit fully inside the row. Re-measured when the row
  // resizes (including when the "+N more" badge appears and takes space).
  const key = onBoard.map(c => `${c.id}:${c.roundsLeft ?? ''}:${c.runningFor ?? ''}:${c.countriesHit.join()}`).join('|')
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = () => {
      const limit = row.clientWidth
      let n = 0
      for (const child of Array.from(row.children) as HTMLElement[]) {
        if (child.offsetLeft + child.offsetWidth > limit) break
        n += 1
      }
      setFitCount(n)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
  }, [key])

  const hidden = onBoard.length - fitCount

  return (
    <div className="flex h-20 shrink-0 items-center gap-4 overflow-hidden border-t border-gray-700 bg-gray-900 px-6">
      {onBoard.length === 0 ? (
        <span className="text-2xl text-gray-400">No crises right now</span>
      ) : (
        <>
          <span className="shrink-0 text-2xl font-bold text-red-300">⚠ Crises:</span>
          <div ref={rowRef} className="relative flex min-w-0 flex-1 gap-3 overflow-hidden">
            {onBoard.map((c, i) => (
              <div
                key={c.id}
                aria-hidden={i >= fitCount}
                className={[
                  'shrink-0 whitespace-nowrap rounded-lg border-2 border-red-500 bg-red-950 px-4 py-1 text-2xl',
                  i >= fitCount ? 'invisible' : '',
                ].join(' ')}
              >
                <span className="font-bold text-white">{c.name}</span>
                <span className="ml-3 font-semibold text-red-200">{hitLetters(c, countries)}</span>
                <span className="ml-3 text-red-200">· {crisisDuration(c)}</span>
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <span className="shrink-0 whitespace-nowrap rounded-lg border-2 border-gray-500 px-4 py-1 text-2xl font-semibold text-gray-200">
              +{hidden} more
            </span>
          )}
        </>
      )}
    </div>
  )
}
