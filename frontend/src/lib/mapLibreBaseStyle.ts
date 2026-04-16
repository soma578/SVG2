import {
  detailBasemapMode,
  detailVectorLayerNames,
  detailVectorSourceType,
  detailVectorSourceUrl,
  tileBaseUrl,
} from '@/lib/config'

type Bounds = [number, number, number, number]

const RASTER_BASE_STYLE = {
  version: 8,
  sources: {
    'gsi-basemap': {
      type: 'raster',
      tiles: [tileBaseUrl],
      tileSize: 256,
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院 淡色地図</a>',
    },
  },
  layers: [
    {
      id: 'gsi-basemap-layer',
      type: 'raster',
      source: 'gsi-basemap',
    },
  ],
} as const

function createVectorSource(bounds?: Bounds) {
  const baseSource =
    detailVectorSourceType === 'tiles'
      ? {
          type: 'vector' as const,
          tiles: [detailVectorSourceUrl],
        }
      : {
          type: 'vector' as const,
          url: `pmtiles://${detailVectorSourceUrl}`,
        }

  if (!bounds) return baseSource
  return {
    ...baseSource,
    bounds,
  }
}

function createVectorBaseStyle(bounds?: Bounds) {
  return {
    version: 8,
    sources: {
      'detail-basemap': createVectorSource(bounds),
    },
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'detail-background',
        type: 'background',
        paint: {
          'background-color': '#f8fafc',
        },
      },
      {
        id: 'detail-landcover',
        type: 'fill',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.landcover,
        paint: {
          'fill-color': '#eef5ea',
          'fill-opacity': 0.45,
        },
      },
      {
        id: 'detail-water',
        type: 'fill',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.water,
        paint: {
          'fill-color': '#dbeafe',
          'fill-opacity': 0.78,
        },
      },
      {
        id: 'detail-waterway',
        type: 'line',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.waterway,
        paint: {
          'line-color': '#93c5fd',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 0.4,
            12, 1.1,
            15, 2.2,
          ],
          'line-opacity': 0.8,
        },
      },
      {
        id: 'detail-road',
        type: 'line',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.road,
        paint: {
          'line-color': '#ffffff',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 0.6,
            11, 1.4,
            14, 3.2,
            16, 5,
          ],
          'line-opacity': 0.92,
        },
      },
      {
        id: 'detail-road-outline',
        type: 'line',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.road,
        paint: {
          'line-color': '#cbd5e1',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 1,
            11, 2,
            14, 4.4,
            16, 6.5,
          ],
          'line-opacity': 0.9,
        },
      },
      {
        id: 'detail-boundary',
        type: 'line',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.boundary,
        paint: {
          'line-color': '#94a3b8',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7, 0.4,
            10, 0.9,
            14, 1.5,
          ],
          'line-dasharray': [2, 1],
          'line-opacity': 0.75,
        },
      },
      {
        id: 'detail-building',
        type: 'fill',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.building,
        minzoom: 13,
        paint: {
          'fill-color': '#e2e8f0',
          'fill-opacity': 0.55,
        },
      },
      {
        id: 'detail-place',
        type: 'symbol',
        source: 'detail-basemap',
        'source-layer': detailVectorLayerNames.place,
        minzoom: 9,
        layout: {
          'text-field': ['coalesce', ['get', 'name_ja'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 10,
            14, 13,
          ],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#334155',
          'text-halo-color': 'rgba(255,255,255,0.95)',
          'text-halo-width': 1.2,
        },
      },
    ],
  } as const
}

export function buildMapLibreBaseStyle(options?: { basemapBounds?: Bounds }) {
  const basemapBounds = options?.basemapBounds

  if (detailBasemapMode === 'vector' && detailVectorSourceUrl) {
    return createVectorBaseStyle(basemapBounds) as any
  }

  if (!basemapBounds) return RASTER_BASE_STYLE as any

  return {
    ...RASTER_BASE_STYLE,
    sources: {
      ...RASTER_BASE_STYLE.sources,
      'gsi-basemap': {
        ...RASTER_BASE_STYLE.sources['gsi-basemap'],
        bounds: basemapBounds,
      },
    },
  } as any
}

export function hasVectorDetailBasemap() {
  return detailBasemapMode === 'vector' && Boolean(detailVectorSourceUrl)
}
