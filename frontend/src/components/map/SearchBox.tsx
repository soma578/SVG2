'use client'

import { useEffect, useRef, useState } from 'react'
import { currentMapRegionConfig, type CurrentMapRegionConfig } from '@/lib/currentMapRegion'

export interface SearchResult {
  id: string
  name: string
  type: 'district' | 'shelter' | 'team'
  lat: number
  lon: number
  zoom?: number
  latSpan?: number
  lonSpan?: number
  address?: string
  layerId?: string
  selectedFeatureId?: string
  subtitle?: string
  category?: string
  summary?: string
  url?: string
  source?: string
  status?: string
  note?: string
  facilityType?: string
  capacity?: number
  barrierFree?: boolean
  pets?: boolean
  teamId?: string
  teamName?: string
  operator?: string
  area?: string
  activityType?: string
  updatedAt?: string
  searchableText?: string
}

interface SearchBoxProps {
  onResultSelect: (result: SearchResult) => void
  regionConfig?: CurrentMapRegionConfig
}

const toNumber = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const buildShelterEntries = (
  shelters: any[],
  regionConfig: CurrentMapRegionConfig
): SearchResult[] =>
  shelters.flatMap((entry: any, idx: number) => {
    const lon = toNumber(entry?.lon)
    const lat = toNumber(entry?.lat)
    if (lon == null || lat == null) return []

    const name = String(entry?.title || entry?.name || '').trim()
    if (!name) return []
    const address = String(entry?.address || '').trim() || undefined
    const selectedFeatureId = String(entry?.id || `shelter-${idx}`)
    const status = String(entry?.status || '').trim()
    const facilityType = String(entry?.facilityType || '').trim()
    const searchableText = [name, address, facilityType, entry?.note, status].filter(Boolean).join(' ')

    return [{
      id: selectedFeatureId,
      selectedFeatureId,
      layerId: 'evacuation',
      name,
      type: 'shelter',
      lat,
      lon,
      zoom: 16,
      address,
      category: 'evacuation',
      subtitle: facilityType || undefined,
      summary: entry?.note || (status ? `状態: ${status}` : undefined),
      source: regionConfig.sheltersSourceLabel,
      status: status || undefined,
      note: entry?.note || undefined,
      facilityType: facilityType || undefined,
      capacity: typeof entry?.capacity === 'number' ? entry.capacity : undefined,
      barrierFree: typeof entry?.barrierFree === 'boolean' ? entry.barrierFree : undefined,
      pets: typeof entry?.pets === 'boolean' ? entry.pets : undefined,
      updatedAt: entry?.updatedAt || undefined,
      searchableText,
    }]
  })

const buildDistrictEntries = (
  districtDict: Record<string, any>,
  regionConfig: CurrentMapRegionConfig
): SearchResult[] =>
  Object.entries(districtDict).flatMap(([key, value]) => {
    const lon = toNumber(value?.centroid_lon)
    const lat = toNumber(value?.centroid_lat)
    if (lon == null || lat == null) return []

    const district = value?.district || value?.district_norm || ''
    const city = value?.city || ''
    const ward = value?.ward || ''
    const pref = value?.pref || ''
    const fullName = `${city}${ward}${district}`.trim() || key.replace(/\|/g, '')
    const address = `${pref}${city}${ward}${district}`.trim() || undefined
    const keyCode = value?.key_code || key
    const searchableText = [fullName, address, district, value?.district_norm, key.replace(/\|/g, ''), key]
      .filter(Boolean)
      .join(' ')

    return [{
      id: `district-${keyCode}`,
      selectedFeatureId: `district-${keyCode}`,
      name: fullName,
      type: 'district',
      layerId: 'baseArea',
      lat,
      lon,
      zoom: 15,
      address,
      subtitle: [city, ward].filter(Boolean).join(' ') || undefined,
      category: 'baseArea',
      summary: district ? `地区: ${district}` : undefined,
      source: regionConfig.districtDictionaryUrl,
      searchableText,
    }]
  })

const buildMunicipalityEntries = (entries: any[]): SearchResult[] =>
  entries.flatMap((entry: any, index: number) => {
    const lon = toNumber(entry?.lon)
    const lat = toNumber(entry?.lat)
    if (lon == null || lat == null) return []

    const name = String(entry?.name || '').trim()
    if (!name) return []
    const address = String(entry?.address || '').trim() || undefined
    const searchableText = [name, address, entry?.subtitle, entry?.summary, entry?.id]
      .filter(Boolean)
      .join(' ')

    return [{
      id: String(entry?.id || `municipality-${index + 1}`),
      name,
      type: 'district',
      layerId: 'baseArea',
      lat,
      lon,
      zoom: 10,
      latSpan: typeof entry?.latSpan === 'number' ? entry.latSpan : undefined,
      lonSpan: typeof entry?.lonSpan === 'number' ? entry.lonSpan : undefined,
      address,
      subtitle: String(entry?.subtitle || '').trim() || undefined,
      category: 'baseArea',
      summary: String(entry?.summary || '').trim() || undefined,
      source: String(entry?.source || '').trim() || undefined,
      searchableText,
    }]
  })

