/**
 * storage.ts
 *
 * Backend storage and aggregation for Dhun analytics.
 * Supports Neon PostgreSQL with in-memory / local-file fallback.
 */

import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface RawAnalyticsEvent {
  id: string
  visitorId: string
  sessionId: string
  eventType: 'page_view' | 'heartbeat' | 'game_start' | 'guess' | 'game_finish'
  path: string
  metadata: Record<string, any>
  createdAt: string
}

export interface AnalyticsStats {
  activeUsers: number
  todayUniqueUsers: number
  sevenDayUniqueUsers: number
  totalUniqueUsers: number
  todayPageViews: number
  totalPageViews: number
  playedUsers: number
  conversionRate: number // % of unique visitors who started/played a game
  totalRoundsStarted: number
  totalRoundsFinished: number
  totalGuesses: number
  correctGuesses: number
  wrongGuesses: number
  skippedGuesses: number
  winRate: number // % of completed rounds won
  attemptDistribution: [number, number, number, number, number, number, number] // clip 1..6, gave up
  eraDistribution: Record<string, number>
  recentEvents: Array<{
    id: string
    eventType: string
    time: string
    details: string
  }>
}

const LOCAL_STORAGE_PATH = join(process.cwd(), 'analytics-data.local.json')

// In-memory cache for fast access and fallback
let memoryEvents: RawAnalyticsEvent[] = []

function loadLocalEvents(): RawAnalyticsEvent[] {
  if (memoryEvents.length > 0) return memoryEvents
  try {
    if (existsSync(LOCAL_STORAGE_PATH)) {
      const data = JSON.parse(readFileSync(LOCAL_STORAGE_PATH, 'utf8'))
      if (Array.isArray(data)) {
        memoryEvents = data
        return memoryEvents
      }
    }
  } catch {}
  return memoryEvents
}

function saveLocalEvents(): void {
  try {
    // Keep max 50,000 local events to avoid unbounded file growth
    if (memoryEvents.length > 50000) {
      memoryEvents = memoryEvents.slice(-50000)
    }
    writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(memoryEvents))
  } catch {}
}

/** Check if Neon DB is configured */
function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

let tableInitChecked = false

