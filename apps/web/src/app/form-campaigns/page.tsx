'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/header'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import type { Tag } from '@line-crm/shared'

const WORKER_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

type FieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'tel' | 'date'

type DraftField = {
  id: string
  label: string
  type: FieldType
  required: boolean
  placeholder: string
  optionsText: string
}

type CreatedCampaign = {
  formId: string
  formName: string
  refCode: string
  campaignUrl: string
  directFormUrl: string
  shareText: string
}

const fieldTypeLabels: Record<FieldType, string> = {
  text: '短文',
  textarea: '長文',
  select: '選択',
  radio: '1つ選択',
  checkbox: '複数選択',
  email: 'メール',
  tel: '電話',
  date: '日付',
}

function newField(partial: Partial<DraftField> = {}): DraftField {
  return {
    id: crypto.randomUUID(),
    label: partial.label ?? '',
    type: partial.type ?? 'text',
    required: partial.required ?? false,
    placeholder: partial.placeholder ?? '',
    optionsText: partial.optionsText ?? '',
  }
}

function buildRefCode(): string {
  return `coupon-${Date.now().toString(36).slice(-6)}`
}

function normalizeFields(fields: DraftField[]) {
  return fields
    .map((field, index) => {
      const label = field.label.trim()
      if (!label) return null
      const options = field.optionsText
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean)
      return {
        name: `q${index + 1}`,
        label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder.trim() || undefined,
        options: ['select', 'radio', 'checkbox'].includes(field.type) ? options : undefined,
      }
    })
    .filter((field): field is NonNullable<typeof field> => field !== null)
}

function buildCouponMessage(input: {
  couponTitle: string
  couponBody: string
  couponUrl: string
  couponNote: string
}) {
  const title = input.couponTitle.trim() || 'アンケート回答特典'
  const body = input.couponBody.trim() || 'ご回答ありがとうございます。下記の特典をご利用ください。'
  const lines = [
    'アンケートへのご回答、ありがとうございました。',
    '',
    `【${title}】`,
    body,
  ]

  if (input.couponUrl.trim()) {
    lines.push('', input.couponUrl.trim())
  } else {
    lines.push('', 'このメッセージを教室スタッフへご提示ください。')
  }

  if (input.couponNote.trim()) {
    lines.push('', input.couponNote.trim())
  }

  return lines.join('\n')
}

function buildShareText(campaignUrl: string) {
  return [
    'いつもありがとうございます。',
    '',
    '今後のご案内をより分かりやすくするため、簡単なアンケートへのご協力をお願いいたします。',
    '',
    'ご回答後、LINEに特典メッセージが届きます。',
    campaignUrl,
  ].join('\n')
}

