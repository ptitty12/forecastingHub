import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ForecastConfig, Grid, GridRow, Opportunity, Period } from '../types'
import { StatTile } from '../components/StatTile'
import { CommentCell, EditableNumberCell } from '../components/EditableCell'
import { AuditDrawer } from '../components/AuditDrawer'
import { LineChart } from '../components/charts/LineChart'
import { StackedBarChart } from '../components/charts/StackedBarChart'
import { fmtCompact, fmtWhen } from '../lib/format'

interface Props {
  config: ForecastConfig
  periods: Period[]
}

interface DrawerState {
  sliceKey: string | null
  periodCode: string
  title: string
}

type OppsState = Opportunity[] | 'loading' | undefined

export function ForecastPage({ config, periods }: Props) {
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [grid, setGrid] = useState<Grid | null>(null)
  const [compareGrid, setCompareGrid] = useState<Grid | null>(null) // live state when as-of is active
  const [allGrid, setAllGrid] = useState<Grid | null>(null) // every period, for the trend visuals
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [hideEmpty, setHideEmpty] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [asOfDate, setAsOfDate] = useState('') // yyyy-mm-dd; '' = live
  const [compareOn, setCompareOn] = useState(false)
  const [showVisuals, setShowVisuals] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [opps, setOpps] = useState<Record<string, OppsState>>({})
  const fetchSeq = useRef(0)

  const asOfIso = asOfDate ? `${asOfDate}T23:59:59` : undefined
  const readOnly = Boolean(asOfIso)

  // default: the current quarter — else first period
  useEffect(() => {
    if (periods.length && selectedPeriods.length === 0) {
      const now = new Date()
      const current = periods.find(
        (p) => new Date(p.start_date) <= now && now <= new Date(p.end_date + 'T23:59:59'),
      )
      setSelectedPeriods([current?.code ?? periods[0].code])
    }
  }, [periods, selectedPeriods.length])

  const refresh = useCallback(() => {
    if (!selectedPeriods.length) return
    const seq = ++fetchSeq.current
    setLoading(true)
    const main = api.grid(config.id, selectedPeriods, asOfIso)
    const compare = asOfIso ? api.grid(config.id, selectedPeriods) : Promise.resolve(null)
    Promise.all([main, compare])
      .then(([g, c]) => {
        if (seq !== fetchSeq.current) return // stale response — a newer fetch is in flight
        setGrid(g)
        setCompareGrid(c)
        setError(null)
      })
      .catch((e) => seq === fetchSeq.current && setError(String(e)))
      .finally(() => seq === fetchSeq.current && setLoading(false))
  }, [config.id, selectedPeriods, asOfIso])

  useEffect(refresh, [refresh])

  const refreshTrend = useCallback(() => {
    if (!periods.length) return
    api
      .grid(config.id, periods.map((p) => p.code))
      .then(setAllGrid)
      .catch(() => setAllGrid(null))
  }, [config.id, periods])

  useEffect(refreshTrend, [refreshTrend])

  const levelKeys = config.levels.map((l) => l.key)

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {}
    for (const key of levelKeys) {
      opts[key] = [...new Set((grid?.rows ?? []).map((r) => r.slice_values[key] || ''))]
        .filter(Boolean)
        .sort()
    }
    return opts
  }, [grid, levelKeys])

  const matchesFilters = useCallback(
    (r: GridRow) => {
      for (const [key, val] of Object.entries(filters)) {
        if (val && (r.slice_values[key] || '') !== val) return false
      }
      return true
    },
    [filters],
  )

  const visibleRows = useMemo(() => {
    let rows = (grid?.rows ?? []).filter(matchesFilters)
    if (hideEmpty) {
      rows = rows.filter((r) => r.actuals !== 0 || r.pipeline_open !== 0 || r.has_entry)
    }
    return rows
  }, [grid, matchesFilters, hideEmpty])

  const compareByKey = useMemo(() => {
    const map = new Map<string, GridRow>()
    for (const r of compareGrid?.rows ?? []) map.set(`${r.period_code}|${r.slice_key}`, r)
    return map
  }, [compareGrid])

  const totals = useMemo(() => {
    const acc = { actuals: 0, pipeline: 0, buildup: 0, adjustment: 0, total: 0, nowTotal: 0 }
    for (const r of visibleRows) {
      acc.actuals += r.actuals
      acc.pipeline += r.pipeline_open
      acc.buildup += r.suggested_buildup
      acc.adjustment += r.effective_adjustment
      acc.total += r.effective_total
      const now = compareByKey.get(`${r.period_code}|${r.slice_key}`)
      acc.nowTotal += now ? now.effective_total : r.effective_total
    }
    return acc
  }, [visibleRows, compareByKey])

  // trend visuals: per-period sums over ALL periods (filters applied)
  const trend = useMemo(() => {
    if (!allGrid) return null
    const codes = periods.map((p) => p.code)
    const sum = (code: string, pick: (r: GridRow) => number) =>
      allGrid.rows.filter((r) => r.period_code === code && matchesFilters(r)).reduce((a, r) => a + pick(r), 0)
    return {
      labels: codes,
      actuals: codes.map((c) => sum(c, (r) => r.actuals)),
      buildup: codes.map((c) => sum(c, (r) => r.suggested_buildup)),
      forecast: codes.map((c) => sum(c, (r) => r.effective_total)),
    }
  }, [allGrid, periods, matchesFilters])

  const composition = useMemo(() => {
    if (!allGrid || !levelKeys.length) return null
    const codes = periods.map((p) => p.code)
    const dim = levelKeys[0]
    const totalsByValue = new Map<string, number>()
    for (const r of allGrid.rows) {
      if (!matchesFilters(r)) continue
      const v = r.slice_values[dim] || '—'
      totalsByValue.set(v, (totalsByValue.get(v) ?? 0) + r.effective_total)
    }
    const top = [...totalsByValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([v]) => v)
    const names = [...top, ...(totalsByValue.size > 7 ? ['Other'] : [])]
    const series = names.map((name) => ({
      name,
      values: codes.map((code) =>
        allGrid.rows
          .filter(
            (r) =>
              r.period_code === code &&
              matchesFilters(r) &&
              (name === 'Other'
                ? !top.includes(r.slice_values[dim] || '—')
                : (r.slice_values[dim] || '—') === name),
          )
          .reduce((a, r) => a + r.effective_total, 0),
      ),
    }))
    return { labels: codes, series, dimLabel: config.levels[0].label }
  }, [allGrid, periods, levelKeys, matchesFilters, config.levels])

  const save = async (
    row: GridRow,
    fields: Partial<{ adjustment: number | null; total_forecast: number | null; comment: string | null }>,
  ) => {
    await api.saveEntry(config.id, {
      period_code: row.period_code,
      slice_values: row.slice_values,
      ...fields,
      set_fields: Object.keys(fields),
    })
    refresh()
    refreshTrend()
  }

  const toggleExpand = (row: GridRow) => {
    const id = `${row.period_code}|${row.slice_key}`
    const next = !expanded[id]
    setExpanded((e) => ({ ...e, [id]: next }))
    if (next && opps[id] === undefined) {
      setOpps((o) => ({ ...o, [id]: 'loading' }))
      api
        .sliceOpportunities(config.id, row.period_code, row.slice_values)
        .then((list) => setOpps((o) => ({ ...o, [id]: list })))
        .catch(() => setOpps((o) => ({ ...o, [id]: [] })))
    }
  }

  const multiPeriod = selectedPeriods.length > 1
  const nCols = (multiPeriod ? 1 : 0) + 1 + config.levels.length + 6 + (compareOn && readOnly ? 2 : 0) + 2

  return (
    <div className="space-y-4">
      {/* period chips + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Forecast periods">
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
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                  active
                    ? 'border-brandink bg-brandwash text-brandink'
                    : 'border-hairline bg-surface text-ink2 hover:border-line'
                }`}
              >
                {p.code}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink2" title="Reconstruct rep input as of this date from the audit trail">
            <span className="font-medium">See as of</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink"
            />
            {asOfDate && (
              <button onClick={() => { setAsOfDate(''); setCompareOn(false) }} className="font-medium text-brandink hover:underline">
                back to live
              </button>
            )}
          </label>
          {readOnly && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
              <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} className="accent-(--brand)" />
              Compare to now
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" checked={!hideEmpty} onChange={(e) => setHideEmpty(!e.target.checked)} className="accent-(--brand)" />
            Show all slices
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" checked={showVisuals} onChange={(e) => setShowVisuals(e.target.checked)} className="accent-(--brand)" />
            Visuals
          </label>
          <button
            onClick={() =>
              setDrawer({ sliceKey: null, periodCode: selectedPeriods[0], title: `${config.name} · ${selectedPeriods.join(', ')}` })
            }
            className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-page"
          >
            Change history
          </button>
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-brandink/40 bg-brandwash px-4 py-2 text-xs text-brandink">
          <span className="font-semibold">Snapshot view — rep input as of {asOfDate} (end of day).</span>
          <span>Editing is off. Actuals & pipeline are live until fact snapshots are wired in.</span>
        </div>
      )}

      {/* grand totals */}
      <div className="flex flex-wrap gap-3">
        <StatTile label="Actuals to date" value={totals.actuals} hint="Booked so far in the selected periods" />
        <StatTile label="Open pipeline" value={totals.pipeline} hint="Open bfo opportunities closing in period" />
        <StatTile label="Suggested forecast" value={totals.buildup} hint="Actuals + weighted open pipeline (build-up)" />
        <StatTile label="Adjustments" value={totals.adjustment} tone="signed" hint="Net rep adjustments" />
        <StatTile
          label={readOnly ? `Total as of ${asOfDate}` : 'Total forecast'}
          value={totals.total}
          tone="brand"
          hint="Where the team says it lands"
        />
        {readOnly && compareOn && (
          <StatTile label="Δ since then" value={totals.nowTotal - totals.total} tone="signed" hint="Current total minus snapshot total" />
        )}
      </div>

      {/* home visuals */}
      {showVisuals && trend && (
        <div className="grid gap-4 transition-opacity duration-300 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface p-4">
            <LineChart
              title="Trajectory across quarters"
              height={210}
              labels={trend.labels}
              series={[
                { name: 'Actuals', values: trend.actuals },
                { name: 'Build-up suggested', values: trend.buildup },
                { name: 'Total forecast', values: trend.forecast },
              ]}
            />
          </div>
          {composition && (
            <div className="rounded-xl border border-hairline bg-surface p-4">
              <StackedBarChart
                title={`Total forecast by ${composition.dimLabel}`}
                height={210}
                labels={composition.labels}
                series={composition.series}
              />
            </div>
          )}
        </div>
      )}

      {/* level filters */}
      <div className="flex flex-wrap items-center gap-2">
        {config.levels.map((lv, i) => (
          <label key={lv.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-medium">L{i + 1} · {lv.label}</span>
            <select
              value={filters[lv.key] ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, [lv.key]: e.target.value }))}
              className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs text-ink"
            >
              <option value="">All</option>
              {filterOptions[lv.key]?.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({})} className="text-xs font-medium text-brandink hover:underline">
            Clear filters
          </button>
        )}
        {loading && grid && <span className="ml-auto animate-pulse text-xs text-muted">Updating…</span>}
      </div>

      {error && <div className="rounded-lg border border-neg bg-negwash px-4 py-3 text-sm text-neg">{error}</div>}

      {/* the grid */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className={`w-full min-w-[1020px] border-collapse text-sm transition-opacity duration-200 ${loading && grid ? 'opacity-55' : 'opacity-100'}`}>
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
              <th className="w-8 px-2 py-2.5" aria-label="Expand" />
              {multiPeriod && <th className="px-3 py-2.5">Period</th>}
              {config.levels.map((lv) => (
                <th key={lv.key} className="px-3 py-2.5">{lv.label}</th>
              ))}
              <th className="px-3 py-2.5 text-right">Actuals</th>
              <th className="px-3 py-2.5 text-right">Open pipeline</th>
              <th className="px-3 py-2.5 text-right" title="Actuals + 100% of open pipeline">All-bfo suggested</th>
              <th className="px-3 py-2.5 text-right" title="Actuals + weighted open pipeline">Build-up suggested</th>
              <th className="bg-editwash px-3 py-2.5 text-right">Adjustment</th>
              <th className="bg-editwash px-3 py-2.5 text-right">{readOnly ? `Total as of ${asOfDate}` : 'Total forecast'}</th>
              {readOnly && compareOn && (
                <>
                  <th className="px-3 py-2.5 text-right">Total now</th>
                  <th className="px-3 py-2.5 text-right">Δ</th>
                </>
              )}
              <th className="bg-editwash px-3 py-2.5">Comments</th>
              <th className="px-3 py-2.5">Last edit</th>
            </tr>
          </thead>
          <tbody>
            {grid === null && (
              <tr><td colSpan={nCols} className="px-4 py-10 text-center text-sm text-muted">Loading grid…</td></tr>
            )}
            {grid !== null && visibleRows.length === 0 && (
              <tr><td colSpan={nCols} className="px-4 py-10 text-center text-sm text-muted">No slices match — clear filters or enable “Show all slices”.</td></tr>
            )}
            {visibleRows.map((row) => {
              const id = `${row.period_code}|${row.slice_key}`
              const isOpen = Boolean(expanded[id])
              const now = compareByKey.get(id)
              const delta = now ? now.effective_total - row.effective_total : 0
              const rowOpps = opps[id]
              return (
                <FragmentRow
                  key={id}
                  row={row}
                  isOpen={isOpen}
                  rowOpps={rowOpps}
                  config={config}
                  multiPeriod={multiPeriod}
                  readOnly={readOnly}
                  compareOn={readOnly && compareOn}
                  nowTotal={now?.effective_total ?? null}
                  delta={delta}
                  nCols={nCols}
                  onToggle={() => toggleExpand(row)}
                  onSave={save}
                  onHistory={() =>
                    setDrawer({
                      sliceKey: row.slice_key,
                      periodCode: row.period_code,
                      title: `${Object.values(row.slice_values).filter(Boolean).join(' · ')} — ${row.period_code}`,
                    })
                  }
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Build-up = actuals + open pipeline weighted by{' '}
        {config.pipeline_weighting.mode === 'win_probability'
          ? 'opportunity win probability'
          : config.pipeline_weighting.mode === 'threshold'
            ? `including only opps at ≥ ${Math.round((config.pipeline_weighting.min_probability ?? 0) * 100)}% win probability`
            : config.pipeline_weighting.mode === 'sql'
              ? 'a custom SQL rule'
              : '100%'}
        . Click ▸ on a row to see the bfo opportunities behind it. Amounts accept 1.2M / 500K shorthand.
      </p>

      {drawer && (
        <AuditDrawer configId={config.id} periodCode={drawer.periodCode} sliceKey={drawer.sliceKey} title={drawer.title} onClose={() => setDrawer(null)} />
      )}
    </div>
  )
}

interface RowProps {
  row: GridRow
  isOpen: boolean
  rowOpps: OppsState
  config: ForecastConfig
  multiPeriod: boolean
  readOnly: boolean
  compareOn: boolean
  nowTotal: number | null
  delta: number
  nCols: number
  onToggle: () => void
  onSave: (row: GridRow, fields: Partial<{ adjustment: number | null; total_forecast: number | null; comment: string | null }>) => Promise<void>
  onHistory: () => void
}

function FragmentRow({ row, isOpen, rowOpps, config, multiPeriod, readOnly, compareOn, nowTotal, delta, nCols, onToggle, onSave, onHistory }: RowProps) {
  return (
    <>
      <tr className="border-b border-line/60 last:border-0 hover:bg-page/60">
        <td className="px-2 py-1.5">
          {row.pipeline_open !== 0 ? (
            <button
              onClick={onToggle}
              className={`grid size-5 place-items-center rounded text-xs text-muted transition-transform duration-200 hover:bg-page hover:text-brandink ${isOpen ? 'rotate-90' : ''}`}
              title="Show the opportunities behind this estimate"
              aria-expanded={isOpen}
            >
              ▸
            </button>
          ) : (
            <span className="block w-5" />
          )}
        </td>
        {multiPeriod && <td className="tnum px-3 py-1.5 text-xs whitespace-nowrap text-muted">{row.period_code}</td>}
        {config.levels.map((lv) => (
          <td key={lv.key} className="max-w-44 truncate px-3 py-1.5 text-ink2" title={row.slice_values[lv.key]}>
            {row.slice_values[lv.key] || <span className="text-muted">—</span>}
          </td>
        ))}
        <td className="tnum px-3 py-1.5 text-right text-ink2">{row.actuals === 0 ? '—' : fmt(row.actuals)}</td>
        <td className="tnum px-3 py-1.5 text-right text-ink2">{row.pipeline_open === 0 ? '—' : fmt(row.pipeline_open)}</td>
        <td className="tnum px-3 py-1.5 text-right text-muted italic">{fmt(row.suggested_all_bfo)}</td>
        <td className="tnum px-3 py-1.5 text-right font-medium">{fmt(row.suggested_buildup)}</td>
        {readOnly ? (
          <>
            <td className={`tnum px-3 py-1.5 text-right ${row.effective_adjustment < 0 ? 'text-neg' : row.effective_adjustment > 0 ? 'text-pos' : 'text-muted'}`}>
              {row.effective_adjustment === 0 && !row.has_entry ? '—' : (row.effective_adjustment > 0 ? '+' : '') + fmt(row.effective_adjustment)}
            </td>
            <td className="tnum px-3 py-1.5 text-right font-semibold">{fmt(row.effective_total)}</td>
            {compareOn && (
              <>
                <td className="tnum px-3 py-1.5 text-right text-ink2">{nowTotal === null ? '—' : fmt(nowTotal)}</td>
                <td className={`tnum px-3 py-1.5 text-right font-medium ${delta < 0 ? 'text-neg' : delta > 0 ? 'text-pos' : 'text-muted'}`}>
                  {delta === 0 ? '—' : (delta > 0 ? '+' : '') + fmt(delta)}
                </td>
              </>
            )}
          </>
        ) : (
          <>
            <td className="w-32 bg-editwash/50 px-1 py-1">
              <EditableNumberCell
                value={row.effective_adjustment}
                isSet={row.adjustment !== null || row.total_forecast !== null}
                signed
                onSave={(v) => onSave(row, { adjustment: v })}
              />
            </td>
            <td className="w-36 bg-editwash/50 px-1 py-1">
              <EditableNumberCell value={row.effective_total} isSet={true} emphasis onSave={(v) => onSave(row, { total_forecast: v })} />
            </td>
          </>
        )}
        <td className="w-56 min-w-44 bg-editwash/50 px-1 py-1">
          {readOnly ? (
            <span className="block px-2 py-1 text-xs text-ink2">{row.comment || '—'}</span>
          ) : (
            <CommentCell value={row.comment} onSave={(v) => onSave(row, { comment: v })} />
          )}
        </td>
        <td className="px-3 py-1.5">
          {row.updated_by ? (
            <button onClick={onHistory} className="text-left text-[11px] leading-tight text-muted hover:text-brandink hover:underline" title="View change history">
              {row.updated_by}
              <br />
              {row.updated_at ? fmtWhen(row.updated_at) : ''}
            </button>
          ) : (
            <span className="text-[11px] text-muted">—</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-line/60 bg-page/40">
          <td colSpan={nCols} className="px-4 py-3 pl-10">
            {rowOpps === 'loading' || rowOpps === undefined ? (
              <p className="animate-pulse text-xs text-muted">Loading opportunities…</p>
            ) : rowOpps.length === 0 ? (
              <p className="text-xs text-muted">No open opportunities behind this row.</p>
            ) : (
              <table className="w-full max-w-4xl text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-semibold tracking-wide text-muted uppercase">
                    <th className="py-1 pr-3">Account</th>
                    <th className="py-1 pr-3">Opportunity</th>
                    <th className="py-1 pr-3">ID</th>
                    <th className="py-1 pr-3 text-right">Amount</th>
                    <th className="py-1 pr-3 text-right">Win %</th>
                    <th className="py-1 pr-3">Stage</th>
                    <th className="py-1 pr-3 text-center" title="Counted in the build-up suggested forecast">In build-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rowOpps.map((o) => (
                    <tr key={o.opportunity_id} className={`border-t border-line/50 ${o.included ? '' : 'opacity-55'}`}>
                      <td className="py-1.5 pr-3 text-ink2">{o.account || '—'}</td>
                      <td className="py-1.5 pr-3">
                        <a href={o.url} target="_blank" rel="noreferrer" className="font-medium text-brandink hover:underline" title="Open in Salesforce">
                          {o.opportunity_name || o.opportunity_id} ↗
                        </a>
                      </td>
                      <td className="tnum py-1.5 pr-3 text-muted">{o.opportunity_id}</td>
                      <td className="tnum py-1.5 pr-3 text-right text-ink">{fmt(o.amount)}</td>
                      <td className="tnum py-1.5 pr-3 text-right text-ink2">{Math.round(o.win_probability * 100)}%</td>
                      <td className="py-1.5 pr-3 text-ink2">{o.stage || '—'}</td>
                      <td className="py-1.5 pr-3 text-center">{o.included ? <span className="text-pos">✓ {fmtCompact(o.weighted_amount)}</span> : <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function fmt(v: number): string {
  return Math.round(v).toLocaleString('en-US')
}
