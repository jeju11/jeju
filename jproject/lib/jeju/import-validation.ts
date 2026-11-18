import { OFFICIAL_PERIOD, normalizeMonth } from './aggregate.ts'
import type { Observation } from './types.ts'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 100_000

export type ImportIssue = { rowNumber: number; reason: string }
export type CompleteMonthGroup = {
  districtType: string
  userType: string
  months: string[]
}
export type ImportSummary = {
  totalRows: number
  validRowCount: number
  invalidRows: ImportIssue[]
  duplicateRows: ImportIssue[]
  observedStart: string | null
  observedEnd: string | null
  observedMonthCount: number
  completeMonths: CompleteMonthGroup[]
  fullOfficialCoverage: boolean
  canApply: boolean
}
export type PreparedImport = { rows: Observation[]; summary: ImportSummary }

type ImportRecord = { rowNumber: number; value: unknown }

export class ImportFormatError extends Error {}

function parseCsvRecords(text: string): ImportRecord[] {
  const records: ImportRecord[] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let lineNumber = 1
  let recordStartLine = 2

  const finishRecord = () => {
    record.push(field)
    if (record.some((cell) => cell.trim())) {
      records.push({
        rowNumber: recordStartLine,
        value: Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])),
      })
    }
    record = []
    field = ''
    recordStartLine = lineNumber + 1
  }

  const firstLineEnd = text.search(/\r?\n/)
  const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)
  const headers: string[] = []
  let headerField = ''
  let headerQuoted = false
  for (let index = 0; index < headerLine.length; index += 1) {
    const char = headerLine[index]
    if (headerQuoted && char === '"' && headerLine[index + 1] === '"') {
      headerField += '"'
      index += 1
    } else if (char === '"') {
      headerQuoted = !headerQuoted
    } else if (char === ',' && !headerQuoted) {
      headers.push(headerField.trim())
      headerField = ''
    } else {
      headerField += char
    }
  }
  if (headerQuoted) throw new ImportFormatError('CSV 머리글의 따옴표가 닫히지 않았어요.')
  headers.push(headerField.trim())
  headers[0] = headers[0].replace(/^\uFEFF/, '').trim()
  if (!headers.length || headers.some((header) => !header)) {
    throw new ImportFormatError('CSV 머리글에 비어 있는 열 이름이 있어요.')
  }
  if (new Set(headers).size !== headers.length) {
    throw new ImportFormatError('CSV 머리글에 중복된 열 이름이 있어요.')
  }
  if (firstLineEnd === -1) return []

  let index = firstLineEnd + (text[firstLineEnd] === '\r' && text[firstLineEnd + 1] === '\n' ? 2 : 1)
  lineNumber = 2
  recordStartLine = 2

  for (; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (char === '"') {
      if (!quoted && field.length > 0) throw new ImportFormatError(`CSV ${lineNumber}행의 따옴표 위치가 올바르지 않아요.`)
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      record.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      finishRecord()
      lineNumber += 1
      recordStartLine = lineNumber
    } else {
      field += char
      if (char === '\n') lineNumber += 1
    }
  }

  if (quoted) throw new ImportFormatError(`CSV ${recordStartLine}행의 따옴표가 닫히지 않았어요.`)
  if (field.length || record.length) finishRecord()
  return records
}

export function extractJsonRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') {
    throw new ImportFormatError('JSON은 배열 또는 데이터 배열을 포함한 객체여야 해요.')
  }

  const root = value as Record<string, unknown>
  if (Array.isArray(root.data)) return root.data
  if (Array.isArray(root.rows)) return root.rows
  if (Array.isArray(root.result)) return root.result
  const nestedData = root.data && typeof root.data === 'object'
    ? root.data as Record<string, unknown>
    : null
  if (Array.isArray(nestedData?.rows)) return nestedData.rows
  if (Array.isArray(nestedData?.items)) return nestedData.items
  const response = root.response && typeof root.response === 'object'
    ? root.response as Record<string, unknown>
    : null
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(root.responses)) {
    const rows: unknown[] = []
    for (const [index, entry] of root.responses.entries()) {
      const response = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).response : null
      const data = response && typeof response === 'object' ? (response as Record<string, unknown>).data : null
      if (!Array.isArray(data)) {
        throw new ImportFormatError(`responses ${index + 1}번째 항목에 response.data 배열이 없어요.`)
      }
      rows.push(...data)
    }
    return rows
  }
  throw new ImportFormatError('JSON에서 지원하는 데이터 배열을 찾을 수 없어요.')
}

