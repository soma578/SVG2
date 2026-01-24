import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import iconv from 'iconv-lite'

interface Shelter {
  id: string
  name: string
  kind: string
  lon: number
  lat: number
  url: string
  summary: string
}

/**
 * CSVファイルを読み込み、文字コードを自動判定してUTF-8に変換
 */
function readCSVWithEncoding(filePath: string): string {
  // バッファとして読み込み
  const buffer = fs.readFileSync(filePath)

  // 簡易的な文字コード判定
  // UTF-8 BOMをチェック
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    // UTF-8 BOM付き
    return buffer.toString('utf-8')
  }

  // Shift-JISの特徴的なバイトパターンをチェック
  // 日本語が含まれている場合、Shift-JISとして試す
  let hasShiftJISPattern = false
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    const byte = buffer[i]
    // Shift-JISの2バイト文字の1バイト目の範囲
    if ((byte >= 0x81 && byte <= 0x9F) || (byte >= 0xE0 && byte <= 0xFC)) {
      hasShiftJISPattern = true
      break
    }
  }

  // Shift-JISパターンが見つかった場合、Shift-JISとしてデコード
  if (hasShiftJISPattern) {
    try {
      const decoded = iconv.decode(buffer, 'Shift_JIS')
      // 正常にデコードできたか簡易チェック（文字化けしていないか）
      if (!decoded.includes('�')) {
        console.log('CSV file detected as Shift-JIS, converted to UTF-8')
        return decoded
      }
    } catch (e) {
      console.warn('Shift-JIS decode failed, trying UTF-8:', e)
    }
  }

  // デフォルトはUTF-8
  return buffer.toString('utf-8')
}

export async function GET() {
  try {
    // CSVファイルのパス
    const csvPath = path.join(process.cwd(), 'public', 'map', 'data', 'shelters_okayama.csv')

    // ファイルを読み込み（文字コード自動判定）
    const fileContent = readCSVWithEncoding(csvPath)

    // CSVをパース
    const lines = fileContent.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

    const shelters: Shelter[] = lines.slice(1).map((line, index) => {
      // CSVの行をパース（カンマ区切りだが、ダブルクォート内のカンマは無視）
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/
      const values = line.split(regex).map(v => v.replace(/^"|"$/g, '').trim())

      return {
        id: `shelter-${index}`,
        name: values[0] || '',
        kind: values[1] || '',
        lon: parseFloat(values[2]) || 0,
        lat: parseFloat(values[3]) || 0,
        url: values[4] || '#',
        summary: values[5] || '',
      }
    })

    return NextResponse.json(shelters)
  } catch (error) {
    console.error('Failed to load shelters:', error)
    return NextResponse.json({ error: 'Failed to load shelters' }, { status: 500 })
  }
}
