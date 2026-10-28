'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import type { RichMenuAssignmentItem, RichMenuAssignmentOverview } from '@line-crm/shared'

type AutomationEventType = "friend_add" | "tag_change" | "score_threshold" | "cv_fire" | "message_received" | "calendar_booked"

interface AutomationAction {
  type: "add_tag" | "remove_tag" | "start_scenario" | "send_message" | "send_webhook" | "switch_rich_menu"
  params: Record<string, unknown>
}

interface Automation {
  id: string
  name: string
  description: string | null
  eventType: AutomationEventType
  conditions: Record<string, unknown>
  actions: AutomationAction[]
  isActive: boolean
  priority: number
  createdAt: string
  updatedAt: string
}

const eventTypeOptions: { value: AutomationEventType; label: string }[] = [
  { value: 'friend_add', label: '友だち追加' },
  { value: 'tag_change', label: 'タグ変更' },
  { value: 'score_threshold', label: 'スコア閾値' },
  { value: 'cv_fire', label: 'CV発火' },
  { value: 'message_received', label: 'メッセージ受信' },
  { value: 'calendar_booked', label: 'カレンダー予約' },
]

const eventTypeLabelMap: Record<AutomationEventType, string> = {
  friend_add: '友だち追加',
  tag_change: 'タグ変更',
  score_threshold: 'スコア閾値',
  cv_fire: 'CV発火',
  message_received: 'メッセージ受信',
  calendar_booked: 'カレンダー予約',
}

const eventTypeBadgeColor: Record<AutomationEventType, string> = {
  friend_add: 'bg-green-100 text-green-700',
  tag_change: 'bg-blue-100 text-blue-700',
  score_threshold: 'bg-yellow-100 text-yellow-700',
  cv_fire: 'bg-red-100 text-red-700',
  message_received: 'bg-purple-100 text-purple-700',
  calendar_booked: 'bg-indigo-100 text-indigo-700',
}

interface CreateFormState {
  name: string
  description: string
  eventType: AutomationEventType
  actionsJson: string
  conditionsJson: string
  priority: number
}

const initialForm: CreateFormState = {
  name: '',
  description: '',
  eventType: 'friend_add',
  actionsJson: '[\n  {\n    "type": "add_tag",\n    "params": {}\n  }\n]',
  conditionsJson: '{}',
  priority: 0,
}

const ccPrompts = [
  {
    title: 'オートメーションルール作成',
    prompt: `新しいオートメーションルールを作成するサポートをしてください。
1. 利用可能なイベントタイプ（友だち追加、タグ変更、スコア閾値等）の説明
2. アクション設定のJSON形式テンプレートを提供
3. 条件設定と優先度の推奨値を提案
手順を示してください。`,
  },
  {
    title: 'オートメーション効果分析',
    prompt: `現在のオートメーションルールの効果を分析してください。
1. 各ルールの発火回数と成功率を確認
2. イベントタイプ別の自動化カバレッジを評価
3. 効果の低いルールの改善提案と新規ルールの推奨
結果をレポートしてください。`,
  },
]

