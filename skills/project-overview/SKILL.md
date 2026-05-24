---
name: project-overview
description: Use this skill at the start of any work on the SVG2 / SVG3 disaster prevention map project, or whenever a question touches the overall architecture, available map engines, branch differences, or what old design documents claim vs reality. Trigger words include "SVG2", "SVG3", "防災マップ", "svgmap", "MapLibre", "current-map.html", "native branch". Read this BEFORE treating legacy documents as current behavior.
---

# Project Overview: SVG2 / SVG3 disaster prevention map

## Critical: legacy MapLibre documents are not current

`docs/legacy/01_overview.md`, `docs/legacy/02_frontend.md`, and
`docs/legacy/06_svgmap_lightweight.md` describe an older **"SVGMap + MapLibre
GL JS"** dual-engine setup. **This is no longer true on the `native` branch.**

Verify before reasoning:

```bash
grep -i maplibre frontend/package.json   # → empty on native branch
grep -rn "maplibre\|MapLibre" frontend/src/ map/   # → 0 hits on native
```

- `native` branch: svgmap-js only. No MapLibre in `dependencies`, no MapLibre
  import anywhere in `frontend/src/`.
- `main` branch: had a `features/map/maplibre/` directory and used both
  engines, plus a `useMapEngineSelector()` flow. **`native` is the current
  direction.**
- `docs/legacy/02_frontend.md` references `<MapLibreHost />`, `MapLibreOverviewMap`,
  etc. — none of these components exist on `native`. Treat doc references to
  MapLibre as historical.

Whenever you find yourself about to suggest a MapLibre-based fix on `native`,
stop. The only runtime is svgmap-js.

## Branch positioning

| Branch | Map engine | Notes |
|---|---|---|
| `main` | svgmap-js + MapLibre GL JS | Old. UI screenshots in past reviews came from here. |
| `native` | svgmap-js only ("svgmap native") | Current direction. README/docs not yet updated to match. |

Default to `native` for any new work unless explicitly told otherwise.

## Architecture (on `native`)

```
React (Next.js App Router, frontend/src/app/map/page.tsx)
 └─ <iframe src="/map/webapp/current-map.html">      ← svgmap-js runtime ("the runtime frame")
     ├─ <iframe src="layers/evacuation/evacuationLayer.html">       ← 避難所
     └─ <iframe src="layers/team-activity/teamActivityLayer.html">  ← 活動情報
```

Three frame levels. Communication is **postMessage only**, defined in two
files that must stay in sync:

- `map/webapp/shared/mapMessages.js` (consumed by the iframe layers and runtime)
- `frontend/src/lib/mapMessages.ts` (consumed by React)

The contract is documented in `docs/map-runtime-contract.md` — that one IS
current, unlike the other docs.

## Stack

- **Framework**: Next.js 16 + React 19 + TypeScript 5.9
- **Map engine**: svgmap-js (vendored at `map/vendor/svgmapjs/`)
- **DB / storage**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Rate limit**: Upstash Redis (`@upstash/ratelimit`, `@upstash/redis`) —
  in dependencies and configured
- **Python**: 3.10+ for `scripts/generate-district-svgs.py` and
  `scripts/extract_evacuation_svg_data.mjs` (runs in `predev` / `prebuild`)

No `package.json` accident dependencies on `native` (`"package.json": "^0.0.0"`
was on main, fixed here).

## Data flow

```
Supabase (live)
  ↓
frontend/src/lib/mapPublicData.ts   ← getPublishedEvacuation() / getPublishedTeamActivities()
  ↓
frontend/src/app/api/map/data/{evacuation,team-activity}/[region]/route.ts
  ↓ (Supabase result is null OR throws → static fallback)
frontend/public/map/data/{evacuation,team-activity}/{region}.json
  ↓
Layer iframe via runtime-config.json `dataUrl`
```

Important:

- `/api/map/data/*/[region]` validates `region` against `ALLOWED_MAP_REGIONS`
  in `frontend/src/lib/allowedRegions.ts`. **Currently only `okayama`.**
- The static fallback file path is built with `region`, so the allowlist also
  protects against path traversal in the fallback branch.
- Supabase results are cached in-process for 15 seconds
  (`LIVE_DATA_TTL_MS` in `mapPublicData.ts`).

## Layers in the project

| Layer id | Source file | Status normalize values |
|---|---|---|
| `evacuation` (避難所) | `map/webapp/layers/evacuation/evacuationLayer.html` | `open` / `limited` / `full` / `closed` / `unknown` |
| `teamActivity` (活動情報) | `map/webapp/layers/team-activity/teamActivityLayer.html` | `active` / `standby` / `planned` / `completed` / `needs_attention` / `unknown` |
| `baseArea` (区域) | static SVG, no detail iframe |  — |

If you need to wire detail rendering for `baseArea` later, you'll have to add
a `map:showAreaFeature` message and a dedicated builder. There is no
precedent in the codebase yet.

## Regions

- Region config: `map/regions/{regionId}/runtime-config.json` and
  `municipalities.json`
- Region-level data static fallback: `frontend/public/map/data/{layer}/{regionId}.json`
- Region allowlist (server): `frontend/src/lib/allowedRegions.ts`
- Iframe is initialized with `regionId` via URL params to `current-map.html`

Existing region configs (some incomplete): `okayama`, `aichi`, `kyoto`, `saga`,
`aomori`. Only `okayama` is in the allowlist and has full data.

## Build pipeline gotcha

`frontend/package.json` scripts:

```
predev:    extract_evacuation_svg_data.mjs → generate-district-svgs.py → prepare-public-assets.mjs → check-public-assets.mjs
prebuild:  (same)
```

This runs **Python and Node scripts** before `next dev` / `next build`. If
Python is not installed or `requirements.txt` is not satisfied, dev will fail
on a fresh checkout. The check script (`check-public-assets.mjs`) is a guard
against missing copies from `map/` → `public/map/`.

Skipping the predev (e.g. starting with `next dev` directly) will produce
broken icon paths and missing district SVGs.

## Where the "right answers" live

- For the message contract: `docs/map-runtime-contract.md` (current)
- For the React side: `frontend/src/app/map/useRuntimeBridge.ts` (the receiver)
- For layer behavior: the layer `.html` files in `map/webapp/layers/*/`
- For data shapes: `frontend/src/lib/mapPublicData.ts` (row mappers) and
  `frontend/src/app/map/mapTypes.ts` (frontend types)

For anything else, documents under `docs/legacy/` are informational background
and should not be treated as a source of truth for the current code.