function parseImportRecords(content: string): ImportRecord[] {
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
    throw new ImportFormatError('파일은 10MB 이하만 가져올 수 있어요.')
  }
  const trimmed = content.trim()
  if (!trimmed) throw new ImportFormatError('가져올 파일이 비어 있어요.')

  let records: ImportRecord[]
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new ImportFormatError('JSON 파일을 해석할 수 없어요.')
    }
    records = extractJsonRows(parsed).map((value, index) => ({ rowNumber: index + 1, value }))
  } else {
    records = parseCsvRecords(trimmed)
  }

  if (records.length > MAX_IMPORT_ROWS) {
    throw new ImportFormatError('파일은 100,000행 이하만 가져올 수 있어요.')
  }
  return records
}

function asText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function canonicalDistrict(value: string) {
  const normalized = value.replaceAll(/\s/g, '')
  if (normalized.includes('제주시')) return '제주시'
  if (normalized.includes('서귀포')) return '서귀포시'
  return null
}

function canonicalUser(value: string) {
  const normalized = value.replaceAll(/\s/g, '').toLowerCase()
  if (normalized.includes('중국')) return '중국인'
  if (normalized.includes('내국인') || normalized.includes('domestic')) return '내국인'
  return null
}

function canonicalWeekday(value: string) {
  const normalized = value.toLowerCase().replaceAll(/\s/g, '')
  if (['토요일', '토', 'sat', 'saturday', '6'].includes(normalized)) return '토요일'
  if (['일요일', '일', 'sun', 'sunday', '7', '0'].includes(normalized)) return '일요일'
  return null
}

function canonicalCount(value: unknown) {
  let normalized = asText(value)
  if (/^\d{1,3}(,\d{3})+$/.test(normalized)) normalized = normalized.replaceAll(',', '')
  if (!/^(0|[1-9]\d*)$/.test(normalized)) return null
  const count = Number(normalized)
  return Number.isSafeInteger(count) ? String(count) : null
}

export function observationKey(row: Observation) {
  if (!row.districtType || !row.userType || !row.dtYearMonth || !row.dtWeek) return null
  return [row.districtType, row.userType, row.dtYearMonth, row.dtWeek].join('\u001f')
}

export function mergeObservationRows(existing: Observation[], incoming: Observation[]) {
  const incomingKeys = new Set(incoming.map(observationKey).filter((key): key is string => key !== null))
  const preserved = existing.filter((row) => {
    const key = observationKey(row)
    return key === null || !incomingKeys.has(key)
  })
  return [...preserved, ...incoming]
}

export function mergeImportRows(existing: Observation[], imported: PreparedImport) {
  if (!imported.summary.canApply) return existing
  return mergeObservationRows(existing, imported.rows)
}

function monthSequence(start: string, end: string) {
  const result: string[] = []
  let year = Number(start.slice(0, 4))
  let month = Number(start.slice(5, 7))
  const endYear = Number(end.slice(0, 4))
  const endMonth = Number(end.slice(5, 7))
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
  }
  return result
}

