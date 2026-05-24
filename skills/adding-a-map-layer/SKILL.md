---
name: adding-a-map-layer
description: Use this skill when adding a new map layer to the disaster prevention app (e.g. hospital, welfare, hazard, weather) or making substantial changes to an existing layer (evacuation, team-activity). Trigger words include "新しいレイヤー", "add a layer", "hospital layer", "welfare layer", "hazard layer", "layer iframe", "evacuationLayer.html", "teamActivityLayer.html", "buildXxxFeatureDetail", "payloadFor", "normalizeStatus", "STATUS_TABLE". Also use when the change touches per-layer iframe behavior, the status vocabulary, or the FeatureDetailModel building. Do not use for purely server-side data work — that's the map-data-api skill.
---

# Adding (or modifying) a Map Layer

## File layout

A new layer needs files in three places:

```
map/webapp/layers/{layer-name}/
  └─ {layer}Layer.html          ← the iframe entry point (built as ES module)
map/webapp/layers/{layer-name}/
  └─ {layer}Layer.svg           ← (optional) svgmap data-controller hook
frontend/src/app/api/map/data/{layer-name}/[region]/
  └─ route.ts                   ← API endpoint
frontend/public/map/data/{layer-name}/
  └─ {region}.json              ← static fallback
```

Plus configuration entries:

- `map/regions/{region}/runtime-config.json` → `layers.{layerKey}` block
- `frontend/src/lib/allowedRegions.ts` already controls region scope
- `map/webapp/shared/mapMessages.js` AND `frontend/src/lib/mapMessages.ts`
  if you need new messages

## Pattern: copy from `evacuation`

`evacuation` is the simplest reference. Use it as a template:

```bash
cp -r map/webapp/layers/evacuation map/webapp/layers/{newlayer}
cp -r frontend/src/app/api/map/data/evacuation frontend/src/app/api/map/data/{newlayer}
```

Then rename inside. The `team-activity` layer has area selection and is more
complex — only use it as a template if your layer has polygons.

## Required pieces in `{layer}Layer.html`

### 1. SVGMap hook (if loaded as a data-controller)

```js
window.hiddenOnLayerLoad = () => {
  console.log('[newlayer] hiddenOnLayerLoad called by SVGMap');
};
```

Without this, svgmap's `parseSVG` / `dynamicLoad` throws `NotFoundError` because
the SVG references this callback by name. Match the name to whatever your
`.svg` `data-controller` attribute specifies.

### 2. Status normalization (if your data has a status field)

```js
const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLowerCase()
  if (['open', '開設中', /* aliases */].includes(value)) return 'open'
  // ...
  return 'unknown'
}
```

Keep the normalized vocabulary small (5–6 values max) and align it with the
icon set and status table. Lowercase the canonical form. Always include
`unknown` as the fallback.

### 3. Status table (label / tone / icon)

```js
const STATUS_TABLE = {
  open:    { label: '開設中',       tone: 'green', icon: '/map/icons/{layer}-open.png' },
  // ...
  unknown: { label: '状況不明',     tone: 'blue',  icon: '/map/icons/{layer}-default.png' },
}
```

**Use `.png` icons, not `.svg`.** SVG icons were the original format but a
migration to PNG happened — `evacuation` is all PNG. Mixing SVG and PNG in a
single layer causes inconsistent rendering inside svgmap. If you generate new
icons, output PNG.

The `tone` value must be one of `blue | green | amber | red | gray` (the
`FeatureDetailTone` union). React maps these to badge colors.

### 4. `payloadFor(record)` — what gets emitted with hit targets

```js
const payloadFor = (record) => ({
  enabled: true,
  id: record.id,
  layerId: '{layerId}',
  title: record.title,
  kind: 'dynamic',
  type: '{layerId}',
  category: '{layerId}',
  summary: record.summary || '...',
  description: record.description || '...',
  address: record.address || '',
  status: normalizeStatus(record.status),
  // ...layer-specific fields
  lat: record.lat,
  lon: record.lon,
  feature: record,   // ← raw record, preserved as-is
})
```

**Keep `feature: record` at the bottom.** This preserves unknown fields so
later additions to the data schema don't require touching the layer. The
detail builder reads from the flat fields above (already normalized), and
falls back to `feature.*` for anything new.

### 5. `build{Layer}FeatureDetail(feature)` — the detail builder

```js
const buildXxxFeatureDetail = (feature) => {
  if (feature == null) return null
  if (feature.id == null || feature.id === '') return null
  const titleText = detailText(feature.title)
  if (titleText === null) return null

  const statusInfo = STATUS_TABLE[normalizeStatus(feature.status)] || STATUS_TABLE.unknown
  const rows = [
    { label: '住所', value: detailText(feature.address) },
    // ...
  ].filter((row) => row.value !== null)

  const actions = []
  const mapsHref = googleMapsDirectionsHref(feature.lat, feature.lon)
  if (mapsHref) actions.push({ label: 'Google マップで開く', href: mapsHref })

  return {
    id: String(feature.id),
    title: titleText,
    accent: 'green',
    badge: { label: statusInfo.label, tone: statusInfo.tone },
    icon: { src: statusInfo.icon, alt: statusInfo.label + ' の{施設種別}' },
    rows,
    actions: actions.length > 0 ? actions : undefined,
  }
}
```

