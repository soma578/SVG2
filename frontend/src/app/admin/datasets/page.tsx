'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function AdminDatasets() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<any[]>([])

  useEffect(() => {
    // 認証チェック
    const auth = localStorage.getItem('adminAuth')
    if (auth !== 'true') {
      router.push('/admin/login')
    } else {
      setIsAuthenticated(true)
    }
  }, [router])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)

      // CSVプレビュー
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const lines = text.split('\n').slice(0, 6) // ヘッダー + 最初の5行
        const data = lines.map(line => line.split(','))
        setPreviewData(data)
      }
      reader.readAsText(file)
    }
  }

  const handleUpload = () => {
    if (selectedFile) {
      // TODO: 実際のアップロード処理
      alert('CSVアップロード機能は実装予定です')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('adminAuth')
    router.push('/admin/login')
  }

  if (!isAuthenticated) {
    return <div>Loading...</div>
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            データセット管理
          </h1>
          <button
            onClick={handleLogout}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            ログアウト
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            現在のデータセット
          </h2>
          <div className="space-y-2 text-gray-600">
            <p><strong>避難所データ:</strong> shelters_okayama.csv</p>
            <p><strong>最終更新:</strong> 2025-10-01</p>
            <p><strong>レコード数:</strong> 約300件</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            新しいCSVをアップロード
          </h2>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSVファイルを選択
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-white
                hover:file:bg-primary-dark"
            />
          </div>

          {previewData.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                プレビュー（先頭5行）
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border">
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.map((row, i) => (
                      <tr key={i} className={i === 0 ? 'bg-gray-50 font-semibold' : ''}>
                        {row.map((cell: string, j: number) => (
                          <td key={j} className="px-4 py-2 text-sm text-gray-900 border">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                件数: {previewData.length - 1}行（プレビュー）
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!selectedFile}
            className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            公開
          </button>

          <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-sm text-gray-700">
              <strong>注意:</strong> 「公開」ボタンを押すと、現在のデータセットが新しいCSVで置き換えられます。
              バックアップを取ってから実行してください。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
