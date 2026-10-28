'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Tag } from '@line-crm/shared'
import Header from '@/components/layout/header'
import FriendProfileEditor from '@/components/friends/friend-profile-editor'
import { api, type FriendListItem } from '@/lib/api'

function FriendProfilePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const friendId = searchParams.get('id')
  const [friend, setFriend] = useState<FriendListItem | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTags = useCallback(async () => {
    try {
      const response = await api.tags.list()
      if (response.success) {
        setAllTags(response.data)
      }
    } catch {
      // Profile editing remains available even if the tag list cannot refresh.
    }
  }, [])

  useEffect(() => {
    if (!friendId) {
      setError('編集する友だちが指定されていません。')
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      api.friends.get(friendId),
      api.tags.list().catch(() => null),
    ])
      .then(([friendResponse, tagsResponse]) => {
        if (!active) return
        if (!friendResponse.success) {
          setError(friendResponse.error || '友だちの情報を読み込めませんでした。')
          return
        }
        setFriend(friendResponse.data)
        if (tagsResponse?.success) {
          setAllTags(tagsResponse.data)
        }
      })
      .catch(() => {
        if (active) {
          setError('友だちの情報を読み込めませんでした。時間をおいてもう一度お試しください。')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [friendId])

  const backToList = () => router.push('/friends')

  return (
    <>
      <Header
        title="プロフィール編集"
        description="表示名や連絡先、タグなどを編集できます。"
      />

      {loading && (
        <div className="py-12 text-center text-sm text-gray-500">読み込み中...</div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={backToList}
            className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 font-medium transition hover:bg-red-50"
          >
            友だち一覧に戻る
          </button>
        </div>
      )}

      {!loading && friend && (
        <FriendProfileEditor
          friend={friend}
          allTags={allTags}
          onClose={backToList}
          onSaved={() => undefined}
          onTagsChanged={loadTags}
        />
      )}
    </>
  )
}

export default function FriendProfilePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-gray-500">読み込み中...</div>}>
      <FriendProfilePageInner />
    </Suspense>
  )
}
