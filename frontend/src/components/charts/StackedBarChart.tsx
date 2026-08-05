import { useMemo, useState } from 'react'
import { fmtCompact } from '../../lib/format'
import { CHROME, seriesColor, useDarkMode } from '../../lib/palette'

export interface BarSeries {
  name: string
  values: number[] // one per label
}

interface Props {
  labels: string[]
  series: BarSeries[] // ≤8; callers fold the tail into "Other"
  height?: number
  title?: string
}

const PAD = { top: 12, right: 16, bottom: 26, left: 52 }

export function StackedBarChart({ labels, series, height = 260, title }: Props) {
  const dark = useDarkMode()
  const chrome = dark ? CHROME.dark : CHROME.light
  const width = 720
  const [hover, setHover] = useState<{ li: number; si: number } | null>(null)

  const totals = useMemo(
    () => labels.map((_, li) => series.reduce((acc, s) => acc + (s.values[li] || 0), 0)),
    [labels, series],
  )
  const maxY = Math.max(1, ...totals) * 1.08
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const band = innerW / labels.length
  const barW = Math.min(64, band * 0.55)
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH

  const ticks = useMemo(() => Array.from({ length: 5 }, (_, i) => (maxY / 4) * i), [maxY])

  return (
    <div className="relative">
      {title && <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={title ?? 'Stacked bar chart'} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={chrome.grid} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={chrome.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke={chrome.axis} strokeWidth={1} />

        {labels.map((lb, li) => {
          const cx = PAD.left + band * li + band / 2
          let acc = 0
          return (
            <g key={lb}>
              {series.map((s, si) => {
                const v = s.values[li] || 0
                if (v <= 0) return null
                const y1 = y(acc + v)
                const h = y(acc) - y(acc + v)
                acc += v
                const isTop = acc >= totals[li] - 0.001
                return (
                  <rect
                    key={s.name}
                    x={cx - barW / 2}
                    y={y1}
                    width={barW}
                    height={Math.max(0.5, h)}
                    rx={isTop ? 3 : 0}
                    fill={seriesColor(si, dark)}
                    stroke={chrome.surface}
                    strokeWidth={1}
                    opacity={hover && !(hover.li === li && hover.si === si) ? 0.75 : 1}
                    onMouseEnter={() => setHover({ li, si })}
                  />
                )
              })}
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill={chrome.muted}>
                {lb}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, si) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: seriesColor(si, dark) }} />
            {s.name}
          </span>
        ))}
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((PAD.left + band * hover.li + band / 2) / width) * 100}%`,
            transform:
              PAD.left + band * hover.li + band / 2 > width * 0.7
                ? 'translateX(calc(-100% - 12px))'
                : 'translateX(12px)',
          }}
        >
          <div className="font-semibold text-ink">{labels[hover.li]}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-ink2">
            <span className="inline-block size-2 rounded-sm" style={{ background: seriesColor(hover.si, dark) }} />
            {series[hover.si].name}:{' '}
            <span className="tnum font-medium text-ink">{fmtCompact(series[hover.si].values[hover.li] || 0)}</span>
          </div>
          <div className="mt-0.5 text-muted">
            Total: <span className="tnum">{fmtCompact(totals[hover.li])}</span>
          </div>
        </div>
      )}
    </div>
  )
}
