import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const createCardSchema = z.object({
  name: z.string().min(1).max(50),
  startingHole: z.number().int().min(1).default(1),
  playerIds: z.array(z.string().cuid()).default([]),
})

const generateCardsSchema = z.object({
  minPlayersPerCard: z.number().int().min(1).max(20).default(3),
  shuffle: z.boolean().default(true),
})

const cardInclude = {
  players: {
    include: { player: { include: { user: true, division: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  scorekeeper: { include: { user: true } },
}

/** Assign a random throw order to all players on a card (0, 1, 2, …) */
async function randomizeCardOrder(cardId: string) {
  const players = await prisma.cardPlayer.findMany({
    where: { cardId },
    select: { id: true },
  })
  const shuffled = [...players]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  await Promise.all(
    shuffled.map((cp, i) =>
      prisma.cardPlayer.update({ where: { id: cp.id }, data: { sortOrder: i } })
    )
  )
}

export async function cardRoutes(app: FastifyInstance) {
  // GET all cards for a league night
  app.get('/league-nights/:id/cards', async (req, reply) => {
    const { id } = req.params as { id: string }
    const cards = await prisma.card.findMany({
      where: { leagueNightId: id },
      include: cardInclude,
      orderBy: { name: 'asc' },
    })
    return reply.send({ cards })
  })

  // POST create a card manually
  app.post('/league-nights/:id/cards', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = createCardSchema.parse(req.body)

    const card = await prisma.card.create({
      data: {
        leagueNightId: id,
        name: body.name,
        startingHole: body.startingHole,
        players: {
          create: body.playerIds.map(playerId => ({ playerId })),
        },
      },
      include: cardInclude,
    })
    return reply.status(201).send({ card })
  })

  // POST auto-generate cards from checked-in players
  app.post('/league-nights/:id/cards/generate', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { minPlayersPerCard, shuffle } = generateCardsSchema.parse(req.body)

    // Delete existing cards
    await prisma.card.deleteMany({ where: { leagueNightId: id } })

    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: id },
      include: { player: { include: { user: true, division: true } } },
      orderBy: { player: { user: { name: 'asc' } } },
    })

    if (checkIns.length === 0) {
      return reply.status(400).send({ error: 'No checked-in players to generate cards from' })
    }

    const night = await prisma.leagueNight.findUnique({
      where: { id },
      include: { holes: { orderBy: { number: 'asc' } } },
    })
    const totalHoles = night?.holes.length ?? 1

    const allPlayers = checkIns.map(c => c.player)
    const N = allPlayers.length

    // Separate CCC from everyone else
    const cccPlayers = allPlayers.filter(p => p.division?.code === 'CCC')
    const otherPlayers = allPlayers.filter(p => p.division?.code !== 'CCC')

    // Shuffle each group independently
    function fisherYates<T>(arr: T[]) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
    }
    if (shuffle) {
      fisherYates(cccPlayers)
      fisherYates(otherPlayers)
    }

    // Determine total card count
    let cardCount: number
    if (N < minPlayersPerCard) {
      cardCount = 1
    } else {
      cardCount = Math.min(Math.floor(N / minPlayersPerCard), totalHoles)
    }

    const C = cccPlayers.length
    const R = otherPlayers.length
    const maxCardSize = Math.ceil(N / cardCount)

    // How many cards does the CCC pool need?
    // - 1 card if they all fit within the average card size
    // - More cards if they'd exceed it, each at or below average
    let cccCardCount = C === 0 ? 0
      : C <= maxCardSize ? 1
      : Math.ceil(C / maxCardSize)

    // If there are non-CCC players, reserve at least 1 card for them
    if (R > 0) cccCardCount = Math.min(cccCardCount, cardCount - 1)

    // If CCC players got no dedicated cards (e.g. only 1 card total), fold them
    // into the general pool so they aren't silently dropped
    if (cccCardCount === 0 && cccPlayers.length > 0) {
      otherPlayers.push(...cccPlayers)
      if (shuffle) fisherYates(otherPlayers)
    }

    const otherCardCount = cardCount - cccCardCount

    // Compute target size for every card (most even distribution of N across cardCount)
    const base = Math.floor(N / cardCount)
    const remainder = N % cardCount
    const targetSizes = Array.from({ length: cardCount }, (_, i) => (i < remainder ? base + 1 : base))

    // How many CCC players go on each CCC card
    const cccBase = cccCardCount > 0 ? Math.floor(C / cccCardCount) : 0
    const cccRem  = cccCardCount > 0 ? C % cccCardCount : 0

    // Build groups: CCC cards first, padded with non-CCC players to hit target size
    const groups: (typeof allPlayers)[] = []
    let cccIdx = 0
    let otherIdx = 0

    for (let i = 0; i < cccCardCount; i++) {
      const target     = targetSizes[i]
      const cccOnCard  = i < cccRem ? cccBase + 1 : cccBase
      const fillCount  = target - cccOnCard
      groups.push([
        ...cccPlayers.slice(cccIdx, cccIdx + cccOnCard),
        ...otherPlayers.slice(otherIdx, otherIdx + fillCount),
      ])
      cccIdx  += cccOnCard
      otherIdx += fillCount
    }

    // Remaining non-CCC players fill the rest of the cards
    for (let i = cccCardCount; i < cardCount; i++) {
      const target = targetSizes[i]
      groups.push(otherPlayers.slice(otherIdx, otherIdx + target))
      otherIdx += target
    }

    const cards = []
    for (let i = 0; i < groups.length; i++) {
      const card = await prisma.card.create({
        data: {
          leagueNightId: id,
          name: `Card ${i + 1}`,
          startingHole: (i % totalHoles) + 1,
          players: { create: groups[i].map(p => ({ playerId: p.id })) },
        },
        include: cardInclude,
      })
      cards.push(card)
    }

    return reply.send({ cards })
  })

  // PATCH update a card (rename, starting hole, or assign scorekeeper)
  app.patch('/cards/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      name: z.string().min(1).max(50).optional(),
      startingHole: z.number().int().min(1).optional(),
      scorekeeperId: z.string().nullable().optional(),
    }).parse(req.body)

    const card = await prisma.card.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.startingHole !== undefined ? { startingHole: body.startingHole } : {}),
        ...(body.scorekeeperId !== undefined ? { scorekeeperId: body.scorekeeperId } : {}),
      },
      include: cardInclude,
    })
    // Randomize throw order whenever a scorekeeper is assigned
    if (body.scorekeeperId) await randomizeCardOrder(id)
    const updated = await prisma.card.findUnique({ where: { id }, include: cardInclude })
    return reply.send({ card: updated })
  })

  // POST volunteer as scorekeeper for a card (any authenticated player on the card)
  app.post('/cards/:id/volunteer', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } })
    if (!player) return reply.status(400).send({ error: 'No player profile found' })

    // Verify the player is on this card
    const membership = await prisma.cardPlayer.findUnique({
      where: { cardId_playerId: { cardId: id, playerId: player.id } },
    })
    if (!membership) return reply.status(403).send({ error: 'You are not on this card' })

    await prisma.card.update({ where: { id }, data: { scorekeeperId: player.id } })
    await randomizeCardOrder(id)
    const updated = await prisma.card.findUnique({ where: { id }, include: cardInclude })
    return reply.send({ card: updated })
  })

  // POST randomly assign a scorekeeper from the card's players (any player on the card may trigger)
  app.post('/cards/:id/random-scorekeeper', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const card = await prisma.card.findUnique({
      where: { id },
      include: { players: true },
    })
    if (!card) return reply.status(404).send({ error: 'Card not found' })
    if (card.players.length === 0) return reply.status(400).send({ error: 'Card has no players' })

    // Verify the requester is on the card (or is admin)
    if (!req.user!.isAdmin) {
      const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } })
      const onCard = player && card.players.some(cp => cp.playerId === player.id)
      if (!onCard) return reply.status(403).send({ error: 'You are not on this card' })
    }

    const picked = card.players[Math.floor(Math.random() * card.players.length)]

    await prisma.card.update({ where: { id }, data: { scorekeeperId: picked.playerId } })
    await randomizeCardOrder(id)
    const updated = await prisma.card.findUnique({ where: { id }, include: cardInclude })
    return reply.send({ card: updated })
  })

  // DELETE clear the scorekeeper for a card (the current scorekeeper or an admin)
  app.delete('/cards/:id/scorekeeper', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const card = await prisma.card.findUnique({ where: { id } })

    if (!req.user!.isAdmin) {
      const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } })
      if (!player || card?.scorekeeperId !== player.id) {
        return reply.status(403).send({ error: 'Forbidden' })
      }
    }

    await prisma.card.update({ where: { id }, data: { scorekeeperId: null } })
    return reply.status(204).send()
  })

  // DELETE a card
  app.delete('/cards/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.card.delete({ where: { id } })
    return reply.status(204).send()
  })

  // POST add a player to a card
  app.post('/cards/:id/players', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { playerId } = z.object({ playerId: z.string().cuid() }).parse(req.body)

    const cardPlayer = await prisma.cardPlayer.upsert({
      where: { cardId_playerId: { cardId: id, playerId } },
      create: { cardId: id, playerId },
      update: {},
      include: { player: { include: { user: true, division: true } } },
    })
    return reply.send({ cardPlayer })
  })

  // DELETE remove a player from a card
  app.delete('/cards/:cardId/players/:playerId', { preHandler: requireAdmin }, async (req, reply) => {
    const { cardId, playerId } = req.params as { cardId: string; playerId: string }

    // If removing the scorekeeper, clear the assignment
    const card = await prisma.card.findUnique({ where: { id: cardId } })
    if (card?.scorekeeperId === playerId) {
      await prisma.card.update({ where: { id: cardId }, data: { scorekeeperId: null } })
    }

    await prisma.cardPlayer.delete({ where: { cardId_playerId: { cardId, playerId } } })
    return reply.status(204).send()
  })
}
