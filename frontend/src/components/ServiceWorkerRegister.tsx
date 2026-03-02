'use client'

import { useEffect } from 'react'

/**
 * Service Worker登録コンポーネント
 * PMTilesキャッシュとオフライン対応を提供
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[SW] Service Worker not supported')
      return
    }

    // 開発環境では無効化（ホットリロード干渉防止）
    if (process.env.NODE_ENV === 'development') {
      console.log('[SW] Service Worker disabled in development')
      return
    }

    // Service Worker登録
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered:', registration.scope)

        // 更新チェック
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] New version available, reload to update')
                // 自動リロード（オプション）
                // window.location.reload()
              }
            })
          }
        })
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error)
      })

    // 既存のService Workerからのメッセージ受信
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[SW] Message received:', event.data)
    })
  }, [])

  return null // UIなし
}
