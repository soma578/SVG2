---
name: map-postmessage-contract
description: Use this skill any time you add, remove, rename, or change the payload of a postMessage between the React UI, the svgmap runtime frame, or a layer iframe. Trigger words include "postMessage", "MAP_MESSAGES", "mapMessages", "runtime:ready", "runtime:featureDetail", "runtime:dataStatus", "useRuntimeBridge", "current-map.html", "layer iframe", "iframe", "message contract". Also use when debugging "feature selection doesn't show up", "layer doesn't load", "dataStatus is wrong", or other symptoms of broken iframe ↔ React communication. Mistakes here are silent and easy to make.
---

# Map postMessage Contract

## The two-file rule

The protocol is defined in TWO places that MUST stay synchronized:

- `map/webapp/shared/mapMessages.js` — used by layer iframes and the runtime frame
- `frontend/src/lib/mapMessages.ts` — used by React

If you add or rename a message, edit both. If they drift, types in React look
right but the iframe never receives the message (or vice versa).

The contract is also documented in `docs/map-runtime-contract.md`. Update it
when you change the protocol. This is the only doc in `docs/` that is
authoritative for current code.

## Frame roles

```
React UI            : frontend/src/app/map/page.tsx + useRuntimeBridge.ts
Runtime frame       : map/webapp/current-map.html        (svgmap-js host)
Layer web apps      : map/webapp/layers/{evacuation,team-activity}/*.html
```

React talks to the runtime frame. Layer iframes talk to the runtime frame
(their `window.parent`). React only sees messages from the runtime frame —
layer messages that need to reach React are forwarded by `current-map.html`.

## Origin rule — NEVER use `'*'`

Every `postMessage` in this codebase uses `window.location.origin` as the
target origin:

```js
// ✓ correct
window.parent.postMessage({ type: MAP_MESSAGES.runtimeFeatureDetail, payload }, window.location.origin)

// ✗ NEVER do this
window.parent.postMessage(payload, '*')
```

`page.tsx` and `useRuntimeBridge.ts` validate `event.origin ===
window.location.origin` on the receiver side. A `'*'` send still works, but
adding a new send with `'*'` is a regression of the security cleanup already
done. There used to be an `origin === 'null'` allowance — it has been removed.
Do not bring it back.

On the receiver, also validate the source:

```ts
const fromMapFrame = event.source === iframeRef.current?.contentWindow
const sameOrigin = event.origin === window.location.origin
if (!fromMapFrame || !sameOrigin) return
```

## Message direction matrix

### React UI → Runtime frame

Sent via `iframeRef.current?.contentWindow.postMessage(...)`:

| Message | Purpose | Payload |
|---|---|---|
| `map:setViewport` | Move runtime to a viewport | `{ viewport: { lat, lon, latSpan, lonSpan } }` |
| `map:zoom` | Relative zoom | `{ factor }` |
| `map:resetView` | Reset to initial viewport | — |
| `map:setCurrentLocation` | Draw the "current location" marker | `{ location: { lat, lon } }` |
| `map:focusLocation` | Move + draw current location | `{ location: { lat, lon, latSpan, lonSpan } }` |
| `map:setLayerVisible` | Toggle layer visibility | `{ layerKey, visible }` |
| `map:setInteractionMode` | Set mode | `{ interactionMode }` |

`runtime:setLayerVisibility` exists as a legacy alias for `map:setLayerVisible`.
**Do not add new sends to it.** Use the `map:*` form in new code.

### Runtime frame → React UI

| Message | Purpose | Payload |
|---|---|---|
| `runtime:ready` | Init complete | `{ engine, regionId, runtimeConfigUrl, initialViewport, layers }` |
| `runtime:dataStatus` | Data source / cache status | `{ key, label, source, url, online, updatedAt, message }` |
| `runtime:featureDetail` | Selected feature detail (structured) | `{ detail: FeatureDetailModel }` |

**`runtime:featureDetail` is the ONLY detail path.** There is no
`runtime:layerDetailHtml` anymore. Do not add one back, even temporarily —
the React side intentionally has no `dangerouslySetInnerHTML` for layer
content, and the FeatureDetailModel codegen is the contract.

### Runtime frame → Layer iframes

