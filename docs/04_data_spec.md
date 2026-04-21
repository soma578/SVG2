# 04_data_spec: データ仕様

## 1. 全体方針

補足:

- current path の描画責務は
  - 全国 / 都道府県 overview:
    SVGMap
  - 市区町村詳細:
    MapLibre
- 本書は描画エンジンの違いではなく、L1 / L2 / L3 の入力形式、公開形式、fallback、正規化ルールを定義する
- current path の責務境界そのものは `docs/current-spec/` を正本とする

## 1.1 データ読込優先順位

- 地図アプリは対象 region の publish 済み JSON を優先して利用する。
- オンライン時は最新取得を試み、成功時は端末内キャッシュを更新する。
- 取得失敗時は端末内キャッシュを利用する。
- キャッシュも存在しない場合は `regions/<regionId>` 配下の fallback データを利用する。
- 表示元は `network` / `cache` / `fallback` のいずれかとして扱う。

- 防災マップで扱うデータは、以下の4種類に分ける。
  1. **L1 ベースエリア**（軽量化済み SVG）
  2. **L2 避難所**（CSV / Excel → JSON）
  3. **L3 チーム活動**（CSV / Excel → JSON）
  4. **補助レイヤ**（ハザード、気象、避難経路など）

- L1 は面または境界を持つ基礎レイヤであり、他レイヤの土台となる。
- L2 / L3 は、運用上の更新しやすさを重視し、CSV または Excel を入力元とする。
- 地図アプリは CSV / Excel を直接読まず、正規化済み JSON を読む。
- current path では region-aware な manifest と公開 JSON / fallback を使い分ける。
- 補助レイヤは SVG または別形式で追加可能とする。
- overview 用 SVG や summary asset は、今後 LoD / QTCT 準備の対象になりうるが、本書ではまず current path の入力・公開契約を優先する。

---

## 2. L1 ベースエリア仕様

### 2.1 役割

- 自治体境界、地区境界、区域情報などを表す
- 地図上の基礎面情報として使う
- 他レイヤの位置関係や文脈の土台となる

### 2.2 形式

- 形式: SVG
- 前提: 軽量化済みであること
- 備考:
  - 元の高精度ポリゴンをそのまま使わない
  - 簡略化済みポリゴンまたは境界線を用いる
  - current path では overview 用 SVG と detail 用 asset は役割を分けて扱う

### 2.3 最低属性

- `id`
- `title`
- `kind = area`
- `category`
- `summary`（任意）

### 2.4 L1 の選択用データ

- L1 の面ポリゴンは表示を主目的とし、初期実装では全面タップを必須としない。
- 各行政区画・地区ごとに、選択用の代表点データまたはラベル位置を別途持つことを前提とする。
- 代表点データは少なくとも以下を持つ。
  - `id`
  - `areaId`
  - `title`
  - `lat` または `x`
  - `lon` または `y`
- `areaId` は L1 の面データと対応付け可能であること。
- この方針は、全国規模への拡張時にも選択UIの一貫性と描画負荷の安定性を保つための基本方針とする。

---

## 3. L2 避難所仕様
### 3.0 役割

- L2 は、避難所の位置を示すだけでなく、施設に関する属性情報を保持する業務レイヤである。
- 少なくとも以下の属性を扱えることを前提とする。
  - 施設名
  - 住所
  - 収容人数
  - 施設種別
  - 開設状況
  - 備考

### 3.1 入力形式

- `.csv`
- `.xlsx`

### 3.1a 公開先

- 既定 region: `public/data/shelters.json`
- 追加 region: `public/data/<regionId>/shelters.json`
- fallback: `public/regions/<regionId>/shelters-fallback.geojson`

### 3.2 入力列仕様

#### 必須列

| 列名 | 型 | 説明 |
|---|---|---|
| `id` | string | 一意なID |
| `title` | string | 避難所名 |
| `lat` | number | 緯度 |
| `lon` | number | 経度 |
| `status` | string | 開設状態 |

#### 推奨列

| 列名 | 型 | 説明 |
|---|---|---|
| `address` | string | 住所 |
| `capacity` | number | 想定収容人数 |
| `facilityType` | string | 施設種別 |
| `barrierFree` | boolean | バリアフリー対応 |
| `pets` | boolean | ペット同行可否 |
| `updatedAt` | string | 更新時刻 |
| `note` | string | 備考 |

### 3.3 `status` の許容値

- `open`
- `closed`
- `full`
- `unknown`

### 3.4 CSV 例

