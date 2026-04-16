import {
  buildBaseAreaSelection,
  buildShelterSelection,
  buildTeamActivitySelection,
} from '@/features/map/maplibre/featurePopupBuilders'

export type PoiClickTargetType = 'baseArea' | 'shelter' | 'teamActivity'

export function buildPoiSelectionFromClick(params: {
  type: PoiClickTargetType
  props: Record<string, any>
  coords: [number, number]
}) {
  switch (params.type) {
    case 'baseArea':
      return buildBaseAreaSelection(params.props, params.coords)
    case 'shelter':
      return buildShelterSelection(params.props, params.coords)
    case 'teamActivity':
      return buildTeamActivitySelection(params.props, params.coords)
  }
}

export function getPoiClickLogLabel(type: PoiClickTargetType): string {
  switch (type) {
    case 'baseArea':
      return 'BaseArea'
    case 'shelter':
      return 'Shelter'
    case 'teamActivity':
      return 'TeamActivity'
  }
}
