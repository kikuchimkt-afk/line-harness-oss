import * as XLSX from 'xlsx'

export type SpreadsheetCell = string | number | boolean | null | undefined

function displayWidth(value: SpreadsheetCell): number {
  return Array.from(String(value ?? '')).reduce(
    (width, character) => width + (character.charCodeAt(0) > 0xff ? 2 : 1),
    0,
  )
}

export function buildXlsxWorkbook(
  rows: SpreadsheetCell[][],
  sheetName = '予約一覧',
): ArrayBuffer {
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

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  }) as ArrayBuffer
}
