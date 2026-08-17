import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark'
export type AccentName = 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'red'

export interface ThemeVars {
  '--bg': string
  '--panel': string
  '--border': string
  '--text': string
  '--muted': string
  '--accent': string
  '--accent-hover': string
  '--accent-soft': string
  '--green': string
  '--red': string
}

export const ACCENTS: Array<{ id: AccentName; labelKey: string }> = [
  { id: 'purple', labelKey: 'theme.purple' },
  { id: 'blue', labelKey: 'theme.blue' },
  { id: 'green', labelKey: 'theme.green' },
  { id: 'orange', labelKey: 'theme.orange' },
  { id: 'pink', labelKey: 'theme.pink' },
  { id: 'red', labelKey: 'theme.red' }
]

const ACCENT_RGB: Record<AccentName, string> = {
  purple: '139, 92, 246',
  blue: '59, 130, 246',
  green: '34, 197, 94',
  orange: '249, 115, 22',
  pink: '236, 72, 153',
  red: '239, 68, 68'
}

const ACCENT_HOVER: Record<AccentName, string> = {
  purple: '#7c3aed',
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  pink: '#db2777',
  red: '#dc2626'
}

function makeTheme(mode: ThemeMode, accent: AccentName): ThemeVars {
  const rgb = ACCENT_RGB[accent]
  const isDark = mode === 'dark'
  const base: Record<ThemeMode, Pick<ThemeVars, '--bg' | '--panel' | '--border' | '--text' | '--muted' | '--green' | '--red'>> = {
    light: {
      '--bg': '#f5f6fa',
      '--panel': '#ffffff',
      '--border': '#e5e7eb',
      '--text': '#1f2937',
      '--muted': '#6b7280',
      '--green': '#16a34a',
      '--red': '#dc2626'
    },
    dark: {
      '--bg': '#0f1117',
      '--panel': '#191c26',
      '--border': '#2a2f3c',
      '--text': '#e7e9ee',
      '--muted': '#9aa3b2',
      '--green': '#34d399',
      '--red': '#f87171'
    }
  }
  return {
    ...base[mode],
    '--accent': `rgb(${rgb})`,
    '--accent-hover': isDark ? `rgba(${rgb}, 0.85)` : ACCENT_HOVER[accent],
    '--accent-soft': isDark ? `rgba(${rgb}, 0.18)` : `rgba(${rgb}, 0.12)`
  }
}

interface ThemeContextValue {
  mode: ThemeMode
  accent: AccentName
  setMode: (m: ThemeMode) => void
  setAccent: (a: AccentName) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  accent: 'purple',
  setMode: () => undefined,
  setAccent: () => undefined,
  toggleMode: () => undefined
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>('light')
  const [accent, setAccentState] = useState<AccentName>('purple')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const local = localStorage.getItem('toqi-mode') as ThemeMode | null
      const localAccent = localStorage.getItem('toqi-accent') as AccentName | null
      const [savedMode, savedAccent] = await Promise.all([
        window.toqi.settings.getMode(),
        window.toqi.settings.getAccent()
      ])
      setModeState((local ?? savedMode ?? 'light') as ThemeMode)
      setAccentState((localAccent ?? savedAccent ?? 'purple') as AccentName)
      setLoaded(true)
    })()
  }, [])

  const apply = useCallback((m: ThemeMode, a: AccentName) => {
    const vars = makeTheme(m, a)
    const root = document.documentElement
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v)
    }
    root.setAttribute('data-mode', m)
    root.setAttribute('data-accent', a)
  }, [])

  useEffect(() => {
    if (loaded) apply(mode, accent)
  }, [mode, accent, loaded, apply])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    localStorage.setItem('toqi-mode', m)
    void window.toqi.settings.setMode(m)
  }, [])

  const setAccent = useCallback((a: AccentName) => {
    setAccentState(a)
    localStorage.setItem('toqi-accent', a)
    void window.toqi.settings.setAccent(a)
  }, [])

  const toggleMode = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light')
  }, [mode, setMode])

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}