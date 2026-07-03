'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import FlexPreviewComponent from '@/components/flex-preview'
import CcPromptButton from '@/components/cc-prompt-button'
import ImageUploader from '@/components/shared/image-uploader'

interface Template {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

interface TemplateDetail {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
  usedBy: {
    autoReplies: Array<{ id: string; keyword: string; matchType: 'exact' | 'contains'; lineAccountId: string | null }>
    automations: Array<{ id: string; name: string; eventType: string }>
  }
  createdAt: string
  updatedAt: string
}

type TypeFilter = 'all' | 'text' | 'flex' | 'image' | 'unused'

const messageTypeLabels: Record<string, string> = {
  text: 'テキスト',
  image: '画像',
  flex: 'Flex',
  carousel: 'Carousel',
}

const typeBadgeColor: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700',
  flex: 'bg-purple-100 text-purple-700',
  image: 'bg-blue-100 text-blue-700',
  carousel: 'bg-amber-100 text-amber-700',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ccPrompts = [
  {
    title: 'テンプレート作成',
    prompt: `新しいメッセージテンプレートの作成をサポートしてください。
1. 用途別（挨拶、キャンペーン、通知、フォローアップ）のテンプレート文例を提案
2. テキスト・Flexメッセージそれぞれの効果的な使い方
3. カテゴリ分類と命名規則のベストプラクティス
手順を示してください。`,
  },
]

type ButtonActionType = 'uri' | 'message'

interface TemplateButtonDraft {
  id: string
  label: string
  actionType: ButtonActionType
  value: string
}

interface SimpleFlexDraft {
  title: string
  body: string
  buttons: TemplateButtonDraft[]
}

const MAX_TEMPLATE_BUTTONS = 4

function createButtonDraft(): TemplateButtonDraft {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `button-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, label: '', actionType: 'uri', value: '' }
}

function createEmptyFlexDraft(): SimpleFlexDraft {
  return {
    title: '',
    body: '',
    buttons: [createButtonDraft()],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function completedButtons(buttons: TemplateButtonDraft[]): TemplateButtonDraft[] {
  return buttons
    .map((button) => ({
      ...button,
      label: button.label.trim(),
      value: button.value.trim(),
    }))
    .filter((button) => button.label && button.value)
    .slice(0, MAX_TEMPLATE_BUTTONS)
}

function validateFlexDraft(draft: SimpleFlexDraft): string | null {
  if (!draft.title.trim() && !draft.body.trim()) return '見出しまたは本文を入力してください'
  const startedButtons = draft.buttons.filter((button) => button.label.trim() || button.value.trim())
  for (const button of startedButtons) {
    if (!button.label.trim() || !button.value.trim()) return 'ボタン名とリンク先（または送信テキスト）を入力してください'
    if (button.actionType === 'uri' && !/^https?:\/\//.test(button.value.trim())) {
      return 'URLボタンは https:// から始まるリンクを入力してください'
    }
  }
  return null
}

function buildSimpleFlexContent(draft: SimpleFlexDraft, _fallbackTitle = ''): string {
  const title = draft.title.trim()
  const body = draft.body.trim()
  const bodyContents: Record<string, unknown>[] = []

  if (title) {
    bodyContents.push({
      type: 'text',
      text: title,
      weight: 'bold',
      size: 'lg',
      color: '#312033',
      wrap: true,
    })
  }

  if (body) {
    bodyContents.push({
      type: 'text',
      text: body,
      size: 'sm',
      color: '#6c5266',
      wrap: true,
      margin: title ? 'md' : 'none',
    })
  }

  const buttons = completedButtons(draft.buttons)
  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '18px',
      backgroundColor: '#fff7fb',
      contents: bodyContents,
    },
  }

  if (buttons.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '14px',
      contents: buttons.map((button) => ({
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: '#ec6faa',
        action:
          button.actionType === 'message'
            ? { type: 'message', label: button.label, text: button.value }
            : { type: 'uri', label: button.label, uri: button.value },
      })),
    }
  }

  return JSON.stringify(bubble, null, 2)
}

function flexDraftFromTemplate(template: Pick<TemplateDetail, 'name' | 'messageType' | 'messageContent'>): SimpleFlexDraft {
  if (template.messageType !== 'flex') {
    return {
      title: template.name,
      body: template.messageContent,
      buttons: [createButtonDraft()],
    }
  }

  try {
    const parsed = JSON.parse(template.messageContent) as unknown
    if (!isRecord(parsed) || parsed.type !== 'bubble') throw new Error('not a bubble')

    const body = isRecord(parsed.body) ? parsed.body : null
    const bodyContents = body ? recordArray(body.contents) : []
    const textNodes = bodyContents.filter((node) => node.type === 'text' && typeof node.text === 'string')
    const titleNode =
      textNodes.find((node) => node.weight === 'bold' && (node.size === 'lg' || node.size === 'xl')) ?? null
    const title = typeof titleNode?.text === 'string' ? titleNode.text : template.name
    const bodyText = textNodes
      .filter((node) => node !== titleNode)
      .map((node) => String(node.text ?? ''))
      .filter(Boolean)
      .join('\n\n')

    const footer = isRecord(parsed.footer) ? parsed.footer : null
    const buttonNodes = footer ? recordArray(footer.contents) : []
    const buttons = buttonNodes
      .filter((node) => node.type === 'button' && isRecord(node.action))
      .map((node) => {
        const action = node.action as Record<string, unknown>
        const actionType: ButtonActionType = action.type === 'message' ? 'message' : 'uri'
        return {
          id: createButtonDraft().id,
          label: String(action.label ?? ''),
          actionType,
          value: actionType === 'message' ? String(action.text ?? '') : String(action.uri ?? ''),
        }
      })

    return {
      title,
      body: bodyText,
      buttons: buttons.length > 0 ? buttons : [createButtonDraft()],
    }
  } catch {
    return {
      title: template.name,
      body: template.messageContent,
      buttons: [createButtonDraft()],
    }
  }
}

function SimpleFlexEditor({
  value,
  onChange,
}: {
  value: SimpleFlexDraft
  onChange: (next: SimpleFlexDraft) => void
}) {
  const updateButton = (id: string, patch: Partial<TemplateButtonDraft>) => {
    onChange({
      ...value,
      buttons: value.buttons.map((button) => (button.id === id ? { ...button, ...patch } : button)),
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-pink-200 bg-white/70 p-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">見出し</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          placeholder="例: 暗誦大会 無料レッスン"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">本文</label>
        <textarea
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-y"
          placeholder="案内文を入力"
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600">ボタン</label>
          <button
            type="button"
            onClick={() => onChange({ ...value, buttons: [...value.buttons, createButtonDraft()] })}
            disabled={value.buttons.length >= MAX_TEMPLATE_BUTTONS}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-pink-200 text-rose-700 bg-white/70 disabled:opacity-40"
          >
            + 追加
          </button>
        </div>
        {value.buttons.map((button, index) => (
          <div key={button.id} className="rounded-lg border border-pink-100 bg-white/75 p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-500">ボタン {index + 1}</span>
              {value.buttons.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, buttons: value.buttons.filter((item) => item.id !== button.id) })}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  削除
                </button>
              )}
            </div>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="例: 無料レッスンを予約する"
              value={button.label}
              onChange={(e) => updateButton(button.id, { label: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
              <select
                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
                value={button.actionType}
                onChange={(e) =>
                  updateButton(button.id, { actionType: e.target.value as ButtonActionType, value: '' })
                }
              >
                <option value="uri">URLを開く</option>
                <option value="message">返信させる</option>
              </select>
              <input
                type={button.actionType === 'uri' ? 'url' : 'text'}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder={button.actionType === 'uri' ? 'https://...' : '例: 予約したい'}
                value={button.value}
                onChange={(e) => updateButton(button.id, { value: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [form, setForm] = useState({ name: '', category: 'general', messageType: 'text', messageContent: '' })
  const [formFlexDraft, setFormFlexDraft] = useState<SimpleFlexDraft>(() => createEmptyFlexDraft())
  const [formFlexMode, setFormFlexMode] = useState<'simple' | 'json'>('simple')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Drawer
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerData, setDrawerData] = useState<TemplateDetail | null>(null)
  const [scenarioStepUsages, setScenarioStepUsages] = useState<Array<{
    scenarioId: string
    scenarioName: string
    stepId: string
    stepOrder: number
  }>>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<string | null>(null)
  const [editName, setEditName] = useState<string | null>(null)
  const [editFlexDraft, setEditFlexDraft] = useState<SimpleFlexDraft | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.templates.list()
      if (res.success) {
        setTemplates(res.data)
      } else {
        setError(res.error)
      }
    } catch {
      setError('テンプレートの読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Drawer fetch
  useEffect(() => {
    if (!drawerId) { setDrawerData(null); setDrawerError(null); setScenarioStepUsages([]); return }
    let cancelled = false
    setDrawerLoading(true)
    setDrawerError(null)
    setDrawerData(null)
    setScenarioStepUsages([])
    Promise.all([
      api.templates.get(drawerId),
      api.templates.usages(drawerId).catch(() => null),
    ]).then(([detailRes, usagesRes]) => {
      if (cancelled) return
      if (detailRes.success && detailRes.data) {
        setDrawerData(detailRes.data)
      } else {
        setDrawerError((detailRes as { error?: string }).error ?? '読み込みに失敗しました')
      }
      if (usagesRes && usagesRes.success) {
        setScenarioStepUsages(usagesRes.data.scenarioSteps)
      }
    }).catch((err) => {
      if (cancelled) return
      setDrawerError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (!cancelled) setDrawerLoading(false)
    })
    return () => { cancelled = true }
  }, [drawerId])

  // reset edits when drawer changes
  useEffect(() => { setEditContent(null); setEditName(null); setEditFlexDraft(null) }, [drawerId])

  const filteredTemplates = templates.filter((t) => {
    if (typeFilter === 'all') return true
    if (typeFilter === 'unused') return t.usageCount === 0
    return t.messageType === typeFilter
  })

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormError('テンプレート名を入力してください'); return }
    const payload = { ...form }
    if (form.messageType === 'flex' && formFlexMode === 'simple') {
      const flexError = validateFlexDraft(formFlexDraft)
      if (flexError) { setFormError(flexError); return }
      payload.messageContent = buildSimpleFlexContent(formFlexDraft, form.name)
    }
    if (!payload.messageContent.trim()) { setFormError('メッセージ内容を入力してください'); return }
    setSaving(true)
    setFormError('')
    try {
      const res = await api.templates.create(payload)
      if (res.success) {
        setShowCreate(false)
        setForm({ name: '', category: 'general', messageType: 'text', messageContent: '' })
        setFormFlexDraft(createEmptyFlexDraft())
        setFormFlexMode('simple')
        load()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSimpleFlex = async () => {
    if (!drawerData) return
    const draft = editFlexDraft ?? flexDraftFromTemplate(drawerData)
    const flexError = validateFlexDraft(draft)
    if (flexError) { setError(flexError); return }

    setSavingEdit(true)
    try {
      const updates: Record<string, string> = {
        messageType: 'flex',
        messageContent: buildSimpleFlexContent(draft, editName ?? drawerData.name),
      }
      if (editName !== null) updates.name = editName
      await api.templates.update(drawerData.id, updates)
      const r = await api.templates.get(drawerData.id)
      if (r.success && r.data) setDrawerData(r.data)
      setEditContent(null)
      setEditName(null)
      setEditFlexDraft(null)
      load()
    } catch {
      setError('更新に失敗しました')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!drawerData) return
    if (editContent !== null && !editContent.trim()) {
      setError('内容を空にはできません')
      return
    }
    if (editName !== null && !editName.trim()) {
      setError('名前を空にはできません')
      return
    }
    setSavingEdit(true)
    try {
      const updates: Record<string, string> = {}
      if (editContent !== null) updates.messageContent = editContent
      if (editName !== null) updates.name = editName
      await api.templates.update(drawerData.id, updates)
      const r = await api.templates.get(drawerData.id)
      if (r.success && r.data) setDrawerData(r.data)
      setEditContent(null)
      setEditName(null)
      load()
    } catch {
      setError('更新に失敗しました')
    }
    setSavingEdit(false)
  }

  const handleDelete = async (id: string, usageCount: number) => {
    if (usageCount > 0) {
      if (!confirm(`このテンプレートは ${usageCount} 箇所で使用されています。削除すると参照がクリアされます。続行しますか？`)) return
    } else {
      if (!confirm('このテンプレートを削除しますか？')) return
    }
    try {
      await api.templates.delete(id)
      if (drawerId === id) setDrawerId(null)
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="テンプレート管理"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規テンプレート
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Type filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          { key: 'all', label: '全て' },
          { key: 'text', label: 'テキスト' },
          { key: 'flex', label: 'Flex' },
          { key: 'image', label: '画像' },
          { key: 'unused', label: '未使用' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              typeFilter === key ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
            style={typeFilter === key ? { backgroundColor: '#06C755' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規テンプレートを作成</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">名前 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: コスト比較 flex"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: general, 挨拶, 返信"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タイプ</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.messageType}
                onChange={(e) => {
                  const nextType = e.target.value
                  if (nextType === 'flex' && form.messageType !== 'flex') {
                    setFormFlexDraft({
                      title: form.name,
                      body: form.messageContent,
                      buttons: [createButtonDraft()],
                    })
                    setFormFlexMode('simple')
                  }
                  setForm({ ...form, messageType: nextType })
                }}
              >
                <option value="text">テキスト</option>
                <option value="flex">Flex</option>
                <option value="image">画像</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {form.messageType === 'flex' ? 'メッセージ内容' : '内容 / JSON'} <span className="text-red-500">*</span>
              </label>
              {form.messageType === 'image' ? (
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
                    } catch { /* ignore */ }
                    return null
                  })()}
                  onChange={(v) => {
                    if (v?.mode === 'line-image') {
                      setForm((prev) => ({ ...prev, messageContent: JSON.stringify({
                        originalContentUrl: v.originalContentUrl,
                        previewImageUrl: v.previewImageUrl,
                      }) }))
                    } else {
                      setForm((prev) => ({ ...prev, messageContent: '' }))
                    }
                  }}
                  label="テンプレート画像"
                />
              ) : form.messageType === 'flex' ? (
                <div className="space-y-3">
                  <div className="inline-flex rounded-full bg-pink-50 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setFormFlexMode('simple')}
                      className={`px-3 py-1 rounded-full font-medium ${formFlexMode === 'simple' ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-500'}`}
                    >
                      かんたん入力
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormFlexMode('json')}
                      className={`px-3 py-1 rounded-full font-medium ${formFlexMode === 'json' ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-500'}`}
                    >
                      JSON
                    </button>
                  </div>

                  {formFlexMode === 'simple' ? (
                    <>
                      <SimpleFlexEditor value={formFlexDraft} onChange={setFormFlexDraft} />
                      <div>
                        <p className="text-[11px] font-medium text-gray-500 mb-1.5">プレビュー</p>
                        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 overflow-x-auto">
                          <FlexPreviewComponent content={buildSimpleFlexContent(formFlexDraft, form.name)} maxWidth={420} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                      rows={10}
                      placeholder='{"type":"bubble","body":...}'
                      value={form.messageContent}
                      onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                    />
                  )}
                </div>
              ) : (
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  rows={4}
                  placeholder="メッセージ内容"
                  value={form.messageContent}
                  onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
                />
              )}
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false)
                  setFormError('')
                  setFormFlexDraft(createEmptyFlexDraft())
                  setFormFlexMode('simple')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-12" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-12" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">該当するテンプレートがありません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">タイプ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">名前</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">カテゴリ</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">使用数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">更新日</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTemplates.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setDrawerId(t.id)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${drawerId === t.id ? 'bg-green-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${typeBadgeColor[t.messageType] ?? 'bg-gray-100 text-gray-700'}`}>
                        {messageTypeLabels[t.messageType] ?? t.messageType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-md">
                        {t.messageContent.slice(0, 60)}{t.messageContent.length > 60 ? '...' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm ${t.usageCount === 0 ? 'text-gray-400' : 'text-gray-900 font-medium'}`}>
                        {t.usageCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(t.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.usageCount) }}
                        className="px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-md"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerId && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 lg:hidden"
            onClick={() => setDrawerId(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full lg:w-[480px] bg-white shadow-xl border-l border-gray-200 z-40 overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {editName !== null ? (
                  <input
                    type="text"
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                ) : (
                  <h3
                    className="text-sm font-semibold truncate cursor-text"
                    onClick={() => setEditName(drawerData?.name ?? '')}
                    title="クリックで編集"
                  >
                    {drawerData?.name ?? '読み込み中...'}
                  </h3>
                )}
              </div>
              <button
                onClick={() => setDrawerId(null)}
                className="ml-2 text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>

            {drawerLoading ? (
              <div className="p-6 text-sm text-gray-400">読み込み中...</div>
            ) : drawerError ? (
              <div className="p-6">
                <p className="text-sm text-red-600 mb-2">読み込みに失敗しました</p>
                <p className="text-xs text-gray-500">{drawerError}</p>
              </div>
            ) : !drawerData ? null : (
              <div className="p-4 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${typeBadgeColor[drawerData.messageType] ?? 'bg-gray-100 text-gray-700'}`}>
                    {messageTypeLabels[drawerData.messageType] ?? drawerData.messageType}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                    {drawerData.category}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    更新: {formatDate(drawerData.updatedAt)}
                  </span>
                </div>

                {/* Preview */}
                <div>
                  <h4 className="text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">プレビュー</h4>
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 overflow-x-auto">
                    {drawerData.messageType === 'flex' ? (
                      (() => {
                        try {
                          return <FlexPreviewComponent content={drawerData.messageContent} maxWidth={420} />
                        } catch {
                          return <p className="text-xs text-red-500">Flex JSON parse 失敗</p>
                        }
                      })()
                    ) : drawerData.messageType === 'image' ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(drawerData.messageContent)
                          return <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-full rounded" />
                        } catch {
                          return <pre className="text-xs whitespace-pre-wrap">{drawerData.messageContent}</pre>
                        }
                      })()
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{drawerData.messageContent}</p>
                    )}
                  </div>
                </div>

                {drawerData.messageType !== 'image' && (
                  (() => {
                    const simpleDraft = editFlexDraft ?? flexDraftFromTemplate(drawerData)
                    const simplePreview = buildSimpleFlexContent(simpleDraft, editName ?? drawerData.name)
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                            かんたんボタン編集
                          </h4>
                          {drawerData.messageType !== 'flex' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-rose-700">
                              保存するとFlexになります
                            </span>
                          )}
                        </div>
                        <SimpleFlexEditor
                          value={simpleDraft}
                          onChange={(next) => setEditFlexDraft(next)}
                        />
                        <div>
                          <p className="text-[11px] font-medium text-gray-500 mb-1.5">ボタン付きプレビュー</p>
                          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 overflow-x-auto">
                            <FlexPreviewComponent content={simplePreview} maxWidth={420} />
                          </div>
                        </div>
                        <button
                          onClick={handleSaveSimpleFlex}
                          disabled={savingEdit}
                          className="px-3 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
                          style={{ backgroundColor: '#06C755' }}
                        >
                          {savingEdit ? '保存中...' : 'ボタン付きで保存'}
                        </button>
                      </div>
                    )
                  })()
                )}

                {/* Edit JSON / content */}
                <details className="rounded-lg border border-gray-200 bg-white/70 p-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                    JSONを直接編集
                  </summary>
                  <div className="mt-3">
                    <textarea
                      rows={drawerData.messageType === 'flex' ? 12 : 4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                      value={editContent ?? drawerData.messageContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                  </div>
                </details>

                {(editContent !== null || editName !== null) && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      {savingEdit ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => { setEditContent(null); setEditName(null) }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      キャンセル
                    </button>
                  </div>
                )}

                {/* Used by */}
                <div>
                  <h4 className="text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                    使用箇所 ({drawerData.usedBy.autoReplies.length + drawerData.usedBy.automations.length + scenarioStepUsages.length})
                  </h4>
                  {(drawerData.usedBy.autoReplies.length === 0 && drawerData.usedBy.automations.length === 0 && scenarioStepUsages.length === 0) ? (
                    <p className="text-[11px] text-gray-400 italic">どこからも使用されていません</p>
                  ) : (
                    <>
                      <ul className="space-y-1.5 text-xs">
                        {drawerData.usedBy.autoReplies.map((ar) => (
                          <li key={`ar-${ar.id}`}>
                            <a href="/auto-replies" className="text-blue-600 hover:underline">
                              🔗 自動返信: {ar.keyword} <span className="text-gray-400">({ar.matchType})</span>
                            </a>
                          </li>
                        ))}
                        {drawerData.usedBy.automations.map((au) => (
                          <li key={`au-${au.id}`}>
                            <a href="/automations" className="text-blue-600 hover:underline">
                              🔗 オートメーション: {au.name} <span className="text-gray-400">({au.eventType})</span>
                            </a>
                          </li>
                        ))}
                        {scenarioStepUsages.map((ss) => (
                          <li key={`ss-${ss.stepId}`}>
                            <a href={`/scenarios/detail?id=${ss.scenarioId}`} className="text-blue-600 hover:underline">
                              🎬 シナリオ: {ss.scenarioName} <span className="text-gray-400">#{ss.stepOrder}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                      {scenarioStepUsages.length > 0 && (
                        <p className="mt-2 text-[10px] text-amber-700">
                          ⚠ このテンプレートを修正すると、上記すべてに一斉反映されます
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
