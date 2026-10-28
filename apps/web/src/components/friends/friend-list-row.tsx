'use client'

import { useRouter } from 'next/navigation'
import type { FriendListItem } from '@/lib/api'
import TagBadge from './tag-badge'

interface Props {
  friend: FriendListItem
  onTagEditClick?: () => void
  tagEditorOpen?: boolean
  onProfileEditClick?: () => void
}

export default function FriendListRow({ friend, onTagEditClick, tagEditorOpen, onProfileEditClick }: Props) {
  const router = useRouter()
  const navigateToChat = () => router.push(`/chats?friend=${friend.id}`)
  const incoming = friend.latestIncomingMessage
  const scenario = friend.activeScenario
  const lineDisplayName = friend.lineDisplayName || friend.displayName
  const showLineName = Boolean(friend.harnessDisplayName && lineDisplayName && lineDisplayName !== friend.displayName)

  return (
    <div
      onClick={navigateToChat}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigateToChat()
        }
      }}
      className="grid cursor-pointer grid-cols-[80px_220px_120px_1fr_280px] items-start gap-3 border-b border-pink-100 px-4 py-3 transition hover:bg-pink-50/50 focus:bg-pink-50/50 focus:outline-none"
    >
      <div className="pt-1">
        <StatusBadge status={friend.chatStatus} />
      </div>

      <div className="flex items-start gap-2">
        {friend.pictureUrl ? (
          <img
            src={friend.pictureUrl}
            alt={friend.displayName}
            className="h-9 w-9 flex-shrink-0 rounded-full bg-gray-100 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-medium text-pink-700">
            {friend.displayName?.charAt(0) ?? '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{friend.displayName}</p>
          {showLineName && (
            <p className="mt-0.5 truncate text-[10px] text-gray-400">LINE名: {lineDisplayName}</p>
          )}
          <p className="mt-0.5 text-[10px] text-gray-400">登録: {formatJstDate(friend.createdAt)}</p>
          {!friend.isFollowing && (
            <p className="mt-0.5 text-[10px] text-red-400">ブロック / 退出</p>
          )}
          {onProfileEditClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onProfileEditClick()
              }}
              className="mt-1 rounded-full border border-pink-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-pink-700 hover:bg-pink-50"
            >
              プロフィール
            </button>
          )}
        </div>
      </div>

      <div className="pt-1">
        {scenario ? (
          <div>
            <p className="truncate text-xs font-medium text-blue-700" title={scenario.name}>
              {scenario.name}
            </p>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {formatScenarioStatus(scenario.status)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-gray-400">停止中</span>
        )}
      </div>

      <div className="min-w-0">
        {incoming ? (
          <>
            <p className="line-clamp-2 break-all text-xs text-gray-700">
              {incoming.messageType === 'text' ? incoming.content : `[${incoming.messageType}]`}
            </p>
            <p className="mt-1 text-[10px] text-gray-400">
              ({formatJstTimestamp(incoming.createdAt)})
            </p>
          </>
        ) : (
          <span className="text-xs text-gray-400">受信なし</span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          {friend.tags.length > 0 ? (
            friend.tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
          ) : (
            <span className="inline-flex items-center rounded-full border border-pink-100 bg-pink-50 px-2 py-0.5 text-[10px] text-pink-500">
              タグなし
            </span>
          )}
        </div>

        {friend.firstTrackedLinkName && (
          <p className="text-[10px] text-gray-500">
            <span className="text-gray-400">流入：</span>
            {friend.firstTrackedLinkName}
          </p>
        )}
        {friend.refCode && !friend.firstTrackedLinkName && (
          <p className="text-[10px] text-gray-500">
            <span className="text-gray-400">流入：</span>
            {friend.refCode}
          </p>
        )}

        {onTagEditClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTagEditClick()
            }}
            className={`mt-1 inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${
              tagEditorOpen
                ? 'border-pink-200 bg-pink-100 text-pink-800'
                : 'border-pink-200 bg-white text-pink-700 hover:bg-pink-50'
            }`}
          >
            {tagEditorOpen ? 'タグ編集中' : '＋ タグ'}
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status?: FriendListItem['chatStatus'] }) {
  if (status === 'unread') {
    return (
      <span className="inline-flex rounded border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        未読
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex rounded border border-yellow-100 bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
        対応中
      </span>
    )
  }
  return (
    <span className="inline-flex rounded border border-gray-100 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
      対応済み
    </span>
  )
}

function formatScenarioStatus(status: string): string {
  if (status === 'active') return '配信中'
  if (status === 'delivering') return '配信処理中'
  if (status === 'paused') return '一時停止'
  if (status === 'completed') return '完了'
  return status
}

function formatJstTimestamp(iso: string): string {
  const trimmed = iso.replace(/(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?$/, '')
  return trimmed.replace('T', ' ').slice(0, 19)
}

function formatJstDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '/')
}
