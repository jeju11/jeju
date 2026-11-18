import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRequest } from '../lib/jeju/service.ts'
import { AnalysisInputError, executeAnalysis, planLocally, readAnalysisRequest } from '../lib/jeju/analysis.ts'
import { decodeToolPlan, planWithAgent } from '../lib/jeju/agent.ts'
import { aggregateObservations } from '../lib/jeju/aggregate.ts'
import { previewObservations, previewMetadata } from '../lib/jeju/preview-data.ts'

const filters = { districtType: '제주시', userType: '내국인', startMonth: '2017-11', endMonth: '2017-11' }
const dataset = { observations: previewObservations, metadata: previewMetadata }
const withoutAI = request => planWithAgent(request, { apiKey: '' })
const analyze = (body, data = dataset) => analyzeRequest(body, data, withoutAI)
const context = { filters, intent: 'compare', districtTypes: ['제주시'], userTypes: ['내국인'] }
const toolPayload = (name, args) => ({ choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }] })
const toolArgs = { districtTypes: ['제주시'], userTypes: ['내국인'], startMonth: '2017-11', endMonth: '2017-11' }

test('integrated service: direct selection and question use identical totals and conditions', async () => {
  const direct = await analyze({ filters })
  const question = await analyze({ filters, question: '17년 11월 제주시 내국인 토·일 비교' })
  assert.deepEqual(question.rows, direct.rows)
  assert.deepEqual(question.filters, direct.filters)
  assert.equal(question.difference, 288)
  assert.equal(question.interpretation.tool, 'compare_weekdays')
})

test('follow-ups keep the last successful period/type and preserve monthly intent', async () => {
  const first = await analyze({ filters, question: '제주시 내국인 토·일 결제 건수 비교' })
  const changedSelection = { ...filters, userType: '중국인', startMonth: '2016-09' }
  const monthly = await analyze({ filters: changedSelection, question: '그 차이가 매달 비슷했어?', previousContext: first.context })
  const seogwipo = await analyze({ filters: changedSelection, question: '그럼 서귀포는?', previousContext: monthly.context })
  assert.deepEqual(monthly.filters, filters)
  assert.equal(monthly.intent, 'monthly')
  assert.equal(seogwipo.intent, 'monthly')
  assert.equal(seogwipo.filters.userType, '내국인')
  assert.equal(seogwipo.filters.startMonth, '2017-11')
  assert.equal(seogwipo.filters.districtType, '서귀포시')
  assert.equal(seogwipo.difference, 998)
})

test('four-group question and direct multi-selection have identical common-month results', async () => {
  const direct = await analyze({ filters, scope: { districtTypes: ['제주시', '서귀포시'], userTypes: ['내국인', '중국인'] } })
  const question = await analyze({ filters, question: '제주시와 서귀포시 내국인·중국인 관광객 주말 소비를 비교해줘' })
  assert.equal(question.interpretation.tool, 'compare_groups')
  assert.deepEqual(question.groupComparison, direct.groupComparison)
  assert.deepEqual(question.groupComparison.groups.map(group => group.difference), [288, -73, 998, -7])
})

test('all four groups retain all 15 observed months and monthly sums match totals', async () => {
  const result = await analyze({
    filters: { ...filters, startMonth: '2016-09' },
    question: '두 구도심 내국인과 중국인 월별 추이',
  })
  assert.equal(result.groupComparison.includedMonths.length, 15)
  for (const group of result.groupComparison.groups) {
    assert.equal(group.rows.length, 15)
    assert.equal(group.rows.reduce((sum, row) => sum + row.saturday, 0), group.saturdayTotal)
    assert.equal(group.rows.reduce((sum, row) => sum + row.sunday, 0), group.sundayTotal)
  }
})

test('group comparison excludes a missing month from every group, including otherwise valid groups', async () => {
  const observations = previewObservations.filter(row => !(row.districtType === '서귀포시' && row.userType === '중국인' && row.dtYearMonth === '2017-10' && row.dtWeek === '일요일'))
  const result = await analyze({
    filters: { ...filters, startMonth: '2017-10' },
    question: '두 구도심 내국인 중국인 토·일 비교',
  }, { ...dataset, observations })
  assert.deepEqual(result.groupComparison.includedMonths, ['2017-11'])
  assert.match(result.groupComparison.excludedMonths[0].reason, /서귀포시 중국인/)
  assert.equal(result.groupComparison.groups[0].saturdayTotal, 13502)
})

