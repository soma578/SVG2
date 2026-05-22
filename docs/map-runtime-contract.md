# Map Runtime Message Contract

This document lists the `postMessage` contract used by the React map UI, the
SVGMap runtime frame, and the layer-specific web apps.

The message names are defined in:

- `frontend/src/lib/mapMessages.ts`
- `map/webapp/shared/mapMessages.js`

Keep these files synchronized when adding or renaming a message.

## Frame Roles

- **React UI**: `frontend/src/app/map/page.tsx`
- **Runtime frame**: `map/webapp/current-map.html`
- **Layer web apps**:
  - `map/webapp/layers/evacuation/evacuationLayer.html`
  - `map/webapp/layers/team-activity/teamActivityLayer.html`

## React UI -> Runtime Frame

| Message | Purpose | Payload |
| --- | --- | --- |
| `map:setViewport` | Move the runtime map to a geographic viewport. | `{ viewport: { lat, lon, latSpan, lonSpan } }` |
| `map:zoom` | Zoom the current runtime viewport by a relative factor. | `{ factor }` |
| `map:resetView` | Reset to the selected municipality's initial viewport. | none |
| `map:setCurrentLocation` | Draw the current location marker. | `{ location: { lat, lon } }` |
| `map:focusLocation` | Move to a location and draw the current location marker. | `{ location: { lat, lon, latSpan, lonSpan } }` |
| `map:setLayerVisible` | Set a runtime layer's visibility. | `{ layerKey, visible }` |
| `map:setInteractionMode` | Set the interaction mode. | `{ interactionMode }` |

`runtime:setLayerVisibility` is accepted by the runtime frame for compatibility
with older UI chunks. New code should use `map:setLayerVisible`.

## Runtime Frame -> React UI

| Message | Purpose | Payload |
| --- | --- | --- |
| `runtime:ready` | Runtime initialization completed. | `{ engine, regionId, runtimeConfigUrl, initialViewport, layers }` |
| `runtime:dataStatus` | Report source/cache/fallback status for runtime data. | `{ key, label, source, url, online, updatedAt, message }` |
| `runtime:featureDetail` | Send a structured feature detail model to the React sidebar. | `{ detail: FeatureDetailModel }` |

`runtime:featureDetail` is the only detail path used by the map page. React does
not interpret `layerId`, `status`, `category`, or raw feature properties for
this message. Layer web apps build the display model, and React renders it as a
generic card.

### `FeatureDetailModel`

```ts
type FeatureDetailTone = 'blue' | 'green' | 'amber' | 'red' | 'gray'

type FeatureDetailModel = {
  id: string
  title: string
  subtitle?: string
  accent?: FeatureDetailTone
  badge?: { label: string; tone?: FeatureDetailTone }
  icon?: { src: string; alt?: string }
  rows?: Array<{ label: string; value: string }>
  sections?: Array<{
    title: string
    rows: Array<{ label: string; value: string }>
  }>
  actions?: Array<{ label: string; href: string }>
}
```

React validates that `id` and `title` exist before rendering. It also filters
dangerous action URL protocols such as `javascript:`, `data:`, `vbscript:`, and
`file:`.

## Runtime Frame -> Layer Web Apps

| Message | Purpose | Payload |
| --- | --- | --- |
| `map:layerVisibilityChanged` | Notify layers that visibility changed. | `{ layerKey, visible }` |
| `map:interactionModeChanged` | Notify layers that interaction mode changed. | `{ interactionMode }` |
| `map:setDataUrl` | Send the public data URL for a layer. | `{ layerId, url }` |
| `map:setLayerConfig` | Send layer-specific configuration. | `{ layerId, baseAreaLayerUrl, districtSvgUrlTemplate }` |
| `map:setMunicipalityFilter` | Limit layer data to selected municipality codes. | `{ municipalityCodes }` |
| `map:showEvacuationFeature` | Ask the evacuation layer to render feature detail. | `{ feature }` |
| `map:showTeamActivityFeature` | Ask the team activity layer to render feature detail. | `{ feature }` |

## Layer Web Apps -> Runtime Frame

| Message | Purpose | Payload |
| --- | --- | --- |
| `evacuationLayer:ready` | Evacuation layer is ready for configuration. | none |
| `evacuationLayer:dataReady` | Evacuation records are loaded. | none |
| `evacuationLayer:visibilityChanged` | Evacuation layer visibility changed. | `{ visible }` |
| `evacuation:hitTargets` | Evacuation marker hit-test targets. | `{ targets, zoom }` |
| `teamActivityLayer:ready` | Team activity layer is ready for configuration. | none |
| `teamActivity:hitTargets` | Team activity marker hit-test targets. | `{ targets, zoom, source, emittedAt }` |
| `teamActivity:areaTargets` | Area/polygon hit-test targets from team activity layer. | `{ targets, zoom, source, emittedAt }` |
| `runtime:dataStatus` | Layer data status update. | `{ payload: { key, label, source, url, online, updatedAt, message } }` |
| `runtime:featureDetail` | Layer-rendered structured feature detail. | `{ payload: { detail: FeatureDetailModel } }` |

## Interaction Modes

Known interaction modes:

- `select-prefecture`
- `select-municipality`
- `select-area`
- `inspect-area`

Area selection targets are currently emitted by the team activity layer via
`teamActivity:areaTargets`. The runtime frame does not directly forward generic
area features unless a dedicated area detail message is introduced later.
