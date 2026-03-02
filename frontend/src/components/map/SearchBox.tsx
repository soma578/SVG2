'use client'

import { useState, useEffect, useRef } from 'react'

interface SearchResult {
  id: string
  name: string
  type: 'district' | 'shelter' | 'spot' | 'welfare'
  lat: number
  lon: number
  address?: string
  facilityType?: string
}

interface SearchBoxProps {
  onResultSelect: (result: SearchResult) => void
  districts?: any[]
  shelters?: any[]
  spots?: any[]
  welfareFacilities?: any[]
}

export default function SearchBox({ onResultSelect, districts, shelters, spots, welfareFacilities }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 検索実行
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    const searchResults: SearchResult[] = []
    const normalizedQuery = query.toLowerCase().trim()

    // 地区（町丁目）検索
    if (districts) {
      districts.forEach(district => {
        const name = district.properties?.s_name || district.properties?.S_NAME || ''
        const cityName = district.properties?.city_name || district.properties?.CITY_NAME || ''
        const fullName = `${cityName}${name}`

        if (fullName.toLowerCase().includes(normalizedQuery) || name.toLowerCase().includes(normalizedQuery)) {
          const coords = getCenter(district.geometry)
          if (coords) {
            searchResults.push({
              id: `district-${district.properties?.key_code || district.properties?.KEY_CODE || Math.random()}`,
              name: fullName,
              type: 'district',
              lat: coords[1],
              lon: coords[0],
            })
          }
        }
      })
    }

    // 避難所検索
    if (shelters) {
      shelters.forEach((shelter, idx) => {
        const name = shelter.properties?.P20_002 || shelter.properties?.name || ''
        const address = shelter.properties?.P20_003 || shelter.properties?.address || ''

        if (name.toLowerCase().includes(normalizedQuery) || address.toLowerCase().includes(normalizedQuery)) {
          const coords = shelter.geometry?.coordinates
          if (coords && coords.length >= 2) {
            searchResults.push({
              id: `shelter-${idx}`,
              name,
              type: 'shelter',
              lat: coords[1],
              lon: coords[0],
              address,
            })
          }
        }
      })
    }

    // スポット検索
    if (spots) {
      spots.forEach((spot, idx) => {
        const name = spot.properties?.name || ''
        const description = spot.properties?.description || ''

        if (name.toLowerCase().includes(normalizedQuery) || description.toLowerCase().includes(normalizedQuery)) {
          const coords = spot.geometry?.coordinates
          if (coords && coords.length >= 2) {
            searchResults.push({
              id: `spot-${idx}`,
              name,
              type: 'spot',
              lat: coords[1],
              lon: coords[0],
            })
          }
        }
      })
    }

    // 福祉施設検索（PMTilesからは検索不可のため、事前ロードが必要）
    // 注: 130,362施設すべてを検索するのは重いため、結果は20件まで
    if (welfareFacilities) {
      welfareFacilities.forEach((facility, idx) => {
        if (searchResults.length >= 20) return // 早期終了

        const name = facility.properties?.P14_007 || ''
        const address = `${facility.properties?.P14_001 || ''}${facility.properties?.P14_002 || ''}${facility.properties?.P14_003 || ''}`

        if (name.toLowerCase().includes(normalizedQuery) || address.toLowerCase().includes(normalizedQuery)) {
          const coords = facility.geometry?.coordinates
          if (coords && coords.length >= 2) {
            searchResults.push({
              id: `welfare-${idx}`,
              name,
              type: 'welfare',
              lat: coords[1],
              lon: coords[0],
              address,
            })
          }
        }
      })
    }

    // 結果を上位20件に制限
    setResults(searchResults.slice(0, 20))
    setIsOpen(searchResults.length > 0)
    setSelectedIndex(-1)
  }, [query, districts, shelters, spots, welfareFacilities])

  // ジオメトリの中心座標を取得
  const getCenter = (geometry: any): [number, number] | null => {
    if (!geometry || !geometry.coordinates) return null

    if (geometry.type === 'Point') {
      return geometry.coordinates
    } else if (geometry.type === 'Polygon') {
      const coords = geometry.coordinates[0]
      let sumLon = 0, sumLat = 0
      coords.forEach((coord: number[]) => {
        sumLon += coord[0]
        sumLat += coord[1]
      })
      return [sumLon / coords.length, sumLat / coords.length]
    } else if (geometry.type === 'MultiPolygon') {
      const coords = geometry.coordinates[0][0]
      let sumLon = 0, sumLat = 0
      coords.forEach((coord: number[]) => {
        sumLon += coord[0]
        sumLat += coord[1]
      })
      return [sumLon / coords.length, sumLat / coords.length]
    }

    return null
  }

  // 結果選択
  const handleSelect = (result: SearchResult) => {
    setQuery(result.name)
    setIsOpen(false)
    onResultSelect(result)
    inputRef.current?.blur()
  }

  // キーボード操作
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  // クリック外をクリックしたら閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'district': return '地区'
      case 'shelter': return '避難所'
      case 'spot': return 'スポット'
      case 'welfare': return '福祉施設'
      default: return ''
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'district': return '🗺️'
      case 'shelter': return '🏠'
      case 'spot': return '📍'
      case 'welfare': return '🏥'
      default: return '•'
    }
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          placeholder="住所、施設名、町丁目で検索..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
              setIsOpen(false)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 検索結果ドロップダウン */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto"
        >
          {results.map((result, index) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{getTypeIcon(result.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {result.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-blue-600 font-medium">
                      {getTypeLabel(result.type)}
                    </span>
                    {result.address && (
                      <span className="text-xs text-gray-500 truncate">
                        {result.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 結果なしの表示 */}
      {isOpen && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
          <div className="text-sm text-gray-500 text-center">
            「{query}」に一致する結果が見つかりませんでした
          </div>
        </div>
      )}
    </div>
  )
}
