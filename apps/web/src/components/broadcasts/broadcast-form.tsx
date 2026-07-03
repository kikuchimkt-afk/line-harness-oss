'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Tag } from '@line-crm/shared'
import { api, eventsApi, type ApiBroadcast, type EventListItem, type FriendListItem } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import FlexPreviewComponent from '@/components/flex-preview'
import ImageUploader from '@/components/shared/image-uploader'
import MultiAccountDedupSection from './multi-account-dedup-section'

interface BroadcastFormProps {
  tags: Tag[]
  onSuccess: () => void
  onCancel: () => void
}

const messageTypeLabels: Record<ApiBroadcast['messageType'], string> = {
  text: 'テキスト',
  image: '画像',
  flex: 'Flexメッセージ',
}

interface FormState {
  title: string
  messageType: ApiBroadcast['messageType']
  messageContent: string
  targetType: ApiBroadcast['targetType']
  targetTagId: string
  targetFriendIds: string[]
  scheduledAt: string
  sendNow: boolean
  accountIds: string[]
  dedupPriority: string[]
}

export default function BroadcastForm({ tags, onSuccess, onCancel }: BroadcastFormProps) {
  const { selectedAccountId } = useAccount()
  const [linkableEvents, setLinkableEvents] = useState<EventListItem[]>([])
  const [form, setForm] = useState<FormState>({
    title: '',
    messageType: 'text',
    messageContent: '',
    targetType: 'all',
    targetTagId: '',
    targetFriendIds: [],
    scheduledAt: '',
    sendNow: true,
    accountIds: [],
    dedupPriority: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientTagId, setRecipientTagId] = useState('')
  const [recipientItems, setRecipientItems] = useState<FriendListItem[]>([])
  const [recipientLoading, setRecipientLoading] = useState(false)
  const [recipientError, setRecipientError] = useState('')

  useEffect(() => {
    if (!selectedAccountId) return
    let cancelled = false
    eventsApi.listEvents(selectedAccountId)
      .then((r) => {
        if (!cancelled) setLinkableEvents(r.items.filter((e) => e.is_published === 1))
      })
      .catch(() => {
        if (!cancelled) setLinkableEvents([])
      })
    return () => { cancelled = true }
  }, [selectedAccountId])

  useEffect(() => {
    if (form.targetType !== 'friends' || !selectedAccountId) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setRecipientLoading(true)
      setRecipientError('')
      api.friends.list({
        accountId: selectedAccountId,
        search: recipientSearch.trim() || undefined,
        tagId: recipientTagId || undefined,
        includeTags: true,
        includeChatStatus: false,
        limit: 500,
        sort: 'oldest',
      })
        .then((res) => {
          if (cancelled) return
          if (res.success) {
            setRecipientItems(res.data.items)
          } else {
            setRecipientError(res.error || '友だちの取得に失敗しました')
          }
        })
        .catch(() => {
          if (!cancelled) setRecipientError('友だちの取得に失敗しました')
        })
        .finally(() => {
          if (!cancelled) setRecipientLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.targetType, selectedAccountId, recipientSearch, recipientTagId])

  const selectedFriendSet = useMemo(() => new Set(form.targetFriendIds), [form.targetFriendIds])
  const selectableFriends = useMemo(
    () => recipientItems.filter((friend) => friend.isFollowing),
    [recipientItems],
  )

  const setTargetType = (targetType: ApiBroadcast['targetType']) => {
    setForm((prev) => ({
      ...prev,
      targetType,
      targetTagId: targetType === 'tag' || targetType === 'multi-account-dedup' ? prev.targetTagId : '',
      targetFriendIds: targetType === 'friends' ? prev.targetFriendIds : [],
    }))
  }

  const toggleFriend = (friendId: string) => {
    setForm((prev) => {
      const next = new Set(prev.targetFriendIds)
      if (next.has(friendId)) next.delete(friendId)
      else next.add(friendId)
      return { ...prev, targetFriendIds: Array.from(next) }
    })
  }

  const selectVisibleFriends = () => {
    setForm((prev) => {
      const next = new Set(prev.targetFriendIds)
      selectableFriends.forEach((friend) => next.add(friend.id))
      return { ...prev, targetFriendIds: Array.from(next) }
    })
  }

  const clearSelectedFriends = () => {
    setForm((prev) => ({ ...prev, targetFriendIds: [] }))
  }

  const handleSave = async () => {
    if (!form.title.trim()) { setError('配信タイトルを入力してください'); return }
    if (!form.messageContent.trim()) { setError('メッセージ内容を入力してください'); return }
    if (form.messageType === 'flex') {
      try { JSON.parse(form.messageContent) } catch { setError('FlexメッセージのJSONが無効です'); return }
    }
    if (form.targetType === 'tag' && !form.targetTagId) {
      setError('対象タグを選択してください')
      return
    }
    if (form.targetType === 'friends' && form.targetFriendIds.length === 0) {
      setError('送信する友だちを1人以上選択してください')
      return
    }
    if (!form.sendNow && !form.scheduledAt) {
      setError('予約配信の場合は配信日時を指定してください')
      return
    }
    if (form.targetType === 'multi-account-dedup' && form.accountIds.length === 0) {
      setError('複数アカ重複除外の配信先アカウントを1つ以上選択してください')
      return
    }

    setSaving(true)
    setError('')
    try {
      const res = await api.broadcasts.create({
        title: form.title,
        messageType: form.messageType,
        messageContent: form.messageContent,
        targetType: form.targetType,
        targetTagId:
          form.targetType === 'tag'
            ? form.targetTagId || null
            : form.targetType === 'multi-account-dedup'
            ? form.targetTagId || null
            : null,
        status: 'draft',
        lineAccountId: form.targetType === 'multi-account-dedup' ? null : (selectedAccountId || null),
        accountIds: form.targetType === 'multi-account-dedup' ? form.accountIds : undefined,
        dedupPriority: form.targetType === 'multi-account-dedup' ? form.dedupPriority : undefined,
        targetFriendIds: form.targetType === 'friends' ? form.targetFriendIds : undefined,
        scheduledAt: form.sendNow || !form.scheduledAt
          ? null
          : form.scheduledAt + ':00.000+09:00',
      })
      if (res.success) {
        onSuccess()
      } else {
        setError(res.error)
      }
    } catch {
      setError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white/82 backdrop-blur rounded-lg shadow-sm border border-pink-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-5">新規配信を作成</h2>

      <div className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            配信タイトル <span className="text-pink-500">*</span>
          </label>
          <input
            type="text"
            className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-pink-200"
            placeholder="例: 3月のキャンペーン告知"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">メッセージ種別</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(messageTypeLabels) as ApiBroadcast['messageType'][]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, messageType: type })}
                className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-md border transition-colors ${
                  form.messageType === type
                    ? 'border-pink-300 text-pink-700 bg-pink-50'
                    : 'border-pink-100 text-gray-600 bg-white/80 hover:border-pink-200'
                }`}
              >
                {messageTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            メッセージ内容 <span className="text-pink-500">*</span>
            {(form.messageType === 'flex' || form.messageType === 'image') && (
              <span className="ml-1 text-gray-400">(JSON形式)</span>
            )}
          </label>

          {form.messageType === 'image' && (
            <div className="mb-2">
              <ImageUploader
                mode="line-image"
                value={(() => {
                  try {
                    const parsed = JSON.parse(form.messageContent) as { originalContentUrl?: string; previewImageUrl?: string }
                    if (parsed.originalContentUrl) {
                      return {
                        mode: 'line-image' as const,
                        originalContentUrl: parsed.originalContentUrl,
                        previewImageUrl: parsed.previewImageUrl ?? parsed.originalContentUrl,
                      }
                    }
                  } catch {
                    // ignore
                  }
                  return null
                })()}
                onChange={(v) => {
                  if (v?.mode === 'line-image') {
                    setForm((prev) => ({
                      ...prev,
                      messageContent: JSON.stringify({
                        originalContentUrl: v.originalContentUrl,
                        previewImageUrl: v.previewImageUrl,
                      }),
                    }))
                  } else {
                    setForm((prev) => ({ ...prev, messageContent: '' }))
                  }
                }}
                label="送信する画像"
              />
            </div>
          )}

          {linkableEvents.length > 0 && form.messageType === 'text' && (
            <div className="mb-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                リンクするイベント（任意）
              </label>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  const url = `https://liff.line.me/{{liff_id}}/?page=event&id=${id}`
                  setForm((prev) => ({
                    ...prev,
                    messageContent: prev.messageContent ? `${prev.messageContent}\n${url}` : url,
                  }))
                  e.target.value = ''
                }}
                className="border border-pink-200 rounded-lg px-2 py-1.5 text-sm w-full bg-white/80"
              >
                <option value="">-- 選択しない --</option>
                {linkableEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({ev.target_type === 'multi-account-dedup' ? 'multi' : 'single'})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                選ぶと本文末尾にイベントURLを挿入します。
              </p>
            </div>
          )}

          <textarea
            className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-y"
            rows={form.messageType === 'flex' ? 8 : form.messageType === 'image' ? 3 : 4}
            placeholder={
              form.messageType === 'text'
                ? '配信するメッセージを入力...'
                : form.messageType === 'image'
                ? '{"originalContentUrl":"...","previewImageUrl":"..."}'
                : '{"type":"bubble","body":{...}}'
            }
            value={form.messageContent}
            onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
            style={{ fontFamily: form.messageType !== 'text' ? 'monospace' : 'inherit' }}
          />
          {form.messageType === 'image' && (
            <p className="text-xs text-gray-400 mt-1">上のURLフォームか、直接JSONを編集できます。</p>
          )}
          {form.messageType === 'flex' && form.messageContent && (() => {
            try { JSON.parse(form.messageContent); return true } catch { return false }
          })() && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">プレビュー</p>
              <FlexPreviewComponent content={form.messageContent} maxWidth={300} />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">配信対象</label>
          <div className="flex flex-wrap gap-2 mb-2">
            <TargetButton active={form.targetType === 'all'} onClick={() => setTargetType('all')}>
              全員
            </TargetButton>
            <TargetButton active={form.targetType === 'friends'} onClick={() => setTargetType('friends')}>
              送信先を選択
            </TargetButton>
            <TargetButton active={form.targetType === 'tag'} onClick={() => setTargetType('tag')}>
              タグで絞り込み
            </TargetButton>
            <TargetButton active={form.targetType === 'multi-account-dedup'} onClick={() => setTargetType('multi-account-dedup')}>
              複数アカ重複除外
            </TargetButton>
          </div>

          {form.targetType === 'tag' && (
            <select
              className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-pink-200"
              value={form.targetTagId}
              onChange={(e) => setForm({ ...form, targetTagId: e.target.value })}
            >
              <option value="">タグを選択...</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          )}

          {form.targetType === 'friends' && (
            <div className="rounded-lg border border-pink-200 bg-white/70 p-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                <input
                  type="search"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="友だち名を検索"
                  className="border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
                <select
                  value={recipientTagId}
                  onChange={(e) => setRecipientTagId(e.target.value)}
                  className="border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  <option value="">すべてのタグ</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectVisibleFriends}
                  disabled={selectableFriends.length === 0}
                  className="px-3 py-1.5 min-h-[40px] text-xs font-medium rounded-md border border-pink-200 text-pink-700 bg-pink-50 hover:bg-pink-100 disabled:opacity-50"
                >
                  表示中を全員選択
                </button>
                <button
                  type="button"
                  onClick={clearSelectedFriends}
                  disabled={form.targetFriendIds.length === 0}
                  className="px-3 py-1.5 min-h-[40px] text-xs font-medium rounded-md border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  全員解除
                </button>
                <span className="text-xs text-gray-500">
                  選択中 {form.targetFriendIds.length.toLocaleString('ja-JP')}人
                  {selectableFriends.length > 0 && ` / 表示中 ${selectableFriends.length.toLocaleString('ja-JP')}人`}
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-pink-100 bg-white">
                {recipientLoading ? (
                  <div className="p-4 text-sm text-gray-500">読み込み中...</div>
                ) : recipientError ? (
                  <div className="p-4 text-sm text-red-600">{recipientError}</div>
                ) : selectableFriends.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">対象の友だちは見つかりませんでした。</div>
                ) : (
                  selectableFriends.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex items-center gap-3 border-b border-pink-50 px-3 py-2 last:border-b-0 hover:bg-pink-50/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFriendSet.has(friend.id)}
                        onChange={() => toggleFriend(friend.id)}
                        className="h-4 w-4 accent-pink-500"
                      />
                      {friend.pictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={friend.pictureUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-100 text-xs font-semibold text-pink-600">
                          {friend.displayName?.slice(0, 1) || '?'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{friend.displayName || '名前なし'}</span>
                        {friend.tags.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {friend.tags.slice(0, 3).map((tag) => (
                              <span key={tag.id} className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] text-pink-700">
                                {tag.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {form.targetType === 'multi-account-dedup' && (
            <MultiAccountDedupSection
              accountIds={form.accountIds}
              dedupPriority={form.dedupPriority}
              targetTagId={form.targetTagId || null}
              tags={tags}
              onAccountIdsChange={(ids) => setForm({ ...form, accountIds: ids })}
              onDedupPriorityChange={(ids) => setForm({ ...form, dedupPriority: ids })}
              onTargetTagIdChange={(id) => setForm({ ...form, targetTagId: id ?? '' })}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">配信タイミング</label>
          <div className="flex flex-wrap gap-2 mb-2">
            <TargetButton active={form.sendNow} onClick={() => setForm({ ...form, sendNow: true, scheduledAt: '' })}>
              下書きとして保存
            </TargetButton>
            <TargetButton active={!form.sendNow} onClick={() => setForm({ ...form, sendNow: false })}>
              予約配信
            </TargetButton>
          </div>
          {!form.sendNow && (
            <input
              type="datetime-local"
              className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-pink-200"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            />
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-pink-700 bg-pink-100 hover:bg-pink-200 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? '作成中...' : '作成'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-white/80 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

function TargetButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-md border transition-colors ${
        active
          ? 'border-pink-300 text-pink-700 bg-pink-50'
          : 'border-pink-100 text-gray-600 bg-white/80 hover:border-pink-200'
      }`}
    >
      {children}
    </button>
  )
}
