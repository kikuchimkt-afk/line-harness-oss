'use client'

import { useState } from 'react'
import type { FriendListItem } from '@/lib/api'
import { api, type FriendProfileInput } from '@/lib/api'

interface Props {
  friend: FriendListItem
  onClose: () => void
  onSaved: () => void | Promise<void>
}

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

export default function FriendProfileModal({ friend, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProfileForm>({
    harnessDisplayName: friend.harnessDisplayName ?? metaString(friend, 'harnessDisplayName'),
    profileType: metaString(friend, 'profileType'),
    kana: metaString(friend, 'kana'),
    schoolGrade: metaString(friend, 'schoolGrade'),
    phone: metaString(friend, 'phone'),
    email: metaString(friend, 'email'),
    memo: metaString(friend, 'memo'),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lineDisplayName = friend.lineDisplayName || friend.displayName || '名前なし'
  const effectiveName = form.harnessDisplayName.trim() || lineDisplayName

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-pink-100 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-pink-100 px-5 py-4">
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
              <h2 className="truncate text-lg font-bold text-gray-900">友だちプロフィール編集</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                LINE名: {lineDisplayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>

        <div className="space-y-5 p-5">
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-lg border border-pink-100 bg-pink-50/40 p-4">
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

          <section className="grid gap-4 sm:grid-cols-2">
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

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-pink-50 pt-4">
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
    </div>
  )
}
