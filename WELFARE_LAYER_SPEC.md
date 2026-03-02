# 老人福祉施設レイヤー 詳細仕様書

## 1. データソース

### 1.1 元データ
- **データ名**: 国土数値情報 P14-23（福祉施設）
- **提供元**: 国土交通省 国土数値情報ダウンロードサービス
- **データ形式**: GML（Geographic Markup Language）→ GeoJSON変換済み
- **データ年度**: 平成23年（2011年）版
- **対象範囲**: 全国47都道府県

### 1.2 フィルタリング条件
- **P14_005 = "02"** （老人福祉施設のみ）
  - 他の分類（保育園、幼稚園、障害者施設等）は除外
  - 抽出施設数: **38,891施設**

### 1.3 データ統計
| 項目 | 値 |
|------|-----|
| 総施設数 | 38,891施設 |
| 県別最大 | 埼玉県 3,051件 |
| 県別最小 | 鳥取県 約200件 |
| 市町村別最大 | 鹿児島市 334件 |
| GeoJSONサイズ | 20MB |
| PMTilesサイズ | 16MB |

---

## 2. P14フィールド定義

### 2.1 フィールド一覧

| フィールド | 属性名 | 説明 | 型 | 使用 |
|-----------|--------|------|-----|------|
| P14_001 | 都道府県名 | 施設が所在する都道府県名 | 文字列 | ○ |
| P14_002 | 市区町村名 | 施設が所在する市区町村名 | 文字列 | ○ |
| P14_003 | 行政区域コード | 施設が所在する行政コード | コード | △ |
| P14_004 | 所在地 | 市区町村名を省いた所在地 | 文字列 | △ |
| **P14_005** | **福祉施設大分類** | 施設の用途による大分類 | コード | **◎** |
| **P14_006** | **福祉施設中分類** | 施設の用途による中分類 | コード | **◎** |
| P14_007 | 福祉施設小分類 | 施設の用途による小分類 | コード | △ |
| **P14_008** | **名称** | 施設の正式名称 | 文字列 | **◎** |
| P14_009 | 管理者コード | 施設の管理者を区分 | コード | △ |
| P14_010 | 位置正確度 | 施設の位置正確度 | コード | - |

**使用凡例**: ◎主要 ○使用 △参照可 -未使用

### 2.2 P14_005（大分類）コード
```
01: 保護施設
02: 老人福祉施設 ← 本レイヤーで使用（フィルタ条件）
03: 障害者支援施設
04: 身体障害者社会参加支援
05: 児童福祉施設
06: 母子・父子福祉
99: その他
```

### 2.3 P14_006（中分類）コード - 老人福祉施設

| コード | 種別 | 説明 | 施設数 | 色 |
|-------|-----|------|--------|-----|
| 0201 | 養護老人ホーム | 経済的・環境的理由で在宅困難な高齢者向け | 889 | #dc2626（赤） |
| 0202 | ケアハウス | 軽費老人ホームの一種、自立～軽介護 | 2,184 | #ea580c（オレンジ） |
| 0203 | 老人福祉センター | 高齢者の交流・レクリエーション施設 | 1,514 | #ca8a04（黄） |
| **0204** | **デイサービスセンター** | 通所介護事業所（最多） | **25,270** | #16a34a（緑） |
| 0205 | 短期入所生活介護 | ショートステイ施設 | 7,616 | #0891b2（シアン） |
| 0206 | 在宅介護支援センター | 訪問介護・相談支援 | 988 | #2563eb（青） |
| 0207 | 生活支援ハウス | 高齢者生活福祉センター | 338 | #7c3aed（紫） |
| 0299 | その他老人福祉施設 | 上記以外の老人福祉施設 | 89 | #6b7280（グレー） |

**合計**: 38,891施設

---

## 3. データ変換プロセス

### 3.1 変換スクリプト: `scripts/convert-p14-welfare.sh`

```bash
#!/bin/bash
# 入力: P14-23_GML/*.zip（47都道府県）
# 出力: data/source/welfare_facilities_roujin.geojson

# 処理フロー:
# 1. 全都道府県のZIPファイルを解凍
# 2. jqでP14_005="02"のfeatureのみ抽出
# 3. 全都道府県のデータを統合
# 4. FeatureCollection形式で出力

# 使用コマンド例:
jq '.features | map(select(.properties.P14_005 == "02"))' input.geojson
jq -s '{"type":"FeatureCollection","features":[.[][]]}' *.json
```

