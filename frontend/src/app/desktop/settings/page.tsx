'use client'

import { useEffect, useState } from 'react'
import LayerPanel from '@/components/map/LayerPanel'
import {
  emitTauriEvent,
  isTauriRuntime,
  listenTauriEvent,
} from '@/lib/tauriBridge'
import { defaultLayerState } from '@/lib/layers'

export default function DesktopSettingsPage() {
  const [layers, setLayers] = useState<Record<string, boolean>>(
    () => ({ ...defaultLayerState })
  )

  useEffect(() => {
    if (!isTauriRuntime()) return undefined
    const disposers: Array<() => void> = []
    const setup = async () => {
      disposers.push(
        await listenTauriEvent<Record<string, boolean>>('layer-state', (payload) => {
          if (payload) {
            setLayers(payload)
          }
        })
      )
      await emitTauriEvent('request-layer-state', null)
    }
    setup()
    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  const handleToggle = (layerId: string) => {
    setLayers((prev) => {
      const nextValue = !prev[layerId]
      const next = {
        ...prev,
        [layerId]: nextValue,
      }
      void emitTauriEvent('layer-toggle', { layerId, value: nextValue })
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200">
        <h1 className="text-xl font-semibold">レイヤー設定</h1>
        <p className="text-sm text-slate-500 mt-1">
          チェックボックスを切り替えると、地図ウィンドウのレイヤーがリアルタイムに更新されます。
        </p>
      </div>
      <div className="p-6">
        <LayerPanel layers={layers} onToggle={handleToggle} />
      </div>
    </div>
  )
}
