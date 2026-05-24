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
type TouchPoint = Pick<React.Touch, 'clientX' | 'clientY'>
type TouchState =
  | { kind: 'pan'; startX: number; startY: number; startVB: ViewBox }
  | { kind: 'pinch'; startDist: number; startCenter: { x: number; y: number }; startVB: ViewBox }
  | null

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

const distanceBetween = (a: TouchPoint, b: TouchPoint) => {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

const centerOf = (a: TouchPoint, b: TouchPoint) => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
})

const clampViewBoxX = (x: number, width: number): number =>
  Math.min(Math.max(JAPAN_VIEWBOX.x, x), JAPAN_VIEWBOX.x + JAPAN_VIEWBOX.width - width)

const clampViewBoxY = (y: number, height: number): number =>
  Math.min(Math.max(JAPAN_VIEWBOX.y, y), JAPAN_VIEWBOX.y + JAPAN_VIEWBOX.height - height)

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
      x: clampViewBoxX(nextX, nextW),
      y: clampViewBoxY(nextY, nextH),
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
      x: clampViewBoxX(vb.x - dx * scaleX, vb.width),
      y: clampViewBoxY(vb.y - dy * scaleY, vb.height),
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
  const touch = useRef<TouchState>(null)

  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touch.current = { kind: 'pan', startX: t.clientX, startY: t.clientY, startVB: viewBox }
    } else if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      touch.current = {
        kind: 'pinch',
        startDist: distanceBetween(a, b),
        startCenter: centerOf(a, b),
        startVB: viewBox,
      }
    }
  }, [viewBox])

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (!touch.current) return
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()

    if (e.touches.length === 2 && touch.current.kind === 'pan') {
      const [a, b] = [e.touches[0], e.touches[1]]
      touch.current = {
        kind: 'pinch',
        startDist: distanceBetween(a, b),
        startCenter: centerOf(a, b),
        startVB: viewBox,
      }
      return
    }

    if (e.touches.length === 1 && touch.current.kind === 'pinch') {
      const t = e.touches[0]
      touch.current = { kind: 'pan', startX: t.clientX, startY: t.clientY, startVB: viewBox }
      return
    }

    if (e.touches.length === 1 && touch.current.kind === 'pan') {
      const t = e.touches[0]
      const dx = t.clientX - touch.current.startX
      const dy = t.clientY - touch.current.startY
      const scaleX = touch.current.startVB.width / rect.width
      const scaleY = touch.current.startVB.height / rect.height
      const vb = touch.current.startVB
      const next: ViewBox = {
        x: clampViewBoxX(vb.x - dx * scaleX, vb.width),
        y: clampViewBoxY(vb.y - dy * scaleY, vb.height),
        width: vb.width,
        height: vb.height,
      }
      targetVB.current = next
      setViewBox(next)
      return
    }

    if (e.touches.length === 2 && touch.current.kind === 'pinch') {
      const [a, b] = [e.touches[0], e.touches[1]]
      const currentDist = distanceBetween(a, b)
      if (currentDist === 0 || touch.current.startDist === 0) return

      const distRatio = currentDist / touch.current.startDist
      const startVB = touch.current.startVB
      const minWidth = JAPAN_VIEWBOX.width * 0.125
      const minHeight = JAPAN_VIEWBOX.height * 0.125
      const nextW = Math.min(JAPAN_VIEWBOX.width, Math.max(minWidth, startVB.width / distRatio))
      const nextH = Math.min(JAPAN_VIEWBOX.height, Math.max(minHeight, startVB.height / distRatio))

      const currentCenter = centerOf(a, b)
      const centerDx = currentCenter.x - touch.current.startCenter.x
      const centerDy = currentCenter.y - touch.current.startCenter.y
      const scaleX = nextW / rect.width
      const scaleY = nextH / rect.height
      const centerSvgX = startVB.x + (touch.current.startCenter.x - rect.left) * (startVB.width / rect.width)
      const centerSvgY = startVB.y + (touch.current.startCenter.y - rect.top) * (startVB.height / rect.height)
      const nextX = centerSvgX - (touch.current.startCenter.x - rect.left) * (nextW / rect.width) - centerDx * scaleX
      const nextY = centerSvgY - (touch.current.startCenter.y - rect.top) * (nextH / rect.height) - centerDy * scaleY

      const next: ViewBox = {
        x: clampViewBoxX(nextX, nextW),
        y: clampViewBoxY(nextY, nextH),
        width: nextW,
        height: nextH,
      }
      targetVB.current = next
      setViewBox(next)
    }
  }, [viewBox])

  const onTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) {
      touch.current = null
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touch.current = { kind: 'pan', startX: t.clientX, startY: t.clientY, startVB: viewBox }
    }
  }, [viewBox])

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
