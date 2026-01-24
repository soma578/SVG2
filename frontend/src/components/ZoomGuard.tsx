'use client'

import { useEffect } from 'react'

const preventBrowserZoomWheel = (event: WheelEvent) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
  }
}

const preventBrowserZoomKeys = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_' || event.key === '0')) {
    event.preventDefault()
  }
}

const preventGestureZoom = (event: Event) => {
  event.preventDefault()
}

export function ZoomGuard() {
  useEffect(() => {
    window.addEventListener('wheel', preventBrowserZoomWheel, { passive: false })
    window.addEventListener('keydown', preventBrowserZoomKeys)

    const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'] as const
    gestureEvents.forEach((eventName) => {
      window.addEventListener(eventName, preventGestureZoom as EventListener, { passive: false })
    })

    return () => {
      window.removeEventListener('wheel', preventBrowserZoomWheel)
      window.removeEventListener('keydown', preventBrowserZoomKeys)
      gestureEvents.forEach((eventName) => {
        window.removeEventListener(eventName, preventGestureZoom as EventListener)
      })
    }
  }, [])

  return null
}
