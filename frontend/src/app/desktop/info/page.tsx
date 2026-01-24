'use client'

import { useEffect, useState } from 'react'
import type { Shelter } from '@/types'
import {
  emitTauriEvent,
  isTauriRuntime,
  listenTauriEvent,
} from '@/lib/tauriBridge'

const getKindLabel = (kind: string) => {
  switch (kind) {
    case 'castle':
      return '🏯 城郭'
    case 'garden':
      return '🌳 庭園'
    case 'tourist':
      return '🗺️ 観光地'
    case 'shrine':
      return '⛩️ 神社'
    case 'bridge':
      return '🌉 橋梁'
    default:
      return '📍 スポット'
  }
}

function InfoCard({ shelter }: { shelter: Shelter }) {
  return (
    <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
        <h2 className="text-xl font-semibold text-white">
          {shelter.name}
        </h2>
      </div>
      <div className="p-6 space-y-5">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {getKindLabel(shelter.kind)}
        </div>

        {shelter.summary && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              詳細情報
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              {shelter.summary}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">緯度</div>
            <div className="text-base font-semibold text-slate-900">
              {shelter.lat.toFixed(5)}
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">経度</div>
            <div className="text-base font-semibold text-slate-900">
              {shelter.lon.toFixed(5)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${shelter.lat},${shelter.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-medium py-2.5 rounded-lg transition-colors"
          >
            Googleマップで開く
          </a>

          {shelter.url && shelter.url !== '#' && (
            <a
              href={shelter.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gray-800 hover:bg-gray-900 text-white text-center font-medium py-2.5 rounded-lg transition-colors"
            >
              関連リンクを開く
            </a>
          )}
        </div>
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
        <button
          onClick={() => void emitTauriEvent('clear-selection', null)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          選択をクリア
        </button>
      </div>
    </div>
  )
}

export default function DesktopInfoPage() {
  const [shelter, setShelter] = useState<Shelter | null>(null)

  useEffect(() => {
    if (!isTauriRuntime()) return undefined
    const disposers: Array<() => void> = []
    const setup = async () => {
      disposers.push(
        await listenTauriEvent<Shelter>('shelter-selected', (payload) => {
          if (payload) {
            setShelter(payload)
          }
        })
      )
      disposers.push(
        await listenTauriEvent<null>('clear-selection', () => setShelter(null))
      )
      await emitTauriEvent('request-selection', null)
    }
    setup()
    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-8">
      {shelter ? (
        <InfoCard shelter={shelter} />
      ) : (
        <div className="text-sm text-slate-600">
          地図ウィンドウでピンをクリックすると詳細が表示されます。
        </div>
      )}
    </div>
  )
}
