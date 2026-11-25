import type { CountryState, CrisisState } from '@/lib/state'

function rounds(n: number): string {
  return `${n} round${n === 1 ? '' : 's'}`
}

// "2 rounds left" for a fixed-length crisis, "for 3 rounds" for an until-solved one.
export function crisisDuration(c: CrisisState): string {
  return c.lengthType === 'Fixed rounds'
    ? `${rounds(c.roundsLeft ?? 0)} left`
    : `for ${rounds(c.runningFor ?? 1)}`
}

// "2 rounds" or "until solved", for picking a card.
export function cardLengthText(c: CrisisState): string {
  return c.totalRounds !== undefined ? rounds(c.totalRounds) : 'until solved'
}

// "A, B" from the Countries Hit record IDs.
export function hitLetters(c: CrisisState, countries: CountryState[]): string {
  return c.countriesHit
    .map(id => countries.find(k => k.id === id)?.letter ?? '?')
    .join(', ')
}
