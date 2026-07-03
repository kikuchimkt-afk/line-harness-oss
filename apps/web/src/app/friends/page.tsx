'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'
import type { FriendListItem } from '@/lib/api'
import Header from '@/components/layout/header'
import FriendListTable from '@/components/friends/friend-list-table'
import TagManagerModal from '@/components/friends/tag-manager-modal'
import CcPromptButton from '@/components/cc-prompt-button'
import { useAccount } from '@/contexts/account-context'

const ccPrompts = [
  {
    title: '友だちのセグメント分析',
    prompt: `友だち一覧のデータを分析してください。
1. タグ別の友だち数を集計
2. アクティブ率の高いセグメントを特定
3. エンゲージメントが低い層への施策を提案
レポート形式で出力してください。`,
  },
  {
    title: 'タグ一括管理',
    prompt: `友だちのタグを一括管理してください。
1. 未タグの友だちを特定
2. 行動履歴に基づいたタグ付け提案
3. 不要タグの整理
作業手順を示してください。`,
  },
]

const PAGE_SIZE = 20

type SortMode = 'recent' | 'oldest'
type ResponseFilter = 'all' | 'unhandled'

export default function FriendsPage() {
  const { selectedAccountId } = useAccount()
  const [friends, setFriends] = useState<FriendListItem[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>('all')
  const [showTagManager, setShowTagManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTags = useCallback(async () => {
    try {
      const res = await api.tags.list()
      if (res.success) setAllTags(res.data)
    } catch {
      // Tag loading should not block the friends list.
    }
  }, [])

  const loadFriends = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.friends.list({
        offset: String((page - 1) * PAGE_SIZE),
        limit: PAGE_SIZE,
        tagId: selectedTagId || undefined,
        accountId: selectedAccountId || undefined,
        search: searchSubmitted || undefined,
        includeChatStatus: true,
        sort: sortMode,
        handled: responseFilter === 'unhandled' ? 'unhandled' : undefined,
      })
      if (res.success) {
        setFriends(res.data.items)
        setTotal(res.data.total)
        setHasNextPage(res.data.hasNextPage)
      } else {
        setError(res.error)
      }
    } catch {
      setError('友だちの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [page, selectedTagId, selectedAccountId, searchSubmitted, sortMode, responseFilter])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    setPage(1)
  }, [selectedAccountId])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  const updateAndResetPage = (cb: () => void) => {
    cb()
    setPage(1)
  }

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    updateAndResetPage(() => setSearchSubmitted(searchInput.trim()))
  }

  const handleSearchInputChange = (v: string) => {
    setSearchInput(v)
    if (v.trim() === '' && searchSubmitted !== '') {
      updateAndResetPage(() => setSearchSubmitted(''))
    }
  }

  const handleSortChange = (v: SortMode) => updateAndResetPage(() => setSortMode(v))
  const handleResponseFilterChange = (v: ResponseFilter) => updateAndResetPage(() => setResponseFilter(v))
  const handleTagFilterChange = (v: string) => updateAndResetPage(() => setSelectedTagId(v))

  const refreshAfterTagChange = async () => {
    await loadTags()
    await loadFriends()
  }

  return (
    <div>
      <Header
        title="友だちリスト"
        description="友だちの検索、対応状況、タグの確認と整理ができます。"
        action={(
          <button
            type="button"
            onClick={() => setShowTagManager(true)}
            className="rounded-lg border border-pink-200 bg-white/80 px-4 py-2 text-sm font-semibold text-pink-700 shadow-sm transition hover:bg-pink-50"
          >
            タグを作成・整理
          </button>
        )}
      />

      <div className="mb-4 rounded-lg border border-pink-100 bg-white/80 p-4 shadow-sm backdrop-blur">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            placeholder="友だち名を検索"
            className="flex-1 rounded-lg border border-pink-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          <select
            value={sortMode}
            onChange={(e) => handleSortChange(e.target.value as SortMode)}
            className="rounded-lg border border-pink-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          >
            <option value="recent">友だち追加の新しい順</option>
            <option value="oldest">友だち追加の古い順</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-pink-300 px-4 py-2 text-sm font-semibold text-pink-950 transition hover:bg-pink-200"
          >
            検索
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-pink-100 pt-3">
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-xs font-medium text-pink-900/70">タグ:</label>
            <select
              className="rounded-lg border border-pink-200 bg-white/80 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-200"
              value={selectedTagId}
              onChange={(e) => handleTagFilterChange(e.target.value)}
            >
              <option value="">すべて</option>
              {allTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-xs font-medium text-pink-900/70">対応マーク:</label>
            <select
              className="rounded-lg border border-pink-200 bg-white/80 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-200"
              value={responseFilter}
              onChange={(e) => handleResponseFilterChange(e.target.value as ResponseFilter)}
            >
              <option value="all">すべて</option>
              <option value="unhandled">未対応のみ</option>
            </select>
          </div>
          <span className="ml-auto text-xs text-pink-900/60">
            {loading ? '読み込み中...' : `${total.toLocaleString('ja-JP')}件`}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-pink-100 bg-white/80 shadow-sm">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid animate-pulse grid-cols-[80px_220px_120px_1fr_280px] gap-3 border-b border-pink-50 px-4 py-4">
              <div className="h-5 w-16 rounded bg-pink-50" />
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-pink-100" />
                <div className="h-3 w-24 rounded bg-pink-100" />
              </div>
              <div className="h-3 w-20 rounded bg-pink-50" />
              <div className="space-y-2">
                <div className="h-3 w-3/4 rounded bg-pink-50" />
                <div className="h-2 w-20 rounded bg-pink-50" />
              </div>
              <div className="h-5 w-32 rounded bg-pink-50" />
            </div>
          ))}
        </div>
      ) : (
        <FriendListTable
          friends={friends}
          allTags={allTags}
          onRefresh={loadFriends}
          onTagsChanged={refreshAfterTagChange}
        />
      )}

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-pink-900/60">
            {((page - 1) * PAGE_SIZE) + 1}〜{Math.min(page * PAGE_SIZE, total)}件 / 全{total.toLocaleString('ja-JP')}件
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[44px] rounded-lg border border-pink-200 bg-white/80 px-3 py-2 text-sm transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              前へ
            </button>
            <span className="px-1 text-sm text-pink-900/70">{page}ページ</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              className="min-h-[44px] rounded-lg border border-pink-200 bg-white/80 px-3 py-2 text-sm transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        </div>
      )}

      <CcPromptButton prompts={ccPrompts} />

      {showTagManager && (
        <TagManagerModal
          tags={allTags}
          onClose={() => setShowTagManager(false)}
          onChanged={refreshAfterTagChange}
        />
      )}
    </div>
  )
}
