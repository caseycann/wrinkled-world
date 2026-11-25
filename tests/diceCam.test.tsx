import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  CAMERA_STORAGE_KEY,
  DiceCam,
  camProblemOf,
  loadCameraId,
  saveCameraId,
} from '@/components/display/DiceCam'

// Tell React this is a test environment that supports act().
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const err = (name: string) => new DOMException('x', name)

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('camProblemOf', () => {
  it('maps browser errors to plain problems', () => {
    expect(camProblemOf(err('NotAllowedError'))).toBe('denied')
    expect(camProblemOf(err('SecurityError'))).toBe('denied')
    expect(camProblemOf(err('NotFoundError'))).toBe('no-camera')
    expect(camProblemOf(err('OverconstrainedError'))).toBe('no-camera')
    expect(camProblemOf(err('NotReadableError'))).toBe('busy')
    expect(camProblemOf(new Error('weird'))).toBe('error')
    expect(camProblemOf('not an error')).toBe('error')
  })
})

describe('camera choice storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('remembers the chosen camera', () => {
    saveCameraId('cam-2')
    expect(window.localStorage.getItem(CAMERA_STORAGE_KEY)).toBe('cam-2')
    expect(loadCameraId()).toBe('cam-2')
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveCameraId('cam-2')).not.toThrow()
    expect(loadCameraId()).toBeNull()
  })
})

// ── Component ─────────────────────────────────────────────────────────────────

function fakeStream(deviceId: string) {
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    addEventListener: vi.fn(),
  }
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  }
}

let container: HTMLDivElement
let root: Root

function mockMediaDevices(getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>) {
  const md = {
    getUserMedia: vi.fn(getUserMedia),
    enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Dice tower' },
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Laptop camera' },
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true })
  return md
}

async function render() {
  await act(async () => { root.render(<DiceCam />) })
  await act(async () => { await Promise.resolve() })
}

describe('DiceCam', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.localStorage.clear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
  })

  it('shows a clear message when permission is denied', async () => {
    mockMediaDevices(async () => { throw err('NotAllowedError') })
    await render()
    expect(container.textContent).toContain('Camera is blocked')
    expect(container.textContent).toContain('Try again')
  })

  it('shows a clear message when there is no camera', async () => {
    mockMediaDevices(async () => { throw err('NotFoundError') })
    await render()
    expect(container.textContent).toContain('No camera found')
  })

  it('shows a message when the browser has no camera support', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    await render()
    expect(container.textContent).toContain('can’t show a camera')
  })

  it('asks for video only, never audio', async () => {
    const md = mockMediaDevices(async () => fakeStream('cam-1').stream)
    await render()
    expect(md.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('uses the remembered camera', async () => {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, 'cam-2')
    const md = mockMediaDevices(async () => fakeStream('cam-2').stream)
    await render()
    expect(md.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { deviceId: { exact: 'cam-2' } } }),
    )
  })

  it('falls back to any camera when the remembered one is gone', async () => {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, 'gone')
    const md = mockMediaDevices(async c => {
      const v = c.video as MediaTrackConstraints
      if (v.deviceId) throw err('OverconstrainedError')
      return fakeStream('cam-1').stream
    })
    await render()
    expect(md.getUserMedia).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('stops the camera when the page closes', async () => {
    const { stream, track } = fakeStream('cam-1')
    mockMediaDevices(async () => stream)
    await render()
    act(() => root.unmount())
    expect(track.stop).toHaveBeenCalled()
    root = createRoot(container)   // afterEach unmounts again
  })

  it('enlarges on click and closes with Escape', async () => {
    mockMediaDevices(async () => fakeStream('cam-1').stream)
    await render()
    const video = container.querySelector('video')!
    act(() => video.click())
    expect(container.firstElementChild!.className).toContain('fixed inset-0')
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(container.firstElementChild!.className).not.toContain('fixed inset-0')
  })
})
