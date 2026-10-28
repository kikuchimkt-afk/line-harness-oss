import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildMultiSheetXlsxWorkbook, buildXlsxWorkbook } from './xlsx-export'

describe('buildXlsxWorkbook', () => {
  it('creates a valid xlsx workbook with the requested rows', () => {
    const data = [
      ['イベント名', '予約日', '状態'],
      ['夏休み学習サポート', '2026/08/01', '確定'],
    ]

    const buffer = buildXlsxWorkbook(data)
    const signature = Array.from(new Uint8Array(buffer).slice(0, 4))
    const workbook = XLSX.read(buffer, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['予約一覧'], {
      header: 1,
      raw: false,
    })

    expect(signature).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(workbook.SheetNames).toEqual(['予約一覧'])
    expect(rows).toEqual(data)
  })

  it('creates multiple sheets and makes duplicate names unique', () => {
    const buffer = buildMultiSheetXlsxWorkbook([
      { name: '予約/一覧', rows: [['イベント名'], ['英検3級']] },
      { name: '予約/一覧', rows: [['イベント名'], ['英検2級']] },
    ])
    const workbook = XLSX.read(buffer, { type: 'array' })

    expect(workbook.SheetNames).toEqual(['予約_一覧', '予約_一覧_2'])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets['予約_一覧_2'], {
        header: 1,
        raw: false,
      }),
    ).toEqual([['イベント名'], ['英検2級']])
  })
})
