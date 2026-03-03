import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { Motd } from '../../api/types'

// ── Status helpers ────────────────────────────────────────────────────────────

type MotdStatus = 'upcoming' | 'active' | 'expired'

function getStatus(motd: Motd): MotdStatus {
  const now = new Date()
  if (new Date(motd.startDate) > now) return 'upcoming'
  if (new Date(motd.endDate)   < now) return 'expired'
  return 'active'
}

const STATUS_PILL: Record<MotdStatus, { label: string; cls: string }> = {
  upcoming: { label: '⏳ Upcoming', cls: 'bg-blue-100  dark:bg-blue-900/30  text-blue-700  dark:text-blue-300'  },
  active:   { label: '✅ Active',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  expired:  { label: '❌ Expired',  cls: 'bg-gray-100  dark:bg-gray-700     text-gray-500  dark:text-gray-400'  },
}

// ── Form helpers ──────────────────────────────────────────────────────────────

interface MotdForm {
  title:     string
  body:      string
  startDate: string
  endDate:   string
}

const EMPTY: MotdForm = { title: '', body: '', startDate: '', endDate: '' }

function motdToForm(m: Motd): MotdForm {
  return {
    title:     m.title ?? '',
    body:      m.body,
    startDate: format(new Date(m.startDate), 'yyyy-MM-dd'),
    endDate:   format(new Date(m.endDate),   'yyyy-MM-dd'),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminMotdPage() {
  const qc = useQueryClient()

  const [editTarget, setEditTarget] = useState<Motd | null>(null)
  const [creating,   setCreating]   = useState(false)
  const [form, setForm]             = useState<MotdForm>(EMPTY)

  const showForm = creating || editTarget !== null

  const { data: motds = [], isLoading } = useQuery<Motd[]>({
    queryKey: ['admin-motd'],
    queryFn:  () => api.get('/admin/motd'),
  })

  const createMut = useMutation({
    mutationFn: (f: MotdForm) =>
      api.post<Motd>('/admin/motd', {
        title:     f.title.trim() || undefined,
        body:      f.body,
        startDate: new Date(f.startDate).toISOString(),
        endDate:   new Date(f.endDate + 'T23:59:59').toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-motd'] })
      cancelForm()
      toast.success('MOTD created')
    },
    onError: () => toast.error('Failed to create MOTD'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, f }: { id: string; f: MotdForm }) =>
      api.patch<Motd>(`/admin/motd/${id}`, {
        title:     f.title.trim() || null,
        body:      f.body,
        startDate: new Date(f.startDate).toISOString(),
        endDate:   new Date(f.endDate + 'T23:59:59').toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-motd'] })
      cancelForm()
      toast.success('MOTD updated')
    },
    onError: () => toast.error('Failed to update MOTD'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/motd/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-motd'] })
      toast.success('MOTD deleted')
    },
    onError: () => toast.error('Failed to delete MOTD'),
  })

  function startCreate() { setCreating(true); setEditTarget(null); setForm(EMPTY) }
  function startEdit(m: Motd) { setEditTarget(m); setCreating(false); setForm(motdToForm(m)) }
  function cancelForm() { setCreating(false); setEditTarget(null); setForm(EMPTY) }

  function field(k: keyof MotdForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function submit() {
    if (!form.body.trim())          return toast.error('Message body is required')
    if (!form.startDate)            return toast.error('Start date is required')
    if (!form.endDate)              return toast.error('End date is required')
    if (form.endDate < form.startDate) return toast.error('End date must be after start date')
    if (editTarget) updateMut.mutate({ id: editTarget.id, f: form })
    else            createMut.mutate(form)
  }

  const isSaving = createMut.isPending || updateMut.isPending

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-forest-border ' +
    'bg-white dark:bg-forest-mid text-gray-900 dark:text-white text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-sm text-brand-600 hover:underline">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Message of the Day</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Display announcements to players when they visit the site.{' '}
            <span className="font-medium">Supports Markdown formatting.</span>{' '}
            Only the most recent active message is shown.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="shrink-0 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New MOTD
          </button>
        )}
      </div>

      {/* ── Create / Edit form ── */}
      {showForm && (
        <div className="bg-white dark:bg-forest-surface rounded-xl border border-gray-200 dark:border-forest-border p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {editTarget ? 'Edit MOTD' : 'New MOTD'}
          </h2>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={field('title')}
              placeholder="e.g. Week 5 Announcement"
              className={inputCls}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message Body{' '}
              <span className="font-normal text-gray-400 text-xs">(Markdown supported: **bold**, *italic*, - lists, ## headings)</span>
            </label>
            <textarea
              value={form.body}
              onChange={field('body')}
              placeholder="## Heading&#10;**Bold** or *italic* text&#10;- Bullet one&#10;- Bullet two"
              rows={9}
              className={inputCls + ' font-mono resize-y'}
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={field('startDate')} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={field('endDate')} className={inputCls} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={submit}
              disabled={isSaving}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isSaving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create MOTD'}
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── MOTD list ── */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500">Loading…</div>
      ) : motds.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-3">📣</p>
          <p className="font-medium text-base">No messages yet</p>
          <p className="text-sm mt-1">Create one to display an announcement to players.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {motds.map(motd => {
            const s = getStatus(motd)
            const { label, cls } = STATUS_PILL[s]
            return (
              <div
                key={motd.id}
                className="bg-white dark:bg-forest-surface rounded-xl border border-gray-200 dark:border-forest-border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Status + title */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                      {motd.title && (
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {motd.title}
                        </span>
                      )}
                    </div>
                    {/* Date range */}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                      {format(new Date(motd.startDate), 'MMM d, yyyy')}
                      {' → '}
                      {format(new Date(motd.endDate), 'MMM d, yyyy')}
                    </p>
                    {/* Body preview */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      {motd.body}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 shrink-0 pt-0.5">
                    <button
                      onClick={() => startEdit(motd)}
                      className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this MOTD?')) deleteMut.mutate(motd.id)
                      }}
                      className="text-sm text-red-500 dark:text-red-400 hover:underline font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
