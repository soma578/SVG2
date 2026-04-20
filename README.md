# SVG3 - 防災マップ

全国対応の防災情報 Web マッププロジェクトです。
全国概観から都道府県・市区町村まで階層的に掘り下げられる SVGMap + MapLibre GL JS ベースの地図アプリケーションです。

## 特徴

- 全国 → 都道府県 → 市区町村 の階層ナビゲーション
- SVGMap による高速な市区町村詳細表示（L1 地区境界 / L2 避難所 / L3 チーム活動）
- 市区町村単位での SVG ホットスワップ（選択市のデータだけを読み込む）
- MapLibre GL JS による全国・都道府県概観
- 岡山県が参照実装（27 市区町村対応済み）
- リージョン設定（`manifest.json`）を追加するだけで他都道府県に展開可能

## セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/soma578/SVG3.git
cd SVG3

# 2. 依存関係をインストール・公開アセットをコピー
cd frontend
npm install        # predev で public アセットの準備が自動で走る

# 3. 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

**必要なもの:**
- Node.js v18 以上
- Python 3.10 以上（データ変換スクリプトを実行する場合）

## プロジェクト構成

```
SVG3/
├── map/                   # SVGMap 関連資産
│   ├── vendor/            # svgmapjs 本体
│   ├── layers/            # レイヤー SVG（全国・岡山・市区町村別）
│   └── webapp/            # svgmapjs を包む埋め込み HTML（shelters.html）
├── frontend/              # Next.js アプリケーション（メイン）
│   ├── src/
│   │   ├── app/           # App Router（/map, /admin, /api）
│   │   ├── components/    # React コンポーネント
│   │   ├── features/      # エンジン・プロトコル定義
│   │   └── lib/           # ユーティリティ・設定
│   └── public/
│       ├── regions/       # リージョン設定（manifest.json, runtime-config.json）
│       ├── data/          # 市区町村別データ（避難所・地区 JSON/SVG）
│       └── map/           # ビルド時コピー先（map/ の内容）
├── docs/                  # 設計・現行仕様ドキュメント
├── scripts/               # データ処理スクリプト（Python）
├── tools/svgMapTools/     # SVGMap 用コンテンツ生成ツール
├── data/                  # 変換前の元データ（ローカル保管・Git 管理外）
└── data_archive/          # 配布用アーカイブ（Git 管理外）
```

## 開発

```bash
cd frontend

npm run dev              # 開発サーバー起動（predev で public アセット準備が走る）
npm run dev:clean        # .next を消してから起動
npm run build            # 本番ビルド（SVG 正規化チェック込み）
npm run start            # 本番サーバー起動
npm run lint             # ESLint
npm run check:svg-normalization  # SVG 正規化チェック単体
```

## リージョン追加

`frontend/public/regions/<regionId>/` に以下を置くだけで新しい都道府県に対応できます。

```
manifest.json           # 地図設定（市区町村別 SVG インデックス等）
runtime-config.json     # 地図エンジン初期設定
municipalities.geojson  # 市区町村境界
district-dict.json      # 地区辞書
```

## SVGMap まわりの方針

- `/map` は `frontend/src/components/map/SvgMapEmbed.tsx` から `map/webapp/shelters.html` を iframe で埋め込む構成
- SVGMap エンジンの正本は `map/vendor/svgmapjs`
- 公式レイヤー集は `svgMapAppLayers/`、生成ツールは `tools/svgMapTools/`
- 市区町村選択時に `runtime:setBaseAreaLayer` / `runtime:setEvacuationLayer` を postMessage でホットスワップ

## 技術スタック

- **フロントエンド**: Next.js, React, TypeScript, Tailwind CSS
- **地図表示**: svgmapjs（詳細）、MapLibre GL JS（概観）
- **データ処理**: Python（lxml, shapely, geopandas）

## データソース

- **国土地理院** - 地図タイル、標高データ
- **国土数値情報** - 行政区域、避難所等
- **e-Stat** - 町丁・字等別境界データ（地区境界）

## ライセンス

ISC
