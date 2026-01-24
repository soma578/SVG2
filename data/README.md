# 岡山防災マップ（MapLibre GL JS + Next.js）

岡山県（主に岡山市周辺）を対象とした、防災・観光情報の Web マッププロジェクトです。

- **フロントエンド**: Next.js 14 + React 18 + TypeScript
- **地図エンジン**: MapLibre GL JS 5.15.0
- **地図データ**: 国土地理院ベクトルタイル（GSI Vector Tiles）
- **レイヤデータ**: GeoJSON、PNG画像、オープンデータJSON
- **詳細仕様**: `TECHNICAL_REPORT.md` を参照

---

## プロジェクトの目的

1. 岡山の住民・観光客向けに**観光スポット・ももちゃりポート・防災情報を一枚の地図で表示**
2. MapLibre GL JSのベクトルタイル描画とレイヤ重ね合わせで**複数ソースの地図を統合可視化**
3. Next.js + React + TypeScriptで**拡張・研究しやすい構成**

---

## ディレクトリ構成

```text
/home/ubuntu/SVG2/
├── README.md                          # このファイル
├── TECHNICAL_REPORT.md                # 技術レポート（詳細仕様）
├── frontend/                          # Next.js アプリケーション
│   ├── src/
│   │   ├── app/
│   │   │   ├── map/page.tsx           # メインマップページ（/map）
│   │   │   ├── layout.tsx             # ルートレイアウト
│   │   │   └── api/                   # API Routes
│   │   │       ├── momochari/route.ts
│   │   │       ├── shelters/route.ts
│   │   │       └── nowc/route.ts
│   │   ├── components/map/            # 地図関連コンポーネント
│   │   │   ├── MapLibreMap.tsx        # ★メイン地図コンポーネント
│   │   │   ├── LayerPanel.tsx         # レイヤー切替パネル
│   │   │   ├── InfoPanel.tsx          # 情報表示パネル（参考）
│   │   │   └── NearbyPortsPanel.tsx   # 近くのポート表示
│   │   └── lib/                       # ユーティリティ
│   ├── public/                        # 静的ファイル（重要）
│   │   ├── okayama_spots.geojson      # 観光スポットデータ
│   │   ├── okayama_landslide.geojson  # 土砂災害警戒区域
│   │   ├── okayama_rivers.geojson     # 河川データ
│   │   ├── momochari_with_rank.json   # ももちゃりポート
│   │   └── data/
│   │       └── momochari_ports.json
│   ├── package.json
│   └── tsconfig.json
├── map/                               # GISデータ処理
│   ├── layers/                        # 生成済みレイヤファイル
│   │   └── slope_okayama_3857.png     # 傾斜画像（58MB, 4881x7238px）
│   ├── data/                          # 元データ
│   │   ├── shelters_okayama.csv
│   │   └── weather_points.csv
│   └── tools/                         # データ生成スクリプト
└── docs/                              # ドキュメント（任意）
```

---

## クイックスタート

### 前提条件

- Node.js 18以上
- npm または yarn

### インストールと起動

```bash
# frontendディレクトリに移動
cd frontend

# 依存関係をインストール（初回のみ）
npm install

# 開発サーバー起動
npm run dev
```

ブラウザで **http://localhost:3000/map** を開く

---

## 実装済み機能

### 地図機能
- ✅ MapLibre GL JSによるベクトルタイル表示
- ✅ 国土地理院ベクトルタイル（淡色地図スタイル）
- ✅ レイヤーのON/OFF切り替え（サイドバー）
- ✅ ズーム・パン操作（マウス/タッチ対応）
- ✅ ズーム制限（最小8, 最大17.5）
- ✅ スケール表示（右下）
- ✅ NavigationControl（ズームボタン・コンパス）
- ✅ サイドバーの開閉（ハンバーガーメニュー）

