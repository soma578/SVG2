---
name: region-onboarding
description: Use this skill when adding a new prefecture or region to the map app (e.g. saga, aichi, kyoto, aomori), or modifying region-level configuration. Trigger words include "新しい地域", "新しい県", "region", "都道府県を追加", "runtime-config.json", "manifest.json", "municipalities.json", "ALLOWED_MAP_REGIONS", "allowedRegions", "prefCode", "regionId". Also use when investigating why a region "looks set up but doesn't load" — most often the allowlist is missing the region. Do NOT use this for adding a new layer (that's adding-a-map-layer) or for changing API behavior (map-data-api).
---

# Region Onboarding

## What a region needs

A fully working region requires these files / entries. Missing any one of
them will make the region look "configured but broken":

| File / entry | Purpose | Required for working region |
|---|---|---|
| `map/regions/{regionId}/runtime-config.json` | Map engine init | Yes |
| `map/regions/{regionId}/municipalities.json` | Municipality index | Yes |
| `frontend/public/map/data/evacuation/{regionId}.json` | Static fallback | Yes (unless Supabase is reachable always) |
| `frontend/public/map/data/team-activity/{regionId}.json` | Static fallback | Yes (same) |
| `map/layers/overview/pref/{prefCode}.svg` | Base area outline | Yes |
| `map/containers/Containers_webapp_denshi_{prefCode}.svg` | SVGMap container | Yes |
| Entry in `frontend/src/lib/allowedRegions.ts` | API allowlist | **Yes** — without this, all /api/map/data/* return 400 |
| Supabase rows (optional) | Live data | No, falls back to static JSON |

`prefCode` is the JIS 2-digit prefecture code: 岡山=33, 京都=26, 愛知=23,
青森=02, 佐賀=41, etc.

## The allowlist is the gotcha

```ts
// frontend/src/lib/allowedRegions.ts
export const ALLOWED_MAP_REGIONS = new Set(['okayama'])
export const isAllowedMapRegion = (region: string) => ALLOWED_MAP_REGIONS.has(region)
```

If you set up `map/regions/saga/runtime-config.json`, drop the SVGs in place,
and create the public fallback file — the map still won't load data because
the `/api/map/data/{layer}/saga` endpoints return 400 before they touch any
file. Add the region id to the set.

The allowlist also doubles as path-traversal protection for the static
fallback. Don't loosen it (e.g. allowing all-lowercase strings) — keep it an
explicit set.

## `runtime-config.json` schema

From `map/regions/okayama/runtime-config.json`:

```json
{
  "version": "5",
  "regionId": "okayama",
  "label": "岡山県",
  "engine": "svgmap",
  "containerUrl": "/map/containers/Containers_webapp_denshi_33.svg",
  "iconsBaseUrl": "/map/icons",
  "initialViewport": {
    "lat": 34.66, "lon": 133.92, "latSpan": 0.42, "lonSpan": 0.52
  },
  "layers": {
    "baseArea": {
      "layerUrl": "/map/layers/overview/pref/33.svg",
      "runtimeVisible": true,
      "opacity": 1
    },
    "evacuation": {
      "dataUrl": "/api/map/data/evacuation/okayama",
      "runtimeVisible": true,
      "opacity": 1
    },
    "teamActivity": {
      "dataUrl": "/api/map/data/team-activity/okayama",
      "baseAreaLayerUrl": "/map/layers/overview/pref/33.svg",
      "districtSvgUrlTemplate": "/data/okayama/districts-svg/{code}.svg",
      "runtimeVisible": true,
      "opacity": 1
    }
  },
  "interaction": {
    "disableDefaultPopup": true,
    "featureSelectEvent": true
  },
  "prefCode": "33"
}
```

Key fields:

- `engine` must be `"svgmap"` on the `native` branch. (`"maplibre"` was a
  value on `main` but is no longer supported here.)
- `containerUrl` points to the SVGMap container SVG, named by `prefCode`.
- `initialViewport` is the default view when the region is first opened.
  Compute it so the prefecture fits in the iframe with a small padding.
- Each layer's `dataUrl` points to the dynamic API endpoint, not a static
  file. The API falls back to static internally.
- `districtSvgUrlTemplate` uses `{code}` as a placeholder for the
  municipality code.

Bump `version` when you change the schema; the runtime can cache by version.

## `municipalities.json` schema

From `map/regions/okayama/municipalities.json`. Each entry is a municipality
with display label, code, and viewport. The shape used in the React side:

```ts
type MunicipalityEntry = {
  id: string
  type?: 'city' | 'town' | 'village'
  label: string
  displayCode?: string
  municipalityCodes?: string[]
  shelterCount?: number
  teamActivityCount?: number
  dataStatus?: string
  runtimeConfigUrl?: string
  hasDistrictPolygons?: boolean
  districtSvgUrls?: string[]
  viewport?: { lat: number; lon: number; latSpan: number; lonSpan: number }
}
```

For a region with no data yet, you can ship an empty array `[]` — the
`MuniSelectMap` UI will show the region but with no clickable municipalities.

## Existing region configs

These directories already exist on `native` but are mostly placeholders:

- `map/regions/okayama/` — **fully configured, only this is in the allowlist**
- `map/regions/aichi/` — config present, no data
- `map/regions/kyoto/` — config present, no data
- `map/regions/saga/` — config present, no data
- `map/regions/aomori/` — config present, no data

If you "activate" one of these, the steps are:

1. Verify `runtime-config.json` has the right `prefCode` and viewport
2. Drop a `municipalities.json` (even if empty)
3. Generate or import the data → static fallback JSON in
   `frontend/public/map/data/{layer}/{regionId}.json`
4. Verify the overview SVG exists at `map/layers/overview/pref/{prefCode}.svg`
5. Add to `ALLOWED_MAP_REGIONS`
6. Run `npm run build` to ensure `check-public-assets.mjs` passes

## Hardcoded `prefCode` in API routes

There's a subtle bug pattern: the evacuation route currently hardcodes
`prefCode: '33'` in the JSON response:

```ts
return json({
  version: 1,
  regionId: region,
  prefCode: '33',          // ← hardcoded
  layerId: 'evacuation',
  ...
})
```

When adding a second region to the allowlist, change this to be derived from
`region` (e.g. a small `region → prefCode` map, or read from
`runtime-config.json`). The runtime may not care, but downstream consumers
(or future feature flags) might.

## Supabase rows (optional live data)

If the region should serve live data:

1. Insert rows into the Supabase `evacuation_shelters` / `team_activities`
   tables with the right `region_id` and `enabled = true`
2. Run `npm run import:supabase` and `npm run publish:supabase` to test
   round-trips
3. Confirm with `curl localhost:3000/api/map/data/evacuation/{regionId}`
   that `generatedFrom === 'supabase-live'`

Live data is cached for 15 seconds in-process (`LIVE_DATA_TTL_MS` in
`mapPublicData.ts`). If Supabase is misconfigured or `enabled = false` rows
are everywhere, `getPublishedXxx` returns `null` and the static fallback
kicks in — easy to miss in dev.

## Multi-region considerations (future)

The current code is built around `okayama`. Things to consider when adding
the second working region:

- Decouple `prefCode` from the response (above)
- Decouple the `getPublishedEvacuation` early return:
  ```ts
  if (regionId !== 'okayama' || !hasSupabaseEnv()) return null
  ```
  This currently makes Supabase responses *only* work for okayama. Drop the
  region check, keep `hasSupabaseEnv()`.
- `extract_evacuation_svg_data.mjs` may have okayama-specific paths. Check
  before relying on it.
- `prepare-public-assets.mjs` and `check-public-assets.mjs` need to know
  about the new region — they likely enumerate regions to copy/verify.

## Verification checklist

After onboarding a region:

1. `curl http://localhost:3000/api/map/data/evacuation/{regionId}` returns
   200 with items
2. `curl http://localhost:3000/api/map/data/evacuation/{notRegion}` returns
   400 (allowlist working)
3. Open `/map?region={regionId}` (or the equivalent route) — map should load
   the right viewport
4. Picker maps (prefecture/municipality) show the new region without errors
5. `npm run build` succeeds with no missing-asset warnings
