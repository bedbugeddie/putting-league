import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Division } from '../../api/types'
import toast from 'react-hot-toast'
import Spinner from '../../components/ui/Spinner'
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortable } from '../../hooks/useSortable'

interface DivisionForm { code: string; name: string; description: string; sortOrder: number; isActive: boolean }
const EMPTY: DivisionForm = { code: '', name: '', description: '', sortOrder: 0, isActive: true }

export default function AdminDivisionsPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Division | null>(null)
  const [form, setForm] = useState<DivisionForm>(EMPTY)
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery<{ divisions: Division[] }>({
    queryKey: ['admin-divisions'],
    queryFn: () => api.get('/admin/divisions'),
  })

  const createMut = useMutation({
    mutationFn: (d: DivisionForm) => api.post('/admin/divisions', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-divisions'] }); setShowNew(false); setForm(EMPTY); toast.success('Division created') },
    onError: (e: any) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DivisionForm> }) => api.patch(`/admin/divisions/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-divisions'] }); setEditing(null); toast.success('Division updated') },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/divisions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-divisions'] }); toast.success('Division deleted') },
    onError: (e: any) => toast.error(e.message),
  })

  function startEdit(d: Division) {
    setEditing(d)
    setForm({ code: d.code, name: d.name, description: d.description ?? '', sortOrder: d.sortOrder, isActive: d.isActive })
  }

  const { sortKey, sortDir, toggleSort } = useSortable('order')

  const divisions = data?.divisions ?? []

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...divisions].sort((a, b) => {
      switch (sortKey) {
        case 'code':    return dir * a.code.localeCompare(b.code)
        case 'name':    return dir * a.name.localeCompare(b.name)
        case 'players': return dir * ((a._count?.players ?? 0) - (b._count?.players ?? 0))
        case 'order':   return dir * (a.sortOrder - b.sortOrder)
        case 'active':  return dir * (Number(a.isActive) - Number(b.isActive))
        default:        return a.sortOrder - b.sortOrder
      }
    })
  }, [divisions, sortKey, sortDir])

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Divisions</h1>
        <button className="btn-primary" onClick={() => { setShowNew(true); setForm(EMPTY) }}>+ New Division</button>
      </div>

      {/* New / Edit form */}
      {(showNew || editing) && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Division' : 'New Division'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code</label><input className="input" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="AAA" /></div>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="A Pool – Advanced" /></div>
            <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><label className="label">Sort Order</label><input type="number" className="input" value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} /></div>
            <div className="flex items-center gap-2 col-span-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
              <label htmlFor="isActive" className="text-sm">Active</label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button className="btn-primary" onClick={() => editing ? updateMut.mutate({ id: editing.id, data: form }) : createMut.mutate(form)}>
              {editing ? 'Save' : 'Create'}
            </button>
            <button className="btn-secondary" onClick={() => { setEditing(null); setShowNew(false) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <SortableHeader sortKey="code"    currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Code</SortableHeader>
              <SortableHeader sortKey="name"    currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Name</SortableHeader>
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Description</th>
              <SortableHeader sortKey="players" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2 pr-4">Players</SortableHeader>
              <SortableHeader sortKey="order"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2 pr-4">Order</SortableHeader>
              <SortableHeader sortKey="active"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center py-2 pr-4">Active</SortableHeader>
              <th className="py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => (
              <tr key={d.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono font-bold text-brand-700">{d.code}</td>
                <td className="py-2 pr-4">{d.name}</td>
                <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">{d.description ?? <span className="italic text-gray-300">—</span>}</td>
                <td className="py-2 pr-4 text-right text-gray-500">{d._count?.players ?? 0}</td>
                <td className="py-2 pr-4 text-right text-gray-500">{d.sortOrder}</td>
                <td className="py-2 pr-4 text-center">{d.isActive ? '✅' : '❌'}</td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-brand-600" title="Edit" onClick={() => startEdit(d)}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    </button>
                    <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-400 hover:text-red-600" title="Delete" onClick={() => { if (confirm('Delete this division?')) deleteMut.mutate(d.id) }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
