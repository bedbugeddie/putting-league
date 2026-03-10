import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { authStore, useAuth } from '../store/auth'
import { api } from '../api/client'
import Avatar from './ui/Avatar'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/seasons', label: 'Seasons' },
  { to: '/admin/league-nights', label: 'League Nights' },
  { to: '/admin/divisions', label: 'Divisions' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/financials', label: 'Financials' },
  { to: '/admin/motd', label: 'MOTW' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  function signOut() { authStore.clearAuth(); navigate('/') }

  // Close on navigation
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  // Close menu when clicking/tapping outside the nav (covers both desktop dropdown and mobile drawer)
  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  useEffect(() => {
    api.get<{ user: any }>('/auth/me')
      .then(({ user: fresh }) => authStore.setAuth(authStore.getToken()!, fresh))
      .catch(() => authStore.clearAuth())
  }, [])

  // Current section label for the breadcrumb
  const currentLabel = navItems.find(item =>
    item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to)
  )?.label ?? 'Admin'

  return (
    <div className="min-h-screen flex flex-col">
      <nav ref={menuRef} className="bg-forest-surface text-white shadow-md border-b border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Left: logo + breadcrumb */}
            <div className="flex items-center gap-3">
              <Link to="/" className="text-brand-300 hover:text-brand-100 text-sm shrink-0">← Public site</Link>
              <img src="/mvpl.png" alt="MVPL" className="h-8 w-auto shrink-0" />
              <span className="hidden sm:inline text-white font-bold">Admin Panel</span>
              <span className="hidden sm:inline text-forest-border select-none">›</span>
              <span className="hidden sm:inline text-brand-300 text-sm font-medium">{currentLabel}</span>
            </div>

            {/* Right: profile button (desktop dropdown + mobile drawer trigger) */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-forest-mid transition-colors"
                aria-label="Open admin menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
                <span className="hidden sm:block text-sm text-white max-w-[120px] truncate leading-tight">
                  {user?.name}
                </span>
                <svg
                  className="hidden sm:block w-4 h-4 text-brand-300 shrink-0 transition-transform duration-150"
                  style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Desktop dropdown */}
              {menuOpen && (
                <div className="hidden sm:block absolute right-0 top-full mt-2 w-52 bg-forest-surface border border-forest-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-forest-border">
                    <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-xs text-brand-300 truncate">{user?.email}</p>
                  </div>
                  {/* Nav links */}
                  <div className="py-1">
                    {navItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `block px-4 py-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-forest-mid text-brand-300 font-medium'
                              : 'text-brand-200 hover:bg-forest-mid hover:text-white'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                  {/* Sign out */}
                  <div className="border-t border-forest-border py-1">
                    <button
                      onClick={signOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-brand-300 hover:bg-forest-mid hover:text-white transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="sm:hidden bg-forest px-4 pb-4">
            {/* User info */}
            <div className="flex items-center gap-2.5 py-3 border-b border-forest-border">
              <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                <p className="text-xs text-brand-300 truncate">{user?.email}</p>
              </div>
            </div>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block py-3 text-sm border-b border-forest-border ${
                    isActive ? 'font-semibold text-brand-300' : 'text-brand-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={signOut}
              className="block w-full text-left py-3 text-sm text-brand-300 border-b border-forest-border"
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
