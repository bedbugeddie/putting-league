import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authStore, useAuth } from '../store/auth'
import { api } from '../api/client'
import { useTheme, type ThemeMode } from '../store/theme'
import type { LeagueNight } from '../api/types'
import PullToRefresh from './PullToRefresh'
import Avatar from './ui/Avatar'
import MotwModal from './MotwModal'
import PhoneNagModal from './PhoneNagModal'

const navLinks: { to: string; label: string; end?: boolean }[] = [
  { to: '/forum', label: 'Forum'       },
  { to: '/stats', label: 'League Stats' },
]

const THEME_OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'light',  icon: '☀️', label: 'Light'      },
  { mode: 'dark',   icon: '🌙', label: 'Dark'       },
  { mode: 'system', icon: '💻', label: 'System'     },
  { mode: 'pink',   icon: '🩷', label: 'Throw Pink' },
]

export default function Layout() {
  const { user, isAuthenticated, isAdmin } = useAuth()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)       // mobile drawer
  const [userMenuOpen, setUserMenuOpen] = useState(false) // desktop dropdown
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const userMenuRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLElement>(null)

  // True when a logged-in user hasn't yet acknowledged the league info
  const needsAck = isAuthenticated && !user?.hasAcknowledgedInfo

  // Force unacknowledged users to stay on /info.
  // Read hasAcknowledgedInfo directly from the module-level store (_state) inside
  // the effect so we always see the post-setAuth value, even when the React state
  // hasn't propagated yet (avoids a race with navigate() in LeagueInfoPage).
  useEffect(() => {
    const authed = !!authStore.getToken()
    const acked  = authStore.getUser()?.hasAcknowledgedInfo
    if (authed && !acked && location.pathname !== '/info') {
      navigate('/info', { replace: true })
    }
  }, [needsAck, location.pathname, navigate])

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

  // Close mobile drawer when tapping outside the nav
  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [menuOpen])

  // Check if the user is currently a scorekeeper for an in-progress night
  const { data: activeNightData } = useQuery<{ nightId: string | null }>({
    queryKey: ['my-active-night'],
    queryFn: () => api.get('/scoring/my-active-night'),
    enabled: isAuthenticated && !!user?.player?.id,
    refetchInterval: 30_000,
  })
  const activeNightId = activeNightData?.nightId ?? null

  // Current live league night — drives the "Current Event" nav link
  const { data: leagueNightsData } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  })
  const currentNightId = (leagueNightsData?.leagueNights ?? [])
    .find(n => n.status === 'IN_PROGRESS')?.id ?? null
  const currentEventTo  = currentNightId ? `/league-nights/${currentNightId}` : '/'
  const currentEventEnd = !currentNightId

  function close() { setMenuOpen(false) }
  function closeUser() { setUserMenuOpen(false) }

  const mobileNavItem = ({ isActive }: { isActive: boolean }) =>
    `block py-3 text-sm border-b border-brand-700 dark:border-forest-border ${isActive ? 'font-semibold text-white dark:text-brand-300' : 'text-brand-100 dark:text-brand-200'}`

  return (
    <div className="site-hero min-h-screen flex flex-col">
      {/* ── Nav ── */}
      <nav ref={mobileNavRef} className="bg-brand-700 text-white shadow-md dark:bg-forest-surface dark:shadow-none dark:border-b dark:border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" onClick={() => { close(); closeUser() }} className="flex items-center">
              <img src="/mvpl.png" alt="MVPL" className="h-9 w-auto" />
            </Link>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              {isAuthenticated && !needsAck && (
                <NavLink to={currentEventTo} end={currentEventEnd}
                  className={({ isActive }) => isActive ? 'font-semibold underline' : 'hover:underline'}>
                  Current Event
                </NavLink>
              )}
              {isAuthenticated && !needsAck && navLinks.map(l => (
                <NavLink key={l.to} to={l.to} end={l.end}
                  className={({ isActive }) => isActive ? 'font-semibold underline' : 'hover:underline'}>
                  {l.label}
                </NavLink>
              ))}
              {isAuthenticated && !needsAck && (
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
                    My Stats
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
                          to="/info"
                          onClick={closeUser}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-forest transition-colors ${isActive ? 'text-brand-700 dark:text-brand-400 font-medium' : ''}`
                          }
                        >
                          League Info
                        </NavLink>
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
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400">Theme</p>
                            <div className="flex items-center gap-0.5">
                              {THEME_OPTIONS.map(({ mode, icon, label }) => (
                                <button
                                  key={mode}
                                  onClick={() => setThemeMode(mode)}
                                  title={label}
                                  aria-label={label}
                                  className={`w-7 h-7 flex items-center justify-center rounded text-base transition-colors ${
                                    themeMode === mode
                                      ? 'bg-brand-600 text-white'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
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

            {/* Mobile: avatar drawer toggle (auth only) */}
            <div className="flex sm:hidden items-center gap-2">
              {isAuthenticated && !needsAck ? (
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

            <NavLink to="/info" onClick={close} className={mobileNavItem}>
              League Info
            </NavLink>
            <NavLink to={currentEventTo} end={currentEventEnd} onClick={close} className={mobileNavItem}>
              Current Event
            </NavLink>
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
              My Stats
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
            <div className="py-3 border-b border-brand-700 dark:border-forest-border flex items-center justify-between">
              <p className="text-xs text-brand-300">Theme</p>
              <div className="flex items-center gap-1">
                {THEME_OPTIONS.map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    title={label}
                    aria-label={label}
                    className={`w-8 h-8 flex items-center justify-center rounded text-base transition-colors ${
                      themeMode === mode
                        ? 'bg-brand-500 text-white'
                        : 'text-brand-200 hover:bg-brand-700 dark:hover:bg-forest-mid'
                    }`}
                  >
                    {icon}
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

      {/* ── MOTW modal (shown once per session if an active message exists) ── */}
      <MotwModal />

      {/* ── Phone nag modal (shown every session until user adds a phone number) ── */}
      {!needsAck && <PhoneNagModal />}

      {/* ── Content ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </PullToRefresh>

      <footer className="bg-brand-50 border-t border-brand-100 py-4 dark:bg-forest dark:border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400 dark:text-brand-300">
            Merrimack Valley Putting League
          </p>
          <div className="flex items-center gap-4">
            {/* Instagram */}
            <a
              href="https://www.instagram.com/merrimackvalleyputtingleague"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="text-gray-400 hover:text-pink-500 dark:text-brand-400 dark:hover:text-pink-400 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
            {/* Facebook */}
            <a
              href="https://www.facebook.com/people/Merrimack-Valley-Disc-Golf/100094599887789/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="text-gray-400 hover:text-blue-600 dark:text-brand-400 dark:hover:text-blue-400 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
