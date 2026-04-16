# shelters.html 関数リファレンス（v0.2）

`map/webapp/shelters.html` は SVGMap のレンダラとして動作し、親UIとは `runtime:*` プロトコルで連携します。

## 共通状態
- `layerDefinitions`: `baseArea / evacuation / teamActivity` を主要業務レイヤーとして持ち、`tourism / momochari / welfare / weather / slope / landslide` を補助レイヤーとして定義。
- `layerState`: 各レイヤーの可視状態。
- `layerOpacityState`: 各レイヤーの不透明度。
- `weatherState`: weather adapter のロード状態と `refreshTimerId`。
- `runtimeInitFailed`: 初期化失敗フラグ。`runtime:error` を返す条件に利用。

## Runtime Config
- `loadRuntimeConfig()`: `runtime-config.json` を読み込み検証。
- `getRuntimeConfig()`: 読み込み済み設定を返す。
- `getWeatherSourceConfig()`: weather の `dynamicSource`（`dataUrl/refreshIntervalSec`）を返す。

## Runtime Event/Command
- `notifyReady()`: `runtime:ready` を送信。
- `notifyRuntimeError(message)`: `runtime:error` を送信。
- `notifyViewChange()`: `runtime:viewChange` を送信。
- `emitSpotPayload(payload)`: `runtime:featureSelect` を送信（MapFeatureProperties 準拠）。
- `handleParentMessage(event)`: `runtime:setView / setLayers / setOpacity / zoomIn / zoomOut / locate / statusRequest` を処理。

## レイヤー制御
- `setLayerVisibility(svgImage, layerKey, visible)`: レイヤーの表示切替。
- `setLayerOpacity(svgImage, layerKey, opacity)`: レイヤーの透明度更新。
- `applyDefaultLayers(svgImage)`: runtime-config の初期表示を反映。

## Dynamic Adapter（weather）
- `weatherAdapter.load(source)`: `dynamicSource.dataUrl` から気象配列を取得。
- `weatherAdapter.mount(svgImage, entries)`: weather バブルを SVG に描画。
- `weatherAdapter.unmount(svgImage)`: weather レイヤーを除去。
- `weatherAdapter.refresh(svgImage)`: 再取得して再描画。
- `refreshDynamicLayer(svgImage, layerKey)`: 該当 adapter を呼び出す。
- `syncWeatherRefreshTimer()`: weather 表示状態と `refreshIntervalSec` に応じて自動更新 timer を開始/停止。

重要: Runtime は外部APIを直接呼ばず、`dataUrl` のみを読む。

## クリック関連
- `bindLayerInteractions(...)`: `<a>` クリックを `runtime:featureSelect` に変換。
- `queueInteractionBinding(...)`: 遅延ロードされた要素にも再バインド。

## 初期化フロー
1. `loadRuntimeConfig()` 実行  
2. 失敗時: `runtimeInitFailed=true` + `runtime:error` 送信（`runtime:ready` は送らない）  
3. SVG読込完了後に初期レイヤ適用  
4. `runtime:ready` と `runtime:viewChange` を送信
