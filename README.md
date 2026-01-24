# SVG2 - 岡山防災情報 Web マップ

岡山県（主に岡山市周辺）を対象とした、防災情報の Web マッププロジェクトです。

## 特徴

- SVGMap を使用した軽量な地図表示
- 避難所情報の可視化
- 洪水・土砂災害ハザードマップレイヤー
- ももちゃり（シェアサイクル）ポート情報
- 停電情報の表示
- Next.js + React による Web アプリケーション

## クイックスタート

### 環境構築

```bash
# リポジトリをクローン
git clone <repository-url>
cd SVG2

# セットアップスクリプトを実行
./setup.sh
```

### アプリケーション起動

```bash
cd frontend
npm run dev
```

ブラウザで http://localhost:3000 にアクセスしてください。

## 必要な環境

- **Node.js**: v18 以上推奨
- **Python3**: 地理データ処理スクリプトを使用する場合のみ必要

## データファイルについて

このプロジェクトでは、国土地理院の基盤地図情報や国土数値情報などの地理データを使用します。これらのデータファイル（約6GB）は容量の問題により Git リポジトリには含まれていません。

### データの入手方法

**方法1: データアーカイブを使用（推奨）**

配布されたデータアーカイブ（`.tar.gz`ファイル）がある場合:

```bash
./scripts/extract_data.sh data_archive/*.tar.gz
```

**方法2: 手動でダウンロード**

国土地理院などから直接ダウンロードする場合は、[DATA_SETUP.md](./DATA_SETUP.md) を参照してください。

**注意**: データファイルがない状態でも基本的なUIは動作しますが、地図表示や一部の機能は正しく動作しません。

## プロジェクト構成

```
SVG2/
├── frontend/          # Next.js アプリケーション（メイン）
├── map/               # SVGMap レイヤーファイル
├── data/              # 地理データファイル（.gitignore対象）
├── scripts/           # データ処理用Pythonスクリプト
├── docs/              # ドキュメント
├── setup.sh           # 環境構築スクリプト
├── requirements.txt   # Python依存関係
└── DATA_SETUP.md      # データセットアップガイド
```

## 開発

### フロントエンド開発

```bash
cd frontend
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npm run lint         # ESLint実行
```

### Python環境（オプション）

地理データ処理スクリプトを使用する場合:

```bash
# 仮想環境作成
python3 -m venv venv
source venv/bin/activate

# 依存関係インストール
pip install -r requirements.txt

# スクリプト実行例
python scripts/generate_geojson.py
```

## 使用している主な技術

- **フロントエンド**: Next.js, React, TypeScript
- **地図表示**: SVGMap, MapLibre GL JS
- **スタイリング**: Tailwind CSS
- **データ処理**: Python (lxml, shapely, geopandas)

## ライセンス

ISC

## データソース

- 国土地理院 基盤地図情報
- 国土数値情報
- その他オープンデータ

詳細は各データファイルのメタデータを参照してください。