const buildTeamActivityEntries = (
  teamActivities: any[],
  regionConfig: CurrentMapRegionConfig
): SearchResult[] =>
  teamActivities.flatMap((entry: any, idx: number) => {
    const lon = toNumber(entry?.lon)
    const lat = toNumber(entry?.lat)
    if (lon == null || lat == null) return []

    const name = String(entry?.title || entry?.teamName || '').trim()
    if (!name) return []
    const operator = String(entry?.operator || '').trim()
    const area = String(entry?.area || '').trim()
    const note = String(entry?.note || '').trim()
    const status = String(entry?.status || '').trim()
    const activityType = String(entry?.activityType || '').trim()
    const id = String(entry?.id || `team-${idx}`)
    const searchableText = [name, entry?.teamName, operator, area, note, status, activityType]
      .filter(Boolean)
      .join(' ')

    return [{
      id,
      selectedFeatureId: id,
      layerId: 'teamActivity',
      name,
      type: 'team',
      lat,
      lon,
      zoom: 15,
      address: area || undefined,
      category: 'teamActivity',
      subtitle: activityType || operator || undefined,
      summary: note || (status ? `状態: ${status}` : undefined),
      updatedAt: entry?.updatedAt || undefined,
      source: regionConfig.teamActivitySourceLabel,
      status: status || undefined,
      note: note || undefined,
      teamId: entry?.teamId ? String(entry.teamId) : undefined,
      teamName: entry?.teamName ? String(entry.teamName) : name,
      operator: operator || undefined,
      area: area || undefined,
      activityType: activityType || undefined,
      searchableText,
    }]
  })

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

export default function SearchBox({
  onResultSelect,
  regionConfig = currentMapRegionConfig,
}: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [districtItems, setDistrictItems] = useState<SearchResult[]>([])
  const [remoteItems, setRemoteItems] = useState<SearchResult[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [suspendSuggestions, setSuspendSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const remoteResultsCacheRef = useRef(new Map<string, SearchResult[]>())

  useEffect(() => {
    let cancelled = false

    fetchJson(regionConfig.districtDictionaryUrl)
      .then((districts) => {
        if (cancelled) return
        setDistrictItems(buildDistrictEntries(districts, regionConfig))
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[SearchBox] Failed to load district index:', error)
      })

    return () => {
      cancelled = true
    }
  }, [regionConfig])

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      setRemoteItems([])
      return
    }

    const cacheKey = `${regionConfig.regionId}:${normalizedQuery.toLowerCase()}`
    const cached = remoteResultsCacheRef.current.get(cacheKey)
    if (cached) {
      setRemoteItems(cached)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      fetch(
        `/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=10&region=${encodeURIComponent(regionConfig.regionId)}`,
        {
          cache: 'no-store',
          signal: controller.signal,
        }
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((payload) => {
          const nextItems = [
            ...buildMunicipalityEntries(
              Array.isArray(payload?.municipalities) ? payload.municipalities : []
            ),
            ...buildShelterEntries(
              Array.isArray(payload?.shelters) ? payload.shelters : [],
              regionConfig
            ),
            ...buildTeamActivityEntries(
              Array.isArray(payload?.teamActivities) ? payload.teamActivities : [],
              regionConfig
            ),
          ]
          remoteResultsCacheRef.current.set(cacheKey, nextItems)
          setRemoteItems(nextItems)
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.warn('[SearchBox] search request failed:', error?.message || error)
        })
    }, 150)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query, regionConfig])

  const districtResults = (() => {
    if (!query || query.length < 2) return []
    const normalizedQuery = query.toLowerCase().trim()
    return districtItems
      .filter((item) => {
        const searchable = (item.searchableText || '').toLowerCase()
        if (searchable.includes(normalizedQuery)) return true
        if (item.name?.toLowerCase().includes(normalizedQuery)) return true
        if (item.address?.toLowerCase().includes(normalizedQuery)) return true
        return false
      })
      .slice(0, 8)
  })()
  const results = [...districtResults, ...remoteItems].slice(0, 20)
  const isOpen = isFocused && !suspendSuggestions && results.length > 0

  const handleSelect = (result: SearchResult) => {
    setQuery(result.name)
    setIsFocused(true)
    setSuspendSuggestions(true)
    setSelectedIndex(-1)
    onResultSelect(result)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setIsFocused(false)
      setSelectedIndex(-1)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSuspendSuggestions(false)
          setSelectedIndex(-1)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        placeholder={regionConfig.searchPlaceholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {isOpen && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handleSelect(result)}
              className={`w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 ${
                index === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-medium text-gray-900">{result.name}</div>
              <div className="text-xs text-gray-500">
                {[result.type, result.address, result.subtitle].filter(Boolean).join(' / ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
