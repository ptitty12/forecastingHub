import { useMemo, useState } from 'react'
import { fmtCompact, fmtFull } from '../../lib/format'
import {
  CHROME,
  SEQUENTIAL_DARK,
  SEQUENTIAL_LIGHT,
  rampColor,
  useDarkMode,
} from '../../lib/palette'
import { US_MAP_HEIGHT, US_MAP_WIDTH, US_STATES } from '../../lib/usStates'
import { InfoTip } from '../InfoTip'

interface Props {
  /** State code → the measure, already filtered and summed by the caller. */
  values: Record<string, number>
  /** What the colour means, e.g. "Total forecast". */
  measureLabel: string
  title?: string
  /** Plain-language explanation shown behind a "?" next to the title. */
  help?: string
  /** Shown under the map when nothing lights up, so the reader knows why. */
  note?: string
}

/** Below this on-screen width a state has no room for its own label. */
const MIN_LABEL_WIDTH = 34

export function UsStateMap({ values, measureLabel, title, help, note }: Props) {
  const dark = useDarkMode()
  const chrome = dark ? CHROME.dark : CHROME.light
  const ramp = dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT
  const [hover, setHover] = useState<string | null>(null)

  const max = useMemo(() => Math.max(0, ...Object.values(values)), [values])

  const fillFor = (code: string) => {
    const v = values[code]
    if (v === undefined) {
      return chrome.grid
    }
    return rampColor(max > 0 ? v / max : 0, dark)
  }

  /** Only labelled states reach this. The far end of the ramp is the strong
   *  colour in both themes, so the surface colour is the readable one there. */
  const labelFor = (value: number) => {
    const step = Math.round((max > 0 ? value / max : 0) * (ramp.length - 1))
    return step >= 3 ? chrome.surface : chrome.ink
  }

  const hovered = hover ? US_STATES.find((s) => s.code === hover) : null
  const hoveredValue = hover ? values[hover] : undefined

  return (
    <div className="relative">
      {title && (
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          {title}
          {help && <InfoTip title={title}>{help}</InfoTip>}
        </h3>
      )}

      <svg
        viewBox={`0 0 ${US_MAP_WIDTH} ${US_MAP_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${measureLabel} by US state`}
        onMouseLeave={() => setHover(null)}
      >
        {US_STATES.map((s) => (
          <path
            key={s.code}
            d={s.d}
            fill={fillFor(s.code)}
            stroke={chrome.surface}
            strokeWidth={1}
            opacity={hover && hover !== s.code ? 0.8 : 1}
            onMouseEnter={() => setHover(s.code)}
          />
        ))}

        {US_STATES.filter((s) => values[s.code] !== undefined && s.w >= MIN_LABEL_WIDTH).map((s) => (
          <text
            key={s.code}
            x={s.cx}
            y={s.cy + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill={labelFor(values[s.code])}
            pointerEvents="none"
          >
            {s.code}
          </text>
        ))}
      </svg>

      {/* Sequential legend: colour is magnitude, so it needs a scale, not keys. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        {max > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="text-muted">{measureLabel}</span>
            <span className="tnum text-muted">0</span>
            <span className="flex overflow-hidden rounded-sm">
              {ramp.map((c) => (
                <span key={c} className="block size-2.5" style={{ background: c }} />
              ))}
            </span>
            <span className="tnum text-muted">{fmtCompact(max)}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: chrome.grid }} />
          No forecast here
        </span>
      </div>

      {note && <p className="mt-2 text-xs text-muted">{note}</p>}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hovered.cx / US_MAP_WIDTH) * 100}%`,
            top: `${(hovered.cy / US_MAP_HEIGHT) * 100}%`,
            transform: hovered.cx > US_MAP_WIDTH * 0.7 ? 'translate(-100%, -120%)' : 'translate(12px, -120%)',
          }}
        >
          <div className="font-semibold text-ink">{hovered.name}</div>
          <div className="mt-0.5 text-ink2">
            {hoveredValue === undefined ? (
              <span className="text-muted">Nothing forecast here</span>
            ) : (
              <>
                {measureLabel}: <span className="tnum font-medium text-ink">{fmtFull(hoveredValue)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
