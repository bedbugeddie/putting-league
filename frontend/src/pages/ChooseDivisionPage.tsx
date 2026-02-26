import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { authStore, useAuth } from '../store/auth'
import type { Division } from '../api/types'
import Spinner from '../components/ui/Spinner'
import toast from 'react-hot-toast'

export default function ChooseDivisionPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true })
      return
    }
    api.get<{ divisions: Division[] }>('/divisions')
      .then(({ divisions }) => setDivisions(divisions))
      .catch(() => toast.error('Failed to load divisions'))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  async function handleSelect(divisionId: string) {
    setSaving(divisionId)
    try {
      const { token, user } = await api.patch<{ token: string; user: any }>(
        '/players/me',
        { divisionId }
      )
      authStore.setAuth(token, user)
      navigate('/', { replace: true })
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to set division')
      setSaving(null)
    }
  }

  function handleSkip() {
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-10 w-10" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-forest flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <img src="/mvpl.png" alt="MVPL" className="h-16 w-auto mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Choose Your Division</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Select the division that best fits your putting skill level.
          </p>
        </div>

        {divisions.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">🥏</div>
            <p className="text-gray-500 dark:text-gray-400">
              No divisions have been set up yet. You can choose one later from your profile.
            </p>
            <button onClick={handleSkip} className="btn-primary mt-6">
              Continue to App
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {divisions.map(div => (
                <button
                  key={div.id}
                  onClick={() => handleSelect(div.id)}
                  disabled={!!saving}
                  className="card text-left hover:border-brand-500 hover:shadow-md transition-all cursor-pointer border-2 border-transparent disabled:opacity-60 focus:outline-none focus:border-brand-500"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="inline-block bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-xs font-bold px-2 py-0.5 rounded tracking-wide">
                          {div.code}
                        </span>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{div.name}</h3>
                      </div>
                      {div.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                          {div.description}
                        </p>
                      )}
                    </div>
                    {saving === div.id && (
                      <Spinner className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="text-center mt-8">
              <button
                onClick={handleSkip}
                disabled={!!saving}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
              >
                Skip for now — I'll choose from my profile later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
