import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { logger } from 'hono/logger'
import { pruneExpiredWindows } from './lib/rateLimit'
import { roundRouter } from './routes/round'
import { guessRouter } from './routes/guess'
import { audioRouter } from './routes/audio'

export interface Env {
  DATABASE_URL: string
  ROUND_SECRET: string
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Env }>()

// ── Middleware ────────────────────────────────────────────────
app.use('*', secureHeaders())

app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow dhun.app and localhost in dev
      if (!origin) return null
      if (
        origin === 'https://dhun.app' ||
        origin === 'https://www.dhun.app' ||
        origin.startsWith('http://localhost')
      ) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
)

app.use('*', logger())

// Prune rate limit windows on each request (lightweight)
app.use('*', async (_c, next) => {
  pruneExpiredWindows()
  await next()
})

// ── Routes ────────────────────────────────────────────────────
app.route('/round', roundRouter)
app.route('/guess', guessRouter)
app.route('/audio', audioRouter)

// Health check
app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

// 404
app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Global error handler
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
