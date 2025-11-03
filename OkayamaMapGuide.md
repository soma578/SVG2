# SVGMap 学習プロジェクト（岡山県観光マップ）

岡山県観光マップを **SVGMap** で動かすための最小手順と、よくあるハマりどころをまとめました。  
既にプロジェクト構造とファイルが揃っている前提で説明します。

---

## ゴール
- 国土地理院ベースマップを背景に、岡山県内の観光スポットをピン表示
- ピンをクリックして Wikipedia ページを開く
- ローカルサーバ（単一オリジン）で動作確認

---

## 前提
- **WSL (Ubuntu など)** あるいは **Windows 版 GNU wget**
  - PowerShell の `wget` は別物なので使用しないのが無難。
- **Python 3**（`python3 -m http.server` を使用）
- Linux/WSL では **大文字小文字が厳密**。`svgMapAppLayers`（M/A が大文字）などの綴りに注意。

---

## 既存ディレクトリ構成
プロジェクトのルート（例：`/home/nogami/workspace_for_wsl/SVG`）は次のようになっています。

```
SVG/
├── svgMapAppLayers/   # 国土地理院などの共通レイヤー群
├── tutorial1/         # チュートリアル素材（ピン画像など）
└── okayama-map/       # 岡山県観光マップ
```

> 既に各ディレクトリが揃っているため、追加で作成・ダウンロードする必要はありません。

---

## クイックスタート
1. **ルートでサーバを起動**  
   ```bash
   cd /home/nogami/workspace_for_wsl/SVG
   python3 -m http.server 8080
   ```

2. **ブラウザでアクセス**  
   - 岡山マップ: `http://localhost:8080/okayama-map/`
   - チュートリアル素材: `http://localhost:8080/tutorial1/svgmap.org/devinfo/devkddi/tutorials/tutorial1/tutorial1.html`

3. **表示確認**  
   背景地図とピンが表示され、ピンをクリックすると Wikipedia が開けば成功です。

---

## 主要ファイル（編集するときの目印）
- `okayama-map/index.html`  
  SVGMap 本体を読み込み、`Container.svg` を描画します。
- `okayama-map/Container.svg`  
  ベースマップと観光スポットレイヤーを束ねる設定ファイル。
- `okayama-map/data/okayama_spots.csv`  
  観光スポットの一覧データ。名前・種別・緯度経度・リンクをここで管理します。
- `okayama-map/tools/generate_spots.py`  
  CSV から `okayama-spots.svg` を生成するスクリプト。
- `okayama-map/okayama-spots.svg`  
  スクリプトの出力先。ブラウザで読まれる最終的な SVG です（手動ではなくスクリプトで更新）。
- `okayama-map/tools/add_spot.py`  
  コマンドラインからスポットを追加し、CSV と SVG をまとめて更新する補助スクリプト。
- `okayama-map/data/weather_points.csv`  
  気象情報を取得したい地点の一覧。
- `okayama-map/tools/generate_weather_layer.py`  
  Open-Meteo から現在の気象データを取得し、`weather.svg` を生成するスクリプト。
- `okayama-map/weather.svg`  
  気象オーバーレイの SVG。生成スクリプトが更新します。

各ファイルは既に配置済みなので、内容を調整したい場合のみ編集してください。

---

## ハマりやすいポイント
- **PowerShell の `wget` を使わない**  
  必要があれば `wsl wget ...` もしくは `wget.exe` を利用してください。
- **パスは絶対パスで統一**  
  `Container.svg` や `okayama-spots.svg` に記述されている参照パスは  
  `/svgMapAppLayers/...` や `/tutorial1/...` のようにルート始まりで揃えます。
- **ブラウザキャッシュに注意**  
  変更が反映されない場合はプライベートウィンドウや `Ctrl+F5`（Mac は `Cmd+Shift+R`）で強制再読込。
- **座標調整**  
  `Container.svg` の `viewBox="133 34 2 2"` が表示範囲です。ズレが気になる場合はここを調整します。

---

## CSV 更新 → SVG 自動生成フロー
1. **CSV を編集**  
   `okayama-map/data/okayama_spots.csv` を開き、必要な行を追加・修正。  
   - `lon` は経度（10進数）、`lat` は緯度。  
   - `kind` は `castle / garden / tourist / shrine / bridge` のいずれか。  
   - `summary` にはピン説明（カンマ区切りで複数書いて OK）。
2. **SVG を再生成**  
   ```bash
   cd /home/nogami/workspace_for_wsl/SVG
   python3 okayama-map/tools/generate_spots.py
   ```
   実行すると `okayama-map/okayama-spots.svg` が上書きされ、最新データが反映されます。
3. **ブラウザを再読み込み**  
   既にサーバが起動している場合はページをリロード（キャッシュが残る場合は `Ctrl+F5`）。

---

## CLI でピンを追加する
コマンドラインからスポットを追加入力できます。`generate_spots.py` が自動実行されるので、ブラウザを更新するだけで反映されます。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 okayama-map/tools/add_spot.py \
  --name "牛窓オリーブ園" \
  --kind tourist \
  --lon 134.1558 \
  --lat 34.6426 \
  --url "https://ja.wikipedia.org/wiki/%E7%89%9B%E7%AA%93%E3%82%AA%E3%83%AA%E3%83%BC%E3%83%96%E5%9C%92" \
  --summary "瀬戸内海ビュー,オリーブ畑"
```

> `--kind` で指定可能な値は `castle / garden / tourist / shrine / bridge` です。別アイコンを使いたい場合は `generate_spots.py` の `ICON_DEFS` に定義を追加してください。

---

## 気象レイヤーを更新する
`generate_weather_layer.py` は [Open-Meteo](https://open-meteo.com/) API から現在の気象を取得し、`weather.svg` を生成します（APIキー不要）。  
ネットワーク環境によっては取得に失敗することがあるので、その際は時間をおいて再実行してください。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 okayama-map/tools/generate_weather_layer.py
```

- 取得地点を変えたい場合は `okayama-map/data/weather_points.csv` を編集します。
- 取得に失敗すると警告が表示され、`--°C / 取得エラー` として表示されます。
- スクリプトはネットワークアクセスを行うため、接続が制限されている環境では数回試すか、VPN/プロキシ設定を確認してください。

---

## 自主トレメニュー
- `summary` を書き換えて説明文を充実させてみる。
- 新しいスポットを CSV に追加し、ピン表示を確認する。
- `kind` に合わせてアイコンを変える（必要なら `ICON_DEFS` に追加）。
- 表示したいエリアに合わせて `Container.svg` の `viewBox` を調整する。
- `add_spot.py` をラップする簡易 GUI やシェルスクリプトを作ってみる。
- `generate_weather_layer.py` に 1 時間ごとの予報や雨量など好きなデータを組み込む。

---

## ライセンス
学習目的のプロジェクトです。`svgMapAppLayers` のライセンスについては [公式リポジトリ](https://github.com/svgmap/svgMapAppLayers) を参照してください。
