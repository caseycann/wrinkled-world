import { tierFromTokens, TIER_DICE, type Tier, type Die } from '@/lib/rules'
import type { CountryState } from '@/lib/state'

// Tier badge text color: quality scale from gray (0) to emerald (4)
const TIER_TEXT: Record<Tier, string> = {
  0: 'text-gray-600',
  1: 'text-gray-400',
  2: 'text-yellow-400',
  3: 'text-lime-300',
  4: 'text-emerald-300',
}

export function CountryCard({ country }: { country: CountryState }) {
  const milTier  = tierFromTokens(country.military)
  const hlthTier = tierFromTokens(country.health)
  const eduTier  = tierFromTokens(country.education)
  const solTier  = tierFromTokens(country.standardOfLiving)

  const milDie  = TIER_DICE[milTier].military
  const hlthDie = TIER_DICE[hlthTier].health
  const eduDie  = TIER_DICE[eduTier].education

  const isExiled   = country.health === 0
  const healthWarn = country.health > 0 && country.health <= 3
  const moneyWarn  = country.federalReserve < 0

  const snap = country.prevSnapshot

  const border = isExiled
    ? 'border-2 border-red-600'
    : healthWarn
    ? 'border-2 border-orange-500'
    : 'border border-gray-700'

  const moneyStr =
    country.federalReserve < 0
      ? `−$${Math.abs(country.federalReserve)}B`
      : `$${country.federalReserve}B`

  const moneyDelta = snap != null ? country.federalReserve - snap.federalReserve : undefined

  return (
    <div className={`h-full bg-gray-800 rounded-xl p-3 flex flex-col gap-2 overflow-hidden ${border}`}>

      {/* Header: name + identifiers */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-bold leading-snug">{country.name}</div>
          <div className="text-xl text-gray-400">{country.letter}{country.number} · {country.council}</div>
        </div>
        {isExiled && (
          <span className="shrink-0 rounded-lg bg-red-600 px-3 py-1 text-xl font-black tracking-widest text-white">
            EXILED
          </span>
        )}
      </div>

      {/* Federal Reserve */}
      <div className="text-center">
        <div className={`text-6xl font-black tabular-nums leading-none ${moneyWarn ? 'text-red-400' : 'text-yellow-300'}`}>
          {moneyStr}
        </div>
        <div className="flex items-center justify-center gap-3 mt-1 h-7">
          {moneyDelta != null && moneyDelta !== 0 && (
            <span className={`text-xl font-semibold ${moneyDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {moneyDelta > 0 ? '+' : ''}${Math.abs(moneyDelta)}B
            </span>
          )}
          {moneyWarn && (
            <span className="text-xl font-semibold text-red-400">⚠ In debt</span>
          )}
        </div>
      </div>

      {/* Token section: two flex rows so height distributes from the flex-1 parent */}
      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <div className="flex flex-1 min-h-0 gap-1">
          <TokenCell
            label="Military" value={country.military} tier={milTier} die={milDie}
            numCls="text-red-400" lblCls="text-red-300"
            delta={snap != null ? country.military - snap.military : undefined}
          />
          <TokenCell
            label="Health" value={country.health} tier={hlthTier} die={hlthDie}
            numCls={isExiled ? 'text-red-500' : healthWarn ? 'text-orange-300' : 'text-white'}
            lblCls={isExiled ? 'text-red-400' : healthWarn ? 'text-orange-300' : 'text-gray-200'}
            warn={healthWarn}
            delta={snap != null ? country.health - snap.health : undefined}
          />
        </div>
        <div className="flex flex-1 min-h-0 gap-1">
          <TokenCell
            label="Education" value={country.education} tier={eduTier} die={eduDie}
            numCls="text-blue-400" lblCls="text-blue-300"
            delta={snap != null ? country.education - snap.education : undefined}
          />
          <TokenCell
            label="Std of Living" value={country.standardOfLiving} tier={solTier} die={null}
            numCls="text-green-400" lblCls="text-green-300"
            delta={snap != null ? country.standardOfLiving - snap.standardOfLiving : undefined}
          />
        </div>
      </div>
    </div>
  )
}

// ── Token cell ──────────────────────────────────────────────────────────────

function TokenCell({
  label, value, tier, die, numCls, lblCls, warn, delta,
}: {
  label: string
  value: number
  tier: Tier
  die: Die | null
  numCls: string
  lblCls: string
  warn?: boolean
  delta?: number
}) {
  const hasDelta = delta != null && delta !== 0

  return (
    <div className="flex flex-1 flex-col items-center overflow-hidden rounded-lg bg-gray-900/60 px-2 py-1 min-w-0">

      {/* Token count */}
      <span className={`text-5xl font-black tabular-nums leading-none ${numCls}`}>
        {value}
      </span>

      {/* Change since last round — invisible placeholder keeps height stable */}
      <span className={`text-lg font-bold leading-none ${
        hasDelta
          ? delta! > 0 ? 'text-emerald-400' : 'text-red-400'
          : 'invisible'
      }`}>
        {hasDelta ? `${delta! > 0 ? '+' : ''}${delta}` : '+0'}
      </span>

      {/* Category label */}
      <span className={`text-2xl font-semibold leading-tight text-center ${lblCls}`}>
        {label}
      </span>

      {/* Tier badge + Die badge */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={`rounded px-2 py-0.5 text-sm font-bold bg-gray-800 ${TIER_TEXT[tier]}`}>
          T{tier}
        </span>
        {die != null && die !== 'none' ? (
          <span className={`rounded px-2 py-0.5 text-sm font-mono font-bold bg-gray-800 border border-current ${lblCls}`}>
            {die}
          </span>
        ) : (
          <span className="text-sm text-gray-700 px-2 py-0.5">—</span>
        )}
      </div>

      {/* Health warning */}
      {warn && <span className="text-xl font-bold text-orange-400 mt-0.5">⚠ Low</span>}
    </div>
  )
}
