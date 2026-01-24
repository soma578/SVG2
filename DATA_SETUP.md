# データセットアップガイド

このプロジェクトでは、地理データや標高データなど、容量の大きいデータファイルを使用します。これらのファイルは Git リポジトリには含まれていないため、別途ダウンロードする必要があります。

## クイックスタート

### 方法1: データアーカイブを使用（推奨）

配布されたデータアーカイブがある場合:

```bash
# 1. 環境構築
./setup.sh

# 2. データアーカイブを展開
./scripts/extract_data.sh data_archive/*.tar.gz

# 3. アプリケーション起動
cd frontend
npm run dev
```

### 方法2: データなしで起動

最小限のセットアップでアプリケーションを起動する場合:

```bash
# 1. 環境構築
./setup.sh

# 2. アプリケーション起動
cd frontend
npm run dev
```

ブラウザで http://localhost:3000 にアクセスしてください。

**注意**: データファイルがない状態でも基本的なUIは動作しますが、地図表示や一部の機能は正しく動作しません。完全に機能させるには、データアーカイブを展開するか、以下の方法でデータファイルをダウンロードしてください。

## 必要なデータファイル

### 1. DEM（数値標高モデル）データ

以下の DEM ファイルが必要です。これらは国土地理院の基盤地図情報からダウンロードできます。

**ダウンロード元**: [国土地理院 基盤地図情報ダウンロードサービス](https://fgd.gsi.go.jp/download/menu.php)

必要なメッシュコード:
- FG-GML-513366-DEM1A-20250908.zip
- FG-GML-513367-DEM1A-20250908.zip
- FG-GML-513376-DEM1A-20250908.zip
- FG-GML-513377-DEM1A-20250908.zip
- FG-GML-513460-DEM1A-20250908.zip
- FG-GML-513470-DEM1A-20250908.zip
- FG-GML-523305-DEM1A-20250908.zip
- FG-GML-523306-DEM1A-20250908.zip
- FG-GML-523307-DEM1A-20250908.zip
- FG-GML-523315-DEM1A-20250908.zip
- FG-GML-523316-DEM1A-20250908.zip
- FG-GML-523317-DEM1A-20250908.zip
- FG-GML-523326-DEM1A-20250908.zip
- FG-GML-523327-DEM1A-20250908.zip
- FG-GML-523336-DEM1A-20250908.zip
- FG-GML-523337-DEM1A-20250908.zip
- FG-GML-523400-DEM1A-20250908.zip
- FG-GML-523410-DEM1A-20250908.zip

**配置先**: `data/` ディレクトリ直下

### 2. 地理データ（国土数値情報、国勢調査など）

以下のデータセットをダウンロードしてください。

**国土数値情報ダウンロードサービス**: https://nlftp.mlit.go.jp/ksj/

#### 必要なデータセット:

1. **洪水浸水想定区域データ (A33-22_33)**
   - ファイル: A33-22_33.xml, A33-22_33Polygon.geojson
   - 配置先: `data/raw/`

2. **行政区域データ (N03-20240101_33)**
   - ファイル形式: Shapefile (.shp, .dbf, .prj, .shx)
   - 配置先: `data/raw/`

3. **学校データ (P04-20_33)**
   - ファイル形式: Shapefile
   - 配置先: `data/raw/`

4. **医療機関データ (P04-12_33)**
   - 配置先: `data/raw/`

5. **消防署データ (P17-12_33)**
   - ファイル形式: Shapefile
   - 配置先: `data/raw/`

6. **警察署データ (P20-12_33)**
   - ファイル形式: Shapefile
   - 配置先: `data/raw/`

7. **指定緊急避難場所データ (P29-21_33)**
   - ファイル形式: Shapefile
   - 配置先: `data/raw/`

8. **河川データ (W05-08_33-g)**
   - ファイル形式: Shapefile
   - 配置先: `data/raw/`

## ディレクトリ構造

データファイルを配置後、以下のようなディレクトリ構造になります:

```
data/
├── README.md
├── FG-GML-*.zip (18 ファイル)
├── fmdid23-3501.xml
├── fmdid25-3501.xml
├── okayama_city_fallback.json
├── okayama_district_dict.json
├── okayama_n03_dict.json
├── okayama_n03_index.csv
├── second_project.md
├── okayama_clip/
│   └── okayama_city.geojson
└── raw/
    ├── A33-22_33.xml
    ├── A33-22_33Polygon.geojson
    ├── N03-20240101_33.*
    ├── P04-20_33.*
    ├── P17-12_33_*.*
    ├── P20-12_33.*
    ├── P29-21_33.*
    ├── W05-08_33-g_*.*
    └── Shape/
        └── A33-22_33Polygon.*
```

## セットアップ手順

1. 上記のデータソースから必要なファイルをダウンロード
2. ダウンロードしたファイルを対応するディレクトリに配置
3. 環境構築スクリプトを実行: `./setup.sh`

## 注意事項

- データファイルの合計サイズは約 2.2GB になります
- ダウンロードには時間がかかる場合があります
- 国土地理院や国土数値情報のデータは利用規約を確認してください

## 地図タイル・レイヤーについて

### ベースタイル

アプリケーションは国土地理院のタイルを外部から直接読み込みます。ダウンロード不要です。

- デフォルト: 国土地理院 淡色地図
- URL: `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`

環境変数 `NEXT_PUBLIC_TILE_BASE_URL` で変更可能です。

### 傾斜レイヤー（オプション）

傾斜データ（3.7GB）は Git に含まれていません。以下のスクリプトで生成できます：

```bash
# Python環境が必要
source venv/bin/activate
cd map/tools
python make_slope_okayama.py
```

このスクリプトは：
- 国土地理院のDEMタイルをダウンロード
- 傾斜角度を計算
- ラスター/ベクタータイルを生成（`map/layers/_build/slope/` に出力）

生成には時間がかかります（数時間程度）。

## データアーカイブの作成（開発者向け）

このプロジェクトを他の環境に配布する場合、データをアーカイブできます：

```bash
./scripts/package_data.sh
```

これにより、以下の3つのアーカイブが `data_archive/` ディレクトリに作成されます：

1. `svg2_data_dem_YYYYMMDD_HHMMSS.tar.gz` - DEMデータ（約2GB）
2. `svg2_data_raw_YYYYMMDD_HHMMSS.tar.gz` - 地理データ（約500MB）
3. `svg2_map_layers_YYYYMMDD_HHMMSS.tar.gz` - 地図レイヤー（約3.2GB）

これらのファイルを配布すれば、受け取った人は `./scripts/extract_data.sh` で簡単に展開できます。

## トラブルシューティング

### データが見つからない場合

プロジェクトの一部機能は、データファイルがなくても動作する可能性があります。エラーが発生した場合は、必要なデータファイルを確認してください。

### データの更新

データセットは定期的に更新されます。最新版が必要な場合は、上記のダウンロード元から最新のファイルを取得してください。
