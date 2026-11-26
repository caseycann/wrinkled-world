'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Live view of the dice tower camera. Video stays on this computer: it is only
// shown in a <video> element. Nothing is recorded, uploaded or stored, and no
// frames are captured. The chosen camera is remembered per computer.

export const CAMERA_STORAGE_KEY = 'wrinkled-world:dice-cam-device'

export function loadCameraId(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(CAMERA_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveCameraId(id: string): void {
  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, id)
  } catch {
    // Private window or blocked storage: the camera still works, it just isn't remembered.
  }
}

export type CamProblem = 'unsupported' | 'denied' | 'no-camera' | 'busy' | 'error'

// Maps a getUserMedia error to what the room needs to know.
export function camProblemOf(err: unknown): CamProblem {
  const name = err instanceof Error || err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'no-camera'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'error'
  }
}

export const CAM_MESSAGES: Record<CamProblem, { title: string; help: string }> = {
  unsupported: {
    title: 'This browser can’t show a camera',
    help: 'Open this page in Chrome, Edge or Safari.',
  },
  denied: {
    title: 'Camera is blocked',
    help: 'Click the camera icon in the address bar, choose Allow, then click Try again.',
  },
  'no-camera': {
    title: 'No camera found',
    help: 'Plug in the dice camera, then click Try again.',
  },
  busy: {
    title: 'Camera is busy',
    help: 'Close any other app using the camera, then click Try again.',
  },
  error: {
    title: 'Camera didn’t start',
    help: 'Click Try again.',
  },
}

type Status = { kind: 'starting' } | { kind: 'live' } | { kind: 'problem'; problem: CamProblem }

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop())
}

function openCamera(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : { width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  })
}

export function DiceCam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [wantedId, setWantedId] = useState<string | null>(() => loadCameraId())
  const [activeId, setActiveId] = useState<string>('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const [enlarged, setEnlarged] = useState(false)
  const [picking, setPicking] = useState(false)
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])

  const listCameras = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setCameras(all.filter(d => d.kind === 'videoinput' && d.deviceId))
    } catch {
      setCameras([])
    }
  }, [])

  // Start (or restart) the camera when the chosen camera changes or on Try again.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus({ kind: 'problem', problem: 'unsupported' })
      return
    }
    let cancelled = false
    const video = videoRef.current
    setStatus({ kind: 'starting' })

    async function start() {
      let stream: MediaStream
      try {
        stream = await openCamera(wantedId)
      } catch (err) {
        // The remembered camera is gone: fall back to any camera.
        if (wantedId && camProblemOf(err) === 'no-camera') {
          try {
            stream = await openCamera(null)
          } catch (err2) {
            if (!cancelled) setStatus({ kind: 'problem', problem: camProblemOf(err2) })
            return
          }
        } else {
          if (!cancelled) setStatus({ kind: 'problem', problem: camProblemOf(err) })
          return
        }
      }
      if (cancelled) {
        stopStream(stream)
        return
      }
      streamRef.current = stream
      if (video) video.srcObject = stream
      const track = stream.getVideoTracks()[0]
      setActiveId(track?.getSettings().deviceId ?? '')
      // Camera unplugged while showing.
      track?.addEventListener('ended', () => {
        if (!cancelled) setStatus({ kind: 'problem', problem: 'no-camera' })
      })
      setStatus({ kind: 'live' })
      void listCameras()   // labels are only available once permission is granted
    }

    void start()
    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
      if (video) video.srcObject = null
    }
  }, [wantedId, attempt, listCameras])

  // When a camera is plugged in or out, refresh the list; retry if there was none.
  useEffect(() => {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!md?.addEventListener) return
    const onChange = () => {
      void listCameras()
      const s = statusRef.current
      if (s.kind === 'problem' && s.problem === 'no-camera') setAttempt(a => a + 1)
    }
    md.addEventListener('devicechange', onChange)
    return () => md.removeEventListener('devicechange', onChange)
  }, [listCameras])

  // Escape closes the full-screen view.
  useEffect(() => {
    if (!enlarged) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEnlarged(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enlarged])

  const live = status.kind === 'live'
  const problem = status.kind === 'problem' ? CAM_MESSAGES[status.problem] : null

  function pick(id: string) {
    saveCameraId(id)
    setWantedId(id)
    setPicking(false)
  }

  return (
    <div
      className={
        enlarged
          ? 'fixed inset-0 z-50 flex items-center justify-center bg-black'
          : 'relative aspect-video w-full overflow-hidden border border-ww-line bg-black'
      }
    >
      {/* The one video element. Moving between small and full screen keeps the same stream. */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Dice tower camera"
        onClick={() => live && setEnlarged(e => !e)}
        className={[
          'h-full w-full object-contain',
          live ? 'cursor-zoom-in' : 'invisible',
          enlarged ? 'cursor-zoom-out' : '',
        ].join(' ')}
      />

      {/* Label */}
      <div className="pointer-events-none absolute left-3 top-2.5 bg-black/70 px-2.5 py-0.5 font-mono text-[20px] uppercase tracking-[0.1em] text-ww-amber">
        Dice cam
        {enlarged && <span className="ml-4 normal-case tracking-normal text-ww-soft">Click to close</span>}
      </div>

      {/* Camera picker (setup, per computer) */}
      {live && !enlarged && (
        <button
          type="button"
          onClick={() => setPicking(p => !p)}
          aria-label="Choose camera"
          aria-expanded={picking}
          className="absolute right-2 top-2 h-11 bg-black/70 px-3 font-mono text-[18px] uppercase tracking-wider text-ww-soft hover:bg-black hover:text-ww-text"
        >
          Camera
        </button>
      )}
      {picking && !enlarged && (
        <div className="absolute inset-x-2 bottom-2 border border-ww-line bg-ww-panel/95 p-2">
          <label htmlFor="dice-cam-picker" className="mb-1 block text-[18px] text-ww-soft">Camera</label>
          <select
            id="dice-cam-picker"
            value={activeId}
            onChange={e => pick(e.target.value)}
            className="h-12 w-full border border-ww-line bg-ww-cell px-2 text-[20px] text-ww-text"
          >
            {cameras.length === 0 && <option value="">No cameras found</option>}
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Starting / problem messages */}
      {status.kind === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[22px] text-ww-soft">
          Starting camera…
        </div>
      )}
      {problem && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 pt-10 text-center">
          <div className="text-[28px] font-semibold text-ww-amber">{problem.title}</div>
          <div className="text-[20px] text-ww-soft">{problem.help}</div>
          {status.kind === 'problem' && status.problem !== 'unsupported' && (
            <button
              type="button"
              onClick={() => setAttempt(a => a + 1)}
              className="mt-1 h-12 border border-ww-line px-6 text-[20px] font-semibold text-ww-text hover:bg-ww-cell"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
