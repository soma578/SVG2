# SVGMap 学習プロジェクト（岡山防災マップ）

岡山の避難所・気象レイヤーを **SVGMap** で重ね合わせるための最小手順と、ハマりやすいポイントをまとめました。  
すでにリポジトリが手元にあり、`svgMapAppLayers` やチュートリアル素材も配置済みであることを想定しています。

---

## ゴール
- 国土地理院タイルをベースに、岡山県内の避難所レイヤーを表示する
- 気象オーバーレイ（Open-Meteo）を重ねて現在の状況を確認する
- ローカルサーバ（単一オリジン）で `map/webapp/shelters.html` を開いて動作確認する

---

## 前提
- **WSL / Linux / macOS** など POSIX 系端末
  - Windows PowerShell での `wget` は別物なので、必要なら `wsl wget` や `wget.exe` を利用
- **Python 3**（`python3 -m http.server` で手軽に配信）
- **大文字小文字をそのまま維持**  
  例: `svgMapAppLayers`, `map/containers/Containers.svg`。1 文字違うだけで読み込めなくなる

---

## 既存ディレクトリ構成
作業ルート（例: `/home/nogami/workspace_for_wsl/SVG`）は次のようになっています。

```
SVG/
├── docs/
├── map/
│   ├── containers/Containers.svg
│   ├── data/
│   │   ├── shelters_okayama.csv
│   │   └── weather_points.csv
│   ├── layers/
│   │   ├── base_okayama.svg
│   │   ├── hazard_flood_okayama.svg
│   │   └── hazard_landslide_okayama.svg
│   ├── tools/
│   │   ├── add_spot.py
│   │   ├── generate_spots.py
│   │   └── generate_weather_layer.py
│   └── webapp/shelters.html
├── svgMapAppLayers/          # 公式レイヤー集
└── tutorials/                # ピン画像などの素材
```

> `map/` 配下の構成が README に記載されたレイアウトと一致しています。  
> `svgMapAppLayers` および `tutorials/tutorial1/` のファイルを参照するため、削除しないでください。

---

## クイックスタート
1. **ルートでサーバ起動**
   ```bash
   cd /home/nogami/workspace_for_wsl/SVG
   python3 -m http.server 8080
   ```

2. **ブラウザでアクセス**
   - 岡山防災マップ: `http://localhost:8080/map/webapp/shelters.html`
   - チュートリアル素材確認用: `http://localhost:8080/tutorials/tutorial1/`

3. **表示確認**
   ベースマップ・避難所ピン・天気バブルが表示され、ピンをクリックすると詳細リンクが開けば成功です。

---

## 主要ファイル
- `map/webapp/shelters.html`  
  SVGMap 本体を読み込み、`../containers/Containers.svg` を `data-src` として描画するエントリポイント。
- `map/containers/Containers.svg`  
  ベース／避難所／気象／土砂（サンプル）レイヤーを束ねるマスター定義。
- `map/layers/base_okayama.svg`  
  避難所ピンの SVG。`generate_spots.py` で CSV から生成します。
- `map/layers/hazard_flood_okayama.svg`  
  気象オーバーレイ。`generate_weather_layer.py` で Open-Meteo から生成。
- `map/layers/hazard_landslide_okayama.svg`  
  土砂災害レイヤーのサンプル。将来は本物のハザードポリゴンに差し替えます。
- `map/data/shelters_okayama.csv`  
  避難所（サンプルデータ）の一覧。`generate_spots.py` の入力。
- `map/data/weather_points.csv`  
  気象情報を取得したい地点の緯度経度リスト。
- `map/tools/*.py`  
  CSV から SVG を生成したり、レコードを追加する補助ツール群。

---

## ハマりやすいポイント
- **参照パスは相対パスに統一**  
  `Containers.svg` や `base_okayama.svg` では `../` や `../../` を使い、リポジトリ内で完結させています。ルート (`/`) 始まりに戻すとローカル配信時に 404 になります。
- **ブラウザキャッシュ**  
  SVG を差し替えても表示が変わらない場合はシークレットウィンドウ or `Ctrl+F5`（macOS は `Cmd+Shift+R`）で強制リロード。
- **座標の向き**  
  `globalCoordinateSystem` で Y 軸が反転されています。`map/tools/generate_spots.py` では `transform="ref(svg,lon,lat)"` を使うので、自前で極座標変換する必要はありません。

---

## CSV を編集して SVG を再生成
1. **CSV 編集**  
   `map/data/shelters_okayama.csv` に行を追加 or 既存行を編集します。  
   - `lon / lat` は 10 進数（EPSG:4326）  
   - `kind` は `castle / garden / tourist / shrine / bridge` のいずれか（アイコン切替に使用）  
   - `summary` はカンマ区切りで複数記述可能。カード表示に使用
2. **SVG 再生成**
   ```bash
   cd /home/nogami/workspace_for_wsl/SVG
   python3 map/tools/generate_spots.py
   ```
   成功すると `map/layers/base_okayama.svg` が上書きされます。
3. **ブラウザを更新**  
   `shelters.html` をリロードすれば新しいピンが表示されます。

---

## CLI で避難所を追加
`add_spot.py` を使うと CSV と SVG をまとめて更新できます。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 map/tools/add_spot.py \
  --name "牛窓オリーブ園" \
  --kind tourist \
  --lon 134.1558 \
  --lat 34.6426 \
  --url "https://ja.wikipedia.org/wiki/%E7%89%9B%E7%AA%93%E3%82%AA%E3%83%AA%E3%83%BC%E3%83%96%E5%9C%92" \
  --summary "瀬戸内海ビュー,オリーブ畑"
```

`--no-generate` を付けない限り、最後に `generate_spots.py` が呼び出され、`map/layers/base_okayama.svg` が自動更新されます。

---

## 気象レイヤーを更新
`generate_weather_layer.py` は [Open-Meteo](https://open-meteo.com/) API から現在の気象を取得し、`map/layers/hazard_flood_okayama.svg` を更新します。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 map/tools/generate_weather_layer.py
```

- 取得地点は `map/data/weather_points.csv` を編集
- ネットワーク環境によっては失敗するので、その際は時間をおいて再実行
- API キー不要ですが、HTTP アクセスを行うためプロキシ／VPN 制限に注意

---

## 自主トレメニュー
- `summary` を充実させてカード内容を改善する
- `ICON_DEFS` にアイコンを追加してピン種類を増やす
- `hazard_landslide_okayama.svg` を本物のハザードポリゴンに差し替える
- `Containers.svg` の `viewBox` を調整し、表示範囲を任意の地域に合わせる
- `generate_weather_layer.py` に降雨量や風速など他の指標を追加する

---

## ライセンス
学習用サンプルです。`svgMapAppLayers` や参照タイルレイヤーのライセンスはそれぞれのリポジトリ・提供元に従ってください。
