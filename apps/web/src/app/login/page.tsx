'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  clearSessionApiKey,
  setCsrfToken,
  setSessionApiKey,
} from '@/lib/api'

type LoginResponse = {
  success?: boolean
  data?: {
    name?: string
    role?: string
  }
  csrfToken?: string
  error?: string
}

function extractApiKey(input: string): string {
  const match = input.match(/\blh_[A-Za-z0-9]+\b/)
  return (match?.[0] ?? input).trim()
}

function cacheStaffProfile(data: LoginResponse | null | undefined): void {
  if (typeof window === 'undefined' || !data) return
  try {
    if (data.success && data.data) {
      if (data.data.name) localStorage.setItem('lh_staff_name', data.data.name)
      if (data.data.role) localStorage.setItem('lh_staff_role', data.data.role)
    }
  } catch {
    // Profile caching is best-effort.
  }
  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

async function verifyCookieSession(apiUrl: string): Promise<boolean> {
  const res = await fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' })
  if (!res.ok) return false
  const data = (await res.json().catch(() => null)) as LoginResponse | null
  if (!data?.success || !data.data) return false
  cacheStaffProfile(data)
  return true
}

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL
      if (!apiUrl) {
        setError('NEXT_PUBLIC_API_URL is not set in build env')
        setLoading(false)
        return
      }

      const normalizedApiKey = extractApiKey(apiKey)
      if (!normalizedApiKey) {
        setError('LINEの案内文、または lh_ から始まるAPIキーを貼り付けてください')
        return
      }

      // Exchange the API key for an HttpOnly session cookie. The key is never
      // stored in localStorage (removes the XSS-exposed credential). Some
      // mobile in-app browsers drop cross-site cookies, so we verify the
      // session before entering the app and fall back to a tab-scoped Bearer
      // session when needed.
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: normalizedApiKey }),
      })

      if (res.ok) {
        try {
          localStorage.removeItem('lh_api_key')
        } catch {
          // Legacy credential cleanup is best-effort.
        }
        clearSessionApiKey()
        let loginData: LoginResponse | null = null
        try {
          loginData = await res.json()
          cacheStaffProfile(loginData)
        } catch {
          // Profile / CSRF caching is best-effort.
        }

        if (await verifyCookieSession(apiUrl).catch(() => false)) {
          router.replace('/')
          return
        }

        if (setSessionApiKey(normalizedApiKey)) {
          router.replace('/')
          return
        }

        setError(
          'ログイン情報をこのブラウザに保存できませんでした。LINE内ブラウザではなく、Safari / Chromeで管理画面URLを開いてからもう一度ログインしてください。',
        )
      } else if (res.status === 401) {
        setError('APIキーが正しくありません')
      } else {
        // Surface topology / configuration errors (e.g. cross-site cookie guard).
        let message = 'ログインに失敗しました'
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // keep default message
        }
        setError(message)
      }
    } catch {
      setError('接続に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-panel rounded-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="lh-gradient-button w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg mx-auto mb-3">
            H
          </div>
          <h1 className="text-xl font-bold text-gray-900">L Harness</h1>
          <p className="text-sm text-gray-500 mt-1">スタッフ用ログイン</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">APIキー / LINE案内文</label>
            <textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="lh_... またはLINEで届いた案内文をそのまま貼り付け"
              className="w-full min-h-28 px-4 py-3 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent bg-white/80"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2">
              案内文を丸ごと貼っても、lh_ から始まるAPIキーだけを自動で読み取ります。
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="lh-gradient-button w-full py-3 font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
