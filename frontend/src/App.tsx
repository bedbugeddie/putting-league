import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useTheme } from './store/theme'

// Layout
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'

// Public pages
import LoginPage from './pages/LoginPage'
import VerifyPage from './pages/VerifyPage'
import LandingPage from './pages/LandingPage'
import ChooseDivisionPage from './pages/ChooseDivisionPage'

// Leaderboard / viewer pages
import LeagueNightsPage from './pages/LeagueNightsPage'
import LeagueNightPage from './pages/LeagueNightPage'
import LeaderboardPage from './pages/LeaderboardPage'
import PlayerDashboardPage from './pages/PlayerDashboardPage'
import ProfilePage from './pages/ProfilePage'
import SeasonsPage from './pages/SeasonsPage'
import SeasonPage from './pages/SeasonPage'
import StatsPage from './pages/StatsPage'

// Scoring
import ScoringPage from './pages/ScoringPage'

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminDivisionsPage from './pages/admin/AdminDivisionsPage'
import AdminSeasonsPage from './pages/admin/AdminSeasonsPage'
import AdminLeagueNightsPage from './pages/admin/AdminLeagueNightsPage'
import AdminLeagueNightDetailPage from './pages/admin/AdminLeagueNightDetailPage'
import AdminCheckInPage from './pages/admin/AdminCheckInPage'
import AdminPlayersPage from './pages/admin/AdminPlayersPage'
import AdminPlayerDetailPage from './pages/admin/AdminPlayerDetailPage'
import AdminPayoutPage from './pages/admin/AdminPayoutPage'

function HomeRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <LeagueNightsPage /> : <LandingPage />
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}


export default function App() {
  useTheme()
  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/verify" element={<VerifyPage />} />
      <Route path="/choose-division" element={<ChooseDivisionPage />} />

      {/* Public / viewer routes inside main layout */}
      <Route element={<Layout />}>
        <Route index element={
          <HomeRoute />
        } />
        <Route path="league-nights/:id" element={<LeagueNightPage />} />
        <Route path="league-nights/:id/leaderboard" element={<LeaderboardPage />} />
        <Route path="seasons" element={<SeasonsPage />} />
        <Route path="seasons/:id" element={<SeasonPage />} />
        <Route path="stats" element={<StatsPage />} />

        {/* Requires login */}
        <Route path="dashboard" element={
          <RequireAuth><PlayerDashboardPage /></RequireAuth>
        } />
        <Route path="profile" element={
          <RequireAuth><ProfilePage /></RequireAuth>
        } />
        <Route path="scoring/:id" element={
          <RequireAuth><ScoringPage /></RequireAuth>
        } />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={
        <RequireAdmin><AdminLayout /></RequireAdmin>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="divisions" element={<AdminDivisionsPage />} />
        <Route path="seasons" element={<AdminSeasonsPage />} />
        <Route path="league-nights" element={<AdminLeagueNightsPage />} />
        <Route path="league-nights/:id" element={<AdminLeagueNightDetailPage />} />
        <Route path="league-nights/:id/checkin" element={<AdminCheckInPage />} />
        <Route path="league-nights/:id/payout" element={<AdminPayoutPage />} />
        <Route path="players" element={<AdminPlayersPage />} />
        <Route path="players/:id" element={<AdminPlayerDetailPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
