#!/usr/bin/env node
/**
 * japan-hierarchical-overview.json の県データから
 * regions/{pref-id}/ 以下に manifest.json, runtime-config.json,
 * 空の fallback ファイルを生成するスクリプト。
 *
 * Usage: node scripts/generate-prefecture-regions.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const REGIONS_DIR = join(ROOT, 'public', 'regions')
const INDEX_PATH = join(REGIONS_DIR, 'index.json')
const OVERVIEW_PATH = join(ROOT, 'public', 'search-index', 'japan-hierarchical-overview.json')

// 県名 → regionId の変換テーブル
const PREF_ID_MAP = {
  '北海道': 'hokkaido', '青森県': 'aomori', '岩手県': 'iwate', '宮城県': 'miyagi',
  '秋田県': 'akita', '山形県': 'yamagata', '福島県': 'fukushima',
  '茨城県': 'ibaraki', '栃木県': 'tochigi', '群馬県': 'gunma', '埼玉県': 'saitama',
  '千葉県': 'chiba', '東京都': 'tokyo', '神奈川県': 'kanagawa',
  '新潟県': 'niigata', '富山県': 'toyama', '石川県': 'ishikawa', '福井県': 'fukui',
  '山梨県': 'yamanashi', '長野県': 'nagano',
  '岐阜県': 'gifu', '静岡県': 'shizuoka', '愛知県': 'aichi', '三重県': 'mie',
  '滋賀県': 'shiga', '京都府': 'kyoto', '大阪府': 'osaka', '兵庫県': 'hyogo',
  '奈良県': 'nara', '和歌山県': 'wakayama',
  '鳥取県': 'tottori', '島根県': 'shimane', '岡山県': 'okayama-pref', '広島県': 'hiroshima', '山口県': 'yamaguchi',
  '徳島県': 'tokushima', '香川県': 'kagawa', '愛媛県': 'ehime', '高知県': 'kochi',
  '福岡県': 'fukuoka', '佐賀県': 'saga', '長崎県': 'nagasaki', '熊本県': 'kumamoto',
  '大分県': 'oita', '宮崎県': 'miyazaki', '鹿児島県': 'kagoshima', '沖縄県': 'okinawa',
}

// 既存リージョン (上書きしない)
const SKIP_REGION_IDS = new Set(['japan', 'okayama', 'okayama-demo', 'kurashiki'])

const overview = JSON.parse(readFileSync(OVERVIEW_PATH, 'utf-8'))
const prefectures = overview.prefectures

// 短い県名 (ラベル用)
function shortPrefName(pref) {
  return pref.replace(/(都|道|府|県)$/, '')
}

let generated = 0

for (const entry of prefectures) {
  const regionId = PREF_ID_MAP[entry.pref]
  if (!regionId) {
    console.warn(`SKIP: no ID mapping for ${entry.pref}`)
    continue
  }
  if (SKIP_REGION_IDS.has(regionId)) {
    console.log(`SKIP: ${regionId} (existing region)`)
    continue
  }

  const dir = join(REGIONS_DIR, regionId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const latPad = Math.max(entry.latSpan * 0.15, 0.05)
  const lonPad = Math.max(entry.lonSpan * 0.15, 0.05)

  const manifest = {
    regionId,
    regionLabel: shortPrefName(entry.pref),
    appTitle: '防災マップ',
    appDescription: `${entry.pref}の避難所・チーム活動を表示します。`,
    searchPlaceholder: '地区名・避難所名で検索',
    runtimeConfigUrl: `/regions/${regionId}/runtime-config.json`,
    municipalitiesLowZoomGeoJsonUrl: `/data/source/n03_national_light.geojson`,
    municipalitiesMidZoomGeoJsonUrl: `/data/source/n03_national_light.geojson`,
    districtDictionaryUrl: `/regions/${regionId}/district-dict.json`,
    municipalitiesGeoJsonUrl: `/data/source/n03_national_light.geojson`,
    svgBaseAreaLayerUrl: `/map/layers/runtime_empty.svg`,
    sheltersFallbackGeoJsonUrl: `/regions/${regionId}/shelters-fallback.geojson`,
    teamActivityFallbackJsonUrl: `/regions/${regionId}/team-activity-fallback.json`,
    sheltersSourceLabel: `national shelters (${entry.pref})`,
    teamActivitySourceLabel: `national team activity (${entry.pref})`,
  }

  const runtimeConfig = {
    version: '1',
    engine: 'maplibre',
    initialView: {
      center: { lat: entry.lat, lon: entry.lon },
      zoom: Math.max(entry.zoom, 7),
      span: Math.max(entry.latSpan, entry.lonSpan),
    },
    maxBounds: [
      [entry.lon - entry.lonSpan / 2 - lonPad, entry.lat - entry.latSpan / 2 - latPad],
      [entry.lon + entry.lonSpan / 2 + lonPad, entry.lat + entry.latSpan / 2 + latPad],
    ],
    layers: {
      baseArea: { runtimeVisible: true, opacity: 1, minZoom: 6 },
      basemap: { runtimeVisible: true, opacity: 1 },
      evacuation: { runtimeVisible: true, opacity: 1, minZoom: 9 },
      teamActivity: { runtimeVisible: false, opacity: 1, minZoom: 9 },
    },
    interaction: {
      disableDefaultPopup: true,
      featureSelectEvent: true,
    },
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(dir, 'runtime-config.json'), JSON.stringify(runtimeConfig, null, 2) + '\n')

  // 空 fallback ファイル (まだデータ未整備)
  if (!existsSync(join(dir, 'district-dict.json'))) {
    writeFileSync(join(dir, 'district-dict.json'), '{}\n')
  }
  if (!existsSync(join(dir, 'shelters-fallback.geojson'))) {
    writeFileSync(join(dir, 'shelters-fallback.geojson'), '{"type":"FeatureCollection","features":[]}\n')
  }
  if (!existsSync(join(dir, 'team-activity-fallback.json'))) {
    writeFileSync(join(dir, 'team-activity-fallback.json'), '[]\n')
  }

  console.log(`GENERATED: ${regionId} (${entry.pref})`)
  generated++
}

// index.json を更新
const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'))
const existingIds = new Set(index.regions.map(r => r.regionId))

for (const entry of prefectures) {
  const regionId = PREF_ID_MAP[entry.pref]
  if (!regionId || existingIds.has(regionId)) continue
  index.regions.push({
    regionId,
    regionLabel: shortPrefName(entry.pref),
    appTitle: '防災マップ',
  })
  existingIds.add(regionId)
}

writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')

console.log(`\nDone: generated ${generated} prefecture regions, updated index.json (${index.regions.length} total)`)
