import { useState } from 'react'
import { BeerMug } from './BeerMug'

interface Props {
  /** Stable key so a dismissal sticks per page. */
  storageKey: string
  title: string
  steps: { heading: string; body: string }[]
}

/**
 * A first-run explainer. Dismissed state lives in localStorage, and there is
 * always a way back ("Show me again" appears once dismissed) so nobody loses
 * the instructions permanently.
 */
export function HelpBanner({ storageKey, title, steps }: Props) {
  const key = `fp.help.${storageKey}`
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1')

  const setState = (value: boolean) => {
    setDismissed(value)
    localStorage.setItem(key, value ? '1' : '0')
  }

  if (dismissed) {
    return (
      <button
        onClick={() => setState(false)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-brandink"
      >
        <BeerMug className="size-3.5" />
        How this page works
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-brandink/25 bg-brandwash/60 px-5 py-4">
      <div className="flex items-start gap-3">
        <BeerMug className="mt-0.5 size-5 shrink-0 text-brandink" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-brandink">{title}</h2>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.heading} className="flex gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brandink text-[10px] font-bold text-white dark:text-black">
                  {i + 1}
                </span>
                <span className="text-xs leading-relaxed text-ink2">
                  <strong className="font-semibold text-ink">{s.heading}</strong>
                  <br />
                  {s.body}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <button
          onClick={() => setState(true)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brandink hover:bg-brandwash"
          aria-label="Hide these instructions"
        >
          Got it ✕
        </button>
      </div>
    </section>
  )
}
