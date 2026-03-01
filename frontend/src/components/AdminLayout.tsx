import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { authStore } from '../store/auth'
import { api } from '../api/client'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/seasons', label: 'Seasons' },
  { to: '/admin/league-nights', label: 'League Nights' },
  { to: '/admin/divisions', label: 'Divisions' },
  { to: '/admin/players', label: 'Players' },
]

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  function signOut() { authStore.clearAuth(); navigate('/') }

  // Close menu on navigation
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    api.get<{ user: any }>('/auth/me')
      .then(({ user: fresh }) => authStore.setAuth(authStore.getToken()!, fresh))
      .catch(() => authStore.clearAuth())
  }, [])

  const mobileNavItem = ({ isActive }: { isActive: boolean }) =>
    `block py-3 text-sm border-b border-forest-border ${isActive ? 'font-semibold text-brand-300' : 'text-brand-200'}`

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-forest-surface text-white shadow-md border-b border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Left: title + desktop nav links */}
            <div className="flex items-center gap-6">
              <Link to="/" className="text-brand-300 hover:text-brand-100 text-sm">← Public site</Link>
              <img src="/mvpl.png" alt="MVPL" className="h-8 w-auto" />
              <span className="text-white font-bold">Admin Panel</span>
              <div className="hidden sm:flex items-center gap-2">
                {navItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `px-3 py-1 rounded text-sm ${isActive ? 'bg-forest-mid text-brand-300' : 'text-brand-200 hover:text-white hover:bg-forest-mid'}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Desktop: sign out */}
            <button
              onClick={signOut}
              className="hidden sm:block text-brand-300 hover:text-white text-sm"
            >
              Sign out
            </button>

            {/* Mobile: hamburger */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="sm:hidden p-2 rounded hover:bg-forest-mid transition-colors"
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
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden bg-forest px-4 pb-4">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={mobileNavItem}
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
