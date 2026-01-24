/**
 * 近くのももちゃりポート表示パネル
 * README2の方針に従い、ルート計算は行わず候補表示とGoogle Maps連携のみ
 */

interface Bike {
  id: string
  lat: number
  lon: number
  status?: string
}

interface NearbyBike {
  bike: Bike
  meters: number
}

interface NearbyPortsPanelProps {
  bikes: Bike[]
  gpsPosition: [number, number] | null
  visitedCount: number
  totalCount: number
  onPortClick: (bike: Bike) => void
}

export default function NearbyPortsPanel({
  bikes,
  gpsPosition,
  visitedCount,
  totalCount,
  onPortClick,
}: NearbyPortsPanelProps) {
  // Haversine距離計算
  const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // 近くのポート上位5件を計算
  const nearbyBikes: NearbyBike[] = gpsPosition
    ? bikes
        .map((bike) => ({
          bike,
          meters: haversineMeters(gpsPosition[0], gpsPosition[1], bike.lat, bike.lon),
        }))
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 5)
    : []

  // Google Mapsで経路を開く
  const openInGoogleMaps = (bike: Bike) => {
    if (!gpsPosition) {
      // 現在地がない場合は地点だけを表示
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${bike.lat},${bike.lon}`,
        '_blank'
      )
    } else {
      // 現在地からのルートを表示
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${gpsPosition[0]},${gpsPosition[1]}&destination=${bike.lat},${bike.lon}&travelmode=bicycling`,
        '_blank'
      )
    }
  }

  return (
    <div className="bg-white/90 border border-slate-200 rounded-xl shadow-sm px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">
          ももチャリ探索
        </div>
        <div className="text-xs text-slate-600">
          訪問 {visitedCount}{totalCount ? ` / ${totalCount}` : ''}
        </div>
      </div>

      {!gpsPosition && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-xs text-yellow-800">
              現在地を取得すると、近くのポートを表示できます
            </div>
          </div>
        </div>
      )}

      {gpsPosition && nearbyBikes.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            近くのポート（上位{nearbyBikes.length}件）
          </div>
          <div className="space-y-1.5">
            {nearbyBikes.map(({ bike, meters }) => (
              <div
                key={bike.id}
                className="bg-white border border-slate-200 rounded-lg p-2 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => onPortClick(bike)}
                  >
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {bike.id}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      約{Math.round(meters)}m
                      {bike.status && ` • ${bike.status}`}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openInGoogleMaps(bike)}
                    className="flex-shrink-0 text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-100 rounded transition-colors"
                    title="Google Mapsで経路を見る"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-slate-500 text-center">
            経路ボタンをクリックするとGoogle Mapsで詳細なナビゲーションを確認できます
          </div>
        </div>
      )}
    </div>
  )
}
