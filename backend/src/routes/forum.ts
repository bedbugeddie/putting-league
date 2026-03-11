import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import type { ForumReaction } from '@prisma/client'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  body:  z.string().min(1).max(10_000),
})

const editPostSchema = z.object({
  body: z.string().min(1).max(10_000),
})

const createCommentSchema = z.object({
  body: z.string().min(1).max(5_000),
})

const reactionSchema = z.object({
  emoji: z.enum(['LIKE', 'FIRE', 'LAUGH']),
})

const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReactionSummary(reactions: ForumReaction[], viewerUserId: string) {
  const counts = { LIKE: 0, FIRE: 0, LAUGH: 0 } as Record<string, number>
  const viewer = { LIKE: false, FIRE: false, LAUGH: false } as Record<string, boolean>
  for (const r of reactions) {
    counts[r.emoji]++
    if (r.userId === viewerUserId) viewer[r.emoji] = true
  }
  return { counts, viewer }
}

// Author include shape reused across posts and comments
const authorInclude = {
  select: { id: true, name: true, avatarDataUrl: true },
} as const

// Post list shape (no comments, summarised reactions)
const postListInclude = {
  author:   authorInclude,
  _count:   { select: { comments: true } },
  reactions: true,
} as const

// Post detail shape (with comments + reactions)
const postDetailInclude = {
  author:   authorInclude,
  reactions: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author:    authorInclude,
      reactions: true,
    },
  },
} as const

// ── Route registration ────────────────────────────────────────────────────────

