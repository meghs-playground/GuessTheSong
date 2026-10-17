import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../index'
import { createDb } from '../db/client'
import { getSongById, isCorrectGuess } from '../db/queries'
import { verifyToken } from '../lib/token'
import { normalizeGuess } from '../lib/normalize'
import { checkRateLimit } from '../lib/rateLimit'
import type { GuessResponse, SongReveal } from '@dhun/shared'

const guessBodySchema = z.object({
  roundToken: z.string().min(1).max(512),
  guess: z.string().max(256), // empty = skip/give-up
})

export const guessRouter = new Hono<{ Bindings: Env }>()

guessRouter.post('/', zValidator('json', guessBodySchema), async (c) => {
  // Rate limit: 120 guesses/minute per IP
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = checkRateLimit(`guess:${ip}`, 120, 60_000)
  if (!allowed) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const { roundToken, guess } = c.req.valid('json')

  const payload = await verifyToken(roundToken, c.env.ROUND_SECRET)
  if (!payload) {
    return c.json({ error: 'Invalid or expired round token' }, 400)
  }

  const sql = createDb(c.env.DATABASE_URL)

  // Empty guess = skip or give-up — return the reveal immediately
  if (guess.trim() === '') {
    const song = await getSongById(sql, payload.songId)
    if (!song) return c.json({ error: 'Song not found' }, 404)

    const reveal = buildReveal(song)
    const body: GuessResponse = { result: 'skipped', reveal }
    return c.json(body)
  }

  const normalized = normalizeGuess(guess)
  const correct = await isCorrectGuess(sql, payload.songId, normalized)

  if (correct) {
    const song = await getSongById(sql, payload.songId)
    if (!song) return c.json({ error: 'Song not found' }, 404)

    const body: GuessResponse = {
      result: 'correct',
      reveal: buildReveal(song),
    }
    return c.json(body)
  }

  // Wrong guess — no reveal, client tracks attempt count
  const body: GuessResponse = { result: 'wrong' }
  return c.json(body)
})

function buildReveal(song: {
  canonical_title: string
  film: string
  year: number
  artists: string[]
  composer: string
  preview_url: string
  track_id: string
  source_platform: string
}): SongReveal {
  return {
    canonicalTitle: song.canonical_title,
    film: song.film,
    year: song.year,
    artists: song.artists,
    composer: song.composer,
    previewUrl: song.preview_url,
    streamingLink: buildStreamingLink(song.source_platform, song.track_id),
  }
}

function buildStreamingLink(platform: string, trackId: string): string {
  if (platform === 'itunes') {
    return `https://music.apple.com/in/song/${trackId}`
  }
  if (platform === 'deezer') {
    return `https://www.deezer.com/track/${trackId}`
  }
  return ''
}
