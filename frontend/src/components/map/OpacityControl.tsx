'use client'

interface OpacityControlProps {
  layerGroup?: 'hazard' | 'boundary'
  label?: string
  icon?: string
  opacity: number
  onChange: (opacity: number) => void
}

export default function OpacityControl({
  layerGroup = 'hazard',
  label,
  icon,
  opacity,
  onChange,
}: OpacityControlProps) {
  const defaultLabel = layerGroup === 'hazard' ? 'ハザードレイヤー' : '境界レイヤー'
  const defaultIcon = layerGroup === 'hazard' ? '⚠️' : '🗺️'
  const resolvedLabel = label ?? defaultLabel
  const resolvedIcon = icon === undefined && label ? null : (icon ?? defaultIcon)

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          {resolvedIcon && <span>{resolvedIcon}</span>}
          <span>{resolvedLabel}の透明度</span>
        </label>
        <span className="text-xs font-mono text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
          {Math.round(opacity * 100)}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={opacity * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${opacity * 100}%, #e5e7eb ${opacity * 100}%, #e5e7eb 100%)`
        }}
      />
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>透明</span>
        <span>不透明</span>
      </div>
    </div>
  )
}
