# 岡山防災マップを 0 から構築する手順

リポジトリが手元になくても、以下の手順を順番に実行すれば **SVGMap** ベースの岡山防災マップ（避難所 + 気象レイヤー）を再現できます。  
最終的には `map/webapp/shelters.html` をブラウザで開いて確認します。

---

## 1. 前提ソフト

- **Git / curl / wget**（`svgMapAppLayers` とチュートリアル素材の取得に使用）
- **Python 3**（`python3 -m http.server` で簡易サーバを起動）
- **テキストエディタ**（VS Code / Vim など）
- **WSL / Linux / macOS** など大小文字が区別される環境を推奨

> Windows ネイティブで作業する場合も、`svgMapAppLayers` ディレクトリ名などの大文字小文字を厳守してください。

---

## 2. 作業フォルダと共通ライブラリ

```bash
mkdir -p /home/nogami/workspace_for_wsl/SVG
cd /home/nogami/workspace_for_wsl/SVG

# SVGMap の共通レイヤー群
git clone https://github.com/svgmap/svgMapAppLayers.git

# ピン画像などの教材（公式サイトを丸ごと取得）
mkdir -p tutorials
cd tutorials
wget -r -np -nH --cut-dirs=2 \
  https://www.svgmap.org/devinfo/devkddi/tutorials/tutorial1/
cd ..
```

ここまでで `SVG/` 直下に `svgMapAppLayers/` と `tutorials/tutorial1/` が揃います。

---

## 3. `map/` ディレクトリを作る

README で示したレイアウトに合わせて、次のサブディレクトリをまとめて作成します。

```bash
mkdir -p map/{containers,data,layers,tools,webapp}
```

以降、すべて `map/` 配下にファイルを作っていきます。

---

## 4. ファイルを用意する

### 4.1 `map/webapp/shelters.html`

エントリポイントとなる HTML です。主なポイントは以下の通りです。

- `<div id="mapcanvas" data-src="../containers/Containers.svg">` として、`containers/` 配下の SVG を読み込む
- チュートリアル素材のピン画像を参照する際は `../../tutorials/...` の相対パスを使用
- JavaScript では `layerDefinitions` を介してベース・避難所・気象・土砂レイヤーの表示状態を切り替える
- `updateSpotCount()` / `fetchWeatherStations()` で `../layers/` や `../data/` を参照する

ファイル全体はリポジトリの `map/webapp/shelters.html` をコピーすれば OK です。相対パスが 1 か所でもズレると読み込みに失敗するので、パス部分だけは特に注意してください。

### 4.2 `map/containers/Containers.svg`

レイヤー構成のマスタです。

- 国土地理院タイルを `../../svgMapAppLayers/basemaps/...` から読み込む
- 避難所レイヤー `../layers/base_okayama.svg`
- 気象レイヤー `../layers/hazard_flood_okayama.svg`
- 土砂災害レイヤー（サンプル） `../layers/hazard_landslide_okayama.svg`

SVGMap の `<animation>` 要素でそれぞれを参照し、`id`（`layer-spots` など）が Web アプリ側のトグル ID と一致するようにします。

### 4.3 `map/layers/`

| ファイル | 役割 | 生成元 |
|----------|------|--------|
| `base_okayama.svg` | 避難所ピン（現在は観光スポットのサンプル） | `map/tools/generate_spots.py` |
| `hazard_flood_okayama.svg` | 気象オーバーレイ | `map/tools/generate_weather_layer.py` |
| `hazard_landslide_okayama.svg` | 土砂災害のサンプル塗りつぶし | 手書き（必要なら実データに差し替え） |

`base_okayama.svg` と `hazard_flood_okayama.svg` はスクリプトで再生成できるようにしておくと後が楽です。

### 4.4 `map/data/`

- `shelters_okayama.csv`  
  `name,kind,lon,lat,url,summary` を持つ CSV。`generate_spots.py` の入力になります。
- `weather_points.csv`  
  気象 API を叩く座標リスト。列は `name,lon,lat`。

### 4.5 `map/tools/*.py`

それぞれの要点は次の通りです。ソースはリポジトリを参照してください。

| スクリプト | 主な処理 |
|------------|----------|
| `generate_spots.py` | `data/shelters_okayama.csv` を読み込み、`layers/base_okayama.svg` を生成。`../../tutorials/tutorial1/img/...` のピン画像を参照。 |
| `add_spot.py` | CSV に 1 レコード追加した後、`generate_spots.py` を呼び出す。 |
| `generate_weather_layer.py` | Open-Meteo API から現在の天気を取得し、`layers/hazard_flood_okayama.svg` を生成。 |

---

## 5. 実行して確認

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/map/webapp/shelters.html` を開き、以下を確認します。

- ベースマップが表示される
- 避難所ピンおよび気象バブルが描画される
- トグルで表示／非表示が切り替えられる

---

## 6. データ更新フロー

### 6.1 避難所（スポット）の更新

```bash
# CSV を直接編集する場合
vim map/data/shelters_okayama.csv
python3 map/tools/generate_spots.py

# CLI で追加する場合
python3 map/tools/add_spot.py \
  --name "新しい避難所" \
  --kind castle \
  --lon 133.9 \
  --lat 34.6 \
  --url "https://example.com" \
  --summary "説明,補足"
```

### 6.2 気象レイヤーの更新

```bash
python3 map/tools/generate_weather_layer.py
```

`map/data/weather_points.csv` を編集すると、監視地点を切り替えられます。ネットワークに制限がある場合は、VPN やプロキシ設定を確認しつつ数回リトライしてください。

---

## 7. 追加カスタマイズ例

- `map/layers/hazard_landslide_okayama.svg` を実データに差し替える（GeoJSON → SVG 変換など）
- `map/webapp/shelters.html` に新しい UI コンポーネントを追加して Next.js へ移植
- `generate_weather_layer.py` に 1 時間ごとの予報や降雨量などを追加
- `Containers.svg` の `viewBox` を調整して別エリアのマップに転用

---

これで README の構成と完全に一致した `map/` ディレクトリを自分の環境に再現できます。
