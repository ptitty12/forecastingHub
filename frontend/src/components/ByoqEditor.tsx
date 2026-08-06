import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SourceContract } from '../types'
import { InfoTip } from './InfoTip'

interface Props {
  ordersSql: string
  pipelineSql: string
  onChange: (patch: { ordersSql?: string; pipelineSql?: string }) => void
}

const LABEL: Record<string, string> = {
  orders: 'Orders & sales',
  pipeline: 'Open pipeline',
}

const EXAMPLE: Record<string, string> = {
  orders: `SELECT fiscal_period,
       transaction_type,
       amount,
       seller,
       account
FROM my_orders_view
WHERE business_unit = 'Mine'`,
  pipeline: `SELECT fiscal_period,
       status,
       amount,
       win_probability,
       opportunity_id,
       opportunity_name,
       account,
       NULL AS stage,
       NULL AS close_date,
       seller
FROM my_pipeline_view`,
}

/**
 * Bring-your-own-query: replace either source with a team's own SELECT.
 *
 * The contract is fetched from the API rather than duplicated here, so the
 * required columns shown to an admin can never drift from what the engine
 * actually enforces.
 */
export function ByoqEditor({ ordersSql, pipelineSql, onChange }: Props) {
  const [contract, setContract] = useState<SourceContract[] | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    api.sourceContract().then(setContract).catch(() => setContract([]))
  }, [])

  const value = (source: string) => (source === 'orders' ? ordersSql : pipelineSql)
  const setValue = (source: string, v: string) =>
    onChange(source === 'orders' ? { ordersSql: v } : { pipelineSql: v })

  const inUse = [ordersSql.trim() && 'orders', pipelineSql.trim() && 'pipeline'].filter(Boolean)

  return (
    <details className="rounded-lg border border-line/70 px-3 py-2" open={inUse.length > 0}>
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink2">
        Bring your own query
        {inUse.length > 0 && (
          <span className="rounded-full bg-brandwash px-1.5 py-0.5 text-[10px] font-semibold text-brandink">
            {inUse.length} in use
          </span>
        )}
        <InfoTip title="Bring your own query">
          For extraction logic too involved to express as filters. Your SELECT replaces the standard table as the
          source; levels, metric rules and weighting all still apply on top of it.
        </InfoTip>
      </summary>

      <p className="mt-2 text-[11px] text-muted">
        Leave both blank to read the standard tables. Anything you write here is checked by actually running it when
        you save, so a missing column fails here — not for a seller.
      </p>

      <div className="mt-2 space-y-2">
        {(contract ?? []).map((c) => {
          const isOpen = open[c.source]
          return (
            <div key={c.source} className="rounded-lg bg-page/60 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-ink">{LABEL[c.source] ?? c.source}</span>
                <span className="text-[10px] text-muted">
                  {value(c.source).trim() ? 'custom query' : `standard: ${c.standard_table}`}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [c.source]: !isOpen }))}
                  className="ml-auto text-[11px] font-medium text-brandink hover:underline"
                >
                  {isOpen ? 'Hide contract' : 'What must it return?'}
                </button>
              </div>

              {isOpen && (
                <div className="mt-2 space-y-1.5 rounded border border-hairline bg-surface p-2">
                  <p className="text-[11px] font-semibold text-ink">Required columns</p>
                  <dl className="space-y-0.5">
                    {Object.entries(c.required_columns).map(([col, desc]) => (
                      <div key={col} className="text-[10.5px] leading-snug">
                        <dt className="inline font-mono font-semibold text-brandink">{col}</dt>
                        <dd className="inline text-muted"> — {desc}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="pt-1 text-[11px] font-semibold text-ink">Plus anything your config uses</p>
                  <p className="text-[10.5px] leading-snug text-muted">
                    Level columns, lens rule fields, and filter columns. Available standard dimensions:{' '}
                    <span className="font-mono">{c.standard_dimensions.join(', ')}</span>
                  </p>
                  <ul className="list-disc space-y-0.5 pt-1 pl-4">
                    {c.notes.map((n) => (
                      <li key={n} className="text-[10.5px] leading-snug text-muted">
                        {n}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setValue(c.source, EXAMPLE[c.source] ?? '')}
                    className="pt-1 text-[11px] font-medium text-brandink hover:underline"
                  >
                    Insert a starting example
                  </button>
                </div>
              )}

              <textarea
                rows={value(c.source).trim() ? 8 : 3}
                spellCheck={false}
                className="mt-1.5 w-full rounded border border-hairline bg-surface px-2 py-1.5 font-mono text-[11px] leading-snug text-ink outline-none focus:border-brandink"
                placeholder={`Blank = read ${c.standard_table}`}
                value={value(c.source)}
                onChange={(e) => setValue(c.source, e.target.value)}
                aria-label={`${LABEL[c.source] ?? c.source} query`}
              />
              {value(c.source).trim() && (
                <button
                  type="button"
                  onClick={() => setValue(c.source, '')}
                  className="text-[11px] font-medium text-muted hover:text-neg"
                >
                  Clear — go back to the standard table
                </button>
              )}
            </div>
          )
        })}
        {contract === null && <p className="text-[11px] text-muted">Loading the contract…</p>}
      </div>
    </details>
  )
}