Critical:

- Return `null` if `id`, `title`, or the feature itself is missing. React
  drops nulls silently — don't emit a broken model.
- `actions: undefined` (not `actions: []`) if there are no actions, so the UI
  can use `Array.isArray(actions)` checks without surprises.
- Filter out `null` rows. Empty values render as the literal string `null`
  otherwise.
- Always coerce `id` to `String(feature.id)` — some sources pass numbers.

### 6. Emit via `runtime:featureDetail`

```js
const renderXxxDetail = (feature) => {
  if (!feature) return
  const detail = buildXxxFeatureDetail(feature)
  if (!detail) return
  window.parent?.postMessage?.({
    type: MAP_MESSAGES.runtimeFeatureDetail,
    payload: { layerId: '{layerId}', detail },
  }, window.location.origin)
}
```

Origin MUST be `window.location.origin`, not `'*'`. See the
`map-postmessage-contract` skill for why.

There is NO `runtime:layerDetailHtml` anymore. Do not bring back HTML-string
emission. Always build the structured `FeatureDetailModel`.

### 7. Helpers reused across layers

These are useful and currently defined per-layer. If you find yourself
copying them more than twice, consider extracting to
`map/webapp/shared/featureDetailHelpers.js`:

- `detailText(value)` — trims, returns `null` for empty / nullish
- `detailCapacityText(value)` — formats capacity as `"○人収容"` or returns null
- `detailLatLonText(lat, lon)` — formats coordinates with fixed decimals
- `googleMapsDirectionsHref(lat, lon)` — returns an https URL or null

The `team-activity` layer uses `fdm*` prefixed variants (`fdmText`,
`fdmLatLon`) to avoid name collision if the files were ever merged. If your
layer is fresh, no prefix needed.

## Wiring through `current-map.html`

`current-map.html` instantiates the iframes and forwards messages. Look for
the existing forwarding block for `evacuation` and `teamActivity` and copy
the pattern for your new layer. Three forwarding paths to add:

- Layer-side `evacuationLayer:ready` style ready event → handle it, then
  send `map:setDataUrl` + `map:setLayerConfig`
- Layer-side `evacuation:hitTargets` style hit events → store the targets
  for hit-testing
- Layer-side `runtime:dataStatus` and `runtime:featureDetail` → forward to
  `window.parent` (React) unchanged

## React side wiring

### `useRuntimeBridge.ts`

Add the new layer to `DATA_STATUS_LABELS`:

```ts
const DATA_STATUS_LABELS: Record<string, string> = {
  runtimeConfig: '地域設定',
  evacuation: '避難所',
  teamActivity: '活動情報',
  yourNewLayer: '新レイヤー',   // ← here
  // ...
}
```

If the layer needs an entry in `LayerState[]`, add it to `initialLayers`
where `useRuntimeBridge` is called. Layers are otherwise generic on the React
side — no per-layer code paths.

### `mapMessages.ts` (and `.js`)

If you need new message types (e.g. `map:showHospitalFeature`), add them to
**both files** under the same name. See the `map-postmessage-contract` skill.

## API route (`route.ts`)

Copy `frontend/src/app/api/map/data/evacuation/[region]/route.ts` as a
template. Key elements:

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ region: string }> }) {
  const { region } = await params
  if (!isAllowedMapRegion(region)) {
    return NextResponse.json({ ok: false, error: 'invalid region' }, { status: 400 })
  }
  try {
    const items = await getPublishedYourLayer(region)
    if (items) return json({ version: 1, regionId: region, layerId: 'yourLayer', items })
    return json(await readStaticFallback(region))
  } catch (err) {
    // ...
  }
}
```

The `isAllowedMapRegion` check is **mandatory**. Skipping it lets traversal
strings hit the `readFile` fallback path. See the `map-data-api` skill for
fuller server-side notes.

You also need a `getPublishedYourLayer` in `frontend/src/lib/mapPublicData.ts`
that does the Supabase read with a row mapper.

## runtime-config.json

```json
{
  "layers": {
    "yourLayer": {
      "dataUrl": "/api/map/data/yourLayer/okayama",
      "runtimeVisible": true,
      "opacity": 1
    }
  }
}
```

Add to each region's config (or only `okayama` for now; other regions are
placeholders).

## Verification checklist

After adding a layer, verify:

1. `npm run typecheck` passes — catches missing `mapMessages.ts` entries
2. `npm run build` passes — catches missing public assets
3. Open the map locally, click an icon → sidebar/bottom-sheet shows the new
   FeatureDetailModel with the right badge color and rows
4. DevTools Network shows `/api/map/data/yourLayer/okayama` returning 200
5. Toggling the layer in the legend triggers `map:setLayerVisible`
6. Region validation: `curl /api/map/data/yourLayer/foo` returns 400
7. No `dangerouslySetInnerHTML` warnings, no `postMessage` origin warnings
   in console
