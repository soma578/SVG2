import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { getFromCache, saveToCache } from '@/lib/outageCache'

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
 * - nocache: true の場合、キャッシュを無視して再取得
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // 日付パラメータ（デフォルト: 今日）
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const type = searchParams.get('type') || ''
  const nocache = searchParams.get('nocache') === 'true'

  // キャッシュをチェック
  if (!nocache) {
    const cached = getFromCache(date, type)
    if (cached) {
      const currentOutages = cached.filter(o => o.status === 'ongoing')
      return NextResponse.json({
        success: true,
        total: cached.length,
        current: currentOutages.length,
        data: currentOutages,
        all: cached,
        fromCache: true
      })
    }
  }

  const url = `https://www.teideninfo.energia.co.jp/LWC30040/index?date=${date}&type=${type}`

  try {
    console.log('[Scrape] Fetching from source:', url)

    // 中国電力のページを取得
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const outages: any[] = []

    // 県名レベルのデータ（li.js-tdk）
    $('.js-tdk').each((_, prefElement) => {
      const prefecture = $(prefElement).attr('data-tdk') || ''

      // 岡山県のデータのみ処理
      if (prefecture !== '岡山県') return

      // 市区町村レベルのデータ（li.js-scg）
      $(prefElement).find('.js-scg').each((_, cityElement) => {
        const cityFull = $(cityElement).attr('data-scg') || ''
        const egsTdn = $(cityElement).attr('data-egs-tdn') || ''

        // 市区町村名を分割（例: "岡山市　北区" → city="岡山市", ward="北区"）
        let city = cityFull.trim()
        let ward = ''

        // 全角・半角スペースで分割
        const spaceMatch = cityFull.match(/^(.+?)[\s　]+(.+)$/)
        if (spaceMatch) {
          city = spaceMatch[1].trim()
          ward = spaceMatch[2].trim()
        }

        // この市区町村の停電リスト（ul.js-knm）
        const knmList = $(`.js-knm[data-egs-tdn="${egsTdn}"]`)

        knmList.find('li').each((_, outageItem) => {
          const divs = $(outageItem).find('div')

          // ヘッダー行をスキップ
          if ($(outageItem).hasClass('p-table-list_head')) return

          if (divs.length >= 3) {
            const timestampDiv = $(divs[0]).text().trim().replace(/\s+/g, ' ')
            const recoveredAtDiv = $(divs[1]).text().trim().replace(/\s+/g, ' ')
            const cause = $(divs[2]).text().trim()
            const householdsText = divs.length >= 4 ? $(divs[3]).text().trim() : '0'

            // 空行をスキップ
            if (!timestampDiv) return

            // 停電戸数を数値に変換
            const households = parseInt(householdsText.replace(/[^0-9]/g, '')) || 0

            // 地域名を取得（span.js-jsy）
            const districts: string[] = []
            $(outageItem).find('.js-jsy').each((_, districtSpan) => {
              const districtName = $(districtSpan).attr('data-jsy')
              if (districtName && districtName.trim()) {
                districts.push(districtName.trim())
              }
            })

            // 地区名がない場合は市区町村名のみ
            const districtName = districts.length > 0 ? districts.join(', ') : ''

            outages.push({
              prefecture: '岡山県',
              city,
              ward: ward || undefined,
              district: districtName,
              households,
              timestamp: parseJapaneseDate(timestampDiv),
              cause,
              status: recoveredAtDiv && recoveredAtDiv !== '-' ? 'recovered' : 'ongoing',
              recovered_at: recoveredAtDiv && recoveredAtDiv !== '-' ? parseJapaneseDate(recoveredAtDiv) : undefined
            })
          }
        })
      })
    })

    console.log('[Scrape] Found', outages.length, 'outages')

    // キャッシュに保存
    saveToCache(date, type, outages)

    // 現在停電中のもののみフィルタ（リアルタイムモードの場合）
    const currentOutages = outages.filter(o => o.status === 'ongoing')

    return NextResponse.json({
      success: true,
      total: outages.length,
      current: currentOutages.length,
      data: currentOutages,
      all: outages, // デバッグ用
      fromCache: false
    })

  } catch (error: any) {
    console.error('[Scrape] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      data: []
    }, { status: 500 })
  }
}

/**
 * 日本語の日時表記（例: 2026/01/19 10:30）をISO形式に変換
 */
function parseJapaneseDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') return new Date().toISOString()

  try {
    // "2026/01/19 10:30" のような形式を想定
    const parts = dateStr.trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/)

    if (parts) {
      const [_, year, month, day, hour, minute] = parts
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      )
      return date.toISOString()
    }
  } catch (e) {
    console.error('[Scrape] Date parse error:', dateStr, e)
  }

  return new Date().toISOString()
}
