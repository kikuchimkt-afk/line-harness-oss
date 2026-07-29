import * as XLSX from 'xlsx'

export type SpreadsheetCell = string | number | boolean | null | undefined

export interface SpreadsheetSheet {
  name: string
  rows: SpreadsheetCell[][]
}

function displayWidth(value: SpreadsheetCell): number {
  return Array.from(String(value ?? '')).reduce(
    (width, character) => width + (character.charCodeAt(0) > 0xff ? 2 : 1),
    0,
  )
}

function createWorksheet(rows: SpreadsheetCell[][]): XLSX.WorkSheet {
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)

  worksheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => ({
    wch: Math.min(
      60,
      Math.max(10, ...rows.map((row) => displayWidth(row[columnIndex]) + 2)),
    ),
  }))

  if (worksheet['!ref'] && rows.length > 1) {
    const range = XLSX.utils.decode_range(worksheet['!ref'])
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: range.s.c },
        e: { r: 0, c: range.e.c },
      }),
    }
  }

  return worksheet
}

function safeSheetName(name: string, usedNames: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, '_').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate)) {
    const marker = `_${suffix}`
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`
    suffix += 1
  }
  usedNames.add(candidate)
  return candidate
}

export function buildMultiSheetXlsxWorkbook(sheets: SpreadsheetSheet[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const targets = sheets.length > 0 ? sheets : [{ name: 'Sheet', rows: [[]] }]
  for (const sheet of targets) {
    XLSX.utils.book_append_sheet(
      workbook,
      createWorksheet(sheet.rows),
      safeSheetName(sheet.name, usedNames),
    )
  }

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  }) as ArrayBuffer
}

export function buildXlsxWorkbook(
  rows: SpreadsheetCell[][],
  sheetName = '予約一覧',
): ArrayBuffer {
  return buildMultiSheetXlsxWorkbook([{ name: sheetName, rows }])
}
