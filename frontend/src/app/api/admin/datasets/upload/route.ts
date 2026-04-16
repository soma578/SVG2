import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, verifyCsrfOrigin } from '@/lib/adminAuth'
import {
  normalizeUploadedDataset,
  normalizeUploadedWorkbook,
  type DatasetType,
} from '@/lib/datasets'

function isDatasetType(value: string): value is DatasetType {
  return value === 'shelters' || value === 'team-activity'
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ error: '不正なリクエスト元です' }, { status: 403 })
    }
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }
    const formData = await request.formData()
    const datasetTypeRaw = String(formData.get('datasetType') || '')
    const strict = String(formData.get('strict') || '') === 'true'
    const sheet = String(formData.get('sheet') || '') || null
    const file = formData.get('file')

    if (!isDatasetType(datasetTypeRaw)) {
      return NextResponse.json({ error: 'datasetType が不正です' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'アップロードファイルが必要です' }, { status: 400 })
    }

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
      return NextResponse.json({ error: '対応形式は .csv / .xlsx です' }, { status: 400 })
    }

    const preview = lowerName.endsWith('.xlsx')
      ? normalizeUploadedWorkbook(datasetTypeRaw, await file.arrayBuffer(), strict, sheet)
      : normalizeUploadedDataset(datasetTypeRaw, await file.text(), strict)
    return NextResponse.json(preview)
  } catch (error) {
    console.error('[api/admin/datasets/upload] failed:', error)
    return NextResponse.json({ error: 'データの検証に失敗しました' }, { status: 500 })
  }
}