test('zero is valid, ties remain zero and valid weekdays do not invalidate weekend pairs', async () => {
  const row = { districtType: '제주시', userType: '내국인', dtYearMonth: '2017-11' }
  const result = aggregateObservations([
    { ...row, dtWeek: '토요일', useCount: '0' },
    { ...row, dtWeek: '일요일', useCount: '0' },
    { ...row, dtWeek: '월요일', useCount: '12' },
  ], filters)
  assert.equal(result.status, 'success')
  assert.equal(result.difference, 0)
  assert.match(result.summary, /같았어요/)
})

test('duplicate and invalid weekend rows are excluded with an explicit reason', async () => {
  const row = previewObservations.find(row => row.dtYearMonth === '2017-11' && row.districtType === '제주시' && row.userType === '내국인' && row.dtWeek === '토요일')
  const duplicate = aggregateObservations([...previewObservations, row], filters)
  assert.equal(duplicate.status, 'empty')
  assert.match(duplicate.excludedMonths[0].reason, /중복/)
  const invalid = aggregateObservations(previewObservations.map(item => item === row ? { ...item, useCount: '-1' } : item), filters)
  assert.equal(invalid.status, 'empty')
  assert.match(invalid.excludedMonths[0].reason, /숫자/)
})

test('coverage searches the full scope instead of only the selected month', async () => {
  const result = await analyze({ filters: { ...filters, endMonth: '2017-10', startMonth: '2017-10' }, question: '어느 달까지 볼 수 있어?' })
  assert.equal(result.intent, 'availability')
  assert.equal(result.coverage.observedEnd, '2017-11')
  assert.equal(result.coverage.availableMonths.length, 15)
})

test('current-year questions preserve the requested year and never show 2017 as current results', () => {
  const request = readAnalysisRequest({ filters, question: '올해도 그래?', previousContext: context })
  const plan = planLocally(request, new Date('2026-11-18T03:00:00Z'))
  const result = executeAnalysis(previewObservations, plan)
  assert.equal(plan.intent, 'availability')
  assert.deepEqual(plan.requestedPeriod, { startMonth: '2026-01', endMonth: '2026-11' })
  assert.equal(result.status, 'empty')
  assert.equal(result.rows.length, 0)
  assert.equal(result.saturdayTotal, 0)
  assert.match(result.summary, /2026-01~2026-11/)
  assert.equal(result.coverage.observedEnd, '2017-11')
})

test('explicit out-of-range availability explains missing data without substituting a date', async () => {
  const result = await analyze({ filters, question: '2025년 3월 자료를 볼 수 있어?' })
  assert.equal(result.coverage.requestedMonths.length, 0)
  assert.match(result.summary, /2025-03/)
  assert.equal(result.status, 'empty')
})

test('coverage follow-up keeps the requested unobserved period while changing only district', () => {
  const first = executeAnalysis(previewObservations, planLocally(
    readAnalysisRequest({ filters, question: '올해도 그래?', previousContext: context }),
    new Date('2026-11-18T03:00:00Z'),
  ))
  const next = executeAnalysis(previewObservations, planLocally(readAnalysisRequest({
    filters, question: '그럼 서귀포는?', previousContext: first.context,
  })))
  assert.equal(next.intent, 'availability')
  assert.equal(next.context.districtTypes[0], '서귀포시')
  assert.deepEqual(next.requestedPeriod, first.requestedPeriod)
  assert.equal(next.status, 'empty')
  assert.equal(next.rows.length, 0)
})

test('a partly unavailable period is clipped with the actual requested bounds retained', async () => {
  const result = await analyze({ filters, question: '16년 3월부터 17년 1월까지 제주시 내국인 주말 비교' })
  assert.equal(result.filters.startMonth, '2016-09')
  assert.equal(result.filters.endMonth, '2017-01')
  assert.deepEqual(result.requestedPeriod, { startMonth: '2016-03', endMonth: '2017-01' })
  assert.equal(result.rows.length, 5)
})

test('unsupported questions and malformed requests fail as actionable input errors', async () => {
  for (const question of ['내년 매출 예측해줘', '제주시 결제 금액 비교', '애월 카페 비교', '제주시 도민 소비 비교', '17년 13월 비교', '17년 11월부터 16년 9월까지', '안녕하세요']) {
    await assert.rejects(analyze({ filters, question }), AnalysisInputError, question)
  }
  for (const body of [null, [], { filters, question: 15 }, { filters, question: 'a'.repeat(501) }, { filters: { ...filters, startMonth: 201711 } }, { filters, scope: { districtTypes: ['서울'] } }]) {
    await assert.rejects(analyze(body), AnalysisInputError)
  }
})

