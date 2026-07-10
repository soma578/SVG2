/**
 * ピンレイヤープロファイル
 * ========================
 * representativePinsLayer.html は純粋な描画エンジン (QTCT 読込 → カリング → <use> 描画 →
 * hitTargets 通知) であり、レイヤー固有のビジネスルールはすべてこのファイルに宣言する。
 * エンジン本体に `layerId === '...'` の分岐を書いてはならない。
 *
 * 新しいピンレイヤーの追加手順:
 *   1. ここにプロファイルを1エントリ足す
 *   2. managed layer.config.json に portable entrypoint と build を宣言する
 *   Container/QTCTは map:build が自動生成する。エンジン本体の変更は不要。
 *
 * フィールド:
 *   label                データステータス通知に使う表示名
 *   statusAliases        { 正規status: [生statusの別名...] } 正規キー自身もマッチする
 *   defaultStatus        どの別名にも一致しない生statusの正規化先
 *   icons                { 正規status: アイコンhref } ensureIconDefs はこのキー集合で defs を作る
 *   representativeStatus クラスタ代表ピンを常にこのstatusで描く (null = 個別と同じ正規化)
 *   placement            'point' = lat/lon をそのまま使う
 *                        'districtCentroid' = municipalityCode の地区ポリゴン重心に置き直す
 *   individualKind       featurePayload の kind (非代表ピン)
 *
 * representative.count はcore共通の密度表示に使われる。
 * ズーム別閾値1単位につき、同じ大きさ・濃さの代表ピンが1本表示される。
 */
export const PIN_LAYER_PROFILES = {
  evacuation: {
    label: '避難所代表ピン',
    statusAliases: {
      open: ['open', 'opened', 'active', 'available', '利用可', '開設中'],
      limited: ['limited', 'crowded', 'near_full', '要確認'],
      full: ['full', '満員'],
      closed: ['closed', 'close', 'inactive', '閉鎖'],
    },
    defaultStatus: 'unknown',
    icons: {
      open: '/map/icons/shelter-open.png',
      limited: '/map/icons/shelter-limited.png',
      full: '/map/icons/shelter-full.png',
      closed: '/map/icons/shelter-closed.png',
      unknown: '/map/icons/shelter-default.png',
    },
    representativeStatus: 'open',
    placement: 'point',
    individualKind: 'poi',
  },
  teamActivity: {
    label: '活動情報代表ピン',
    statusAliases: {
      active: ['open', 'opened', 'active', 'available', '利用可', '開設中'],
      limited: ['limited', 'crowded', 'near_full', '要確認'],
      full: ['full', '満員'],
      unknown: ['closed', 'close', 'inactive', '閉鎖'],
      standby: ['standby', 'waiting', '待機中'],
      planned: ['planned', 'scheduled', 'plan', '予定', '計画中'],
      completed: ['completed', 'complete', 'done', '完了'],
      needs_attention: ['needs_attention', 'warning', 'alert', '要対応'],
    },
    defaultStatus: 'active',
    icons: {
      active: '/map/icons/team-active.png',
      // limited / full は専用アイコン未定義のため active と同じ (旧 iconHrefFor の
      // フォールスルーと同値)
      limited: '/map/icons/team-active.png',
      full: '/map/icons/team-active.png',
      standby: '/map/icons/team-standby.png',
      planned: '/map/icons/team-planned.png',
      completed: '/map/icons/team-completed.png',
      needs_attention: '/map/icons/team-attention.png',
      unknown: '/map/icons/team-attention.png',
    },
    representativeStatus: null,
    placement: 'districtCentroid',
    individualKind: 'activity-marker',
  },
};

export const resolvePinProfile = (layerId) =>
  PIN_LAYER_PROFILES[layerId] || PIN_LAYER_PROFILES.evacuation;