export async function forumRoutes(app: FastifyInstance) {

  // ── General posts ──────────────────────────────────────────────────────────

  // GET /forum/posts — paginated general (non-night) posts
  app.get('/forum/posts', { preHandler: requireAuth }, async (req, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const skip = (page - 1) * limit

    const [posts, total] = await prisma.$transaction([
      prisma.forumPost.findMany({
        where:   { leagueNightId: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
        include: postListInclude,
      }),
      prisma.forumPost.count({ where: { leagueNightId: null } }),
    ])

    const viewerId = req.user!.userId
    return reply.send({
      posts: posts.map(p => ({
        ...p,
        reactions: buildReactionSummary(p.reactions, viewerId),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  })

  // POST /forum/posts — create a general post
  app.post('/forum/posts', { preHandler: requireAuth }, async (req, reply) => {
    const { title, body } = createPostSchema.parse(req.body)
    const post = await prisma.forumPost.create({
      data: {
        authorId:      req.user!.userId,
        leagueNightId: null,
        title,
        body,
      },
      include: postListInclude,
    })
    const viewerId = req.user!.userId
    return reply.status(201).send({
      post: { ...post, reactions: buildReactionSummary(post.reactions, viewerId) },
    })
  })

  // GET /forum/posts/:postId — single post with comments + reactions
  app.get('/forum/posts/:postId', { preHandler: requireAuth }, async (req, reply) => {
    const { postId } = req.params as { postId: string }
    const post = await prisma.forumPost.findUnique({
      where:   { id: postId },
      include: postDetailInclude,
    })
    if (!post) return reply.status(404).send({ error: 'Post not found' })

    const viewerId = req.user!.userId
    return reply.send({
      post: {
        ...post,
        reactions: buildReactionSummary(post.reactions, viewerId),
        comments:  post.comments.map(c => ({
          ...c,
          reactions: buildReactionSummary(c.reactions, viewerId),
        })),
      },
    })
  })

  // PATCH /forum/posts/:postId — edit own post body
  app.patch('/forum/posts/:postId', { preHandler: requireAuth }, async (req, reply) => {
    const { postId } = req.params as { postId: string }
    const { body } = editPostSchema.parse(req.body)

    const existing = await prisma.forumPost.findUnique({ where: { id: postId } })
    if (!existing) return reply.status(404).send({ error: 'Post not found' })
    if (existing.authorId !== req.user!.userId && !req.user!.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const post = await prisma.forumPost.update({
      where:   { id: postId },
      data:    { body, editedAt: new Date() },
      include: postListInclude,
    })
    const viewerId = req.user!.userId
    return reply.send({
      post: { ...post, reactions: buildReactionSummary(post.reactions, viewerId) },
    })
  })

  // DELETE /forum/posts/:postId — delete own post (or admin)
  app.delete('/forum/posts/:postId', { preHandler: requireAuth }, async (req, reply) => {
    const { postId } = req.params as { postId: string }

    const existing = await prisma.forumPost.findUnique({ where: { id: postId } })
    if (!existing) return reply.status(404).send({ error: 'Post not found' })
    if (existing.authorId !== req.user!.userId && !req.user!.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    await prisma.forumPost.delete({ where: { id: postId } })
    return reply.status(204).send()
  })

  // POST /forum/posts/:postId/reactions — toggle a reaction on a post
  app.post('/forum/posts/:postId/reactions', { preHandler: requireAuth }, async (req, reply) => {
    const { postId } = req.params as { postId: string }
    const { emoji } = reactionSchema.parse(req.body)
    const userId = req.user!.userId

    const existing = await prisma.forumReaction.findFirst({
      where: { userId, emoji, postId },
    })

    if (existing) {
      await prisma.forumReaction.delete({ where: { id: existing.id } })
    } else {
      await prisma.forumReaction.create({ data: { userId, emoji, postId } })
    }

    // Return updated reactions for the post
    const reactions = await prisma.forumReaction.findMany({ where: { postId } })
    return reply.send({ reactions: buildReactionSummary(reactions, userId) })
  })

  // ── Night-scoped posts ─────────────────────────────────────────────────────

  // GET /league-nights/:id/forum/posts — posts for a specific night
  app.get('/league-nights/:id/forum/posts', { preHandler: requireAuth }, async (req, reply) => {
    const { id: leagueNightId } = req.params as { id: string }
    const { page, limit } = paginationSchema.parse(req.query)
    const skip = (page - 1) * limit

    const [posts, total] = await prisma.$transaction([
      prisma.forumPost.findMany({
        where:   { leagueNightId },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
        include: postListInclude,
      }),
      prisma.forumPost.count({ where: { leagueNightId } }),
    ])

    const viewerId = req.user!.userId
    return reply.send({
      posts: posts.map(p => ({
        ...p,
        reactions: buildReactionSummary(p.reactions, viewerId),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  })

  // POST /league-nights/:id/forum/posts — create a night-specific post
  app.post('/league-nights/:id/forum/posts', { preHandler: requireAuth }, async (req, reply) => {
    const { id: leagueNightId } = req.params as { id: string }
    const { title, body } = createPostSchema.parse(req.body)

    // Verify the night exists
    const night = await prisma.leagueNight.findUnique({ where: { id: leagueNightId } })
    if (!night) return reply.status(404).send({ error: 'League night not found' })

    const post = await prisma.forumPost.create({
      data: { authorId: req.user!.userId, leagueNightId, title, body },
      include: postListInclude,
    })
    const viewerId = req.user!.userId
    return reply.status(201).send({
      post: { ...post, reactions: buildReactionSummary(post.reactions, viewerId) },
    })
  })

  // ── Comments ───────────────────────────────────────────────────────────────

  // POST /forum/posts/:postId/comments — add a comment
  app.post('/forum/posts/:postId/comments', { preHandler: requireAuth }, async (req, reply) => {
    const { postId } = req.params as { postId: string }
    const { body } = createCommentSchema.parse(req.body)

    const post = await prisma.forumPost.findUnique({ where: { id: postId } })
    if (!post) return reply.status(404).send({ error: 'Post not found' })

    const comment = await prisma.forumComment.create({
      data:    { postId, authorId: req.user!.userId, body },
      include: { author: authorInclude, reactions: true },
    })
    const viewerId = req.user!.userId
    return reply.status(201).send({
      comment: { ...comment, reactions: buildReactionSummary(comment.reactions, viewerId) },
    })
  })

  // PATCH /forum/comments/:commentId — edit own comment
  app.patch('/forum/comments/:commentId', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { commentId: string }
    const { body } = createCommentSchema.parse(req.body)

    const existing = await prisma.forumComment.findUnique({ where: { id: commentId } })
    if (!existing) return reply.status(404).send({ error: 'Comment not found' })
    if (existing.authorId !== req.user!.userId && !req.user!.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const comment = await prisma.forumComment.update({
      where:   { id: commentId },
      data:    { body, editedAt: new Date() },
      include: { author: authorInclude, reactions: true },
    })
    const viewerId = req.user!.userId
    return reply.send({
      comment: { ...comment, reactions: buildReactionSummary(comment.reactions, viewerId) },
    })
  })

  // DELETE /forum/comments/:commentId — delete own comment (or admin)
  app.delete('/forum/comments/:commentId', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { commentId: string }

    const existing = await prisma.forumComment.findUnique({ where: { id: commentId } })
    if (!existing) return reply.status(404).send({ error: 'Comment not found' })
    if (existing.authorId !== req.user!.userId && !req.user!.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    await prisma.forumComment.delete({ where: { id: commentId } })
    return reply.status(204).send()
  })

  // POST /forum/comments/:commentId/reactions — toggle a reaction on a comment
  app.post('/forum/comments/:commentId/reactions', { preHandler: requireAuth }, async (req, reply) => {
    const { commentId } = req.params as { commentId: string }
    const { emoji } = reactionSchema.parse(req.body)
    const userId = req.user!.userId

    const existing = await prisma.forumReaction.findFirst({
      where: { userId, emoji, commentId },
    })

    if (existing) {
      await prisma.forumReaction.delete({ where: { id: existing.id } })
    } else {
      await prisma.forumReaction.create({ data: { userId, emoji, commentId } })
    }

    const reactions = await prisma.forumReaction.findMany({ where: { commentId } })
    return reply.send({ reactions: buildReactionSummary(reactions, userId) })
  })
}
