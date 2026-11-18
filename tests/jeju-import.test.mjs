import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateObservations } from '../lib/jeju/aggregate.ts'
import { previewObservations } from '../lib/jeju/preview-data.ts'
import { mergeImportRows, prepareImport } from '../lib/jeju/import-validation.ts'
import { buildProviderRequestUrl, fetchProviderRows } from '../lib/jeju/provider-url.ts'
import { sanitizeProviderFailureReason } from '../lib/jeju/safe-errors.ts'

const validRows = [
  { districtType: '제주시', userType: '내국인', dtYearMonth: '2017-11', dtWeek: '토요일', useCount: '13502' },
  { districtType: '제주시', userType: '내국인', dtYearMonth: '2017-11', dtWeek: '일요일', useCount: '13214' },
]

test('redacts project credentials and project-key proxy URLs from failure messages', () => {
  const projectKey = 'private-test-project-key'
  const reason = sanitizeProviderFailureReason(
    `request failed at https://open.jejudatahub.net/api/proxy/608/${projectKey}?page=1`,
    undefined,
    projectKey,
  )

  assert.equal(reason.includes(projectKey), false)
  assert.equal(reason.includes('/api/proxy/608/'), false)
})

test('builds the official project-key path and exact query names', () => {
  const requestUrl = buildProviderRequestUrl(
    'https://open.jejudatahub.net/api/proxy/608',
    'test-project-key',
    2,
    { limit: 100, filters: { districtType: '제주시', userType: '내국인', dtWeek: '토요일' } },
  )

  assert.equal(requestUrl.pathname, '/api/proxy/608/test-project-key')
  assert.deepEqual(Object.fromEntries(requestUrl.searchParams), {
    startDate: '201609',
    endDate: '201711',
    number: '2',
    limit: '100',
    districtType: '제주시',
    userType: '내국인',
    dtWeek: '토요일',
  })
  assert.equal(requestUrl.searchParams.has('startMonth'), false)
  assert.equal(requestUrl.searchParams.has('endMonth'), false)
  assert.equal(requestUrl.searchParams.has('page'), false)
})

