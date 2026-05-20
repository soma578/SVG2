'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GeoViewport } from './mapTypes'
import { clampViewportSpan } from './mapGeo'
import { findLocationTarget } from './mapLocationData'

type UseCurrentLocationOptions = {
  region: string | null
  municipalityId: string
  resolvedViewport: GeoViewport | null
  mapViewport: GeoViewport | null
  runtimeReady: boolean
  focusLocation: (viewport: GeoViewport) => void
  postViewport: (viewport: GeoViewport) => void
  postCurrentLocation: (lat: number, lon: number) => void
}

export const useCurrentLocation = ({
  region,
  municipalityId,
  resolvedViewport,
  mapViewport,
  runtimeReady,
  focusLocation,
  postViewport,
  postCurrentLocation,
}: UseCurrentLocationOptions) => {
  const router = useRouter()
  const pendingRef = useRef<{
    lat: number
    lon: number
    region: string
    municipalityId: string
  } | null>(null)
  const [locationStatus, setLocationStatus] = useState('')

  const focusCurrentLocationOnce = useCallback((lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    const base = resolvedViewport
    const latSpan = clampViewportSpan(Math.min((base?.latSpan ?? 0.08) * 0.32, 0.045), 0.012, 0.08)
    const lonSpan = clampViewportSpan(Math.min((base?.lonSpan ?? 0.1) * 0.32, 0.06), 0.012, 0.1)
    focusLocation({ lat, lon, latSpan, lonSpan })
    setLocationStatus('現在地へ移動しました')
  }, [focusLocation, resolvedViewport])

  useEffect(() => {
    if (!runtimeReady) return
    const pending = pendingRef.current
    if (!pending) return
    if (pending.region !== region || pending.municipalityId !== municipalityId) return
    pendingRef.current = null
    focusCurrentLocationOnce(pending.lat, pending.lon)
  }, [focusCurrentLocationOnce, municipalityId, region, runtimeReady])

  const locateCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('このブラウザでは現在地取得が使えません')
      return
    }
    setLocationStatus('現在地を取得中...')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        const target = await findLocationTarget(lat, lon)

        if (target) {
          const codes = (target.municipality.municipalityCodes || [target.municipality.id]).filter(Boolean)
          const codesParam = codes.length > 0 ? `&municipalityCodes=${encodeURIComponent(codes.join(','))}` : ''
          setLocationStatus(`現在地に近い地域へ移動: ${target.municipality.label}`)
          pendingRef.current = { lat, lon, region: target.region.id, municipalityId: target.municipality.id }
          if (region === target.region.id && municipalityId === target.municipality.id) {
            pendingRef.current = null
            focusCurrentLocationOnce(lat, lon)
          } else {
            router.push(`/map?region=${encodeURIComponent(target.region.id)}&municipalityId=${encodeURIComponent(target.municipality.id)}${codesParam}`)
          }
          return
        }

        const base = mapViewport || resolvedViewport
        postViewport({
          lat,
          lon,
          latSpan: clampViewportSpan((base?.latSpan ?? 0.12) * 0.82, 0.02, 4),
          lonSpan: clampViewportSpan((base?.lonSpan ?? 0.16) * 0.82, 0.02, 4),
        })
        window.setTimeout(() => postCurrentLocation(lat, lon), 450)
        setLocationStatus('現在地へ移動しました')
      },
      (error) => {
        console.warn('[useCurrentLocation] geolocation failed', error)
        setLocationStatus('現在地を取得できませんでした')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }, [focusCurrentLocationOnce, mapViewport, municipalityId, postCurrentLocation, postViewport, region, resolvedViewport, router])

  return { locationStatus, setLocationStatus, locateCurrentPosition }
}
