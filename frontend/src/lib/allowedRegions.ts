export const ALLOWED_MAP_REGIONS = new Set(['okayama'])

export const isAllowedMapRegion = (region: string) => ALLOWED_MAP_REGIONS.has(region)
