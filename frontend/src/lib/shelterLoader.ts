'use client'

import type { Shelter } from '@/types'

const CSV_SPLIT_REGEX = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/

const decodeCsvField = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

const parseCsv = (csvText: string): Shelter[] => {
  const lines = csvText.trim().split('\n')
  if (lines.length <= 1) return []

  return lines.slice(1).reduce<Shelter[]>((acc, line, index) => {
    if (!line.trim()) return acc
    const cells = line.split(CSV_SPLIT_REGEX).map(decodeCsvField)
    if (cells.length < 6) return acc
    const [name, kind, lon, lat, url, summary] = cells
    const lonVal = Number(lon)
    const latVal = Number(lat)
    if (Number.isNaN(lonVal) || Number.isNaN(latVal)) return acc
    acc.push({
      id: `shelter-${index}`,
      name,
      kind,
      lon: lonVal,
      lat: latVal,
      url: url || '#',
      summary: summary || '',
    })
    return acc
  }, [])
}

/**
 * Loads shelter data.
 * 1. Tries the Next.js API (development / SSR)
 * 2. Fallback to CSV parsing (static export / Tauri)
 */
export async function loadShelters(): Promise<Shelter[]> {
  try {
    const apiResponse = await fetch('/api/shelters')
    if (apiResponse.ok) {
      return await apiResponse.json()
    }
  } catch (error) {
    console.warn('Shelter API unavailable, fallback to CSV:', error)
  }

  const csvResponse = await fetch('/map/data/shelters_okayama.csv')
  const csvText = await csvResponse.text()
  return parseCsv(csvText)
}
