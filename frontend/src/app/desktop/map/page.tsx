'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { Shelter } from '@/types'
import {
  emitTauriEvent,
  isTauriRuntime,
  listenTauriEvent,
} from '@/lib/tauriBridge'
import { defaultLayerState } from '@/lib/layers'

const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), {
  ssr: false,
})

export default function DesktopMapPage() {
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    () => ({ ...defaultLayerState })
  )
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null)
  const layerStateRef = useRef(activeLayers)
  const selectionRef = useRef<Shelter | null>(null)

  useEffect(() => {
    layerStateRef.current = activeLayers
  }, [activeLayers])

  useEffect(() => {
    selectionRef.current = selectedShelter
  }, [selectedShelter])

  useEffect(() => {
    if (!isTauriRuntime()) return undefined
    const disposers: Array<() => void> = []
    const setup = async () => {
      disposers.push(
        await listenTauriEvent<{ layerId: string, value: boolean }>('layer-toggle', ({ layerId, value }) => {
          setActiveLayers((prev) => ({
            ...prev,
            [layerId]: value,
          }))
        })
      )

      disposers.push(
        await listenTauriEvent<null>('request-layer-state', () => {
          void emitTauriEvent('layer-state', layerStateRef.current)
        })
      )

      disposers.push(
        await listenTauriEvent<null>('clear-selection', () => {
          setSelectedShelter(null)
        })
      )

      disposers.push(
        await listenTauriEvent<null>('request-selection', () => {
          if (selectionRef.current) {
            void emitTauriEvent('shelter-selected', selectionRef.current)
          } else {
            void emitTauriEvent('clear-selection', null)
          }
        })
      )

      await emitTauriEvent('layer-state', layerStateRef.current)
    }

    setup()

    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    void emitTauriEvent('layer-state', activeLayers)
  }, [activeLayers])

  useEffect(() => {
    if (!isTauriRuntime()) return
    if (selectedShelter) {
      void emitTauriEvent('shelter-selected', selectedShelter)
    } else {
      void emitTauriEvent('clear-selection', null)
    }
  }, [selectedShelter])

  return (
    <div className="h-screen w-screen bg-slate-900">
      <MapCanvas
        activeLayers={activeLayers}
        onShelterClick={setSelectedShelter}
      />
    </div>
  )
}
