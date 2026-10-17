import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const DEFAULT_PASSWORD = 'dhun-admin-2026'

function getAdminPassword(): string {
  return process.env.ANALYTICS_PASSWORD?.trim() || DEFAULT_PASSWORD
}

export function generateToken(password: string): string {
  const salt = 'dhun_analytics_v1'
  return crypto.createHmac('sha256', salt).update(password).digest('hex')
}

export function isValidToken(token: string): boolean {
  if (!token) return false
  const expected = generateToken(getAdminPassword())
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

export async function POST(req: Request) {
  try {
    const { password } = (await req.json()) as { password?: string }
    const adminPassword = getAdminPassword()

    if (!password || password.trim() !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    const token = generateToken(adminPassword)

    const cookieStore = await cookies()
    cookieStore.set('dhun_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return NextResponse.json({ ok: true, token })
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookieToken = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('dhun_admin_token='))
    ?.split('=')[1]

  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

  const token = cookieToken || bearerToken

  if (token && isValidToken(token)) {
    return NextResponse.json({ authenticated: true })
  }
  return NextResponse.json({ authenticated: false }, { status: 401 })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('dhun_admin_token')
  return NextResponse.json({ ok: true })
}
