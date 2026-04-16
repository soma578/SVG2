'use client'
import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import {
  buildCurrentMapFeatureInfoItems,
  getCurrentMapFeatureMeta,
} from '@/features/map/ui/currentMapFeatureDisplay'

const buildMapsHref = (feature: CurrentMapFeatureProperties): string | null => {
  if (Number.isFinite(feature.lat) && Number.isFinite(feature.lon)) {
    return `https://www.google.com/maps/search/?api=1&query=${feature.lat},${feature.lon}`
  }
  const query = [feature.title, feature.address].filter(Boolean).join(' ')
  if (!query.trim()) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const buildExternalHref = (feature: CurrentMapFeatureProperties): string | null => {
  if (feature.url && feature.url !== '#') return feature.url
  return null
}

interface PropertySheetProps {
  selectedFeature: CurrentMapFeatureProperties | null
  onClose: () => void
  sidebarOpen?: boolean
}

export default function PropertySheet({
  selectedFeature,
  onClose,
  sidebarOpen = false,
}: PropertySheetProps) {
  if (!selectedFeature) return null

  const meta = getCurrentMapFeatureMeta(selectedFeature.category)
  const summary = selectedFeature.summary?.trim()
  const address = selectedFeature.address?.trim()
  const mapsHref = buildMapsHref(selectedFeature)
  const externalHref = buildExternalHref(selectedFeature)
  const hasExternalLink = Boolean(externalHref)
  const normalizedSubtitle = selectedFeature.subtitle?.trim()
  const note = selectedFeature.note?.trim()
  const infoItems = buildCurrentMapFeatureInfoItems(selectedFeature)
  const normalizedSummary =
    summary &&
    summary !== meta.badge &&
    summary !== normalizedSubtitle &&
    summary !== selectedFeature.title
      ? summary
      : undefined

  return (
    <div
      className={`pointer-events-none absolute z-[80] top-[5.5rem] transition-[left] duration-200 ${sidebarOpen ? 'left-3' : 'left-16 md:left-20'}`}
    >
      <aside
        className="pointer-events-auto overflow-hidden rounded-[1.15rem] border-2 border-slate-300 bg-white shadow-2xl"
        style={{ width: 'min(22rem, calc(100vw - 6rem))', flexShrink: 0 }}
      >
        <div
          className="border-b border-black/10 px-4 py-3"
          style={{ backgroundColor: '#15803d', color: '#ffffff' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="inline-flex min-h-[1.75rem] items-center justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-semibold tracking-[0.1em] shadow-sm"
                style={{ backgroundColor: '#ffffff', color: '#166534', border: '1px solid #d1fae5' }}
              >
                {meta.badge}
              </div>
              <h3
                className="mt-1.5 line-clamp-2 text-base font-bold leading-snug sm:text-lg"
                style={{ color: '#ffffff' }}
              >
                {selectedFeature.title || '名称不明'}
              </h3>
              {normalizedSubtitle && normalizedSubtitle !== meta.badge && (
                <p
                  className="mt-0.5 line-clamp-1 text-xs leading-5"
                  style={{ color: 'rgba(236, 253, 245, 0.98)' }}
                >
                  {normalizedSubtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full transition"
              style={{ border: '1px solid #ffffff', backgroundColor: '#ffffff', color: '#1f2937' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[min(60vh,28rem)] space-y-2.5 overflow-y-auto bg-white p-3">
          {address && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">場所</div>
              <div className="text-xs text-slate-800 break-words">{address}</div>
            </div>
          )}

          {normalizedSummary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">概要</div>
              <div className="text-xs text-slate-800">{normalizedSummary}</div>
            </div>
          )}

          {infoItems.length > 0 && (
            <div className="grid gap-2">
              {infoItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{item.label}</div>
                  <div className="text-xs text-slate-800 break-words">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {note && note !== normalizedSummary && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-700">備考</div>
              <div className="text-xs text-slate-800">{note}</div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-blue-700 px-3 py-2.5 text-center text-xs font-semibold text-white hover:bg-blue-600 transition"
              >
                Googleマップで開く
              </a>
            )}
            {hasExternalLink && (
              <a
                href={externalHref!}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-slate-900 px-3 py-2.5 text-center text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                {meta.linkLabel}
              </a>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
