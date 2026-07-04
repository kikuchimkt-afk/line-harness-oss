'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

interface Friend {
  id: string
  displayName: string
  pictureUrl: string | null
}

interface NoticeRecipientsSettingProps {
  accountId: string
}

export default function NoticeRecipientsSetting({ accountId }: NoticeRecipientsSettingProps) {
  const [recipients, setRecipients] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Friend[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.accountSettings.getNoticeRecipients(accountId)
      if (res.success) setRecipients(res.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (search.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.friends.list({ search, accountId, limit: 10, includeTags: false })
        if (res.success) {
          const existing = new Set(recipients.map((r) => r.id))
          const items = (res.data as unknown as { items: Friend[] }).items ?? res.data
          setSearchResults(
            (Array.isArray(items) ? items : [])
              .filter((f: Friend) => !existing.has(f.id))
              .map((f: Friend) => ({
                id: f.id,
                displayName: f.displayName,
                pictureUrl: f.pictureUrl,
              })),
          )
        }
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, accountId, recipients])

  const persist = async (updated: Friend[]) => {
    setRecipients(updated)
    setSaving(true)
    try {
      await api.accountSettings.updateNoticeRecipients(accountId, updated.map((r) => r.id))
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const addRecipient = async (friend: Friend) => {
    await persist([...recipients, friend])
    setSearch('')
    setSearchResults([])
  }

  const removeRecipient = async (friendId: string) => {
    await persist(recipients.filter((r) => r.id !== friendId))
  }

  if (loading) return <p className="text-xs text-gray-400">読み込み中...</p>

  return (
    <div className="mt-3 pt-3 border-t border-pink-100">
      <div className="mb-2">
        <h4 className="text-xs font-semibold text-gray-700">管理者LINE通知先</h4>
        <p className="text-[11px] text-gray-500 mt-1">
          新しい友だち追加やメッセージ受信があったとき、ここで選んだ管理者へLINEで知らせます。
        </p>
      </div>

      {recipients.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {recipients.map((recipient) => (
            <span
              key={recipient.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-pink-50 text-pink-700 border border-pink-100 rounded-full text-xs"
            >
              {recipient.pictureUrl && <img src={recipient.pictureUrl} alt="" className="w-4 h-4 rounded-full" />}
              {recipient.displayName}
              <button
                type="button"
                onClick={() => removeRecipient(recipient.id)}
                className="text-pink-400 hover:text-pink-700 ml-0.5"
                aria-label={`${recipient.displayName}を通知先から外す`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          placeholder="通知を受ける管理者を検索して追加..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-pink-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-300"
        />
        {searching && <span className="absolute right-2 top-1.5 text-xs text-gray-400">検索中...</span>}
        {saving && <span className="absolute right-2 top-1.5 text-xs text-pink-500">保存中...</span>}

        {searchResults.length > 0 && (
          <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-pink-100 rounded-lg shadow-lg max-h-40 overflow-y-auto">
            {searchResults.map((friend) => (
              <li key={friend.id}>
                <button
                  type="button"
                  onClick={() => addRecipient(friend)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-pink-50 text-left text-xs"
                >
                  {friend.pictureUrl ? (
                    <img src={friend.pictureUrl} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-pink-100" />
                  )}
                  {friend.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