function validateRecords(records: ImportRecord[]): PreparedImport {
  const invalidRows: ImportIssue[] = []
  const normalizedRows: Array<{ rowNumber: number; row: Observation }> = []
  const requiredFields = ['districtType', 'userType', 'dtYearMonth', 'dtWeek', 'useCount']

  for (const record of records) {
    if (!record.value || typeof record.value !== 'object' || Array.isArray(record.value)) {
      invalidRows.push({ rowNumber: record.rowNumber, reason: '행은 필드가 있는 객체여야 해요.' })
      continue
    }

    const source = record.value as Record<string, unknown>
    const missing = requiredFields.filter((field) => !Object.hasOwn(source, field))
    const districtType = canonicalDistrict(asText(source.districtType))
    const userType = canonicalUser(asText(source.userType))
    const dtYearMonth = normalizeMonth(asText(source.dtYearMonth))
    const dtWeek = canonicalWeekday(asText(source.dtWeek))
    const useCount = canonicalCount(source.useCount)
    const reasons = [
      missing.length ? `필수 필드 누락(${missing.join(', ')})` : null,
      !districtType ? 'districtType은 제주시 또는 서귀포시여야 해요.' : null,
      !userType ? 'userType은 내국인 또는 중국인이어야 해요.' : null,
      !dtYearMonth ? 'dtYearMonth는 YYYY-MM 또는 YYYYMM 형식이어야 해요.' : null,
      dtYearMonth && (dtYearMonth < OFFICIAL_PERIOD.start || dtYearMonth > OFFICIAL_PERIOD.end)
        ? `관측월은 ${OFFICIAL_PERIOD.start}~${OFFICIAL_PERIOD.end} 범위여야 해요.`
        : null,
      !dtWeek ? 'dtWeek는 토요일 또는 일요일이어야 해요.' : null,
      useCount === null ? 'useCount는 0 이상의 정수여야 해요.' : null,
    ].filter((reason): reason is string => Boolean(reason))

    if (reasons.length || !districtType || !userType || !dtYearMonth || !dtWeek || useCount === null) {
      invalidRows.push({ rowNumber: record.rowNumber, reason: reasons.join(' ') })
      continue
    }

    const rawPayload = { districtType, userType, dtYearMonth, dtWeek, useCount }
    normalizedRows.push({
      rowNumber: record.rowNumber,
      row: { ...rawPayload, rawPayload },
    })
  }

  const groups = new Map<string, Array<{ rowNumber: number; row: Observation }>>()
  for (const entry of normalizedRows) {
    const key = observationKey(entry.row)!
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const duplicateRows: ImportIssue[] = []
  const rows: Observation[] = []
  for (const group of groups.values()) {
    if (group.length > 1) {
      duplicateRows.push(...group.map(({ rowNumber }) => ({ rowNumber, reason: '같은 지역·관광객·월·요일 관측이 중복돼요.' })))
    } else {
      rows.push(group[0].row)
    }
  }
  duplicateRows.sort((a, b) => a.rowNumber - b.rowNumber)

  const distinctMonths = [...new Set(rows.map((row) => row.dtYearMonth).filter((month): month is string => Boolean(month)))].sort()
  const observedStart = distinctMonths[0] ?? null
  const observedEnd = distinctMonths.at(-1) ?? null
  const completeMonthMap = new Map<string, Set<string>>()
  const keySet = new Set<string>()
  for (const row of rows) {
    if (!row.districtType || !row.userType || !row.dtYearMonth || !row.dtWeek) continue
    const selection = `${row.districtType}\u001f${row.userType}`
    const monthKey = `${selection}\u001f${row.dtYearMonth}`
    const weekdays = completeMonthMap.get(monthKey) ?? new Set<string>()
    weekdays.add(row.dtWeek)
    completeMonthMap.set(monthKey, weekdays)
    keySet.add(observationKey(row)!)
  }

  const completeMonthGroups = new Map<string, string[]>()
  for (const [monthKey, weekdays] of completeMonthMap) {
    if (!weekdays.has('토요일') || !weekdays.has('일요일')) continue
    const [districtType, userType, month] = monthKey.split('\u001f')
    const selection = `${districtType}\u001f${userType}`
    completeMonthGroups.set(selection, [...(completeMonthGroups.get(selection) ?? []), month])
  }

  const completeMonths = [...completeMonthGroups.entries()]
    .map(([selection, months]) => {
      const [districtType, userType] = selection.split('\u001f')
      return { districtType, userType, months: months.sort() }
    })
    .sort((a, b) => `${a.districtType}${a.userType}`.localeCompare(`${b.districtType}${b.userType}`, 'ko'))

  const officialMonths = monthSequence(OFFICIAL_PERIOD.start, OFFICIAL_PERIOD.end)
  const fullOfficialCoverage = invalidRows.length === 0 && duplicateRows.length === 0 && officialMonths.every((month) =>
    ['제주시', '서귀포시'].every((district) => ['내국인', '중국인'].every((user) => ['토요일', '일요일'].every((weekday) =>
      keySet.has([district, user, month, weekday].join('\u001f')),
    ))),
  )

  return {
    rows,
    summary: {
      totalRows: records.length,
      validRowCount: rows.length,
      invalidRows,
      duplicateRows,
      observedStart,
      observedEnd,
      observedMonthCount: distinctMonths.length,
      completeMonths,
      fullOfficialCoverage,
      canApply: records.length > 0 && invalidRows.length === 0 && duplicateRows.length === 0,
    },
  }
}

export function prepareImport(content: string): PreparedImport {
  return validateRecords(parseImportRecords(content))
}

export function validateApiRows(rows: unknown[]): PreparedImport {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFormatError('응답 행이 100,000개를 넘어 갱신을 중단했어요.')
  }
  return validateRecords(rows.map((value, index) => ({ rowNumber: index + 1, value })))
}

export function parseCsvRows(text: string) {
  return parseCsvRecords(text).map((record) => record.value)
}
