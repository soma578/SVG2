# 岡山防災マップ フロントエンド

岡山市周辺を中心に、防災情報を地図上で確認するための Next.js フロントエンドです。  
`/map` が主画面で、`svgmap` と `maplibre` の 2 つの地図エンジンを切り替えて利用できます。

## できること

- 地図の表示
  - `svgmap`: 軽量な標準閲覧モード
  - `maplibre`: 分析寄りの表示モード
- レイヤー切り替え
  - 観光地
  - 避難所
  - ももちゃり
  - 天気
  - 傾斜
  - 土砂災害
- 地点クリックによる詳細表示
- 検索による地点移動
- 現在地表示
- 共有リンク生成

## 主な画面

- `/`
  - トップページ
- `/map`
  - 地図本体
- `/about`
  - データ出典・補足情報
- `/admin/login`
  - 管理画面ログイン
- `/admin/datasets`
  - データセット管理

## `/map` の使い方

### 1. 地図エンジンを選ぶ

- `svgmap`
  - 標準の地図閲覧向け
  - 観光地や避難所の確認に向いています
- `maplibre`
  - 分析表示向け
  - welfare や重い描画を扱う時に向いています

### 2. レイヤーを切り替える

左側パネルから表示したい情報を ON/OFF します。

- `basemap`
  - 背景地図
- `tourism`
  - 観光地
- `evacuation`
  - 避難所
- `momochari`
  - ももちゃり
- `weather`
  - 気象観測点
- `slope`
  - 傾斜
- `landslide`
  - 土砂災害

### 3. 地点を選ぶ

- 地図上の地点をクリックすると、右側に詳細カードが表示されます
- 詳細カードでは
  - 名称
  - 種別
  - 概要
  - 場所
  - 座標
  - 外部リンク
  を確認できます

### 4. 検索する

- 検索ボックスから観光地や避難所を探せます
- 検索結果を選ぶと地図がその地点へ移動します

### 5. 現在地を表示する

- 右上の現在地ボタンで現在地を取得します
- ブラウザの位置情報許可が必要です

### 6. 共有する

- 共有ボタンで現在の地図状態を URL にできます
- 共有リンクには主に次が入ります
  - 地図エンジン
  - 中心座標
  - zoom
  - span
  - 表示レイヤー
  - layer opacity

## セットアップ

```bash
npm install
cd frontend
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## ローカル開発で大事な点

このフロントエンドは `map/` と `svgMapAppLayers/` を配布物として使います。  
開発時と build 時には、それらを `frontend/public/` にコピーします。

使うコマンド:

```bash
npm run prepare:public-assets
```

通常は `npm run dev` と `npm run build` の前に自動で走ります。

## Vercel デプロイ設定

Vercel に載せるときは、**Project Root を `frontend` にする** のが正解です。

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: 自動のまま

これにより `prebuild` で以下が `public/` に入ります。

- `map/`
- `svgMapAppLayers/`

## 主要コマンド

```bash
# 開発
npm run dev

# .next を消して開発
npm run dev:clean

# 本番ビルド
npm run build

# SVG 正規化チェック
npm run check:svg-normalization
```

## 技術スタック

- Next.js
- TypeScript
- Tailwind CSS
- maplibre-gl
- 公式 `svgmapjs`

## 補足

- `map/` 側に SVGMap runtime とレイヤー正本があります
- `svgMapAppLayers/` は basemap などの配布資産です
- `frontend/public/map` と `frontend/public/svgMapAppLayers` は build 前コピーで作られます
