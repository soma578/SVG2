export const CURRENT_MAP_ATTRIBUTIONS = {
  baseArea: '<a href="https://nlftp.mlit.go.jp/" target="_blank">国土数値情報（行政区域）</a>',
  districts: '<a href="https://www.e-stat.go.jp/" target="_blank">e-Stat 町丁・字等別境界データ</a>',
  shelters: '<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報（避難施設データ）</a>',
  teamActivity: 'チーム活動データ',
} as const

export type TeamActivityAreaState = {
  activeAreas: string[]
  standbyAreas: string[]
  stoppedAreas: string[]
}

function buildAreaMatchExpression(params: {
  areas: string[]
  candidates: any[]
}) {
  const { areas, candidates } = params
  if (!Array.isArray(areas) || areas.length === 0) return false
  return ['any', ...candidates.map((candidate) => ['in', candidate, ['literal', areas]])] as any
}

function buildBaseAreaTeamActivityColorExpression(teamActivityAreaState?: TeamActivityAreaState) {
  const candidates = [
    ['coalesce', ['get', 'name'], ''],
    ['concat', ['coalesce', ['get', 'pref'], ''], ['coalesce', ['get', 'name'], '']],
    ['coalesce', ['get', 'pref'], ''],
  ]
  const activeMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.activeAreas ?? [],
    candidates,
  })
  const standbyMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.standbyAreas ?? [],
    candidates,
  })
  const stoppedMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.stoppedAreas ?? [],
    candidates,
  })

  return [
    'case',
    activeMatch, '#f59e0b',
    standbyMatch, '#fcd34d',
    stoppedMatch, '#cbd5e1',
    '#93c5fd',
  ] as any
}

function buildDistrictTeamActivityColorExpression(teamActivityAreaState?: TeamActivityAreaState) {
  const candidates = [
    ['coalesce', ['get', 'name'], ''],
    ['concat', ['coalesce', ['get', 'city'], ''], ['coalesce', ['get', 'ward'], '']],
    ['concat', ['coalesce', ['get', 'pref'], ''], ['coalesce', ['get', 'city'], ''], ['coalesce', ['get', 'ward'], '']],
  ]
  const activeMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.activeAreas ?? [],
    candidates,
  })
  const standbyMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.standbyAreas ?? [],
    candidates,
  })
  const stoppedMatch = buildAreaMatchExpression({
    areas: teamActivityAreaState?.stoppedAreas ?? [],
    candidates,
  })

  return [
    'case',
    activeMatch, '#fdba74',
    standbyMatch, '#fde68a',
    stoppedMatch, '#e2e8f0',
    '#bfdbfe',
  ] as any
}

export function buildBaseAreaFillLayer(minZoom = 0, teamActivityAreaState?: TeamActivityAreaState) {
  return {
    id: 'base-area-fill',
    type: 'fill' as const,
    minzoom: minZoom,
    paint: {
      'fill-color': buildBaseAreaTeamActivityColorExpression(teamActivityAreaState),
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.04,
        Math.max(minZoom + 2, 8), 0.06,
        Math.max(minZoom + 4, 10), 0.08,
      ] as any,
    },
  }
}

export function buildBaseAreaOutlineLayer(minZoom = 0) {
  return {
    id: 'base-area-outline',
    type: 'line' as const,
    minzoom: minZoom,
    paint: {
      'line-color': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, '#60a5fa',
        Math.max(minZoom + 3, 8), '#3b82f6',
        Math.max(minZoom + 5, 10), '#2563eb',
      ] as any,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.7,
        Math.max(minZoom + 2, 8), 1.0,
        Math.max(minZoom + 4, 10), 1.4,
      ] as any,
      'line-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.45,
        Math.max(minZoom + 2, 8), 0.65,
        Math.max(minZoom + 4, 10), 0.85,
      ] as any,
    },
  }
}

export function buildSheltersLayer(minZoom = 0) {
  return {
    id: 'shelters-layer',
    type: 'circle' as const,
    minzoom: minZoom,
    filter: ['!', ['has', 'point_count']] as any,
    paint: {
      'circle-radius': 7,
      'circle-color': '#3b82f6',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

export function buildShelterClusterLayer(minZoom = 0) {
  return {
    id: 'shelters-cluster-layer',
    type: 'circle' as const,
    minzoom: minZoom,
    filter: ['has', 'point_count'] as any,
    paint: {
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        16,
        20, 20,
        100, 26,
        500, 32,
      ] as any,
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#60a5fa',
        20, '#3b82f6',
        100, '#2563eb',
        500, '#1d4ed8',
      ] as any,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.92,
    },
  }
}

export function buildShelterClusterCountLayer(minZoom = 0) {
  return {
    id: 'shelters-cluster-count-layer',
    type: 'symbol' as const,
    minzoom: minZoom,
    filter: ['has', 'point_count'] as any,
    layout: {
      'text-field': ['get', 'point_count_abbreviated'] as any,
      'text-size': 12,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'] as any,
    },
    paint: {
      'text-color': '#ffffff',
    },
  }
}

export function buildTeamActivityLayer(minZoom = 0) {
  return {
    id: 'team-activity-layer',
    type: 'circle' as const,
    minzoom: minZoom,
    paint: {
      'circle-radius': 7,
      'circle-color': [
        'match',
        ['get', 'status'],
        'active', '#dc2626',
        'standby', '#f59e0b',
        'stopped', '#6b7280',
        '#2563eb',
      ] as any,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  }
}

export function buildDistrictFillLayer(minZoom = 0, teamActivityAreaState?: TeamActivityAreaState) {
  return {
    id: 'districts-fill',
    type: 'fill' as const,
    minzoom: minZoom,
    paint: {
      'fill-color': buildDistrictTeamActivityColorExpression(teamActivityAreaState),
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.015,
        Math.max(minZoom + 1.5, 10), 0.03,
        Math.max(minZoom + 3, 12), 0.05,
      ] as any,
    },
  }
}

export function buildDistrictSelectionFillLayer(selectedDistrictKeyCode: string, minZoom = 0) {
  return {
    id: 'districts-selection-fill',
    type: 'fill' as const,
    minzoom: minZoom,
    filter: ['==', ['get', 'key_code'], selectedDistrictKeyCode] as any,
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.32,
    },
  }
}

