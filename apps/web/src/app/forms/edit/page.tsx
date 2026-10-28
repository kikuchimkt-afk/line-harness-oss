'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/header'
import { api } from '@/lib/api'

type FieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'tel' | 'date'

interface FormField {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

interface EditableForm {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  onSubmitMessageType: 'text' | 'flex' | null
  onSubmitMessageContent: string | null
  saveToMetadata: boolean
  isActive: boolean
}

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: '短文' },
  { value: 'textarea', label: '長文' },
  { value: 'select', label: '選択' },
  { value: 'radio', label: '1つ選択' },
  { value: 'checkbox', label: '複数選択' },
  { value: 'email', label: 'メール' },
  { value: 'tel', label: '電話' },
  { value: 'date', label: '日付' },
]

function makeField(): FormField {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  return { name: `field_${suffix}`, label: '', type: 'text', required: false, placeholder: '' }
}

function needsOptions(type: FieldType): boolean {
  return type === 'select' || type === 'radio' || type === 'checkbox'
}

export default function FormEditPage() {
  const [formId, setFormId] = useState('')
  const [form, setForm] = useState<EditableForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('formId') ?? ''
    setFormId(id)
    if (!id) {
      setError('編集するフォームが指定されていません。')
      setLoading(false)
      return
    }

    api.forms.get(id)
      .then((res) => {
        if (!res.success || !res.data) throw new Error('フォームを読み込めませんでした。')
        setForm({
          ...res.data,
          fields: (res.data.fields ?? []) as FormField[],
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'フォームを読み込めませんでした。'))
      .finally(() => setLoading(false))
  }, [])

  const updateField = (index: number, patch: Partial<FormField>) => {
    setSaved(false)
    setForm((current) => current
      ? { ...current, fields: current.fields.map((field, i) => i === index ? { ...field, ...patch } : field) }
      : current)
  }

  const moveField = (index: number, direction: -1 | 1) => {
    setSaved(false)
    setForm((current) => {
      if (!current) return current
      const target = index + direction
      if (target < 0 || target >= current.fields.length) return current
      const fields = [...current.fields]
      ;[fields[index], fields[target]] = [fields[target], fields[index]]
      return { ...current, fields }
    })
  }

  const duplicateField = (index: number) => {
    setSaved(false)
    setForm((current) => {
      if (!current) return current
      const fields = [...current.fields]
      fields.splice(index + 1, 0, { ...current.fields[index], name: makeField().name })
      return { ...current, fields }
    })
  }

  const deleteField = (index: number) => {
    setSaved(false)
    setForm((current) => current
      ? { ...current, fields: current.fields.filter((_, i) => i !== index) }
      : current)
  }

  const save = async () => {
    if (!form) return
    setError('')
    setSaved(false)

    if (!form.name.trim()) {
      setError('フォーム名を入力してください。')
      return
    }
    if (form.fields.length === 0) {
      setError('質問を1つ以上追加してください。')
      return
    }
    if (form.fields.some((field) => !field.label.trim())) {
      setError('すべての質問文を入力してください。')
      return
    }
    if (form.fields.some((field) => needsOptions(field.type) && !(field.options ?? []).some((option) => option.trim()))) {
      setError('選択形式の質問には、選択肢を1つ以上入力してください。')
      return
    }

    setSaving(true)
    try {
      const fields = form.fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || undefined,
        options: needsOptions(field.type)
          ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
          : undefined,
      }))
      const res = await api.forms.update(formId, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        fields,
        onSubmitMessageType: form.onSubmitMessageType,
        onSubmitMessageContent: form.onSubmitMessageContent?.trim() || null,
        saveToMetadata: form.saveToMetadata,
        isActive: form.isActive,
      })
      if (!res.success) throw new Error('保存に失敗しました。')
      setForm((current) => current ? { ...current, fields } : current)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div><Header title="フォーム編集" description="既存フォームの内容と質問を編集" /><p className="text-sm text-gray-400">読み込み中...</p></div>
  }

  if (!form) {
    return (
      <div>
        <Header title="フォーム編集" description="既存フォームの内容と質問を編集" />
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
        <Link href="/form-submissions" className="mt-4 inline-block text-sm text-[#06C755] hover:underline">← フォーム回答へ戻る</Link>
      </div>
    )
  }

  return (
    <div className="pb-12">
      <Header title="フォーム編集" description="既存の回答を残したまま、フォーム名・質問・回答後メッセージを変更" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/form-submissions" className="text-sm text-gray-500 hover:text-gray-800">← フォーム回答へ戻る</Link>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-medium text-[#06C755]">保存しました</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#06C755] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#05b64d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中...' : '変更を保存'}
          </button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">基本情報</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            フォーム名
            <input
              value={form.name}
              onChange={(event) => { setSaved(false); setForm({ ...form, name: event.target.value }) }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            公開状態
            <select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => { setSaved(false); setForm({ ...form, isActive: event.target.value === 'active' }) }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-green-100"
            >
              <option value="active">受付中</option>
              <option value="inactive">受付停止</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-gray-700">
          説明文
          <textarea
            value={form.description ?? ''}
            onChange={(event) => { setSaved(false); setForm({ ...form, description: event.target.value }) }}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </label>
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">質問</h2>
            <p className="mt-1 text-xs text-gray-500">質問文、回答形式、必須設定、選択肢を変更できます。</p>
          </div>
          <button
            type="button"
            onClick={() => { setSaved(false); setForm({ ...form, fields: [...form.fields, makeField()] }) }}
            className="rounded-lg border border-[#06C755] px-3 py-2 text-sm font-semibold text-[#06C755] hover:bg-green-50"
          >
            ＋ 質問を追加
          </button>
        </div>

        <div className="space-y-4">
          {form.fields.map((field, index) => (
            <div key={field.name} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-800">質問 {index + 1}</span>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} className="rounded border border-gray-200 bg-white px-2 py-1 disabled:opacity-40">上へ</button>
                  <button type="button" onClick={() => moveField(index, 1)} disabled={index === form.fields.length - 1} className="rounded border border-gray-200 bg-white px-2 py-1 disabled:opacity-40">下へ</button>
                  <button type="button" onClick={() => duplicateField(index)} className="rounded border border-gray-200 bg-white px-2 py-1">複製</button>
                  <button type="button" onClick={() => deleteField(index)} className="rounded border border-red-200 bg-white px-2 py-1 text-red-600">削除</button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)]">
                <label className="text-xs font-medium text-gray-700">
                  質問文
                  <input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  形式
                  <select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as FieldType })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                    {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)]">
                <label className="text-xs font-medium text-gray-700">
                  入力例
                  <input value={field.placeholder ?? ''} onChange={(event) => updateField(index, { placeholder: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                  <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(index, { required: event.target.checked })} className="h-4 w-4 accent-[#06C755]" />
                  必須にする
                </label>
              </div>

              {needsOptions(field.type) && (
                <label className="mt-3 block text-xs font-medium text-gray-700">
                  選択肢（1行につき1つ）
                  <textarea
                    value={(field.options ?? []).join('\n')}
                    onChange={(event) => updateField(index, { options: event.target.value.split('\n') })}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">回答後メッセージ</h2>
        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          <label className="text-sm font-medium text-gray-700">
            形式
            <select
              value={form.onSubmitMessageType ?? 'none'}
              onChange={(event) => {
                const value = event.target.value as 'none' | 'text' | 'flex'
                setSaved(false)
                setForm({ ...form, onSubmitMessageType: value === 'none' ? null : value })
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            >
              <option value="none">送信しない</option>
              <option value="text">テキスト</option>
              <option value="flex">Flex JSON</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            メッセージ内容
            <textarea
              value={form.onSubmitMessageContent ?? ''}
              onChange={(event) => { setSaved(false); setForm({ ...form, onSubmitMessageContent: event.target.value }) }}
              rows={5}
              disabled={!form.onSubmitMessageType}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.saveToMetadata} onChange={(event) => { setSaved(false); setForm({ ...form, saveToMetadata: event.target.checked }) }} className="h-4 w-4 accent-[#06C755]" />
          回答内容を友だち情報にも保存する
        </label>
      </section>
    </div>
  )
}
