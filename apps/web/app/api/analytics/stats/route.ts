import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isValidToken } from '../auth/route'
import { getAnalyticsStats } from '@/lib/analytics/storage'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const cookieHeader = req.headers.get('cookie') || ''
    const cookieToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('dhun_admin_token='))
      ?.split('=')[1]

    const token = cookieToken || bearerToken

    if (!token || !isValidToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await getAnalyticsStats()
    return NextResponse.json(stats)
  } catch (err: any) {
    if (err?.digest?.includes('PRERENDER') || err?.message?.includes('bail out')) {
      throw err
    }
    console.error('Stats endpoint error:', err)
    return NextResponse.json({ error: 'Failed to retrieve stats' }, { status: 500 })
  }
}
