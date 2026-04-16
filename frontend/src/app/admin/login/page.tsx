'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function AdminLogin() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store' })
        if (!cancelled && response.ok) {
          router.replace('/admin/datasets')
          return
        }
      } catch (requestError) {
        console.error('[admin/login] session check failed:', requestError)
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json()

      if (!response.ok || !payload?.ok) {
        setError(payload?.error || 'ログインに失敗しました')
        return
      }

      router.push('/admin/datasets')
    } catch (requestError) {
      console.error('[admin/login] failed:', requestError)
      setError('ログイン処理中にエラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingSession) {
    return <div className="px-6 py-12">Loading...</div>
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            管理画面ログイン
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                ユーザー名
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                パスワード
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-300"
            >
              {submitting ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          <div className="mt-6 text-sm text-gray-600 text-center">
            <p>既定のデモ用アカウント:</p>
            <p>ユーザー名: admin / パスワード: admin</p>
            <p className="mt-2 text-xs text-gray-500">
              本番運用時は `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET` を設定してください。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
