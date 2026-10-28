import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildFormSubmissionRows,
  buildFormSubmissionsXlsx,
  safeXlsxFileName,
} from './submission-xlsx-export'

const fields = [
  { name: 'q1', label: '受講者氏名' },
  { name: 'q2', label: '受講区分' },
]

const submissions = [
  {
    id: 'submission-1',
    friendId: 'U123',
    friendName: '保護者A',
    data: {
      q2: 'ベストワン登録生',
      q1: '受講者A',
      preferredDates: ['9月1日', '9月4日'],
    },
    createdAt: '2026-08-22T13:34:00.000Z',
  },
]

describe('form submission Excel export', () => {
  it('exports every answer in form order and keeps extra fields', () => {
    expect(buildFormSubmissionRows(fields, submissions)).toEqual([
      ['回答ID', '回答者名', 'LINEユーザーID', '送信日時', '受講者氏名', '受講区分', 'preferredDates'],
      ['submission-1', '保護者A', 'U123', '2026/08/22 22:34', '受講者A', 'ベストワン登録生', '9月1日、9月4日'],
    ])
  })

  it('creates a readable xlsx workbook', () => {
    const buffer = buildFormSubmissionsXlsx(fields, submissions)
    const signature = Array.from(new Uint8Array(buffer).slice(0, 4))
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets['申込データ']
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

    expect(signature).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(workbook.SheetNames).toEqual(['申込データ'])
    expect(rows).toEqual(buildFormSubmissionRows(fields, submissions))
    expect(worksheet['!autofilter']?.ref).toBe('A1:G2')
  })

  it('sanitizes filenames for Windows and Excel users', () => {
    expect(safeXlsxFileName('英検/集中:講座*申込')).toBe('英検_集中_講座_申込')
    expect(safeXlsxFileName('   ')).toBe('フォーム')
  })
})
