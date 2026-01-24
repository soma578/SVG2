了解！岡山市“全域・正確な区域”で、SVG と GeoJSON（SVGMap 取り込み前段）を作るための、信頼できる公式データ源と、**そのまま実行できる作業手順（CLI）**をまとめました。
（出典は国交省「国土数値情報」ほか。各データの根拠ページを併記します）

---

# 使う公式データ源（岡山市向けに抽出）

* **土砂災害警戒区域（A33）**：警戒（黄）/特別警戒（赤）、現象種別（急傾斜地崩壊・土石流・地すべり）を含む。最新版は 1.4 版（2020年度更新）。([国土数値情報][1])
* **行政界（N03）**：岡山市（JISコード 33100）でクリップするために使用。最新版あり。([国土数値情報][2])
* **河川（W05）**：河川中心線ほか。([国土数値情報][3])
* **学校（P29）**：2021年度更新の最新版（第2.0版）。([国土数値情報][4])
* **避難施設（P20）**：指定避難所/緊急避難場所など（最新でない場合あり）。([国土数値情報][5])
* **防災拠点（代替）**：性質が近いレイヤとして

  * **消防署（P17）**（消防本部・署・出張所／管轄区域）([国土数値情報][6])
  * **災害拠点病院フラグ付き 医療機関（P04）**（P04_010 が基幹=1 / 地域=2）([国土数値情報][7])
* **地形（等高線/陰影）**：GSI「基盤地図情報（数値標高モデル/DEM）」から生成（ユーザ登録でDL可）。SVG なら**等高線**化が実務的。([国土地理院][8])

> 参考：岡山市独自ODの入口（必要に応じて補完） ([gis.pref.okayama.jp][9])

---

# ワークフロー（全部コマンドで再現）

下は Linux/WSL 前提。必要ツール：`ogr2ogr`（GDAL）、`mapshaper`（Node）、`qgis`は任意。
座標系は元データ（A33等）は **JGD2011(緯経度)**。SVGMap へは **Webメルカトル** か **SVG固有座標**のどちらでも行けますが、ここでは **Webメルカトル(EPSG:3857)** に統一 → SVG パス出力します。

### 0) 取得と準備

```bash
# 依存
sudo apt-get update && sudo apt-get install -y gdal-bin zip
npm i -g mapshaper

mkdir -p data/raw data/okaya_clip out/svg out/geojson

# 国土数値情報のzipを都道府県単位で保存（例：A33=土砂、N03=行政、W05=河川、P29=学校、P20=避難、P17=消防、P04=医療）
# ↓ダウンロードURLは各データ詳細ページから岡山県分を取得（年度によりファイル名が異なる）
# A33（土砂）、N03（行政）、W05（河川）、P29（学校）、P20（避難）、P17（消防）、P04（医療）
```

（各ダウンロード元：土砂A33、行政N03、河川W05、学校P29、避難P20、消防P17、医療P04。ページ一覧から岡山県分を取得してください）([国土数値情報][1])

### 1) 解凍 & 行政界で岡山市ポリゴン作成

```bash
# 例：行政界（N03_2024）Shapefile前提
unzip -d data/raw data/raw/N03_*.zip

# 岡山市（33100）を抽出 → 3857 へ
ogr2ogr -t_srs EPSG:3857 -where "N03_007='33100' OR N03_004='岡山市'" \
  data/okaya_clip/okayama_city_3857.gpkg data/raw/N03*/N03-*.shp
```

（N03 の属性名は版で差があります。`N03_007` に JIS コード、`N03_004` に市区町村名が入る版が多いです。最新版の仕様はデータ詳細で確認を）([国土数値情報][2])

### 2) 土砂災害（A33）を岡山市でクリップ → GeoJSON & SVG

```bash
unzip -d data/raw data/raw/A33_*.zip

# 3857化
ogr2ogr -t_srs EPSG:3857 data/raw/A33_3857.gpkg data/raw/A33*/A33-*.shp

# 岡山市ポリゴンでクリップ
ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
  out/geojson/okayama_a33.geojson data/raw/A33_3857.gpkg

# 属性の代表列（例）：区域区分/現象別の列名は版により A33_001等
# SVG（パス）出力（クラスを区域区分×現象で付与）
mapshaper out/geojson/okayama_a33.geojson \
  -style target=polygons fill="none" stroke="#FF0000" stroke-width=0.6 \
  -o out/svg/okayama_a33.svg
```

（A33 は 1/25,000 相当の精度。厳密な境界確認は県資料での照合が必要との注意書き）([国土数値情報][10])

### 3) 河川（W05） → GeoJSON & SVG

```bash
unzip -d data/raw data/raw/W05_*.zip
ogr2ogr -t_srs EPSG:3857 data/raw/W05_3857.gpkg data/raw/W05*/W05-*.shp

ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
  out/geojson/okayama_river.geojson data/raw/W05_3857.gpkg Stream.shp

mapshaper out/geojson/okayama_river.geojson \
  -o out/svg/okayama_river.svg stroke-width=0.5
```

([国土数値情報][3])

### 4) 学校（P29） → GeoJSON & SVG

```bash
unzip -d data/raw data/raw/P29_*.zip
ogr2ogr -t_srs EPSG:3857 data/raw/P29_3857.gpkg data/raw/P29*/P29-*.shp

ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
  out/geojson/okayama_schools.geojson data/raw/P29_3857.gpkg

# 点を小丸でSVG化（mapshaperは point-style=circle が便利）
mapshaper out/geojson/okayama_schools.geojson \
  -o out/svg/okayama_schools.svg point-style=circle r=2
```

