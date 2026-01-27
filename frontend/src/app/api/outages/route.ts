import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * 停電情報APIのモック実装
 * 実際の運用では、中国電力や地方自治体のAPIから取得する
 *
 * クエリパラメータ:
 * - timeRange: current | 1h | 24h | 7d (注: 7dは実際には過去3日間)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const timeRange = searchParams.get('timeRange') || 'current'
  const demo = searchParams.get('demo') === 'true' // デモモード

  const now = new Date()

  // 時間範囲に応じたタイムスタンプ生成
  const generateTimestamp = (hoursAgo: number) => {
    const date = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
    return date.toISOString()
  }

  // 現在の停電情報（リアルタイム）
  const currentOutages = [
    {
      prefecture: "岡山県",
      city: "岡山市",
      ward: "北区",
      district: "京山1丁目",
      households: 120,
      timestamp: now.toISOString(),
      cause: "設備故障",
      estimated_recovery: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      status: "ongoing"
    },
    {
      prefecture: "岡山県",
      city: "倉敷市",
      district: "阿知1丁目",
      households: 95,
      timestamp: now.toISOString(),
      cause: "設備故障",
      estimated_recovery: new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString(),
      status: "ongoing"
    }
  ]

  // 過去の停電履歴（モック）
  const historicalOutages = [
    // 30分前に復旧
    {
      prefecture: "岡山県",
      city: "岡山市",
      ward: "中区",
      district: "浜1丁目",
      households: 85,
      timestamp: generateTimestamp(2),
      cause: "樹木接触",
      recovered_at: generateTimestamp(0.5),
      status: "recovered"
    },
    // 3時間前に復旧
    {
      prefecture: "岡山県",
      city: "津山市",
      district: "山下",
      households: 45,
      timestamp: generateTimestamp(5),
      cause: "設備点検",
      recovered_at: generateTimestamp(3),
      status: "recovered"
    },
    // 12時間前に復旧
    {
      prefecture: "岡山県",
      city: "岡山市",
      ward: "南区",
      district: "築港栄町",
      households: 150,
      timestamp: generateTimestamp(15),
      cause: "台風被害",
      recovered_at: generateTimestamp(12),
      status: "recovered"
    },
    // 2日前に復旧
    {
      prefecture: "岡山県",
      city: "倉敷市",
      district: "中央1丁目",
      households: 200,
      timestamp: generateTimestamp(50),
      cause: "落雷",
      recovered_at: generateTimestamp(48),
      status: "recovered"
    },
    // 5日前に復旧
    {
      prefecture: "岡山県",
      city: "玉野市",
      district: "宇野1丁目",
      households: 80,
      timestamp: generateTimestamp(125),
      cause: "設備故障",
      recovered_at: generateTimestamp(120),
      status: "recovered"
    }
  ]

  // デモモードでない場合は実データを取得（中国電力スクレイピング）
  if (!demo) {
    try {
      const baseUrl = request.nextUrl.origin
      const allOutages: any[] = []

      // 時間範囲に応じて複数日分を取得
      let daysToFetch = 1 // デフォルト: 今日のみ

      switch (timeRange) {
        case '1h':
        case 'current':
          daysToFetch = 1 // 今日のみ
          break
        case '24h':
          daysToFetch = 2 // 今日+昨日
          break
        case '7d':
          daysToFetch = 3 // 過去3日間（7日は長すぎる）
          break
      }

      console.log(`[Outage] Fetching ${daysToFetch} days of data...`)

      // 過去N日分のデータを取得
      for (let i = 0; i < daysToFetch; i++) {
        const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = targetDate.toISOString().slice(0, 10).replace(/-/g, '')

        const scrapeUrl = `${baseUrl}/api/outages/scrape?date=${dateStr}`
        console.log(`[Outage] Scraping date: ${dateStr}`)

        const scrapeResponse = await fetch(scrapeUrl)

        if (!scrapeResponse.ok) {
          console.error(`[Outage] Scrape failed for date ${dateStr}: HTTP ${scrapeResponse.status}`)
          continue
        }

        const contentType = scrapeResponse.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          console.error(`[Outage] Invalid content-type for date ${dateStr}: ${contentType}`)
          continue
        }

        const scrapeData = await scrapeResponse.json()

        if (scrapeData.success && scrapeData.all) {
          allOutages.push(...scrapeData.all) // 全データ（ongoing + recovered）
          console.log(`[Outage] Date ${dateStr}: ${scrapeData.all.length} outages`)
        } else if (scrapeData.error) {
          console.error(`[Outage] Scrape error for date ${dateStr}: ${scrapeData.error}`)
        }
      }

      // 時間範囲でフィルタリング
      let filteredOutages = allOutages

      if (timeRange === 'current') {
        // リアルタイム：現在停電中のみ
        filteredOutages = allOutages.filter(o => o.status === 'ongoing')
      } else if (timeRange === '1h') {
        // 過去1時間以内に発生
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
        filteredOutages = allOutages.filter(o => {
          const timestamp = new Date(o.timestamp)
          return timestamp >= oneHourAgo
        })
      }
      // 24h, 7d(3日間)はフィルタリング不要（期間内すべて）

      console.log(`[Outage] Returning ${filteredOutages.length} outages (filtered from ${allOutages.length})`)

      // デバッグ: 最初の2件を詳細ログ
      if (filteredOutages.length > 0) {
        console.log('[Outage] Sample data:', JSON.stringify(filteredOutages.slice(0, 2), null, 2))
      }

      return NextResponse.json(filteredOutages)

    } catch (error) {
      console.error('[Outage] Scraping error:', error)
      console.warn('[Outage] Falling back to demo mode due to scraping error')
      // スクレイピング失敗時はデモモードにフォールバック
      // この先のコードでデモデータが返される
    }
  }

  // デモモードまたはスクレイピング失敗時のフォールバック
  if (!demo) {
    console.log('[Outage] Using demo data as fallback')
  }

  // デモモード：テスト用のモックデータを返す
  let result = []

  switch (timeRange) {
    case 'current':
      // リアルタイム：現在停電中のみ
      result = currentOutages.filter(() => Math.random() > 0.3) // デモ用のランダム性
      break

    case '1h':
      // 過去1時間：現在 + 1時間以内に発生した停電
      result = [
        ...currentOutages,
        ...historicalOutages.filter(o => {
          const hoursAgo = (now.getTime() - new Date(o.timestamp).getTime()) / (60 * 60 * 1000)
          return hoursAgo <= 1
        })
      ]
      break

    case '24h':
      // 過去24時間：現在 + 24時間以内に発生した停電
      result = [
        ...currentOutages,
        ...historicalOutages.filter(o => {
          const hoursAgo = (now.getTime() - new Date(o.timestamp).getTime()) / (60 * 60 * 1000)
          return hoursAgo <= 24
        })
      ]
      break

    case '7d':
      // 過去3日間：すべての停電（デモ用）
      result = [
        ...currentOutages,
        ...historicalOutages
      ]
      break

    default:
      result = currentOutages
  }

  return NextResponse.json(result)
}
