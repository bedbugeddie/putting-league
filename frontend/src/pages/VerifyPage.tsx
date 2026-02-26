import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { authStore } from '../store/auth'
import Spinner from '../components/ui/Spinner'
import toast from 'react-hot-toast'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [redirectTo, setRedirectTo] = useState('/')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const token = searchParams.get('token')
    if (!token) { setError('Missing token'); return }

    api.get<{ token: string; user: any }>(`/auth/verify?token=${token}`)
      .then(({ token: jwt, user }) => {
        authStore.setAuth(jwt, user)
        const dest = user.isAdmin
          ? '/admin'
          : (!user.player?.divisionId ? '/choose-division' : '/')
        if (!user.hasPassword) {
          setRedirectTo(dest)
          setShowPasswordPrompt(true)
        } else {
          navigate(dest, { replace: true })
        }
      })
      .catch(err => setError(err.message))
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await api.post('/auth/set-password', { newPassword: password })
      toast.success('Password saved!')
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to set password')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <div className="text-4xl mb-3">❌</div>
          <h2 className="text-xl font-bold mb-2">Login failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <a href="/login" className="btn-primary">Try again</a>
        </div>
      </div>
    )
  }

  if (showPasswordPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50 dark:bg-forest px-4">
        <div className="card max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔑</div>
            <h1 className="text-2xl font-bold">You're signed in!</h1>
            <p className="text-gray-500 mt-2 text-sm">
              Want to set a password so you can sign in without a magic link next time? This is optional.
            </p>
          </div>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="input"
              />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="input"
              />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Saving…' : 'Set Password'}
            </button>
          </form>
          <button
            onClick={() => navigate(redirectTo, { replace: true })}
            className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 text-center"
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Spinner className="mx-auto h-10 w-10 mb-4" />
        <p className="text-gray-600">Signing you in…</p>
      </div>
    </div>
  )
}
