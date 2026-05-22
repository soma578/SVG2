'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'
import MapShell from './MapShell'
import PrefSelectMap from './PrefSelectMap'
import MuniSelectMap from './MuniSelectMap'
import type { LayerState } from './mapTypes'
import { useMapNavigation } from './useMapNavigation'
import { useRuntimeBridge } from './useRuntimeBridge'
import { useCurrentLocation } from './useCurrentLocation'

const INITIAL_LAYERS: LayerState[] = [
  { id: 'baseArea', label: '地域境界', visible: true },
  { id: 'evacuation', label: '避難所', visible: true },
  { id: 'teamActivity', label: '活動情報', visible: true },
  { id: 'hazard', label: 'ハザード', visible: false, disabled: true, note: '準備中' },
]

const MAP_RUNTIME_VERSION = 'native-v5'

const ShieldBrandIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
  </svg>
)


function MapPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const region = params.get('region')
  const municipalityId = params.get('municipalityId') || ''
  const municipalityCodesParam = params.get('municipalityCodes') || ''

  const step: 'prefecture' | 'municipality' | 'map' =
    !region ? 'prefecture' : !municipalityId ? 'municipality' : 'map'

  const {
    prefectures,
    municipalities,
    prefLabel,
    muniLabel,
    muniShelterCount,
    muniTeamCount,
    loading,
    resolvedMuniCodes,
    resolvedViewport,
    iframeSrc,
  } = useMapNavigation({
    step,
    region,
    municipalityId,
    municipalityCodesParam,
    runtimeVersion: MAP_RUNTIME_VERSION,
  })

  // Selection screen state
  const [muniSearch, setMuniSearch] = useState('')
  const [muniSuggestOpen, setMuniSuggestOpen] = useState(false)

  // Map selection hover state
  const [hoveredPrefCode, setHoveredPrefCode] = useState<string | null>(null)
  const [hoveredPrefLabel, setHoveredPrefLabel] = useState<string | null>(null)
  const [hoveredMuniCode, setHoveredMuniCode] = useState<string | null>(null)
  const [hoveredMuniLabel, setHoveredMuniLabel] = useState<string | null>(null)
  const [hoveredMuniShelters, setHoveredMuniShelters] = useState<number | undefined>(undefined)
  const [hoveredMuniTeams, setHoveredMuniTeams] = useState<number | undefined>(undefined)

  // Map state
  const [shareOpen, setShareOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [shareLink, setShareLink] = useState('')

  const {
    iframeRef,
    layers,
    featureDetail,
    runtimeReady,
    mapViewport,
    isOnline,
    dataStatuses,
    clearFeatureDetail,
    postViewport,
    postCurrentLocation,
    focusLocation,
    zoomViewport: postZoomViewport,
    resetViewport: postResetViewport,
    toggleLayer,
  } = useRuntimeBridge({
    iframeSrc,
    initialLayers: INITIAL_LAYERS,
    resolvedViewport,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    setShareLink(window.location.href)
  }, [step, region, municipalityId, municipalityCodesParam, resolvedMuniCodes])

  const { locationStatus, setLocationStatus, locateCurrentPosition } = useCurrentLocation({
    region,
    municipalityId,
    resolvedViewport,
    mapViewport,
    runtimeReady,
    focusLocation,
    postViewport,
    postCurrentLocation,
  })

  const zoomViewport = useCallback((direction: 'in' | 'out') => {
    postZoomViewport(direction)
    setShareStatus('')
    setLocationStatus('')
  }, [postZoomViewport])

  const resetViewport = useCallback(() => {
    postResetViewport()
    setShareStatus('')
    setLocationStatus('')
  }, [postResetViewport])



  const copyShareLink = useCallback(async () => {
    const url = window.location.href
    setShareLink(url)
    setShareOpen(true)
    setShareStatus('リンクを作成しました')
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('リンクをコピーしました')
    } catch (error) {
      console.warn('[page] clipboard write failed', error)
      setShareStatus('リンクを表示しています。手動でコピーできます')
    }
  }, [])

  const handlePrefSelect = useCallback((regionId: string, _prefCode: string, _label: string) => {
    setHoveredPrefCode(null)
    setHoveredPrefLabel(null)
    router.push(`/map?region=${regionId}`)
  }, [router])

  const handlePrefHover = useCallback((prefCode: string | null, label: string | null) => {
    setHoveredPrefCode(prefCode)
    setHoveredPrefLabel(label)
  }, [])

  const handleMuniSelect = useCallback((id: string, codes: string[]) => {
    setHoveredMuniCode(null)
    setHoveredMuniLabel(null)
    const codesStr = codes.length > 0 ? codes.join(',') : ''
    const codesParam = codesStr ? `&municipalityCodes=${codesStr}` : ''
    router.push(`/map?region=${region}&municipalityId=${id}${codesParam}`)
  }, [router, region])

  const handleMuniHover = useCallback((
    code: string | null,
    label: string | null,
    shelterCount?: number,
    teamCount?: number,
  ) => {
    setHoveredMuniCode(code)
    setHoveredMuniLabel(label)
    setHoveredMuniShelters(shelterCount)
    setHoveredMuniTeams(teamCount)
  }, [])

  // Municipality autocomplete suggestions
  const muniSuggestions = useMemo(() => {
    const q = muniSearch.trim()
    if (!q) return []
    return municipalities
      .filter((m) => m.label.includes(q) && m.dataStatus !== 'empty')
      .slice(0, 8)
  }, [municipalities, muniSearch])

  // Top bar copy
  const topBarTitle = '全国防災マップ'

  const topBarSub =
    step === 'prefecture' ? '都道府県を選択' :
    step === 'municipality' ? `${prefLabel || region || ''}の市区町村を選択` :
    `${prefLabel || region || ''}　${muniLabel || municipalityId || ''}　避難所${muniShelterCount}件・活動情報${muniTeamCount}件`

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarIcon} aria-hidden="true">
            <ShieldBrandIcon />
          </div>
          <div className={styles.topBarTitleGroup}>
            <div className={styles.topBarTitle}>{topBarTitle}</div>
            {step === 'map' ? (
              <>
                <div className={styles.topBarSubtitle}>
                  {`${prefLabel || region || ''}　${muniLabel || municipalityId || ''}`}
                </div>
                <div className={styles.topBarSubtitle2}>
                  {`避難所${muniShelterCount}件・活動情報${muniTeamCount}件`}
                </div>
              </>
            ) : (
              <div className={styles.topBarSubtitle}>{topBarSub}</div>
            )}
          </div>
        </div>

        <nav className={styles.topBarTrail} aria-label="現在の選択階層">
          <button type="button" className={styles.topBarCrumb} onClick={() => router.push('/map')}>
            <span aria-hidden="true">⌂</span>
            <span>全国</span>
          </button>
          {(step === 'municipality' || step === 'map') && (
            <>
              <span className={styles.topBarCrumbSep} aria-hidden="true">›</span>
              <button
                type="button"
                className={styles.topBarCrumb}
                onClick={() => router.push(`/map?region=${region}`)}
              >
                {prefLabel || region}
              </button>
            </>
          )}
          {step === 'map' && (
            <>
              <span className={styles.topBarCrumbSep} aria-hidden="true">›</span>
              <button type="button" className={styles.topBarCrumb} disabled>
                {muniLabel || municipalityId}
              </button>
            </>
          )}
        </nav>

        <div className={styles.topBarActions}>
          {step === 'map' && (
            <>
              <button type="button" className={styles.topBarBtn} onClick={locateCurrentPosition}>
                現在地
              </button>
              <button type="button" className={styles.topBarBtn} onClick={() => setShareOpen((prev) => !prev)}>
                共有
              </button>
              <button
                type="button"
                className={styles.topBarBtn}
                onClick={() => router.push(`/map?region=${region}`)}
              >
                市区町村を変更
              </button>
              <button type="button" className={styles.topBarBtn} onClick={() => router.push('/map')}>
                県を変更
              </button>
            </>
          )}
        </div>
      </header>

      {step === 'map' && locationStatus ? (
        <div className={styles.mapToast} role="status" aria-live="polite">
          {locationStatus}
        </div>
      ) : null}

      <div className={styles.body}>
        {step === 'prefecture' && (
          <div className={styles.selectLayout}>
            <div className={styles.selectMapPanel}>
              {/* Floating guide card */}
              <div className={styles.mapInfoFloat}>
                <div className={styles.mapInfoFloatIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <div className={styles.mapInfoFloatTitle}>都道府県を選択してください</div>
                  <div className={styles.mapInfoFloatText}>地図上の都道府県をクリックすると、<br />その地域の市区町村マップが表示されます。</div>
                </div>
              </div>
              {/* Map compass */}
              <div className={styles.mapCompass} aria-hidden="true">N</div>
              {loading ? (
                <div className={styles.loading}>読み込み中...</div>
              ) : (
                <PrefSelectMap
                  regions={prefectures}
                  hoveredCode={hoveredPrefCode}
                  onSelect={handlePrefSelect}
                  onHover={handlePrefHover}
                />
              )}
            </div>
            <aside className={styles.selectInfoPanel}>
              <div className={styles.selectStepHeader}>
                <div className={styles.selectStepBadge}>STEP 1 / 2</div>
                <div className={styles.selectStepTitle}>都道府県を選択</div>
                <div className={styles.selectStepDesc}>マップ上の都道府県をクリックしてください</div>
              </div>

              {hoveredPrefLabel ? (
                <div className={styles.selectInfoCard}>
                  <div className={styles.selectInfoTitle}>{hoveredPrefLabel}</div>
                  <div className={styles.selectInfoMeta}>クリックして選択</div>
                  <div className={styles.selectInfoHint}>市区町村の選択に進みます</div>
                </div>
              ) : (
                <div className={styles.selectInfoEmpty}>
                  <p>県にカーソルを合わせてください</p>
                  <p className={styles.selectInfoEmptyHint}>色の付いた都道府県が選択可能です</p>
                </div>
              )}

              <div className={styles.selectLegend}>
                <div className={styles.selectLegendRow}>
                  <span className={styles.selectLegendSwatch} style={{ background: 'rgba(147,210,253,0.75)' }} />
                  <span>対応済み（クリック可能）</span>
                </div>
                <div className={styles.selectLegendRow}>
                  <span className={styles.selectLegendSwatch} style={{ background: 'rgba(226,232,240,0.55)' }} />
                  <span>未対応</span>
                </div>
              </div>

              <div className={styles.selectTip}>
                <span className={styles.selectTipIcon}>💡</span>
                <span>県を選択すると、市区町村マップに進みます</span>
              </div>
            </aside>
          </div>
        )}

        {step === 'municipality' && (() => {
          const prefCode = prefectures.find((p) => p.id === region)?.prefCode || ''
          const availableCount = municipalities.filter(m => m.dataStatus === 'available').length
          const partialCount  = municipalities.filter(m => m.dataStatus === 'partial').length
          const emptyCount    = municipalities.filter(m => m.dataStatus === 'empty').length
          const totalShelters = municipalities.reduce((acc, m) => acc + (m.shelterCount ?? 0), 0)
          return (
            <div className={styles.selectLayout}>
              <div className={styles.selectMapPanel}>
                {/* Compass */}
                <div className={styles.mapCompass} aria-hidden="true">N</div>
                {(!prefCode || loading) ? (
                  <div className={styles.loading}>読み込み中...</div>
                ) : (
                  <MuniSelectMap
                    prefCode={prefCode}
                    municipalities={municipalities}
                    hoveredCode={hoveredMuniCode}
                    onSelect={handleMuniSelect}
                    onHover={handleMuniHover}
                  />
                )}
              </div>
              <aside className={styles.selectInfoPanel}>
                <div className={styles.selectStepHeader}>
                  <div className={styles.selectStepBadge}>STEP 2 / 2</div>
                  <div className={styles.selectStepTitle}>{prefLabel || region || '市区町村を選択'}</div>
                  <div className={styles.selectStepDesc}>マップ上の市区町村をクリックしてください</div>
                </div>

                {/* Municipality name autocomplete */}
                <div className={styles.muniSearchWrap}>
                  <input
                    type="text"
                    className={styles.muniSearchInput}
                    placeholder="名前で検索..."
                    value={muniSearch}
                    onChange={(e) => { setMuniSearch(e.target.value); setMuniSuggestOpen(true) }}
                    onFocus={() => setMuniSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setMuniSuggestOpen(false), 150)}
                  />
                  {muniSearch && muniSuggestOpen && (
                    <ul className={styles.muniSuggestList} role="listbox">
                      {muniSuggestions.length > 0 ? muniSuggestions.map((m) => (
                        <li
                          key={m.id}
                          className={styles.muniSuggestItem}
                          role="option"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleMuniSelect(m.id, m.municipalityCodes || [m.id])
                            setMuniSearch('')
                            setMuniSuggestOpen(false)
                          }}
                        >
                          <span className={styles.muniSuggestLabel}>{m.label}</span>
                          {(m.shelterCount ?? 0) > 0 && (
                            <span className={styles.muniSuggestMeta}>避難所{m.shelterCount}件</span>
                          )}
                        </li>
                      )) : (
                        <li className={styles.muniSuggestNone}>一致する市区町村がありません</li>
                      )}
                    </ul>
                  )}
                </div>

                {hoveredMuniLabel ? (
                  <div className={styles.selectInfoCard}>
                    <div className={styles.selectInfoTitle}>{hoveredMuniLabel}</div>
                    <div className={styles.selectInfoMeta}>
                      避難所 {hoveredMuniShelters ?? 0}件
                      {(hoveredMuniTeams ?? 0) > 0 ? `・活動情報 ${hoveredMuniTeams}件` : ''}
                    </div>
                    <div className={styles.selectInfoHint}>クリックして地図を表示</div>
                  </div>
                ) : null}

                {/* Stats */}
                {municipalities.length > 0 && (
                  <div className={styles.muniStatsGrid}>
                    <div className={styles.muniStatCard}>
                      <div className={styles.muniStatIconWrap}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.muniStatSvg}>
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      </div>
                      <div className={styles.muniStatValue}>{availableCount + partialCount}</div>
                      <div className={styles.muniStatLabel}>対応市区町村</div>
                    </div>
                    <div className={styles.muniStatCard}>
                      <div className={styles.muniStatIconWrap}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${styles.muniStatSvg} ${styles.muniStatSvgGreen}`}>
                          <circle cx="12" cy="5" r="2" />
                          <path d="M12 7l-3 8h2l1-3 2 3h2l-3-8z" />
                          <path d="M9 15l-1 4h8l-1-4" />
                        </svg>
                      </div>
                      <div className={`${styles.muniStatValue} ${styles.muniStatValueGreen}`}>{totalShelters}</div>
                      <div className={styles.muniStatLabel}>避難所総数</div>
                    </div>
                  </div>
                )}

                {/* Detailed legend with counts */}
                <div className={styles.muniDetailLegend}>
                  <div className={styles.muniDetailLegendTitle}>{prefLabel || region}の状況</div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(147,210,253,0.65)' }} />
                      <span>対応済み（クリック可能）</span>
                      <span className={styles.muniDetailCount}>{availableCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>詳細地図が表示されます</div>
                  </div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(253,230,138,0.65)' }} />
                      <span>一部対応</span>
                      <span className={styles.muniDetailCount}>{partialCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>一部のデータが利用可能な市町村</div>
                  </div>
                  <div className={styles.muniDetailLegendItem}>
                    <div className={styles.muniDetailLegendMain}>
                      <span className={styles.selectLegendSwatch} style={{ background: 'rgba(226,232,240,0.5)' }} />
                      <span>未対応</span>
                      <span className={styles.muniDetailCount}>{emptyCount}市町村</span>
                    </div>
                    <div className={styles.muniDetailDesc}>データ未整備の市町村</div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.selectBackBtn}
                  onClick={() => router.push('/map')}
                >
                  ← 県を変更する
                </button>
              </aside>
            </div>
          )
        })()}

        {step === 'map' && (
          <MapShell
            iframeRef={iframeRef}
            iframeSrc={iframeSrc}
            municipalityId={municipalityId}
            mapViewport={mapViewport}
            resolvedViewport={resolvedViewport}
            shareOpen={shareOpen}
            shareLink={shareLink}
            shareStatus={shareStatus}
            featureDetail={featureDetail}
            layers={layers}
            runtimeReady={runtimeReady}
            isOnline={isOnline}
            dataStatuses={dataStatuses}
            regionLabel={prefLabel || region || ''}
            onZoom={zoomViewport}
            onReset={resetViewport}
            onCloseShare={() => setShareOpen(false)}
            onCopyShareLink={copyShareLink}
            onCloseFeatureDetail={clearFeatureDetail}
            onToggleLayer={toggleLayer}
          />
        )}
      </div>
    </div>
  )
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>読み込み中...</div>}>
      <MapPageInner />
    </Suspense>
  )
}