### データレイヤ（6種類）
1. **basemap** - 国土地理院ベクトルタイル（常時表示、ベクトルデータ）
2. **spots** - 観光スポット（岡山城、後楽園など8箇所、GeoJSON）
3. **momochari** - ももちゃりポート（岡山市コミュニティサイクル、JSON→GeoJSON変換）
4. **slope** - 傾斜レイヤ（**PNG画像 58MB**、坂の可視化、透明度60%、MapLibre API経由で追加）
5. **landslide** - 土砂災害警戒区域（**GeoJSON 4.5MB**、オレンジ色、Polygonベクトルデータ）
6. **rivers** - 河川（**GeoJSON**、青色、LineStringベクトルデータ）

### インタラクション
- ✅ 観光スポットクリックでポップアップ表示
- ✅ ももちゃりポートクリックで詳細情報表示
- ✅ Google Mapsで開くボタン
- ✅ Wikipedia/公式サイトへのリンク
- ✅ マウスホバーでカーソルがポインターに変化
- ✅ 近くのももちゃりポート表示（距離順・上位5件）

### 現在地機能（Geolocation）
- ✅ **ももちゃりレイヤーON時に自動取得開始**: レイヤーをONにすると`navigator.geolocation.watchPosition()`で連続追跡
- ✅ **初回取得時に地図を自動移動**: 位置情報を初めて取得したとき、ズーム15で現在地に移動
- ✅ **パルスアニメーション付きマーカー**: 青色の中心点と拡大するパルスエフェクトで現在地を表示
- ✅ **GeolocateControlボタン**: 右上の位置情報ボタンをクリックすると現在地にズーム15で移動
- ✅ **連続追跡**: 移動に応じてマーカー位置が自動更新（地図は自動追従しない）
- ✅ **エラーハンドリング**: 位置情報許可なし、GPS信号弱い、タイムアウト（15秒）に対応
- ✅ **近くのももちゃりポートパネル**: 現在地から距離順に上位5件を右下に表示

### UI/UX
- ✅ 情報パネル（左上、サイドバーの右隣）
- ✅ 種別バッジ（城郭🏯、庭園🌳、ももちゃり🚲など）
- ✅ 座標表示（緯度・経度）
- ✅ レスポンシブレイアウト
- ✅ データソースattribution（MapLibre標準、右下）

---

## 主要ファイル説明

### フロントエンド

#### `/frontend/src/app/map/page.tsx`
- メインマップページ
- レイヤー状態管理（activeLayers）
- サイドバー表示管理（showSettings）

#### `/frontend/src/components/map/MapLibreMap.tsx` ★最重要
- MapLibre GL JSのラッパーコンポーネント
- 全レイヤーの描画
- クリックイベント処理
- ポップアップ表示ロジック
- 近くのポート表示機能
- **約420行**

#### `/frontend/src/components/map/LayerPanel.tsx`
- レイヤーON/OFF切替UI

#### `/frontend/src/components/map/NearbyPortsPanel.tsx`
- 現在地から近いももちゃりポートを表示
- Haversine距離計算
- Google Maps経路連携

### データファイル

#### `/frontend/public/okayama_spots.geojson`
観光スポットGeoJSON（8箇所）
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "岡山城",
        "description": "...",
        "url": "https://ja.wikipedia.org/wiki/...",
        "type": "castle"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [133.9354, 34.6655]
      }
    }
  ]
}
```

#### `/frontend/public/momochari_with_rank.json`
ももちゃりポートJSON（複数ポート）
```json
[
  {
    "id": "ポート名",
    "lat": 34.xxx,
    "lon": 133.xxx,
    "address": "住所",
    "floodRank": 1,
    "status": "稼働中"
  }
]
```

#### `/map/layers/slope_okayama_3857.png` ★画像レイヤー
傾斜レイヤ画像（ラスターデータ）
- **データ形式**: PNG画像（ラスターデータ）
- サイズ: 58MB
- 解像度: 4881 x 7238 pixels
- 投影: EPSG:3857 (Web Mercator)
- 範囲: 岡山市周辺
- 座標: `[133.56860, 34.86095]` (top-left) ～ `[133.98691, 34.35036]` (bottom-right)
- 元データ: 国土地理院標高タイル（DEM10B）
- **追加方法**: MapLibre API (`map.addSource()`, `map.addLayer()`) で直接追加
- **透明度**: 60% (`raster-opacity: 0.6`)

#### `/frontend/public/okayama_landslide.geojson` ★ベクトルデータ
土砂災害警戒区域GeoJSON
- **データ形式**: GeoJSON（ベクトルデータ）
- サイズ: 4.5MB
- ジオメトリタイプ: Polygon
- フィーチャー数: 多数のポリゴン
- 表示スタイル: オレンジ色塗りつぶし（`fill-color: #f97316`, `fill-opacity: 0.4`）+ 輪郭線

