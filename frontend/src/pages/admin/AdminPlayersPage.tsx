import { useRef, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Player, Division } from '../../api/types'
import toast from 'react-hot-toast'
import Spinner from '../../components/ui/Spinner'
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortable } from '../../hooks/useSortable'

type ImportRow = { name: string; email: string; divisionCode: string; isActive: boolean }

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const parseRow = (line: string): string[] => {
    const fields: string[] = []
    let field = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { field += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(field); field = ''
      } else {
        field += ch
      }
    }
    fields.push(field)
    return fields
  }

  const headers = parseRow(lines[0]).map(h => h.trim().toLowerCase())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

export default function AdminPlayersPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ email: '', name: '', divisionId: '' })
  const [filterDivision, setFilterDivision] = useState('')
  const [filterAdmin, setFilterAdmin] = useState('')
  const [filterActive, setFilterActive] = useState('true')

  const { data: playersData, isLoading: pl } = useQuery<{ players: Player[] }>({
    queryKey: ['admin-players', search],
    queryFn: () => api.get(`/admin/players${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  })

  const { data: divisionsData } = useQuery<{ divisions: Division[] }>({
    queryKey: ['admin-divisions'],
    queryFn: () => api.get('/admin/divisions'),
  })

  const createMut = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/players', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-players'] })
      setShowNew(false)
      setForm({ email: '', name: '', divisionId: '' })
      toast.success('Player created')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const updateDivMut = useMutation({
    mutationFn: ({ id, divisionId }: { id: string; divisionId: string }) =>
      api.patch(`/admin/players/${id}`, { divisionId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-players'] }); toast.success('Division updated') },
    onError: (e: any) => toast.error(e.message),
  })

  const toggleAdminMut = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      api.patch(`/admin/players/${id}`, { isAdmin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-players'] }),
    onError: (e: any) => toast.error(e.message),
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/players/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-players'] }),
  })

  const importMut = useMutation({
    mutationFn: (players: ImportRow[]) => api.post('/admin/players/import', { players }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['admin-players'] })
      const { created, updated, errors } = res.results
      if (errors.length > 0) {
        toast.error(`${created} created, ${updated} updated — ${errors.length} error(s): ${errors[0]}`)
      } else {
        toast.success(`${created} created, ${updated} updated`)
      }
      setShowImport(false)
      setImportRows(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (e: any) => toast.error(e.message),
  })

  function handleExport() {
    const players = playersData?.players ?? []
    const rows = [
      ['name', 'email', 'division', 'active'],
      ...players.map(p => [p.user.name, p.user.email, p.division?.code ?? '', p.isActive ? 'true' : 'false']),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'players.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      const parsed: ImportRow[] = rows
        .map(r => ({
          name: r['name'] ?? '',
          email: r['email'] ?? '',
          divisionCode: r['division'] ?? r['divisioncode'] ?? r['division code'] ?? '',
          isActive: (r['active'] ?? r['isactive'] ?? 'true').toLowerCase() !== 'false',
        }))
        .filter(r => r.name && r.email && r.divisionCode)
      setImportRows(parsed)
    }
    reader.readAsText(file)
  }

  const { sortKey, sortDir, toggleSort } = useSortable('name')

  const players = playersData?.players ?? []
  const divisions = divisionsData?.divisions ?? []

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...players].sort((a, b) => {
      switch (sortKey) {
        case 'name':     return dir * a.user.name.localeCompare(b.user.name)
        case 'email':    return dir * a.user.email.localeCompare(b.user.email)
        case 'division': return dir * (a.division?.code ?? '').localeCompare(b.division?.code ?? '')
        case 'admin':    return dir * (Number(a.user.isAdmin) - Number(b.user.isAdmin))
        case 'active':   return dir * (Number(a.isActive) - Number(b.isActive))
        default:         return a.user.name.localeCompare(b.user.name)
      }
    })
  }, [players, sortKey, sortDir])

  const filtered = useMemo(() => {
    return sorted.filter(p => {
      if (filterDivision && (p.division?.code ?? '') !== filterDivision) return false
      if (filterAdmin === 'yes' && !p.user.isAdmin) return false
      if (filterAdmin === 'no' && p.user.isAdmin) return false
      if (filterActive === 'true' && !p.isActive) return false
      if (filterActive === 'false' && p.isActive) return false
      return true
    })
  }, [sorted, filterDivision, filterAdmin, filterActive])

  if (pl) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Players</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary text-sm" onClick={handleExport}>Export CSV</button>
          <button className="btn-secondary text-sm" onClick={() => { setShowImport(v => !v); setImportRows(null); if (fileRef.current) fileRef.current.value = '' }}>Import CSV</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Add Player</button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Import Players from CSV</h2>
            <p className="text-sm text-gray-500">
              CSV must have columns: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">name</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">email</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">division</code> (code), and optionally <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">active</code>.
              Existing players are updated; new ones are created.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm" onChange={handleFileChange} />

          {importRows !== null && (
            <div>
              {importRows.length === 0 ? (
                <p className="text-sm text-red-500">No valid rows found. Check that the CSV has the required columns and at least one data row.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Found <strong>{importRows.length}</strong> player{importRows.length !== 1 ? 's' : ''} to import:
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto text-sm mb-3">
                    {importRows.slice(0, 10).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2">
                        <span className="font-medium flex-1">{r.name}</span>
                        <span className="text-gray-400 text-xs">{r.email}</span>
                        <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200">{r.divisionCode}</span>
                        {!r.isActive && <span className="text-xs text-gray-400">inactive</span>}
                      </div>
                    ))}
                    {importRows.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-400">…and {importRows.length - 10} more</div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="btn-primary"
                      disabled={importMut.isPending}
                      onClick={() => importMut.mutate(importRows)}
                    >
                      {importMut.isPending ? 'Importing…' : `Import ${importRows.length} Player${importRows.length !== 1 ? 's' : ''}`}
                    </button>
                    <button className="btn-secondary" onClick={() => { setShowImport(false); setImportRows(null); if (fileRef.current) fileRef.current.value = '' }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add player form */}
      {showNew && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Add Player</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div>
              <label className="label">Division</label>
              <select className="input" value={form.divisionId} onChange={e => setForm(p => ({ ...p, divisionId: e.target.value }))}>
                <option value="">Select…</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.code} – {d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button className="btn-primary" disabled={!form.email || !form.name || !form.divisionId} onClick={() => createMut.mutate(form)}>Create</button>
            <button className="btn-secondary" onClick={() => { setShowNew(false); setForm({ email: '', name: '', divisionId: '' }) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          className="input max-w-sm"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input w-auto"
          value={filterDivision}
          onChange={e => setFilterDivision(e.target.value)}
        >
          <option value="">All Divisions</option>
          {divisions.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
        </select>
        <select
          className="input w-auto"
          value={filterAdmin}
          onChange={e => setFilterAdmin(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="yes">Admin only</option>
          <option value="no">Non-admin only</option>
        </select>
        <select
          className="input w-auto"
          value={filterActive}
          onChange={e => setFilterActive(e.target.value)}
        >
          <option value="">All Players</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <SortableHeader sortKey="name"     currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Name</SortableHeader>
              <SortableHeader sortKey="email"    currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Email</SortableHeader>
              <SortableHeader sortKey="division" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-4">Division</SortableHeader>
              <SortableHeader sortKey="admin"    currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center py-2 pr-4">Admin</SortableHeader>
              <SortableHeader sortKey="active"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center py-2">Active</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2 pr-4 font-medium">{p.user.name}</td>
                <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 text-xs">{p.user.email}</td>
                <td className="py-2 pr-4">
                  <select
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    value={p.divisionId}
                    onChange={e => updateDivMut.mutate({ id: p.id, divisionId: e.target.value })}
                  >
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-4 text-center">
                  <button
                    onClick={() => toggleAdminMut.mutate({ id: p.id, isAdmin: !p.user.isAdmin })}
                    title={p.user.isAdmin ? 'Remove admin' : 'Make admin'}
                    className="text-lg"
                  >
                    {p.user.isAdmin ? '✅' : '⬜'}
                  </button>
                </td>
                <td className="py-2 text-center">
                  <button onClick={() => toggleActiveMut.mutate({ id: p.id, isActive: !p.isActive })}>
                    {p.isActive ? '✅' : '❌'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No players found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
