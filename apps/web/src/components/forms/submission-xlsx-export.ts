import { buildXlsxWorkbook } from '../events/xlsx-export'

export interface FormExportField {
  name: string
  label: string
}

export interface FormExportSubmission {
  id: string
  friendId: string | null
  friendName?: string | null
  data: Record<string, unknown>
  createdAt: string
}

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.map(formatAnswer).filter(Boolean).join('、')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatJstDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`
}

export function buildFormSubmissionRows(
  fields: FormExportField[],
  submissions: FormExportSubmission[],
): Array<Array<string>> {
  const fieldNames = fields.map((field) => field.name)
  const knownNames = new Set(fieldNames)
  const extraNames = [
    ...new Set(
      submissions.flatMap((submission) =>
        Object.keys(submission.data).filter((name) => !knownNames.has(name)),
      ),
    ),
  ]
  const exportNames = [...fieldNames, ...extraNames]
  const labels = new Map(fields.map((field) => [field.name, field.label]))

  return [
    [
      '回答ID',
      '回答者名',
      'LINEユーザーID',
      '送信日時',
      ...exportNames.map((name) => labels.get(name) || name),
    ],
    ...submissions.map((submission) => [
      submission.id,
      submission.friendName || '',
      submission.friendId || '',
      formatJstDateTime(submission.createdAt),
      ...exportNames.map((name) => formatAnswer(submission.data[name])),
    ]),
  ]
}

export function buildFormSubmissionsXlsx(
  fields: FormExportField[],
  submissions: FormExportSubmission[],
): ArrayBuffer {
  return buildXlsxWorkbook(buildFormSubmissionRows(fields, submissions), '申込データ')
}

export function safeXlsxFileName(value: string): string {
  const safe = value.replace(/[\\/:*?"<>|]/g, '_').trim()
  return safe || 'フォーム'
}
