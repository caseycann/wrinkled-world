// Browser-only chime made with Web Audio (no audio file, no dependency).
// Browsers block sound until the page has been clicked or tapped, so call
// enableChime() from a click handler (the stage button does this on any tap).

let ctx: AudioContext | null = null

export function enableChime(): void {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // No Web Audio support: the button still pulses at 0.
  }
}

export function chimeReady(): boolean {
  return ctx?.state === 'running'
}

// Three rising bell tones, loud enough for a classroom.
export function playChime(): void {
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime + 0.05
  const notes = [659.25, 830.61, 987.77] // E5, G#5, B5
  notes.forEach((freq, i) => {
    const t = start + i * 0.35
    for (const [mult, gain] of [[1, 0.5], [2, 0.12]] as const) {
      const osc = ctx!.createOscillator()
      const amp = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq * mult
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.02)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      osc.connect(amp).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 1.7)
    }
  })
}
