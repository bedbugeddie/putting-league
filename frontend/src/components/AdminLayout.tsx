import { useEffect } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import { authStore } from '../store/auth'
import { api } from '../api/client'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/league-nights', label: 'League Nights' },
  { to: '/admin/seasons', label: 'Seasons' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/divisions', label: 'Divisions' },
]

export default function AdminLayout() {
  useEffect(() => {
    api.get<{ user: any }>('/auth/me')
      .then(({ user: fresh }) => authStore.setAuth(authStore.getToken()!, fresh))
      .catch(() => authStore.clearAuth())
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-forest-surface text-white shadow-md border-b border-forest-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link to="/" className="text-brand-300 hover:text-brand-100 text-sm">← Public site</Link>
              <span className="text-white font-bold">Admin Panel</span>
              <div className="flex items-center gap-2">
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
            <button
              onClick={() => authStore.clearAuth()}
              className="text-brand-300 hover:text-white text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
