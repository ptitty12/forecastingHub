import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { ForecastConfig, Grid, GridRow, Period } from '../types'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/charts/LineChart'
import { StackedBarChart } from '../components/charts/StackedBarChart'

interface Props {
  config: ForecastConfig
  periods: Period[]
}

type MeasureKey = 'effective_total' | 'suggested_buildup' | 'actuals' | 'pipeline_open' | 'suggested_all_bfo'

const MEASURES: { key: MeasureKey; label: string }[] = [
  { key: 'effective_total', label: 'Total forecast' },
  { key: 'suggested_buildup', label: 'Build-up suggested' },
  { key: 'suggested_all_bfo', label: 'All-bfo suggested' },
  { key: 'actuals', label: 'Actuals' },
  { key: 'pipeline_open', label: 'Open pipeline' },
]

const MAX_SERIES = 7 // 8th slot reserved for "Other"

export function DashboardPage({ config, periods }: Props) {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(periods.map((p) => p.code))
  const [dimKey, setDimKey] = useState(config.levels[0]?.key ?? '')
  const [measure, setMeasure] = useState<MeasureKey>('effective_total')
  const [chartType, setChartType] = useState<'stacked' | 'line'>('stacked')
  const [filters, setFilters] = useState<Record<string, string>>({})

  useEffect(() => {
    api
      .grid(config.id, periods.map((p) => p.code))
      .then((g) => {
        setGrid(g)
        setError(null)
      })
      .catch((e) => setError(String(e)))
  }, [config.id, periods])

  const matches = (r: GridRow) => {
    for (const [k, v] of Object.entries(filters)) {
      if (v && (r.slice_values[k] || '') !== v) return false
    }
    return true
  }

  const rows = useMemo(
    () => (grid?.rows ?? []).filter((r) => selectedPeriods.includes(r.period_code) && matches(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, selectedPeriods, filters],
  )

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {}
    for (const lv of config.levels) {
      opts[lv.key] = [...new Set((grid?.rows ?? []).map((r) => r.slice_values[lv.key] || ''))]
        .filter(Boolean)
        .sort()
    }
    return opts
  }, [grid, config.levels])

  const tiles = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.actuals += r.actuals
          acc.pipeline += r.pipeline_open
          acc.buildup += r.suggested_buildup
          acc.total += r.effective_total
          return acc
        },
        { actuals: 0, pipeline: 0, buildup: 0, total: 0 },
      ),
    [rows],
  )

  const labels = selectedPeriods

  const overview = useMemo(() => {
    const sum = (code: string, pick: (r: GridRow) => number) =>
      rows.filter((r) => r.period_code === code).reduce((a, r) => a + pick(r), 0)
    return {
      actuals: labels.map((c) => sum(c, (r) => r.actuals)),
      buildup: labels.map((c) => sum(c, (r) => r.suggested_buildup)),
      forecast: labels.map((c) => sum(c, (r) => r.effective_total)),
    }
  }, [rows, labels])

  const byDimension = useMemo(() => {
    if (!dimKey) return null
    const totalByValue = new Map<string, number>()
    for (const r of rows) {
      const v = r.slice_values[dimKey] || '—'
      totalByValue.set(v, (totalByValue.get(v) ?? 0) + Math.abs(r[measure]))
    }
    const top = [...totalByValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SERIES).map(([v]) => v)
    const hasOther = totalByValue.size > MAX_SERIES
    const names = [...top, ...(hasOther ? ['Other'] : [])]
    const series = names.map((name) => ({
      name,
      values: labels.map((code) =>
        rows
          .filter(
            (r) =>
              r.period_code === code &&
              (name === 'Other' ? !top.includes(r.slice_values[dimKey] || '—') : (r.slice_values[dimKey] || '—') === name),
          )
          .reduce((a, r) => a + r[measure], 0),
      ),
    }))
    return series
  }, [rows, labels, dimKey, measure])

  const dimLabel = config.levels.find((l) => l.key === dimKey)?.label ?? dimKey
  const measureLabel = MEASURES.find((m) => m.key === measure)!.label

  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
      active ? 'border-brandink bg-brandwash text-brandink' : 'border-hairline bg-surface text-ink2 hover:border-line'
    }`

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periods">
          {periods.map((p) => {
            const active = selectedPeriods.includes(p.code)
            return (
              <button
                key={p.code}
                onClick={() =>
                  setSelectedPeriods((cur) => {
                    const next = active ? cur.filter((c) => c !== p.code) : [...cur, p.code]
                    return next.length ? next.sort() : cur
                  })
                }
                className={chipCls(active)}
              >
                {p.code}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {config.levels.map((lv) => (
            <select
              key={lv.key}
              value={filters[lv.key] ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, [lv.key]: e.target.value }))}
              className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs text-ink"
              aria-label={`Filter ${lv.label}`}
            >
              <option value="">{lv.label}: all</option>
              {filterOptions[lv.key]?.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ))}
          {Object.values(filters).some(Boolean) && (
            <button onClick={() => setFilters({})} className="text-xs font-medium text-brandink hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-neg bg-negwash px-4 py-3 text-sm text-neg">{error}</div>}

      {/* KPIs */}
      <div className="flex flex-wrap gap-3">
        <StatTile label="Actuals" value={tiles.actuals} />
        <StatTile label="Open pipeline" value={tiles.pipeline} />
        <StatTile label="Suggested forecast" value={tiles.buildup} />
        <StatTile label="Total forecast" value={tiles.total} tone="brand" />
      </div>

      {/* overview line */}
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <LineChart
          title="Forecast trajectory"
          height={250}
          labels={labels}
          series={[
            { name: 'Actuals', values: overview.actuals },
            { name: 'Build-up suggested', values: overview.buildup },
            { name: 'Total forecast', values: overview.forecast },
          ]}
        />
      </div>

      {/* by-dimension explorer */}
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-ink">
            {measureLabel} by {dimLabel}
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={dimKey}
              onChange={(e) => setDimKey(e.target.value)}
              className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-xs text-ink"
              aria-label="Dimension"
            >
              {config.levels.map((lv) => (
                <option key={lv.key} value={lv.key}>By {lv.label}</option>
              ))}
            </select>
            <select
              value={measure}
              onChange={(e) => setMeasure(e.target.value as MeasureKey)}
              className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-xs text-ink"
              aria-label="Measure"
            >
              {MEASURES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <div className="flex gap-1" role="group" aria-label="Chart type">
              <button onClick={() => setChartType('stacked')} className={chipCls(chartType === 'stacked')}>Stacked bars</button>
              <button onClick={() => setChartType('line')} className={chipCls(chartType === 'line')}>Lines</button>
            </div>
          </div>
        </div>
        {!byDimension || byDimension.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No data for this cut.</p>
        ) : chartType === 'stacked' ? (
          <StackedBarChart height={280} labels={labels} series={byDimension} />
        ) : (
          <LineChart height={280} labels={labels} series={byDimension} />
        )}
        <p className="mt-3 text-xs text-muted">
          Top {MAX_SERIES} {dimLabel.toLowerCase()} values shown; the rest fold into “Other”. Filters above apply to every chart and tile.
        </p>
      </div>
    </div>
  )
}
