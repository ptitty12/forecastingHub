import { fmtCompact, fmtFull } from '../lib/format'
import { InfoTip } from './InfoTip'

interface Props {
  label: string
  value: number
  tone?: 'default' | 'brand' | 'signed'
  /** Plain-language explanation shown behind a "?" next to the label. */
  help?: string
}

export function StatTile({ label, value, tone = 'default', help }: Props) {
  const valueClass =
    tone === 'brand'
      ? 'text-brandink'
      : tone === 'signed'
        ? value < 0
          ? 'text-neg'
          : value > 0
            ? 'text-pos'
            : 'text-ink'
        : 'text-ink'
  const signed = tone === 'signed' && value > 0 ? '+' : ''
  return (
    <div className="min-w-40 flex-1 rounded-xl border border-hairline bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        {help && (
          <InfoTip title={label}>{help}</InfoTip>
        )}
      </div>
      {/* Compact on the tile, exact on hover — sellers check the exact figure. */}
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`} title={fmtFull(value)}>
        {signed}
        {fmtCompact(value)}
      </div>
    </div>
  )
}
