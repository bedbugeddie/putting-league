import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { ForumPost, ForumComment, ReactionSummary } from '../api/types'
import Spinner from '../components/ui/Spinner'
import Avatar from '../components/ui/Avatar'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const EMOJI_MAP = { LIKE: '👍', FIRE: '🔥', LAUGH: '😂' } as const
type Emoji = keyof typeof EMOJI_MAP

// ── Reaction bar ──────────────────────────────────────────────────────────────

function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: ReactionSummary
  onToggle: (emoji: Emoji) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {(['LIKE', 'FIRE', 'LAUGH'] as Emoji[]).map(emoji => (
        <button
          key={emoji}
          onClick={() => onToggle(emoji)}
          className={clsx(
            'flex items-center gap-1 text-sm px-2 py-0.5 rounded-full border transition-colors',
            reactions.viewer[emoji]
              ? 'bg-brand-100 dark:bg-brand-900 border-brand-400 dark:border-brand-500 text-brand-700 dark:text-brand-300'
              : 'border-gray-200 dark:border-forest-border text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500',
          )}
        >
          <span>{EMOJI_MAP[emoji]}</span>
          {reactions.counts[emoji] > 0 && <span>{reactions.counts[emoji]}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Comment item ──────────────────────────────────────────────────────────────

function CommentItem({ comment, postId }: { comment: ForumComment; postId: string }) {
  const { user, isAdmin } = useAuth()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)

  const isAuthor = user?.id === comment.authorId
  const canEdit  = isAuthor
  const canDelete = isAuthor || isAdmin

  const reactionMut = useMutation({
    mutationFn: (emoji: Emoji) =>
      api.post(`/forum/comments/${comment.id}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum-post', postId] }),
    onError: () => toast.error('Could not react'),
  })

  const editMut = useMutation({
    mutationFn: () => api.patch(`/forum/comments/${comment.id}`, { body: editBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-post', postId] })
      setEditing(false)
      toast.success('Comment updated')
    },
    onError: () => toast.error('Could not update comment'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/forum/comments/${comment.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-post', postId] })
      toast.success('Comment deleted')
    },
    onError: () => toast.error('Could not delete comment'),
  })

  return (
    <div className="bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 flex gap-3">
      <Avatar name={comment.author.name} avatarDataUrl={comment.author.avatarDataUrl} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {comment.author.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            {comment.editedAt && ' · edited'}
          </span>
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => editMut.mutate()}
                disabled={!editBody.trim() || editMut.isPending}
                className="px-3 py-1 text-xs rounded bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium"
              >
                {editMut.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditBody(comment.body) }}
                className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-forest-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-forest"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">
            {comment.body}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          <ReactionBar
            reactions={comment.reactions}
            onToggle={emoji => reactionMut.mutate(emoji)}
          />
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirm('Delete this comment?')) deleteMut.mutate()
              }}
              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ForumPostPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const qc = useQueryClient()

  const [editingPost, setEditingPost] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [commentBody, setCommentBody] = useState('')

  const { data, isLoading } = useQuery<{ post: ForumPost }>({
    queryKey: ['forum-post', postId],
    queryFn: () => api.get(`/forum/posts/${postId}`),
    enabled: !!postId,
  })

  const post = data?.post

  const isAuthor  = user?.id === post?.authorId
  const canEdit   = isAuthor
  const canDelete = isAuthor || isAdmin

  const reactionMut = useMutation({
    mutationFn: (emoji: Emoji) =>
      api.post(`/forum/posts/${postId}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum-post', postId] }),
    onError: () => toast.error('Could not react'),
  })

  const editPostMut = useMutation({
    mutationFn: () => api.patch(`/forum/posts/${postId}`, { body: editBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-post', postId] })
      setEditingPost(false)
      toast.success('Post updated')
    },
    onError: () => toast.error('Could not update post'),
  })

  const deletePostMut = useMutation({
    mutationFn: () => api.delete(`/forum/posts/${postId}`),
    onSuccess: () => {
      toast.success('Post deleted')
      // Navigate back to forum or night discussion if applicable
      if (post?.leagueNightId) {
        navigate(`/league-nights/${post.leagueNightId}`)
      } else {
        navigate('/forum')
      }
    },
    onError: () => toast.error('Could not delete post'),
  })

  const addCommentMut = useMutation({
    mutationFn: () =>
      api.post(`/forum/posts/${postId}/comments`, { body: commentBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-post', postId] })
      setCommentBody('')
      toast.success('Comment added!')
    },
    onError: () => toast.error('Could not add comment'),
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>
  }
  if (!post) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        Post not found.{' '}
        <Link to="/forum" className="text-brand-600 dark:text-brand-400 underline">
          Back to Forum
        </Link>
      </div>
    )
  }

  const backTo = post.leagueNightId
    ? `/league-nights/${post.leagueNightId}`
    : '/forum'
  const backLabel = post.leagueNightId ? '← Night discussion' : '← Forum'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back link */}
      <Link to={backTo} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        {backLabel}
      </Link>

      {/* Post */}
      <div className="bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Avatar name={post.author.name} avatarDataUrl={post.author.avatarDataUrl} size="md" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {post.title}
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {post.author.name} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              {post.editedAt && ' · edited'}
            </p>
          </div>
        </div>

        {/* Post body */}
        {editingPost ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => editPostMut.mutate()}
                disabled={!editBody.trim() || editPostMut.isPending}
                className="px-4 py-1.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium"
              >
                {editPostMut.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingPost(false); setEditBody(post.body) }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-forest-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-forest"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {post.body}
          </p>
        )}

        {/* Reaction bar + actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-forest-border">
          <ReactionBar
            reactions={post.reactions}
            onToggle={emoji => reactionMut.mutate(emoji)}
          />
          <div className="flex items-center gap-3">
            {canEdit && !editingPost && (
              <button
                onClick={() => { setEditBody(post.body); setEditingPost(true) }}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (confirm('Delete this post and all its comments?')) {
                    deletePostMut.mutate()
                  }
                }}
                className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {post.comments?.length ?? 0} {post.comments?.length === 1 ? 'comment' : 'comments'}
        </h2>

        {(post.comments ?? []).map(c => (
          <CommentItem key={c.id} comment={c} postId={postId!} />
        ))}

        {/* New comment */}
        <div className="bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 flex gap-3">
          <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
          <div className="flex-1 space-y-2">
            <textarea
              placeholder="Add a comment…"
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              rows={3}
              maxLength={5_000}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white resize-none"
            />
            <button
              onClick={() => addCommentMut.mutate()}
              disabled={!commentBody.trim() || addCommentMut.isPending}
              className="px-4 py-1.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {addCommentMut.isPending ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
