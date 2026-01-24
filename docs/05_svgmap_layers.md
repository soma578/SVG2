# 05_svgmap_layers: SVGMap レイヤ構成

- 対象地域: 岡山県（当面は岡山市および周辺市町村）

## 1. 目的

- SVGMap を用いた岡山防災マップにおいて、
  - どのファイルがどのレイヤを担当するか
  - どういう順番・透明度で重ねるか
  - どのレイヤが CSV / WebApp 型か
- を明確にし、フロントエンド／データ更新作業時の混乱を防ぐ。

---

## 2. ディレクトリ構成（案）

```text
map/
├── containers/
│   └── Containers.svg       # レイヤ定義の「マスタ」
├── layers/
│   ├── base_okayama.svg         # ベースマップ（岡山県）
│   ├── hazard_flood_okayama.svg # 洪水浸水想定区域
│   ├── hazard_landslide_okayama.svg # 土砂災害警戒区域
│   └── ...                      # その他ハザード
├── data/
│   └── shelters_okayama.csv     # 岡山県内の避難所CSV
└── webapp/
    └── shelters.html            # 避難所ピンを描画するWebApp Layer

---

## 3. スポットレイヤ（避難所など）の生成フロー

| フェーズ | ファイル/ツール | 役割 |
| --- | --- | --- |
| 入力 | `map/data/shelters_okayama.csv` | UTF-8 CSV。`name, kind, lon, lat, url, summary` を持つ。<br>`python3 map/tools/add_spot.py --name ...` で同ヘッダーの行を追記でき、文字コード変換などは行わずそのまま UTF-8 で管理する。 |
| 変換 | `python3 map/tools/generate_spots.py` | CSV を読み `map/layers/base_okayama.svg` を出力。<br>1) 全スポットの緯度経度から viewBox を算出し、`<globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(...)" />` を挿入。<br>2) `kind` ごとのピン画像を `<defs>` に登録。<br>3) 各行を `<use transform="ref(svg,lon,lat)">` として吐き出し、GeoSVG の `ref(svg, …)` を使って「緯度経度 → SVG 座標」対応を持たせる。 |
| 出力 | `map/layers/base_okayama.svg` | 緯度経度を直接保持しない SVG でも `ref(svg,lon,lat)` を解釈できる環境（SVGMap, WebApp Layer 等）であれば位置決めが可能。CSV とは別形式になるが、元の文字列（名称や summary）はエスケープのうえ content/title 属性として埋め込まれる。 |

- これにより「緯度経度付き CSV → ピン付き SVG」への変換が一貫しており、レイヤ追加は CSV 行の追記と `generate_spots.py` の実行だけで済む。
- ほかのレイヤも同じ考え方（GeoJSON や GML を加工 → `map/layers/*.svg`）で追加でき、最終的には `containers/Containers.svg` で読み込んで重ね合わせる。
