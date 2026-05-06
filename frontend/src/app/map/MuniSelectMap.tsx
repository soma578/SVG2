'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'

type MunicipalityEntry = {
  id: string
  type?: 'city' | 'town' | 'village'
  label: string
  displayCode?: string
  municipalityCodes?: string[]
  shelterCount?: number
  teamActivityCount?: number
  dataStatus?: string
  hasDistrictPolygons?: boolean
  districtSvgUrls?: string[]
  viewport?: { lat: number; lon: number; latSpan: number; lonSpan: number }
}

type RawPath = { code: string; d: string }

type MuniPath = {
  svgCode: string
  groupKey: string
  d: string
  label: string
  dataStatus: string
  municipalityCodes: string[]
  shelterCount?: number
  teamActivityCount?: number
}

const W = 700
const H = 600

const parseGlobalViewBox = (vb: string) => {
  const parts = vb.split(',')
  return {
    minLon: parseFloat(parts[1]),
    minLat: parseFloat(parts[2]),
    lonRange: parseFloat(parts[3]),
    latRange: parseFloat(parts[4]),
  }
}

const projectCoords = (d: string, minLon: number, maxLat: number, lonRange: number, latRange: number): string =>
  d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, lonStr, latStr) => {
    const x = ((parseFloat(lonStr) - minLon) / lonRange) * W
    const y = ((maxLat - parseFloat(latStr)) / latRange) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

type Props = {
  prefCode: string
  municipalities: MunicipalityEntry[]
  hoveredCode: string | null
  onSelect: (id: string, codes: string[]) => void
  onHover: (id: string | null, label: string | null, shelterCount?: number, teamCount?: number) => void
}

export default function MuniSelectMap({ prefCode, municipalities, hoveredCode, onSelect, onHover }: Props) {
  const [rawPaths, setRawPaths] = useState<RawPath[]>([])

  useEffect(() => {
    if (!prefCode) return
    let cancelled = false
    fetch(`/map/layers/overview/pref/${prefCode}.svg`)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const vbAttr = doc.documentElement.getAttribute('viewBox') || ''
        const { minLon, minLat, lonRange, latRange } = parseGlobalViewBox(vbAttr)
        const maxLat = minLat + latRange

        const paths: RawPath[] = []
        doc.querySelectorAll('path[data-n03-code]').forEach((el) => {
          const code = el.getAttribute('data-n03-code') || ''
          const rawD = el.getAttribute('d') || ''
          const projD = projectCoords(rawD, minLon, maxLat, lonRange, latRange)
          paths.push({ code, d: projD })
        })
        setRawPaths(paths)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [prefCode])

  // Build lookup: any code (displayCode or individual in municipalityCodes) → municipality entry
  const muniByCode = useMemo(() => {
    const map: Record<string, MunicipalityEntry> = {}
    for (const m of municipalities) {
      if (m.displayCode) map[m.displayCode] = m
      if (m.municipalityCodes) {
        for (const c of m.municipalityCodes) map[c] = m
      }
    }
    return map
  }, [municipalities])

  const paths: MuniPath[] = useMemo(() =>
    rawPaths.map((rp) => {
      const muni = muniByCode[rp.code]
      const groupKey = muni?.id || rp.code
      return {
        svgCode: rp.code,
        groupKey,
        d: rp.d,
        label: muni?.label || rp.code,
        dataStatus: muni?.dataStatus || 'empty',
        municipalityCodes: muni?.municipalityCodes || [rp.code],
        shelterCount: muni?.shelterCount,
        teamActivityCount: muni?.teamActivityCount,
      }
    }),
    [rawPaths, muniByCode]
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.mapSvg} aria-label="市区町村選択マップ">
      {paths.map((p, i) => {
        const isHovered = hoveredCode === p.groupKey
        const isEmpty = p.dataStatus === 'empty'
        return (
          <path
            key={`${p.svgCode}-${i}`}
            d={p.d}
            className={[
              styles.muniPath,
              isEmpty ? styles.muniPathEmpty : styles.muniPathAvailable,
              p.dataStatus === 'partial' ? styles.muniPathPartial : '',
              isHovered ? styles.muniPathHover : '',
            ].filter(Boolean).join(' ')}
            onClick={!isEmpty ? () => onSelect(p.groupKey, p.municipalityCodes) : undefined}
            onMouseEnter={() => onHover(p.groupKey, p.label, p.shelterCount, p.teamActivityCount)}
            onMouseLeave={() => onHover(null, null)}
            aria-label={p.label}
          />
        )
      })}
    </svg>
  )
}
