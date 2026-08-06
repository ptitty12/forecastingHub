import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getUser, setUser } from './api/client'
import type { BusinessUnit, Dimension, Period } from './types'
import { ForecastPage } from './pages/ForecastPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'
import { BeerMug } from './components/BeerMug'
import { InfoTip } from './components/InfoTip'

type Tab = 'forecast' | 'dashboard' | 'admin'

const TAB_LABEL: Record<Tab, string> = {
  forecast: 'Forecast',
  dashboard: 'Dashboard',
  admin: 'Administration',
}
const TAB_HINT: Record<Tab, string> = {
  forecast: 'Enter and adjust your numbers',
  dashboard: 'Charts and breakdowns',
  admin: 'Set up and edit teams',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('forecast')
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [dimensions, setDimensions] = useState<Dimension[]>([])
  const [configId, setConfigId] = useState<number | null>(null)
  const [userText, setUserText] = useState(getUser())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    Promise.all([api.businessUnits(), api.periods(), api.dimensions()])
      .then(([bus, pds, dims]) => {
        setBusinessUnits(bus)
        setPeriods(pds)
        setDimensions(dims)
        setLoadError(null)
        setConfigId((cur) => {
          const selectable = bus.flatMap((b) => b.configs).filter((c) => c.active)
          if (cur && selectable.some((c) => c.id === cur)) return cur
          return selectable[0]?.id ?? null
        })
      })
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(reload, [reload])

  const activeConfig = useMemo(() => {
    for (const bu of businessUnits) {
      const cfg = bu.configs.find((c) => c.id === configId)
      if (cfg) return { bu, cfg }
    }
    return null
  }, [businessUnits, configId])

  // Deactivated views stay out of the picker but keep all their data.
  const pickable = useMemo(
    () => businessUnits.map((bu) => ({ bu, configs: bu.configs.filter((c) => c.active) })).filter((g) => g.configs.length),
    [businessUnits],
  )

  const showConfigPicker = tab === 'forecast' || tab === 'dashboard'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-brandink text-white dark:text-black">
              <BeerMug className="size-5" />
            </div>
            <div>
              <h1 className="text-sm leading-tight font-semibold">Forecasting Pub</h1>
              <p className="text-[11px] leading-tight text-muted">Energy 'r US · one place to call your number</p>
            </div>
          </div>

          <nav className="flex gap-1 text-sm" aria-label="Main">
            {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                title={TAB_HINT[t]}
                aria-current={tab === t ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors duration-150 ${
                  tab === t ? 'bg-brandwash text-brandink' : 'text-ink2 hover:bg-page'
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {showConfigPicker && pickable.length > 0 && (
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted">View</span>
                <select
                  value={configId ?? ''}
                  onChange={(e) => setConfigId(Number(e.target.value))}
                  className="max-w-64 rounded-lg border border-hairline bg-page px-3 py-1.5 text-sm"
                  aria-label="Forecast view"
                >
                  {pickable.map(({ bu, configs }) => (
                    <optgroup key={bu.id} label={`${bu.name} (${bu.code})`}>
                      {configs.map((cfg) => (
                        <option key={cfg.id} value={cfg.id}>
                          {bu.code} · {cfg.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <InfoTip title="View" align="right">
                  Each team has its own way of slicing the forecast. Pick yours here — the whole page follows it.
                </InfoTip>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <span>Signed in as</span>
              <input
                className="w-32 rounded-lg border border-hairline bg-page px-2 py-1.5 text-xs text-ink"
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                onBlur={() => setUser(userText.trim() || 'demo.user')}
                aria-label="Your name"
              />
              <InfoTip title="Who you are" align="right">
                Stamped on every change you make so the history shows who did what. A stand-in until single sign-on is
                wired up.
              </InfoTip>
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-5">
        {loadError && (
          <div className="mb-4 rounded-xl border border-neg bg-negwash px-4 py-3 text-sm text-neg">
            <p className="font-semibold">Can't reach the server.</p>
            <p className="mt-0.5 text-xs">
              Nothing you typed is lost — it just isn't saved yet. Check that the API is running on port 7999, then
              reload. ({loadError})
            </p>
          </div>
        )}

        {loading && !loadError && <p className="animate-pulse text-sm text-muted">Loading…</p>}

        {(tab === 'forecast' || tab === 'dashboard') &&
          !loading &&
          (activeConfig ? (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">
                  {activeConfig.bu.name} — {activeConfig.cfg.name}
                </h2>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  Rows are grouped by {activeConfig.cfg.levels.map((l) => l.label).join(' → ')}
                  <InfoTip title="How your rows are grouped">
                    Your team forecasts at this level of detail. An administrator can change it under Administration.
                  </InfoTip>
                </p>
              </div>
              {tab === 'forecast' ? (
                <ForecastPage key={activeConfig.cfg.id} config={activeConfig.cfg} periods={periods} />
              ) : (
                <DashboardPage key={activeConfig.cfg.id} config={activeConfig.cfg} periods={periods} />
              )}
            </>
          ) : (
            !loadError && (
              <div className="rounded-xl border border-hairline bg-surface px-6 py-10 text-center">
                <BeerMug className="mx-auto size-8 text-muted" />
                <h2 className="mt-3 text-base font-semibold">Nothing to forecast yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  No active views are set up. Head to <strong className="text-ink">Administration</strong> to add one —
                  it takes about a minute and needs no code.
                </p>
                <button
                  onClick={() => setTab('admin')}
                  className="mt-4 rounded-lg bg-brandink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:text-black"
                >
                  Go to Administration
                </button>
              </div>
            )
          ))}

        {tab === 'admin' && !loading && (
          <AdminPage businessUnits={businessUnits} dimensions={dimensions} onChanged={reload} />
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-5 pb-8 text-[11px] text-muted">
        Forecasting Pub · demo data is entirely fictional ·{' '}
        <a href="/docs" className="hover:text-brandink hover:underline">
          API docs
        </a>
      </footer>
    </div>
  )
}
