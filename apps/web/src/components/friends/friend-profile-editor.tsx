'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import type { FriendListItem } from '@/lib/api'
import { api, type FriendProfileInput } from '@/lib/api'
import TagBadge from './tag-badge'

interface Props {
  friend: FriendListItem
  allTags: Tag[]
  onClose: () => void
  onSaved: () => void | Promise<void>
  onTagsChanged?: () => void | Promise<void>
}

const TAG_COLORS = ['#F9A8D4', '#FBCFE8', '#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD', '#C4B5FD']

const PROFILE_TYPES = [
  '未設定',
  '講師',
  '保護者',
  '生徒',
  '体験希望',
  '内部スタッフ',
  'その他',
]

type ProfileForm = {
  harnessDisplayName: string
  profileType: string
  kana: string
  schoolGrade: string
  phone: string
  email: string
  memo: string
}

function metaString(friend: FriendListItem, key: keyof FriendProfileInput): string {
  const value = friend.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

export default function FriendProfileEditor({ friend, allTags, onClose, onSaved, onTagsChanged }: Props) {
  const [form, setForm] = useState<ProfileForm>({
    harnessDisplayName: friend.harnessDisplayName ?? metaString(friend, 'harnessDisplayName'),
    profileType: metaString(friend, 'profileType'),
    kana: metaString(friend, 'kana'),
    schoolGrade: metaString(friend, 'schoolGrade'),
    phone: metaString(friend, 'phone'),
    email: metaString(friend, 'email'),
    memo: metaString(friend, 'memo'),
  })
  const [assignedTags, setAssignedTags] = useState<Tag[]>(friend.tags ?? [])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [tagSaving, setTagSaving] = useState(false)
  const [error, setError] = useState('')

  const lineDisplayName = friend.lineDisplayName || friend.displayName || '名前なし'
  const effectiveName = form.harnessDisplayName.trim() || lineDisplayName
  const availableTags = allTags.filter((tag) => !assignedTags.some((assigned) => assigned.id === tag.id))

  const setField = (key: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const res = await api.friends.updateProfile(friend.id, form)
      if (!res.success) {
        setError(res.error || 'プロフィールを保存できませんでした。')
        return
      }
      await onSaved()
      onClose()
    } catch {
      setError('プロフィールを保存できませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const refreshTags = async () => {
    if (onTagsChanged) {
      await onTagsChanged()
    } else {
      await onSaved()
    }
  }

  const handleAddTag = async () => {
    if (!selectedTagId || tagSaving) return
    const tag = allTags.find((item) => item.id === selectedTagId)
    if (!tag) return
    setTagSaving(true)
    setError('')
    try {
      await api.friends.addTag(friend.id, selectedTagId)
      setAssignedTags((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]))
      setSelectedTagId('')
      await refreshTags()
    } catch {
      setError('タグを追加できませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setTagSaving(false)
    }
  }

  const handleCreateAndAddTag = async () => {
    const name = newTagName.trim()
    if (!name || tagSaving) return
    setTagSaving(true)
    setError('')
    try {
      const created = await api.tags.create({ name, color: newTagColor })
      if (!created.success) {
        setError(created.error || 'タグを作成できませんでした。')
        return
      }
      await api.friends.addTag(friend.id, created.data.id)
      setAssignedTags((prev) => [...prev, created.data])
      setNewTagName('')
      setNewTagColor(TAG_COLORS[0])
      await refreshTags()
    } catch {
      setError('タグを作成できませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setTagSaving(false)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (tagSaving) return
    const previous = assignedTags
    setTagSaving(true)
    setError('')
    setAssignedTags((prev) => prev.filter((tag) => tag.id !== tagId))
    try {
      await api.friends.removeTag(friend.id, tagId)
      await refreshTags()
    } catch {
      setAssignedTags(previous)
      setError('タグを外せませんでした。時間をおいてもう一度お試しください。')
    } finally {
      setTagSaving(false)
    }
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-5xl">
        <div className="flex flex-col gap-4 border-b border-pink-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {friend.pictureUrl ? (
              <img
                src={friend.pictureUrl}
                alt=""
                className="h-12 w-12 flex-shrink-0 rounded-full bg-pink-50 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
                {effectiveName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">{effectiveName}</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                LINE名: {lineDisplayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-lg border border-pink-200 bg-white/80 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-pink-50"
          >
            一覧に戻る
          </button>
        </div>

        <div className="space-y-6 py-6">
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="border-b border-pink-100 pb-6">
            <label className="mb-1 block text-xs font-semibold text-pink-900/70">
              L Harness上の表示名
            </label>
            <input
              value={form.harnessDisplayName}
              onChange={(e) => setField('harnessDisplayName', e.target.value)}
              placeholder="例：山田さん（保護者）"
              className="w-full rounded-lg border border-pink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
            <p className="mt-2 text-xs text-gray-500">
              空欄にするとLINE名を表示します。保存後、一覧では「{effectiveName}」として表示されます。
            </p>
          </section>

          <section className="grid gap-4 border-b border-pink-100 pb-6 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">ふりがな</label>
              <input
                value={form.kana}
                onChange={(e) => setField('kana', e.target.value)}
                placeholder="例：やまだ はるこ"
                className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">区分</label>
              <select
                value={form.profileType || '未設定'}
                onChange={(e) => setField('profileType', e.target.value === '未設定' ? '' : e.target.value)}
                className="w-full rounded-lg border border-pink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                {PROFILE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">学年・所属</label>
              <input
                value={form.schoolGrade}
                onChange={(e) => setField('schoolGrade', e.target.value)}
                placeholder="例：小6 / 講師 / 北島中央"
                className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">電話番号</label>
              <input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="例：088-..."
                className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">メール</label>
              <input
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="例：sample@example.com"
                className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">メモ</label>
              <textarea
                value={form.memo}
                onChange={(e) => setField('memo', e.target.value)}
                rows={4}
                placeholder="対応メモ、兄弟姉妹、注意点など"
                className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
          </section>

          <section className="border-b border-pink-100 pb-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">タグ</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  この友だちに付けるタグを、プロフィール編集の中で整理できます。
                </p>
              </div>
              {tagSaving && <span className="text-xs font-medium text-pink-700">更新中...</span>}
            </div>

            {assignedTags.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {assignedTags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} onRemove={() => handleRemoveTag(tag.id)} />
                ))}
              </div>
            ) : (
              <p className="mb-4 rounded-lg border border-dashed border-pink-100 bg-pink-50/50 px-3 py-2 text-xs text-pink-900/60">
                まだタグが付いていません。
              </p>
            )}

            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                className="min-w-0 w-full rounded-lg border border-pink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                value={selectedTagId}
                onChange={(e) => setSelectedTagId(e.target.value)}
                disabled={tagSaving || availableTags.length === 0}
              >
                <option value="">既存タグを選んで追加</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!selectedTagId || tagSaving}
                className="rounded-lg border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800 transition hover:bg-pink-100 disabled:opacity-50"
              >
                追加
              </button>
            </div>

            {availableTags.length === 0 && allTags.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">作成済みのタグはすべて付いています。</p>
            )}

            <div className="mt-4 rounded-lg border border-pink-50 bg-pink-50/40 p-3">
              <label className="mb-1 block text-xs font-semibold text-gray-600">新しいタグを作って付ける</label>
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateAndAddTag()
                    }
                  }}
                  placeholder="例：講師 / 体験希望 / 要確認"
                  className="min-w-0 w-full rounded-lg border border-pink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                <button
                  type="button"
                  onClick={handleCreateAndAddTag}
                  disabled={!newTagName.trim() || tagSaving}
                  className="rounded-lg border border-pink-200 bg-white px-4 py-2 text-sm font-semibold text-pink-800 transition hover:bg-pink-100 disabled:opacity-50"
                >
                  作成して追加
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`h-6 w-6 rounded-full border-2 ${newTagColor === color ? 'border-gray-900' : 'border-white shadow-sm'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`タグ色 ${color}`}
                  />
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 pb-8">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-pink-200 bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-800 hover:bg-pink-200 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
    </div>
  )
}
