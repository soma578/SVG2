'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const JAPAN_VIEWBOX = {
  x: 122.434,
  y: 0,
  width: 32.053,
  height: 22.51,
}
const JAPAN_FLIP_TRANSFORM = `matrix(1 0 0 -1 0 46.056)`
const parseGlobalViewBox = (vb: string) => {
  const parts = vb.split(',')
  return {
    minLon: parseFloat(parts[1]),
    minLat: parseFloat(parts[2]),
    lonRange: parseFloat(parts[3]),
    latRange: parseFloat(parts[4]),
  }
}

type ViewBox = { x: number; y: number; width: number; height: number }

const lerpVB = (cur: ViewBox, target: ViewBox, t: number): ViewBox => ({
  x: cur.x + (target.x - cur.x) * t,
  y: cur.y + (target.y - cur.y) * t,
  width: cur.width + (target.width - cur.width) * t,
  height: cur.height + (target.height - cur.height) * t,
})

const vbDone = (cur: ViewBox, target: ViewBox) =>
  Math.abs(cur.width - target.width) < 0.8 &&
  Math.abs(cur.height - target.height) < 0.8 &&
  Math.abs(cur.x - target.x) < 0.8 &&
  Math.abs(cur.y - target.y) < 0.8

type Props = {
  regions: PrefectureEntry[]
  hoveredCode: string | null
  onSelect: (regionId: string, prefCode: string, label: string) => void
  onHover: (prefCode: string | null, label: string | null) => void
}

