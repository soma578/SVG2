const REGION_ID_PATTERN = /^[a-z0-9-]+$/

export const isAllowedMapRegion = (region: string) => REGION_ID_PATTERN.test(region)
