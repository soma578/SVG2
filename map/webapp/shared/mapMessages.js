/**
 * レイヤーメッセージバス契約
 * ============================
 * 配送モデル: current-map.html の broadcastToLayers() が「自 window + 全 iframe +
 * 全 layer controller window」へ同一メッセージをブロードキャストする。
 * 宛先指定は存在しない。受信側 (各レイヤー HTML / React useRuntimeBridge) は
 * `event.data.type` を見て自分宛てでないメッセージを黙って無視する責務を持つ。
 *
 * 命名規約:
 *   runtime:*  レイヤー → ホスト/React 方向の通知
 *   map:*      ホスト → レイヤー方向の指示
 *   <layer>:*  特定レイヤー固有のライフサイクル通知
 *
 * デバッグ: 地図URLに ?debugBus=1 (または localStorage.svgmapDebugBus=1) で
 * current-map が全配送を console に出す。
 *
 * 新メッセージ追加時はここに定数を足すこと (文字列リテラル直書き禁止)。
 */
export const MAP_MESSAGES = Object.freeze({
  runtimeReady: 'runtime:ready',
  runtimeDataStatus: 'runtime:dataStatus',
  runtimeFeatureDetail: 'runtime:featureDetail',
  runtimeFeatureSelect: 'runtime:featureSelect',
  runtimePoiLayerRendered: 'runtime:poiLayerRendered',
  runtimeLayerReady: 'runtime:layerReady',

  mapSetViewport: 'map:setViewport',
  mapZoom: 'map:zoom',
  mapResetView: 'map:resetView',
  mapSetCurrentLocation: 'map:setCurrentLocation',
  mapFocusLocation: 'map:focusLocation',
  mapSetLayerVisible: 'map:setLayerVisible',
  mapImportLayers: 'map:importLayers',
  mapRemoveLayer: 'map:removeLayer',
  runtimeSetLayerVisibility: 'runtime:setLayerVisibility',
  mapLayerVisibilityChanged: 'map:layerVisibilityChanged',
  mapSetInteractionMode: 'map:setInteractionMode',
  mapInteractionModeChanged: 'map:interactionModeChanged',
  mapSetDataUrl: 'map:setDataUrl',
  mapSetLayerConfig: 'map:setLayerConfig',
  mapSetMunicipalityFilter: 'map:setMunicipalityFilter',
  mapShowEvacuationFeature: 'map:showEvacuationFeature',
  mapShowTeamActivityFeature: 'map:showTeamActivityFeature',

  teamActivityLayerReady: 'teamActivityLayer:ready',
});
