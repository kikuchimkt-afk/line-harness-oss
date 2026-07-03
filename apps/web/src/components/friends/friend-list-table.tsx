'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import { api } from '@/lib/api'
import FriendListRow from './friend-list-row'
import TagBadge from './tag-badge'

interface Props {
  friends: FriendListItem[]
  allTags: Tag[]
  onRefresh: () => void | Promise<void>
  onTagsChanged?: () => void | Promise<void>
}

const TAG_COLORS = ['#F9A8D4', '#FBCFE8', '#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD', '#C4B5FD']

export default function FriendListTable({ friends, allTags, onRefresh, onTagsChanged }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resetInputs = () => {
    setSelectedTagId('')
    setNewTagName('')
    setNewTagColor(TAG_COLORS[0])
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
    resetInputs()
    setError('')
  }

  const handleAddTag = async (friendId: string) => {
    if (!selectedTagId || loading) return
    setLoading(true)
    setError('')
    try {
      await api.friends.addTag(friendId, selectedTagId)
      resetInputs()
      await onRefresh()
    } catch {
      setError('タグの追加に失敗しました。時間をおいてもう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAndAddTag = async (friendId: string) => {
    const name = newTagName.trim()
    if (!name || loading) return
    setLoading(true)
    setError('')
    try {
      const created = await api.tags.create({ name, color: newTagColor })
      if (created.success) {
        await api.friends.addTag(friendId, created.data.id)
        resetInputs()
        if (onTagsChanged) {
          await onTagsChanged()
        } else {
          await onRefresh()
        }
      } else {
        setError(created.error || 'タグの作成に失敗しました。')
      }
    } catch {
      setError('タグの作成に失敗しました。時間をおいてもう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTag = async (friendId: string, tagId: string) => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await api.friends.removeTag(friendId, tagId)
      await onRefresh()
    } catch {
      setError('タグを外せませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  if (friends.length === 0) {
    return (
      <div className="rounded-lg border border-pink-100 bg-white/80 p-12 text-center shadow-sm">
        <p className="text-gray-500">友だちが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-pink-100 bg-white/80 shadow-sm backdrop-blur">
      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[80px_220px_120px_1fr_280px] gap-3 border-b border-pink-100 bg-pink-50/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
            <div>対応</div>
            <div>名前</div>
            <div>シナリオ</div>
            <div>受信メッセージ</div>
            <div>タグ・流入元</div>
          </div>

          {friends.map((friend) => {
            const isExpanded = expandedId === friend.id
            const availableTags = allTags.filter(
              (tag) => !friend.tags.some((friendTag) => friendTag.id === tag.id),
            )

            return (
              <div key={friend.id}>
                <FriendListRow
                  friend={friend}
                  onTagEditClick={() => toggleExpand(friend.id)}
                  tagEditorOpen={isExpanded}
                />

                {isExpanded && (
                  <div className="border-b border-pink-100 bg-pink-50/40 px-6 py-4">
                    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                      <section className="rounded-lg border border-pink-100 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">この友だちのタグ</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              いま付いているタグを確認し、不要なものは右側の × で外せます。
                            </p>
                          </div>
                          {loading && <span className="text-xs text-pink-600">保存中...</span>}
                        </div>

                        {friend.tags.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {friend.tags.map((tag) => (
                              <TagBadge
                                key={tag.id}
                                tag={tag}
                                onRemove={() => handleRemoveTag(friend.id, tag.id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="mb-3 text-xs text-gray-400">まだタグが付いていません。</p>
                        )}

                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select
                            className="rounded-lg border border-pink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                            value={selectedTagId}
                            onChange={(e) => setSelectedTagId(e.target.value)}
                          >
                            <option value="">追加するタグを選ぶ</option>
                            {availableTags.map((tag) => (
                              <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAddTag(friend.id)}
                            disabled={!selectedTagId || loading}
                            className="rounded-lg border border-pink-200 bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-800 hover:bg-pink-200 disabled:opacity-50"
                          >
                            追加
                          </button>
                        </div>

                        {availableTags.length === 0 && allTags.length > 0 && (
                          <p className="mt-2 text-xs text-gray-400">作成済みのタグはすべて付いています。</p>
                        )}
                      </section>

                      <section className="rounded-lg border border-pink-100 bg-white p-4">
                        <p className="mb-2 text-sm font-semibold text-gray-800">
                          新しいタグを作って付ける
                        </p>
                        <input
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleCreateAndAddTag(friend.id)
                            }
                          }}
                          placeholder="例：体験希望"
                          className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                        />
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {TAG_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setNewTagColor(color)}
                              className={`h-6 w-6 rounded-full border-2 ${newTagColor === color ? 'border-gray-900' : 'border-white shadow-sm'}`}
                              style={{ backgroundColor: color }}
                              aria-label={`色 ${color}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCreateAndAddTag(friend.id)}
                          disabled={!newTagName.trim() || loading}
                          className="mt-3 w-full rounded-lg border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800 hover:bg-pink-100 disabled:opacity-50"
                        >
                          作成して追加
                        </button>
                      </section>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="select-all break-all font-mono text-[11px] text-gray-500">
                        LINEユーザーID：{friend.lineUserId}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleExpand(friend.id)}
                        className="text-xs text-gray-500 underline hover:text-gray-700"
                      >
                        閉じる
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
