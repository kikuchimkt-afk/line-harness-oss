'use client'

import { useState } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'
import TagBadge from './tag-badge'

interface Props {
  tags: Tag[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}

const TAG_COLORS = [
  '#F9A8D4',
  '#FBCFE8',
  '#FCA5A5',
  '#FDBA74',
  '#FDE68A',
  '#86EFAC',
  '#93C5FD',
  '#C4B5FD',
  '#D8B4FE',
  '#CBD5E1',
]

export default function TagManagerModal({ tags, onClose, onChanged }: Props) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(TAG_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    await onChanged()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    setError('')
    try {
      await api.tags.create({ name, color: newColor })
      setNewName('')
      setNewColor(TAG_COLORS[0])
      await refresh()
    } catch {
      setError('タグの作成に失敗しました。時間をおいてもう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setDraftName(tag.name)
    setDraftColor(tag.color || TAG_COLORS[0])
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
    setDraftColor(TAG_COLORS[0])
  }

  const handleUpdate = async (tagId: string) => {
    const name = draftName.trim()
    if (!name || saving) return
    setSaving(true)
    setError('')
    try {
      await api.tags.update(tagId, { name, color: draftColor })
      cancelEdit()
      await refresh()
    } catch {
      setError('タグの更新に失敗しました。時間をおいてもう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tag: Tag) => {
    const ok = confirm(`タグ「${tag.name}」を削除しますか？\nこのタグは、付いている友だちからも外れます。`)
    if (!ok) return
    setSaving(true)
    setError('')
    try {
      await api.tags.delete(tag.id)
      if (editingId === tag.id) cancelEdit()
      await refresh()
    } catch {
      setError('タグの削除に失敗しました。時間をおいてもう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-pink-100 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-pink-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">タグを作成・整理</h2>
            <p className="mt-1 text-xs text-gray-500">
              友だちを分類するためのタグ名と色をまとめて管理できます。
            </p>
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
            <h3 className="mb-3 text-sm font-semibold text-gray-800">新しいタグを作る</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">タグ名</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreate()
                    }
                  }}
                  placeholder="例：体験希望、保護者、英検"
                  className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
                className="rounded-lg border border-pink-200 bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-800 hover:bg-pink-200 disabled:opacity-50"
              >
                作成
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-800">現在のタグ</h3>
            {tags.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                まだタグがありません。上の欄から作成できます。
              </div>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => {
                  const editing = editingId === tag.id
                  return (
                    <div key={tag.id} className="rounded-lg border border-gray-100 bg-white p-3">
                      {editing ? (
                        <div className="space-y-3">
                          <input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="w-full rounded-lg border border-pink-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                          />
                          <ColorPicker value={draftColor} onChange={setDraftColor} />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdate(tag.id)}
                              disabled={!draftName.trim() || saving}
                              className="rounded-lg border border-pink-200 bg-pink-100 px-3 py-1.5 text-xs font-semibold text-pink-800 hover:bg-pink-200 disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <TagBadge tag={tag} />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(tag)}
                              className="rounded-lg border border-pink-100 bg-pink-50 px-3 py-1.5 text-xs text-pink-700 hover:bg-pink-100"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tag)}
                              className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-3">
      <label className="mb-2 block text-xs font-medium text-gray-600">色</label>
      <div className="flex flex-wrap items-center gap-2">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-full border-2 ${value === color ? 'border-gray-900' : 'border-white shadow-sm'}`}
            style={{ backgroundColor: color }}
            aria-label={`色 ${color}`}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-gray-200 bg-white"
          aria-label="色を自由に選ぶ"
        />
      </div>
    </div>
  )
}
