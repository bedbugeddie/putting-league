import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { ForumListResponse, ForumPost } from '../api/types'
import Spinner from '../components/ui/Spinner'
import Avatar from '../components/ui/Avatar'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const EMOJI_MAP = { LIKE: '👍', FIRE: '🔥', LAUGH: '😂' } as const

function ReactionBar({ post }: { post: ForumPost }) {
  const qc = useQueryClient()
  const toggleMut = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/forum/posts/${post.id}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum-posts'] }),
    onError: () => toast.error('Could not react'),
  })

  return (
    <div className="flex items-center gap-2">
      {(['LIKE', 'FIRE', 'LAUGH'] as const).map(emoji => (
        <button
          key={emoji}
          onClick={e => { e.preventDefault(); toggleMut.mutate(emoji) }}
          className={clsx(
            'flex items-center gap-1 text-sm px-2 py-0.5 rounded-full border transition-colors',
            post.reactions.viewer[emoji]
              ? 'bg-brand-100 dark:bg-brand-900 border-brand-400 dark:border-brand-500 text-brand-700 dark:text-brand-300'
              : 'border-gray-200 dark:border-forest-border text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500',
          )}
        >
          <span>{EMOJI_MAP[emoji]}</span>
          {post.reactions.counts[emoji] > 0 && (
            <span>{post.reactions.counts[emoji]}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function PostCard({ post }: { post: ForumPost }) {
  return (
    <Link
      to={`/forum/${post.id}`}
      className="block bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 hover:shadow-md dark:hover:border-brand-600 transition-all"
    >
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} avatarDataUrl={post.author.avatarDataUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white leading-snug">
            {post.title}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {post.author.name} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            {post.editedAt && ' · edited'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
            {post.body}
          </p>

          <div className="flex items-center justify-between mt-2">
            <ReactionBar post={post} />
            <span className="text-xs text-gray-400 dark:text-gray-500">
              💬 {post._count?.comments ?? 0}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function ForumPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const { data, isLoading } = useQuery<ForumListResponse>({
    queryKey: ['forum-posts', page],
    queryFn: () => api.get(`/forum/posts?page=${page}&limit=20`),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/forum/posts', { title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-posts'] })
      setTitle('')
      setBody('')
      setShowForm(false)
      toast.success('Post created!')
    },
    onError: () => toast.error('Could not create post'),
  })

  const posts = data?.posts ?? []
  const pages = data?.pages ?? 1

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Forum</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {/* New post form */}
      {showForm && (
        <div className="bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name}</span>
          </div>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white"
          />
          <textarea
            placeholder="What's on your mind?"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            maxLength={10_000}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={() => createMut.mutate()}
              disabled={!title.trim() || !body.trim() || createMut.isPending}
              className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {createMut.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {/* Post list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-2">💬</p>
          <p>No posts yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded border border-gray-200 dark:border-forest-border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-forest transition-colors text-gray-700 dark:text-gray-300"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1 text-sm rounded border border-gray-200 dark:border-forest-border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-forest transition-colors text-gray-700 dark:text-gray-300"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
