'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { MEDIA_QUERIES } from '@/lib/breakpoints'

export const useMediaQuery = (query: string): boolean => {
  const subscribe = (callback: () => void) => {
    if (typeof window === 'undefined') return () => {}
    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', callback)
    return () => mediaQuery.removeEventListener('change', callback)
  }

  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export const useIsMobile = (): boolean => useMediaQuery(MEDIA_QUERIES.mobile)

export const useIsNotDesktop = (): boolean => useMediaQuery(MEDIA_QUERIES.notDesktop)

export const useHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