| Message | Purpose | Payload |
|---|---|---|
| `map:layerVisibilityChanged` | Layer toggled | `{ layerKey, visible }` |
| `map:interactionModeChanged` | Mode changed | `{ interactionMode }` |
| `map:setDataUrl` | Where to fetch data | `{ layerId, url }` |
| `map:setLayerConfig` | Layer config | `{ layerId, baseAreaLayerUrl, districtSvgUrlTemplate }` |
| `map:setMunicipalityFilter` | Limit by municipality | `{ municipalityCodes }` |
| `map:showEvacuationFeature` | Render specific feature | `{ feature }` |
| `map:showTeamActivityFeature` | Same for team activity | `{ feature }` |

### Layer iframes → Runtime frame

| Message | Purpose | Payload |
|---|---|---|
| `evacuationLayer:ready` | Ready for config | — |
| `evacuationLayer:dataReady` | Data loaded | — |
| `evacuationLayer:visibilityChanged` | Visibility echo | `{ visible }` |
| `evacuation:hitTargets` | Marker hit-test points | `{ targets, zoom }` |
| `teamActivityLayer:ready` | Ready for config | — |
| `teamActivity:hitTargets` | Marker hit-test points | `{ targets, zoom, source, emittedAt }` |
| `teamActivity:areaTargets` | Area polygon targets | `{ targets, zoom, source, emittedAt }` |
| `runtime:dataStatus` | Data status (forwarded to React) | `{ payload: {...} }` |
| `runtime:featureDetail` | Built feature detail (forwarded to React) | `{ payload: { detail } }` |

Note the nesting: layer-side `runtime:dataStatus` and `runtime:featureDetail`
send `{ payload: {...} }`, with the actual data inside `payload`.
`current-map.html` forwards them up. Don't accidentally double-wrap or
unwrap on the React side.

## `FeatureDetailModel` shape

```ts
type FeatureDetailTone = 'blue' | 'green' | 'amber' | 'red' | 'gray'

type FeatureDetailModel = {
  id: string           // required
  title: string        // required
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

React validates that `id` and `title` exist. It rejects action URLs starting
with `javascript:`, `data:`, `vbscript:`, or `file:`. If you add an external
link, use `https://`.

The layer is responsible for building this model. React does NOT interpret
`layerId`, `status`, `category`, or raw feature properties when rendering —
the layer must put everything user-visible into the model. This is the
inversion of control that lets us delete `dangerouslySetInnerHTML`.

## Interaction modes

Known values:

- `select-prefecture`
- `select-municipality`
- `select-area`
- `inspect-area`

Layers only emit feature details when `state.interactionMode === 'inspect-area'`.
The area-selection modes are used by the picker maps (`PrefSelectMap`,
`MuniSelectMap`) and don't fire feature detail.

## Ready handshake

Initialization order matters:

1. React mounts iframe `current-map.html?regionId=okayama`
2. Inside, svgmap-js boots and posts `runtime:ready`
3. Layer iframes inside the runtime emit `evacuationLayer:ready` /
   `teamActivityLayer:ready`
4. Runtime sends `map:setDataUrl` and `map:setLayerConfig` to each layer
5. Layers fetch data, emit `runtime:dataStatus`, finally
   `evacuationLayer:dataReady`

If you add a new layer, follow this same handshake. `useRuntimeBridge.ts`
sets `runtimeReady` only when `runtime:ready` arrives — sending viewport
moves before that is a no-op (queue them after).

## Common mistakes

- **Adding to one file only.** `mapMessages.js` without `mapMessages.ts` (or
  vice versa) compiles but breaks at runtime. Always edit both.
- **Posting with `'*'`.** Receiver rejects it now. Use
  `window.location.origin`.
- **Double-wrapping payload.** Layer messages are `{ payload: {...} }`.
  Runtime forwards as-is. Don't add another `payload:` layer in React.
- **Sending before `runtime:ready`.** No-op. Queue or wait.
- **Forgetting `id` or `title` in `FeatureDetailModel`.** Silently dropped on
  the React side with no error popup.
- **Reintroducing HTML strings.** There used to be `runtime:layerDetailHtml`.
  It's gone. The whole point of `runtime:featureDetail` is to avoid HTML
  injection. Don't undo this.
- **Forgetting to update `docs/map-runtime-contract.md`** when changing the
  protocol. Future you will not remember why.
