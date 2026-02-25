import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { authStore } from '../store/auth'
import toast from 'react-hot-toast'

type Mode = 'password' | 'magic-link'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(searchParams.get('signup') ? 'magic-link' : 'password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { token, user } = await api.post<{ token: string; user: any }>(
        '/auth/login', { email, password }
      )
      authStore.setAuth(token, user)
      navigate(user.isAdmin ? '/admin' : '/', { replace: true })
    } catch (err: any) {
      if (err.message?.includes('No password set')) {
        toast.error('No password set for this account — use a magic link to sign in.')
        setMode('magic-link')
      } else {
        toast.error(err.message ?? 'Sign in failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/request', { email, name: name || undefined })
      setSent(true)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send login link')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50 dark:bg-forest">
        <div className="card max-w-md w-full text-center">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            We sent a sign-in link to <strong>{email}</strong>.<br />
            Click the link to sign in — it expires in 15 minutes.
          </p>
          <button className="btn-secondary w-full" onClick={() => setSent(false)}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 dark:bg-forest">
      <div className="card max-w-md w-full">
        <div className="text-center mb-6">
          <img src="/mvpl.png" alt="MVPL" className="h-16 w-auto mx-auto mb-3" />
          <h1 className="text-2xl font-bold">
            {searchParams.get('signup') ? 'Create an Account' : 'Sign In'}
          </h1>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode('magic-link')}
                className="text-sm text-brand-600 hover:underline"
              >
                Forgot password? Email me a sign-in link instead
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">
                Your name <span className="text-gray-400 font-normal">(required for new accounts)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                className="input"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send Sign-In Link'}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode('password')}
                className="text-sm text-brand-600 hover:underline"
              >
                Back to password sign-in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
