import 'server-only'

import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { redis } from '@/src/lib/redis'
import { redirect } from 'next/navigation'

const COOKIE_NAME = 'admin_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 604800 seconds — matches JWT/Redis TTL

const WEAK_SECRET_PATTERNS = [
  'change-me-in-production',
  'change-this-to-a-secure-random-string',
  'your-secret-key',
  'your-secret',
]

function isWeakSecret(s: string): boolean {
  const lower = s.toLowerCase()
  return WEAK_SECRET_PATTERNS.some((p) => lower.includes(p))
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || isWeakSecret(secret)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to a strong random string in production')
    }
    return 'dev-secret-not-for-production'
  }
  return secret
}

const JWT_SECRET = getJwtSecret()

/**
 * Set the admin session cookie with the given JWT token.
 * Cookie is httpOnly, scoped to /admin path only.
 */
export async function setAdminSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: COOKIE_MAX_AGE,
  })
}

/**
 * Read and validate the admin session from the cookie.
 * Verifies JWT signature and checks Redis session existence.
 * Returns null if no valid session found.
 */
export async function getAdminSession(): Promise<{ userId: string; role: string; jti: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; jti: string; role: string }

    const sessionJson = await redis.get(`session:${decoded.jti}`)
    if (!sessionJson) return null

    const session = JSON.parse(sessionJson) as { userId: string }
    if (session.userId !== decoded.userId) return null

    return { userId: decoded.userId, role: decoded.role, jti: decoded.jti }
  } catch {
    return null
  }
}

/**
 * Require a valid admin session. Redirects to /admin/login if
 * no session exists or user is not an ADMIN.
 */
export async function requireAdminSession(): Promise<{ userId: string; role: string; jti: string }> {
  const session = await getAdminSession()
  if (!session || session.role !== 'ADMIN') {
    redirect('/admin/login')
  }
  return session
}

/**
 * Delete the admin session cookie (logout).
 */
export async function deleteAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
