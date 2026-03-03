import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authStore, useAuth } from '../store/auth'
import { api } from '../api/client'
import { useTheme, type ThemeMode } from '../store/theme'
import PullToRefresh from './PullToRefresh'
import Avatar from './ui/Avatar'

const navLinks = [
  { to: '/', label: 'Current Event', end: true },
  { to: '/stats', label: 'Stats' },
]

const THEME_OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'light',  icon: '☀️', label: 'Light'  },
  { mode: 'dark',   icon: '🌙', label: 'Dark'   },
  { mode: 'system', icon: '💻', label: 'System' },
]

export default function Layout() {
  const { user, isAuthenticated, isAdmin } = useAuth()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)       // mobile drawer
  const [userMenuOpen, setUserMenuOpen] = useState(false) // desktop dropdown
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userMenuRef = useRef<HTMLDivElement>(null)

  const handleRefresh = useCallback(
    () => queryClient.invalidateQueries(),
    [queryClient],
  )

  function signOut() { authStore.clearAuth(); navigate('/') }

  // Refresh user profile on mount so stale localStorage sessions pick up
  // newly created player profiles without requiring a fresh login.
  useEffect(() => {
    if (!authStore.isAuthenticated()) return
    api.get<{ user: any }>('/auth/me')
      .then(({ user: fresh }) => {
        authStore.setAuth(authStore.getToken()!, fresh)
      })
      .catch(() => {
        authStore.clearAuth()
      })
  }, [])

  // Close desktop user-menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userMenuOpen])

  // Check if the user is currently a scorekeeper for an in-progress night
  const { data: activeNightData } = useQuery<{ nightId: string | null }>({
    queryKey: ['my-active-night'],
    queryFn: () => api.get('/scoring/my-active-night'),
    enabled: isAuthenticated && !!user?.player?.id,
    refetchInterval: 30_000,
  })
  const activeNightId = activeNightData?.nightId ?? null

  function close() { setMenuOpen(false) }
  function closeUser() { setUserMenuOpen(false) }

  const mobileNavItem = ({ isActive }: { isActive: boolean }) =>
    `block py-3 text-sm border-b border-brand-700 dark:border-forest-border ${isActive ? 'font-semibold text-white dark:text-brand-300' : 'text-brand-100 dark:text-brand-200'}`

  return (
    <div className="site-hero min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <nav className="bg-brand-700 text-white shadow-md dark:bg-forest-surface dark:shadow-none dark:border-b dark:border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" onClick={() => { close(); closeUser() }} className="flex items-center">
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
              {isAuthenticated && (
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

                  {/* Avatar → user dropdown */}
                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => setUserMenuOpen(o => !o)}
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                      aria-label="Account menu"
                      aria-expanded={userMenuOpen}
                    >
                      <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                      <svg
                        className={`w-3 h-3 text-brand-200 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-xl bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border text-gray-800 dark:text-gray-100 text-sm z-50 overflow-hidden">
                        {/* User info header */}
                        <div className="flex items-center gap-2.5 px-3 py-3 border-b border-gray-100 dark:border-forest-border">
                          <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{user?.name}</p>
                            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                          </div>
                        </div>

                        {/* Menu items */}
                        <NavLink
                          to="/profile"
                          onClick={closeUser}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-forest transition-colors ${isActive ? 'text-brand-700 dark:text-brand-400 font-medium' : ''}`
                          }
                        >
                          My Profile
                        </NavLink>
                        {isAdmin && (
                          <NavLink
                            to="/admin"
                            onClick={closeUser}
                            className={({ isActive }) =>
                              `flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-forest transition-colors ${isActive ? 'text-brand-700 dark:text-brand-400 font-medium' : ''}`
                            }
                          >
                            Admin Panel
                          </NavLink>
                        )}

                        {/* Theme selector */}
                        <div className="border-t border-gray-100 dark:border-forest-border px-3 py-2.5">
                          <p className="text-xs text-gray-400 mb-1.5">Theme</p>
                          <div className="flex gap-1">
                            {THEME_OPTIONS.map(({ mode, icon, label }) => (
                              <button
                                key={mode}
                                onClick={() => setThemeMode(mode)}
                                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded text-xs transition-colors ${
                                  themeMode === mode
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <span>{icon}</span>
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-forest-border">
                          <button
                            onClick={() => { closeUser(); signOut() }}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-forest transition-colors text-red-500 dark:text-red-400"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Mobile: avatar toggles the drawer */}
            <div className="flex sm:hidden items-center">
              {isAuthenticated ? (
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  className="flex items-center p-1 rounded hover:bg-brand-600 transition-colors"
                  aria-label="Toggle menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && isAuthenticated && (
          <div className="sm:hidden bg-brand-800 dark:bg-forest px-4 pb-4 space-y-1">
            {/* User info banner */}
            <div className="flex items-center gap-2.5 py-3 border-b border-brand-700 dark:border-forest-border">
              <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                <p className="text-xs text-brand-300 truncate">{user?.email}</p>
              </div>
            </div>

            {navLinks.map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={close} className={mobileNavItem}>
                {l.label}
              </NavLink>
            ))}
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

            {/* Mobile theme selector */}
            <div className="py-3 border-b border-brand-700 dark:border-forest-border">
              <p className="text-xs text-brand-300 mb-2">Theme</p>
              <div className="flex gap-2">
                {THEME_OPTIONS.map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded text-xs transition-colors ${
                      themeMode === mode
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-700 dark:bg-forest-mid text-brand-200 hover:bg-brand-600'
                    }`}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { signOut(); close() }}
              className="block w-full text-left py-3 text-sm text-red-400 border-b border-brand-700"
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      {/* ── Content ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </PullToRefresh>

      <footer className="bg-brand-50 border-t border-brand-100 py-3 text-center text-xs text-gray-400 dark:bg-forest dark:border-forest-border dark:text-brand-300">
        Merrimack Valley Putting League
      </footer>
    </div>
  )
}
