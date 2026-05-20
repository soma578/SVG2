import type { RuntimeDataSource } from './mapTypes'

const DATA_CACHE_NAME = 'svgmap-runtime-data-v1'

export const fetchJsonWithRuntimeCache = async <T,>(url: string): Promise<{ data: T; source: RuntimeDataSource }> => {
  const absoluteUrl = new URL(url, window.location.href).href
  const request = new Request(absoluteUrl, { method: 'GET' })
  try {
    const response = await fetch(absoluteUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return { data: await response.json() as T, source: 'network' }
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) {
        console.warn('[page] using cached runtime data', { url, error })
        return { data: await cached.json() as T, source: 'cache' }
      }
    }
    throw error
  }
}

export const fetchTextWithRuntimeCache = async (url: string): Promise<{ data: string; source: RuntimeDataSource }> => {
  const absoluteUrl = new URL(url, window.location.href).href
  const request = new Request(absoluteUrl, { method: 'GET' })
  try {
    const response = await fetch(absoluteUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return { data: await response.text(), source: 'network' }
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) {
        console.warn('[page] using cached runtime text', { url, error })
        return { data: await cached.text(), source: 'cache' }
      }
    }
    throw error
  }
}
