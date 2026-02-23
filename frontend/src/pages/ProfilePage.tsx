import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { authStore } from '../store/auth'
import type { PlayerStats, NightHistory } from '../api/types'
import Spinner from '../components/ui/Spinner'
import toast from 'react-hot-toast'

// ── Account info form ─────────────────────────────────────────────────────────

function AccountForm() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [loading, setLoading] = useState(false)

  const dirty = name !== user?.name || email !== user?.email

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setLoading(true)
    try {
      const { token, user: fresh } = await api.patch<{ token: string; user: any }>(
        '/auth/profile', { name, email }
      )
      authStore.setAuth(token, fresh)
      toast.success('Profile updated!')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Account Info</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !dirty}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

// ── Password form ─────────────────────────────────────────────────────────────

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      await api.post('/auth/set-password', {
        currentPassword: currentPassword || undefined,
        newPassword,
      })
      toast.success('Password updated!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Password</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">
            Current password{' '}
            <span className="text-gray-400 font-normal">(leave blank if none set yet)</span>
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            className="input"
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="input"
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            className="input"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save Password'}
        </button>
      </form>
    </div>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user } = useAuth()
  const playerId = user?.player?.id

  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: PlayerStats | null }>({
    queryKey: ['player-stats', playerId],
    queryFn: () => api.get(`/players/${playerId}/stats`),
    enabled: !!playerId,
  })

  const { data: historyData, isLoading: histLoading } = useQuery<{ history: NightHistory[] }>({
    queryKey: ['player-history', playerId],
    queryFn: () => api.get(`/players/${playerId}/history`),
    enabled: !!playerId,
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">My Profile</h1>

      <AccountForm />
      <PasswordForm />

      {/* Stats */}
      {playerId && (
        <>
          {statsLoading || histLoading ? (
            <div className="flex justify-center py-10"><Spinner className="h-8 w-8" /></div>
          ) : (
            <>
              {statsData?.stats ? (
                <>
                  <div>
                    <h2 className="text-lg font-semibold mb-3">My Stats</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <StatCard label="Total Score" value={statsData.stats.totalScore} />
                      <StatCard label="League Nights" value={statsData.stats.nightsPlayed} />
                      <StatCard label="Avg per Night" value={statsData.stats.avgPerNight} />
                      <StatCard label="Best Night" value={statsData.stats.highestNight} />
                      <StatCard label="3-for-3 Bonuses" value={statsData.stats.totalBonus} />
                      <StatCard label="Short Accuracy" value={`${(statsData.stats.shortAccuracy * 100).toFixed(1)}%`} />
                      <StatCard label="Long Accuracy" value={`${(statsData.stats.longAccuracy * 100).toFixed(1)}%`} />
                      <StatCard label="Total Made" value={statsData.stats.totalMade} sub={`of ${statsData.stats.totalAttempts * 3}`} />
                    </div>
                  </div>

                  {(historyData?.history ?? []).length > 0 && (
                    <div className="card">
                      <h2 className="text-lg font-semibold mb-4">Score History</h2>
                      <div className="space-y-2">
                        {(historyData!.history).slice(-12).map(h => (
                          <div key={h.leagueNightId} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-24 shrink-0">
                              {new Date(h.date).toLocaleDateString()}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden dark:bg-gray-700">
                              <div
                                className="bg-brand-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, (h.totalScore / 50) * 100)}%` }}
                              />
                              <span className="absolute right-2 top-0 text-xs leading-5 font-semibold text-gray-700">
                                {h.totalScore}
                              </span>
                            </div>
                            <span className="text-xs text-yellow-600 w-16 shrink-0">
                              {h.bonuses > 0 ? `+${h.bonuses} ★` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card text-center text-gray-500 py-8">
                  No scoring data yet. Play some rounds!
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