export default function AutomationsPage() {
  const { selectedAccountId, loading: accountLoading } = useAccount()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateFormState>({ ...initialForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [assignmentOverview, setAssignmentOverview] = useState<RichMenuAssignmentOverview | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [assignmentNotice, setAssignmentNotice] = useState('')
  const [retryingKey, setRetryingKey] = useState<string | null>(null)

  const loadAssignments = useCallback(async () => {
    if (!selectedAccountId) {
      setAssignmentOverview(null)
      return
    }
    setAssignmentLoading(true)
    try {
      const res = await api.automations.richMenuAssignments(selectedAccountId)
      if (res.success) setAssignmentOverview(res.data)
      else setAssignmentNotice('自動切替の処理状況を読み込めませんでした。')
    } catch {
      setAssignmentNotice('自動切替の処理状況を読み込めませんでした。')
    } finally {
      setAssignmentLoading(false)
    }
  }, [selectedAccountId])

  const loadAutomations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.automations.list({ accountId: selectedAccountId || undefined })
      if (res.success) {
        setAutomations(res.data)
      } else {
        setError(res.error)
      }
    } catch {
      setError('オートメーションの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    if (accountLoading) return

    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await api.automations.list({ accountId: selectedAccountId || undefined })
        if (cancelled) return
        if (res.success) {
          setAutomations(res.data)
        } else {
          setError(res.error)
        }
      } catch {
        if (cancelled) return
        setError('オートメーションの読み込みに失敗しました。もう一度お試しください。')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [selectedAccountId, accountLoading])

  useEffect(() => {
    if (accountLoading) return
    setAssignmentNotice('')
    loadAssignments()
  }, [accountLoading, loadAssignments])

  const handleRetryAssignment = async (item: RichMenuAssignmentItem) => {
    if (!confirm('この対象者のリッチメニュー設定だけを再実行します。メッセージ配信は行いません。よろしいですか？')) return
    setRetryingKey(item.assignmentKey)
    setAssignmentNotice('')
    try {
      const res = await api.automations.retryRichMenuAssignment(item.assignmentKey)
      setAssignmentNotice(res.success ? '再試行を予約しました。通常は5分以内に処理されます。' : res.error)
      await loadAssignments()
    } catch {
      setAssignmentNotice('再試行の予約に失敗しました。')
    } finally {
      setRetryingKey(null)
    }
  }

  const handleRetryAllFailed = async () => {
    if (!selectedAccountId) return
    if (!confirm('「要確認」のリッチメニュー設定をまとめて再試行します。メッセージ配信は行いません。よろしいですか？')) return
    setRetryingKey('all')
    setAssignmentNotice('')
    try {
      const res = await api.automations.retryFailedRichMenuAssignments(selectedAccountId)
      setAssignmentNotice(
        res.success ? `${res.data.queued}件を再試行待ちに戻しました。` : res.error,
      )
      await loadAssignments()
    } catch {
      setAssignmentNotice('一括再試行の予約に失敗しました。')
    } finally {
      setRetryingKey(null)
    }
  }

  const handleCreate = async () => {
    if (!selectedAccountId) {
      setFormError('LINEアカウントを選択してください')
      return
    }
    if (!form.name.trim()) {
      setFormError('ルール名を入力してください')
      return
    }

    let parsedActions: AutomationAction[]
    let parsedConditions: Record<string, unknown>
    try {
      parsedActions = JSON.parse(form.actionsJson)
    } catch {
      setFormError('アクションのJSON形式が正しくありません')
      return
    }
    try {
      parsedConditions = JSON.parse(form.conditionsJson)
    } catch {
      setFormError('条件のJSON形式が正しくありません')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const res = await api.automations.create({
        name: form.name,
        description: form.description || null,
        eventType: form.eventType,
        actions: parsedActions,
        conditions: parsedConditions,
        priority: form.priority,
        lineAccountId: selectedAccountId,
      })
      if (res.success) {
        setShowCreate(false)
        setForm({ ...initialForm })
        loadAutomations()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.automations.update(id, { isActive: !current })
      loadAutomations()
    } catch {
      setError('ステータスの変更に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このオートメーションを削除してもよいですか？')) return
    try {
      await api.automations.delete(id)
      loadAutomations()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="オートメーション"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規ルール
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規オートメーションを作成</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ルール名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 友だち追加時にウェルカムタグ付与"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={2}
                placeholder="ルールの説明 (省略可)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">イベントタイプ</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.eventType}
                onChange={(e) => setForm({ ...form, eventType: e.target.value as AutomationEventType })}
              >
                {eventTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">アクション (JSON)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                rows={6}
                placeholder='[{"type": "add_tag", "params": {"tagId": "..."}}]'
                value={form.actionsJson}
                onChange={(e) => setForm({ ...form, actionsJson: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">条件 (JSON)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                rows={3}
                placeholder='{"tagId": "...", "operator": "equals"}'
                value={form.conditionsJson}
                onChange={(e) => setForm({ ...form, conditionsJson: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">優先度</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 0 })}
              />
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setFormError('') }}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Durable rich-menu assignment status */}
      {selectedAccountId && (
        <section className="mb-6 rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">リッチメニュー自動切替の処理状況</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                流入タグで指定された最新のメニューを1人ずつ保持し、一時的なLINE障害は最大5回まで自動再試行します。
                適用後も約5日で一巡する定期照合を行います。
              </p>
            </div>
            {(assignmentOverview?.summary.needsAttention ?? 0) > 0 && (
              <button
                onClick={handleRetryAllFailed}
                disabled={retryingKey === 'all'}
                className="min-h-[44px] rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {retryingKey === 'all' ? '予約中…' : '要確認をまとめて再試行'}
              </button>
            )}
          </div>

          {assignmentNotice && (
            <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{assignmentNotice}</div>
          )}

          {assignmentLoading && !assignmentOverview ? (
            <div className="mt-4 h-20 animate-pulse rounded-lg bg-gray-100" />
          ) : assignmentOverview ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['適用済み', assignmentOverview.summary.applied, 'text-emerald-700 bg-emerald-50'],
                  ['再試行待ち', assignmentOverview.summary.waiting, 'text-blue-700 bg-blue-50'],
                  ['要確認', assignmentOverview.summary.needsAttention, 'text-amber-800 bg-amber-50'],
                  ['管理対象', assignmentOverview.summary.total, 'text-gray-700 bg-gray-50'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className={`rounded-lg p-3 ${String(color)}`}>
                    <div className="text-xs font-medium">{label}</div>
                    <div className="mt-1 text-xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              {assignmentOverview.items.some((item) => item.status !== 'applied') && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">ルール</th>
                        <th className="px-3 py-2 font-medium">状態</th>
                        <th className="px-3 py-2 font-medium">試行</th>
                        <th className="px-3 py-2 font-medium">最終処理</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {assignmentOverview.items
                        .filter((item) => item.status !== 'applied')
                        .slice(0, 20)
                        .map((item) => (
                          <tr key={item.assignmentKey}>
                            <td className="max-w-[220px] px-3 py-3 text-gray-800">
                              {item.automationName || (item.source === 'manual' ? '手動設定' : '自動切替')}
                            </td>
                            <td className="px-3 py-3 text-gray-600">{item.reasonLabel}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-gray-500">
                              {item.retryCount}/{item.maxRetries}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-gray-500">
                              {item.lastAttemptAt
                                ? new Date(item.lastAttemptAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
                                : '未実行'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {item.canRetry && (
                                <button
                                  onClick={() => handleRetryAssignment(item)}
                                  disabled={retryingKey === item.assignmentKey}
                                  className="min-h-[40px] whitespace-nowrap rounded-md bg-amber-50 px-3 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  {retryingKey === item.assignmentKey ? '予約中…' : '再実行'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </section>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : automations.length === 0 && !showCreate ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">オートメーションがありません。「新規ルール」から作成してください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 leading-tight">{automation.name}</h3>
                <button
                  onClick={() => handleToggleActive(automation.id, automation.isActive)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    automation.isActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  title={automation.isActive ? '有効 - クリックで無効化' : '無効 - クリックで有効化'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      automation.isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Description */}
              {automation.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{automation.description}</p>
              )}

              {/* Event type badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeBadgeColor[automation.eventType]}`}>
                  {eventTypeLabelMap[automation.eventType]}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  automation.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {automation.isActive ? '有効' : '無効'}
                </span>
              </div>

              {/* Meta info */}
              {(() => {
                const sendMsgWithTpl = automation.actions.filter(
                  (a) => a.type === 'send_message' && (a.params as { template_id?: string }).template_id,
                ).length
                return (
                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                    <span>アクション: {automation.actions.length}件</span>
                    {sendMsgWithTpl > 0 && (
                      <a href="/templates" className="text-blue-600 hover:underline" title="template_id 参照を含む send_message action あり">
                        🔗 template×{sendMsgWithTpl}
                      </a>
                    )}
                    <span>優先度: {automation.priority}</span>
                  </div>
                )
              })()}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleDelete(automation.id)}
                  className="px-3 py-1 min-h-[44px] text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