async function ensureTable(sql: any): Promise<void> {
  if (tableInitChecked) return
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        visitor_id  TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        path        TEXT NOT NULL DEFAULT '/',
        metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS analytics_created_at_idx ON analytics_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_event_type_idx ON analytics_events (event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_visitor_id_idx ON analytics_events (visitor_id, created_at DESC);
    `
    tableInitChecked = true
  } catch {
    // Table might already exist or permission limited
  }
}

/** Record an analytics event */
export async function recordEvent(event: {
  visitorId: string
  sessionId: string
  eventType: string
  path: string
  metadata: Record<string, any>
}): Promise<void> {
  const now = new Date().toISOString()
  const raw: RawAnalyticsEvent = {
    id: 'evt_' + Math.random().toString(36).substring(2, 10),
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    eventType: event.eventType as any,
    path: event.path || '/',
    metadata: event.metadata || {},
    createdAt: now,
  }

  // Always append to memory/local fallback
  loadLocalEvents()
  memoryEvents.push(raw)
  saveLocalEvents()

  // If DB is configured, write to Neon DB
  const sql = getDb()
  if (sql) {
    try {
      await ensureTable(sql)
      await sql`
        INSERT INTO analytics_events (
          visitor_id, session_id, event_type, path, metadata, created_at
        ) VALUES (
          ${event.visitorId},
          ${event.sessionId},
          ${event.eventType},
          ${event.path || '/'},
          ${JSON.stringify(event.metadata || {})},
          ${now}
        )
      `
    } catch (err) {
      console.warn('Neon DB event insert failed, saved to local cache:', err)
    }
  }
}

/** Get aggregated analytics stats */
export async function getAnalyticsStats(): Promise<AnalyticsStats> {
  const sql = getDb()

  if (sql) {
    try {
      await ensureTable(sql)

      // Query Neon DB for aggregate metrics
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const todayIso = startOfToday.toISOString()
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // 1. Active Users (heartbeat or event in last 5m)
      const activeRows = (await sql`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM analytics_events
        WHERE created_at >= ${fiveMinsAgo}
      `) as any[]
      const activeUsers = Number(activeRows[0]?.count || 0)

      // 2. Uniques
      const todayUniqueRows = (await sql`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM analytics_events
        WHERE created_at >= ${todayIso}
      `) as any[]
      const todayUniqueUsers = Number(todayUniqueRows[0]?.count || 0)

      const sevenDayUniqueRows = (await sql`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM analytics_events
        WHERE created_at >= ${sevenDaysAgo}
      `) as any[]
      const sevenDayUniqueUsers = Number(sevenDayUniqueRows[0]?.count || 0)

      const totalUniqueRows = (await sql`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM analytics_events
      `) as any[]
      const totalUniqueUsers = Number(totalUniqueRows[0]?.count || 0)

      // 3. Page Views
      const todayPvRows = (await sql`
        SELECT COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'page_view' AND created_at >= ${todayIso}
      `) as any[]
      const todayPageViews = Number(todayPvRows[0]?.count || 0)

      const totalPvRows = (await sql`
        SELECT COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'page_view'
      `) as any[]
      const totalPageViews = Number(totalPvRows[0]?.count || 0)

      // 4. Players and Conversion
      const playedRows = (await sql`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM analytics_events
        WHERE event_type IN ('game_start', 'guess', 'game_finish')
      `) as any[]
      const playedUsers = Number(playedRows[0]?.count || 0)
      const conversionRate =
        totalUniqueUsers > 0 ? Math.round((playedUsers / totalUniqueUsers) * 100) : 0

      // 5. Game Counts
      const startRows = (await sql`
        SELECT COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'game_start'
      `) as any[]
      const totalRoundsStarted = Number(startRows[0]?.count || 0)

      const finishRows = (await sql`
        SELECT COUNT(*) as count,
               COUNT(*) FILTER (WHERE (metadata->>'guessedCorrectly')::boolean = true) as correct_count
        FROM analytics_events
        WHERE event_type = 'game_finish'
      `) as any[]
      const totalRoundsFinished = Number(finishRows[0]?.count || 0)
      const totalRoundsWon = Number(finishRows[0]?.correct_count || 0)
      const winRate =
        totalRoundsFinished > 0 ? Math.round((totalRoundsWon / totalRoundsFinished) * 100) : 0

      // 6. Guesses
      const guessRows = (await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE metadata->>'result' = 'correct') as correct,
          COUNT(*) FILTER (WHERE metadata->>'result' = 'wrong') as wrong,
          COUNT(*) FILTER (WHERE metadata->>'result' = 'skipped') as skipped
        FROM analytics_events
        WHERE event_type = 'guess'
      `) as any[]
      const totalGuesses = Number(guessRows[0]?.total || 0)
      const correctGuesses = Number(guessRows[0]?.correct || 0)
      const wrongGuesses = Number(guessRows[0]?.wrong || 0)
      const skippedGuesses = Number(guessRows[0]?.skipped || 0)

      // 7. Attempt distribution (1..6 or gave up / 0)
      const attemptRows = (await sql`
        SELECT
          (metadata->>'attemptsUsed')::int as attempt,
          (metadata->>'guessedCorrectly')::boolean as won,
          COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'game_finish'
        GROUP BY 1, 2
      `) as any[]

      const attemptDistribution: [number, number, number, number, number, number, number] = [
        0, 0, 0, 0, 0, 0, 0,
      ]
      for (const r of attemptRows) {
        const att = Number(r.attempt || 0)
        const won = r.won === true || r.won === 'true'
        const count = Number(r.count || 0)
        if (won && att >= 1 && att <= 6) {
          attemptDistribution[att - 1] += count
        } else if (!won) {
          attemptDistribution[6] += count
        }
      }

      // 8. Era popularity
      const eraRows = (await sql`
        SELECT metadata->>'era' as era, COUNT(*) as count
        FROM analytics_events
        WHERE event_type IN ('game_start', 'game_finish') AND metadata->>'era' IS NOT NULL
        GROUP BY 1
      `) as any[]
      const eraDistribution: Record<string, number> = {}
      for (const r of eraRows) {
        const era = r.era || 'all'
        eraDistribution[era] = Number(r.count || 0)
      }

      // 9. Recent Events
      const recentRows = (await sql`
        SELECT id, event_type, created_at, metadata
        FROM analytics_events
        ORDER BY created_at DESC
        LIMIT 25
      `) as any[]

      const recentEvents = recentRows.map((r) => {
        let details = ''
        const m = r.metadata || {}
        if (r.event_type === 'game_finish') {
          details = `${m.guessedCorrectly ? '🎉 Won' : '❌ Lost'} (${m.attemptsUsed || 0} attempts) · ${m.songTitle || 'Song'}`
        } else if (r.event_type === 'guess') {
          details = `Guess: ${m.result || ''} (${m.songTitle || 'attempt ' + m.attempt})`
        } else if (r.event_type === 'game_start') {
          details = `Started game (Era: ${m.era || 'all'})`
        } else if (r.event_type === 'page_view') {
          details = `Page access`
        } else {
          details = `Active session`
        }

        return {
          id: r.id,
          eventType: r.event_type,
          time: new Date(r.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          details,
        }
      })

      return {
        activeUsers,
        todayUniqueUsers,
        sevenDayUniqueUsers,
        totalUniqueUsers,
        todayPageViews,
        totalPageViews,
        playedUsers,
        conversionRate,
        totalRoundsStarted,
        totalRoundsFinished,
        totalGuesses,
        correctGuesses,
        wrongGuesses,
        skippedGuesses,
        winRate,
        attemptDistribution,
        eraDistribution,
        recentEvents,
      }
    } catch (err) {
      console.warn('Neon DB stats query failed, falling back to local events:', err)
    }
  }

  // Fallback to local memory events
  return computeLocalStats(loadLocalEvents())
}

