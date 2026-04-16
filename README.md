# SVG2 - 岡山防災情報 Web マップ

岡山県（主に岡山市周辺）を対象とした、防災情報の Web マッププロジェクトです。

## 特徴

- 公式 `svgmapjs` を利用した SVG ベースの地図表示
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

# 2. データアーカイブをSVG2/に配置
#    svg2_frontend_public_*.tar.gz をここに置く

# 3. データアーカイブを展開（SVG2/ディレクトリで実行）
tar -xzf svg2_frontend_public_*.tar.gz

# 4. 依存関係をインストール
cd frontend
npm install

# 5. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

**必要なもの:**
- Node.js v18以上
- データアーカイブ: `svg2_frontend_public_*.tar.gz` (78MB)
  - プロジェクト配布者から受け取る
  - または GitHub Releases からダウンロード

## プロジェクト構成

```
SVG2/
├── map/               # SVGMap 関連資産
│   ├── vendor/        # `svgmapjs` 本体と旧互換 vendor
│   ├── containers/    # ルートコンテナ SVG
│   ├── layers/        # 各レイヤー SVG
│   └── webapp/        # svgmapjs を包む埋め込み HTML
├── frontend/          # Next.jsアプリケーション（メイン）
│   ├── src/          # ソースコード
│   │   ├── app/      # App Router
│   │   ├── components/ # Reactコンポーネント
│   │   ├── hooks/    # カスタムフック
│   │   └── lib/      # ユーティリティ
│   └── public/       # 静的ファイル・GeoJSONデータ
├── docs/              # 設計・運用・現行仕様ドキュメント
├── svgMapAppLayers/   # 公式レイヤー集
├── tools/svgMapTools/ # SVGMap 用コンテンツ生成ツール
├── data_archive/     # データアーカイブ（配布用）
├── data/raw_sources/ # 変換前の元データ（ローカル保管・Git管理外）
├── scripts/          # データ処理スクリプト
├── trash/            # 一時退避（未使用候補の保管）
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

## ドキュメント

- `docs/` 配下はローカル作業用ドキュメントとして運用し、Git 管理対象外（`.gitignore`）です。
- 変換前の元データは `data/raw_sources/` に保管（Git管理外）
- 未使用候補は削除せず `trash/` に一旦退避してから整理

## 使用している主な技術

- **フロントエンド**: Next.js, React, TypeScript
- **地図表示**: 公式 `svgmapjs`, MapLibre GL JS
- **スタイリング**: Tailwind CSS
- **データ処理**: Python (lxml, shapely, geopandas)

## SVGMap まわりの方針

- 現在の `/map` は `frontend/src/components/map/SvgMapEmbed.tsx` から `map/webapp/shelters.html` を埋め込む構成です。
- SVG エンジンの正本は `map/vendor/svgmapjs` です。
- 公式レイヤー集は `svgMapAppLayers` に配置しています。
- SVG レイヤー生成や分割に使う公式ツールは `tools/svgMapTools` に配置しています。
- `map/vendor/svgmap` は旧互換用に残している資産で、新規実装では参照しません。
- upstream の取り込みは `map/vendor/svgmapjs` を更新する前提で行います。

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

## Enforcement Rules (v3.1)

### Runtime

- MUST NOT infer feature semantics
- MUST NOT call external APIs
- MUST NOT use `xlink:title` or `content` as primary source

### Data / Build

- MUST provide normalized `data-*`
- MUST define `layerId` and `kind`

### Application

- MUST treat runtime as black-box

### Engine

- MUST follow runtime protocol

### Failure

- runtime-config failure MUST stop initialization
