# SVG3 フロントエンド

全国対応防災マップの Next.js フロントエンドです。
`/map` が主画面で、**MapLibre GL JS**（全国・都道府県概観）と **SVGMap**（市区町村詳細）を組み合わせた階層ナビゲーションを提供します。

## できること

- **全国 → 都道府県 → 市区町村** の階層ナビゲーション
- 市区町村を選ぶと SVGMap に切り替わり詳細レイヤーを表示
  - **L1 地区境界**（baseArea）: 町丁・字等の境界 SVG
  - **L2 避難所**（evacuation）: 避難所 POI SVG
  - **L3 チーム活動**（teamActivity）: 支援チーム POI SVG
- 市区町村単位でのホットスワップ（選択市のデータだけ読み込む）
- レイヤーの表示・非表示・不透明度切り替え
- 地点クリックによる詳細カード表示
- 地区名・避難所名・チーム名での検索
- 現在地表示
- 共有リンク生成（地図状態を URL にエンコード）

## 主な画面

- `/` — トップページ
- `/map` — 防災マップ本体
- `/about` — データ出典・補足情報
- `/admin/login` — 管理画面ログイン
- `/admin/datasets` — データセット管理（CSV アップロード等）

## 地図の構造

```
全国 (MapLibre)
  └─ 都道府県を選ぶ
       └─ 市区町村を選ぶ → SVGMap 詳細表示
            ├─ L1 地区境界（選択市の SVG）
            ├─ L2 避難所（選択市の SVG）
            └─ L3 チーム活動（選択市の SVG）
```

SVGMap は `map/webapp/shelters.html` を iframe で埋め込んでいます。
市区町村選択時に `runtime:setBaseAreaLayer` / `runtime:setEvacuationLayer` を postMessage してホットスワップします。

## セットアップ

```bash
npm install       # predev で public アセット（map/, svgMapAppLayers/）が自動コピーされる
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 主要コマンド

```bash
npm run dev                       # 開発サーバー起動
npm run dev:clean                 # .next を消してから起動
npm run build                     # 本番ビルド（SVG 正規化チェック込み）
npm run start                     # 本番サーバー起動
npm run lint                      # ESLint
npm run check:svg-normalization   # SVG 正規化チェック単体
npm run prepare:public-assets     # public アセットのコピーのみ
npm run build:search-index        # 検索インデックスを再生成
```

## リージョン設定

`frontend/public/regions/<regionId>/` に `manifest.json` と `runtime-config.json` を置くと新しいリージョンが追加されます。
`manifest.json` で市区町村別 SVG インデックス（`districtSvgIndexByMunicipality`, `evacuationSvgIndexByMunicipality`）を指定します。

## Vercel デプロイ

Project Root を `frontend` に設定します。

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`

`prebuild` で `map/` と `svgMapAppLayers/` が `public/` にコピーされます。

## 技術スタック

- Next.js / React / TypeScript
- Tailwind CSS
- MapLibre GL JS（全国・都道府県概観）
- svgmapjs（市区町村詳細）
