import { useEffect } from 'react'

function applyTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', isDark)
}

export function useTheme() {
  // Apply on mount
  useEffect(() => {
    applyTheme()
  }, [])

  // Follow OS preference changes live
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyTheme)
    return () => mq.removeEventListener('change', applyTheme)
  }, [])
}
