# SVG2 - 岡山防災情報 Web マップ

岡山県（主に岡山市周辺）を対象とした、防災情報の Web マッププロジェクトです。

## 特徴

- SVGMap を使用した軽量な地図表示
- 避難所情報の可視化
- 洪水・土砂災害ハザードマップレイヤー
- ももちゃり（シェアサイクル）ポート情報
- 停電情報の表示
- Next.js + React による Web アプリケーション

## 🚀 セットアップ

詳細な手順は **[QUICK_START.md](./QUICK_START.md)** を参照してください。

**簡易版:**

```bash
# 1. リポジトリをクローン
git clone https://github.com/soma578/SVG.git
cd SVG2

# 2. データアーカイブを展開
tar -xzf svg2_frontend_public_*.tar.gz

# 3. 依存関係をインストール
cd frontend
npm install

# 4. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

**必要なもの:**
- Node.js v18以上
- データアーカイブ: `svg2_frontend_public_*.tar.gz` (78MB)

## プロジェクト構成

```
SVG2/
├── frontend/          # Next.jsアプリケーション（メイン）
│   ├── src/          # ソースコード
│   │   ├── app/      # App Router
│   │   ├── components/ # Reactコンポーネント
│   │   ├── hooks/    # カスタムフック
│   │   └── lib/      # ユーティリティ
│   └── public/       # 静的ファイル・GeoJSONデータ
├── data_archive/     # データアーカイブ（配布用）
├── scripts/          # データ処理スクリプト
└── README.md         # このファイル
```

## 開発

```bash
cd frontend
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npm run start        # 本番サーバー起動
npm run lint         # ESLint実行
```

詳細は [QUICK_START.md](./QUICK_START.md) を参照してください。

## 使用している主な技術

- **フロントエンド**: Next.js, React, TypeScript
- **地図表示**: SVGMap, MapLibre GL JS
- **スタイリング**: Tailwind CSS
- **データ処理**: Python (lxml, shapely, geopandas)

## ライセンス

ISC

## データソース

本プロジェクトは以下のデータソースを使用しています：

- **国土地理院** - 地図タイル、標高データ
- **国土数値情報** - 行政区域、河川、避難所等
- **e-Stat** - 町丁・字等別境界データ
- **気象庁** - 降水ナウキャスト
- **岡山市オープンデータ** - ももちゃり（シェアサイクル）
- **中国電力ネットワーク** - 停電情報（※Webスクレイピング）

詳細なデータソース一覧と利用規約については [DATA_SOURCES.md](./DATA_SOURCES.md) を参照してください。

### ⚠️ 停電情報について

停電情報は中国電力ネットワーク株式会社のWebサイトから取得しています（公式APIではありません）。
- サーバー負荷軽減のため、5分間のキャッシュを実装しています
- データの正確性は保証されません
- 公式情報は必ず[中国電力ネットワークの停電情報サイト](https://www.teideninfo.energia.co.jp/)で確認してください
- 商用利用の場合は事前に許諾を得ることを推奨します
