import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AppSettings } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'

export default function AdminSettingsPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ settings: AppSettings }>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings'),
  })

  const [house, setHouse] = useState('')
  const [eoy, setEoy]     = useState('')

  // Populate fields once data loads
  useEffect(() => {
    if (data?.settings) {
      setHouse(String(data.settings.housePerEntry))
      setEoy(String(data.settings.eoyPerEntry))
    }
  }, [data])

  const saveMut = useMutation({
    mutationFn: (body: Partial<AppSettings>) => api.patch('/admin/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success('Settings saved!')
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to save settings'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const houseVal = parseFloat(house)
    const eoyVal   = parseFloat(eoy)
    if (isNaN(houseVal) || houseVal < 0) return toast.error('House amount must be 0 or more')
    if (isNaN(eoyVal)   || eoyVal   < 0) return toast.error('EOY amount must be 0 or more')
    saveMut.mutate({ housePerEntry: houseVal, eoyPerEntry: eoyVal })
  }

  const houseNum = parseFloat(house)
  const eoyNum   = parseFloat(eoy)

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">League Settings</h1>

      {/* Fee split card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-1">Entry Fee Split</h2>
        <p className="text-sm text-gray-500 mb-5">
          Per-player deductions taken from each entry fee before the payout pool is calculated.
          The remainder goes to the night's payout pool.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">House ($ per entry)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={house}
                  onChange={e => setHouse(e.target.value)}
                  className="input pl-7"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Operational / running costs</p>
            </div>
            <div>
              <label className="label">End of Year ($ per entry)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={eoy}
                  onChange={e => setEoy(e.target.value)}
                  className="input pl-7"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Season-end prize pool</p>
            </div>
          </div>

          {/* Live preview */}
          {!isNaN(houseNum) && !isNaN(eoyNum) && (
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400">
              Example — <strong className="text-gray-700 dark:text-gray-300">$8 entry</strong>:{' '}
              <span className="text-gray-500">${houseNum.toFixed(2)} house</span> ·{' '}
              <span className="text-blue-600 dark:text-blue-400">${eoyNum.toFixed(2)} EOY</span> ·{' '}
              <span className="text-yellow-600 dark:text-yellow-400">
                ${Math.max(0, 8 - houseNum - eoyNum).toFixed(2)} payout pool
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={saveMut.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  )
}