export function buildDistrictOutlineLayer(boundaryOpacity: number, minZoom = 0) {
  return {
    id: 'districts-layer',
    type: 'line' as const,
    minzoom: minZoom,
    paint: {
      'line-color': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, '#94a3b8',
        Math.max(minZoom + 2, 10), '#64748b',
        Math.max(minZoom + 4, 12), '#475569',
      ] as any,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.45,
        Math.max(minZoom + 1.5, 10), 0.8,
        Math.max(minZoom + 4, 12), 1.2,
      ] as any,
      'line-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, boundaryOpacity * 0.35,
        Math.max(minZoom + 1.5, 10), boundaryOpacity * 0.6,
        Math.max(minZoom + 4, 12), boundaryOpacity * 0.9,
      ] as any,
    },
  }
}

export function buildDistrictSelectionOutlineLayer(selectedDistrictKeyCode: string, minZoom = 0) {
  return {
    id: 'districts-selection-outline',
    type: 'line' as const,
    minzoom: minZoom,
    filter: ['==', ['get', 'key_code'], selectedDistrictKeyCode] as any,
    paint: {
      'line-color': '#2563eb',
      'line-width': 3,
      'line-opacity': 1,
    },
  }
}

export function buildDistrictPointLayer(selectedDistrictKeyCode: string | null, minZoom = 0) {
  return {
    id: 'districts-point',
    type: 'circle' as const,
    minzoom: minZoom,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom,
        [
          'case',
          ['==', ['get', 'key_code'], selectedDistrictKeyCode ?? ''],
          5.5,
          2.8,
        ],
        Math.max(minZoom + 3, 12),
        [
          'case',
          ['==', ['get', 'key_code'], selectedDistrictKeyCode ?? ''],
          7,
          4.8,
        ],
      ] as any,
      'circle-color': [
        'case',
        ['==', ['get', 'key_code'], selectedDistrictKeyCode ?? ''],
        '#1d4ed8',
        '#ffffff',
      ] as any,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#2563eb',
    },
  }
}

export function buildDistrictLabelLayer(minZoom = 12) {
  return {
    id: 'districts-label',
    type: 'symbol' as const,
    minzoom: minZoom,
    layout: {
      'text-field': ['coalesce', ['get', 'district_norm'], ['get', 'district'], ['get', 'name']] as any,
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 9,
        Math.max(minZoom + 2, 11), 10,
        Math.max(minZoom + 4, 13), 12,
      ] as any,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'] as any,
      'text-offset': [0, 1.1] as any,
      'text-anchor': 'top' as const,
    },
    paint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 1.1,
        Math.max(minZoom + 4, 13), 1.8,
      ] as any,
    },
  }
}

export function buildBaseAreaLabelLayer(minZoom = 7.5, maxZoom?: number) {
  return {
    id: 'base-area-label',
    type: 'symbol' as const,
    minzoom: minZoom,
    ...(typeof maxZoom === 'number' ? { maxzoom: maxZoom } : {}),
    filter: ['!', ['has', 'n03_code']] as any,
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ['get', 'pref']] as any,
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 9,
        Math.max(minZoom + 2, 9.5), 10,
        Math.max(minZoom + 4, 11.5), 12,
      ] as any,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'] as any,
      'text-anchor': 'center' as const,
      'text-allow-overlap': false,
      'text-max-width': 10 as any,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.4,
      'text-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        minZoom, 0.75,
        Math.max(minZoom + 3, 10.5), 0.95,
      ] as any,
    },
  }
}

export function getSelectedDistrictKeyCode(selectedFeatureId?: string) {
  return selectedFeatureId && selectedFeatureId.startsWith('district-')
    ? selectedFeatureId.replace(/^district-/, '')
    : null
}

export function getSelectedBaseAreaName(selectedFeatureId?: string) {
  return selectedFeatureId && selectedFeatureId.startsWith('baseArea:')
    ? selectedFeatureId.replace(/^baseArea:/, '')
    : null
}

export function buildBaseAreaSelectionFillLayer(selectedName: string, minZoom = 0) {
  return {
    id: 'base-area-selection-fill',
    type: 'fill' as const,
    minzoom: minZoom,
    filter: ['==', ['get', 'name'], selectedName] as any,
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.25,
    },
  }
}

export function buildBaseAreaSelectionOutlineLayer(selectedName: string, minZoom = 0) {
  return {
    id: 'base-area-selection-outline',
    type: 'line' as const,
    minzoom: minZoom,
    filter: ['==', ['get', 'name'], selectedName] as any,
    paint: {
      'line-color': '#2563eb',
      'line-width': 2.5,
      'line-opacity': 1,
    },
  }
}
