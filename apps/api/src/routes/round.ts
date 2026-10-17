import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../index'
import { createDb } from '../db/client'
import { getRandomSong } from '../db/queries'
import { signToken } from '../lib/token'
import { checkRateLimit } from '../lib/rateLimit'
import type { RoundStartResponse, Era } from '@dhun/shared'

const ERA_VALUES = ['50s-70s', '80s', '90s', '2000s', '2010s', '2020s'] as const

const roundQuerySchema = z.object({
  era: z.enum(ERA_VALUES).optional(),
  // Comma-separated list of song IDs to exclude (recently seen)
  exclude: z.string().max(2000).optional(),
})

export const roundRouter = new Hono<{ Bindings: Env }>()

roundRouter.get('/', zValidator('query', roundQuerySchema), async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = checkRateLimit(`round:${ip}`, 60, 60_000)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const { era, exclude } = c.req.valid('query')

  const excludeIds = exclude
    ? exclude.split(',').filter((id) => /^[a-zA-Z0-9_-]+$/.test(id)).slice(0, 50)
    : []

  const sql = createDb(c.env.DATABASE_URL)
  const song = await getRandomSong(sql, era as Era | undefined, excludeIds)

  if (!song) {
    return c.json({ error: 'No songs found for the given filter' }, 404)
  }

  const roundToken = await signToken(
    { songId: song.id, era: era ?? null },
    c.env.ROUND_SECRET,
  )

  const body: RoundStartResponse = {
    roundToken,
    previewDuration: 30,
    era: (era as Era) ?? null,
  }

  return c.json(body)
})
