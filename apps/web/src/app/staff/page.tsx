'use client'
import { useState, useEffect } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'
import type { ApiResponse } from '@line-crm/shared'
import type { StaffMember } from '@line-crm/shared'
import type { LineAccount } from '@line-crm/shared'

type StaffRole = 'owner' | 'admin' | 'staff'
type AccountOption = LineAccount & {
  displayName?: string | null
  basicId?: string | null
  pictureUrl?: string | null
}
type NewApiKey = {
  apiKey: string
  staffId: string
  staffName: string
  role: StaffRole
  lineAccountIds: string[]
  kind: 'created' | 'regenerated'
}

function getRoleLabel(role: string) {
  return role === 'owner' ? 'オーナー' : role === 'admin' ? '管理者' : 'スタッフ'
}

function RoleBadge({ role }: { role: string }) {
  const styles =
    role === 'owner'
      ? 'bg-yellow-100 text-yellow-800'
      : role === 'admin'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-gray-100 text-gray-600'
  const label = getRoleLabel(role)
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {label}
    </span>
  )
}

function maskKey(key: string): string {
  if (!key || key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New API key banner
  const [newKey, setNewKey] = useState<NewApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [guideCopied, setGuideCopied] = useState(false)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<'admin' | 'staff'>('staff')
  const [formAccountIds, setFormAccountIds] = useState<string[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const accountNameById = new Map(accounts.map((account) => [
    account.id,
    account.displayName || account.name,
  ]))

  const accountNamesFor = (lineAccountIds: string[]) => {
    if (lineAccountIds.length === 0) return 'すべてのアカウント'
    return lineAccountIds
      .map((id) => accountNameById.get(id) ?? id.slice(0, 8))
      .join('、')
  }

  const loadMembers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResponse<StaffMember[]>>('/api/staff')
      if (res.success) {
        setMembers(res.data)
      } else {
        setError(res.error ?? 'スタッフの読み込みに失敗しました')
      }
    } catch {
      setError('スタッフの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const loadAccounts = async () => {
    try {
      const res = await fetchApi<ApiResponse<AccountOption[]>>('/api/line-accounts')
      if (res.success) {
        setAccounts(res.data)
        setFormAccountIds((current) => {
          const validIds = new Set(res.data.map((account) => account.id))
          return current.filter((id) => validIds.has(id))
        })
      }
    } catch {
      // Staff creation still shows a validation error if accounts cannot load.
    }
  }

  useEffect(() => {
    loadMembers()
    loadAccounts()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormLoading(true)
    setFormError('')
    try {
      if (formAccountIds.length === 0) {
        setFormError('担当するLINEアカウントを1つ以上選択してください')
        return
      }
      const body: { name: string; role: 'admin' | 'staff'; email?: string; lineAccountIds: string[] } = {
        name: formName,
        role: formRole,
        lineAccountIds: formAccountIds,
      }
      if (formEmail) body.email = formEmail

      const res = await fetchApi<ApiResponse<StaffMember & { apiKey?: string }>>('/api/staff', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.success) {
        if (res.data.apiKey) {
          setNewKey({
            apiKey: res.data.apiKey,
            staffId: res.data.id,
            staffName: res.data.name,
            role: res.data.role as StaffRole,
            lineAccountIds: res.data.lineAccountIds ?? formAccountIds,
            kind: 'created',
          })
        }
        setFormName('')
        setFormEmail('')
        setFormRole('staff')
        setFormAccountIds([])
        setShowForm(false)
        await loadMembers()
      } else {
        setFormError(res.error ?? '作成に失敗しました')
      }
    } catch {
      setFormError('作成に失敗しました')
    } finally {
      setFormLoading(false)
    }
  }

  const handleToggleActive = async (member: StaffMember) => {
    try {
      await fetchApi<ApiResponse<StaffMember>>(`/api/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      })
      await loadMembers()
    } catch {
      setError('更新に失敗しました')
    }
  }

  const handleRegenerateKey = async (member: StaffMember) => {
    if (!confirm(`${member.name} のAPIキーを再生成しますか？\n現在のキーは無効になります。`)) return
    try {
      const res = await fetchApi<ApiResponse<{ apiKey: string }>>(`/api/staff/${member.id}/regenerate-key`, {
        method: 'POST',
      })
      if (res.success) {
        setNewKey({
          apiKey: res.data.apiKey,
          staffId: member.id,
          staffName: member.name,
          role: member.role as StaffRole,
          lineAccountIds: member.lineAccountIds ?? [],
          kind: 'regenerated',
        })
        await loadMembers()
      } else {
        setError(res.error ?? 'キー再生成に失敗しました')
      }
    } catch {
      setError('キー再生成に失敗しました')
    }
  }

  const handleDelete = async (member: StaffMember) => {
    if (!confirm(`${member.name} を削除しますか？\nこの操作は元に戻せません。`)) return
    try {
      await fetchApi<ApiResponse<null>>(`/api/staff/${member.id}`, { method: 'DELETE' })
      await loadMembers()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleCopy = async () => {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey.apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const buildStaffGuideText = () => {
    if (!newKey) return ''
    const adminUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return [
      `${newKey.staffName}さん`,
      '',
      newKey.kind === 'regenerated'
        ? 'L Harnessのスタッフ用APIキーを再発行しました。'
        : 'L Harnessのスタッフ用ログイン情報です。',
      newKey.kind === 'regenerated' ? '以前のAPIキーは使えません。' : '',
      '',
      `管理画面URL：${adminUrl}`,
      `権限：${getRoleLabel(newKey.role)}`,
      `担当アカウント：${accountNamesFor(newKey.lineAccountIds)}`,
      '',
      'APIキー：',
      newKey.apiKey,
      '',
      '使い方：',
      '1. 管理画面URLを開く',
      '2. ログイン画面でAPIキーを貼り付ける',
      '3. ログイン後、必要なメニューを操作する',
      newKey.kind === 'regenerated'
        ? '※すでにログイン中の場合は、一度ログアウトしてから新しいAPIキーで入り直してください。'
        : '',
      '',
      '※このAPIキーは管理画面に入るための大切な情報です。',
      '※外部には共有せず、必要なスタッフだけで管理してください。',
    ].join('\n')
  }

  const handleCopyGuide = async () => {
    const text = buildStaffGuideText()
    if (!text) return
    await navigator.clipboard.writeText(text)
    setGuideCopied(true)
    setTimeout(() => setGuideCopied(false), 2000)
  }

  return (
    <div>
      <Header
        title="スタッフ管理"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + スタッフを追加
          </button>
        }
      />

      {/* New API key banner */}
      {newKey && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">
            {newKey.kind === 'regenerated' ? 'APIキーが再発行されました。' : 'APIキーが発行されました。'}
            このキーは一度しか表示されません。
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <code className="flex-1 text-xs bg-white border border-green-200 rounded px-3 py-2 font-mono break-all">
              {newKey.apiKey}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyGuide}
                className="shrink-0 px-3 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
              >
                {guideCopied ? '案内文コピー済み' : 'LINE用案内文をコピー'}
              </button>
              <button
                onClick={handleCopy}
                className="shrink-0 px-3 py-2 text-xs font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
              >
                {copied ? 'キーコピー済み' : 'APIキーだけコピー'}
              </button>
              <button
                onClick={() => setNewKey(null)}
                className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-green-100 bg-white/80 p-3 text-xs text-gray-600">
            <p className="mb-2 font-medium text-gray-700">LINEで送る内容の下書き</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed">
              {buildStaffGuideText()}
            </pre>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">新しいスタッフを追加</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">名前 *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="田中 太郎"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="taro@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ロール *</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'admin' | 'staff')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">担当アカウント *</label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    このスタッフが管理できるLINE公式アカウントを選びます。複数選択できます。
                  </p>
                </div>
                {accounts.length > 0 && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormAccountIds(accounts.map((account) => account.id))}
                      className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      全て選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormAccountIds([])}
                      className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      解除
                    </button>
                  </div>
                )}
              </div>
              {accounts.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  LINEアカウントを読み込めませんでした。画面を再読み込みしてください。
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts.map((account) => {
                    const checked = formAccountIds.includes(account.id)
                    const displayName = account.displayName || account.name
                    return (
                      <label
                        key={account.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          checked
                            ? 'border-rose-300 bg-rose-50 text-rose-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setFormAccountIds((current) =>
                              e.target.checked
                                ? [...current, account.id]
                                : current.filter((id) => id !== account.id),
                            )
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                        />
                        {account.pictureUrl && (
                          <img
                            src={account.pictureUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{displayName}</span>
                          {account.basicId && (
                            <span className="block truncate text-xs text-gray-400">{account.basicId}</span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={formLoading || !formName || formAccountIds.length === 0}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                {formLoading ? '作成中...' : '作成'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-100 rounded w-48" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-5 bg-gray-100 rounded w-24" />
              <div className="h-8 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">スタッフがいません。「+ スタッフを追加」から追加してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">名前</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">メール</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ロール</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">担当アカウント</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">APIキー</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状態</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{member.name}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{member.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={member.role} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    <span className="line-clamp-2 text-xs">
                      {accountNamesFor(member.lineAccountIds ?? [])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">
                    {maskKey(member.apiKey ?? '')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${member.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {member.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {member.role !== 'owner' && (
                        <>
                          <button
                            onClick={() => handleToggleActive(member)}
                            className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                          >
                            {member.isActive ? '無効化' : '有効化'}
                          </button>
                          <button
                            onClick={() => handleRegenerateKey(member)}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                          >
                            キー再生成
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
