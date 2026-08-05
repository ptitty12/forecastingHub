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
