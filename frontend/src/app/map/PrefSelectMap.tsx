'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'

type PrefectureEntry = {
  id: string
  prefCode?: string
  label: string
  dataStatus?: string
}

type RawPath = {
  code: string
  d: string
  label: string
}

type PrefPath = RawPath & {
  regionId: string
  dataStatus: string
}

const JAPAN_SVG = '/map/layers/overview/japan.svg'
const W = 960
const H = 660

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
  regions: PrefectureEntry[]
  hoveredCode: string | null
  onSelect: (regionId: string, prefCode: string, label: string) => void
  onHover: (prefCode: string | null, label: string | null) => void
}

export default function PrefSelectMap({ regions, hoveredCode, onSelect, onHover }: Props) {
  const [rawPaths, setRawPaths] = useState<RawPath[]>([])
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: W, height: H })

  useEffect(() => {
    let cancelled = false
    fetch(JAPAN_SVG)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const vbAttr = doc.documentElement.getAttribute('viewBox') || ''
        const { minLon, minLat, lonRange, latRange } = parseGlobalViewBox(vbAttr)
        const maxLat = minLat + latRange

        const grouped: Record<string, RawPath> = {}
        doc.querySelectorAll('path[data-pref-code]').forEach((el) => {
          const code = el.getAttribute('data-pref-code') || ''
          const label = el.getAttribute('data-pref') || ''
          const rawD = el.getAttribute('d') || ''
          const projD = projectCoords(rawD, minLon, maxLat, lonRange, latRange)
          if (!grouped[code]) {
            grouped[code] = { code, d: projD, label }
          } else {
            grouped[code].d += ' ' + projD
          }
        })
        setRawPaths(Object.values(grouped))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [])

  const regionByCode = useMemo(() => {
    const map: Record<string, PrefectureEntry> = {}
    for (const r of regions) {
      if (r.prefCode) map[r.prefCode] = r
    }
    return map
  }, [regions])

  const paths: PrefPath[] = useMemo(() =>
    rawPaths.map((rp) => {
      const region = regionByCode[rp.code]
      return {
        ...rp,
        label: region?.label || rp.label,
        regionId: region?.id || '',
        dataStatus: region?.dataStatus || 'empty',
      }
    }),
    [rawPaths, regionByCode]
  )

  const zoomAtPoint = (zoomFactor: number, clientX: number, clientY: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    setViewBox((current) => {
      const nextWidth = Math.min(W, Math.max(W * 0.35, current.width * zoomFactor))
      const nextHeight = Math.min(H, Math.max(H * 0.35, current.height * zoomFactor))
      const anchorX = current.x + current.width * relX
      const anchorY = current.y + current.height * relY
      const nextX = anchorX - nextWidth * relX
      const nextY = anchorY - nextHeight * relY
      return {
        x: Math.min(Math.max(0, nextX), W - nextWidth),
        y: Math.min(Math.max(0, nextY), H - nextHeight),
        width: nextWidth,
        height: nextHeight,
      }
    })
  }

  return (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      className={styles.mapSvg}
      aria-label="都道府県選択マップ"
      onWheel={(event) => {
        event.preventDefault()
        zoomAtPoint(event.deltaY > 0 ? 1.12 : 0.88, event.clientX, event.clientY, event.currentTarget)
      }}
    >
      {paths.map((p) => {
        const isAvailable = p.dataStatus === 'available'
        const isHovered = hoveredCode === p.code
        return (
          <path
            key={p.code}
            d={p.d}
            className={[
              styles.prefPath,
              isAvailable ? styles.prefPathAvailable : styles.prefPathEmpty,
              isHovered ? styles.prefPathHover : '',
            ].filter(Boolean).join(' ')}
            onClick={isAvailable ? () => onSelect(p.regionId, p.code, p.label) : undefined}
            onMouseEnter={() => onHover(p.code, p.label)}
            onMouseLeave={() => onHover(null, null)}
            aria-label={p.label}
          />
        )
      })}
    </svg>
  )
}
