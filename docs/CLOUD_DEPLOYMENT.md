# クラウド配信構成

データをダウンロードせず、リアルタイムで外部から取得する方式の実装ガイド

## 現在の構成

### すでに外部から取得しているもの ✅
- **ベースタイル**: 国土地理院タイル（`https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`）
- **降水ナウキャスト**: 気象庁API

### ローカルに必要なもの
- **GeoJSONファイル** (約300MB): 避難所、河川、地区境界など
- **傾斜タイル** (3.2GB): `map/layers/_build/slope/` 内のGeoTIFF
- **SVGレイヤー**: 軽量なのでリポジトリに含める

---

## 方式1: GitHub Releases + CDN配信

### ステップ1: GitHub Releasesにアップロード

```bash
# データをリリースとして公開
gh release create v1.0.0-data \
  data_archive/*.tar.gz \
  --title "Data Files v1.0.0" \
  --notes "地理データアーカイブ"
```

### ステップ2: ダウンロードスクリプト作成

`scripts/download_from_github.sh`:
```bash
#!/bin/bash
VERSION="v1.0.0-data"
BASE_URL="https://github.com/soma578/SVG/releases/download/${VERSION}"

mkdir -p data_archive
cd data_archive

wget "${BASE_URL}/svg2_data_dem_20260125_040848.tar.gz"
wget "${BASE_URL}/svg2_data_raw_20260125_040848.tar.gz"
wget "${BASE_URL}/svg2_map_layers_20260125_040848.tar.gz"

cd ..
./scripts/extract_data.sh data_archive/*.tar.gz
```

**メリット:**
- 無料
- セットアップ簡単
- 追加コストなし

**デメリット:**
- 初回ダウンロード必須（リアルタイム取得ではない）
- 大容量（4.2GB）のダウンロードが必要

---

## 方式2: クラウドストレージでタイル配信（推奨）

### 構成図

```
ユーザー
  ↓
Next.js Frontend
  ↓
  ├─→ 国土地理院タイル（既存）
  ├─→ Google Cloud Storage
  │    ├─ /tiles/slope/{z}/{x}/{y}.png  (傾斜タイル)
  │    └─ /geojson/*.geojson            (地理データ)
  └─→ GitHub Pages（軽量SVGレイヤー）
```

### ステップ1: Google Cloud Storageにアップロード

```bash
# 1. バケット作成（一度だけ）
gsutil mb -c STANDARD -l asia-northeast1 gs://svg2-data

# 2. 公開設定
gsutil iam ch allUsers:objectViewer gs://svg2-data

# 3. データアップロード
# 傾斜タイル
gsutil -m cp -r map/layers/_build/slope/* gs://svg2-data/tiles/slope/

# GeoJSONファイル
gsutil -m cp frontend/public/*.geojson gs://svg2-data/geojson/
```

### ステップ2: フロントエンド設定

`.env.production`:
```bash
NEXT_PUBLIC_TILE_BASE_URL=https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png
NEXT_PUBLIC_SLOPE_TILE_URL=https://storage.googleapis.com/svg2-data/tiles/slope/{z}/{x}/{y}.png
NEXT_PUBLIC_GEOJSON_BASE_URL=https://storage.googleapis.com/svg2-data/geojson
```

`src/lib/config.ts`:
```typescript
export const tileBaseUrl =
  process.env.NEXT_PUBLIC_TILE_BASE_URL ||
  'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'

export const slopeTileUrl =
  process.env.NEXT_PUBLIC_SLOPE_TILE_URL ||
  '/map/layers/slope_okayama.png' // フォールバック

export const geojsonBaseUrl =
  process.env.NEXT_PUBLIC_GEOJSON_BASE_URL || ''
```

### コスト試算（Google Cloud Storage）

**月間想定アクセス:**
- ユーザー数: 100人
- 1人あたり平均データ転送: 100MB（タイル閲覧）
- 月間転送量: 10GB

**料金:**
- ストレージ: 4.2GB × $0.02/GB = $0.084/月
- 転送: 10GB × $0.12/GB = $1.20/月
- **合計: 約$1.30/月（約200円）**

---

## 方式3: 自前サーバー（大学サーバー）

大学のサーバーにタイルサーバーを構築：

### 必要なもの
- Nginx（静的ファイル配信）
- 傾斜タイルとGeoJSON配置

### 設定例

`/etc/nginx/sites-available/svg2-tiles`:
```nginx
server {
    listen 80;
    server_name tiles.your-domain.ac.jp;

    location /tiles/ {
        alias /var/www/svg2-data/tiles/;
        add_header Access-Control-Allow-Origin *;
        expires 1y;
    }

    location /geojson/ {
        alias /var/www/svg2-data/geojson/;
        add_header Access-Control-Allow-Origin *;
        expires 1d;
    }
}
```

**メリット:**
- 無料（大学インフラ利用）
- 完全コントロール可能

**デメリット:**
- サーバー管理が必要
- 大学ネットワークの規約確認必要
- 帯域制限の可能性

---

## 方式4: ハイブリッド構成（現実的な推奨案）

### 小さいファイル: GitHubリポジトリ
- SVGレイヤー（数KB）
- 設定ファイル（JSON）

### 中サイズ: GitHub Releases
- GeoJSONファイル（300MB）

### 大容量: クラウドストレージ
- 傾斜タイル（3.2GB）

### リアルタイムAPI: 既存サービス
- ベースタイル: 国土地理院
- 降水: 気象庁

### 実装

```typescript
// src/lib/config.ts
export const dataConfig = {
  // 国土地理院（無料・公式）
  baseTile: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',

  // GitHub Releases（無料・大容量OK）
  geojsonBase: process.env.NEXT_PUBLIC_GEOJSON_URL ||
    'https://github.com/soma578/SVG/releases/download/v1.0.0-data',

  // Cloud Storage（有料だが高速）
  slopeTiles: process.env.NEXT_PUBLIC_SLOPE_URL ||
    'https://storage.googleapis.com/svg2-data/tiles/slope/{z}/{x}/{y}.png',
}
```

---

## 推奨構成まとめ

| データ種類 | サイズ | 配信方法 | コスト |
|-----------|--------|---------|--------|
| ベースタイル | - | 国土地理院 | 無料 |
| SVGレイヤー | 数KB | Gitリポジトリ | 無料 |
| GeoJSON | 300MB | GitHub Releases | 無料 |
| 傾斜タイル | 3.2GB | Cloud Storage | $1-2/月 |

**月額コスト: $1-2（約150-300円）**

これで初回ダウンロード不要、リアルタイム配信が実現できます。
