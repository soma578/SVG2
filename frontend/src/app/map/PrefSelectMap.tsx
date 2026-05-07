'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  }>({ active: false, pointerId: null, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 })

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

  const clampScale = (value: number) => Math.min(3.5, Math.max(1, value))

  const zoomBy = (nextScale: number, clientX?: number, clientY?: number, targetRect?: DOMRect | null) => {
    const bounded = clampScale(nextScale)
    if (!targetRect || clientX === undefined || clientY === undefined) {
      setScale(bounded)
      return
    }
    const sx = clientX - targetRect.left
    const sy = clientY - targetRect.top
    const prevScale = scale
    const worldX = (sx - offset.x) / prevScale
    const worldY = (sy - offset.y) / prevScale
    setScale(bounded)
    setOffset({
      x: sx - worldX * bounded,
      y: sy - worldY * bounded,
    })
  }

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className={styles.prefMapShell}>
      <div className={styles.prefMapControls} aria-label="都道府県マップ操作">
        <button type="button" className={styles.prefMapButton} onClick={() => setScale((v) => clampScale(v * 1.2))}>+</button>
        <button type="button" className={styles.prefMapButton} onClick={() => setScale((v) => clampScale(v / 1.2))}>-</button>
        <button type="button" className={styles.prefMapButton} onClick={resetView}>reset</button>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.mapSvg}
        aria-label="都道府県選択マップ"
        onWheel={(event) => {
          event.preventDefault()
          const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
          const delta = event.deltaY > 0 ? 0.88 : 1.12
          zoomBy(scale * delta, event.clientX, event.clientY, rect)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          dragRef.current = {
            active: true,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
          }
        }}
        onPointerMove={(event) => {
          if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return
          const dx = event.clientX - dragRef.current.startX
          const dy = event.clientY - dragRef.current.startY
          setOffset({
            x: dragRef.current.startOffsetX + dx,
            y: dragRef.current.startOffsetY + dy,
          })
        }}
        onPointerUp={(event) => {
          if (dragRef.current.pointerId === event.pointerId) {
            dragRef.current.active = false
            dragRef.current.pointerId = null
          }
        }}
        onPointerCancel={() => {
          dragRef.current.active = false
          dragRef.current.pointerId = null
        }}
      >
        <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
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
        </g>
      </svg>
    </div>
  )
}
