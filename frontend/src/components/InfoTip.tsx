import { useEffect, useId, useRef, useState } from 'react'

interface Props {
  /** Plain-language explanation. Keep it to a sentence or two. */
  children: React.ReactNode
  /** Optional bold lead-in shown above the body. */
  title?: string
  className?: string
  align?: 'left' | 'right'
}

/**
 * A small "?" affordance that explains one thing in plain language.
 *
 * Opens on hover and on focus, closes on Escape, blur, or outside click, and
 * is reachable by keyboard — so the help is available to someone tabbing
 * through the grid, not just someone with a mouse.
 */
export function InfoTip({ children, title, className = '', align = 'left' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={title ? `Help: ${title}` : 'Help'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="grid size-4 shrink-0 cursor-help place-items-center rounded-full border border-muted/50 text-[9px] leading-none font-bold text-muted normal-case transition-colors hover:border-brandink hover:text-brandink focus:ring-2 focus:ring-brandink/40 focus:outline-none"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-6 z-50 w-64 rounded-lg border border-hairline bg-surface px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal text-ink2 normal-case shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {title && <span className="mb-0.5 block font-semibold text-ink">{title}</span>}
          {children}
        </span>
      )}
    </span>
  )
}
