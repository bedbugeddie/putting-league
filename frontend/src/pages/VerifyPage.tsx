import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { authStore } from '../store/auth'
import Spinner from '../components/ui/Spinner'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('Missing token')
      return
    }

    api.get<{ token: string; user: any }>(`/auth/verify?token=${token}`)
      .then(({ token: jwt, user }) => {
        authStore.setAuth(jwt, user)
        navigate(user.isAdmin ? '/admin' : '/', { replace: true })
      })
      .catch(err => setError(err.message))
  }, [])

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

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Spinner className="mx-auto h-10 w-10 mb-4" />
        <p className="text-gray-600">Signing you in…</p>
      </div>
    </div>
  )
}
