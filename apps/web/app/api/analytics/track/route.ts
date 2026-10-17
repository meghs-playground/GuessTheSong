import { NextResponse } from 'next/server'
import { recordEvent } from '@/lib/analytics/storage'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { visitorId, sessionId, eventType, path, metadata } = body

    if (!visitorId || !eventType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await recordEvent({
      visitorId,
      sessionId: sessionId || 'unknown',
      eventType,
      path: path || '/',
      metadata: metadata || {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }
}
