# セットアップガイド

プロジェクトを動かすための完全ガイドです。

## 📋 必要なもの

- **Node.js** v18以上 ([ダウンロード](https://nodejs.org/))
- **Git**
- **データアーカイブ**: `svg2_frontend_public_*.tar.gz` (78MB)

## 🚀 セットアップ（5分）

### 1. リポジトリをクローン

```bash
git clone https://github.com/soma578/SVG.git
cd SVG2
```

### 2. データアーカイブを展開

配布された `svg2_frontend_public_*.tar.gz` をプロジェクトルートに置いて展開:

```bash
tar -xzf svg2_frontend_public_*.tar.gz
```

展開されたファイルを確認:

```bash
ls -lh frontend/public/*.geojson
ls -lh frontend/public/districts/
```

### 3. 依存関係をインストール

```bash
cd frontend
npm install
```

### 4. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで **http://localhost:3000** を開く

## ✅ 動作確認

以下が表示されればOK:

- ✅ 地図が表示される
- ✅ 左のパネルでレイヤーをON/OFFできる
- ✅ 地図をドラッグ・ズームできる
- ✅ 観光スポットやももちゃりポートをクリックできる
- ✅ 停電レイヤーをONにできる

## 📁 データファイルについて

このプロジェクトでは地理データ（GeoJSON）を使用します。

### 必要なファイル

以下のファイルが `frontend/public/` に必要です:

| ファイル | 説明 |
|---------|------|
| `okayama_municipalities_simple.geojson` | 市区町村境界 |
| `okayama_district_dict.json` | 地区辞書 |
| `okayama_n03_dict.json` | 市区町村辞書 |
| `districts/*.geojson` | 地区境界データ（8ファイル） |
| `okayama_rivers.geojson` | 河川レイヤー |
| `okayama_landslide.geojson` | 土砂災害警戒区域 |
| `okayama_shelters.geojson` | 避難所 |
| `okayama_hospitals.geojson` | 病院 |
| `map/layers/slope_okayama_3857.png` | 傾斜レイヤー（64MB） |

### データアーカイブがない場合

以下のいずれかの方法で入手してください:

1. プロジェクト配布者から `svg2_frontend_public_*.tar.gz` を受け取る
2. `data_archive/` ディレクトリにアーカイブがあれば使用する

## 🐛 トラブルシューティング

### 地図が表示されない

**原因**: データファイルが展開されていない

```bash
# データファイルを確認
ls frontend/public/*.geojson

# ない場合は再展開
tar -xzf svg2_frontend_public_*.tar.gz
```

### npm installでエラー

**原因**: Node.jsのバージョンが古い

```bash
# バージョン確認（v18以上が必要）
node -v

# 古い場合は https://nodejs.org/ からダウンロード
```

### ポート3000が使用中

```bash
# 別のポートで起動
PORT=3001 npm run dev
```

### モジュールが見つからない

```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

## 🚢 本番デプロイ

### Vercelへのデプロイ（推奨）

1. [Vercel](https://vercel.com)にログイン
2. プロジェクトをインポート
3. 環境変数（VercelKV）を設定（オプション）
4. デプロイ

**VercelKV設定（停電情報のキャッシュ用）:**
- Vercelダッシュボード → Storage → Create Database → KV
- 環境変数は自動設定される
- ローカル開発ではなしでも動作（メモリキャッシュ）

### 環境変数（オプション）

本番環境でVercelKVを使う場合のみ必要:

```env
# .env.local (ローカル開発用)
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx
```

## 📚 さらに詳しく

- **[README.md](./README.md)** - プロジェクト概要、技術スタック
- **[DATA_SOURCES.md](./DATA_SOURCES.md)** - データソースとライセンス情報

## 🎯 開発コマンド

```bash
cd frontend

npm run dev      # 開発サーバー起動
npm run build    # 本番ビルド
npm run start    # 本番サーバー起動
npm run lint     # ESLint実行
```

## 🔧 データの更新（上級者向け）

地理データを更新する場合:

```bash
# Python環境をセットアップ
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# スクリプトを実行
python scripts/generate_geojson.py
```

---

**困ったときは**: [GitHub Issues](https://github.com/soma578/SVG/issues) で質問してください。
