import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { getFromCache, saveToCache, type OutageData } from '@/lib/outageCacheKV'
import { checkRateLimit, getClientIP, setRateLimitHeaders } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * テキストのサニタイズ（XSS対策）
 */
function sanitizeText(text: string): string {
  if (!text) return ''

  // 基本的なHTMLエスケープ（cheerio.text()で既にタグは除去されているが念のため）
  return text
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    // 制御文字を除去
    .replace(/[\x00-\x1F\x7F]/g, '')
}

/**
 * 日付パラメータのバリデーション（SSRF対策）
 */
function validateDate(dateStr: string | null): string {
  // デフォルト値
  if (!dateStr) {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '')
  }

  // 形式チェック: YYYYMMDD (8桁の数字)
  const match = dateStr.match(/^(\d{8})$/)
  if (!match) {
    throw new Error('Invalid date format. Expected: YYYYMMDD')
  }

  // 範囲チェック
  const year = parseInt(dateStr.substring(0, 4))
  const month = parseInt(dateStr.substring(4, 6))
  const day = parseInt(dateStr.substring(6, 8))

  if (year < 2020 || year > 2030) {
    throw new Error('Year out of range (2020-2030)')
  }

  if (month < 1 || month > 12) {
    throw new Error('Month out of range (1-12)')
  }

  if (day < 1 || day > 31) {
    throw new Error('Day out of range (1-31)')
  }

  // 簡易的な日付妥当性チェック
  const date = new Date(year, month - 1, day)
  if (date.getMonth() + 1 !== month) {
    throw new Error('Invalid date')
  }

  return dateStr
}

/**
 * タイプパラメータのバリデーション（SSRF対策）
 */
function validateType(typeStr: string | null): string {
  // 許可される値: 空文字列 または "other"
  if (!typeStr || typeStr === '') {
    return ''
  }

  if (typeStr === 'other') {
    return 'other'
  }

  throw new Error('Invalid type parameter. Allowed: "" or "other"')
}

/**
 * 中国電力の停電情報をスクレイピング
 *
 * キャッシュ機構:
 * - 同じ日付・種別のデータは5分間キャッシュされます
 * - これにより中国電力のサーバーへの負荷を軽減します
 *
 * クエリパラメータ:
 * - date: YYYYMMDD形式（デフォルト: 今日）
 * - type: 停電種別（空 = 5分以上、other = 5分未満）
 */