([国土数値情報][4])

### 5) 避難施設（P20） → GeoJSON & SVG

```bash
unzip -d data/raw data/raw/P20_*.zip
ogr2ogr -t_srs EPSG:3857 data/raw/P20_3857.gpkg data/raw/P20*/P20-*.shp

ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
  out/geojson/okayama_shelter.geojson data/raw/P20_3857.gpkg

mapshaper out/geojson/okayama_shelter.geojson \
  -o out/svg/okayama_shelter.svg point-style=square r=2
```

（最新でない場合がある旨は公式注意書きあり・運用時は市の最新公表も必ず確認）([国土数値情報][5])

### 6) 防災拠点（消防＋災害拠点病院） → GeoJSON & SVG

```bash
# 消防
unzip -d data/raw data/raw/P17_*.zip
ogr2ogr -t_srs EPSG:3857 data/raw/P17_3857.gpkg data/raw/P17*/P17-*.shp
ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
  out/geojson/okayama_fire.geojson data/raw/P17_3857.gpkg
mapshaper out/geojson/okayama_fire.geojson \
  -o out/svg/okayama_fire.svg point-style=triangle r=2

# 医療（災害拠点フラグ：P04_010 in (1,2)）
unzip -d data/raw data/raw/P04_*.zip
ogr2ogr -t_srs EPSG:3857 data/raw/P04_3857.gpkg data/raw/P04*/P04-*.shp
ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg -where "P04_010 IN (1,2)" \
  out/geojson/okayama_disaster_hosp.geojson data/raw/P04_3857.gpkg
mapshaper out/geojson/okayama_disaster_hosp.geojson \
  -o out/svg/okayama_disaster_hosp.svg point-style=cross r=2
```

([国土数値情報][6])

### 7) 地形（等高線） → GeoJSON & SVG（任意）

* GSI「基盤地図情報ダウンロードサービス」で岡山市範囲の **5m/10m DEM** を入手 → QGIS で**陰影図**（背景ラスタ）または **等高線**（ベクタ）を生成し、等高線のみSVG化が実務的。([service.gsi.go.jp][11])
* QGIS 等高線：`Raster → Extraction → Contour`、等間隔（例 10m）で作成 → 3857 へ再投影 → `SVG` 出力。

---

## SVGMap 取り込みのコツ

* すべて **EPSG:3857** に揃えた SVG を `<g id="layer_xxx">` に分けると管理しやすい（例：`layer_a33_yellow` / `layer_a33_red` / `layer_river` / `layer_school` / `layer_shelter` / `layer_fire` / `layer_hospital` / `layer_contour`）。
* A33 は属性で**区域区分（警戒/特別警戒）・現象（急傾斜/土石流/地すべり）**を分け、クラス名に反映させて色分け可。([国土数値情報][1])
* 地形は**背景はタイル**、ハザード等**上物はSVG**が軽量で実運用向き。

---

## 利用上の注意（公式の但し書き要点）

* **A33（警戒区域）**は 1/25,000 相当の精度。**厳密な位置は県が公表する原資料で要確認**。指定/解除は随時更新で、国土数値情報への反映にタイムラグあり。([国土数値情報][10])
* **避難施設（P20）**は最新でない場合あり。**実利用時は市の最新公表を確認**。([国土数値情報][5])
* GSI DEM は**要ユーザ登録**でダウンロード。([service.gsi.go.jp][11])

---

## 仕上がり物（この手順で得られるファイル）

* `out/geojson/okayama_a33.geojson`（土砂災害）／`okayama_river.geojson`／`okayama_schools.geojson`／`okayama_shelter.geojson`／`okayama_fire.geojson`／`okayama_disaster_hosp.geojson`
* `out/svg/okayama_*.svg`（各レイヤのSVG）

---

岡山県：本データを警戒区域等の境界の確認の根拠としないこと

必要なら、上のコマンドを**あなたの環境用に調整済みのスクリプト**（`make_layers.sh`）と、**SVGMap の layer 定義サンプル**（色・凡例付き）もこちらで用意して渡します。どの配色・クラス名にしますか？（例：A33は赤=特別警戒、黄=警戒、破線=未指定 など）

[1]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-v1_4.html?utm_source=chatgpt.com "土砂災害警戒区域データ - 国土数値情報"
[2]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html?utm_source=chatgpt.com "行政区域データ - 国土数値情報"
[3]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html?utm_source=chatgpt.com "河川データ - 国土数値情報"
[4]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29-v2_0.html?utm_source=chatgpt.com "学校データ - 国土数値情報"
[5]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P20.html?utm_source=chatgpt.com "避難施設データ - 国土数値情報"
[6]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P17.html?utm_source=chatgpt.com "消防署データ - 国土数値情報"
[7]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P04-v3_0.html?utm_source=chatgpt.com "医療機関データ - 国土数値情報"
[8]: https://www.gsi.go.jp/kiban/?utm_source=chatgpt.com "基盤地図情報サイト"
[9]: https://www.gis.pref.okayama.jp/okayamacity/okayamacity/Content/pages/opendata/index.html?utm_source=chatgpt.com "岡山市地図情報 オープンデータ"
[10]: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-v2_0.html?utm_source=chatgpt.com "土砂災害警戒区域データ - 国土数値情報"
[11]: https://service.gsi.go.jp/kiban/?utm_source=chatgpt.com "基盤地図情報ダウンロードサービス"
