# 岡山防災マップ フロントエンド

Next.js + TypeScript + Tailwind CSS で構築された、岡山防災マップシステムのフロントエンドです。

## 特徴

- **独自Webメルカトル描画**: React＋SVGだけでズーム・パン・タイル描画を実装
- **データ駆動型アーキテクチャ**: CSVデータから動的にマーカーを生成
- **シンプルでクリーンなUI**: 不要な中間ステップを排除
- **ダイレクトな情報表示**: ピンをクリックすると即座に詳細情報を表示
- **拡張性の高い設計**: 新しいレイヤーやデータの追加が容易

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. SVGMapファイルへのシンボリックリンク作成（自動作成済み）

既存のSVGMapファイル（map/配下）はシンボリックリンクで参照されています。

```
public/map → ../../map
public/svgMapAppLayers → ../../svgMapAppLayers
public/tutorials → ../../tutorials
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

### 起動時によくあるエラー（.nextの不整合）

`Error: Cannot find module './xxx.js'` が `.next/server/webpack-runtime.js` 付近で出る場合、`.next` の生成物が不整合になっていることがあります。

```bash
npm run dev:clean
```

## ページ構成

| パス | 説明 |
|------|------|
| `/` | トップページ - システム概要と機能紹介 |
| `/map` | **防災マップ本体** - SVGMap統合、レイヤー制御 |
| `/about` | データ出典・連絡先 |
| `/admin/login` | 管理画面ログイン（デモ: admin/admin） |
| `/admin/datasets` | データセット管理 |

## 主要コンポーネント

### `/map`ページ

- **MapCanvas** - React＋SVGで構築した自前の地図エンジン
  - Webメルカトル座標変換・ズーム／パンを純Reactで実装
  - 国土地理院タイルを直接リクエストして敷き詰め
  - GeoJSONをSVGパスに変換してハザードを描画
  - CSVデータから動的にマーカーを生成
  - レイヤー表示/非表示・カスタムズームボタン・GPS移動を実装

- **LayerPanel** - レイヤーON/OFF制御
  - ベースマップ（国土地理院タイル）
  - 情報レイヤー（避難所、気象、土砂災害）

- **InfoPanel** - 避難所詳細情報表示
  - ピンクリック時に自動的に表示
  - 名称、詳細、座標、種別を表示
  - 外部リンクへのアクセス

### API エンドポイント

- **/api/shelters** - CSV データを読み込んで JSON として返す
  - `map/data/shelters_okayama.csv` を解析
  - クライアントサイドで利用可能な形式に変換

### 共通コンポーネント

- **AppHeader** - アプリケーションヘッダー
- **Layout** - 共通レイアウト

## 実装のポイント

### 自前Webメルカトル描画

Leaflet等の地図ライブラリを使わず、React＋SVGだけでズーム・パン・タイル描画を行います。

```typescript
const projectLatLonToWorld = (lat: number, lon: number, zoom: number) => {
  const scale = 256 * Math.pow(2, zoom)
  const clampedLat = Math.min(85.051, Math.max(-85.051, lat))
  const x = ((lon + 180) / 360) * scale
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}

const projection = useMemo(() => {
  const centerWorld = projectLatLonToWorld(center[0], center[1], zoom)
  return {
    projectPoint: (lat: number, lon: number) => {
      const world = projectLatLonToWorld(lat, lon, zoom)
      return {
        x: world.x - centerWorld.x + size.width / 2,
        y: world.y - centerWorld.y + size.height / 2,
      }
    },
  }
}, [center, zoom, size])
```

得られた`projectPoint`でGeoJSONをSVGパスへ変換し、同じ座標系でGSIタイルやマーカーを配置しています。

### CSVデータの読み込み

APIエンドポイントでCSVを解析してJSONとして返します。

```typescript
// src/app/api/shelters/route.ts
export async function GET() {
  const csvPath = path.join(process.cwd(), 'public', 'map', 'data', 'shelters_okayama.csv')
  const fileContent = fs.readFileSync(csvPath, 'utf-8')

  // CSVをパースしてJSON配列に変換
  const shelters = parseCSV(fileContent)
  return NextResponse.json(shelters)
}
```

### SSR対応

地図描画は`ResizeObserver`や`navigator.geolocation`などブラウザ専用APIを使うため、Next.jsの動的インポートでクライアント専用コンポーネントとして読み込みます。

## データフロー

```
[1] アプリ起動
     ↓
[2] /api/shelters を呼び出し
     ↓
[3] サーバーサイドでCSVを読み込み・解析
     ↓
[4] JSON配列としてクライアントに返却
     ↓
[5] MapCanvasがマーカーを動的に生成
     ↓
[6] ユーザーがピンをクリック
     ↓
[7] handleMarkerClick() が onShelterClick コールバックを実行
     ↓
[8] 親コンポーネント (/map/page.tsx) が selectedShelter を更新
     ↓
[9] InfoPanel が自動的に表示される
```

## ビルドと本番環境

```bash
# 本番ビルド
npm run build

# 本番サーバー起動
npm start
```

## 技術スタック

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map Engine**: 自前のReact + SVGレンダラー
- **Data Source**: CSV（`/api/shelters` 経由で動的に読み込み）
- **Tiles**: 国土地理院タイル（淡色地図）

## 実装完了した機能

✅ **独自Webメルカトル地図表示**
- React＋SVGのみでズーム・パン・タイル描画
- Leaflet等の外部地図ライブラリに依存しない

✅ **データ駆動型アーキテクチャ**
- CSVファイルから動的にマーカー生成
- データ追加はCSV編集だけで完結

✅ **ダイレクトな詳細表示**
- ピンクリック → 即座に詳細情報を表示
- 中間ステップなしでスムーズな体験

✅ **レイヤー制御**
- 国土地理院タイルの表示/非表示
- 避難所マーカーの表示/非表示
- 将来的に気象・ハザードレイヤーも追加可能

✅ **SSR対応**
- Next.js動的インポートでブラウザ専用APIをクライアント側に限定
- ビルドエラーなく本番デプロイ可能

## 今後の拡張

独自エンジンでもReactでデータを管理しているため、以下の拡張が容易に実装可能：

### データ関連
- [ ] 気象レイヤーの動的更新（Open-Meteo API連携）
- [ ] ハザードレイヤー（浸水想定区域、土砂災害警戒区域）
- [ ] データベース連携（PostgreSQL + PostGIS）
- [ ] リアルタイム避難所混雑状況の表示

### 機能追加
- [ ] 検索機能（住所・施設名によるマーカー検索）
- [ ] 現在地からの距離計算・ルート案内
- [ ] マーカークラスタリング（大量のポイントを効率的に表示）
- [ ] ヒートマップ表示
- [ ] 地図印刷機能

### UX改善
- [ ] PWA化・オフライン対応
- [ ] レスポンシブデザインの更なる最適化
- [ ] 多言語対応（英語、中国語、韓国語）
- [ ] ダークモード対応

### データ管理
- [ ] 管理画面からCSVアップロード機能
- [ ] データのバージョン管理
- [ ] 変更履歴の記録
