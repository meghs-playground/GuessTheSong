import { Hono } from 'hono'
import type { Env } from '../index'
import { createDb } from '../db/client'
import { getSongById } from '../db/queries'
import { verifyToken } from '../lib/token'
import { checkRateLimit } from '../lib/rateLimit'

export const audioRouter = new Hono<{ Bindings: Env }>()

/**
 * Resolve the audio preview URL for a round token.
 *
 * The client fetches audio directly from the provider's CDN.
 * We only return the URL here — we never proxy the bytes through our worker
 * (that would be expensive and unnecessary; iTunes/Deezer CDNs are globally fast).
 *
 * The URL is only revealed after the token is verified, which means the client
 * can't learn the song title from the URL path before the round ends.
 *
 * iTunes preview URLs look like:
 *   https://audio-ssl.itunes.apple.com/itunes-assets/.../audio.m4a
 * They don't contain song title or ID in a guessable way.
 */
audioRouter.get('/:token', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = checkRateLimit(`audio:${ip}`, 60, 60_000)
  if (!allowed) return c.json({ error: 'Too many requests' }, 429)

  const token = c.req.param('token')
  const payload = await verifyToken(token, c.env.ROUND_SECRET)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 400)

  const sql = createDb(c.env.DATABASE_URL)
  const song = await getSongById(sql, payload.songId)
  if (!song) return c.json({ error: 'Song not found' }, 404)

  return c.json({ url: song.preview_url, songId: song.id })
})
