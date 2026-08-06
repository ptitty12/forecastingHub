import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { BusinessUnit, Dimension, ForecastConfig, MetricOverride } from '../types'
import { InfoTip } from '../components/InfoTip'
import { HelpBanner } from '../components/HelpBanner'
import { ADMIN_HELP, ADMIN_STEPS } from '../lib/help'

interface Props {
  businessUnits: BusinessUnit[]
  dimensions: Dimension[]
  onChanged: () => void
}

const WEIGHTING_LABEL: Record<string, string> = {
  win_probability: 'Win probability',
  threshold: 'Probability threshold',
  all: 'Count everything',
}

const CUSTOM = '__custom__'
const MAX_LEVELS = 8

interface LevelRow {
  choice: string // dimension key, or __custom__
  key: string
  label: string
  sql: string
}

const blankLevel = (): LevelRow => ({ choice: '', key: '', label: '', sql: '' })

/** What the panel is doing right now. */
type PanelMode = { kind: 'create' } | { kind: 'edit'; config: ForecastConfig; buId: number; buName: string }

export function AdminPage({ businessUnits, dimensions, onChanged }: Props) {
  const [mode, setMode] = useState<PanelMode>({ kind: 'create' })
  const [editingBu, setEditingBu] = useState<number | null>(null)

  return (
    <div className="space-y-4">
      <HelpBanner storageKey="admin" title="Setting a team up takes four decisions" steps={[...ADMIN_STEPS]} />

      <div className="grid gap-6 lg:grid-cols-[1fr_450px]">
        <section className="space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Onboarded teams</h2>
            <InfoTip title="Onboarded teams">
              Every business unit set up in the Pub, and the forecast views underneath it. Use Edit to change how a view
              slices, measures, or weights — changes go live immediately.
            </InfoTip>
          </div>

          {businessUnits.length === 0 && (
            <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
              No teams yet. Use the panel to add your first one.
            </p>
          )}

          {businessUnits.map((bu) => (
            <div key={bu.id} className="rounded-xl border border-hairline bg-surface p-5">
              {editingBu === bu.id ? (
                <BusinessUnitEditor
                  bu={bu}
                  onDone={() => {
                    setEditingBu(null)
                    onChanged()
                  }}
                  onCancel={() => setEditingBu(null)}
                />
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="rounded bg-brandwash px-2 py-0.5 text-xs font-semibold text-brandink">
                        {bu.code}
                      </span>
                      <h3 className="text-base font-semibold">{bu.name}</h3>
                    </div>
                    {bu.description && <p className="mt-1 text-xs text-muted">{bu.description}</p>}
                  </div>
                  <button
                    onClick={() => setEditingBu(bu.id)}
                    className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink2 hover:bg-page"
                  >
                    Rename
                  </button>
                </div>
              )}

              <div className="mt-3 space-y-3">
                {bu.configs.length === 0 && (
                  <p className="text-xs text-muted italic">
                    No forecast views yet — add one from the panel so this team can start forecasting.
                  </p>
                )}
                {bu.configs.map((cfg) => (
                  <ConfigCard
                    key={cfg.id}
                    cfg={cfg}
                    isEditing={mode.kind === 'edit' && mode.config.id === cfg.id}
                    onEdit={() => setMode({ kind: 'edit', config: cfg, buId: bu.id, buName: bu.name })}
                    onToggleActive={async () => {
                      await api.updateConfig(cfg.id, { ...configToPayload(cfg), active: !cfg.active })
                      onChanged()
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        <ConfigPanel
          key={mode.kind === 'edit' ? `edit-${mode.config.id}` : 'create'}
          mode={mode}
          businessUnits={businessUnits}
          dimensions={dimensions}
          onChanged={onChanged}
          onExitEdit={() => setMode({ kind: 'create' })}
        />
      </div>
    </div>
  )
}

/** Everything the API needs to round-trip a config unchanged. */
function configToPayload(cfg: ForecastConfig) {
  return {
    name: cfg.name,
    active: cfg.active,
    levels: cfg.levels,
    metric_rules: cfg.metric_rules,
    pipeline_weighting: cfg.pipeline_weighting,
    fact_filters: cfg.fact_filters,
    bucket_rollups: cfg.bucket_rollups,
    source_orders_view: cfg.source_orders_view,
    source_pipeline_view: cfg.source_pipeline_view,
  }
}

function ConfigCard({
  cfg,
  isEditing,
  onEdit,
  onToggleActive,
}: {
  cfg: ForecastConfig
  isEditing: boolean
  onEdit: () => void
  onToggleActive: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const weighting = cfg.pipeline_weighting

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-colors ${
        isEditing ? 'border-brandink bg-brandwash/40' : 'border-line bg-page'
      } ${cfg.active ? '' : 'opacity-70'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{cfg.name}</span>
        {!cfg.active && (
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
            Inactive
          </span>
        )}
        <span className="text-xs text-muted">·</span>
        {cfg.levels.map((lv, i) => (
          <span
            key={lv.key}
            className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink2"
            title={lv.sql ? `Custom SQL: ${lv.sql}` : `Standard dimension: ${lv.key}`}
          >
            L{i + 1} {lv.label}
            {lv.sql ? ' ⚡' : ''}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onEdit}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              isEditing ? 'border-brandink text-brandink' : 'border-hairline text-ink2 hover:bg-surface'
            }`}
          >
            {isEditing ? 'Editing…' : 'Edit'}
          </button>
          <button
            onClick={async () => {
              setBusy(true)
              try {
                await onToggleActive()
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            title={ADMIN_HELP.deactivate.body}
            className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink2 hover:bg-surface disabled:opacity-50"
          >
            {cfg.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[11px] text-muted sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">Measures:</dt>{' '}
          <dd className="inline">
            {cfg.metric_rules.sql
              ? 'custom SQL rule'
              : `${cfg.metric_rules.default}${
                  (cfg.metric_rules.overrides?.length ?? 0) > 0
                    ? ` (+${cfg.metric_rules.overrides!.length} exception${cfg.metric_rules.overrides!.length > 1 ? 's' : ''})`
                    : ''
                }`}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Pipeline counts:</dt>{' '}
          <dd className="inline">
            {WEIGHTING_LABEL[weighting.mode] ?? weighting.mode}
            {weighting.mode === 'threshold' && ` (≥ ${Math.round((weighting.min_probability ?? 0) * 100)}%)`}
          </dd>
        </div>
        {cfg.source_orders_view && (
          <div className="sm:col-span-2">
            <dt className="inline font-medium">Sources:</dt>{' '}
            <dd className="inline">
              {cfg.source_orders_view}
              {cfg.source_pipeline_view && ` · ${cfg.source_pipeline_view}`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function BusinessUnitEditor({ bu, onDone, onCancel }: { bu: BusinessUnit; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(bu.code)
  const [name, setName] = useState(bu.name)
  const [description, setDescription] = useState(bu.description ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.updateBusinessUnit(bu.id, { code: code.trim(), name: name.trim(), description: description.trim() })
      onDone()
    } catch (e) {
      setErr(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const cls = 'rounded-lg border border-hairline bg-page px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brandink'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <input className={cls} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" />
        <input className={cls} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <input
          className={`${cls} col-span-2`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="Description"
        />
      </div>
      {err && <p className="text-xs text-neg">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brandink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:text-black"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink2">
          Cancel
        </button>
      </div>
    </div>
  )
}

function friendlyError(e: unknown): string {
  const raw = String(e)
  if (raw.includes('409')) return 'That name is already taken by another view on this team.'
  if (raw.includes('422')) {
    const m = raw.match(/"detail":"([^"]+)"/)
    return m ? `That won't work: ${m[1]}` : "Something in the setup isn't valid — check the SQL and levels."
  }
  return raw
}

function ConfigPanel({
  mode,
  businessUnits,
  dimensions,
  onChanged,
  onExitEdit,
}: {
  mode: PanelMode
  businessUnits: BusinessUnit[]
  dimensions: Dimension[]
  onChanged: () => void
  onExitEdit: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.config : null

  const [buMode, setBuMode] = useState<'existing' | 'new'>(businessUnits.length ? 'existing' : 'new')
  const [buId, setBuId] = useState<number | ''>(mode.kind === 'edit' ? mode.buId : '')
  const [newBu, setNewBu] = useState({ code: '', name: '', description: '' })
  const [configName, setConfigName] = useState(editing?.name ?? '')
  const [levels, setLevels] = useState<LevelRow[]>(() =>
    editing
      ? editing.levels.map((lv) => ({
          choice: lv.sql ? CUSTOM : lv.key,
          key: lv.key,
          label: lv.label,
          sql: lv.sql ?? '',
        }))
      : [blankLevel()],
  )
  const [metricDefault, setMetricDefault] = useState<'orders' | 'sales'>(
    (editing?.metric_rules.default as 'orders' | 'sales') ?? 'orders',
  )
  const [metricSqlOn, setMetricSqlOn] = useState(Boolean(editing?.metric_rules.sql))
  const [metricSql, setMetricSql] = useState(
    editing?.metric_rules.sql ?? "CASE WHEN product_line = 'Software' THEN 'Sales' ELSE 'Orders' END",
  )
  const [overrides, setOverrides] = useState<MetricOverride[]>(editing?.metric_rules.overrides ?? [])
  const [weightMode, setWeightMode] = useState<'win_probability' | 'threshold' | 'all'>(
    (editing?.pipeline_weighting.mode as 'win_probability' | 'threshold' | 'all') ?? 'win_probability',
  )
  const [minProb, setMinProb] = useState(Math.round((editing?.pipeline_weighting.min_probability ?? 0.5) * 100))
  const [rollupsText, setRollupsText] = useState(
    editing?.bucket_rollups
      ? JSON.stringify(editing.bucket_rollups, null, 2)
      : '{\n  "Hardware": ["Power Hardware", "Rack Hardware"],\n  "Software": ["Monitoring Software"]\n}',
  )
  const [sourceOrders, setSourceOrders] = useState(editing?.source_orders_view ?? '')
  const [sourcePipeline, setSourcePipeline] = useState(editing?.source_pipeline_view ?? '')
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setStatus(null), [mode])

  const usesRollup = levels.some((l) => l.choice === 'product_rollup')
  const labelFor = useMemo(() => Object.fromEntries(dimensions.map((d) => [d.key, d.label])), [dimensions])

  const setLevel = (i: number, patch: Partial<LevelRow>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const buildPayload = () => {
    const chosen = levels.filter((l) => l.choice)
    if (chosen.length === 0) throw new Error('Pick at least one level — that is what the rows will be.')
    if (!configName.trim()) throw new Error('Give this view a name, like “Field Sales”.')

    const levelDefs = chosen.map((l) => {
      if (l.choice !== CUSTOM) return { key: l.choice, label: labelFor[l.choice] ?? l.choice }
      const key = l.key.trim().toLowerCase().replace(/\s+/g, '_')
      if (!key || !l.sql.trim()) throw new Error('Custom levels need both a short name and a SQL expression.')
      return { key, label: l.label.trim() || l.key.trim(), sql: l.sql.trim() }
    })

    let bucket_rollups: Record<string, string[]> | null = null
    if (usesRollup) {
      try {
        bucket_rollups = JSON.parse(rollupsText)
      } catch {
        throw new Error('The product groups box needs valid JSON — check the brackets and commas.')
      }
    }

    return {
      name: configName.trim(),
      active: editing ? editing.active : true,
      levels: levelDefs,
      metric_rules: metricSqlOn
        ? { default: metricDefault, overrides: [], sql: metricSql.trim() }
        : { default: metricDefault, overrides },
      pipeline_weighting:
        weightMode === 'threshold' ? { mode: 'threshold', min_probability: minProb / 100 } : { mode: weightMode },
      bucket_rollups,
      source_orders_view: sourceOrders.trim() || null,
      source_pipeline_view: sourcePipeline.trim() || null,
    }
  }

  const submit = async () => {
    setStatus(null)
    let payload
    try {
      payload = buildPayload()
    } catch (e) {
      setStatus({ tone: 'err', msg: (e as Error).message })
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await api.updateConfig(editing.id, payload)
        setStatus({ tone: 'ok', msg: `Saved. “${payload.name}” is updated for everyone.` })
      } else {
        let targetBuId = buId
        if (buMode === 'new') {
          if (!newBu.code.trim() || !newBu.name.trim()) {
            setStatus({ tone: 'err', msg: 'A new business unit needs both a short code and a name.' })
            return
          }
          const created = await api.createBusinessUnit({
            code: newBu.code.trim(),
            name: newBu.name.trim(),
            description: newBu.description.trim() || undefined,
          })
          targetBuId = created.id
        }
        if (targetBuId === '') {
          setStatus({ tone: 'err', msg: 'Choose which business unit this belongs to.' })
          return
        }
        await api.createConfig(targetBuId as number, payload)
        setStatus({ tone: 'ok', msg: `“${payload.name}” is live — sellers can pick it in the View menu now.` })
        setConfigName('')
        setOverrides([])
        setLevels([blankLevel()])
      }
      onChanged()
    } catch (e) {
      setStatus({ tone: 'err', msg: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brandink'
  const labelCls = 'flex items-center gap-1.5 text-xs font-medium text-ink2 mb-1'
  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active ? 'border-brandink bg-brandwash text-brandink' : 'border-hairline text-ink2 hover:border-line'
    }`

  return (
    <section className="h-fit rounded-xl border border-hairline bg-surface p-5 lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
            {editing ? 'Edit view' : 'Add a team'}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {editing ? (
              <>
                Editing <strong className="text-ink">{mode.kind === 'edit' ? mode.buName : ''}</strong> ·{' '}
                <strong className="text-ink">{editing.name}</strong>. {ADMIN_HELP.editing.body}
              </>
            ) : (
              'A team goes live once it has a view: how it slices, what it measures, and how pipeline counts. No code needed.'
            )}
          </p>
        </div>
        {editing && (
          <button onClick={onExitEdit} className="shrink-0 rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink2 hover:bg-page">
            Cancel
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {!editing && (
          <div>
            <span className={labelCls}>
              Business unit
              <InfoTip title={ADMIN_HELP.businessUnit.title}>{ADMIN_HELP.businessUnit.body}</InfoTip>
            </span>
            <div className="flex gap-2 text-xs">
              {(['existing', 'new'] as const).map((m) => (
                <button key={m} onClick={() => setBuMode(m)} className={chipCls(buMode === m)}>
                  {m === 'existing' ? 'Existing' : 'New business unit'}
                </button>
              ))}
            </div>
            {buMode === 'existing' ? (
              <select className={`${inputCls} mt-2`} value={buId} onChange={(e) => setBuId(Number(e.target.value) || '')}>
                <option value="">Select…</option>
                {businessUnits.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 grid grid-cols-[90px_1fr] gap-2">
                <input
                  className={inputCls}
                  placeholder="Code"
                  value={newBu.code}
                  onChange={(e) => setNewBu({ ...newBu, code: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="Name"
                  value={newBu.name}
                  onChange={(e) => setNewBu({ ...newBu, name: e.target.value })}
                />
                <input
                  className={`${inputCls} col-span-2`}
                  placeholder="Description (optional)"
                  value={newBu.description}
                  onChange={(e) => setNewBu({ ...newBu, description: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>
            View name
            <InfoTip title={ADMIN_HELP.configName.title}>{ADMIN_HELP.configName.body}</InfoTip>
          </label>
          <input
            className={inputCls}
            placeholder="e.g. Field Sales, Named Accounts, OEM"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
          />
        </div>

        <div>
          <span className={labelCls}>
            Forecast levels
            <InfoTip title={ADMIN_HELP.levels.title}>{ADMIN_HELP.levels.body}</InfoTip>
          </span>
          <p className="mb-2 text-[11px] text-muted">These become the rows sellers fill in, widest first.</p>
          <div className="space-y-2">
            {levels.map((l, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-line/70 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-7 text-[11px] font-semibold text-muted">L{i + 1}</span>
                  <select
                    className="min-w-0 flex-1 rounded-lg border border-hairline bg-page px-2 py-1.5 text-sm text-ink"
                    value={l.choice}
                    onChange={(e) => setLevel(i, { choice: e.target.value })}
                    aria-label={`Level ${i + 1}`}
                  >
                    <option value="">Select dimension…</option>
                    {dimensions
                      .filter((d) => !levels.some((x, j) => j !== i && x.choice === d.key))
                      .map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                          {d.derived ? ' (grouped)' : ''}
                        </option>
                      ))}
                    <option value={CUSTOM}>＋ Custom dimension (SQL)…</option>
                  </select>
                  {levels.length > 1 && (
                    <button
                      onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}
                      className="px-1.5 text-sm text-muted hover:text-neg"
                      title="Remove this level"
                      aria-label={`Remove level ${i + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {l.choice === CUSTOM && (
                  <div className="space-y-1.5 pl-8">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-muted">Custom</span>
                      <InfoTip title={ADMIN_HELP.customDimension.title}>{ADMIN_HELP.customDimension.body}</InfoTip>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        className="rounded border border-hairline bg-page px-2 py-1 text-xs"
                        placeholder="short name, e.g. coast"
                        value={l.key}
                        onChange={(e) => setLevel(i, { key: e.target.value })}
                      />
                      <input
                        className="rounded border border-hairline bg-page px-2 py-1 text-xs"
                        placeholder="Column heading"
                        value={l.label}
                        onChange={(e) => setLevel(i, { label: e.target.value })}
                      />
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded border border-hairline bg-page px-2 py-1 font-mono text-xs"
                      placeholder="CASE WHEN state IN ('VA','NY') THEN 'East' ELSE 'West' END"
                      value={l.sql}
                      onChange={(e) => setLevel(i, { sql: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}
            {levels.length < MAX_LEVELS && (
              <button
                onClick={() => setLevels((ls) => [...ls, blankLevel()])}
                className="text-xs font-medium text-brandink hover:underline"
              >
                + Add level ({MAX_LEVELS - levels.length} more allowed)
              </button>
            )}
          </div>
        </div>

        {usesRollup && (
          <div>
            <label className={labelCls}>
              Product groups
              <InfoTip title={ADMIN_HELP.bucketRollups.title}>{ADMIN_HELP.bucketRollups.body}</InfoTip>
            </label>
            <textarea
              rows={5}
              className={`${inputCls} font-mono text-xs`}
              value={rollupsText}
              onChange={(e) => setRollupsText(e.target.value)}
            />
          </div>
        )}

        <div>
          <span className={labelCls}>
            What this team forecasts
            <InfoTip title={ADMIN_HELP.metric.title}>{ADMIN_HELP.metric.body}</InfoTip>
          </span>
          <div className="flex items-center gap-2 text-xs">
            {(['orders', 'sales'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetricDefault(m)}
                className={`${chipCls(metricDefault === m && !metricSqlOn)} capitalize`}
                disabled={metricSqlOn}
                title={m === 'orders' ? 'Counted when the customer commits' : 'Counted when we invoice'}
              >
                {m}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-ink2">
              <input
                type="checkbox"
                checked={metricSqlOn}
                onChange={(e) => setMetricSqlOn(e.target.checked)}
                className="accent-(--brand)"
              />
              Write it as SQL
              <InfoTip title={ADMIN_HELP.metricSql.title} align="right">
                {ADMIN_HELP.metricSql.body}
              </InfoTip>
            </label>
          </div>
          {metricSqlOn ? (
            <textarea
              rows={2}
              className={`${inputCls} mt-2 font-mono text-xs`}
              value={metricSql}
              onChange={(e) => setMetricSql(e.target.value)}
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              {overrides.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted">Exceptions</span>
                  <InfoTip title={ADMIN_HELP.lensRule.title}>{ADMIN_HELP.lensRule.body}</InfoTip>
                </div>
              )}
              {overrides.map((o, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted">if</span>
                  <input
                    className="w-24 rounded border border-hairline bg-page px-1.5 py-1"
                    placeholder="column"
                    value={o.field}
                    onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                  />
                  <span className="text-muted">is</span>
                  <input
                    className="min-w-0 flex-1 rounded border border-hairline bg-page px-1.5 py-1"
                    placeholder="value"
                    value={o.equals}
                    onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, equals: e.target.value } : x)))}
                  />
                  <span className="text-muted">use</span>
                  <select
                    className="rounded border border-hairline bg-page px-1.5 py-1"
                    value={o.metric}
                    onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, metric: e.target.value } : x)))}
                  >
                    <option value="orders">orders</option>
                    <option value="sales">sales</option>
                  </select>
                  <button
                    onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                    className="px-1 text-muted hover:text-neg"
                    aria-label="Remove this exception"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setOverrides([...overrides, { field: 'product_line', equals: '', metric: 'sales' }])}
                className="text-xs font-medium text-brandink hover:underline"
              >
                + Add an exception (e.g. software counted on sales)
              </button>
            </div>
          )}
        </div>

        <div>
          <span className={labelCls}>
            How open pipeline counts
            <InfoTip title={ADMIN_HELP.weighting.title}>{ADMIN_HELP.weighting.body}</InfoTip>
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(WEIGHTING_LABEL) as Array<keyof typeof WEIGHTING_LABEL>).map((m) => (
              <button key={m} onClick={() => setWeightMode(m as typeof weightMode)} className={chipCls(weightMode === m)}>
                {WEIGHTING_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {weightMode === 'win_probability'
              ? 'Every open deal contributes a slice of its value, sized by how likely it is.'
              : weightMode === 'threshold'
                ? `Deals at ${minProb}% or better count in full; anything less likely is ignored.`
                : 'Every open deal counts at its full value — optimistic, but simple.'}
          </p>
          {weightMode === 'threshold' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink2">
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={minProb}
                onChange={(e) => setMinProb(Number(e.target.value))}
                className="flex-1 accent-(--brand)"
                aria-label="Minimum win probability"
              />
              <span className="tnum w-10 text-right font-medium">{minProb}%</span>
              <InfoTip title={ADMIN_HELP.threshold.title} align="right">
                {ADMIN_HELP.threshold.body}
              </InfoTip>
            </div>
          )}
        </div>

        <details>
          <summary className="cursor-pointer text-xs font-medium text-ink2">Production source views (optional)</summary>
          <div className="mt-2 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              Documentation only — safe to leave blank
              <InfoTip title={ADMIN_HELP.sourceViews.title}>{ADMIN_HELP.sourceViews.body}</InfoTip>
            </p>
            <input
              className={inputCls}
              placeholder="Orders/sales view, e.g. db.schema.orders_sales_view"
              value={sourceOrders}
              onChange={(e) => setSourceOrders(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Pipeline view, e.g. db.schema.pipeline_view"
              value={sourcePipeline}
              onChange={(e) => setSourcePipeline(e.target.value)}
            />
          </div>
        </details>

        {status && (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              status.tone === 'ok' ? 'bg-brandwash text-brandink' : 'bg-negwash text-neg'
            }`}
          >
            {status.msg}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-lg bg-brandink py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-black"
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add team'}
        </button>
      </div>
    </section>
  )
}