**実行方法**:
```bash
cd /home/ubuntu/SVG2
bash scripts/convert-p14-welfare.sh
```

**出力**:
- `data/source/welfare_facilities_roujin.geojson` (20MB)

### 3.2 PMTiles生成

```bash
tippecanoe \
  --output frontend/public/tiles/welfare_roujin.pmtiles \
  --force \
  --minimum-zoom=8 \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --layer=welfare \
  --name="老人福祉施設" \
  --attribution="国土数値情報P14" \
  --exclude-all \
  --include=P14_001 \
  --include=P14_002 \
  --include=P14_004 \
  --include=P14_005 \
  --include=P14_006 \
  --include=P14_007 \
  --include=P14_008 \
  data/source/welfare_facilities_roujin.geojson
```

**出力**:
- `frontend/public/tiles/welfare_roujin.pmtiles` (16MB)

---

## 4. 実装方式

### 4.1 ズームレベル別の表示方式

| ズームレベル | 表示方式 | データソース | レイヤーID |
|------------|---------|------------|-----------|
| 8 〜 8.7 | **県単位クラスター** | API（GeoJSON） | `welfare-pref-cluster` |
| 8.7 〜 11 | **市町村単位クラスター** | API（GeoJSON） | `welfare-muni-clusters` |
| 11 〜 14 | **地区単位クラスター** | API（GeoJSON） | `welfare-clusters` |
| 14+ | **個別施設ポイント** | PMTiles | `welfare-points` |

### 4.2 クラスター設定（GeoJSON）

#### 県クラスター（ズーム8-8.7）
- **データソース**: `/api/welfare/prefecture-counts`
- **集計単位**: P14_001（都道府県名）
- **レンダリング**: `<Source>` + `<Layer>` (JSX)
- **ファイル**: `MapLibreMap.tsx:1420-1460`

**色分けロジック**:
```typescript
'circle-color': [
  'interpolate', ['linear'],
  ['get', 'point_count'],
  300, '#dbeafe',    // 300件: 薄い青
  1000, '#93c5fd',   // 1,000件: 青
  2000, '#f59e0b',   // 2,000件: オレンジ
  3000, '#b91c1c'    // 3,000件: 赤
]
```

**円サイズ**:
```typescript
'circle-radius': [
  'interpolate', ['exponential', 1.6],
  ['get', 'point_count'],
  300, 30,     // 300件
  1000, 50,    // 1,000件
  2000, 80,    // 2,000件
  3000, 110    // 3,000件
]
```

#### 市町村クラスター（ズーム8.7-11）
- **データソース**: `/api/welfare/municipality-centers`
- **集計単位**: P14_001 + P14_002（都道府県名 + 市区町村名）
- **レンダリング**: `<Source>` + `<Layer>` (JSX)
- **ファイル**: `MapLibreMap.tsx:1464-1510`

**色分けロジック**:
```typescript
'circle-color': [
  'interpolate', ['linear'],
  ['get', 'point_count'],
  0, '#e0f2fe',      // 0件: 薄い青
  20, '#7dd3fc',     // 20件: シアン
  90, '#fdba74',     // 90件: オレンジ
  300, '#ef4444'     // 300件: 赤
]
```

**円サイズ**:
```typescript
'circle-radius': [
  'interpolate', ['exponential', 1.8],
  ['get', 'point_count'],
  0, 6,
  2, 10,
  10, 16,
  80, 26,
  220, 48,
  700, 96
]
```

#### 地区クラスター（ズーム11-14）
- **データソース**: `/api/welfare?west={}&south={}&east={}&north={}&limit=10000`
- **クラスタリング**: MapLibre GL JS自動クラスター
- **設定**: `clusterRadius: 60`, `clusterMaxZoom: 13`
- **ファイル**: `MapLibreMap.tsx:754-820`

**色分けロジック**:
```typescript
'circle-color': [
  'interpolate', ['linear'],
  ['get', 'point_count'],
  1, '#bfdbfe',      // 1件: 薄い青
  10, '#60a5fa',     // 10件: 青
  25, '#fb923c',     // 25件: オレンジ
  50, '#dc2626'      // 50件: 赤
]
```

**円サイズ**:
```typescript
'circle-radius': [
  'interpolate', ['exponential', 1.5],
  ['get', 'point_count'],
  1, 12,      // 1件
  10, 20,     // 10件
  25, 28,     // 25件
  50, 38      // 50件
]
```

### 4.3 個別施設ポイント（ズーム14+）

