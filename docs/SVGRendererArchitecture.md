# SVGレンダラー移行レポート

## 1. 概要 ─ React Leafletから自前SVGレンダラーへ

旧アーキテクチャでは `react-leaflet` + Leaflet.js が GeoJSON の描画、タイル取得、ズーム制御を一手に担っていた。しかし Leaflet DOM と独自UIが干渉しやすく、SVGを直接操作する自由度も低く、新しいレイヤーを追加するたびに Leaflet のマーカーやプラグイン設定が必要になるという課題があった。  

これを解決するために `frontend/src/components/map/MapCanvas.tsx` を中心に「投影・描画・UI」を純粋な React + SVG/HTML だけで構築した。結果として以下の効果がある。

1. **描画ロジックの透明化**：GeoJSON → SVG `<path>` 変換をすべて自前の関数で行うため、どのレイヤーでも共通の仕組みで描画できる。
2. **UIとの分離**：LayerPanel / InfoPanel / MapControls は Next.js のコンポーネントとして独立し、Leaflet DOM に依存しない。ブラウザズーム時も安定。
3. **ブラウザズーム耐性**：SVG と HTML オーバーレイを組み合わせ、ピンは絶対配置の `<Image>`/`<button>` で描画。ブラウザ拡大（Ctrl + ±）でもピンの大きさが変わらない。

> （図①挿入予定：Leaflet版と自前SVG版の構成比較）

---

## 2. 投影・描画の仕組み

ファイル: `frontend/src/components/map/MapCanvas.tsx`

| 役割 | 関数 / ステート | 説明 |
|------|----------------|------|
| 緯度経度 → Webメルカトル | `projectLatLonToWorld(lat, lon, zoom)` (行39-46) | Leaflet内部と同じ式で世界座標へ変換。ズーム値に応じたタイル座標も算出できる。 |
| Webメルカトル → 緯度経度 | `unprojectWorldToLatLon(x, y, zoom)` (行48-54) | ドラッグ量を緯度経度へ戻すために使用。 |
| サイズ監視 | `useContainerSize` (行111-129) | `ResizeObserver` で描画領域の幅と高さを監視。ズーム時の中心計算に利用。 |
| GeoJSON → SVG | `polygonToPath`, `lineToPath`, `geometryPoints` (行63-109) | 各GeoJSONジオメトリをSVG命令 (`M/L/Z`) やスクリーン座標に変換。 |
| FeatureCollection展開 | `polygonPaths`, `linePaths`, `pointCircles` (行378-422) | GeoJSON全体をReact描画用に整形（`{ key, d }`, `{ key, point }`など）。 |
| ズーム・パン | `center`, `zoom`, `pointerState`, `handlePointerDown/Move/Up`, `handleWheel` (行186-223) | Leafletの`map.setView`と同等の挙動をReact stateで再現。 |
| ズームUI | `MapControls` (行130-163) | ズーム / 現在地ボタンを自作。`setZoom` / `setCenter` を直接操作。 |
| ツールチップ | `tooltip`, `showTooltip`, `hideTooltip` (行172-174, 336-376, 578-657) | ピンにマウスオーバーした際の名称表示。 |

> （図②挿入予定：緯度経度 → Webメルカトル → SVG 命令への変換フロー）

---

## 3. データソース別フロー

| データ種別 | 元データ | 変換・取得フロー | MapCanvasでの扱い |
|------------|----------|------------------|-------------------|
| 観光スポット (CSV) | `map/data/shelters_okayama.csv` | `/api/shelters` が `iconv-lite` で文字コード判定 → JSON化 | `fetch('/api/shelters')` → `projectedShelters` → HTMLピン (`<Image>`) |
| 土砂災害 (GeoJSON) | `frontend/public/okayama_landslide.geojson` | `fetch()` → `polygonPaths` → `<path>` | 塗り潰しポリゴン（stroke/fill） |
| 河川 (GeoJSON) | `frontend/public/okayama_rivers.geojson` | 同上 | ライン表示（strokeのみ） |
| 避難施設 / 消防署 / 医療 / 学校 (GeoJSON) | `frontend/public/okayama_*.geojson` | `pointCircles` + `layerPinIcons` + `getFeatureLabel` | HTMLピン + ツールチップ |
| 気象サンプル (JSON) | `weatherData` 定数 | `projectedWeather` → `WeatherBadge` | HTMLバッジ |

