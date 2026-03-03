import { useState } from 'react'
import { api } from '../api/client'
import { authStore, useAuth } from '../store/auth'

/** sessionStorage key — suppress for the rest of this tab session if dismissed */
const SS_KEY = 'phone_nag_dismissed'

/** Returns true if the string is a valid 10- or 11-digit (with leading 1) US number. */
function isValidPhone(v: string) {
  const d = v.replace(/\D/g, '')
  return d.length === 10 || (d.length === 11 && d.startsWith('1'))
}

/**
 * Shown once per session when an authenticated user has no phone number on file.
 * The modal cannot be permanently skipped — it reappears every session until
 * a number is saved.
 */
export default function PhoneNagModal() {
  const { user, isAuthenticated } = useAuth()
  const [phone,     setPhone]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [dismissed, setDismissed] = useState(
    () => !!sessionStorage.getItem(SS_KEY)
  )
  const [saved, setSaved] = useState(false)

  // Only show for authenticated users without a phone number
  if (!isAuthenticated || !!user?.phone || dismissed || saved) return null

  const phoneError = phone.trim() && !isValidPhone(phone)
    ? 'Please enter a valid 10-digit US phone number'
    : null

  function handleDismiss() {
    sessionStorage.setItem(SS_KEY, '1')
    setDismissed(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim() || phoneError) return
    setLoading(true)
    try {
      const { token, user: fresh } = await api.patch<{ token: string; user: any }>(
        '/auth/profile', { phone: phone.trim() }
      )
      authStore.setAuth(token, fresh)
      setSaved(true)
    } catch (err: any) {
      // Surface error inline; don't toast so the modal stays visible
      console.error('Failed to save phone:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-forest-surface rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-forest-border overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl mt-0.5" aria-hidden>📱</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                Add your mobile number
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your phone number lets the league contact you about upcoming nights,
                last-minute changes, and scoring updates.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div>
            <label className="label">Mobile Phone</label>
            <input
              type="tel"
              autoFocus
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 555-1234"
              maxLength={20}
              className={`input ${phoneError ? 'border-red-400 focus:ring-red-400' : ''}`}
            />
            {phoneError && (
              <p className="text-xs text-red-500 mt-1">{phoneError}</p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleDismiss}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-2 transition-colors text-center"
            >
              Remind me later
            </button>
            <button
              type="submit"
              disabled={loading || !phone.trim() || !!phoneError}
              className="btn-primary disabled:opacity-50 sm:min-w-[120px]"
            >
              {loading ? 'Saving…' : 'Save Number'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
