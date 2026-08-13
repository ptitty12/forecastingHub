import { useEffect, useState } from 'react'

/** Validated categorical palette (fixed slot order — never cycled).
 *  Light/dark are the same hues stepped per surface. */
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]
export const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
]

/** Sequential ramp for magnitude (the map): one hue, light → dark on light
 *  surfaces, dim → bright on dark ones. Never used for identity. */
export const SEQUENTIAL_LIGHT = ['#e4f6e8', '#b6e8c3', '#7fd39a', '#3fae6b', '#0e6f2b']
export const SEQUENTIAL_DARK = ['#173322', '#1e5533', '#277d46', '#33a95a', '#5fdd77']

/** The Michigan highlight. Deliberately outside both scales — it marks a place,
 *  never a number, so it must not read as "the biggest state". */
export const HIGHLIGHT = { light: '#c3457a', dark: '#e87ba4' }

export const CHROME = {
  light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', ink: '#0b0b0b', surface: '#fcfcfb' },
  dark: { grid: '#2c2c2a', axis: '#383835', muted: '#898781', ink: '#ffffff', surface: '#1a1a19' },
}

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return dark
}

export function seriesColor(i: number, dark: boolean): string {
  const pal = dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  return pal[i % pal.length]
}

/** Position on the sequential ramp, `t` clamped to 0…1. */
export function rampColor(t: number, dark: boolean): string {
  const pal = dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT
  const i = Math.round(Math.min(1, Math.max(0, t)) * (pal.length - 1))
  return pal[i]
}

export function highlightColor(dark: boolean): string {
  return dark ? HIGHLIGHT.dark : HIGHLIGHT.light
}
