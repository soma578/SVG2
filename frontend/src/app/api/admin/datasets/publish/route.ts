import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, verifyCsrfOrigin } from '@/lib/adminAuth'
import {
  saveNormalizedDataset,
  sanitizeRegionId,
  type DatasetType,
  type DatasetPublishMetadataInput,
  type NormalizedDatasetRecord,
} from '@/lib/datasets'

function isDatasetType(value: string): value is DatasetType {
  return value === 'shelters' || value === 'team-activity'
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ error: '不正なリクエスト元です' }, { status: 403 })
    }
    const session = getAdminSession(request)
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }
    const body = await request.json()
    const datasetType = String(body?.datasetType || '')
    const records = Array.isArray(body?.records) ? (body.records as NormalizedDatasetRecord[]) : null
    const metadata: DatasetPublishMetadataInput = {
      regionId: body?.regionId == null ? null : String(body.regionId),
      updatedBy: String(body?.updatedBy || session.sub || ''),
      updateNote: body?.updateNote == null ? null : String(body.updateNote),
      updateCadence: body?.updateCadence == null ? null : String(body.updateCadence),
    }

    if (!isDatasetType(datasetType)) {
      return NextResponse.json({ error: 'datasetType が不正です' }, { status: 400 })
    }
    if (!records) {
      return NextResponse.json({ error: '公開する records が必要です' }, { status: 400 })
    }
    if (metadata.regionId && !sanitizeRegionId(metadata.regionId)) {
      return NextResponse.json({ error: 'regionId が不正です' }, { status: 400 })
    }

    await saveNormalizedDataset(datasetType, records, metadata)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/datasets/publish] failed:', error)
    return NextResponse.json({ error: 'データ公開に失敗しました' }, { status: 500 })
  }
}