export async function GET(request: NextRequest) {
  // レート制限チェック（DoS対策）
  const clientIP = getClientIP(request)
  const rateLimitResult = await checkRateLimit(clientIP)

  if (!rateLimitResult.success) {
    const headers = new Headers()
    setRateLimitHeaders(headers, rateLimitResult)

    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
      }),
      {
        status: 429,
        headers
      }
    )
  }

  const searchParams = request.nextUrl.searchParams

  // パラメータのバリデーション（SSRF対策）
  let date: string
  let type: string

  try {
    date = validateDate(searchParams.get('date'))
    type = validateType(searchParams.get('type'))
  } catch (error: unknown) {
    const validationError = error instanceof Error ? error.message : 'Invalid parameters'
    console.warn('[Scrape] Validation error:', validationError)

    const response = NextResponse.json({
      success: false,
      error: 'Invalid request parameters',
      data: []
    }, { status: 400 })
    setRateLimitHeaders(response.headers, rateLimitResult)
    return response
  }

  // キャッシュをチェック
  const cached = await getFromCache(date, type)
  if (cached) {
    const currentOutages = cached.filter(o => o.status === 'ongoing')
    const response = NextResponse.json({
      success: true,
      total: cached.length,
      current: currentOutages.length,
      data: currentOutages,
      all: cached,
      fromCache: true
    })
    setRateLimitHeaders(response.headers, rateLimitResult)
    return response
  }

  // バリデーション済みのパラメータでURL構築
  const url = `https://www.teideninfo.energia.co.jp/LWC30040/index?date=${date}&type=${type}`

  try {
    console.log('[Scrape] Fetching from source:', url)

    // 中国電力のページを取得
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!fetchResponse.ok) {
      throw new Error(`HTTP ${fetchResponse.status}`)
    }

    const html = await fetchResponse.text()
    const $ = cheerio.load(html)

    const outages: OutageData[] = []

    // 県名レベルのデータ（li.js-tdk）
    $('.js-tdk').each((_, prefElement) => {
      const prefectureRaw = $(prefElement).attr('data-tdk') || ''

      // 岡山県のデータのみ処理
      if (prefectureRaw !== '岡山県') return

      const prefecture = sanitizeText(prefectureRaw)

      // 市区町村レベルのデータ（li.js-scg）
      $(prefElement).find('.js-scg').each((_, cityElement) => {
        const cityFull = $(cityElement).attr('data-scg') || ''
        const egsTdn = $(cityElement).attr('data-egs-tdn') || ''

        // 市区町村名を分割（例: "岡山市　北区" → city="岡山市", ward="北区"）
        let city = sanitizeText(cityFull.trim())
        let ward = ''

        // 全角・半角スペースで分割
        const spaceMatch = cityFull.match(/^(.+?)[\s　]+(.+)$/)
        if (spaceMatch) {
          city = sanitizeText(spaceMatch[1].trim())
          ward = sanitizeText(spaceMatch[2].trim())
        }

        // この市区町村の停電リスト（ul.js-knm）
        const knmList = $(`.js-knm[data-egs-tdn="${egsTdn}"]`)

        // ul.js-knmの直接の子liのみを取得
        const childLis = knmList.children('li')

        // 最初の2つのli（ヘッダーとデータ）を処理
        // li[0]: 停電理由ヘッダー（スキップ）
        // li[1]: 停電理由データ（処理する）
        // li[2]: 停電エリアヘッダー（スキップ）
        // li[3以降]: 停電エリアデータ（別途.js-scgで処理済み）

        if (childLis.length >= 2) {
          const outageDataLi = $(childLis[1])

          // 直接の子要素のdivのみを取得
          const divs = outageDataLi.children('div')

          if (divs.length >= 3 && !outageDataLi.hasClass('p-table-list_head')) {
            const timestampDiv = $(divs[0]).text().trim()
            const recoveredAtDiv = $(divs[1]).text().trim()
            const causeRaw = $(divs[2]).text().trim()
            const householdsText = divs.length >= 4 ? $(divs[3]).text().trim() : '0'

            // 空行をスキップ
            if (!timestampDiv) return

            // 停電戸数を数値に変換
            const households = parseInt(householdsText.replace(/[^0-9]/g, '')) || 0

            // 地域名を取得（span.js-jsy - この市区町村の全地区）
            const districts: string[] = []
            $(cityElement).find('.js-jsy').each((_, districtSpan) => {
              const districtName = $(districtSpan).attr('data-jsy')
              if (districtName && districtName.trim()) {
                districts.push(sanitizeText(districtName.trim()))
              }
            })

            // 地区名がない場合は市区町村名のみ
            const districtName = districts.length > 0 ? districts.join(', ') : ''

            outages.push({
              prefecture,
              city,
              ward: ward || undefined,
              district: districtName,
              households,
              timestamp: parseJapaneseDate(timestampDiv),
              cause: sanitizeText(causeRaw),
              status: recoveredAtDiv && recoveredAtDiv !== '-' ? 'recovered' : 'ongoing',
              recovered_at: recoveredAtDiv && recoveredAtDiv !== '-' ? parseJapaneseDate(recoveredAtDiv) : undefined
            })
          }
        }
      })
    })

    console.log('[Scrape] Found', outages.length, 'outages')

    // キャッシュに保存
    await saveToCache(date, type, outages)

    // 現在停電中のもののみフィルタ（リアルタイムモードの場合）
    const currentOutages = outages.filter(o => o.status === 'ongoing')

    const response = NextResponse.json({
      success: true,
      total: outages.length,
      current: currentOutages.length,
      data: currentOutages,
      all: outages, // デバッグ用
      fromCache: false
    })
    setRateLimitHeaders(response.headers, rateLimitResult)
    return response

  } catch (error: unknown) {
    // 詳細なエラーはサーバーログのみに記録（情報漏洩対策）
    console.error('[Scrape] Error:', error)

    // エラー時は古いキャッシュを返す（フォールバック）
    const staleCache = await getFromCache(date, type)
    if (staleCache && staleCache.length > 0) {
      console.warn('[Scrape] Returning stale cache due to error')
      const currentOutages = staleCache.filter(o => o.status === 'ongoing')
      const response = NextResponse.json({
        success: true,
        total: staleCache.length,
        current: currentOutages.length,
        data: currentOutages,
        all: staleCache,
        fromCache: true,
        stale: true,
        warning: 'Using cached data due to temporary service issue'
      })
      setRateLimitHeaders(response.headers, rateLimitResult)
      return response
    }

    // キャッシュもない場合は一般的なエラーメッセージのみ返す
    const response = NextResponse.json({
      success: false,
      error: 'Failed to fetch outage data. Please try again later.',
      data: []
    }, { status: 500 })
    setRateLimitHeaders(response.headers, rateLimitResult)
    return response
  }
}

/**
 * 日本語の日時表記（例: 2026/01/19 10:30 or 2026/01/24 <br> 04:13）をISO形式に変換
 * 日本時間(JST, UTC+9)として解釈してISO文字列を返す
 */
function parseJapaneseDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') {
    return new Date().toISOString()
  }

  try {
    // HTMLタグや余分な空白を除去して正規化
    const normalized = dateStr.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

    // "2026/01/24 04:13" のような形式をパース
    const parts = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/)

    if (parts) {
      const [_, year, month, day, hour, minute] = parts

      // 日本時間として扱うため、ISO文字列を直接構築
      // YYYY-MM-DDTHH:mm:00.000Z 形式で返す（UTCではなくJSTとして扱う）
      const paddedMonth = month.padStart(2, '0')
      const paddedDay = day.padStart(2, '0')
      const paddedHour = hour.padStart(2, '0')
      const paddedMinute = minute.padStart(2, '0')

      const isoString = `${year}-${paddedMonth}-${paddedDay}T${paddedHour}:${paddedMinute}:00.000Z`

      console.log('[Scrape] ✓ Parsed date:', normalized, '→', isoString)
      return isoString
    } else {
      console.error('[Scrape] ✗ Date format mismatch:', dateStr, '(normalized:', normalized, ')')
    }
  } catch (e) {
    console.error('[Scrape] Date parse error:', dateStr, e)
  }

  console.warn('[Scrape] ⚠ Failed to parse date, using current time:', dateStr)
  return new Date().toISOString()
}