- **データソース**: PMTiles (`/tiles/welfare_roujin.pmtiles`)
- **レイヤーID**: `welfare-points`
- **ファイル**: `MapLibreMap.tsx:824-867`

**色分けロジック（P14_006による種別分類）**:
```typescript
'circle-color': [
  'match',
  ['get', 'P14_006'], // 施設種別コード（中分類）
  '0201', '#dc2626',   // 養護老人ホーム: 赤
  '0202', '#ea580c',   // ケアハウス: オレンジ
  '0203', '#ca8a04',   // 老人福祉センター: 黄
  '0204', '#16a34a',   // デイサービスセンター: 緑
  '0205', '#0891b2',   // 短期入所生活介護: シアン
  '0206', '#2563eb',   // 在宅介護支援センター: 青
  '0207', '#7c3aed',   // 生活支援ハウス: 紫
  '0299', '#6b7280',   // その他: グレー
  '#9ca3af'            // 不明: ライトグレー
]
```

**円サイズ**:
```typescript
'circle-radius': [
  'interpolate', ['linear'],
  ['zoom'],
  14, 8,     // ズーム14: クリック可能なサイズ
  16, 12,    // ズーム16: 詳細表示
  18, 16     // ズーム18: 最大サイズ
]
```

---

## 5. 実装ファイル一覧

### 5.1 コンポーネント

#### `frontend/src/components/map/MapLibreMap.tsx`
- **役割**: メインマップコンポーネント、全レイヤー定義
- **行数**: 約1,800行

**主要セクション**:
- **754-820行**: 地区クラスター（GeoJSON, clusterRadius: 60）
- **824-867行**: 個別施設ポイント（PMTiles）
- **1420-1460行**: 県クラスター（JSX）
- **1464-1510行**: 市町村クラスター（JSX）
- **97-110行**: `openWelfarePopup()` - ポップアップ表示関数
- **546-596行**: 福祉施設クリックハンドラー

#### `frontend/src/components/map/Legend.tsx`
- **役割**: 凡例コンポーネント
- **対象行**: 134-184行

**表示内容**:
- ズーム8-8.7: 県広域（300 → 1,000 → 2,000 → 3,000件）
- ズーム8.7-11: 市町村（0 → 20 → 90 → 300件）
- ズーム11-14: 地区（1 → 10 → 25 → 50件）
- ズーム14+: 個別点（施設種別8色）

#### `frontend/src/lib/welfareFacilityTypes.ts`
- **役割**: 施設種別定義、色・名称マッピング
- **エクスポート**:
  - `FACILITY_TYPE_CODES`: コード→名称マッピング
  - `FACILITY_TYPE_COLORS`: コード→色マッピング
  - `MAIN_FACILITY_TYPES`: 凡例表示用配列
  - `getFacilityTypeName()`: コード→名称変換
  - `getFacilityTypeColor()`: コード→色変換

#### `frontend/src/lib/layerProfiles.ts`
- **役割**: レイヤー定義プロファイル
- **対象行**: 88-94行

```typescript
welfare: {
  id: 'welfare',
  title: '老人福祉施設（全国）',
  suggestedRenderMode: 'raster',
  minZoom: 8,
  notes: '全国38,891施設（老人福祉施設のみ）。PMTilesベクタータイルで配信',
}
```

### 5.2 API Routes

#### `frontend/src/app/api/welfare/route.ts`
- **役割**: 地区クラスター用のviewport内施設検索API
- **エンドポイント**: `GET /api/welfare?west={}&south={}&east={}&north={}&limit=10000`
- **データソース**: `data/source/welfare_facilities_roujin.geojson`
- **最適化**: GridIndex（1度単位の空間インデックス）

**レスポンス形式**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lon, lat] },
      "properties": {
        "P14_001": "都道府県名",
        "P14_002": "市区町村名",
        "P14_006": "0204",
        "P14_008": "施設名",
        ...
      }
    }
  ]
}
```

**パフォーマンス**:
- GridIndex構築: 初回のみ（約100ms）
- 検索時間: 2-50ms（viewport内候補数による）

#### `frontend/src/app/api/welfare/prefecture-counts/route.ts`
- **役割**: 県別集計API
- **エンドポイント**: `GET /api/welfare/prefecture-counts`
- **データソース**: `data/source/welfare_facilities_roujin.geojson`

**レスポンス形式**:
```json
{
  "prefectures": [
    {
      "pref": "埼玉県",
      "count": 3051,
      "center": [139.6489, 35.8569]
    }
  ]
}
```

#### `frontend/src/app/api/welfare/municipality-centers/route.ts`
- **役割**: 市町村別集計API
- **エンドポイント**: `GET /api/welfare/municipality-centers`
- **データソース**: `data/source/welfare_facilities_roujin.geojson`

**レスポンス形式**:
```json
{
  "municipalities": [
    {
      "key": "埼玉県 川口市",
      "count": 225,
      "center": [139.7225, 35.8076]
    }
  ]
}
```

---

## 6. データフロー

### 6.1 初期ロード（ズーム8）

```
1. ページロード
   ↓
