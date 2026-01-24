# 02_frontend: フロントエンド仕様 (Next.js)

## 1. 技術スタック

- Framework: Next.js (v??) + React
- Language: TypeScript
- UI:
  - 基本: Tailwind CSS or CSS Modules（TODO: 実際の選択を書く）
  - アイコン: TODO: 使う場合は記載 (e.g. Heroicons)
- 地図表示:
  - SVGMap ビューアを iframe / object / 直埋めのいずれかで組み込み
  - `/map` ページ内の中心領域に配置

## 2. ルーティング

| パス             | 役割                          | 備考                        |
|------------------|-------------------------------|-----------------------------|
| `/`              | トップページ                  | 概要、使い方への導線       |
| `/map`           | 防災マップ本体               | メイン機能                 |
| `/about`         | データ出典・連絡先           | 後から追加でもよい         |
| `/admin/login`   | 管理画面ログイン             | 簡易フォーム               |
| `/admin/datasets`| データ管理トップ             | CSVアップロードなど        |

※ バックエンドを別プロセスにする場合も、Next.js 経由で `/api/**` にプロキシする方針。

## 3. 画面仕様

### 3.1 `/map` 防災マップ画面

#### レイアウト（PC想定）

- ヘッダー（上部）
  - アプリ名
  - 簡易メニュー（トップ / 使い方 / 管理ログインなどへのリンク）
- 左サイドパネル
  - 検索ボックス
  - レイヤトグル（チェックボックス）
    - ベースマップ
    - 洪水
    - 土砂
    - 避難所
  - （オプション）フィルタ（避難所種別など）
- 中央
  - 地図領域
    - SVGMap ビューア埋め込み
- 右サイドパネル
  - 詳細情報パネル
    - 避難所をクリックしたときの詳細
    - ハザード領域の情報など
  - 初期表示時は「使い方」メッセージを表示

#### レイアウト（スマホ想定）

- 上部
  - ヘッダー
  - シンプルなボタン
    - [レイヤ] [検索] [詳細]
- 中央
  - 地図（フルスクリーン優先）
- 下部／スライドパネル
  - ボタン操作で、レイヤパネル・詳細パネルがスライド表示される

### 3.2 `/admin/datasets` 管理画面

- 要素
  - 避難所CSVの現在バージョン情報
  - 「新しいCSVをアップロード」フォーム
    - ファイル選択
    - アップロードボタン
  - アップロード後プレビュー
    - 先頭数行の表
    - 簡易な件数チェック
  - 「公開」ボタン（MVPではダミー処理でもOK）

## 4. コンポーネント構成（案）

### 4.1 共通コンポーネント

- `<AppHeader />`
  - タイトル・メニューリンク
- `<Layout />`
  - ヘッダー＋コンテンツ領域の共通レイアウト

### 4.2 `/map` 用コンポーネント

- `<MapPage />`
  - `/map` のページコンテナ
- `<MapCanvas />`
  - SVGMap ビューア埋め込み
  - props: `initialCenter`, `initialZoom`, `activeLayers` など
- `<LayerPanel />`
  - レイヤ一覧とON/OFF
  - props: `layers`, `onToggle(layerId)`
- `<SearchBox />`
  - 住所/施設名検索
  - props: `onSearch(query)`
- `<ShelterList />` (SHOULD)
  - フィルタされた避難所一覧
- `<InfoPanel />`
  - 選択中の避難所 or ハザードの詳細表示

### 4.3 `/admin` 用コンポーネント

- `<AdminLayout />`
  - 管理画面用の共通レイアウト
- `<DatasetTable />`
  - データセット一覧（現状は避難所CSVだけでもOK）
- `<DatasetUploadForm />`
  - CSVアップロードフォームとプレビュー表示

## 5. 画面遷移・イベントフロー（簡易）

- ユーザが `/map` にアクセス
  - `MapPage` 初期化
  - デフォルトのレイヤ状態で `MapCanvas` を表示
- レイヤトグルを変更
  - `activeLayers` state を更新
  - `MapCanvas` に props として渡す
  - `MapCanvas` 内で SVGMap ビューアにレイヤON/OFFを指示
- PIN（避難所）をクリック
  - SVGMap 側から「id=XXXXがクリックされた」というイベントを Next.js 側に通知（postMessage/カスタムイベントなど）
  - Next.js 側で `selectedShelterId` を更新
  - `InfoPanel` が `selectedShelterId` に対応する情報を表示

※ SVGMap → Next.js へのイベントの橋渡しは、別途実装方法を決める（`window.postMessage`等）。ここでは方針のみ記載。

## 6. ステート管理方針

- 最初は React の useState / useContext でシンプルに管理
  - `activeLayers`
  - `selectedShelterId`
  - `mapCenter`, `zoom` （必要なら）
- 状態が複雑になってきたら Zustand/Recoil など導入を検討（この仕様書では必須にしない）。