test('NVIDIA tool selection is validated before execution; invented totals and changed conditions are rejected', async () => {
  const baseline = planLocally(readAnalysisRequest({ filters, question: '제주시 토·일 비교' }))
  const valid = decodeToolPlan(toolPayload('compare_weekdays', toolArgs), baseline)
  assert.equal(valid.source, 'nvidia')
  assert.equal(executeAnalysis(previewObservations, valid).difference, 288)
  for (const payload of [
    toolPayload('sql', toolArgs),
    toolPayload('compare_weekdays', { ...toolArgs, saturdayTotal: 1 }),
    toolPayload('compare_weekdays', { ...toolArgs, userTypes: ['중국인'] }),
    toolPayload('compare_weekdays', { ...toolArgs, startMonth: '2026-01' }),
    { choices: [{ message: { content: '토요일 999999건' } }] },
  ]) assert.throws(() => decodeToolPlan(payload, baseline))
})

test('NVIDIA success calls only the fixed provider URL with the key in server headers', async () => {
  let called = false
  const request = readAnalysisRequest({ filters, question: '제주시 토·일 비교' })
  const plan = await planWithAgent(request, {
    apiKey: 'test-only-provider-key',
    fetcher: async (url, init) => {
      called = true
      assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions')
      assert.equal(init.headers.Authorization, 'Bearer test-only-provider-key')
      assert.ok(init.signal)
      assert.equal(JSON.parse(init.body).tools.length, 4)
      return Response.json(toolPayload('compare_weekdays', toolArgs))
    },
  })
  assert.ok(called)
  assert.equal(plan.source, 'nvidia')
  assert.equal(JSON.stringify(plan).includes('test-only-provider-key'), false)
})

test('NVIDIA failure, timeout and invalid tool output fall back without leaking a secret', async () => {
  const request = readAnalysisRequest({ filters, question: '제주시 토·일 비교' })
  for (const fetcher of [
    async () => new Response('test-only-provider-key', { status: 401 }),
    async () => { throw new DOMException('test-only-provider-key', 'TimeoutError') },
    async () => Response.json(toolPayload('sql', { query: 'DROP TABLE user' })),
  ]) {
    const plan = await planWithAgent(request, { apiKey: 'test-only-provider-key', fetcher })
    assert.equal(plan.source, 'rules')
    assert.ok(plan.notice)
    assert.equal(JSON.stringify(plan).includes('test-only-provider-key'), false)
    assert.equal(executeAnalysis(previewObservations, plan).difference, 288)
  }
})

test('the agent interprets unfamiliar wording and chooses a monthly tool from its meaning', async () => {
  const unfamiliar = await planWithAgent(readAnalysisRequest({ filters, question: '어느 요일에 결제가 더 자주 일어났을까?' }), {
    apiKey: 'test-only-provider-key',
    fetcher: async () => Response.json(toolPayload('compare_weekdays', toolArgs)),
  })
  assert.equal(unfamiliar.source, 'nvidia')
  assert.equal(executeAnalysis(previewObservations, unfamiliar).difference, 288)
  const trend = await planWithAgent(readAnalysisRequest({ filters, question: '제주시 내국인 소비 차이가 꾸준했니?' }), {
    apiKey: 'test-only-provider-key',
    fetcher: async () => Response.json(toolPayload('monthly_trend', toolArgs)),
  })
  assert.equal(trend.source, 'nvidia')
  assert.equal(trend.intent, 'monthly')
  const failedRequest = readAnalysisRequest({ filters, question: '어느 요일에 결제가 더 자주 일어났을까?' })
  await assert.rejects(planWithAgent(failedRequest, {
    apiKey: 'test-only-provider-key', fetcher: async () => new Response('', { status: 503 }),
  }), AnalysisInputError)
})

test('NVIDIA transient model error retries the configured fallback model once', async () => {
  const models = []
  const plan = await planWithAgent(readAnalysisRequest({ filters, question: '제주시 토·일 비교' }), {
    apiKey: 'test-only-provider-key', model: 'test-only-model',
    fetcher: async (_url, init) => {
      models.push(JSON.parse(init.body).model)
      return models.length === 1 ? new Response('', { status: 503 }) : Response.json(toolPayload('compare_weekdays', toolArgs))
    },
  })
  assert.equal(models.length, 2)
  assert.equal(plan.source, 'nvidia')
})

test('a valid model tool response retains the original clipped request period', async () => {
  const request = readAnalysisRequest({ filters, question: '16년 3월부터 17년 1월까지 제주시 내국인 주말 비교' })
  const plan = await planWithAgent(request, {
    apiKey: 'test-only-provider-key',
    fetcher: async () => Response.json(toolPayload('compare_weekdays', { ...toolArgs, startMonth: '2016-09', endMonth: '2017-01' })),
  })
  assert.equal(plan.source, 'nvidia')
  assert.deepEqual(plan.requestedPeriod, { startMonth: '2016-03', endMonth: '2017-01' })
})
