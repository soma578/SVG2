# プロジェクト引き継ぎガイド

このドキュメントは、プロジェクトを他の開発者に引き継ぐ際の手順をまとめたものです。

## 📦 配布物の内容

### 1. Gitリポジトリ
プロジェクトのソースコードとドキュメント（データファイルを除く）

### 2. データアーカイブ（4ファイル）

#### 必須: `svg2_frontend_public_YYYYMMDD_HHMMSS.tar.gz` (約78MB)
**フロントエンドアプリケーションで使用する地理データファイル**

含まれるファイル:
- `frontend/public/*.geojson` - 地理データ（GeoJSON形式）
- `frontend/public/districts/` - 地区境界データ（分割版、8ファイル）
- `frontend/public/*.json` - 辞書ファイル
- `frontend/public/data/` - その他データ
- `frontend/public/map/layers/slope_okayama_3857.png` - 傾斜レイヤー（64MB）
- `frontend/public/map/layers/*.svg` - SVGレイヤー

**このファイルがあれば、アプリケーションは完全に動作します**

#### オプション: `svg2_data_raw_YYYYMMDD_HHMMSS.tar.gz` (約44MB)
国土数値情報などの元データ（シェープファイル等）

**用途**: データを再処理・更新する場合のみ必要

#### オプション: `svg2_data_dem_YYYYMMDD_HHMMSS.tar.gz` (約2GB)
国土地理院のDEM（標高）データ

**用途**: 傾斜レイヤーを再生成する場合のみ必要

#### オプション: `svg2_map_layers_YYYYMMDD_HHMMSS.tar.gz` (約2.2GB)
傾斜レイヤーの中間ファイルと元ファイル

含まれるファイル:
- `map/layers/slope_okayama.png` (205MB) - オリジナル
- `map/layers/slope_okayama_3857_original.png` (193MB) - 最適化前
- `map/layers/_build/slope/*` - 中間生成ファイル

**用途**: 傾斜レイヤーを再処理・再最適化する場合のみ必要（通常は不要）

## 🚀 セットアップ手順

### ステップ1: Gitリポジトリのクローン

```bash
git clone <repository-url>
cd SVG2
```

### ステップ2: データアーカイブの展開

配布された `svg2_frontend_public_*.tar.gz` をプロジェクトルートに配置し、展開します。

```bash
# 必須: フロントエンドデータを展開
tar -xzf svg2_frontend_public_YYYYMMDD_HHMMSS.tar.gz

# オプション: その他のアーカイブ（データ再生成が必要な場合のみ）
tar -xzf svg2_data_raw_YYYYMMDD_HHMMSS.tar.gz
tar -xzf svg2_data_dem_YYYYMMDD_HHMMSS.tar.gz
tar -xzf svg2_map_layers_YYYYMMDD_HHMMSS.tar.gz
```

**重要**: `svg2_frontend_public_*.tar.gz`だけあれば、アプリケーションは完全に動作します。

### ステップ3: 環境構築

```bash
# Node.js依存関係のインストール
cd frontend
npm install
```

### ステップ4: 環境変数の設定（オプション）

ローカル開発では環境変数なしで動作しますが、本番環境やVercelKVを使用する場合は設定が必要です。

```bash
# frontend/.env.local を作成
cp .env.example .env.local
```

**.env.local の例:**
```env
# VercelKV（本番環境のみ）
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx

# 開発環境ではこれらは不要（メモリキャッシュで動作）
```

### ステップ5: アプリケーション起動

```bash
# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:3000 を開く
```

## 📊 データファイル一覧

### 必須ファイル（アプリケーション動作に必要）

| ファイル | サイズ | 説明 |
|---------|-------|------|
| `okayama_municipalities_simple.geojson` | 168KB | 市区町村境界（簡略版） |
| `okayama_district_dict.json` | 1.5MB | 地区辞書 |
| `okayama_n03_dict.json` | 8KB | 市区町村辞書 |
| `districts/*.geojson` | 計15MB | 地区境界データ（分割版） |
| `districts/districts_metadata.json` | ~1KB | 地区メタデータ |
| `momochari_with_rank.json` | 8KB | ももちゃりポート情報 |

### レイヤーデータ（機能別）

| ファイル | サイズ | レイヤー名 |
|---------|-------|----------|
| `okayama_rivers.geojson` | 1.2MB | 河川レイヤー |
| `okayama_landslide.geojson` | 4.5MB | 土砂災害警戒区域 |
| `okayama_shelters.geojson` | 196KB | 避難所 |
| `okayama_hospitals.geojson` | 464KB | 病院 |
| `okayama_fire_stations.geojson` | 8KB | 消防署 |
| `okayama_schools.geojson` | 100KB | 学校 |
| `okayama_spots.geojson` | 4KB | 観光スポット |
| `map/layers/slope_okayama_3857.png` | 64MB | 傾斜レイヤー（PNG） |

### オプション（削除可能）

| ファイル | サイズ | 説明 |
|---------|-------|------|
| `okayama_districts.geojson` | 19MB | 地区境界（分割前の統合版） |
| `okayama_municipalities.geojson` | 16MB | 市区町村境界（詳細版） |
| `okayama_slope.geojson` | 47MB | 傾斜データ（GeoJSON版、現在未使用） |
| `okayama_slope_filtered.geojson` | 2MB | 傾斜データ（フィルター版） |

## 🏗️ プロジェクト構成

