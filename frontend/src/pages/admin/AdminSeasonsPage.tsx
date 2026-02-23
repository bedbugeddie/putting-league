import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Season } from '../../api/types'
import toast from 'react-hot-toast'
import Spinner from '../../components/ui/Spinner'
import { format } from 'date-fns'

type EditForm = { name: string; startDate: string; endDate: string; isActive: boolean }

const toDateInput = (iso?: string) => iso ? iso.split('T')[0] : ''

export default function AdminSeasonsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', startDate: '', endDate: '', isActive: true })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', startDate: '', endDate: '', isActive: true })

  const { data, isLoading } = useQuery<{ seasons: Season[] }>({
    queryKey: ['admin-seasons'],
    queryFn: () => api.get('/admin/seasons'),
  })

  const createMut = useMutation({
    mutationFn: (d: typeof newForm) => api.post('/admin/seasons', {
      name: d.name,
      startDate: new Date(d.startDate).toISOString(),
      ...(d.endDate ? { endDate: new Date(d.endDate).toISOString() } : {}),
      isActive: d.isActive,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-seasons'] })
      setShowNew(false)
      setNewForm({ name: '', startDate: '', endDate: '', isActive: true })
      toast.success('Season created')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/seasons/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-seasons'] }); toast.success('Season deleted') },
    onError: (e: any) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, form }: { id: string; form: EditForm }) =>
      api.patch(`/admin/seasons/${id}`, {
        name: form.name,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        isActive: form.isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-seasons'] })
      setEditingId(null)
      toast.success('Season updated')
    },
    onError: (e: any) => toast.error(e.message),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const seasons = data?.seasons ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seasons</h1>
        <button className="btn-primary" onClick={() => { setShowNew(true); setEditingId(null) }}>+ New Season</button>
      </div>

      {showNew && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">New Season</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="label">Name</label>
              <input className="input" value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} placeholder="2025 Season" />
            </div>
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={newForm.startDate} onChange={e => setNewForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" className="input" value={newForm.endDate} onChange={e => setNewForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input type="checkbox" id="new-active" checked={newForm.isActive} onChange={e => setNewForm(p => ({ ...p, isActive: e.target.checked }))} />
            <label htmlFor="new-active" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              className="btn-primary"
              disabled={!newForm.name || !newForm.startDate || createMut.isPending}
              onClick={() => createMut.mutate(newForm)}
            >
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowNew(false); setNewForm({ name: '', startDate: '', endDate: '', isActive: true }) }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {seasons.map(s => (
          <div key={s.id} className="card">
            {editingId === s.id ? (
              <div className="space-y-4">
                <h2 className="text-base font-semibold">Edit Season</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Name</label>
                    <input className="input" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Start Date</label>
                    <input type="date" className="input" value={editForm.startDate} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="date" className="input" value={editForm.endDate} onChange={e => setEditForm(p => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`active-${s.id}`}
                    checked={editForm.isActive}
                    onChange={e => setEditForm(p => ({ ...p, isActive: e.target.checked }))}
                  />
                  <label htmlFor={`active-${s.id}`} className="text-sm text-gray-700 dark:text-gray-300">Active</label>
                </div>
                <div className="flex gap-3">
                  <button
                    className="btn-primary"
                    disabled={!editForm.name || !editForm.startDate || updateMut.isPending}
                    onClick={() => updateMut.mutate({ id: s.id, form: editForm })}
                  >
                    {updateMut.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(s.startDate), 'MMM d, yyyy')}
                    {s.endDate && ` – ${format(new Date(s.endDate), 'MMM d, yyyy')}`}
                    {' · '}{s._count?.leagueNights ?? 0} nights
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {s.isActive && <span className="badge bg-green-100 text-green-700">Active</span>}
                  <button
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => { if (confirm(`Delete "${s.name}"? This will also delete all its league nights and scores.`)) deleteMut.mutate(s.id) }}
                  >
                    Delete
                  </button>
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => {
                      setEditingId(s.id)
                      setShowNew(false)
                      setEditForm({
                        name: s.name,
                        startDate: toDateInput(s.startDate),
                        endDate: toDateInput(s.endDate),
                        isActive: s.isActive,
                      })
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
