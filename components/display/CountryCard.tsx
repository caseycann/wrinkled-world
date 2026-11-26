import { tierFromTokens, TIER_DICE, type Die, type Tier } from '@/lib/rules'
import type { CountryState } from '@/lib/state'

// One country on the projector. Primary information (letter, name, money,
// token counts) is sized for the back of the room. Secondary information
// (category labels, dice, tiers) is smaller: students also have it on their
// handout sheets.

type TokenKey = 'military' | 'health' | 'education' | 'standardOfLiving'

// Color is never the only signal: every square also has its label and a swatch.
const TOKENS: { key: TokenKey; label: string; num: string; lbl: string; sw: string }[] = [
  { key: 'military',         label: 'Military',      num: 'text-ww-mil', lbl: 'text-ww-mil-lt', sw: 'bg-ww-mil' },
  { key: 'health',           label: 'Health',        num: 'text-ww-hea', lbl: 'text-ww-hea-lt', sw: 'bg-ww-hea ring-[1.5px] ring-ww-hea-outline' },
  { key: 'education',        label: 'Education',     num: 'text-ww-edu', lbl: 'text-ww-edu-lt', sw: 'bg-ww-edu' },
  { key: 'standardOfLiving', label: 'Std of Living', num: 'text-ww-sol', lbl: 'text-ww-sol-lt', sw: 'bg-ww-sol' },
]

function dieFor(key: TokenKey, tier: Tier): string | null {
  if (key === 'standardOfLiving') return null
  const die: Die = TIER_DICE[tier][key]
  if (die !== 'none') return die
  return key === 'health' ? 'Exiled' : null
}

export function CountryCard({ country }: { country: CountryState }) {
  const exiled = country.health === 0
  const lowHealth = country.health <= 3        // includes Exiled
  const loan = country.federalReserve < 0
  // Card tag: short words only, so it fits beside the money. Low health is
  // marked inside the Health square instead ("Health · Low", red outline).
  const flag = exiled ? 'Exiled' : loan ? 'Loan' : null
  const warn = exiled || loan || lowHealth

  const money = `${loan ? '−' : ''}$${Math.abs(country.federalReserve)}B`
  // Long amounts step down so money and tag share one line (never below 48px).
  const moneySize = money.length <= 4 ? 'text-[68px]' : money.length === 5 ? 'text-[60px]' : 'text-[52px]'

  return (
    <div
      className={[
        'flex h-full min-h-0 flex-col overflow-hidden border bg-ww-panel',
        warn ? 'border-ww-alert' : 'border-ww-line',
      ].join(' ')}
    >
      {/* Letter and name */}
      <div className="flex min-w-0 items-center gap-3.5 border-b border-ww-line px-4 py-3">
        <span className="shrink-0 font-mono text-[30px] font-semibold leading-none text-ww-amber">
          {country.letter}
        </span>
        <span className="min-w-0 flex-1 truncate text-[30px] font-semibold leading-tight">
          {country.name}
        </span>
      </div>

      {/* Money, plus the warning tag (on this line so it never squeezes the name) */}
      <div className="flex h-[96px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4">
        <span
          className={`font-mono ${moneySize} font-semibold leading-none tabular-nums ${loan ? 'text-ww-alert' : ''}`}
          aria-label={`Money ${money}`}
        >
          {money}
        </span>
        {flag && (
          <span className="shrink-0 whitespace-nowrap border-[1.5px] border-ww-alert px-2.5 py-0.5 text-[20px] font-semibold uppercase tracking-wider text-ww-alert">
            {flag}
          </span>
        )}
      </div>

      {/* Tokens, 2 × 2 */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5 border-t border-ww-line p-1.5">
        {TOKENS.map(t => {
          const value = country[t.key]
          const tier = tierFromTokens(value)
          const die = dieFor(t.key, tier)
          const low = t.key === 'health' && lowHealth
          return (
            <div
              key={t.key}
              className={[
                'grid min-h-0 min-w-0 grid-cols-[1fr_auto] grid-rows-[auto_1fr] bg-ww-cell px-3 py-2.5',
                low ? 'ring-[3px] ring-inset ring-ww-alert' : '',
              ].join(' ')}
            >
              <span className={`col-span-2 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[19px] font-semibold ${low ? 'text-ww-alert' : t.lbl}`}>
                <span aria-hidden className={`h-3.5 w-3.5 shrink-0 ${t.sw}`} />
                {t.label}{low && !exiled && ' · Low'}
              </span>
              <span
                className={`self-end font-mono text-[56px] font-semibold leading-none tabular-nums ${low ? 'text-ww-alert' : t.num}`}
              >
                {value}
              </span>
              <span className={`self-end text-right font-mono leading-tight ${t.lbl}`}>
                {die && <span className="block text-[20px] font-semibold">{die}</span>}
                <span className="block text-[17px] opacity-75">T{tier}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
