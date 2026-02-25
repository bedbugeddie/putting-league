import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authStore, useAuth } from '../store/auth'
import { api } from '../api/client'

const navLinks = [
  { to: '/', label: 'Current Event', end: true },
  { to: '/stats', label: 'Stats' },
]

export default function Layout() {
  const { user, isAuthenticated, isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Refresh user profile on mount so stale localStorage sessions pick up
  // newly created player profiles without requiring a fresh login.
  useEffect(() => {
    if (!authStore.isAuthenticated()) return
    api.get<{ user: any }>('/auth/me')
      .then(({ user: fresh }) => {
        authStore.setAuth(authStore.getToken()!, fresh)
      })
      .catch(() => {
        // Token expired or invalid — clear auth so user is prompted to log in
        authStore.clearAuth()
      })
  }, [])

  // Check if the user is currently a scorekeeper for an in-progress night
  const { data: activeNightData } = useQuery<{ nightId: string | null }>({
    queryKey: ['my-active-night'],
    queryFn: () => api.get('/scoring/my-active-night'),
    enabled: isAuthenticated && !!user?.player?.id,
    refetchInterval: 30_000, // poll every 30s so the link appears/disappears automatically
  })
  const activeNightId = activeNightData?.nightId ?? null

  function close() { setMenuOpen(false) }

  const mobileNavItem = ({ isActive }: { isActive: boolean }) =>
    `block py-3 text-sm border-b border-brand-700 dark:border-forest-border ${isActive ? 'font-semibold text-white dark:text-brand-300' : 'text-brand-100 dark:text-brand-200'}`

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <nav className="bg-brand-700 text-white shadow-md dark:bg-forest-surface dark:shadow-none dark:border-b dark:border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" onClick={close} className="flex items-center">
              <img src="/mvpl.png" alt="MVPL" className="h-9 w-auto" />
            </Link>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              {isAuthenticated && navLinks.map(l => (
                <NavLink key={l.to} to={l.to} end={l.end}
                  className={({ isActive }) => isActive ? 'font-semibold underline' : 'hover:underline'}>
                  {l.label}
                </NavLink>
              ))}
              {isAuthenticated ? (
                <>
                  {activeNightId && (
                    <NavLink to={`/scoring/${activeNightId}`}
                      className={({ isActive }) =>
                        `px-3 py-1 rounded font-semibold ${isActive ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}>
                      Score Card
                    </NavLink>
                  )}
                  <NavLink to="/dashboard"
                    className={({ isActive }) => isActive ? 'font-semibold underline' : 'hover:underline'}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/profile"
                    className={({ isActive }) => isActive ? 'font-semibold underline' : 'hover:underline'}>
                    My Profile
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/admin"
                      className={({ isActive }) =>
                        `px-3 py-1 rounded ${isActive ? 'bg-brand-900' : 'bg-brand-800 hover:bg-brand-900'}`}>
                      Admin
                    </NavLink>
                  )}
                  <button onClick={() => authStore.clearAuth()} className="text-brand-200 hover:text-white text-xs">
                    Sign out
                  </button>
                </>
              ) : null}
            </div>

            {/* Mobile: right side */}
            <div className="flex sm:hidden items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-brand-200 text-xs truncate max-w-[100px]">{user?.name}</span>
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="p-2 rounded hover:bg-brand-600 transition-colors"
                    aria-label="Toggle menu"
                  >
                    {menuOpen ? (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    )}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && isAuthenticated && (
          <div className="sm:hidden bg-brand-800 dark:bg-forest px-4 pb-4 space-y-1">
            {navLinks.map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={close} className={mobileNavItem}>
                {l.label}
              </NavLink>
            ))}
            {isAuthenticated ? (
              <>
                {activeNightId && (
                  <NavLink to={`/scoring/${activeNightId}`} onClick={close}
                    className={({ isActive }) =>
                      `block py-3 text-sm border-b border-brand-700 dark:border-forest-border font-semibold ${isActive ? 'text-brand-300' : 'text-brand-400'}`}>
                    Score Card
                  </NavLink>
                )}
                <NavLink to="/dashboard" onClick={close} className={mobileNavItem}>
                  Dashboard
                </NavLink>
                <NavLink to="/profile" onClick={close} className={mobileNavItem}>
                  My Profile
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin" onClick={close} className={mobileNavItem}>
                    Admin Panel
                  </NavLink>
                )}
                <button onClick={() => { authStore.clearAuth(); close() }}
                  className="block w-full text-left py-3 text-sm text-brand-300 border-b border-brand-700">
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login" onClick={close}
                className="block py-3 text-sm border-b border-brand-700 dark:border-forest-border text-brand-100 dark:text-brand-200">
                Sign In
              </NavLink>
            )}
          </div>
        )}
      </nav>

      {/* ── Content ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="bg-brand-50 border-t border-brand-100 py-3 text-center text-xs text-gray-400 dark:bg-forest dark:border-forest-border dark:text-brand-300">
        Merrimack Valley Putting League
      </footer>
    </div>
  )
}