#### `/frontend/public/okayama_rivers.geojson` ★ベクトルデータ
河川GeoJSON
- **データ形式**: GeoJSON（ベクトルデータ）
- ジオメトリタイプ: LineString
- 表示スタイル: 青色ライン（`line-color: #3b82f6`, `line-width: 2`, `line-opacity: 0.7`）

---

## 技術スタック

### フロントエンド
| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| Next.js | 14.2.33 | App Router, SSR |
| React | 18.3.0 | UI |
| TypeScript | 5.x | 型安全 |
| Tailwind CSS | 3.4.0 | スタイリング |
| MapLibre GL JS | 5.15.0 | 地図エンジン |
| react-map-gl | 8.1.0 | Reactラッパー |

### データソース
| データ | 出典 | 形式 | データタイプ | サイズ |
|-------|------|------|-------------|-------|
| ベースマップ | [国土地理院ベクトルタイル](https://github.com/gsi-cyberjapan/gsivectortile-mapbox-gl-js) | Vector Tiles | ベクトル | - |
| 傾斜 | [国土地理院標高タイル](https://maps.gsi.go.jp/development/ichiran.html) | PNG (EPSG:3857) | **ラスター画像** | 58MB |
| 土砂災害 | [国土数値情報](https://nlftp.mlit.go.jp/) | GeoJSON (Polygon) | **ベクトル** | 4.5MB |
| 河川 | [国土数値情報](https://nlftp.mlit.go.jp/) | GeoJSON (LineString) | **ベクトル** | - |
| ももちゃり | [岡山市オープンデータ](https://www.city.okayama.jp/kurashi/0000005428.html) | JSON → GeoJSON | ベクトル | - |
| 観光スポット | 手動作成 | GeoJSON (Point) | ベクトル | - |

---

## データ更新方法

### 観光スポットの追加・編集

```bash
# GeoJSONを直接編集
vim frontend/public/okayama_spots.geojson

# 新しいスポットを追加する例
{
  "type": "Feature",
  "properties": {
    "name": "新スポット名",
    "description": "説明文",
    "url": "https://...",
    "type": "tourist"  # castle/garden/tourist/shrine/bridge
  },
  "geometry": {
    "type": "Point",
    "coordinates": [経度, 緯度]
  }
}
```

### 傾斜レイヤの再生成

```bash
# GDALを使用して国土地理院標高タイルから生成
gdal_translate -of PNG -outsize 50% 50% slope_okayama.png slope_okayama_3857_optimized.png
gdalwarp -t_srs EPSG:3857 -ts 4881 7238 -r bilinear slope_okayama.png slope_okayama_3857.png

# 生成後、frontend/public/map/layers/に配置
```

---

## API エンドポイント

### `GET /api/momochari`
ももちゃりポートデータを取得

**レスポンス例**:
```json
[
  {
    "id": "ポート名",
    "lat": 34.xxx,
    "lon": 133.xxx,
    "address": "住所"
  }
]
```

### `GET /api/shelters`
避難所データを取得

### `GET /api/nowc`
降水ナウキャストの対象時刻を取得

---

## 既知の問題（Known Issues）

### 1. 現在地取得機能（修正済み）
- **現象**: GeolocateControlボタンをクリックしても現在地が取得されなかった
- **対応**: `navigator.geolocation.watchPosition()`による連続追跡を実装、ももちゃりレイヤーON時に自動取得
- **状態**: ✅ 修正済み

### 2. 傾斜レイヤの位置ズレ（微調整済み）
- **現象**: 傾斜画像が実際の地形と70-80mほどズレていた
- **対応**: 座標を0.00035度（約38m）北にシフトして調整済み
- **状態**: ✅ 修正済み

### 3. 傾斜レイヤの読み込みが遅い（最適化済み）
- **現象**: 193MBの画像ファイルで読み込みに時間がかかった
- **対応**: GDALで50%縮小（58MB, 4881x7238px）に最適化
- **状態**: ✅ 改善済み

### 4. 傾斜レイヤの表示方法（改善済み）
- **問題**: react-map-glの`Source`コンポーネントでPNG画像が正しく表示されないことがあった
- **対応**: MapLibre GL JSのネイティブAPI（`map.addSource()`, `map.addLayer()`）で直接追加
- **状態**: ✅ 改善済み

---

## トラブルシューティング

### 地図が表示されない
1. 開発サーバーが起動しているか確認: `npm run dev`
2. ブラウザで http://localhost:3000/map にアクセス
3. ブラウザコンソールでエラーを確認

### レイヤーが表示されない
1. サイドバーでレイヤーがONになっているか確認
2. `/frontend/public/`に対応するGeoJSON/JSONファイルが存在するか確認
3. ブラウザのNetwork タブで404エラーがないか確認

### ももちゃりポートが表示されない
1. ももちゃりレイヤーがONになっているか確認
2. `/frontend/public/momochari_with_rank.json`が存在するか確認
3. JSONの形式が正しいか確認（id, lat, lon必須）

### 現在地が表示されない
1. ももちゃりレイヤーがONになっているか確認（OFFの場合は位置追跡しない）
2. ブラウザの位置情報許可を確認（ブラウザのアドレスバー左側のアイコンから許可）
3. HTTPSでアクセスしているか確認（localhostは例外だがHTTPSが推奨）
4. コンソールで「Position updated:」が表示されているか確認
5. タイムアウトエラーの場合は、屋外に移動してGPS信号を受信できるか試す

### 傾斜レイヤが表示されない
1. 傾斜レイヤーがONになっているか確認
2. `/frontend/public/map/layers/slope_okayama_3857.png`が存在するか確認（58MB）
3. ブラウザコンソールで「[Slope Layer] Slope layer added successfully」が表示されているか確認
4. ズームレベルを変更してみる（画像の対象範囲外の可能性）

---

## ライセンスとデータ出典

### プロジェクトライセンス
研究・教育用途

### データ出典（Attribution）
- **地図**: [国土地理院ベクトルタイル](https://github.com/gsi-cyberjapan/gsivectortile-mapbox-gl-js)
- **傾斜**: [国土地理院標高タイル](https://maps.gsi.go.jp/development/ichiran.html)
- **防災データ**: [国土数値情報](https://nlftp.mlit.go.jp/)
- **ももちゃり**: [岡山市オープンデータ](https://www.city.okayama.jp/kurashi/0000005428.html)

※ MapLibre GL JSが地図右下に自動的にattributionを表示します

---

## 開発メモ

### 今後の課題
- [ ] 現在地取得機能の修正
- [ ] 避難所レイヤーの追加
- [ ] 洪水浸水想定区域レイヤーの追加
- [ ] ルート検索機能
- [ ] レイヤー凡例の表示
- [ ] モバイル最適化

### パフォーマンス最適化
- ✅ 傾斜画像を58MBに圧縮（元193MB）
- ✅ ズーム制限でタイル過剰取得を防止（max: 17.5）
- ⏳ GeoJSONの軽量化検討中

---

## 参考リンク

- [MapLibre GL JS 公式ドキュメント](https://maplibre.org/maplibre-gl-js/docs/)
- [react-map-gl 公式ドキュメント](https://visgl.github.io/react-map-gl/)
- [国土地理院ベクトルタイル仕様](https://github.com/gsi-cyberjapan/gsivectortile-mapbox-gl-js)
- [Next.js 14 公式ドキュメント](https://nextjs.org/docs)