export default function FormCampaignsPage() {
  const { selectedAccount } = useAccount()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedCampaign | null>(null)

  const [formName, setFormName] = useState('夏期講習クーポン用アンケート')
  const [description, setDescription] = useState('現在の学習状況を確認するための簡単なアンケートです。')
  const [refCode, setRefCode] = useState(() => buildRefCode())
  const [routeName, setRouteName] = useState('夏期講習クーポン案内')
  const [tagName, setTagName] = useState('アンケート回答済み')
  const [couponTitle, setCouponTitle] = useState('夏期講習5コマ無料クーポン')
  const [couponBody, setCouponBody] = useState('面談時またはお申し込み時に、このメッセージをご提示ください。')
  const [couponUrl, setCouponUrl] = useState('')
  const [couponNote, setCouponNote] = useState('有効期限や対象講座がある場合は、教室からの案内をご確認ください。')
  const [fields, setFields] = useState<DraftField[]>([
    newField({ label: '現在通われている学校名', required: true, placeholder: '例：藍住中学校' }),
    newField({
      label: '学年',
      type: 'select',
      required: true,
      optionsText: ['小学1年生', '小学2年生', '小学3年生', '小学4年生', '小学5年生', '小学6年生', '中学1年生', '中学2年生', '中学3年生'].join('\n'),
    }),
    newField({ label: '現在気になっていること', type: 'textarea', required: false, placeholder: '英語、定期テスト、英検、学習習慣など' }),
  ])

  useEffect(() => {
    api.tags.list()
      .then((res) => {
        if (res.success) setTags(res.data)
      })
      .catch(() => {
        setTags([])
      })
  }, [])

  const couponPreview = useMemo(
    () => buildCouponMessage({ couponTitle, couponBody, couponUrl, couponNote }),
    [couponTitle, couponBody, couponUrl, couponNote],
  )
  const normalizedFields = useMemo(() => normalizeFields(fields), [fields])
  const invalidChoiceField = useMemo(
    () =>
      normalizedFields.find(
        (field) => ['select', 'radio', 'checkbox'].includes(field.type) && (!field.options || field.options.length === 0),
      ),
    [normalizedFields],
  )
  const isBasicReady = Boolean(formName.trim() && routeName.trim() && refCode.trim())
  const isQuestionReady = normalizedFields.length > 0 && !invalidChoiceField
  const isCouponReady = Boolean(couponPreview.trim())
  const isReadyToCreate = isBasicReady && isQuestionReady && isCouponReady
  const guideSteps = [
    {
      number: 1,
      title: '内容を決める',
      description: 'フォーム名、流入元名、回答後タグを確認します。',
      href: '#step-basic',
      done: isBasicReady,
    },
    {
      number: 2,
      title: '質問を作る',
      description: '質問文と回答形式を自由に設定します。',
      href: '#step-questions',
      done: isQuestionReady,
    },
    {
      number: 3,
      title: '特典を書く',
      description: '回答後にLINEで送るクーポン文面を整えます。',
      href: '#step-coupon',
      done: isCouponReady,
    },
    {
      number: 4,
      title: 'URL・QRを配る',
      description: '作成ボタンを押し、配布用URLとQRを使います。',
      href: '#step-create',
      done: Boolean(created),
    },
  ]
  const activeGuideStep = created
    ? 4
    : !isBasicReady
      ? 1
      : !isQuestionReady
        ? 2
        : !isCouponReady
          ? 3
          : 4

  const setField = (id: string, patch: Partial<DraftField>) => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)))
  }

  const duplicateField = (id: string) => {
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id)
      if (index < 0) return current
      const duplicated = {
        ...current[index],
        id: crypto.randomUUID(),
        label: `${current[index].label || '質問'} コピー`,
      }
      const next = [...current]
      next.splice(index + 1, 0, duplicated)
      return next
    })
  }

  const moveField = (id: string, direction: -1 | 1) => {
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      setError('コピーに失敗しました。ブラウザの権限を確認してください。')
    }
  }

  const ensureTag = async () => {
    const name = tagName.trim()
    if (!name) return null
    const existing = tags.find((tag) => tag.name === name)
    if (existing) return existing.id
    const res = await api.tags.create({ name, color: '#f472b6' })
    if (!res.success) throw new Error('タグの作成に失敗しました。')
    setTags((current) => [...current, res.data])
    return res.data.id
  }

  const handleCreate = async () => {
    setError('')
    setCreated(null)

    if (!formName.trim()) {
      setError('フォーム名を入力してください。')
      return
    }
    if (normalizedFields.length === 0) {
      setError('質問項目を1つ以上入力してください。')
      return
    }
    if (invalidChoiceField) {
      setError(`「${invalidChoiceField.label}」の選択肢を入力してください。`)
      return
    }
    if (!refCode.trim()) {
      setError('流入元コードを入力してください。')
      return
    }

    setLoading(true)
    try {
      const tagId = await ensureTag()
      const formRes = await api.forms.create({
        name: formName.trim(),
        description: description.trim() || null,
        fields: normalizedFields,
        onSubmitTagId: tagId,
        onSubmitMessageType: 'text',
        onSubmitMessageContent: couponPreview,
        saveToMetadata: true,
      })
      if (!formRes.success) throw new Error('フォームの作成に失敗しました。')

      const cleanRefCode = refCode.trim()
      await api.entryRoutes.create({
        refCode: cleanRefCode,
        name: routeName.trim() || formName.trim(),
        tagId: null,
        scenarioId: null,
        poolId: null,
        introTemplateId: null,
        runAccountFriendAddScenarios: true,
        isActive: true,
      })

      const campaignUrl = `${WORKER_BASE}/r/${encodeURIComponent(cleanRefCode)}?form=${encodeURIComponent(formRes.data.id)}`
      const directFormUrl = selectedAccount?.liffId
        ? `https://liff.line.me/${selectedAccount.liffId}?page=form&id=${encodeURIComponent(formRes.data.id)}`
        : `${WORKER_BASE}?page=form&id=${encodeURIComponent(formRes.data.id)}`
      setCreated({
        formId: formRes.data.id,
        formName: formRes.data.name,
        refCode: cleanRefCode,
        campaignUrl,
        directFormUrl,
        shareText: buildShareText(campaignUrl),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Header
        title="アンケート・クーポン"
        description="質問作成からURL・QR配布まで、順番に進められます。"
        action={
          <Link
            href="/form-submissions"
            className="inline-flex items-center justify-center rounded-lg border border-pink-200 bg-white/70 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-pink-50"
          >
            回答を見る
          </Link>
        }
      />

      <section className="glass-panel mb-5 rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold text-rose-700">はじめての方向け</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">上から順番に進めるだけで完成します</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              難しい設定は後回しで大丈夫です。まずは内容、質問、特典メッセージを確認し、最後にURLやQRコードを配布します。
            </p>
          </div>
          <div className="rounded-lg border border-pink-100 bg-white/60 px-4 py-3 text-xs text-gray-600">
            現在のステップ: <span className="font-bold text-rose-700">{activeGuideStep}</span> / 4
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {guideSteps.map((step) => {
            const isActive = step.number === activeGuideStep
            return (
              <a
                key={step.number}
                href={step.href}
                className={`rounded-lg border p-4 transition-colors ${
                  step.done
                    ? 'border-pink-200 bg-pink-50/70'
                    : isActive
                      ? 'border-rose-300 bg-white/75'
                      : 'border-pink-100 bg-white/52'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? 'bg-pink-200 text-rose-800' : 'bg-white text-rose-700 ring-1 ring-pink-200'
                  }`}>
                    {step.done ? '✓' : step.number}
                  </span>
                  <p className="text-sm font-bold text-gray-900">{step.title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">{step.description}</p>
              </a>
            )
          })}
        </div>
      </section>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <section id="step-basic" className="glass-panel scroll-mt-6 rounded-lg p-5">
          <div className="mb-5">
            <p className="text-xs font-bold text-rose-700">Step 1</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">内容を決める</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              ここは管理用の名前です。相手に見せる文章ではないので、あとから分かる名前にしておくと安心です。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">フォーム名</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">流入元名</span>
              <input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-600">説明</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">流入元コード</span>
              <div className="flex gap-2">
                <input
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.replace(/\s/g, ''))}
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setRefCode(buildRefCode())}
                  className="rounded-lg border border-pink-200 bg-white/70 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-pink-50"
                >
                  再生成
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">回答後タグ</span>
              <input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <div id="step-questions" className="mt-7 flex scroll-mt-6 items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-rose-700">Step 2</p>
              <h2 className="mt-1 text-base font-semibold text-gray-900">質問を作る</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                質問文、回答形式、必須/任意、選択肢を自由に設定できます。迷う場合は、最初は3問くらいで十分です。
              </p>
              {invalidChoiceField && (
                <p className="mt-2 text-xs font-medium text-rose-700">
                  「{invalidChoiceField.label}」は選択肢が未入力です。選択肢を1行に1つずつ入れてください。
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFields([newField({ label: '' })])}
                className="rounded-lg border border-pink-200 bg-white/70 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-pink-50"
              >
                空にする
              </button>
              <button
                type="button"
                onClick={() => setFields((current) => [...current, newField({ label: '新しい質問' })])}
                className="rounded-lg border border-pink-200 bg-white/70 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-pink-50"
              >
                質問を追加
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-pink-100 bg-white/58 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500">質問 {index + 1}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => moveField(field.id, -1)}
                      disabled={index === 0}
                      className="rounded-md border border-pink-100 px-2 py-1 text-xs text-gray-600 disabled:opacity-35"
                    >
                      上へ
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(field.id, 1)}
                      disabled={index === fields.length - 1}
                      className="rounded-md border border-pink-100 px-2 py-1 text-xs text-gray-600 disabled:opacity-35"
                    >
                      下へ
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateField(field.id)}
                      className="rounded-md border border-pink-100 px-2 py-1 text-xs text-gray-600"
                    >
                      複製
                    </button>
                    <button
                      type="button"
                      onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                      disabled={fields.length === 1}
                      className="rounded-md border border-pink-100 px-2 py-1 text-xs text-rose-700 disabled:opacity-35"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px_96px]">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">質問文</span>
                    <input
                      value={field.label}
                      onChange={(e) => setField(field.id, { label: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">形式</span>
                    <select
                      value={field.type}
                      onChange={(e) => setField(field.id, { type: e.target.value as FieldType })}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    >
                      {Object.entries(fieldTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => setField(field.id, { required: e.target.checked })}
                      className="h-4 w-4 rounded border-pink-200"
                    />
                    必須
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">入力例</span>
                    <input
                      value={field.placeholder}
                      onChange={(e) => setField(field.id, { placeholder: e.target.value })}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      placeholder="例：藍住中学校"
                    />
                  </label>
                  {['select', 'radio', 'checkbox'].includes(field.type) && (
                    <label>
                      <span className="mb-1 block text-xs font-medium text-gray-600">選択肢</span>
                      <textarea
                        value={field.optionsText}
                        onChange={(e) => setField(field.id, { optionsText: e.target.value })}
                        className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        placeholder={'中学1年生\n中学2年生\n中学3年生'}
                      />
                      <span className="mt-1 block text-[11px] text-gray-500">1行につき1つの選択肢として保存されます。</span>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section id="step-coupon" className="glass-panel scroll-mt-6 rounded-lg p-5">
            <p className="text-xs font-bold text-rose-700">Step 3</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">回答後に送る特典メッセージ</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              アンケート送信後、相手のLINEへ自動で届く文面です。クーポンURLがなければ、教室で見せてもらう案内として使えます。
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">特典名</span>
                <input
                  value={couponTitle}
                  onChange={(e) => setCouponTitle(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">本文</span>
                <textarea
                  value={couponBody}
                  onChange={(e) => setCouponBody(e.target.value)}
                  className="min-h-24 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">クーポンURL</span>
                <input
                  value={couponUrl}
                  onChange={(e) => setCouponUrl(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  placeholder="LINE公式クーポンURLなど"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">補足</span>
                <textarea
                  value={couponNote}
                  onChange={(e) => setCouponNote(e.target.value)}
                  className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-pink-100 bg-white/62 p-4">
              <p className="mb-2 text-xs font-semibold text-gray-500">LINE送信プレビュー</p>
              <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{couponPreview}</pre>
            </div>
          </section>

          <section id="step-create" className="glass-panel scroll-mt-6 rounded-lg p-5">
            <p className="text-xs font-bold text-rose-700">Step 4</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">作成して配布する</h2>
            <div className="mt-4 space-y-2 rounded-lg border border-pink-100 bg-white/58 p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isBasicReady ? 'bg-pink-400' : 'bg-gray-200'}`} />
                <span className={isBasicReady ? 'text-gray-700' : 'text-gray-500'}>フォーム名・流入元コードが入っている</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isQuestionReady ? 'bg-pink-400' : 'bg-gray-200'}`} />
                <span className={isQuestionReady ? 'text-gray-700' : 'text-gray-500'}>質問が1つ以上あり、選択肢も設定済み</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isCouponReady ? 'bg-pink-400' : 'bg-gray-200'}`} />
                <span className={isCouponReady ? 'text-gray-700' : 'text-gray-500'}>回答後に送る特典メッセージがある</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading || !isReadyToCreate}
              className="lh-gradient-button mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '作成中...' : isReadyToCreate ? 'アンケートとクーポンを作成' : '未入力を確認してください'}
            </button>
            {selectedAccount && (
              <p className="mt-3 text-xs text-gray-500">
                現在の対象: {selectedAccount.displayName || selectedAccount.name}
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-gray-500">
              作成すると、配布用URL・QRコード・LINEに貼る文面が下に表示されます。
            </p>
          </section>

          {created && (
            <section className="glass-panel rounded-lg p-5">
              <h2 className="text-base font-semibold text-gray-900">作成できました</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                下のURLかQRコードを使えば、友だち追加後にアンケートへ進めます。回答後は特典メッセージが自動で届きます。
              </p>
              <div className="mt-4 rounded-lg border border-pink-100 bg-pink-50/60 p-3">
                <p className="text-xs font-bold text-rose-700">次にやること</p>
                <ol className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                  <li>1. 「文面をコピー」を押してLINE配信や個別チャットに貼る</li>
                  <li>2. チラシや掲示物に使う場合はQRコードを保存して使う</li>
                  <li>3. 回答が届いたら「回答一覧」で内容を確認する</li>
                </ol>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500">配信用URL</p>
                  <div className="mt-1 break-all rounded-lg border border-pink-100 bg-white/65 p-3 text-xs text-gray-700">
                    {created.campaignUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText('url', created.campaignUrl)}
                    className="mt-2 rounded-lg border border-pink-200 bg-white/70 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-pink-50"
                  >
                    {copied === 'url' ? 'コピーしました' : 'URLをコピー'}
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">一括コピー文面</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-pink-100 bg-white/65 p-3 text-xs leading-5 text-gray-700">
                    {created.shareText}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyText('share', created.shareText)}
                    className="mt-2 rounded-lg border border-pink-200 bg-white/70 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-pink-50"
                  >
                    {copied === 'share' ? 'コピーしました' : '文面をコピー'}
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">QRコード</p>
                  <div className="mt-2 inline-block rounded-lg border border-pink-100 bg-white p-3">
                    <img
                      src={`${WORKER_BASE}/api/qr?size=180x180&data=${encodeURIComponent(created.campaignUrl)}`}
                      alt="アンケートURLのQRコード"
                      className="h-[180px] w-[180px]"
                    />
                  </div>
                </div>
                <Link
                  href="/form-submissions"
                  className="inline-flex rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-pink-200 hover:bg-pink-50"
                >
                  回答一覧へ
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setCreated(null)
                    setRefCode(buildRefCode())
                    window.location.hash = 'step-basic'
                  }}
                  className="ml-2 inline-flex rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-pink-100 hover:bg-pink-50"
                >
                  別のアンケートを作る
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
