# 05_svgmap_layers: SVGMap レイヤ構成

- 対象地域: region-aware 構成（既定 region は岡山）

## 1. 目的

- SVGMap を地図描画基盤の正本として扱う前提で、
  - どのファイルがどの階層・レイヤを担当するか
  - どういう順番・重みで重ねるか
  - どのレイヤが SVG / WebApp Layer / JSON か
- を明確にし、フロントエンド／データ更新作業時の混乱を防ぐ。

---

## 2. ディレクトリ構成（案）

```text
map/
├── containers/
│   └── Containers.svg
├── overview/
│   ├── nation.svg
│   └── prefectures/
│       └── <prefecture>.svg
├── layers/
│   ├── area_base_<region>.svg
│   ├── hazard_flood_<region>.svg
│   ├── hazard_landslide_<region>.svg
│   └── ...
├── data/
│   ├── shelters_<region>.json
│   └── team_activity_<region>.json
└── webapp/
    ├── shelters.html
    └── team_activity.html
```

---

## 3. 基本レイヤ構成

### 3.1 全国 overview

- 全国 overview では都道府県境界のみを持つ軽量 SVG を表示する。
- 色分けは `L3 teamActivity` の有無または件数に基づく。
- basemap は表示しない。
- `L2 evacuation` と `L3 teamActivity` の個別点は表示しない。

### 3.2 都道府県 overview

- 都道府県 overview では選択県に対応する軽量 SVG を表示する。
- SVG は県内市区町村境界のみを持つ。
- 色分けは `L3 teamActivity` の有無または件数に基づく。
- basemap は表示しない。
- `L2 evacuation` と `L3 teamActivity` の個別点は表示しない。

### 3.3 市区町村詳細

市区町村詳細の表示順は下から上へ以下を基本とする。

1. 背景補助
2. **L1 ベースエリア**
3. **L2 避難所**
4. **L3 チーム活動**
5. 補助レイヤ

補助レイヤ:
- 洪水
- 土砂災害
- 気象
- 避難経路
- その他

---

## 4. レイヤ別の生成フロー

### 4.1 L1 ベースエリア

#### 4.1.1 L1 の選択方式

- L1 は初期実装では面ポリゴン全面をタップ対象としない。
- 面は表示用レイヤとし、選択操作は地区ごとの代表点または地区名ラベルで受ける。
- 代表点は L1 と対応する `areaId` を持ち、選択時に該当ポリゴンを強調表示する。
- この方式を SVGMap runtime の正本仕様とする。

| フェーズ | ファイル/ツール | 役割 |
| --- | --- | --- |
| 入力 | 元の行政界データ / 区域データ | 高精度データを入力とする |
| 軽量化 | 簡略化スクリプト / 前処理 CLI | 座標点数を削減し、表示向けデータへ変換する |
| 出力 | `map/overview/*.svg`, `map/layers/area_base_<region>.svg` | overview / detail 用の軽量化済み SVG |

### 4.2 L2 避難所

| フェーズ | ファイル/ツール | 役割 |
| --- | --- | --- |
| 入力 | `shelters.csv` / `shelters.xlsx` | 避難所一覧の元データ |
| 変換 | `import_map_data.py` 等 | CSV / Excel を検証し、正規化 JSON に変換する |
| 出力 | `map/data/shelters_<region>.json` | WebApp Layer が読む正規化済みデータ |
| 表示 | `map/webapp/shelters.html` | runtime が避難所ドット / ピンを描画する |

### 4.3 L3 チーム活動

| フェーズ | ファイル/ツール | 役割 |
| --- | --- | --- |
| 入力 | `team_activity.csv` / `team_activity.xlsx` | チーム活動の元データ |
| 変換 | `import_map_data.py` 等 | CSV / Excel を検証し、正規化 JSON に変換する |
| 出力 | `map/data/team_activity_<region>.json` | WebApp Layer が読む正規化済みデータ |
| 表示 | `map/webapp/team_activity.html` | runtime がチーム活動を描画する |

### 4.4 補助レイヤ

| レイヤ | 形式 | 備考 |
| --- | --- | --- |
| 洪水 | SVG | 必要時のみ表示 |
| 土砂災害 | SVG | 必要時のみ表示 |
| 気象 | WebApp / API 連携 | 将来拡張 |
| 避難経路 | WebApp / 別データ形式 | 将来拡張 |

---

## 5. Containers.svg での扱い

- `Containers.svg` は市区町村詳細用 runtime のルートコンテナとする。
- 全国 / 都道府県 overview は `Containers.svg` に載せず、専用 SVG 資産として切り替える。
- 実際の region 切替は `regions/<regionId>/manifest.json` と `runtime-config.json` を正本とする。
- `Containers.svg` では detail runtime のレイヤ順序を管理する。

推奨する初期表示状態:
- L1: ON
- L2: ON
- L3: ON
- 洪水: OFF
- 土砂災害: OFF
- 気象: OFF
- 避難経路: OFF

---

## 6. 運用上の原則

- L1 の操作は「面を見せる」「点またはラベルで選ぶ」を基本とし、初期段階ではポリゴン全面ヒット判定を避ける。
- L2 は位置情報のみではなく、施設属性を保持するレイヤとして扱い、詳細表示に必要な項目を JSON に含める。
- L1 は業務上の基盤レイヤであり、overview / detail の双方で土台として扱う。
- L2 / L3 は更新しやすさを優先し、CSV / Excel から正規化 JSON を生成する。
- 補助レイヤは必要時に重ねる設計とし、初期表示で情報過多にしない。
- overview 資産追加時は対象 SVG と manifest 参照を、detail 資産追加時は `Containers.svg` / detail SVG / JSON / WebApp Layer をセットで更新する。

---

## 7. 現時点の改善観点

### 7.1 L1 選択方式の最終固定

- 本章では L1 の面は表示、選択は代表点またはラベルを正本とする。
- この方式を SVGMap runtime の共通仕様として固定する。

### 7.2 current / legacy の扱い

- current path は L1 / L2 / L3 を正本とする。
- 補助レイヤや旧 UI 前提の資産は legacy として分離し、削除するか凍結するかを後続判断事項とする。

### 7.3 L2 / L3 の current 優先

- current path では L2 / L3 を主業務レイヤとして優先する。
- 補助レイヤは current path の必須集合には含めず、必要時のみ重ねる。

### 7.4 SVG 正規化の境界整理

- 正規化対象 SVG は current / legacy をまたぐため、今後はどこまでを current 運用の対象にするかを明示する。
- とくに L1 の表示 SVG と選択用データの境界は、今後の全国展開を見据えて整理する。

### 7.5 SVGMap ネイティブ移行

- overview / detail の両方を SVG 資産切替で構成する。
- `L2 evacuation` と `L3 teamActivity` は SVG に焼き込まず、runtime 描画に統一する。
- MapLibre 前提の overview や mask 実装は将来的な削除候補として扱う。
