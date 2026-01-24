// 商用化を見据えた外部依存の切り替えポイント。
// {z}/{x}/{y} プレースホルダを含むURLを想定。未指定なら地理院タイル（淡色）をデフォルトにする。
export const tileBaseUrl =
  process.env.NEXT_PUBLIC_TILE_BASE_URL ||
  'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'
