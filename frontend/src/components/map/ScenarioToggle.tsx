'use client'

interface ScenarioToggleProps {
  scenario: 'max' | 'plan'
  onChange: (scenario: 'max' | 'plan') => void
}

export default function ScenarioToggle({ scenario, onChange }: ScenarioToggleProps) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
            <span>⚡</span>
            <span>ハザード規模</span>
          </h3>
          <p className="text-xs text-amber-700 mt-0.5">
            浸水・津波の想定規模を切り替え
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onChange('max')}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
            scenario === 'max'
              ? 'bg-red-600 text-white shadow-md'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-base">🌊</span>
            <span>想定最大規模</span>
          </div>
        </button>
        <button
          onClick={() => onChange('plan')}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
            scenario === 'plan'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-base">📊</span>
            <span>計画規模</span>
          </div>
        </button>
      </div>

      <div className="mt-3 text-xs text-amber-700 bg-white/50 rounded p-2">
        {scenario === 'max' ? (
          <>
            <span className="font-semibold">想定最大規模:</span> 想定しうる最大規模の降雨・津波による浸水想定
          </>
        ) : (
          <>
            <span className="font-semibold">計画規模:</span> 河川整備の基本となる降雨・津波による浸水想定
          </>
        )}
      </div>

      <div className="mt-2 text-[10px] text-amber-600 bg-amber-100/50 rounded p-2">
        ℹ️ 現在は土砂災害のみ表示中です。浸水・津波レイヤーは今後実装予定です。
      </div>
    </div>
  )
}
