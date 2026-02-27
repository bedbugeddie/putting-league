import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { LeagueNight, Season } from '../../api/types'
import toast from 'react-hot-toast'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortable } from '../../hooks/useSortable'
import { format } from 'date-fns'

type NightForm = {
  seasonId: string; date: string; tieBreakerMode: 'SPLIT' | 'PUTT_OFF'
  holeCount: number; roundCount: number; notes: string
}

function formDefaults(nights: LeagueNight[], seasons: Season[]): NightForm {
  const latest = nights[0] // list is already sorted date desc
  return {
    seasonId: latest?.seasonId ?? seasons.find(s => s.isActive)?.id ?? '',
    date: '',
    tieBreakerMode: latest?.tieBreakerMode ?? 'SPLIT',
    holeCount: latest?._count?.holes ?? 6,
    roundCount: latest?._count?.rounds ?? 2,
    notes: '',
  }
}

function recurringDates(dateLocal: string, count: number): Date[] {
  if (!dateLocal || count < 1) return []
  const base = new Date(dateLocal)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i * 7)
    return d
  })
}

export default function AdminLeagueNightsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [weekCount, setWeekCount] = useState(8)
  const [form, setForm] = useState<NightForm>({
    seasonId: '', date: '', tieBreakerMode: 'SPLIT',
    holeCount: 6, roundCount: 3, notes: ''
  })

  const { data: nightsData, isLoading: nl } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
  })

  const { data: seasonsData } = useQuery<{ seasons: Season[] }>({
    queryKey: ['admin-seasons'],
    queryFn: () => api.get('/admin/seasons'),
  })

  const createMut = useMutation({
    mutationFn: async (isoDates: string[]) => {
      for (const date of isoDates) {
        await api.post('/admin/league-nights', {
          seasonId: form.seasonId,
          tieBreakerMode: form.tieBreakerMode,
          holeCount: form.holeCount,
          roundCount: form.roundCount,
          notes: form.notes,
          date,
        })
      }
    },
    onSuccess: (_data, isoDates) => {
      qc.invalidateQueries({ queryKey: ['league-nights'] })
      setShowNew(false)
      toast.success(isoDates.length > 1 ? `${isoDates.length} league nights created` : 'League night created')
    },
    onError: (e: any) => toast.error(e.message),
  })

  function handleCreate() {
    const dates = recurring
      ? recurringDates(form.date, weekCount).map(d => d.toISOString())
      : [new Date(form.date).toISOString()]
    createMut.mutate(dates)
  }

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/league-nights/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league-nights'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/league-nights/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-nights'] }); toast.success('League night deleted') },
    onError: (e: any) => toast.error(e.message),
  })

  const { sortKey, sortDir, toggleSort } = useSortable('date', 'asc')

  const nights = nightsData?.leagueNights ?? []
  const seasons = seasonsData?.seasons ?? []

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...nights].sort((a, b) => {
      switch (sortKey) {
        case 'date':   return dir * (new Date(a.date).getTime() - new Date(b.date).getTime())
        case 'season': return dir * (a.season?.name ?? '').localeCompare(b.season?.name ?? '')
        case 'status': return dir * a.status.localeCompare(b.status)
        default:       return new Date(a.date).getTime() - new Date(b.date).getTime()
      }
    })
  }, [nights, sortKey, sortDir])

  if (nl) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">League Nights</h1>
        <button className="btn-primary" onClick={() => { setForm(formDefaults(nights, seasons)); setShowNew(true) }}>+ New Night</button>
      </div>

      {showNew && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">New League Night</h2>
            {nights.length > 0 && (
              <span className="text-xs text-gray-400">Settings copied from most recent night</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Season</label>
              <select className="input" value={form.seasonId} onChange={e => setForm(p => ({ ...p, seasonId: e.target.value }))}>
                <option value="">Select season…</option>
                {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{recurring ? 'First Date' : 'Date'}</label>
              <input type="datetime-local" className="input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tie-Breaker</label>
              <select className="input" value={form.tieBreakerMode} onChange={e => setForm(p => ({ ...p, tieBreakerMode: e.target.value as any }))}>
                <option value="SPLIT">Split Winnings</option>
                <option value="PUTT_OFF">Putt-Off</option>
              </select>
            </div>
            <div><label className="label">Number of Holes</label><input type="number" className="input" value={form.holeCount} min={1} max={36} onChange={e => setForm(p => ({ ...p, holeCount: Number(e.target.value) }))} /></div>
            <div><label className="label">Number of Rounds</label><input type="number" className="input" value={form.roundCount} min={1} max={20} onChange={e => setForm(p => ({ ...p, roundCount: Number(e.target.value) }))} /></div>
            <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>

          {/* Recurring toggle */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={recurring}
                onChange={e => setRecurring(e.target.checked)}
              />
              <label htmlFor="recurring" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Repeat weekly
              </label>
            </div>

            {recurring && (
              <div className="flex items-start gap-6">
                <div>
                  <label className="label">Number of weeks</label>
                  <input
                    type="number"
                    min={2} max={52}
                    value={weekCount}
                    onChange={e => setWeekCount(Math.max(2, Math.min(52, Number(e.target.value))))}
                    className="input w-24"
                  />
                </div>

                {form.date && (
                  <div className="flex-1">
                    <p className="label mb-1">Nights to be created ({weekCount})</p>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-40 overflow-y-auto text-sm">
                      {recurringDates(form.date, weekCount).map((d, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-1.5">
                          <span className="text-xs text-gray-400 w-6">{i + 1}.</span>
                          <span>{format(d, 'EEE, MMM d, yyyy')}</span>
                          <span className="text-gray-400 text-xs">{format(d, 'h:mm a')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={!form.seasonId || !form.date || createMut.isPending}
            >
              {createMut.isPending
                ? 'Creating…'
                : recurring
                  ? `Create ${weekCount} Nights`
                  : 'Create'}
            </button>
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <SortableHeader sortKey="date"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Date</SortableHeader>
              <SortableHeader sortKey="season" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Season</SortableHeader>
              <SortableHeader sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center py-2 pr-4">Status</SortableHeader>
              <th className="py-2 w-24 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(n => (
              <tr key={n.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium">
                  <Link to={`/admin/league-nights/${n.id}`} className="hover:text-brand-600 hover:underline">
                    {format(new Date(n.date), 'MMM d, yyyy h:mm a')}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-gray-500">{n.season?.name}</td>
                <td className="py-2 pr-4 text-center"><StatusBadge status={n.status} /></td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/admin/league-nights/${n.id}`} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-brand-600" title="Details">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                    </Link>
                    {n.status === 'SCHEDULED' && (
                      <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-green-600" title="Start night" onClick={() => statusMut.mutate({ id: n.id, status: 'IN_PROGRESS' })}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
                      </button>
                    )}
                    {n.status === 'IN_PROGRESS' && (
                      <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600" title="Mark complete" onClick={() => statusMut.mutate({ id: n.id, status: 'COMPLETED' })}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                      </button>
                    )}
                    <button
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-400 hover:text-red-600"
                      title="Delete"
                      onClick={() => { if (confirm(`Delete the league night on ${format(new Date(n.date), 'MMM d, yyyy')}? All scores and check-ins will be lost.`)) deleteMut.mutate(n.id) }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {nights.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400">No league nights yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
