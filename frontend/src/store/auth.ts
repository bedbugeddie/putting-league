import { useState, useEffect } from 'react'
import type { User } from '../api/types'

interface StoredAuth {
  token: string | null
  user: User | null
}

function load(): StoredAuth {
  try {
    const token = localStorage.getItem('token')
    const raw = localStorage.getItem('user')
    const user = raw ? (JSON.parse(raw) as User) : null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

let _state: StoredAuth = load()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

// Module-level store — safe to call outside React (e.g. API client)
export const authStore = {
  getToken: () => _state.token,
  getUser: () => _state.user,
  isAdmin: () => _state.user?.isAdmin === true,
  isAuthenticated: () => !!_state.token,

  setAuth(token: string, user: User) {
    _state = { token, user }
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    notify()
  },

  clearAuth() {
    _state = { token: null, user: null }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    notify()
  },

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
}

// React hook — re-renders only when auth state actually changes
export function useAuth() {
  const [state, setState] = useState<StoredAuth>(_state)

  useEffect(() => {
    // Sync in case state changed between render and effect
    setState({ ..._state })

    const unsubscribe = authStore.subscribe(() => {
      setState({ ..._state })
    })
    return unsubscribe
  }, [])

  return {
    token: state.token,
    user: state.user,
    isAdmin: state.user?.isAdmin === true,
    isAuthenticated: !!state.token,
  }
}
