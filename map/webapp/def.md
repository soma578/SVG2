# shelters.html 関数リファレンス

`map/webapp/shelters.html` 内で定義している主な関数と役割のメモ。SVGMapの描画に依存する処理と、UI制御／データ取得の分担が分かるように整理しています。

## 共通の定数・状態
- `SVG_NS` / `XLINK_NS`: 正しい名前空間で要素を生成・参照するための定数。
- `weatherLabels`: Open-Meteoの`weathercode`を人間可読ラベルとアイコンに変換するための表。
- `layerDefinitions`: レイヤIDとチェックボックスIDの対応表。UIとSVGレイヤを1:1で結び付ける。
- `weatherState`: 気象レイヤのロード有無とロード中フラグ。

## 初期化・共通ヘルパ
- `suppressEssentialUI()`: SVGMap標準UIを無効化し、自前UIだけを使う。ロード直後に呼び、未ロードならポーリングで抑止。
- `waitForSvgImage()`: `svgMap.svgImage` が利用可能になるまで待つPromise。以降の処理はこの完了後に実行。
- `createSvgElement(svgImage, tagName)`: SVG要素を正しいNSで生成するヘルパ。
- `applyVisibility(el, visible)`: `visibility`/`display`/`style.display`をまとめて切り替える。

## レイヤ表示制御
- `setLayerVisibility(svgImage, layerId, visible)`: 指定レイヤの表示/非表示を切替。気象レイヤの場合、動的レイヤ(`live-weather-layer`)とスライダーの有効/無効も連動。
- `setLayerOpacity(svgImage, layerId, opacity)`: レイヤの不透明度を変更。気象レイヤは動的レイヤも合わせて変更。
- `collectLayerStats(svgImage)`: 各レイヤの可視・不透明度を集計し、UI側の表示用データを返す。
- `updateSummary(stats)`: サマリ表示（どのレイヤがONか）を更新。

## データ取得・加工
- `updateSpotCount()`: `base_okayama.svg` 内の避難所参照数を数えてUIに表示。
- `classifyWeather(code)`: Open-Meteoの`weathercode`をカテゴリに分類。
- `parseCsv(text)`: シンプルなCSVパーサ。`name/lon/lat` を持つレコード配列に変換。
- `fetchWeatherStations()`: `../data/weather_points.csv` を読み込んで測候点リストを返す。
- `fetchWeatherForStation(station)`: Open-Meteo APIから現在天気を取得（失敗時はnull）。
- `normalizeWeatherEntry(station, weather)`: 測候点＋天気データを表示用オブジェクト（ラベル/アイコン/温度）に整形。

## 気象レイヤ生成
- `createWeatherBubble(svgImage, entry)`: 測候点1件分の表示用SVGグループを生成。`ref(svg, lon, lat)`で配置。
- `buildWeatherLayer(svgImage, entries, visible)`: 既存の動的気象レイヤを削除し、新しく生成して配置。
- `refreshWeatherLayer(svgImage)`: 気象データ取得→動的レイヤ再生成。ロード中の多重実行を防ぎ、状態フラグとUIメッセージを更新。

## クリック挙動・UI初期化
- `setupSpotInteraction(svgImage)`: 避難所レイヤ内の`<a>`要素にクリックリスナを付与し、情報カードを表示する。
- `initializeControls(svgImage)`: チェックボックス初期化とイベント登録。不透明度スライダー設定、気象トグルON時の遅延ロードトリガーなど。

## エントリーポイント
- 即時実行関数 `(async () => { ... })()`:  
  1) SVG読み込み待ち → `initializeControls`/`setupSpotInteraction`/`updateSpotCount`  
  2) 気象レイヤは初期OFF（遅延ロード）。  
  3) サマリ表示更新。  

## 依存API
- `svgMap` (SVGMapコア): `svgImage`提供とズーム/GPSなどのAPI。
- Open-Meteo: 気象データ取得。  
- ブラウザ組み込みAPI: `fetch`, `requestAnimationFrame` など。
