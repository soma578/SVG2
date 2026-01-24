# 技術アーキテクチャ

## 停電情報のキャッシュ戦略

### 問題: サーバーレス環境でのキャッシュ

**メモリキャッシュの問題点**:
```typescript
// ❌ これは Vercel などのサーバーレス環境では機能しない
const cache = new Map()  // リクエストごとに新しいインスタンス
```

サーバーレス環境（Vercel、Netlify、AWS Lambdaなど）では：
- リクエストごとに新しいサーバーインスタンスが起動
- メモリはリクエスト間で共有されない
- キャッシュが毎回リセットされる

### 解決策: VercelKV

**VercelKV**は Redis 互換の永続キャッシュストア。

**特徴**:
- ✅ サーバーレス環境で動作
- ✅ リクエスト間でデータ共有
- ✅ TTL（有効期限）サポート
- ✅ Vercelなら無料枠あり（3,000リクエスト/日）

**実装**:
```typescript
// frontend/src/lib/outageCacheKV.ts
import { kv } from '@vercel/kv'

// データ保存（TTL付き）
await kv.set('outage:20260125:',  data, { ex: 300 }) // 5分

// データ取得
const cached = await kv.get('outage:20260125:')
```

**フォールバック**:
ローカル開発環境（VercelKVがない場合）は自動的にメモリキャッシュにフォールバック。

## エラーハンドリング戦略

### Stale Cache Pattern

スクレイピングが失敗した場合、古いキャッシュを返す：

```typescript
try {
  // スクレイピング
  const data = await scrape()
  await saveToCache(data)
  return data
} catch (error) {
  // 失敗時は古いキャッシュを返す
  const staleCache = await getFromCache()
  if (staleCache) {
    return { ...staleCache, stale: true, warning: '...' }
  }
  throw error
}
```

**メリット**:
- HTMLの構造が変わっても、一定期間は動作し続ける
- ユーザーに「データがない」ではなく「古いデータ」を提供
- 開発者がエラーに気づくまでの猶予ができる

## 型安全性の向上

### Before（問題あり）
```typescript
const outages: any[] = []  // ❌ 型チェックが効かない
```

### After（改善）
```typescript
export interface OutageData {
  prefecture: string
  city: string
  ward?: string
  district: string
  households: number
  timestamp: string
  cause: string
  status: 'ongoing' | 'recovered'
  recovered_at?: string
}

const outages: OutageData[] = []  // ✅ 型安全
```

**メリット**:
- コンパイル時にエラー検出
- IDEの補完が効く
- リファクタリングが安全

## VercelKV セットアップ手順

### 1. Vercelプロジェクトに追加

```bash
# Vercelダッシュボードから
Storage → Create Database → KV
```

### 2. 環境変数の自動設定

Vercelが自動的に設定：
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

### 3. ローカル開発

```bash
# .env.local に環境変数をコピー（オプション）
# または、そのままでもメモリキャッシュで動作
npm run dev
```

### 4. 動作確認

```bash
# キャッシュ統計を確認
curl http://localhost:3000/api/outages/stats
```

## パフォーマンス比較

### Before（メモリキャッシュ）
```
リクエスト1 → スクレイピング（3秒） → レスポンス
リクエスト2 → スクレイピング（3秒） → レスポンス  # キャッシュ効かない
リクエスト3 → スクレイピング（3秒） → レスポンス  # キャッシュ効かない
```

### After（VercelKV）
```
リクエスト1 → スクレイピング（3秒） → KVに保存 → レスポンス
リクエスト2 → KVから取得（<100ms） → レスポンス  # キャッシュ効く！
リクエスト3 → KVから取得（<100ms） → レスポンス  # キャッシュ効く！
```

**改善**:
- レスポンスタイム: 3秒 → 100ms（30倍高速）
- スクレイピング頻度: 毎回 → 5分に1回（約99%削減）

## コスト試算

### VercelKV 無料枠
- 3,000リクエスト/日
- 100MBストレージ

### 想定利用
- キャッシュミス: 288回/日（5分ごと）
- キャッシュヒット: 約2,000回/日
- 合計: 約2,300回/日 → **無料枠内**

### 有料プラン（必要な場合）
- $20/月 で 100,000リクエスト/日
- 月間300万リクエストまでカバー

## トラブルシューティング

### KVに接続できない

```bash
# 環境変数を確認
echo $KV_REST_API_URL
echo $KV_REST_API_TOKEN

# なければVercelダッシュボードで設定
```

### キャッシュが効かない

```typescript
// ログを確認
console.log(await getCacheStats())

// 手動でクリア
await clearCache()
```

### ローカルでKVをテスト

```bash
# Upstash（VercelKVの提供元）で無料アカウント作成
# URLとTokenをコピー → .env.local に設定
```

## まとめ

| 項目 | Before | After |
|------|--------|-------|
| キャッシュバックエンド | メモリ（機能しない） | VercelKV（永続） |
| レスポンスタイム | 3秒 | 100ms |
| スクレイピング頻度 | 毎回 | 5分に1回 |
| エラー時の挙動 | エラー返す | 古いデータ返す |
| 型安全性 | `any` | `OutageData` |

**結論**: サーバーレス環境でも正しく動作するように改善。
