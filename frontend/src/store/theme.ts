import { useState, useEffect } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {}
  return 'system'
}

function applyTheme(mode: ThemeMode) {
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

let _mode: ThemeMode = getStoredMode()
const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

export const themeStore = {
  getMode: () => _mode,
  setMode(mode: ThemeMode) {
    _mode = mode
    localStorage.setItem(STORAGE_KEY, mode)
    applyTheme(mode)
    notifyListeners()
  },
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(_mode)

  // Apply on mount
  useEffect(() => {
    applyTheme(_mode)
  }, [])

  // Follow OS preference changes live (only relevant when in 'system' mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange() {
      if (_mode === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  // Subscribe to store changes so all components stay in sync
  useEffect(() => {
    function update() { setMode(_mode) }
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])

  return { mode, setMode: themeStore.setMode }
}
