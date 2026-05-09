'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// 4× larger canvas for smoother municipality polygons
// Individual prefectures span 0.5–5°; at W=2800 each 0.001° ≈ 0.56–5.6px (well above toFixed(1) threshold)
const W = 2800
const H = 2400
const MAP_PADDING = 120

type ViewBox = { x: number; y: number; width: number; height: number }

const parseGlobalViewBox = (vb: string) => {
  const parts = vb.split(',')
  return {
    minLon: parseFloat(parts[1]),
    minLat: parseFloat(parts[2]),
    lonRange: parseFloat(parts[3]),
    latRange: parseFloat(parts[4]),
  }
}

const projectCoords = (
  d: string,
  minLon: number,
  maxLat: number,
  lonRange: number,
  latRange: number,
): string => {
  const scale = Math.min((W - MAP_PADDING * 2) / lonRange, (H - MAP_PADDING * 2) / latRange)
  const offsetX = (W - lonRange * scale) / 2
  const offsetY = (H - latRange * scale) / 2
  return d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, lonStr, latStr) => {
    const x = (parseFloat(lonStr) - minLon) * scale + offsetX
    const y = (maxLat - parseFloat(latStr)) * scale + offsetY
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
}

type Props = {
  prefCode: string
  municipalities: MunicipalityEntry[]
  hoveredCode: string | null
  onSelect: (id: string, codes: string[]) => void
  onHover: (id: string | null, label: string | null, shelterCount?: number, teamCount?: number) => void
}

export default function MuniSelectMap({ prefCode, municipalities, hoveredCode, onSelect, onHover }: Props) {
  const [rawPaths, setRawPaths] = useState<RawPath[]>([])
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width: W, height: H })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ startX: number; startY: number; startVB: ViewBox } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!prefCode) return
    setViewBox({ x: 0, y: 0, width: W, height: H })
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

  // ─── Zoom helpers ────────────────────────────────────────
  const zoomAtPoint = useCallback((zoomFactor: number, clientX: number, clientY: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    setViewBox((cur) => {
      const nextW = Math.min(W, Math.max(W * 0.12, cur.width * zoomFactor))
      const nextH = Math.min(H, Math.max(H * 0.12, cur.height * zoomFactor))
      const anchorX = cur.x + cur.width * relX
      const anchorY = cur.y + cur.height * relY
      const nextX = anchorX - nextW * relX
      const nextY = anchorY - nextH * relY
      return {
        x: Math.min(Math.max(0, nextX), W - nextW),
        y: Math.min(Math.max(0, nextY), H - nextH),
        width: nextW,
        height: nextH,
      }
    })
  }, [])

  const zoomCenter = useCallback((factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    zoomAtPoint(factor, rect.left + rect.width / 2, rect.top + rect.height / 2, svg)
  }, [zoomAtPoint])

  const resetView = useCallback(() => {
    setViewBox({ x: 0, y: 0, width: W, height: H })
  }, [])

  // ─── Wheel zoom (non-passive to call preventDefault) ────
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      zoomAtPoint(e.deltaY > 0 ? 1.18 : 0.85, e.clientX, e.clientY, svg)
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [zoomAtPoint])

  // ─── Drag handlers ───────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    drag.current = { startX: e.clientX, startY: e.clientY, startVB: viewBox }
    setIsDragging(false)
  }, [viewBox])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) setIsDragging(true)
    if (!isDragging && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = drag.current.startVB.width / rect.width
    const scaleY = drag.current.startVB.height / rect.height
    const vb = drag.current.startVB
    setViewBox({
      x: Math.min(Math.max(0, vb.x - dx * scaleX), W - vb.width),
      y: Math.min(Math.max(0, vb.y - dy * scaleY), H - vb.height),
      width: vb.width,
      height: vb.height,
    })
  }, [isDragging])

  const onMouseUp = useCallback(() => {
    drag.current = null
    setIsDragging(false)
  }, [])

  const isZoomed = W / viewBox.width > 1.05

  return (
    <div className={styles.mapSvgOuter}>
      <div className={styles.selectMapControls} aria-label="地図操作">
        <button className={styles.mapControlButton} onClick={() => zoomCenter(0.65)} aria-label="拡大">＋</button>
        <button className={styles.mapControlButton} onClick={() => zoomCenter(1.54)} aria-label="縮小">−</button>
        <button
          className={styles.mapControlButton}
          onClick={resetView}
          aria-label="全体表示"
          disabled={!isZoomed}
        >
          ⌂
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className={`${styles.mapSvg} ${isDragging ? styles.mapSvgDragging : ''}`}
        aria-label="市区町村選択マップ"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
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
              onClick={!isEmpty && !isDragging ? () => onSelect(p.groupKey, p.municipalityCodes) : undefined}
              onMouseEnter={() => onHover(p.groupKey, p.label, p.shelterCount, p.teamActivityCount)}
              onMouseLeave={() => onHover(null, null)}
              aria-label={p.label}
            />
          )
        })}
      </svg>
    </div>
  )
}
