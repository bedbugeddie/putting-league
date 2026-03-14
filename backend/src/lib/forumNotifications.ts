import { prisma } from './prisma.js'
import { sendForumNotification, sendForumDigest } from './email.js'
import { env } from '../config/env.js'

export type ForumEventType =
  | 'new_post'
  | 'new_comment'
  | 'new_reaction_on_post'
  | 'new_reaction_on_comment'

export interface ForumEvent {
  type: ForumEventType
  actorId: string       // userId of the person who took the action
  postId: string
  postTitle: string
  postAuthorId: string
  commentId?: string
  commentAuthorId?: string
}

function eventDescription(type: ForumEventType, actorName: string, postTitle: string): string {
  switch (type) {
    case 'new_post':
      return `${actorName} posted a new discussion: "${postTitle}"`
    case 'new_comment':
      return `${actorName} commented on "${postTitle}"`
    case 'new_reaction_on_post':
      return `${actorName} reacted to "${postTitle}"`
    case 'new_reaction_on_comment':
      return `${actorName} reacted to a comment on "${postTitle}"`
  }
}

export async function notifyForumEvent(event: ForumEvent): Promise<void> {
  // Look up actor name
  const actor = await prisma.user.findUnique({
    where: { id: event.actorId },
    select: { name: true },
  })
  const actorName = actor?.name ?? 'Someone'

  // Fetch all users with non-NONE notification preferences
  const allPrefs = await prisma.notificationPreference.findMany({
    where: { forumMode: { not: 'NONE' } },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  // Find users who previously engaged with this post (commented or reacted)
  // Only needed for non-new_post events
  let engagedUserIds = new Set<string>()
  if (event.type !== 'new_post') {
    const [commenters, postReactors] = await Promise.all([
      prisma.forumComment.findMany({
        where: { postId: event.postId },
        select: { authorId: true },
        distinct: ['authorId'],
      }),
      prisma.forumReaction.findMany({
        where: { postId: event.postId },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])
    for (const c of commenters) engagedUserIds.add(c.authorId)
    for (const r of postReactors) engagedUserIds.add(r.userId)
    // Post author is always considered "engaged" with their own post
    engagedUserIds.add(event.postAuthorId)
  }

  // Determine which users are interested in this event
  const interestedImmediate: Array<{ email: string; name: string }> = []
  const interestedDaily: Array<{ userId: string; email: string; name: string }> = []

  for (const pref of allPrefs) {
    const u = pref.user
    if (u.id === event.actorId) continue // never notify yourself

    let interested = false

    if (event.type === 'new_post') {
      // Only ALL users get notified of brand new posts
      interested = pref.forumMode === 'ALL'
    } else {
      const isPostAuthor = u.id === event.postAuthorId
      const isCommentAuthor = !!event.commentAuthorId && u.id === event.commentAuthorId

      switch (pref.forumMode) {
        case 'ALL':
          interested = true
          break
        case 'OWN_POSTS':
          // Notify if they authored the post or the comment being reacted to
          interested = isPostAuthor || isCommentAuthor
          break
        case 'ENGAGED':
          // Notify if they authored the post, the comment being reacted to, or
          // have previously engaged with this post (commented or reacted)
          interested = isPostAuthor || isCommentAuthor || engagedUserIds.has(u.id)
          break
      }
    }

    if (!interested) continue

    if (pref.digestMode === 'IMMEDIATE') {
      interestedImmediate.push({ email: u.email, name: u.name })
    } else {
      interestedDaily.push({ userId: u.id, email: u.email, name: u.name })
    }
  }

  if (interestedImmediate.length === 0 && interestedDaily.length === 0) return

  const description = eventDescription(event.type, actorName, event.postTitle)
  const postUrl = `${env.APP_URL}/forum/posts/${event.postId}`

  // Send immediate emails (fire-and-forget, log errors)
  await Promise.all(
    interestedImmediate.map(u =>
      sendForumNotification({
        to: u.email,
        name: u.name,
        description,
        postTitle: event.postTitle,
        postUrl,
      }).catch(err => console.error(`[notifications] Failed to send to ${u.email}:`, err))
    )
  )

  // Queue daily digest items
  if (interestedDaily.length > 0) {
    await prisma.pendingDigestItem.createMany({
      data: interestedDaily.map(u => ({
        userId: u.userId,
        eventType: event.type,
        postId: event.postId,
        postTitle: event.postTitle,
        actorName,
        eventDescription: description,
      })),
    })
  }
}

/** Called by the digest scheduler — finds users due for a digest and sends it. */
export async function sendPendingDigests(): Promise<void> {
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000)

  // Find DAILY users who have pending items and haven't been sent a digest recently
  const duePrefs = await prisma.notificationPreference.findMany({
    where: {
      digestMode: 'DAILY',
      user: { pendingDigestItems: { some: {} } },
      OR: [
        { lastDigestSentAt: null },
        { lastDigestSentAt: { lt: twentyHoursAgo } },
      ],
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  for (const pref of duePrefs) {
    const items = await prisma.pendingDigestItem.findMany({
      where: { userId: pref.userId },
      orderBy: { createdAt: 'asc' },
    })
    if (items.length === 0) continue

    try {
      await sendForumDigest({
        to: pref.user.email,
        name: pref.user.name,
        items: items.map(i => ({
          description: i.eventDescription,
          postTitle: i.postTitle,
          postUrl: `${env.APP_URL}/forum/posts/${i.postId}`,
          createdAt: i.createdAt,
        })),
      })

      // Mark sent + delete processed items
      await prisma.$transaction([
        prisma.notificationPreference.update({
          where: { id: pref.id },
          data: { lastDigestSentAt: new Date() },
        }),
        prisma.pendingDigestItem.deleteMany({
          where: { userId: pref.userId, id: { in: items.map(i => i.id) } },
        }),
      ])
    } catch (err) {
      console.error(`[notifications] Failed to send digest to ${pref.user.email}:`, err)
    }
  }
}