test('requests paginated official JSON and validates hasMore against totCnt', async () => {
  const requests = []
  const pages = [
    { totCnt: 3, hasMore: true, data: [{ id: 1 }, { id: 2 }] },
    { totCnt: 3, hasMore: false, data: [{ id: 3 }] },
  ]
  const rows = await fetchProviderRows('https://open.jejudatahub.net/api/proxy/608', 'test-project-key', {
    limit: 2,
    filters: { districtType: '제주시', userType: '내국인', dtWeek: '토요일' },
    fetcher: async (input, init) => {
      requests.push({ url: new URL(String(input)), init })
      return new Response(JSON.stringify(pages[requests.length - 1]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(rows.length, 3)
  assert.deepEqual(requests.map(({ url }) => url.searchParams.get('number')), ['1', '2'])
  assert.equal(requests[0].url.searchParams.get('limit'), '2')
  assert.equal(requests[0].url.searchParams.get('districtType'), '제주시')
  assert.equal(requests[0].url.searchParams.get('userType'), '내국인')
  assert.equal(requests[0].url.searchParams.get('dtWeek'), '토요일')
  assert.equal(new Headers(requests[0].init.headers).has('authorization'), false)
})

test('rejects inconsistent official pagination metadata before applying rows', async () => {
  const pages = [
    { totCnt: 2, hasMore: true, data: [{ id: 1 }] },
    { totCnt: 3, hasMore: false, data: [{ id: 2 }] },
  ]

  await assert.rejects(
    fetchProviderRows('https://open.jejudatahub.net/api/proxy/608', 'test-project-key', {
      limit: 1,
      fetcher: async () => new Response(JSON.stringify(pages.shift()), { status: 200 }),
    }),
    /페이지 간 totCnt가 달라/,
  )

  await assert.rejects(
    fetchProviderRows('https://open.jejudatahub.net/api/proxy/608', 'test-project-key', {
      limit: 2,
      fetcher: async () => new Response(JSON.stringify({ totCnt: 2, hasMore: false, data: [{ id: 1 }] }), { status: 200 }),
    }),
    /hasMore와 누적 행 수가 일치하지 않아/,
  )
})

test('accepts flat JSON, data arrays, nested responses, and CSV files', () => {
  const flat = prepareImport(JSON.stringify(validRows))
  const data = prepareImport(JSON.stringify({ data: validRows }))
  const responses = prepareImport(JSON.stringify({ responses: [{ response: { data: validRows } }] }))
  const csv = prepareImport('districtType,userType,dtYearMonth,dtWeek,useCount\n제주시,내국인,2017-11,토요일,13502\n제주시,내국인,2017-11,일요일,13214')

  for (const imported of [flat, data, responses, csv]) {
    assert.equal(imported.summary.canApply, true)
    assert.equal(imported.summary.validRowCount, 2)
    assert.deepEqual(imported.summary.completeMonths[0].months, ['2017-11'])
  }
})

test('rejects duplicate and invalid records and preserves existing rows on failure', () => {
  const baseline = [...previewObservations]
  const imported = prepareImport(JSON.stringify([
    ...validRows,
    validRows[0],
    { districtType: '잘못된 지역', userType: '내국인', dtYearMonth: '2017-12', dtWeek: '금요일', useCount: '-1' },
  ]))

  const before = aggregateObservations(baseline, {
    districtType: '제주시',
    userType: '내국인',
    startMonth: '2017-11',
    endMonth: '2017-11',
  })
  const afterRows = mergeImportRows(baseline, imported)
  const after = aggregateObservations(afterRows, {
    districtType: '제주시',
    userType: '내국인',
    startMonth: '2017-11',
    endMonth: '2017-11',
  })

  assert.equal(imported.summary.canApply, false)
  assert.equal(imported.summary.invalidRows.length, 1)
  assert.equal(imported.summary.duplicateRows.length, 2)
  assert.equal(afterRows, baseline)
  assert.deepEqual(after, before)
})

test('merges a partial month without dropping observations from other months', () => {
  const baseline = [...previewObservations]
  const imported = prepareImport(JSON.stringify([
    { districtType: '제주시', userType: '내국인', dtYearMonth: '2017-11', dtWeek: '토요일', useCount: '14000' },
  ]))
  const merged = mergeImportRows(baseline, imported)

  assert.equal(imported.summary.canApply, true)
  assert.equal(imported.summary.fullOfficialCoverage, false)
  assert.equal(merged.some((row) => row.dtYearMonth === '2016-09'), true)
  assert.equal(merged.find((row) => row.districtType === '제주시' && row.userType === '내국인' && row.dtYearMonth === '2017-11' && row.dtWeek === '토요일')?.useCount, '14000')
  assert.equal(merged.find((row) => row.districtType === '제주시' && row.userType === '내국인' && row.dtYearMonth === '2017-11' && row.dtWeek === '일요일')?.useCount, '13214')
})

test('includes all 15 months for both districts and visitor types', () => {
  for (const districtType of ['제주시', '서귀포시']) {
    for (const userType of ['내국인', '중국인']) {
      const comparison = aggregateObservations(previewObservations, {
        districtType,
        userType,
        startMonth: '2016-09',
        endMonth: '2017-11',
      })

      assert.equal(comparison.rows.length, 15, `${districtType} ${userType}`)
      assert.equal(comparison.rows[0].month, '2016-09')
      assert.equal(comparison.rows[14].month, '2017-11')
    }
  }
})

test('matches the April 2017 Jeju domestic weekend totals', () => {
  const comparison = aggregateObservations(previewObservations, {
    districtType: '제주시',
    userType: '내국인',
    startMonth: '2017-04',
    endMonth: '2017-04',
  })

  assert.equal(comparison.rows.length, 1)
  assert.equal(comparison.saturdayTotal, 16759)
  assert.equal(comparison.sundayTotal, 16694)
  assert.equal(comparison.difference, 65)
})

test('keeps the November 2017 Jeju domestic Saturday comparison at +288', () => {
  const comparison = aggregateObservations(previewObservations, {
    districtType: '제주시',
    userType: '내국인',
    startMonth: '2017-11',
    endMonth: '2017-11',
  })

  assert.equal(comparison.difference, 288)
  assert.equal(comparison.rows[0].saturday, 13502)
  assert.equal(comparison.rows[0].sunday, 13214)
})