> （図③挿入予定：CSV/GeoJSON/気象データの取得～描画シーケンス）

---

## 4. UIとの分離と拡張性

### LayerPanel / InfoPanel / MapControls

- `LayerPanel` (`frontend/src/components/map/LayerPanel.tsx`) は MapPage の `activeLayers` state を受け取るだけ。Leafletに依存せず、チェックボックスを増やすだけでレイヤーが増える。
- `InfoPanel` (`frontend/src/components/map/InfoPanel.tsx`) は `onShelterClick` で渡された `Shelter` 情報を表示。Leafletの Popup ではなく、独立した React コンポーネント。
- `MapControls` は Leaflet の zoomControl を模した自作コンポーネント。`onZoomIn/out` が `setZoom`、`onLocate` が `navigator.geolocation` → `setCenter` を呼ぶ。

### ピン描画

- 観光スポット: Next.js `<Image>` で PNG ピンを描画（`projectedShelters` の結果を絶対配置）。
- 国土数値情報レイヤー: `layerPinIcons` でレイヤー別アイコンを定義し、`pointCircles` の座標に `<button>` + `<Image>` を配置。`getFeatureLabel` に属性キー配列を渡せるため、異なるGeoJSONでも共通ロジックを再利用。
- SVGベースレイヤー（河川・土砂）は `<path>` を採用。SVGの塗りや透明度を React プロパティで直接管理できる。

> （図④挿入予定：LayerPanel/MapCanvas/InfoPanelの関係図）

拡張時のステップ（例: 新GeoJSONレイヤー追加）:
1. `frontend/public/` に GeoJSON を配置。
2. MapCanvas の fetch ブロックを追加し state に保持。
3. `activeLayers` と `LayerPanel` へチェックボックスを追加。
4. `polygonPaths`/`linePaths`/`pointCircles` と描画 JSX を追加。
5. 必要であれば `layerPinIcons` / `getFeatureLabel` に設定を追加。

CSVベースのレイヤーも `/app/api/` にエンドポイントを追加し、MapCanvas から fetch すれば同様に描画できる。

---

## 5. 運用メモ（データ更新～レイヤー追加）

### GeoJSON生成（GDAL/ogr2ogr）

1. 国土数値情報（Shapefile）をダウンロードし `data/raw/` へ配置。
2. 例：土砂災害（A33）  
   ```bash
   unzip -d data/raw data/raw/A33_*.zip
   ogr2ogr -t_srs EPSG:3857 data/raw/A33_3857.gpkg data/raw/A33*/A33-*.shp
   ogr2ogr -clipsrc data/okaya_clip/okayama_city_3857.gpkg \
     out/geojson/okayama_landslide.geojson data/raw/A33_3857.gpkg
   cp out/geojson/okayama_landslide.geojson frontend/public/
   ```
3. MapCanvas の fetch 対象に追加すれば描画される。

### CSV更新

- `map/data/shelters_okayama.csv` を編集（Shift-JIS でも可）。エンドポイント `/api/shelters` が文字コード自動判定。  
- 新しいカラムを追加した場合は `frontend/src/types/index.ts` の `Shelter` 型、および InfoPanel の表示部分を更新。

### 新レイヤー追加のテンプレ

1. データ取得 → GeoJSON化（上記手順）  
2. `frontend/public/` へ配置  
3. MapCanvas で fetch・state 追加  
4. `LayerPanel` にトグル追加  
5. `polygonPaths` or `pointCircles` で描画ロジック追加  
6. 必要に応じて `getFeatureLabel` / `layerPinIcons` を拡張

> （図⑤挿入予定：GDAL処理からNext.js配信までの運用フロー）

---

このレポートを土台にすれば、初めて触れるメンバーでも「GeoJSON/CSV をどう前処理し、MapCanvas がどの関数で SVG に描いているか」「UIはどこで制御しているか」を理解できる。Leafletへの依存解除により、Reactの状態管理とSVG/HTML描画だけで地図表現を完結できる点が最大の特徴である。***
