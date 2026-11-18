import { OFFICIAL_PERIOD } from './aggregate.ts'

const PAGE_LIMIT = 100
const MAX_TOTAL_ROWS = 100_000

type ProviderFilters = {
  districtType?: string
  userType?: string
  dtWeek?: string
}

type ProviderPage = {
  totalCount: number
  hasMore: boolean
  rows: Record<string, unknown>[]
}

export function buildProviderRequestUrl(
  endpoint: string,
  projectKey: string,
  number: number,
  options: { limit?: number; filters?: ProviderFilters } = {},
) {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.hostname !== 'open.jejudatahub.net') {
    throw new Error('608 데이터 주소는 공식 HTTPS API 호스트여야 해요.')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 3 || segments[0] !== 'api' || segments[1] !== 'proxy') {
    throw new Error('608 데이터 주소는 공식 /api/proxy/{데이터주소} 형식이어야 해요.')
  }
  if (!projectKey.trim()) throw new Error('608 프로젝트 키가 설정되지 않았어요.')
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('608 페이지 번호는 1부터 시작해야 해요.')
  }

  const limit = options.limit ?? PAGE_LIMIT
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_LIMIT) {
    throw new Error('608 페이지당 행 수는 1~100 사이여야 해요.')
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(projectKey)}`
  url.search = ''
  url.hash = ''
  url.searchParams.set('startDate', OFFICIAL_PERIOD.start.replace('-', ''))
  url.searchParams.set('endDate', OFFICIAL_PERIOD.end.replace('-', ''))
  url.searchParams.set('number', String(number))
  url.searchParams.set('limit', String(limit))
  for (const key of ['districtType', 'userType', 'dtWeek'] as const) {
    const value = options.filters?.[key]
    if (value) url.searchParams.set(key, value)
  }
  return url
}

function parseTotalCount(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

function parseProviderPage(body: string): ProviderPage {
  if (/web firewall security policies|request\s*\/\s*response.*blocked/i.test(body)) {
    throw new Error('제주데이터허브 웹 방화벽이 요청을 차단했어요. 접근 권한 또는 제공처 정책을 확인해 주세요.')
  }
  if (/^\s*<(?:!doctype\s+html|html)\b/i.test(body)) {
    throw new Error('제주데이터허브에서 JSON 대신 HTML 응답을 받았어요. 접근 권한 또는 제공처 정책을 확인해 주세요.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('제주데이터허브 응답을 JSON으로 해석할 수 없어요.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('제주데이터허브 응답 구조가 올바르지 않아요.')
  }

  const value = parsed as Record<string, unknown>
  const totalCount = parseTotalCount(value.totCnt)
  if (totalCount === null) throw new Error('제주데이터허브 응답의 totCnt가 올바르지 않아요.')
  if (typeof value.hasMore !== 'boolean') {
    throw new Error('제주데이터허브 응답의 hasMore가 올바르지 않아요.')
  }
  if (!Array.isArray(value.data)) {
    throw new Error('제주데이터허브 응답에 data 배열이 없어요.')
  }
  if (value.data.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('제주데이터허브 data에는 관측 객체만 포함할 수 있어요.')
  }

  return { totalCount, hasMore: value.hasMore, rows: value.data as Record<string, unknown>[] }
}

export async function fetchProviderRows(
  endpoint: string,
  projectKey: string,
  options: { filters?: ProviderFilters; limit?: number; fetcher?: typeof fetch } = {},
) {
  const limit = options.limit ?? PAGE_LIMIT
  const fetcher = options.fetcher ?? fetch
  const allRows: Record<string, unknown>[] = []
  let expectedTotal: number | null = null
  let number = 1

  while (number <= MAX_TOTAL_ROWS) {
    const response = await fetcher(buildProviderRequestUrl(endpoint, projectKey, number, { limit, filters: options.filters }), {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`제주데이터허브 요청이 HTTP ${response.status} 응답으로 거절됐어요. 접근 권한 또는 제공처 정책을 확인해 주세요.`)
    }

    const page = parseProviderPage(await response.text())
    if (page.totalCount > MAX_TOTAL_ROWS) {
      throw new Error('제주데이터허브 totCnt가 100,000행 한도를 넘어 갱신을 중단했어요.')
    }
    if (expectedTotal !== null && expectedTotal !== page.totalCount) {
      throw new Error('제주데이터허브 페이지 간 totCnt가 달라 갱신을 중단했어요.')
    }
    expectedTotal = page.totalCount
    if (page.rows.length > limit) {
      throw new Error('제주데이터허브 페이지가 요청한 limit보다 많은 행을 반환했어요.')
    }

    allRows.push(...page.rows)
    if (allRows.length > page.totalCount) {
      throw new Error('제주데이터허브 누적 행 수가 totCnt를 초과해 갱신을 중단했어요.')
    }
    const expectedHasMore = allRows.length < page.totalCount
    if (page.hasMore !== expectedHasMore) {
      throw new Error('제주데이터허브 hasMore와 누적 행 수가 일치하지 않아 갱신을 중단했어요.')
    }
    if (!page.hasMore) break
    if (number >= Math.ceil(page.totalCount / limit)) {
      throw new Error('제주데이터허브 페이지 순회가 totCnt 범위를 넘어 갱신을 중단했어요.')
    }
    number += 1
  }

  if (expectedTotal === null || allRows.length !== expectedTotal) {
    throw new Error('제주데이터허브 응답 행 수가 totCnt와 일치하지 않아 갱신을 중단했어요.')
  }
  if (!allRows.length) throw new Error('가져온 관측 행이 없습니다.')
  return allRows
}
