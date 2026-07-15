'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { eventsApi, type EventBookingFormField, type EventBookingFormFieldType, type EventDetail, type EventSlot, type SlotVisibilityCondition } from '@/lib/api'
import ImageUploader from '@/components/shared/image-uploader'
import { useAccount } from '@/contexts/account-context'
import { generateBulkSlots, type BulkSlotInput } from './bulk-slot-generator'

type Tab = 'overview' | 'slots' | 'publish'

const TABS: Array<{ key: Tab; label: string; saveLabel: string; sub: string }> = [
  { key: 'overview', label: '1. 概要', saveLabel: '概要を保存', sub: 'イベント名・場所・詳細を入力' },
  { key: 'slots', label: '2. 予約枠', saveLabel: '', sub: '友だちが選べる日時を追加' },
  { key: 'publish', label: '3. 公開設定', saveLabel: '公開設定を保存', sub: '承認制・リマインダ・公開' },
]

const DEFAULT_DRAFT: EventDetail = {
  id: '',
  name: '',
  venue_name: null,
  venue_url: null,
  image_url: null,
  description: null,
  description_centered: 0,
  max_bookings_per_friend: null,
  requires_approval: 0,
  cancel_deadline_hours_before: null,
  reminder_day_before_enabled: 1,
  reminder_hours_before: null,
  is_published: 0,
  sort_order: 0,
  booking_form_fields: [],
}

export interface EventFormProps {
  accountId: string
  eventId: string | null
}

function jstNow(): Date {
  return new Date(Date.now())
}

function formatJpDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function isoToJstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

function isoToJstHHMM(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(11, 16)
}

function parseEventFormFields(raw: EventDetail['booking_form_fields']): EventBookingFormField[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as EventBookingFormField[]) : []
  } catch {
    return []
  }
}

function parseSlotVisibilityConditions(raw: EventSlot['visibility_conditions']): SlotVisibilityCondition[] {
  if (Array.isArray(raw)) return raw.filter((item) => item && item.fieldId && Array.isArray(item.values))
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SlotVisibilityCondition => {
          const candidate = item as Partial<SlotVisibilityCondition>
          return typeof candidate.fieldId === 'string' && Array.isArray(candidate.values)
        })
      : []
  } catch {
    return []
  }
}

function getSlotVisibilityLabel(slot: EventSlot, fields: EventBookingFormField[]): string {
  const conditions = parseSlotVisibilityConditions(slot.visibility_conditions)
  if (conditions.length === 0) return '全員に表示'
  return conditions.map((condition) => {
    const field = fields.find((f) => f.id === condition.fieldId)
    const label = field?.label ?? condition.fieldId
    return `${label}: ${condition.values.join('・')}`
  }).join(' / ')
}

function selectableConditionFields(fields: EventBookingFormField[]): EventBookingFormField[] {
  return fields.filter((field) => (field.type === 'select' || field.type === 'checkbox') && (field.options?.length ?? 0) > 0)
}

function makeFormFieldId(): string {
  return `field_${crypto.randomUUID().slice(0, 8)}`
}

const SUPPORT_PRESET_FIELDS: EventBookingFormField[] = [
  { id: 'student_name', label: '生徒名', type: 'text', required: true, placeholder: '例: 山田 太郎' },
  { id: 'grade', label: '学年', type: 'select', required: true, options: ['小学生', '中1', '中2', '中3', '高1', '高2', '高3', 'その他'] },
  { id: 'parent_name', label: '保護者名', type: 'text', required: true, placeholder: '例: 山田 花子' },
  {
    id: 'study_content',
    label: '当日取り組みたい内容',
    type: 'checkbox',
    required: true,
    options: ['夏休みの宿題', '課題テスト対策', '英検対策', '学習アプリ', 'その他'],
  },
  { id: 'consultation', label: '事前に相談したいこと', type: 'textarea', required: false, placeholder: '必要があればご記入ください' },
]

function DialogPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  return createPortal(children, document.body)
}