2. MapLibreMap.tsx useEffect (activeLayers.welfare=true)
   ↓
3. fetch('/api/welfare/prefecture-counts')
   ↓
4. welfare_facilities_roujin.geojson読み込み（サーバー側）
   ↓
5. 都道府県別に集計（P14_001でグループ化）
   ↓
6. center座標計算（lon/latの平均）
   ↓
7. welfarePrefectureCounts stateに保存
   ↓
8. welfarePrefectureClusterGeoJSON生成（useMemo）
   ↓
9. <Source> + <Layer>でレンダリング
   ↓
10. 県単位クラスター表示（色・サイズは件数に比例）
```

### 6.2 ズームイン（ズーム8.7-11）

```
1. ズーム変更検知
   ↓
2. Legend.tsxでwelfareMode更新（'municipality'）
   ↓
3. 県クラスターレイヤー非表示（maxzoom: 8.7）
   ↓
4. fetch('/api/welfare/municipality-centers')
   ↓
5. 市町村別に集計（P14_001 + P14_002でグループ化）
   ↓
6. welfareMunicipalityCenters stateに保存
   ↓
7. welfareMunicipalityClusterGeoJSON生成（useMemo）
   ↓
8. 市町村クラスターレイヤー表示（minzoom: 8.7）
```

### 6.3 ズームイン（ズーム11-14）

```
1. ズーム変更検知
   ↓
2. Legend.tsxでwelfareMode更新（'districtCluster'）
   ↓
3. useEffect (viewport変更時)
   ↓
4. debounce (500ms)
   ↓
5. fetch('/api/welfare?west=...&south=...&east=...&north=...')
   ↓
6. GridIndexで候補抽出（O(log n)）
   ↓
7. bbox内フィルタリング
   ↓
8. GeoJSON返却（最大10,000施設）
   ↓
9. welfare-geojson sourceに設定
   ↓
10. MapLibre GLが自動クラスタリング（clusterRadius: 60）
   ↓
11. welfare-clusters + welfare-cluster-count レイヤー表示
```

### 6.4 ズームイン（ズーム14+）

```
1. ズーム変更検知
   ↓
2. Legend.tsxでwelfareMode更新（'point'）
   ↓
3. GeoJSONクラスターレイヤー非表示（maxzoom: 14）
   ↓
4. PMTilesレイヤー表示（minzoom: 14）
   ↓
5. welfare_roujin.pmtiles読み込み（ブラウザキャッシュ）
   ↓
6. 表示領域のタイルのみ取得（MapLibre GL自動）
   ↓
