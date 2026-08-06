import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { ForecastConfig, Grid, GridRow, Period } from '../types'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/charts/LineChart'
import { StackedBarChart } from '../components/charts/StackedBarChart'
import { InfoTip } from '../components/InfoTip'
import { HelpBanner } from '../components/HelpBanner'
import { DASHBOARD_HELP } from '../lib/help'

interface Props {
  config: ForecastConfig
  periods: Period[]
}

type MeasureKey = 'effective_total' | 'suggested_buildup' | 'actuals' | 'pipeline_open' | 'suggested_all_bfo'

const MEASURES: { key: MeasureKey; label: string }[] = [
  { key: 'effective_total', label: 'Total forecast' },
  { key: 'suggested_buildup', label: 'Suggested forecast' },
  { key: 'suggested_all_bfo', label: 'All-deals suggestion' },
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
      <HelpBanner
        storageKey="dashboard"
        title="Reading the dashboard"
        steps={[
          { heading: 'Pick quarters', body: 'Chips on the left. Everything below follows your choice.' },
          { heading: 'Filter', body: 'Dropdowns on the right narrow every tile and chart at once.' },
          { heading: 'Change the cut', body: 'Choose what to measure and how to group it under the breakdown.' },
          { heading: 'Hover for detail', body: 'Point at any line or bar to see the exact numbers.' },
        ]}
      />

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted">Quarters</span>
          <InfoTip title="Quarters">Pick the quarters to include. Every tile and chart below follows this.</InfoTip>
        </div>
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
        <StatTile label="Actuals" value={tiles.actuals} help="Business already booked in the selected quarters." />
        <StatTile label="Open pipeline" value={tiles.pipeline} help="Everything still open and expected to close in these quarters, at full value." />
        <StatTile label="Suggested forecast" value={tiles.buildup} help="Actuals plus weighted pipeline — the system's starting guess." />
        <StatTile label="Total forecast" value={tiles.total} tone="brand" help="What the team has actually committed to, after their adjustments." />
      </div>

      {/* overview line */}
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <LineChart
          title="Forecast trajectory"
          help={DASHBOARD_HELP.trajectory.body}
          height={250}
          labels={labels}
          series={[
            { name: 'Actuals', values: overview.actuals },
            { name: 'Suggested', values: overview.buildup },
            { name: 'Total forecast', values: overview.forecast },
          ]}
        />
      </div>

      {/* by-dimension explorer */}
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {measureLabel} by {dimLabel}
            <InfoTip title={DASHBOARD_HELP.explorer.title}>{DASHBOARD_HELP.explorer.body}</InfoTip>
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={dimKey}
              onChange={(e) => setDimKey(e.target.value)}
              className="rounded-lg border border-hairline bg-page px-2 py-1.5 text-xs text-ink"
              aria-label="Group by"
              title={DASHBOARD_HELP.groupBy.body}
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
              title={DASHBOARD_HELP.measure.body}
            >
              {MEASURES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <InfoTip title={DASHBOARD_HELP.chartType.title} align="right">{DASHBOARD_HELP.chartType.body}</InfoTip>
            <div className="flex gap-1" role="group" aria-label="Chart type">
              <button onClick={() => setChartType('stacked')} className={chipCls(chartType === 'stacked')}>Stacked bars</button>
              <button onClick={() => setChartType('line')} className={chipCls(chartType === 'line')}>Lines</button>
            </div>
          </div>
        </div>
        {!byDimension || byDimension.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Nothing to chart for this combination — try clearing a filter or adding a quarter.
          </p>
        ) : chartType === 'stacked' ? (
          <StackedBarChart height={280} labels={labels} series={byDimension} />
        ) : (
          <LineChart height={280} labels={labels} series={byDimension} />
        )}
        <p className="mt-3 text-xs text-muted">
          The {MAX_SERIES} biggest {dimLabel.toLowerCase()} values get their own colour; everything else is grouped as
          “Other”. Filters above apply to every chart and tile, so what you see always matches the numbers.
        </p>
      </div>
    </div>
  )
}
