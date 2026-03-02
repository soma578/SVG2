import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// 事前計算された地区カウントデータを返す
export async function GET() {
  try {
    const countsFile = path.join(process.cwd(), 'public', 'welfare_district_counts.json')

    if (!fs.existsSync(countsFile)) {
      console.warn('[API/welfare/district-counts] Pre-calculated file not found, returning empty')
      return NextResponse.json({
        counts: {},
        meta: {
          totalDistricts: 0,
          totalFacilities: 0,
          note: 'District counts not yet calculated. Run scripts/calculate-welfare-district-counts.js'
        }
      })
    }

    const data = JSON.parse(fs.readFileSync(countsFile, 'utf-8'))

    console.log(`[API/welfare/district-counts] Loaded ${data.meta.totalDistricts} districts, ${data.meta.totalFacilities} facilities`)

    return NextResponse.json(data)
  } catch (error) {
    console.error('[API/welfare/district-counts] Failed:', error)
    return NextResponse.json({
      error: 'Failed to load district counts',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
