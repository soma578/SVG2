export const BREAKPOINTS = {
  mobile: 767,
  tablet: 1099,
} as const

export const MEDIA_QUERIES = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tablet: `(min-width: ${BREAKPOINTS.mobile + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tablet + 1}px)`,
  notDesktop: `(max-width: ${BREAKPOINTS.tablet}px)`,
} as const
