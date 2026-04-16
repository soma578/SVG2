'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { currentMapRegionConfig, type CurrentMapRegionListEntry } from '@/lib/currentMapRegion'
import type {
  DatasetMetadata,
  DatasetType,
  NormalizedDatasetRecord,
  ValidationIssue,
} from '@/lib/datasets'

type UploadResponse = {
  datasetType: DatasetType
  normalized: NormalizedDatasetRecord[]
  previewRows: Record<string, unknown>[]
  issues: ValidationIssue[]
  summary: {
    rowCount: number
    errorCount: number
    warningCount: number
  }
}

const DATASET_LABELS: Record<DatasetType, string> = {
  shelters: 'L2 避難所',
  'team-activity': 'L3 チーム活動',
}

function formatDateTime(value: string | null) {
  if (!value) return '不明'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP')
}

export default function AdminDatasets() {
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)
  const [regionId, setRegionId] = useState(currentMapRegionConfig.regionId)
  const [availableRegions, setAvailableRegions] = useState<CurrentMapRegionListEntry[]>([])
  const [datasetType, setDatasetType] = useState<DatasetType>('shelters')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<DatasetMetadata[]>([])
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishUpdatedBy, setPublishUpdatedBy] = useState('')
  const [publishUpdateCadence, setPublishUpdateCadence] = useState('')
  const [publishUpdateNote, setPublishUpdateNote] = useState('')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store' })
        if (!response.ok) {
          if (!cancelled) {
            setAuthError('ログインが必要です')
            router.replace('/admin/login')
          }
          return
        }
        if (!cancelled) {
          setIsReady(true)
        }
      } catch (requestError) {
        console.error('[admin/datasets] session check failed:', requestError)
        if (!cancelled) {
          setAuthError('認証状態の確認に失敗しました')
          router.replace('/admin/login')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  const loadMetadata = async () => {
    setLoadingMeta(true)
    try {
      const response = await fetch(`/api/admin/datasets?region=${encodeURIComponent(regionId)}`, { cache: 'no-store' })
      const payload = await response.json()
      if (response.status === 401) {
        router.replace('/admin/login')
        return
      }
      if (!response.ok) {
        throw new Error(payload?.error || 'データセット情報の取得に失敗しました')
      }
      setMetadata(Array.isArray(payload?.datasets) ? payload.datasets : [])
    } catch (requestError) {
      console.error('[admin/datasets] metadata failed:', requestError)
      setError(requestError instanceof Error ? requestError.message : 'データセット情報の取得に失敗しました')
    } finally {
      setLoadingMeta(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const response = await fetch('/regions/index.json', { cache: 'force-cache' })
        if (!response.ok) return
        const payload = await response.json() as { regions?: CurrentMapRegionListEntry[] }
        if (cancelled) return
        const regions = Array.isArray(payload?.regions) ? payload.regions : []
        setAvailableRegions(regions)
      } catch (requestError) {
        console.error('[admin/datasets] region index failed:', requestError)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isReady) return
    void loadMetadata()
  }, [isReady, regionId])

  const currentMeta = useMemo(
    () => metadata.find((entry) => entry.datasetType === datasetType) ?? null,
    [datasetType, metadata]
  )

  useEffect(() => {
    setPublishUpdatedBy(currentMeta?.updatedBy ?? '')
    setPublishUpdateCadence(currentMeta?.updateCadence ?? '')
    setPublishUpdateNote(currentMeta?.updateNote ?? '')
  }, [currentMeta])

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch (requestError) {
      console.error('[admin/datasets] logout failed:', requestError)
    } finally {
      router.push('/admin/login')
    }
  }

  const handleValidateUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('datasetType', datasetType)
      formData.append('file', selectedFile)

      const response = await fetch('/api/admin/datasets/upload', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (response.status === 401) {
        router.replace('/admin/login')
        return
      }
      if (!response.ok) {
        throw new Error(payload?.error || 'アップロード検証に失敗しました')
      }
      setUploadResult(payload)
    } catch (requestError) {
      console.error('[admin/datasets] upload failed:', requestError)
      setError(requestError instanceof Error ? requestError.message : 'アップロード検証に失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const handlePublish = async () => {
    if (!uploadResult || uploadResult.summary.errorCount > 0) return
    setPublishing(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/datasets/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regionId,
          datasetType,
          records: uploadResult.normalized,
          updatedBy: publishUpdatedBy,
          updateCadence: publishUpdateCadence,
          updateNote: publishUpdateNote,
        }),
      })
      const payload = await response.json()
      if (response.status === 401) {
        router.replace('/admin/login')
        return
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || '公開に失敗しました')
      }
      await loadMetadata()
      setSelectedFile(null)
      setUploadResult(null)
    } catch (requestError) {
      console.error('[admin/datasets] publish failed:', requestError)
      setError(requestError instanceof Error ? requestError.message : '公開に失敗しました')
    } finally {
      setPublishing(false)
    }
  }

  if (!isReady) {
    return <div className="px-6 py-12">{authError || 'Loading...'}</div>
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="flex justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">データセット管理</h1>
            <p className="mt-2 text-sm text-gray-600">
              CSV を検証して、L2 / L3 の正規化 JSON を公開します。
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            ログアウト
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">現在のデータセット</h2>
          <div className="mb-4 max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象地域
            </label>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {(availableRegions.length > 0 ? availableRegions : [{
                regionId: currentMapRegionConfig.regionId,
                regionLabel: currentMapRegionConfig.regionLabel,
                appTitle: currentMapRegionConfig.appTitle,
              }]).map((region) => (
                <option key={region.regionId} value={region.regionId}>
                  {region.regionLabel}
                </option>
              ))}
            </select>
          </div>
          {loadingMeta ? (
            <p className="text-sm text-gray-500">読み込み中...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {metadata.map((entry) => (
                <div key={entry.datasetType} className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {DATASET_LABELS[entry.datasetType]}
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p>地域: {entry.regionId}</p>
                    <p>件数: {entry.rowCount} 件</p>
                    <p>更新: {formatDateTime(entry.updatedAt)}</p>
                    <p>更新者: {entry.updatedBy || '未設定'}</p>
                    <p>更新頻度: {entry.updateCadence || '未設定'}</p>
                    <p>更新メモ: {entry.updateNote || '未設定'}</p>
                    <p className="break-all">参照元: {entry.sourcePath}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-md p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">CSV / Excel アップロード</h2>
            <p className="mt-2 text-sm text-gray-600">
              docs の仕様に合わせて必須列と値を検証します。`.csv` と `.xlsx` のどちらでも検証・公開できます。
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                データ種別
              </label>
              <select
                value={datasetType}
                onChange={(e) => {
                  setDatasetType(e.target.value as DatasetType)
                  setUploadResult(null)
                  setSelectedFile(null)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="shelters">L2 避難所</option>
                <option value="team-activity">L3 チーム活動</option>
              </select>
              {currentMeta && (
                <p className="mt-2 text-xs text-gray-500">
                  現在の公開件数: {currentMeta.rowCount} 件
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ファイル
              </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null)
                  setUploadResult(null)
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark"
              />
              <p className="mt-2 text-xs text-gray-500">
                Excel は `shelters` または `team_activity` シートを優先して読み込みます。見つからない場合は先頭シートを使います。
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                更新者
              </label>
              <input
                type="text"
                value={publishUpdatedBy}
                onChange={(e) => setPublishUpdatedBy(e.target.value)}
                placeholder="例: 危機管理課 / admin"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                想定更新頻度
              </label>
              <input
                type="text"
                value={publishUpdateCadence}
                onChange={(e) => setPublishUpdateCadence(e.target.value)}
                placeholder="例: 毎日 9:00 / 随時"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              更新メモ
            </label>
            <textarea
              value={publishUpdateNote}
              onChange={(e) => setPublishUpdateNote(e.target.value)}
              rows={3}
              placeholder="今回の更新意図や運用メモを残せます"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleValidateUpload}
              disabled={!selectedFile || uploading}
              className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:bg-gray-300"
            >
              {uploading ? '検証中...' : 'アップロードして検証'}
            </button>
            <button
              onClick={handlePublish}
              disabled={!uploadResult || uploadResult.summary.errorCount > 0 || publishing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:bg-gray-300"
            >
              {publishing ? '公開中...' : '公開'}
            </button>
          </div>

          {uploadResult && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">検証後件数</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{uploadResult.summary.rowCount}</div>
                </div>
                <div className="rounded-lg bg-red-50 p-4">
                  <div className="text-xs text-red-500">エラー</div>
                  <div className="mt-1 text-2xl font-bold text-red-700">{uploadResult.summary.errorCount}</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-4">
                  <div className="text-xs text-amber-500">警告</div>
                  <div className="mt-1 text-2xl font-bold text-amber-700">{uploadResult.summary.warningCount}</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">先頭プレビュー</h3>
                {uploadResult.previewRows.length === 0 ? (
                  <p className="text-sm text-gray-500">表示できる行がありません。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(uploadResult.previewRows[0]).map((key) => (
                            <th key={key} className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {uploadResult.previewRows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {Object.entries(row).map(([key, value]) => (
                              <td key={key} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                                {value == null ? 'null' : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">検証結果</h3>
                {uploadResult.issues.length === 0 ? (
                  <p className="text-sm text-emerald-700">エラーも警告もありません。このまま公開できます。</p>
                ) : (
                  <div className="space-y-2">
                    {uploadResult.issues.map((issue, index) => (
                      <div
                        key={`${issue.level}-${issue.line}-${issue.column ?? ''}-${index}`}
                        className={`rounded-lg border px-4 py-3 text-sm ${
                          issue.level === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        <span className="font-semibold">{issue.level.toUpperCase()}</span>
                        {' '}
                        line {issue.line}
                        {issue.column ? ` / ${issue.column}` : ''}
                        : {issue.message}
                        {issue.value != null ? ` (${String(issue.value)})` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}
