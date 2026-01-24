import { NextResponse } from 'next/server'

type NowcastTime = { basetime: string, validtime: string }

const targetUrl = 'https://www.jma.go.jp/bosai/nowc/data/targetTimes.json'
const cacheTtlMs = 60 * 1000

let cache: { timestamp: number, payload: { baseTime: string, validTime: string } } | null = null

export async function GET() {
  try {
    const now = Date.now()
    if (cache && now - cache.timestamp < cacheTtlMs) {
      return NextResponse.json(cache.payload)
    }

    const res = await fetch(targetUrl, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Upstream error: ${res.status} ${res.statusText}`)
    }
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid nowcast payload')
    }

    const latest = data[data.length - 1] as NowcastTime
    const payload = {
      baseTime: latest.basetime,
      validTime: latest.validtime,
    }
    cache = { timestamp: now, payload }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Failed to fetch nowcast target times:', error)
    return NextResponse.json({ baseTime: null, validTime: null }, { status: 502 })
  }
}