```
SVG2/
├── frontend/                      # Next.jsアプリケーション（メイン）
│   ├── src/
│   │   ├── app/                  # App Router
│   │   │   ├── api/              # APIエンドポイント
│   │   │   │   └── outages/      # 停電情報API
│   │   │   ├── page.tsx          # トップページ
│   │   │   └── layout.tsx        # レイアウト
│   │   ├── components/           # Reactコンポーネント
│   │   │   └── map/              # 地図関連コンポーネント
│   │   ├── hooks/                # カスタムフック
│   │   │   └── useDistrictLayers.ts  # 地区レイヤー遅延ロード
│   │   └── lib/                  # ユーティリティ
│   │       ├── outageMapper.ts   # 停電情報マッピング
│   │       ├── outageCacheKV.ts  # キャッシュ管理
│   │       └── rateLimit.ts      # レート制限
│   └── public/                   # 静的ファイル
│       ├── *.geojson             # 地理データ
│       ├── *.json                # 辞書・設定ファイル
│       ├── districts/            # 地区境界データ（分割版）
│       └── map/layers/           # レイヤー画像
│
├── scripts/                      # データ処理スクリプト
│   ├── create_data_archive.sh   # データアーカイブ作成
│   └── extract_data.sh          # データアーカイブ展開
│
├── docs/                        # ドキュメント
│   └── TECHNICAL_ARCHITECTURE.md
│
├── README.md                    # プロジェクト概要
├── DATA_SETUP.md               # データセットアップ詳細
├── DATA_SOURCES.md             # データソース一覧
├── HANDOVER_GUIDE.md           # このファイル
└── setup.sh                    # 環境構築スクリプト
```

## 🔑 主要機能の技術詳細

### 1. 停電情報レイヤー

**仕組み:**
- `/api/outages/scrape`: 中国電力のWebサイトをスクレイピング
- `/api/outages`: 時間範囲でフィルタリングして返す
- `useDistrictLayers`: ズームレベルに応じて地区境界を遅延ロード
- `outageMapper.ts`: 停電情報を地区/市区町村にマッピング

**キャッシュ:**
- 開発環境: メモリキャッシュ（5分間）
- 本番環境: VercelKV（5分間）

**ズーム連動:**
- Zoom < 11: 市区町村レベルで表示
- Zoom >= 11: 地区レベルで詳細表示

### 2. 地区境界の遅延ロード

大きなGeoJSONファイル（19MB）を8つのファイルに分割し、ズームレベルとエリアに応じて動的にロードします。

**分割構成:**
- 岡山市: high/low（2ファイル）
- 倉敷市: high/low（2ファイル）
- その他の市: high/low（2ファイル）
- 町村: high/low（2ファイル）

**ロード条件:**
- Zoom 11-13: low版をロード
- Zoom >= 14: high版をロード

### 3. レート制限

**スクレイピングAPI:**
- 1IPあたり10リクエスト/分
- メモリベース（開発環境）
- VercelKV（本番環境）

## 🚢 デプロイメント

### Vercelへのデプロイ（推奨）

1. Vercelアカウントにログイン
2. プロジェクトをインポート
3. VercelKV Databaseを作成（Storage → Create Database → KV）
4. 環境変数は自動設定される
5. デプロイ完了

**注意事項:**
- データファイル（約600MB）は`.vercelignore`で除外しないこと
- VercelのFree Planでは関数タイムアウトが10秒のため、初回のGeoJSONロードで遅延が発生する可能性あり

### 他のプラットフォーム

- **Netlify**: 動作確認済み（VercelKVの代わりにメモリキャッシュを使用）
- **AWS**: S3 + CloudFront で静的ホスティング可能（APIはLambdaで実装）
- **自前サーバー**: Node.js v18以上があれば動作

## ⚠️ 注意事項

### 停電情報スクレイピングについて

- 中国電力の公式APIではありません
- サーバー負荷軽減のため、必ず5分間のキャッシュを維持してください
- 商用利用の場合は事前に許諾を得ることを推奨します
- データの正確性は保証されません

### データライセンス

各データソースのライセンスを遵守してください。詳細は [DATA_SOURCES.md](./DATA_SOURCES.md) を参照。

## 📝 開発のヒント

### データの更新

地理データを更新する場合:

```bash
# Python環境をセットアップ
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# スクリプトを実行（例）
python scripts/generate_geojson.py
```

### デバッグ

ブラウザのコンソールで詳細なログを確認できます:

```
[Outage] - 停電情報関連
[useDistrictLayers] - 地区レイヤーロード
[Outage Click] - 停電エリアクリック
```

### パフォーマンス最適化

- 大きなGeoJSONは分割してロード
- 画像レイヤーはPNG圧縮を最適化
- キャッシュ時間を適切に設定

## 🆘 トラブルシューティング

### Q: 地図が表示されない
A: データファイルが正しく配置されているか確認してください。

```bash
ls -lh frontend/public/*.geojson
ls -lh frontend/public/districts/
```

### Q: 停電レイヤーが表示されない
A: ブラウザコンソールでエラーを確認してください。データがない場合は何も表示されません（仕様）。

### Q: VercelKVのエラーが出る
A: 開発環境ではVercelKVなしでも動作します（メモリキャッシュ）。エラーは無視してOKです。

### Q: ビルドが遅い
A: 大きなGeoJSONファイルが原因です。本番環境では初回ビルド時のみ発生します。

## 📧 サポート

質問や問題がある場合は、GitHubのIssuesまたはプロジェクト管理者に連絡してください。

---

**最終更新:** 2026-01-26
**バージョン:** 1.0.0