export default function EventForm({ accountId, eventId }: EventFormProps) {
  const router = useRouter()
  const { selectedAccount, accounts, refreshAccounts } = useAccount()
  const [tab, setTab] = useState<Tab>('overview')
  const [draft, setDraft] = useState<EventDetail>(DEFAULT_DRAFT)
  const [slots, setSlots] = useState<EventSlot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  async function copyValue(v: string) {
    try {
      await navigator.clipboard.writeText(v)
      setCopiedValue(v)
      setTimeout(() => setCopiedValue(null), 2000)
    } catch {
      window.prompt('コピーしてください:', v)
    }
  }

  const currentAccount = accounts.find((a) => a.id === accountId) ?? selectedAccount
  const liffId = currentAccount?.liffId ?? null
  const liffUrl = eventId && liffId
    ? `https://liff.line.me/${liffId}/?page=event&id=${eventId}`
    : null

  useEffect(() => {
    void refreshAccounts()
  }, [accountId, refreshAccounts])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!eventId) {
        setLoading(false)
        return
      }
      try {
        const [ev, slotsRes] = await Promise.all([
          eventsApi.getEvent(accountId, eventId),
          eventsApi.listSlots(accountId, eventId),
        ])
        if (cancelled) return
        setDraft(ev)
        setSlots(slotsRes.items)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [accountId, eventId])

  function update<K extends keyof EventDetail>(key: K, value: EventDetail[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function flashToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function save(nextTab?: Tab) {
    setSaving(true)
    setError(null)
    try {
      if (!draft.name.trim()) throw new Error('イベント名は必須です')
      if (draft.name.length > 255) throw new Error('イベント名は255字以内で入力してください')
      if (draft.description && draft.description.length > 20000) {
        throw new Error('詳細は20000字以内で入力してください')
      }
      const targetType = draft.target_type ?? 'single'
      let accountIdsArr: string[] = Array.isArray(draft.account_ids)
        ? draft.account_ids
        : typeof draft.account_ids === 'string'
          ? (() => { try { return JSON.parse(draft.account_ids) as string[] } catch { return [] } })()
          : []
      // 現在ログイン中のアカウントは常に含める。保存後 redirect 先 (この
      // accountId scope) で 404 にならないための保証。チェックボックス側でも
      // 外せないが、stale draft 等の保険として save 時にも強制注入する。
      if (targetType === 'multi-account-dedup' && accountId && !accountIdsArr.includes(accountId)) {
        accountIdsArr = [accountId, ...accountIdsArr]
      }
      if (targetType === 'multi-account-dedup' && accountIdsArr.length === 0) {
        throw new Error('複数アカウント横断の場合は対象アカを 1 件以上選択してください')
      }
      const payload: Partial<EventDetail> = {
        name: draft.name,
        venue_name: draft.venue_name,
        venue_url: draft.venue_url,
        image_url: draft.image_url,
        description: draft.description,
        description_centered: draft.description_centered,
        max_bookings_per_friend: draft.max_bookings_per_friend,
        requires_approval: draft.requires_approval,
        cancel_deadline_hours_before: draft.cancel_deadline_hours_before,
        reminder_day_before_enabled: draft.reminder_day_before_enabled,
        reminder_hours_before: draft.reminder_hours_before,
        is_published: draft.is_published,
        sort_order: draft.sort_order,
        booking_form_fields: parseEventFormFields(draft.booking_form_fields),
        target_type: targetType,
        // Worker は account_ids を配列で受け取って内部で JSON.stringify するので、
        // ここでは配列のまま送る (Partial<EventDetail> の union 型を許容)
        account_ids: targetType === 'multi-account-dedup'
          ? (accountIdsArr as unknown as EventDetail['account_ids'])
          : null,
      }
      if (eventId) {
        const updated = await eventsApi.updateEvent(accountId, eventId, payload)
        setDraft(updated)
        flashToast('保存しました')
        if (nextTab) setTab(nextTab)
      } else {
        const created = await eventsApi.createEvent(accountId, payload)
        flashToast('イベントを作成しました。続けて予約枠を追加してください。')
        router.replace(`/events/edit?id=${created.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function copyLiffUrl() {
    if (!liffUrl) return
    try {
      await navigator.clipboard.writeText(liffUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('コピーしてください:', liffUrl)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <a href="/events" className="text-blue-600 hover:underline">イベント一覧</a>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700">{eventId ? draft.name || 'イベント編集' : '新規イベント'}</span>
      </div>

      {/* page header */}
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {eventId ? draft.name || 'イベント編集' : '新規イベント作成'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {eventId ? 'タブで各項目を編集できます' : 'まず「概要」を保存するとイベントが作成されます'}
          </p>
        </div>
        {eventId && (
          <a
            href={`/events/bookings?id=${eventId}`}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            予約を確認
          </a>
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          ✓ {toast}
        </div>
      )}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* LIFF URL box(es) */}
      {eventId && draft.is_published === 1 && (() => {
        const targetType = draft.target_type ?? 'single'
        const accountIdsArr: string[] = Array.isArray(draft.account_ids)
          ? draft.account_ids
          : typeof draft.account_ids === 'string'
            ? (() => { try { return JSON.parse(draft.account_ids) as string[] } catch { return [] } })()
            : []

        if (targetType === 'multi-account-dedup') {
          const templateUrl = `https://liff.line.me/{{liff_id}}/?page=event&id=${eventId}`
          const targetAccounts = accounts.filter((a) => accountIdsArr.includes(a.id))
          return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-4">
              <div>
                <div className="text-sm font-medium text-blue-900 mb-2">broadcast 用テンプレ URL</div>
                <div className="flex gap-2 items-center">
                  <input
                    readOnly
                    value={templateUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-xs bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyValue(templateUrl)}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {copiedValue === templateUrl ? 'コピー済' : 'コピー'}
                  </button>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  broadcast 編集で「リンクするイベント」から選ぶと自動挿入。
                  {'{{liff_id}}'} は配信時に各友だちのアカに対応した値に置換されます。
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-blue-900 mb-2">各アカ固定 URL (QR・LP 直貼り用)</div>
                <div className="space-y-1.5">
                  {targetAccounts.length === 0 && (
                    <div className="text-xs text-amber-700">対象アカが選択されていません</div>
                  )}
                  {targetAccounts.map((a) => {
                    const acct = a as unknown as { liffId?: string | null; name: string; country: string | null }
                    if (!acct.liffId) {
                      return (
                        <div key={a.id} className="text-xs text-amber-700">
                          {acct.country ? acct.country + ' ' : ''}{acct.name}: LIFF ID 未設定
                        </div>
                      )
                    }
                    const url = `https://liff.line.me/${acct.liffId}/?page=event&id=${eventId}`
                    return (
                      <div key={a.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 min-w-[80px] truncate">
                          {acct.country ? acct.country + ' ' : ''}{acct.name}
                        </span>
                        <input
                          readOnly
                          value={url}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 border border-blue-200 rounded-lg px-2 py-1 text-xs bg-white font-mono"
                        />
                        <button
                          onClick={() => copyValue(url)}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                        >
                          {copiedValue === url ? '✓' : 'コピー'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        }

        // single 用 (既存と同じ表示)
        if (liffUrl) {
          return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="text-sm font-medium text-blue-900 mb-2">予約 URL（友だちに案内する）</div>
              <div className="flex gap-2 items-center">
                <input
                  readOnly
                  value={liffUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-xs bg-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyValue(liffUrl)}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {copiedValue === liffUrl ? 'コピー済' : 'コピー'}
                </button>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                この URL をブロードキャストやシナリオで友だちに送ると LINE 内で予約画面が開きます。
              </p>
            </div>
          )
        }
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900">
            LIFF ID が未設定のため予約 URL を生成できません。LINE アカウント設定で LIFF ID を登録してください。
          </div>
        )
      })()}
      {eventId && draft.is_published === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900">
          現在「下書き」状態です。公開設定タブで「公開する」を ON にすると友だち向けの予約 URL が表示されます。
        </div>
      )}

      {/* main card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* tab nav */}
        <div className="flex border-b border-gray-200">
          {TABS.map((t) => {
            const active = tab === t.key
            const disabled = t.key !== 'overview' && !eventId
            return (
              <button
                key={t.key}
                disabled={disabled}
                onClick={() => !disabled && setTab(t.key)}
                title={disabled ? 'まず「概要」を保存してください' : undefined}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  active
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : disabled
                    ? 'border-transparent text-gray-300 cursor-not-allowed'
                    : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div>{t.label}</div>
                <div className="text-xs font-normal mt-0.5 opacity-80">{t.sub}</div>
              </button>
            )
          })}
        </div>

        {/* tab body */}
        <div className="p-6">
          {tab === 'overview' && <OverviewTab draft={draft} update={update} accounts={accounts} currentAccountId={accountId} />}
          {tab === 'slots' && (
            <SlotsTab
              accountId={accountId}
              eventId={eventId}
              fields={parseEventFormFields(draft.booking_form_fields)}
              slots={slots}
              setSlots={setSlots}
            />
          )}
          {tab === 'publish' && <PublishTab draft={draft} update={update} />}
        </div>

        {/* tab footer */}
        {tab !== 'slots' && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {tab === 'overview' && !eventId && '保存するとイベントが作成され、予約枠タブに進みます'}
              {tab === 'overview' && eventId && '変更を「概要を保存」で確定します'}
              {tab === 'publish' && '「公開する」ON で友だちに予約 URL を案内できます'}
            </div>
            <div className="flex gap-2">
              {tab === 'overview' && eventId && (
                <button
                  onClick={() => save('slots')}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50"
                >
                  保存して次へ →
                </button>
              )}
              <button
                onClick={() => save()}
                disabled={saving}
                className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : tab === 'overview' && !eventId ? 'イベントを作成' : TABS.find((x) => x.key === tab)?.saveLabel ?? '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Tab 1: Overview
// ----------------------------------------------------------------

function OverviewTab({
  draft,
  update,
  accounts,
  currentAccountId,
}: {
  draft: EventDetail
  update: <K extends keyof EventDetail>(k: K, v: EventDetail[K]) => void
  accounts: Array<{ id: string; name: string; country: string | null; isActive: boolean }>
  currentAccountId: string
}) {
  const descLen = (draft.description ?? '').length
  const targetType = draft.target_type ?? 'single'
  const accountIds: string[] = Array.isArray(draft.account_ids)
    ? draft.account_ids
    : typeof draft.account_ids === 'string'
      ? (() => { try { return JSON.parse(draft.account_ids) as string[] } catch { return [] } })()
      : []
  const activeAccounts = accounts.filter((a) => a.isActive)
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          イベント名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          maxLength={255}
          placeholder="例: 第1回 AAA 説明会"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">開催場所</label>
          <input
            type="text"
            value={draft.venue_name ?? ''}
            onChange={(e) => update('venue_name', e.target.value || null)}
            placeholder="例: 渋谷ベース 3F"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">会場 URL</label>
          <input
            type="url"
            value={draft.venue_url ?? ''}
            onChange={(e) => update('venue_url', e.target.value || null)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <ImageUploader
          mode="url"
          value={draft.image_url ? { mode: 'url', url: draft.image_url } : null}
          onChange={(v) => update('image_url', v?.mode === 'url' ? v.url : null)}
          label="イベント画像"
        />
      </div>
      <div>
        <label className="flex justify-between items-center text-sm font-medium text-gray-700 mb-1.5">
          <span>イベント詳細</span>
          <span className={`text-xs ${descLen > 20000 ? 'text-red-600' : 'text-gray-500'}`}>
            {descLen.toLocaleString()} / 20,000
          </span>
        </label>
        <textarea
          value={draft.description ?? ''}
          onChange={(e) => update('description', e.target.value || null)}
          rows={8}
          placeholder="開催趣旨、注意事項、持ち物などを記載..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={draft.description_centered === 1}
            onChange={(e) => update('description_centered', e.target.checked ? 1 : 0)}
            className="rounded border-gray-300"
          />
          詳細を中央揃えで表示
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          1 人あたり予約回数
        </label>
        <select
          value={draft.max_bookings_per_friend ?? 'unlimited'}
          onChange={(e) =>
            update(
              'max_bookings_per_friend',
              e.target.value === 'unlimited' ? null : Number(e.target.value),
            )
          }
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="unlimited">制限なし</option>
          <option value="1">1 回まで</option>
          <option value="2">2 回まで</option>
          <option value="3">3 回まで</option>
          <option value="5">5 回まで</option>
        </select>
      </div>

      <BookingFormFieldsEditor
        fields={parseEventFormFields(draft.booking_form_fields)}
        onChange={(fields) => update('booking_form_fields', fields as EventDetail['booking_form_fields'])}
      />

      {/* 公開対象 */}
      <div className="border-t border-gray-200 pt-5">
        <div className="text-sm font-medium text-gray-700 mb-2">公開対象</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => update('target_type', 'single')}
            className={`p-3 border-2 rounded-lg text-left ${
              targetType === 'single' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-sm font-bold">単一アカウント</div>
            <div className="text-xs text-gray-600">1 つの LINE アカで運用</div>
          </button>
          <button
            type="button"
            onClick={() => {
              update('target_type', 'multi-account-dedup')
              // single → multi 切替時: 編集中の admin account を account_ids[0]
              // sentinel として自動セット。active 一覧の先頭ではなく実際に
              // 編集している admin の account にしないと、保存後にその admin
              // が自分のイベントを見られなくなる (404)。
              if (accountIds.length === 0) {
                const seed = currentAccountId || activeAccounts[0]?.id || ''
                if (seed) {
                  update('account_ids', [seed] as unknown as EventDetail['account_ids'])
                }
              }
            }}
            className={`p-3 border-2 rounded-lg text-left ${
              targetType === 'multi-account-dedup' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-sm font-bold">複数アカウント横断</div>
            <div className="text-xs text-gray-600">重複なし配信に対応</div>
          </button>
        </div>

        {targetType === 'multi-account-dedup' && (
          <div className="space-y-1.5">
            <div className="text-xs text-gray-600">対象アカ（重複なし配信）</div>
            {activeAccounts.length === 0 && (
              <div className="text-sm text-gray-500 italic p-2">アクティブなアカウントがありません</div>
            )}
            {activeAccounts.map((a) => {
              // 現在ログイン中のアカウントは外せない (外すと保存後 redirect が
              // 即 404 になる)。target_type 切替時に sentinel seed されている
              // ことの保護も兼ねる。
              const isCurrent = a.id === currentAccountId
              const checked = accountIds.includes(a.id) || isCurrent
              return (
                <label
                  key={a.id}
                  className={`flex items-center gap-2 p-2 border border-gray-200 rounded-lg ${isCurrent ? 'opacity-90 bg-gray-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                  title={isCurrent ? '現在ログイン中のアカウントは必須です' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isCurrent}
                    onChange={(e) => {
                      if (isCurrent) return
                      const next = e.target.checked
                        ? [...accountIds, a.id]
                        : accountIds.filter((x) => x !== a.id)
                      update('account_ids', next as unknown as EventDetail['account_ids'])
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">
                    {a.country ? a.country + ' ' : ''}{a.name}
                    {isCurrent && <span className="ml-1 text-[10px] text-gray-500">(現アカ・必須)</span>}
                  </span>
                </label>
              )
            })}
            <div className="text-xs text-gray-500 mt-1">{accountIds.length} 件選択中</div>
          </div>
        )}
      </div>
    </div>
  )
}

function BookingFormFieldsEditor({
  fields,
  onChange,
}: {
  fields: EventBookingFormField[]
  onChange: (fields: EventBookingFormField[]) => void
}) {
  function updateField(index: number, patch: Partial<EventBookingFormField>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  }

  function addField(type: EventBookingFormFieldType = 'text') {
    const next: EventBookingFormField = {
      id: makeFormFieldId(),
      label: '',
      type,
      required: false,
      placeholder: '',
      options: type === 'select' || type === 'checkbox' ? [''] : undefined,
    }
    onChange([...fields, next])
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index))
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  function applyPreset() {
    if (fields.length > 0 && !confirm('現在の質問項目を、学習サポート用の基本項目に置き換えますか？')) {
      return
    }
    onChange(SUPPORT_PRESET_FIELDS.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })))
  }

  return (
    <div className="border-t border-gray-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium text-gray-700">予約フォーム項目</div>
          <p className="text-xs text-gray-500 mt-1">
            保護者に入力してもらう内容を設定します。未設定の場合は備考欄だけ表示されます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyPreset}
            className="px-3 py-1.5 text-xs font-medium border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50"
          >
            学習サポート用を入れる
          </button>
          <button
            type="button"
            onClick={() => addField('text')}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ＋ 質問を追加
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-500">
          まだ質問項目はありません。夏休み学習サポートでは「学習サポート用を入れる」から始めるのがおすすめです。
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const usesOptions = field.type === 'select' || field.type === 'checkbox'
            return (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50/60">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-xs font-medium text-gray-500">質問 {index + 1}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveField(index, -1)}
                      disabled={index === 0}
                      className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                      className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">質問名</span>
                    <input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      maxLength={80}
                      placeholder="例: 生徒名"
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">入力方法</span>
                    <select
                      value={field.type}
                      onChange={(e) => {
                        const type = e.target.value as EventBookingFormFieldType
                        updateField(index, {
                          type,
                          options: type === 'select' || type === 'checkbox' ? (field.options?.length ? field.options : ['']) : undefined,
                        })
                      }}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="text">短文入力</option>
                      <option value="textarea">長文入力</option>
                      <option value="select">選択式（1つ）</option>
                      <option value="checkbox">選択式（複数）</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">入力例・補足</span>
                    <input
                      value={field.placeholder ?? ''}
                      onChange={(e) => updateField(index, { placeholder: e.target.value })}
                      maxLength={120}
                      placeholder="例: 山田 太郎"
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    必須にする
                  </label>
                </div>

                {usesOptions && (
                  <label className="block mt-3">
                    <span className="text-xs font-medium text-gray-600">選択肢（1行に1つ）</span>
                    <textarea
                      value={(field.options ?? []).join('\n')}
                      onChange={(e) =>
                        updateField(index, {
                          options: e.target.value.replace(/\r\n/g, '\n').split('\n'),
                        })
                      }
                      rows={4}
                      placeholder={'夏休みの宿題\n課題テスト対策\n英検対策'}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------
// Tab 2: Slots
// ----------------------------------------------------------------

function SlotsTab({
  accountId,
  eventId,
  fields,
  slots,
  setSlots,
}: {
  accountId: string
  eventId: string | null
  fields: EventBookingFormField[]
  slots: EventSlot[]
  setSlots: (s: EventSlot[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedSlotIds((prev) => {
      const liveIds = new Set(slots.map((s) => s.id))
      const next = new Set([...prev].filter((id) => liveIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [slots])

  if (!eventId) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        まず「概要」タブで保存してから予約枠を追加してください。
      </div>
    )
  }

  async function refresh() {
    if (!eventId) return
    const res = await eventsApi.listSlots(accountId, eventId)
    setSlots(res.items)
  }

  async function deleteSlot(slotId: string) {
    if (!eventId) return
    if (!confirm('この枠を削除しますか？（既存予約があると削除できません）')) return
    setBusy(true)
    setErr(null)
    try {
      await eventsApi.deleteSlot(accountId, eventId, slotId)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function toggleSlotSelected(slotId: string) {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }

  function toggleAllSelected() {
    setSelectedSlotIds((prev) => (
      prev.size === slots.length ? new Set() : new Set(slots.map((s) => s.id))
    ))
  }

  async function deleteSlots(targetSlots: EventSlot[], label: string) {
    if (!eventId || targetSlots.length === 0) return
    const deletable = targetSlots.filter((s) => (s.active_count ?? 0) === 0)
    const skipped = targetSlots.length - deletable.length
    if (deletable.length === 0) {
      alert('予約が入っている枠は削除できません。予約数が0の枠だけ削除できます。')
      return
    }
    const message =
      skipped > 0
        ? `${label} ${targetSlots.length}件のうち、予約が入っていない ${deletable.length}件を削除します。\n予約が入っている ${skipped}件は残します。よろしいですか？`
        : `${label} ${deletable.length}件を削除します。よろしいですか？`
    if (!confirm(message)) return

    setBusy(true)
    setErr(null)
    let failed = 0
    try {
      for (const slot of deletable) {
        try {
          await eventsApi.deleteSlot(accountId, eventId, slot.id)
        } catch {
          failed += 1
        }
      }
      await refresh()
      setSelectedSlotIds(new Set())
      if (failed > 0) setErr(`${failed}件の削除に失敗しました。予約が入っていないか確認してください。`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(s: EventSlot) {
    if (!eventId) return
    setBusy(true)
    try {
      await eventsApi.updateSlot(accountId, eventId, s.id, { is_active: s.is_active === 1 ? 0 : 1 })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function bulkUpdateSlots(input: SlotBulkEditInput) {
    if (!eventId) return
    const targets = slots.filter((s) => selectedSlotIds.has(s.id))
    if (targets.length === 0) return
    if (!input.changeTime && !input.changeCapacity && !input.changeActive && !input.changeVisibility) {
      alert('変更する項目を1つ以上選んでください。')
      return
    }

    const bookedCount = targets.filter((s) => (s.active_count ?? 0) > 0).length
    if (bookedCount > 0 && !confirm(`選択した枠のうち ${bookedCount}件には予約があります。\n時刻や定員を変更すると、既存予約にも影響します。続けますか？`)) {
      return
    }

    setBusy(true)
    setErr(null)
    try {
      for (const slot of targets) {
        const body: Partial<EventSlot> = {}
        if (input.changeTime) {
          const date = isoToJstDate(slot.starts_at)
          body.starts_at = jstHHMMToUtcIso(date, input.startTime)
          body.ends_at = jstHHMMToUtcIso(date, input.endTime)
        }
        if (input.changeCapacity) body.capacity = input.capacity
        if (input.changeActive) body.is_active = input.isActive
        if (input.changeVisibility) body.visibility_conditions = input.visibilityConditions
        await eventsApi.updateSlot(accountId, eventId, slot.id, body)
      }
      await refresh()
      setSelectedSlotIds(new Set())
      setShowBulkEdit(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const selectedSlots = slots.filter((s) => selectedSlotIds.has(s.id))
  const allSelected = slots.length > 0 && selectedSlotIds.size === slots.length

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
        <div className="text-sm text-gray-600">{slots.length} 件の予約枠</div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ＋ 枠を追加
          </button>
          <button
            onClick={() => setShowBulk(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            📅 一括追加
          </button>
        </div>
      </div>
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-sm">{err}</div>}
      {slots.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
          予約枠がありません。「＋ 枠を追加」または「📅 一括追加」から作成してください。
        </div>
      ) : (
        <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pink-100 bg-white/70 p-3">
          <div className="text-sm text-gray-700">
            {selectedSlotIds.size > 0 ? `${selectedSlotIds.size}件を選択中` : 'チェックした予約枠をまとめて変更・削除できます'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllSelected}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {allSelected ? '全解除' : '全選択'}
            </button>
            <button
              type="button"
              onClick={() => setShowBulkEdit(true)}
              disabled={busy || selectedSlotIds.size === 0}
              className="px-3 py-1.5 text-sm border border-pink-300 text-pink-700 rounded-lg hover:bg-pink-50 disabled:opacity-50"
            >
              選択を一括変更
            </button>
            <button
              type="button"
              onClick={() => deleteSlots(selectedSlots, '選択した枠')}
              disabled={busy || selectedSlotIds.size === 0}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              選択を削除
            </button>
            <button
              type="button"
              onClick={() => deleteSlots(slots, '全予約枠')}
              disabled={busy || slots.length === 0}
              className="px-3 py-1.5 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              全削除
            </button>
          </div>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllSelected}
                    aria-label="予約枠を全選択"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">日時</th>
                <th className="text-left px-3 py-2 font-medium">定員</th>
                <th className="text-left px-3 py-2 font-medium">予約数</th>
                <th className="text-left px-3 py-2 font-medium">表示条件</th>
                <th className="text-left px-3 py-2 font-medium">状態</th>
                <th className="text-right px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} className={`border-t border-gray-200 ${selectedSlotIds.has(s.id) ? 'bg-pink-50/70' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSlotIds.has(s.id)}
                      onChange={() => toggleSlotSelected(s.id)}
                      aria-label={`${formatJpDateTime(s.starts_at)} の予約枠を選択`}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-800">
                    {formatJpDateTime(s.starts_at)} 〜 {formatJpDateTime(s.ends_at).slice(-5)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{s.capacity ?? '無制限'}</td>
                  <td className="px-3 py-2 text-gray-700">{s.active_count ?? 0}</td>
                  <td className="px-3 py-2 text-gray-700">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ${
                      parseSlotVisibilityConditions(s.visibility_conditions).length > 0
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {getSlotVisibilityLabel(s, fields)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(s)}
                      disabled={busy}
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        s.is_active === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s.is_active === 1 ? '有効' : '停止'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => deleteSlot(s.id)}
                      disabled={busy || (s.active_count ?? 0) > 0}
                      title={(s.active_count ?? 0) > 0 ? '既存予約があるため削除できません' : '削除'}
                      className="text-xs text-red-600 hover:underline disabled:opacity-30 disabled:no-underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showAdd && (
        <AddSlotDialog
          fields={fields}
          onClose={() => setShowAdd(false)}
          onSubmit={async (s) => {
            await eventsApi.createSlots(accountId, eventId, [s])
            await refresh()
            setShowAdd(false)
          }}
        />
      )}
      {showBulk && (
        <BulkSlotDialog
          onClose={() => setShowBulk(false)}
          onSubmit={async (input) => {
            const generated = generateBulkSlots(input)
            if (generated.length === 0) {
              alert('生成される枠が0件でした。条件を確認してください。')
              return
            }
            if (!confirm(`${generated.length}件の枠を生成します。よろしいですか？`)) return
            await eventsApi.createSlots(accountId, eventId, generated)
            await refresh()
            setShowBulk(false)
          }}
        />
      )}
      {showBulkEdit && (
        <BulkEditSlotsDialog
          slots={selectedSlots}
          fields={fields}
          onClose={() => setShowBulkEdit(false)}
          onSubmit={bulkUpdateSlots}
        />
      )}
    </div>
  )
}

interface SlotBulkEditInput {
  changeTime: boolean
  startTime: string
  endTime: string
  changeCapacity: boolean
  capacity: number | null
  changeActive: boolean
  isActive: number
  changeVisibility: boolean
  visibilityConditions: SlotVisibilityCondition[]
}

function SlotVisibilityEditor({
  fields,
  value,
  onChange,
  disabled = false,
}: {
  fields: EventBookingFormField[]
  value: SlotVisibilityCondition[]
  onChange: (value: SlotVisibilityCondition[]) => void
  disabled?: boolean
}) {
  const candidates = selectableConditionFields(fields)
  const condition = value[0]
  const selectedField = candidates.find((field) => field.id === condition?.fieldId) ?? null
  const selectedValues = selectedField ? condition?.values ?? [] : []

  function setField(fieldId: string) {
    if (!fieldId) {
      onChange([])
      return
    }
    const field = candidates.find((item) => item.id === fieldId)
    const firstOption = field?.options?.[0]
    onChange(field && firstOption ? [{ fieldId: field.id, operator: 'in', values: [firstOption] }] : [])
  }

  function toggleValue(option: string) {
    if (!selectedField) return
    const next = selectedValues.includes(option)
      ? selectedValues.filter((item) => item !== option)
      : [...selectedValues, option]
    onChange(next.length > 0 ? [{ fieldId: selectedField.id, operator: 'in', values: next }] : [])
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        先に「概要」タブの予約フォーム項目で、選択式またはチェック式の質問を作ると、枠の出し分け条件に使えます。
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <label className="block text-sm font-medium text-gray-700">この枠を見せる条件</label>
      <select
        value={selectedField?.id ?? ''}
        onChange={(e) => setField(e.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
      >
        <option value="">全員に表示する</option>
        {candidates.map((field) => (
          <option key={field.id} value={field.id}>{field.label}</option>
        ))}
      </select>
      {selectedField && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {(selectedField.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                onChange={() => toggleValue(option)}
                disabled={disabled}
                className="rounded border-gray-300"
              />
              {option}
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">
        何も選ばない場合は、今まで通りすべての友だちに表示されます。
      </p>
    </div>
  )
}

function BulkEditSlotsDialog({
  slots,
  fields,
  onClose,
  onSubmit,
}: {
  slots: EventSlot[]
  fields: EventBookingFormField[]
  onClose: () => void
  onSubmit: (input: SlotBulkEditInput) => Promise<void>
}) {
  const first = slots[0]
  const [changeTime, setChangeTime] = useState(false)
  const [startTime, setStartTime] = useState(first ? isoToJstHHMM(first.starts_at) : '16:00')
  const [endTime, setEndTime] = useState(first ? isoToJstHHMM(first.ends_at) : '19:00')
  const [changeCapacity, setChangeCapacity] = useState(false)
  const [capacity, setCapacity] = useState(first?.capacity == null ? '' : String(first.capacity))
  const [changeActive, setChangeActive] = useState(false)
  const [isActive, setIsActive] = useState(first?.is_active === 0 ? '0' : '1')
  const [changeVisibility, setChangeVisibility] = useState(false)
  const [visibilityConditions, setVisibilityConditions] = useState<SlotVisibilityCondition[]>(
    first ? parseSlotVisibilityConditions(first.visibility_conditions) : [],
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (!changeTime && !changeCapacity && !changeActive && !changeVisibility) {
      setErr('変更する項目を1つ以上選んでください。')
      return
    }
    if (changeTime && startTime >= endTime) {
      setErr('開始時刻は終了時刻より前にしてください。')
      return
    }
    const cap = capacity.trim() === '' ? null : Number(capacity)
    if (changeCapacity && cap != null && (!Number.isInteger(cap) || cap < 1)) {
      setErr('定員は1以上の整数にしてください。空欄にすると無制限になります。')
      return
    }

    setBusy(true)
    try {
      await onSubmit({
        changeTime,
        startTime,
        endTime,
        changeCapacity,
        capacity: cap,
        changeActive,
        isActive: Number(isActive),
        changeVisibility,
        visibilityConditions,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
          <h3 className="text-lg font-bold text-gray-900">選択した予約枠を一括変更</h3>
          <p className="mt-1 text-sm text-gray-600">{slots.length}件の予約枠に同じ変更を反映します。</p>
          {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}

          <div className="mt-4 space-y-3">
            <label className="block rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={changeTime}
                  onChange={(e) => setChangeTime(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-900">時刻を変更する</span>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!changeTime}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                />
                <span className="text-gray-500">〜</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!changeTime}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">日付はそのまま、開始・終了時刻だけをまとめて変えます。</p>
            </label>

            <label className="block rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={changeCapacity}
                  onChange={(e) => setChangeCapacity(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-900">定員を変更する</span>
              </div>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={!changeCapacity}
                placeholder="空欄で無制限"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              />
            </label>

            <label className="block rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={changeActive}
                  onChange={(e) => setChangeActive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-900">状態を変更する</span>
              </div>
              <select
                value={isActive}
                onChange={(e) => setIsActive(e.target.value)}
                disabled={!changeActive}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="1">有効にする</option>
                <option value="0">停止する</option>
              </select>
            </label>

            <div className="block rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={changeVisibility}
                  onChange={(e) => setChangeVisibility(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-900">表示条件を変更する</span>
              </div>
              <div className="mt-2">
                <SlotVisibilityEditor
                  fields={fields}
                  value={visibilityConditions}
                  onChange={setVisibilityConditions}
                  disabled={!changeVisibility}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
              キャンセル
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600 disabled:opacity-50"
            >
              まとめて変更
            </button>
          </div>
        </div>
      </div>
    </DialogPortal>
  )
}

function AddSlotDialog({
  fields,
  onClose,
  onSubmit,
}: {
  fields: EventBookingFormField[]
  onClose: () => void
  onSubmit: (s: { starts_at: string; ends_at: string; capacity: number | null; visibility_conditions?: SlotVisibilityCondition[] | null }) => Promise<void>
}) {
  const todayJst = new Date(jstNow().getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const [date, setDate] = useState(todayJst)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [capacity, setCapacity] = useState<string>('')
  const [visibilityConditions, setVisibilityConditions] = useState<SlotVisibilityCondition[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const s = jstHHMMToUtcIso(date, startTime)
      const e = jstHHMMToUtcIso(date, endTime)
      if (s >= e) throw new Error('開始時刻 < 終了時刻')
      const cap = capacity === '' ? null : Number(capacity)
      if (cap != null && (!Number.isInteger(cap) || cap < 1)) throw new Error('定員は1以上の整数')
      await onSubmit({
        starts_at: s,
        ends_at: e,
        capacity: cap,
        visibility_conditions: visibilityConditions.length > 0 ? visibilityConditions : null,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold mb-4 text-gray-900">予約枠を追加</h3>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg mb-3 text-sm">{err}</div>}
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">日付（JST）</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-sm font-medium text-gray-700">開始</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-medium text-gray-700">終了</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">定員（空欄=無制限）</span>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <SlotVisibilityEditor
            fields={fields}
            value={visibilityConditions}
            onChange={setVisibilityConditions}
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            追加
          </button>
        </div>
        </div>
      </div>
    </DialogPortal>
  )
}

function BulkSlotDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: BulkSlotInput) => Promise<void>
}) {
  const todayJst = new Date(jstNow().getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const [start, setStart] = useState(todayJst)
  const [end, setEnd] = useState(todayJst)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [patterns, setPatterns] = useState([{ start: '10:00', end: '11:00' }])
  const [capacity, setCapacity] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleWeekday(d: number) {
    setWeekdays((ws) => (ws.includes(d) ? ws.filter((x) => x !== d) : [...ws, d]))
  }

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const cap = capacity === '' ? null : Number(capacity)
      if (cap != null && (!Number.isInteger(cap) || cap < 1)) throw new Error('定員は1以上の整数')
      await onSubmit({
        start_date: start,
        end_date: end,
        weekdays,
        time_patterns: patterns.filter((p) => p.start && p.end && p.start < p.end),
        capacity: cap,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold mb-3 text-gray-900">予約枠の一括追加</h3>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg mb-3 text-sm">{err}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className="text-sm font-medium text-gray-700">開始日</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label>
              <span className="text-sm font-medium text-gray-700">終了日</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700 block mb-1.5">曜日</span>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={`px-2 py-2 text-sm border rounded-lg ${
                    weekdays.includes(i)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px] md:items-start">
            <div>
              <span className="text-sm font-medium text-gray-700 block mb-1.5">時刻パターン</span>
              {patterns.map((p, i) => (
                <div key={i} className="flex gap-2 mb-1.5 items-center">
                  <input
                    type="time"
                    value={p.start}
                    onChange={(e) => setPatterns((ps) => ps.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-gray-500">〜</span>
                  <input
                    type="time"
                    value={p.end}
                    onChange={(e) => setPatterns((ps) => ps.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {patterns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPatterns((ps) => ps.filter((_, j) => j !== i))}
                      className="text-red-600 px-2"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPatterns((ps) => [...ps, { start: '14:00', end: '15:00' }])}
                className="text-sm text-blue-600 hover:underline"
              >
                ＋ パターン追加
              </button>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">定員（空欄=無制限）</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            生成
          </button>
        </div>
        </div>
      </div>
    </DialogPortal>
  )
}

function jstHHMMToUtcIso(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const totalMin = h * 60 + m - 9 * 60
  const [y, mo, d] = date.split('-').map(Number)
  const t = Date.UTC(y, mo - 1, d) + totalMin * 60_000
  return new Date(t).toISOString()
}

// ----------------------------------------------------------------
// Tab 3: Publish settings
// ----------------------------------------------------------------

function PublishTab({
  draft,
  update,
}: {
  draft: EventDetail
  update: <K extends keyof EventDetail>(k: K, v: EventDetail[K]) => void
}) {
  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
        <input
          type="checkbox"
          checked={draft.requires_approval === 1}
          onChange={(e) => update('requires_approval', e.target.checked ? 1 : 0)}
          className="mt-0.5 rounded border-gray-300"
        />
        <div>
          <div className="text-sm font-medium text-gray-900">承認制</div>
          <div className="text-xs text-gray-500 mt-0.5">
            ON: 友だちが予約しても運営が「承認」するまで未確定<br />
            OFF: 定員空きがあれば即時確定
          </div>
        </div>
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          キャンセル期限（友だち側）
        </label>
        <select
          value={draft.cancel_deadline_hours_before ?? 'disabled'}
          onChange={(e) =>
            update(
              'cancel_deadline_hours_before',
              e.target.value === 'disabled' ? null : Number(e.target.value),
            )
          }
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="disabled">不可（運営に LINE 連絡）</option>
          <option value="0">直前まで可</option>
          <option value="6">6 時間前まで</option>
          <option value="12">12 時間前まで</option>
          <option value="24">24 時間前まで</option>
          <option value="48">48 時間前まで</option>
        </select>
      </div>

      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
        <input
          type="checkbox"
          checked={draft.reminder_day_before_enabled === 1}
          onChange={(e) => update('reminder_day_before_enabled', e.target.checked ? 1 : 0)}
          className="mt-0.5 rounded border-gray-300"
        />
        <div>
          <div className="text-sm font-medium text-gray-900">前日リマインダ</div>
          <div className="text-xs text-gray-500 mt-0.5">前日 18:00 JST に LINE で通知</div>
        </div>
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          開始 N 時間前リマインダ
        </label>
        <select
          value={draft.reminder_hours_before ?? 'off'}
          onChange={(e) =>
            update('reminder_hours_before', e.target.value === 'off' ? null : Number(e.target.value))
          }
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="off">送信しない</option>
          <option value="1">1 時間前</option>
          <option value="2">2 時間前</option>
          <option value="3">3 時間前</option>
          <option value="6">6 時間前</option>
          <option value="24">24 時間前</option>
        </select>
      </div>

      <hr className="border-gray-200" />

      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">公開状態</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update('is_published', 0)}
            className={`p-3 border-2 rounded-lg text-left transition-colors ${
              draft.is_published === 0
                ? 'border-gray-700 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-sm font-bold text-gray-900">下書き</div>
            <div className="text-xs text-gray-600 mt-0.5">友だちには見えない</div>
          </button>
          <button
            type="button"
            onClick={() => update('is_published', 1)}
            className={`p-3 border-2 rounded-lg text-left transition-colors ${
              draft.is_published === 1
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white hover:border-green-300'
            }`}
          >
            <div className="text-sm font-bold text-gray-900">公開する</div>
            <div className="text-xs text-gray-600 mt-0.5">予約 URL が有効になる</div>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {draft.is_published === 1
            ? '✓ 保存後、友だちに「予約 URL」を案内できます。'
            : '保存しても友だちには表示されません。'}
        </p>
      </div>
    </div>
  )
}