function computeLocalStats(events: RawAnalyticsEvent[]): AnalyticsStats {
  const now = Date.now()
  const fiveMinsAgo = now - 5 * 60 * 1000
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayMs = startOfToday.getTime()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

  const activeVisitors = new Set<string>()
  const todayVisitors = new Set<string>()
  const sevenDayVisitors = new Set<string>()
  const allVisitors = new Set<string>()
  const playedVisitors = new Set<string>()

  let todayPageViews = 0
  let totalPageViews = 0
  let totalRoundsStarted = 0
  let totalRoundsFinished = 0
  let totalRoundsWon = 0
  let totalGuesses = 0
  let correctGuesses = 0
  let wrongGuesses = 0
  let skippedGuesses = 0

  const attemptDistribution: [number, number, number, number, number, number, number] = [
    0, 0, 0, 0, 0, 0, 0,
  ]
  const eraDistribution: Record<string, number> = {}

  for (const e of events) {
    const t = new Date(e.createdAt).getTime()
    allVisitors.add(e.visitorId)

    if (t >= fiveMinsAgo) activeVisitors.add(e.visitorId)
    if (t >= todayMs) todayVisitors.add(e.visitorId)
    if (t >= sevenDaysAgo) sevenDayVisitors.add(e.visitorId)

    if (e.eventType === 'page_view') {
      totalPageViews++
      if (t >= todayMs) todayPageViews++
    }

    if (e.eventType === 'game_start' || e.eventType === 'guess' || e.eventType === 'game_finish') {
      playedVisitors.add(e.visitorId)
    }

    if (e.eventType === 'game_start') {
      totalRoundsStarted++
      const era = e.metadata?.era || 'all'
      eraDistribution[era] = (eraDistribution[era] || 0) + 1
    }

    if (e.eventType === 'guess') {
      totalGuesses++
      if (e.metadata?.result === 'correct') correctGuesses++
      else if (e.metadata?.result === 'wrong') wrongGuesses++
      else if (e.metadata?.result === 'skipped') skippedGuesses++
    }

    if (e.eventType === 'game_finish') {
      totalRoundsFinished++
      if (e.metadata?.guessedCorrectly) {
        totalRoundsWon++
        const att = Number(e.metadata?.attemptsUsed || 1)
        if (att >= 1 && att <= 6) attemptDistribution[att - 1]++
      } else {
        attemptDistribution[6]++ // gave up / failed
      }
    }
  }

  const totalUnique = allVisitors.size
  const playedCount = playedVisitors.size
  const conversionRate = totalUnique > 0 ? Math.round((playedCount / totalUnique) * 100) : 0
  const winRate =
    totalRoundsFinished > 0 ? Math.round((totalRoundsWon / totalRoundsFinished) * 100) : 0

  const recentEvents = events
    .slice(-25)
    .reverse()
    .map((e) => {
      let details = ''
      const m = e.metadata || {}
      if (e.eventType === 'game_finish') {
        details = `${m.guessedCorrectly ? '🎉 Won' : '❌ Lost'} (${m.attemptsUsed || 0} attempts) · ${m.songTitle || 'Song'}`
      } else if (e.eventType === 'guess') {
        details = `Guess: ${m.result || ''} (${m.songTitle || 'attempt ' + m.attempt})`
      } else if (e.eventType === 'game_start') {
        details = `Started game (Era: ${m.era || 'all'})`
      } else if (e.eventType === 'page_view') {
        details = `Page access`
      } else {
        details = `Active session`
      }

      return {
        id: e.id,
        eventType: e.eventType,
        time: new Date(e.createdAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        details,
      }
    })

  return {
    activeUsers: activeVisitors.size,
    todayUniqueUsers: todayVisitors.size,
    sevenDayUniqueUsers: sevenDayVisitors.size,
    totalUniqueUsers: totalUnique,
    todayPageViews,
    totalPageViews,
    playedUsers: playedCount,
    conversionRate,
    totalRoundsStarted,
    totalRoundsFinished,
    totalGuesses,
    correctGuesses,
    wrongGuesses,
    skippedGuesses,
    winRate,
    attemptDistribution,
    eraDistribution,
    recentEvents,
  }
}
