# 05_svgmap_layers: SVGMap レイヤ構成

## 1. 目的

この文書は、**SVGMap が担当する資産とレイヤ** を整理する。

current path において SVGMap の主戦場は:

- 全国 overview
- 都道府県 overview
- 静的 SVG 資産

である。

市詳細の主役は現在 MapLibre なので、
この文書は「地図全体の唯一正本」ではなく、
**SVGMap 側資産の責務整理** として読む。

## 2. 現行の役割分担

### 2.1 SVGMap が主役の部分

- `japan.svg`
- `pref/<XX>.svg`
- `Containers_japan_no_basemap.svg`
- `shelters.html` による overview runtime

### 2.2 SVGMap 資産として残っている部分

- per-muni SVG
- 全県統合 SVG
- 比較実装 / 静的配信向けの detail 資産

### 2.3 MapLibre が主役の部分

- 市区町村詳細
- basemap
- detail 時の L1/L2/L3 表示

## 3. 現行の asset 構成

```text
map/
├── containers/
│   ├── Containers.svg
│   ├── Containers_no_basemap.svg
│   └── Containers_japan_no_basemap.svg
├── layers/
│   ├── overview/
│   │   ├── japan.svg
│   │   └── pref/
│   │       └── <XX>.svg
│   ├── base_area_<region>.svg
│   ├── evacuation_<region>.svg
│   ├── team_activity_<region>.svg
│   └── districts/<region>/
│       ├── evacuation/<muniCode>.svg
│       └── team_activity/<muniCode>.svg
└── webapp/
    └── shelters.html
```

## 4. 階層ごとの SVGMap 利用

### 4.1 全国 overview

- `layer-overview` に `japan.svg`
- 都道府県境界を表示
- basemap なし
- L2/L3 個別点なし

### 4.2 都道府県 overview

- `layer-overview` に `pref/<XX>.svg`
- 県内市区町村境界を表示
- basemap なし
- L2/L3 個別点なし

### 4.3 市区町村詳細

現行 current path では、
市詳細そのものの正本描画は MapLibre である。

ただし SVGMap 資産としては次が残る。

- `base_area_<region>.svg`
- `evacuation_<region>.svg`
- `team_activity_<region>.svg`
- `districts/<region>/*`

これらは:

- 比較実装
- 静的配信
- 将来 LoD / summary build の土台

として位置づける。

## 5. レイヤ別の生成フロー

### 5.1 overview SVG

入力:

- 全国 / 行政界 GeoJSON

出力:

- `map/layers/overview/japan.svg`
- `map/layers/overview/pref/<XX>.svg`

役割:

- overview 用の軽量 SVG
- クリック対象
- 行政界の視覚化

### 5.2 L2 避難所

入力:

- `shelters.csv` / `shelters.xlsx`

現在の正本:

- 正規化 JSON
- API
- fallback

SVG 資産:

- `evacuation_<region>.svg`
- `districts/<region>/evacuation/<muniCode>.svg`

### 5.3 L3 チーム活動

入力:

- `team_activity.csv` / `team_activity.xlsx`

現在の正本:

- 正規化 JSON
- API
- fallback

SVG 資産:

- `team_activity_<region>.svg`
- `districts/<region>/team_activity/<muniCode>.svg`

## 6. container の扱い

### 6.1 `Containers_japan_no_basemap.svg`

- 全国 / 都道府県 overview 用
- 全国スケール viewBox
- `layer-overview` を含む

### 6.2 `Containers_no_basemap.svg`

- basemap を持たない detail 系 container

### 6.3 `Containers.svg`

- basemap を含む container
- region / basemap 条件で使い分ける

## 7. 運用上の原則

- overview SVG は軽量・静的 asset として扱う
- overview の主役は行政界 SVG であり、個別点群ではない
- detail 正本は現時点では JSON / API / MapLibre
- SVG detail 資産は current path の補助・比較・将来 build 資産として扱う
- asset 更新時は `map/` 正本と `frontend/public/map/` 公開側の同期を忘れない

## 8. 改善観点

### 8.1 per-pref / per-muni 静的分割の固定

- どこまでを active route で使うか
- どこからを比較・将来用として残すか

を明示する必要がある。

### 8.2 LoD / summary 準備

- overview / summary / detail の asset を段階別に持てるようにする
- `japan.svg` / `pref/<XX>.svg` の次に何を足すかを決める

### 8.3 SVGMap ネイティブ移行

- 将来的に detail も SVGMap へ寄せるなら、
  basemap 方針・static asset 正本化・LoD 契約が前提になる
