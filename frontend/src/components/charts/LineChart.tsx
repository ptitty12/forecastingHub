import { useMemo, useRef, useState } from 'react'
import { fmtCompact } from '../../lib/format'
import { CHROME, seriesColor, useDarkMode } from '../../lib/palette'
import { InfoTip } from '../InfoTip'

export interface LineSeries {
  name: string
  values: (number | null)[]
}

interface Props {
  labels: string[]
  series: LineSeries[] // color = slot order, fixed
  height?: number
  title?: string
  /** Plain-language explanation shown behind a "?" next to the title. */
  help?: string
}

const PAD = { top: 12, right: 34, bottom: 26, left: 52 }

export function LineChart({ labels, series, height = 260, title, help }: Props) {
  const dark = useDarkMode()
  const chrome = dark ? CHROME.dark : CHROME.light
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const width = 720 // viewBox width; scales responsively

  const maxY = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
    return Math.max(1, ...all) * 1.08
  }, [series])

  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH

  const ticks = useMemo(() => {
    const n = 4
    return Array.from({ length: n + 1 }, (_, i) => (maxY / n) * i)
  }, [maxY])

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    const idx = Math.round(((px - PAD.left) / innerW) * (labels.length - 1))
    setHover(Math.max(0, Math.min(labels.length - 1, idx)))
  }

  return (
    <div ref={wrapRef} className="relative">
      {title && (
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          {title}
          {help && <InfoTip title={title}>{help}</InfoTip>}
        </h3>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={title ?? 'Line chart'}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={chrome.grid} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={chrome.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke={chrome.axis} strokeWidth={1} />
        {labels.map((lb, i) => (
          <text key={lb} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={chrome.muted}>
            {lb}
          </text>
        ))}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={chrome.axis} strokeWidth={1} />
        )}

        {series.map((s, si) => {
          const color = seriesColor(si, dark)
          const pts = s.values
            .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
            .filter(Boolean)
            .join(' ')
          return (
            <g key={s.name}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && s.values[hover] !== null && (
                <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={color} stroke={chrome.surface} strokeWidth={2} />
              )}
            </g>
          )
        })}
      </svg>

      {/* legend — always present for ≥2 series */}
      {series.length >= 2 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1.5 text-xs text-ink2">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: seriesColor(si, dark) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / width) * 100}%`,
            transform: x(hover) > width * 0.7 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="font-semibold text-ink">{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="mt-0.5 flex items-center gap-1.5 text-ink2">
              <span className="inline-block size-2 rounded-full" style={{ background: seriesColor(si, dark) }} />
              {s.name}: <span className="tnum font-medium text-ink">{s.values[hover] === null ? '—' : fmtCompact(s.values[hover]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
