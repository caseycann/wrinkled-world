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
    <div className="flex h-[76px] shrink-0 items-center gap-4 overflow-hidden border-t border-ww-line bg-ww-panel px-6">
      {onBoard.length === 0 ? (
        <span className="font-mono text-[22px] uppercase tracking-[0.12em] text-ww-soft">No active crises</span>
      ) : (
        <>
          <span className="shrink-0 font-mono text-[22px] uppercase tracking-[0.12em] text-ww-alert">Active crises</span>
          <div ref={rowRef} className="relative flex min-w-0 flex-1 gap-3 overflow-hidden">
            {onBoard.map((c, i) => (
              <div
                key={c.id}
                aria-hidden={i >= fitCount}
                className={[
                  'flex shrink-0 items-baseline gap-3.5 whitespace-nowrap border border-l-4 border-ww-line border-l-ww-alert bg-ww-bg px-4 py-1.5 text-[26px]',
                  i >= fitCount ? 'invisible' : '',
                ].join(' ')}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="font-mono text-ww-soft">
                  {hitLetters(c, countries)} · {crisisDuration(c)}
                </span>
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <span className="shrink-0 whitespace-nowrap border border-ww-line px-4 py-1.5 font-mono text-[24px] text-ww-soft">
              +{hidden} more
            </span>
          )}
        </>
      )}
    </div>
  )
}
