import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'

export function getCurrentMapFeatureMeta(category?: string) {
  switch (category) {
    case 'baseArea':
      return { badge: 'ベースエリア', linkLabel: '詳細ページを開く' }
    case 'shelter':
    case 'evacuation':
      return { badge: '避難所', linkLabel: '詳細ページを開く' }
    case 'teamActivity':
      return { badge: 'チーム活動', linkLabel: '詳細ページを開く' }
    default:
      return { badge: '地図情報', linkLabel: '詳細ページを開く' }
  }
}

export function buildCurrentMapFeatureInfoItems(feature: CurrentMapFeatureProperties) {
  const status = feature.status?.trim()

  return [
    feature.facilityType ? { label: '施設種別', value: feature.facilityType } : null,
    Number.isFinite(feature.capacity) ? { label: '収容人数', value: `${feature.capacity} 人` } : null,
    status ? { label: '状態', value: status } : null,
    feature.teamId ? { label: 'チームID', value: feature.teamId } : null,
    feature.teamName ? { label: 'チーム名', value: feature.teamName } : null,
    feature.activityType ? { label: '活動種別', value: feature.activityType } : null,
    feature.operator ? { label: '担当組織', value: feature.operator } : null,
    feature.area ? { label: '担当地域', value: feature.area } : null,
    feature.updatedBy ? { label: '更新者', value: feature.updatedBy } : null,
    feature.updatedAt ? { label: '更新時刻', value: feature.updatedAt } : null,
    feature.barrierFree != null
      ? { label: 'バリアフリー', value: feature.barrierFree ? '対応' : '非対応' }
      : null,
    feature.pets != null
      ? { label: 'ペット同行', value: feature.pets ? '可' : '不可' }
      : null,
  ].filter(Boolean) as { label: string; value: string }[]
}
