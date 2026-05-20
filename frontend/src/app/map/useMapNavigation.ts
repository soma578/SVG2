'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJsonWithRuntimeCache } from './mapData'
import type { GeoViewport, MunicipalityEntry, PrefectureEntry } from './mapTypes'

const serializeViewport = (viewport: GeoViewport | null) => {
  if (!viewport) return ''
  return [
    viewport.lat,
    viewport.lon,
    viewport.latSpan,
    viewport.lonSpan,
  ].map((value) => String(value)).join(',')
}

type MapStep = 'prefecture' | 'municipality' | 'map'

type UseMapNavigationOptions = {
  step: MapStep
  region: string | null
  municipalityId: string
  municipalityCodesParam: string
  runtimeVersion: string
}

export const useMapNavigation = ({
  step,
  region,
  municipalityId,
  municipalityCodesParam,
  runtimeVersion,
}: UseMapNavigationOptions) => {
  const [prefectures, setPrefectures] = useState<PrefectureEntry[]>([])
  const [municipalities, setMunicipalities] = useState<MunicipalityEntry[]>([])
  const [prefLabel, setPrefLabel] = useState<string>('')
  const [muniLabel, setMuniLabel] = useState<string>('')
  const [muniShelterCount, setMuniShelterCount] = useState(0)
  const [muniTeamCount, setMuniTeamCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resolvedMuniCodes, setResolvedMuniCodes] = useState('')
  const [resolvedViewport, setResolvedViewport] = useState<GeoViewport | null>(null)

  useEffect(() => {
    if (step === 'map') return
    setLoading(true)
    fetchJsonWithRuntimeCache<{ regions: PrefectureEntry[] }>('/map/regions/index.json')
      .then(({ data }) => setPrefectures(data.regions ?? []))
      .catch(() => setPrefectures([]))
      .finally(() => setLoading(false))
  }, [step])

  useEffect(() => {
    if (step !== 'municipality' || !region) return
    setLoading(true)
    fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
      `/map/regions/${region}/municipalities.json`,
    )
      .then(({ data }) => {
        setPrefLabel(data.label ?? region)
        setMunicipalities(data.municipalities ?? [])
      })
      .catch((err) => {
        console.error('[page] step2 fetch failed', err)
        setMunicipalities([])
      })
      .finally(() => setLoading(false))
  }, [step, region])

  useEffect(() => {
    if (step !== 'map' || !region || !municipalityId) return
    if (municipalityCodesParam) setResolvedMuniCodes(municipalityCodesParam)
    fetchJsonWithRuntimeCache<{ label: string; municipalities: MunicipalityEntry[] }>(
      `/map/regions/${region}/municipalities.json`,
    )
      .then(({ data }) => {
        const muni = data.municipalities?.find((m) => m.id === municipalityId)
        setPrefLabel(data.label ?? region)
        if (muni) {
          setMuniLabel(muni.label)
          setMuniShelterCount(muni.shelterCount ?? 0)
          setMuniTeamCount(muni.teamActivityCount ?? 0)
          if (!municipalityCodesParam && muni.municipalityCodes?.length) {
            setResolvedMuniCodes(muni.municipalityCodes.join(','))
          }
          if (muni.viewport) setResolvedViewport(muni.viewport)
        }
      })
      .catch((err) => {
        console.error('[page] step3 fetch failed', err)
      })
  }, [step, region, municipalityId, municipalityCodesParam])

  const iframeSrc = useMemo(() => {
    if (step !== 'map' || !region || !municipalityId || !resolvedMuniCodes) return ''
    const urlParams = new URLSearchParams({
      embed: '1',
      regionId: region,
      runtimeConfigUrl: `/map/regions/${region}/runtime-config.json`,
      v: runtimeVersion,
    })
    urlParams.set('municipalityCodes', resolvedMuniCodes)
    const initialViewport = serializeViewport(resolvedViewport)
    if (initialViewport) urlParams.set('initialViewport', initialViewport)
    return `/map/webapp/current-map.html?${urlParams.toString()}`
  }, [step, region, municipalityId, resolvedMuniCodes, resolvedViewport, runtimeVersion])

  return {
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
  }
}
