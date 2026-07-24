'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { Area } from './canvas-editor'
import {
  buildPhoneUri,
  isPhoneActionData,
  phoneInputFromActionData,
} from './phone-action'

type PageOption = { id: string; name: string }
type ActionSelectValue = Area['actionType'] | 'phone' | 'text_image'

const TEXT_IMAGE_POSTBACK_PREFIX = 'lh:richmenu:text-image:'

type Props = {
  area: Area
  pages: PageOption[]
  onUpdate: (patch: Partial<Area>) => void
  onDelete: () => void
}

function createActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `text-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultActionData(type: ActionSelectValue): Record<string, unknown> {
  switch (type) {
    case 'uri':
      return { uri: '' }
    case 'phone':
      return { kind: 'phone', phoneNumber: '', uri: '' }
    case 'message':
      return { text: '' }
    case 'postback':
      return { data: '', displayText: '' }
    case 'text_image': {
      const actionId = createActionId()
      return {
        kind: 'text_image',
        actionId,
        data: `${TEXT_IMAGE_POSTBACK_PREFIX}${actionId}`,
        text: '',
        image: null,
      }
    }
    case 'richmenuswitch':
      return { targetPageId: '' }
  }
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
      />
    </label>
  )
}

export function AreaProperties({ area, pages, onUpdate, onDelete }: Props) {
  const data = (area.actionData ?? {}) as Record<string, unknown>
  let selectedAction: ActionSelectValue = area.actionType
  if (area.actionType === 'uri' && isPhoneActionData(data)) {
    selectedAction = 'phone'
  } else if (area.actionType === 'postback' && data.kind === 'text_image') {
    selectedAction = 'text_image'
  }
  const phoneInput = phoneInputFromActionData(data)
  const phoneUri = buildPhoneUri(phoneInput)
  const image = data.image && typeof data.image === 'object'
    ? data.image as { originalContentUrl?: string; previewImageUrl?: string }
    : null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleTextImageUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await api.uploads.image(file)
      if (!res.success) throw new Error(res.error ?? '画像のアップロードに失敗しました')
      onUpdate({
        actionData: {
          ...data,
          image: {
            originalContentUrl: res.data.url,
            previewImageUrl: res.data.url,
            key: res.data.key,
            mimeType: res.data.mimeType,
          },
        },
      })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">選択中エリア</h3>
        <button
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline"
        >
          削除
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumField label="x" value={area.boundsX} onChange={(v) => onUpdate({ boundsX: v })} />
        <NumField label="y" value={area.boundsY} onChange={(v) => onUpdate({ boundsY: v })} />
        <NumField
          label="幅"
          value={area.boundsWidth}
          onChange={(v) => onUpdate({ boundsWidth: v })}
        />
        <NumField
          label="高さ"
          value={area.boundsHeight}
          onChange={(v) => onUpdate({ boundsHeight: v })}
        />
      </div>

      <label className="block">
        <span className="text-xs text-gray-500">アクション</span>
        <select
          value={selectedAction}
          onChange={(e) => {
            const next = e.target.value as ActionSelectValue
            let actionType: Area['actionType'] = next as Area['actionType']
            if (next === 'text_image') actionType = 'postback'
            if (next === 'phone') actionType = 'uri'
            onUpdate({
              actionType,
              actionData: defaultActionData(next),
            })
          }}
          className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="uri">URL を開く (uri)</option>
          <option value="phone">電話をかける</option>
          <option value="message">テキスト送信 (message)</option>
          <option value="text_image">テキスト＋画像を送る</option>
          <option value="postback">postback</option>
          <option value="richmenuswitch">タブ切替 (richmenuswitch)</option>
        </select>
      </label>

      {selectedAction === 'uri' && (
        <label className="block">
          <span className="text-xs text-gray-500">URL</span>
          <input
            type="url"
            value={(data.uri as string) ?? ''}
            onChange={(e) => onUpdate({ actionData: { ...data, uri: e.target.value } })}
            placeholder="https://..."
            className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            LINE 配信用 URL は tracked link (短縮 URL) 経由を推奨。
          </p>
        </label>
      )}

      {selectedAction === 'phone' && (
        <label className="block rounded-lg border border-sky-100 bg-sky-50/60 p-3">
          <span className="text-xs font-medium text-gray-700">電話番号</span>
          <input
            type="tel"
            inputMode="tel"
            value={phoneInput}
            onChange={(e) => {
              const phoneNumber = e.target.value
              onUpdate({
                actionData: {
                  ...data,
                  kind: 'phone',
                  phoneNumber,
                  uri: buildPhoneUri(phoneNumber) ?? '',
                },
              })
            }}
            placeholder="例: 088-600-8922"
            aria-invalid={phoneInput.length > 0 && !phoneUri}
            className="mt-1 block w-full rounded border border-sky-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          {phoneInput.length > 0 && !phoneUri ? (
            <p className="mt-1 text-[11px] text-red-600">
              電話番号を数字8〜15桁で入力してください。
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-gray-500">
              LINEでタップすると電話アプリが開き、発信前に端末の確認画面が表示されます。
            </p>
          )}
          {phoneUri && (
            <p className="mt-1 text-[11px] font-medium text-sky-700">
              発信先: {phoneInput}
            </p>
          )}
        </label>
      )}

      {area.actionType === 'message' && (
        <label className="block">
          <span className="text-xs text-gray-500">送信テキスト</span>
          <input
            value={(data.text as string) ?? ''}
            onChange={(e) => onUpdate({ actionData: { ...data, text: e.target.value } })}
            className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
      )}

      {selectedAction === 'text_image' && (
        <div className="space-y-3 rounded-lg border border-pink-100 bg-pink-50/40 p-3">
          <label className="block">
            <span className="text-xs text-gray-600">送信テキスト</span>
            <textarea
              rows={4}
              value={(data.text as string) ?? ''}
              onChange={(e) => onUpdate({ actionData: { ...data, text: e.target.value } })}
              placeholder="画像と一緒に送る文章を入力"
              className="mt-0.5 block w-full border border-pink-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 resize-y"
            />
          </label>

          <div>
            <span className="text-xs text-gray-600">送信画像</span>
            {image?.originalContentUrl ? (
              <div className="mt-1 flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewImageUrl || image.originalContentUrl}
                  alt=""
                  className="h-20 w-20 rounded border border-pink-100 object-cover"
                />
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs font-medium text-pink-700 hover:underline disabled:opacity-50"
                  >
                    差し替え
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate({ actionData: { ...data, image: null } })}
                    disabled={uploading}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    取り消し
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-1 rounded-lg border border-pink-200 bg-white px-3 py-2 text-xs font-medium text-pink-700 hover:bg-pink-50 disabled:opacity-50"
              >
                {uploading ? 'アップロード中...' : '画像を選択'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleTextImageUpload(file)
                e.target.value = ''
              }}
            />
            {uploadError && <p className="mt-1 text-[11px] text-red-600">{uploadError}</p>}
            <p className="mt-1 text-[11px] text-gray-500">
              PNG / JPEG 推奨。タップされたら、本文と画像をLINEにまとめて返信します。
            </p>
          </div>
        </div>
      )}

      {selectedAction === 'postback' && (
        <>
          <label className="block">
            <span className="text-xs text-gray-500">postback data</span>
            <input
              value={(data.data as string) ?? ''}
              onChange={(e) => onUpdate({ actionData: { ...data, data: e.target.value } })}
              className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">displayText (任意)</span>
            <input
              value={(data.displayText as string) ?? ''}
              onChange={(e) =>
                onUpdate({ actionData: { ...data, displayText: e.target.value } })
              }
              className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </label>
        </>
      )}

      {area.actionType === 'richmenuswitch' && (
        <label className="block">
          <span className="text-xs text-gray-500">遷移先ページ</span>
          <select
            value={(data.targetPageId as string) ?? ''}
            onChange={(e) =>
              onUpdate({ actionData: { ...data, targetPageId: e.target.value } })
            }
            className="mt-0.5 block w-full border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">選択...</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {pages.length < 2 && (
            <p className="mt-1 text-[11px] text-amber-600">
              タブ切替には複数ページが必要です。先にページを追加してください。
            </p>
          )}
        </label>
      )}
    </div>
  )
}