```csv
id,title,lat,lon,status,address,capacity,facilityType,barrierFree,pets,updatedAt,note
shelter-001,○○小学校 体育館,34.6650,133.9210,open,岡山市○○区...,300,school,true,false,2026-03-28T12:00:00+09:00,
shelter-002,△△公民館,34.6672,133.9265,closed,岡山市○○区...,120,community_center,true,true,2026-03-28T11:45:00+09:00,準備中

[
  {
    "id": "shelter-001",
    "title": "○○小学校 体育館",
    "kind": "shelter",
    "lat": 34.665,
    "lon": 133.921,
    "status": "open",
    "address": "岡山市○○区...",
    "capacity": 300,
    "facilityType": "school",
    "barrierFree": true,
    "pets": false,
    "updatedAt": "2026-03-28T12:00:00+09:00",
    "note": null
  }
]

- L2 の正規化後データは、地図上の点表示に必要な位置情報に加え、詳細パネル表示に必要な施設属性を保持する。

## 4. L3 チーム活動仕様

### 4.1 入力形式

* `.csv`
* `.xlsx`

### 4.1a 公開先

* 既定 region: `public/data/team-activity.json`
* 追加 region: `public/data/<regionId>/team-activity.json`
* fallback: `public/regions/<regionId>/team-activity-fallback.json`

### 4.2 入力列仕様

#### 必須列

| 列名             | 型      | 説明     |
| -------------- | ------ | ------ |
| `id`           | string | 一意なID  |
| `teamId`       | string | チーム識別子 |
| `teamName`     | string | チーム名   |
| `title`        | string | 地図表示名  |
| `activityType` | string | 活動種別   |
| `status`       | string | 活動状態   |
| `lat`          | number | 緯度     |
| `lon`          | number | 経度     |

#### 推奨列

| 列名          | 型      | 説明   |
| ----------- | ------ | ---- |
| `updatedAt` | string | 更新時刻 |
| `note`      | string | 備考   |
| `operator`  | string | 担当組織 |
| `area`      | string | 担当地域 |

### 4.3 `status` の許容値

* `active`
* `standby`
* `stopped`
* `unknown`

### 4.4 `activityType` の例

* `water`
* `medical`
* `transport`
* `safety_check`
* `supply`
* `other`

### 4.5 CSV 例

```csv
id,teamId,teamName,title,activityType,status,lat,lon,updatedAt,note,operator,area
team-001,A-01,給水支援チームA,給水支援チームA,water,active,34.6680,133.9280,2026-03-28T12:05:00+09:00,,岡山市支援本部,北区
team-002,B-03,物資搬送チームB,物資搬送チームB,transport,standby,34.6623,133.9194,2026-03-28T11:58:00+09:00,出動待機,県支援隊,中区
```

### 4.6 正規化後 JSON 形式

```json
[
  {
    "id": "team-001",
    "title": "給水支援チームA",
    "kind": "team",
    "teamId": "A-01",
    "teamName": "給水支援チームA",
    "activityType": "water",
    "status": "active",
    "lat": 34.668,
    "lon": 133.928,
    "updatedAt": "2026-03-28T12:05:00+09:00",
    "note": null,
    "operator": "岡山市支援本部",
    "area": "北区"
  }
]
```

---

## 5. Excel 仕様

### 5.1 基本方針

* 1 ファイル 1 シートを基本とする
* 1 行目をヘッダー行とする
* セル結合は禁止
* 数式セルは値として読み取る

### 5.2 推奨シート名

* L2 避難所: `shelters`
* L3 チーム活動: `team_activity`

---

## 6. 変換ルール

* CSV / Excel を入力元とする
* 変換スクリプトで正規化 JSON を生成する
* 必須列不足はエラー
* 不要列は無視してよい
* 文字列前後の空白は trim する
* 空文字列は `null` とする
* `lat`, `lon`, `capacity` は数値変換する
* L2 には `"kind": "shelter"` を付与する
* L3 には `"kind": "team"` を付与する
* 地図アプリは JSON のみを読む
* 管理画面 publish 時は `regionId` に応じて保存先を切り替える
* 地図アプリと検索 API は、対象 region の publish 済み JSON を優先し、なければ `regions/<regionId>` の fallback を使う

---

## 7. バリデーション

### 7.1 エラー条件

* 必須列が存在しない
* 必須値が空欄
* `lat`, `lon` が数値でない
* `status` が許容値に含まれない
* `id` が重複している

### 7.2 警告条件

* `updatedAt` が空
* `capacity` が空
* `note` が空
* 未知の任意列が存在する

### 7.3 エラー時の挙動

* JSON を出力しない
* 行番号と理由をログに出す
* 利用者が修正できるように、列名・値を表示する

---

## 8. 配置先

* L2: `public/data/shelters.json` または `public/data/<regionId>/shelters.json`
* L3: `public/data/team-activity.json` または `public/data/<regionId>/team-activity.json`

補足:

- overview 用 SVG や container 資産は `map/` を正本とし、`prepare:public-assets` で `frontend/public/map/` へ同期する
- JSON / fallback と SVG asset は更新経路が異なるため、混同しない

---

## 9. テンプレート

* `shelters_template.xlsx`
* `team_activity_template.xlsx`
* `shelters_template.csv`
* `team_activity_template.csv`

運用側はテンプレートに従って入力することを前提とする。

---

## 10. 現時点の改善観点

### 10.1 L1 選択方針の固定

- L1 は面を表示の土台として扱う。
- 選択は代表点またはラベルを正本とし、両エンジンで同じ方式を採用する。
- 面ポリゴン全面ヒットは将来の限定拡張とする。

### 10.2 L2 正本データソース

- L2 は「岡山市を正本にするのか」「県データを補完に使うのか」を仕様として固定する。
- 正本データソースが決まったら、CSV / Excel テンプレート、公開 JSON、検索 API を同じ前提で運用する。

### 10.3 L3 更新主体と更新頻度

- L3 は誰が更新するかを仕様で明記する。
- あわせて、手動更新、日次更新、随時更新などの期待頻度も定義する。
- リアルタイム化を行う場合も、この更新責任の上に積み上げる。

### 10.4 検索スケールへの備え

- 現行の current path では固定件数取得で十分とする。
- ただし将来の件数増加に備え、L2 / L3 の正規化 JSON はサーバ検索へ移行しやすい形を維持する。
