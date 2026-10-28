'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  clearSessionApiKey,
  getSessionApiKey,
  setCsrfToken,
} from '@/lib/api'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (pathname === '/login') {
      setChecked(true)
      return () => { cancelled = true }
    }

    // Verify the session via the HttpOnly cookie. /api/auth/session returns the
    // staff identity and refreshes the CSRF token if it was lost (e.g. reload).
    const checkSession = async () => {
      try {
        try {
          localStorage.removeItem('lh_api_key')
        } catch {
          // Legacy credential cleanup is best-effort.
        }
        const apiUrl = process.env.NEXT_PUBLIC_API_URL
        if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL is not set')

        const sessionApiKey = getSessionApiKey()
        const res = await fetch(`${apiUrl}/api/auth/session`, {
          credentials: 'include',
          headers: sessionApiKey ? { Authorization: `Bearer ${sessionApiKey}` } : undefined,
        })
        if (!res.ok) throw new Error('unauthenticated')
        const data = await res.json()
        if (!data?.success || !data?.data) throw new Error('unauthenticated')
        try {
          if (data.data.name) localStorage.setItem('lh_staff_name', data.data.name)
          if (data.data.role) localStorage.setItem('lh_staff_role', data.data.role)
        } catch {
          // Profile caching is best-effort.
        }
        if (data.csrfToken) setCsrfToken(data.csrfToken)
        if (!cancelled) setChecked(true)
      } catch {
        clearSessionApiKey()
        if (!cancelled) router.replace('/login')
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