7. welfare-points レイヤー表示（P14_006で色分け）
```

---

## 7. ユーザーインタラクション

### 7.1 クラスタークリック（ズーム8-13）

**ファイル**: `MapLibreMap.tsx:378-396`

```typescript
// クラスターをクリック → ズームイン
const clusterFeature = features.find((f: any) => f.layer.id === 'welfare-clusters')
if (clusterFeature) {
  const source: any = map.getSource('welfare-geojson')
  const clusterId = clusterFeature.properties?.cluster_id

  if (source && clusterId !== undefined) {
    source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
      if (!err) {
        map.easeTo({
          center: (clusterFeature.geometry as any).coordinates,
          zoom: zoom + 0.5
        })
      }
    })
  }
}
```

### 7.2 個別施設クリック（ズーム14+）

**ファイル**: `MapLibreMap.tsx:546-596`

```typescript
const welfareFeature = features.find((f: any) => f.layer.id === 'welfare-points')
if (welfareFeature) {
  // 同一座標の重複施設チェック
  const nearby = map.queryRenderedFeatures([...], { layers: ['welfare-points'] })

  // 重複がある場合: スパイダー表示
  if (uniqueFeatures.length > 1) {
    setWelfareSpider({ center, nodes })
  }
  // 単一施設: ポップアップ表示
  else {
    openWelfarePopup(properties, coordinates)
  }
}
```

### 7.3 ポップアップ表示

**ファイル**: `MapLibreMap.tsx:97-110`

```typescript
const openWelfarePopup = (props: Record<string, any>, coords: [number, number]) => {
  // P14_006が施設種別コード（中分類）
  const facilityType = getFacilityTypeName(props.P14_006 || '')
  const facilityTypeCode = props.P14_006 || '不明'
  const capacity = props.P14_009 ? `定員: ${props.P14_009}名` : ''
  const facilityName = props.P14_008 || props.name || '老人福祉施設（名称不明）'
  const address = `${props.P14_002 || ''}` // P14_002は市町村名

  setPopupInfo({
    longitude: coords[0],
    latitude: coords[1],
    name: facilityName,
    description: `${facilityType} (${facilityTypeCode})${capacity ? '\n' + capacity : ''}\n${address}`,
    type: 'welfare',
  })
}
```

---

## 8. パフォーマンス最適化

### 8.1 データサイズ削減
- **元データ**: 130,362施設 → 74MB GeoJSON
- **フィルタ後**: 38,891施設 → 20MB GeoJSON （73%削減）
- **PMTiles**: 16MB （67%削減）

### 8.2 API最適化
- **GridIndex**: 1度単位の空間インデックス（100セル）
- **検索時間**: O(n) → O(log n)
- **初回構築**: 約100ms（キャッシュ済み）
- **検索**: 2-50ms（viewport内候補数による）

### 8.3 ネットワーク最適化
- **PMTiles**: オンデマンドタイル読み込み（必要な領域のみ）
- **ズーム14+**: API呼び出し不要（PMTilesのみ）
- **debounce**: 500ms（viewport変更時）

### 8.4 レンダリング最適化
- **クラスター**: MapLibre GLネイティブクラスタリング（GPU最適化）
- **レイヤー切替**: minzoom/maxzoomで自動切替
- **opacity**: クラスター0.42、ポイント0.95（視認性調整）

---

## 9. トラブルシューティング

### 9.1 色が反映されない
**原因**: ブラウザキャッシュ、dev server未再起動
**解決**:
```bash
# dev server再起動
pkill -f "next dev"
cd frontend && npm run dev

# ブラウザでハードリロード
Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
```

### 9.2 クラスターが表示されない
**原因**: API呼び出し失敗、データ未ロード
**確認**:
```javascript
// ブラウザコンソール (F12)
// 1. ネットワークタブで /api/welfare を確認
// 2. コンソールで確認
console.log('API status:', await fetch('/api/welfare/prefecture-counts').then(r => r.status))
```

### 9.3 全部薄い色になる
**原因**: クラスター件数が想定より少ない
**確認**:
```javascript
// クラスターをクリックしてコンソールで確認
// point_count の値をチェック
```
**解決**: `MapLibreMap.tsx`の色分け範囲を調整

---

## 10. 今後の拡張

### 10.1 検討事項
- [ ] SearchBoxからの施設検索対応（現在PMTilesは検索不可）
  - Option A: 検索用GeoJSON別途ロード（20MB）
  - Option B: サーバーサイド検索API (`/api/welfare/search?q=...`)
  - Option C: 表示領域内施設のみ検索

- [ ] PMTilesクラスターに完全移行（API削減）
  - MapLibre GLのcluster機能をPMTilesでも利用
  - API呼び出し0回化

- [ ] 施設詳細情報の追加
  - P14_009（管理者コード）の活用
  - 外部API連携（介護サービス情報公表システム）

### 10.2 データ更新
- **更新頻度**: 国土数値情報は不定期更新
- **最新版確認**: https://nlftp.mlit.go.jp/ksj/
- **更新手順**:
  1. P14-23最新版ダウンロード
  2. `convert-p14-welfare.sh` 実行
  3. PMTiles再生成
  4. `frontend/public/tiles/` 配置

---

## 11. 参考資料

- **国土数値情報**: https://nlftp.mlit.go.jp/ksj/
- **P14データ仕様書**: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P14-v2_0.html
- **MapLibre GL JS**: https://maplibre.org/maplibre-gl-js/docs/
- **PMTiles**: https://protomaps.com/docs/pmtiles
- **tippecanoe**: https://github.com/felt/tippecanoe

---

**最終更新**: 2026-02-27
**バージョン**: 1.0
**作成者**: Claude Code (Anthropic)
