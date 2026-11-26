import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StageControls } from '@/components/teacher/StageControls'
import type { StageState } from '@/lib/state'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const stage = (round: number, name: StageState['stage'], minutes = 10): StageState => ({
  id: 'recStageNow', round, stage: name, startedAt: new Date().toISOString(), minutes, room: 'CDL',
})

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

function render(props: Partial<Parameters<typeof StageControls>[0]> & { stage: StageState | null }) {
  const onChanged = vi.fn()
  const onUnauthorized = vi.fn()
  act(() => {
    root.render(<StageControls clockOffsetMs={0} onChanged={onChanged} onUnauthorized={onUnauthorized} {...props} />)
  })
  return { onChanged, onUnauthorized }
}

function button(text: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find(x => x.textContent === text)
  if (!b) throw new Error(`No button "${text}". Buttons: ${Array.from(container.querySelectorAll('button')).map(x => x.textContent).join(', ')}`)
  return b
}

async function click(text: string) {
  await act(async () => { button(text).click() })
}

const sentBody = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body as string)

describe('StageControls', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('starts the game when there is no stage yet', async () => {
    const { onChanged } = render({ stage: null })
    await click('Start game')
    expect(fetchMock).toHaveBeenCalledWith('/api/stage', expect.objectContaining({ method: 'POST' }))
    expect(sentBody()).toEqual({ action: 'start' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('moves to the next stage within a round in one tap, sending the current stage as expect', async () => {
    render({ stage: stage(2, 'Plan') })
    await click('Next: Negotiate')
    expect(sentBody()).toEqual({ action: 'advance', expect: 'recStageNow' })
  })

  it('asks before starting a new round, and Cancel sends nothing', async () => {
    render({ stage: stage(2, 'Consequences') })
    await click('Start Round 3')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Start Round 3?')
    await click('Cancel')
    expect(fetchMock).not.toHaveBeenCalled()
    await click('Start Round 3')
    await click('Yes, start Round 3')
    expect(sentBody()).toEqual({ action: 'advance', expect: 'recStageNow' })
  })

  it('asks before Session 0 → Round 1 too', async () => {
    render({ stage: stage(0, 'Session 0', 0) })
    await click('Start Round 1')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Start Round 1?')
  })

  it('undoes the current stage, but offers no Undo in Session 0', async () => {
    render({ stage: stage(2, 'Plan') })
    await click('Undo')
    expect(sentBody()).toEqual({ action: 'undo', expect: 'recStageNow' })

    render({ stage: stage(0, 'Session 0', 0) })
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === 'Undo')).toBe(false)
  })

  it('locks the console when the PIN session has expired', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    const { onUnauthorized } = render({ stage: stage(2, 'Plan') })
    await click('Next: Negotiate')
    expect(onUnauthorized).toHaveBeenCalled()
    expect(container.textContent).toContain('Enter the PIN')
  })

  it('shows the server message when the stage changed elsewhere', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'The stage changed. Showing the latest.' }), { status: 409 }))
    const { onChanged } = render({ stage: stage(2, 'Plan') })
    await click('Next: Negotiate')
    expect(container.textContent).toContain('The stage changed')
    expect(onChanged).toHaveBeenCalled()
  })
})
