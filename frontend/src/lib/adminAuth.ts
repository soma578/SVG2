import crypto from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'admin_session'
const ADMIN_SESSION_TTL_SEC = 60 * 60 * 12

type AdminSessionPayload = {
  sub: string
  exp: number
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    console.error('[adminAuth] ADMIN_SESSION_SECRET is not set. Session tokens are insecure.')
  }
  return process.env.ADMIN_PASSWORD || 'dev-only-admin-session-secret'
}

/** 本番でデフォルト認証情報が使われていないかチェックする */
export function warnIfDefaultCredentials() {
  if (process.env.NODE_ENV !== 'production') return
  if (!process.env.ADMIN_USERNAME || process.env.ADMIN_USERNAME === 'admin') {
    console.error('[adminAuth] WARNING: ADMIN_USERNAME is default "admin". Set a proper value for production.')
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin') {
    console.error('[adminAuth] WARNING: ADMIN_PASSWORD is default "admin". Set a proper value for production.')
  }
  if (!process.env.ADMIN_SESSION_SECRET) {
    console.error('[adminAuth] WARNING: ADMIN_SESSION_SECRET is not set. Set a proper value for production.')
  }
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(value: string) {
  return crypto.createHmac('sha256', getAdminSessionSecret()).update(value).digest('base64url')
}

export function createAdminSessionToken(username: string, now = Date.now()) {
  const payload: AdminSessionPayload = {
    sub: username,
    exp: Math.floor(now / 1000) + ADMIN_SESSION_TTL_SEC,
  }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyAdminSessionToken(token: string | undefined | null): AdminSessionPayload | null {
  if (!token) return null
  const [encodedPayload, actualSignature] = token.split('.')
  if (!encodedPayload || !actualSignature) return null

  const expectedSignature = sign(encodedPayload)
  const actual = Buffer.from(actualSignature)
  const expected = Buffer.from(expectedSignature)
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<AdminSessionPayload>
    if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return null
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return { sub: payload.sub, exp: payload.exp }
  } catch {
    return null
  }
}

export function getAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  return verifyAdminSessionToken(token)
}

export function setAdminSessionCookie(response: NextResponse, username: string) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionToken(username),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SEC,
  })
}

/**
 * CSRF 対策: Origin / Referer ヘッダーを検証する。
 * POST リクエストが同一オリジンから来ていることを確認する。
 */
export function verifyCsrfOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!host) return false

  // Origin ヘッダーがあればそれで比較
  if (origin) {
    try {
      const originHost = new URL(origin).host
      return originHost === host
    } catch {
      return false
    }
  }

  // Origin がない場合は Referer で代替
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const refererHost = new URL(referer).host
      return refererHost === host
    } catch {
      return false
    }
  }

  // どちらもない場合は拒否
  return false
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}