export default function PrefSelectMap({ regions, hoveredCode, onSelect, onHover }: Props) {
  const [rawPaths, setRawPaths] = useState<RawPath[]>([])
  const [viewBox, setViewBox] = useState<ViewBox>(JAPAN_VIEWBOX)
  const svgRef = useRef<SVGSVGElement>(null)

  // Smooth zoom state
  const targetVB = useRef<ViewBox>(JAPAN_VIEWBOX)
  const rafId = useRef<number | null>(null)

  // Drag state
  const drag = useRef<{ startX: number; startY: number; startVB: ViewBox } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(JAPAN_SVG)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const vbAttr = doc.documentElement.getAttribute('viewBox') || ''
        parseGlobalViewBox(vbAttr)
        const grouped: Record<string, { d: string; label: string }> = {}
        doc.querySelectorAll('path[data-pref-code]').forEach((el) => {
          const code = el.getAttribute('data-pref-code') || ''
          const label = el.getAttribute('data-pref') || ''
          const rawD = el.getAttribute('d') || ''
          if (!grouped[code]) {
            grouped[code] = { d: rawD, label }
          } else {
            grouped[code].d += ' ' + rawD
          }
        })
        setRawPaths(Object.entries(grouped).map(([code, { d, label }]) => ({ code, d, label })))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [])

  // Cleanup RAF on unmount
  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current) }, [])

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

  // ─── Smooth zoom animation ───────────────────────────────
  const startAnimation = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
    const step = () => {
      setViewBox((cur) => {
        const target = targetVB.current
        if (vbDone(cur, target)) {
          rafId.current = null
          return target
        }
        rafId.current = requestAnimationFrame(step)
        return lerpVB(cur, target, 0.16)
      })
    }
    rafId.current = requestAnimationFrame(step)
  }, [])

  const computeZoomTarget = useCallback((
    zoomFactor: number,
    clientX: number,
    clientY: number,
    target: SVGSVGElement,
    fromVB: ViewBox,
  ): ViewBox => {
    const rect = target.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    const nextW = Math.min(JAPAN_VIEWBOX.width, Math.max(JAPAN_VIEWBOX.width * 0.15, fromVB.width * zoomFactor))
    const nextH = Math.min(JAPAN_VIEWBOX.height, Math.max(JAPAN_VIEWBOX.height * 0.15, fromVB.height * zoomFactor))
    const anchorX = fromVB.x + fromVB.width * relX
    const anchorY = fromVB.y + fromVB.height * relY
    const nextX = anchorX - nextW * relX
    const nextY = anchorY - nextH * relY
    return {
      x: Math.min(Math.max(JAPAN_VIEWBOX.x, nextX), JAPAN_VIEWBOX.x + JAPAN_VIEWBOX.width - nextW),
      y: Math.min(Math.max(JAPAN_VIEWBOX.y, nextY), JAPAN_VIEWBOX.y + JAPAN_VIEWBOX.height - nextH),
      width: nextW,
      height: nextH,
    }
  }, [])

  const zoomAtPoint = useCallback((factor: number, clientX: number, clientY: number, svg: SVGSVGElement) => {
    // Compute target from current target (chain zooms smoothly)
    const newTarget = computeZoomTarget(factor, clientX, clientY, svg, targetVB.current)
    targetVB.current = newTarget
    startAnimation()
  }, [computeZoomTarget, startAnimation])

  const zoomCenter = useCallback((factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    zoomAtPoint(factor, rect.left + rect.width / 2, rect.top + rect.height / 2, svg)
  }, [zoomAtPoint])

  const resetView = useCallback(() => {
    targetVB.current = JAPAN_VIEWBOX
    startAnimation()
  }, [startAnimation])

  // ─── Wheel (non-passive) ─────────────────────────────────
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

  // ─── Drag (immediate, no animation) ─────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    // Stop any ongoing animation so drag is immediate
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
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
    const next: ViewBox = {
      x: Math.min(Math.max(JAPAN_VIEWBOX.x, vb.x - dx * scaleX), JAPAN_VIEWBOX.x + JAPAN_VIEWBOX.width - vb.width),
      y: Math.min(Math.max(JAPAN_VIEWBOX.y, vb.y - dy * scaleY), JAPAN_VIEWBOX.y + JAPAN_VIEWBOX.height - vb.height),
      width: vb.width,
      height: vb.height,
    }
    targetVB.current = next
    setViewBox(next)
  }, [isDragging])

  const onMouseUp = useCallback(() => {
    drag.current = null
    setIsDragging(false)
  }, [])

  // ─── Touch ───────────────────────────────────────────────
  const touch = useRef<{ startX: number; startY: number; startVB: ViewBox } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 1) return
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    const t = e.touches[0]
    touch.current = { startX: t.clientX, startY: t.clientY, startVB: viewBox }
  }, [viewBox])

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 1 || !touch.current) return
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - touch.current.startX
    const dy = t.clientY - touch.current.startY
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = touch.current.startVB.width / rect.width
    const scaleY = touch.current.startVB.height / rect.height
    const vb = touch.current.startVB
    const next: ViewBox = {
      x: Math.min(Math.max(JAPAN_VIEWBOX.x, vb.x - dx * scaleX), JAPAN_VIEWBOX.x + JAPAN_VIEWBOX.width - vb.width),
      y: Math.min(Math.max(JAPAN_VIEWBOX.y, vb.y - dy * scaleY), JAPAN_VIEWBOX.y + JAPAN_VIEWBOX.height - vb.height),
      width: vb.width,
      height: vb.height,
    }
    targetVB.current = next
    setViewBox(next)
  }, [])

  const onTouchEnd = useCallback(() => { touch.current = null }, [])

  const isZoomed = viewBox.width < JAPAN_VIEWBOX.width - 0.01 || viewBox.height < JAPAN_VIEWBOX.height - 0.01

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
        aria-label="都道府県選択マップ"
        shapeRendering="geometricPrecision"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <g transform={JAPAN_FLIP_TRANSFORM}>
          {paths.map((p) => {
            const isAvailable = p.dataStatus === 'available'
            const isHovered = hoveredCode === p.code
            return (
              <path
                key={p.code}
                d={p.d}
                vectorEffect="non-scaling-stroke"
                className={[
                  styles.prefPath,
                  isAvailable ? styles.prefPathAvailable : styles.prefPathEmpty,
                  isHovered ? styles.prefPathHover : '',
                ].filter(Boolean).join(' ')}
                onClick={isAvailable && !isDragging ? () => onSelect(p.regionId, p.code, p.label) : undefined}
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
