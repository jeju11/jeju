import { aggregateObservations, interpretQuestion, OFFICIAL_PERIOD, parseQuestionMonths, resolveIntentComparison, validateFilters } from './aggregate.ts'
import type { QuestionIntent } from './aggregate.ts'
import type { ComparisonResult, DistrictType, Filters, Observation, UserType } from './types.ts'

export class AnalysisInputError extends Error {}

export type AnalysisContext = {
  filters: Filters
  intent: QuestionIntent
  districtTypes: DistrictType[]
  userTypes: UserType[]
  requestedPeriod?: Pick<Filters, 'startMonth' | 'endMonth'>
}

export type AnalysisPlan = AnalysisContext & {
  requestedPeriod?: Pick<Filters, 'startMonth' | 'endMonth'>
  source: 'direct' | 'rules' | 'nvidia'
  notice?: string
}

export type AnalysisResult = ComparisonResult & {
  intent: QuestionIntent
  context: AnalysisContext
  interpretation: { source: AnalysisPlan['source']; tool: string; notice?: string }
  groupComparison?: {
    groups: ComparisonResult[]
    includedMonths: string[]
    excludedMonths: { month: string; reason: string }[]
  }
  coverage?: {
    availableMonths: string[]
    requestedMonths: string[]
    observedStart: string | null
    observedEnd: string | null
  }
}

const districts: DistrictType[] = ['제주시', '서귀포시']
const users: UserType[] = ['내국인', '중국인']
const intents = ['compare', 'monthly', 'availability'] as const

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AnalysisInputError('분석 조건을 올바르게 입력해 주세요.')
  }
  return value as Record<string, unknown>
}

function checkedFilters(value: unknown): Filters {
  try { return validateFilters(objectValue(value) as Partial<Filters>) }
  catch (error) { throw new AnalysisInputError(error instanceof Error ? error.message : '조건을 확인해 주세요.') }
}

function checkedList<T extends string>(value: unknown, allowed: T[], fallback: T[]): T[] {
  if (value === undefined) return fallback
  if (!Array.isArray(value) || !value.length || value.some(item => !allowed.includes(item))) {
    throw new AnalysisInputError('지원하는 지역과 관광객 유형을 선택해 주세요.')
  }
  return [...new Set(value)] as T[]
}

export function validateContext(value: unknown): AnalysisContext {
  const body = objectValue(value)
  const filters = checkedFilters(body.filters)
  if (!intents.includes(body.intent as QuestionIntent)) throw new AnalysisInputError('분석 종류를 확인해 주세요.')
  let requestedPeriod: AnalysisContext['requestedPeriod']
  if (body.requestedPeriod !== undefined) {
    const period = objectValue(body.requestedPeriod)
    if (typeof period.startMonth !== 'string' || typeof period.endMonth !== 'string' ||
        !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(period.startMonth) ||
        !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(period.endMonth) ||
        period.startMonth > period.endMonth) {
      throw new AnalysisInputError('이전 요청 기간을 확인해 주세요.')
    }
    requestedPeriod = { startMonth: period.startMonth, endMonth: period.endMonth }
  }
  return {
    filters, intent: body.intent as QuestionIntent,
    requestedPeriod,
    districtTypes: checkedList(body.districtTypes, districts, [filters.districtType]),
    userTypes: checkedList(body.userTypes, users, [filters.userType]),
  }
}

export function readAnalysisRequest(value: unknown) {
  const body = objectValue(value)
  if (body.question !== undefined && typeof body.question !== 'string') {
    throw new AnalysisInputError('질문은 글자로 입력해 주세요.')
  }
  const question = String(body.question ?? '').trim()
  if (question.length > 500) throw new AnalysisInputError('질문은 500자 이내로 입력해 주세요.')
  const filters = checkedFilters(body.filters)
  const previous = body.previousContext ? validateContext(body.previousContext)
    : body.previousFilters ? {
        filters: checkedFilters(body.previousFilters), intent: 'compare' as const,
        districtTypes: [checkedFilters(body.previousFilters).districtType],
        userTypes: [checkedFilters(body.previousFilters).userType],
      } : null
  const scope = body.scope === undefined ? {} : objectValue(body.scope)
  return {
    question, filters, previous,
    districtTypes: checkedList(scope.districtTypes, districts, [filters.districtType]),
    userTypes: checkedList(scope.userTypes, users, [filters.userType]),
  }
}

export type AnalysisRequest = ReturnType<typeof readAnalysisRequest>

function currentMonth(now: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now)
}

export function planLocally(request: AnalysisRequest, now = new Date()): AnalysisPlan {
  const { question, filters: selected, previous } = request
  if (!question) return { filters: selected, intent: 'compare', districtTypes: request.districtTypes, userTypes: request.userTypes, source: 'direct' }
  const text = question.normalize('NFKC')
  if (/최근\s*\d+\s*개월/.test(text)) throw new AnalysisInputError('최근 몇 개월 대신 조회할 연도와 시작월·종료월을 함께 입력해 주세요.')
  if (/예측|내년|방문객\s*수|인구|연령|시간대|오후|오전|몇\s*시|매출액|금액|소비액|원\s*단위/.test(text)) {
    throw new AnalysisInputError('현재 자료는 월별 토·일 결제 건수예요. 금액·시간대·미래 예측은 제공하지 않아요.')
  }
  if (/애월|성산|한림|대정|표선|조천|구좌|남원|개별\s*매장|업종별/.test(text)) {
    throw new AnalysisInputError('지역은 제주시·서귀포시 구도심만 비교할 수 있어요.')
  }
  if (/외국인|일본인|미국인|도민/.test(text)) {
    throw new AnalysisInputError('현재 자료의 관광객 구분은 내국인·중국인이에요. 도민 소비 전체를 뜻하지 않아요.')
  }
  const followUp = /그\s*차이|그럼|그렇다면|그\s*조건|그\s*지역|해당\s*조건|같은\s*조건|올해도/.test(text)
  const base = followUp && previous ? previous : null
  let districtTypes = base?.districtTypes ?? request.districtTypes
  let userTypes = base?.userTypes ?? request.userTypes
  const bothDistricts = /두\s*(?:지역|구도심)|지역별|제주시[\s\S]*서귀포|서귀포[\s\S]*제주시/.test(text)
  const bothUsers = /두\s*(?:관광객|유형)|유형별|내국인[\s\S]*중국인|중국인[\s\S]*내국인/.test(text)
  if (bothDistricts) districtTypes = [...districts]
  else if (/서귀포/.test(text)) districtTypes = ['서귀포시']
  else if (/제주시|제주\s*구도심/.test(text)) districtTypes = ['제주시']
  if (bothUsers) userTypes = [...users]
  else if (/중국/.test(text)) userTypes = ['중국인']
  else if (/내국인/.test(text)) userTypes = ['내국인']
  const coverageQuestion = /조회\s*가능|볼\s*수|자료.*기간|관측\s*기간|수집\s*기간|올해|작년|오늘|이번\s*(?:달|주말)|지난\s*달/.test(text)
  // Relative time is an availability request. Never substitute 2017 for the current year.
  const relative = /올해|작년|오늘|이번\s*(?:달|주말)|지난\s*달/.test(text)
  let interpreted: ReturnType<typeof interpretQuestion>
  let coveragePeriod: Pick<Filters, 'startMonth' | 'endMonth'> | undefined
  let explicitPeriod = false
  try {
    const coverageIntent = coverageQuestion || /어느\s*달|몇\s*월까지|언제까지|최신|최근/.test(text)
    const explicitMonths = relative ? [] : parseQuestionMonths(text)
    explicitPeriod = explicitMonths.length > 0
    if (coverageIntent && explicitMonths.length) {
      if (explicitMonths.length > 2 || explicitMonths[0] > (explicitMonths[1] ?? explicitMonths[0])) throw new Error('조회할 시작월과 종료월을 확인해 주세요.')
      coveragePeriod = { startMonth: explicitMonths[0], endMonth: explicitMonths[1] ?? explicitMonths[0] }
    }
    const parsingText = relative || coveragePeriod ? '어느 달까지 볼 수 있어?' : coverageQuestion ? `${text} 어느 달까지` : bothDistricts || bothUsers ? `${text} 토·일` : text
    interpreted = interpretQuestion(parsingText, selected, base?.filters)
  } catch (error) {
    throw new AnalysisInputError(error instanceof Error ? error.message : '질문 조건을 확인해 주세요.')
  }
  if (followUp && base && interpreted.intent === 'compare' && !/비교|토요일|일요일|토\s*[·/]\s*일/.test(text)) {
    interpreted.intent = base.intent
  }
  let requestedPeriod = coveragePeriod ?? interpreted.requestedPeriod ?? (!explicitPeriod ? base?.requestedPeriod : undefined)
  if (relative) {
    const endMonth = currentMonth(now)
    const year = Number(endMonth.slice(0, 4)) - (/작년/.test(text) ? 1 : 0)
    requestedPeriod = { startMonth: `${year}-01`, endMonth: /작년/.test(text) ? `${year}-12` : endMonth }
    if (/오늘|이번\s*(?:달|주말)/.test(text)) requestedPeriod = { startMonth: endMonth, endMonth }
    if (/지난\s*달/.test(text)) {
      const date = new Date(`${endMonth}-01T00:00:00Z`)
      date.setUTCMonth(date.getUTCMonth() - 1)
      const month = date.toISOString().slice(0, 7)
      requestedPeriod = { startMonth: month, endMonth: month }
    }
  }
  return {
    ...interpreted,
    filters: { ...interpreted.filters, districtType: districtTypes[0], userType: userTypes[0] },
    requestedPeriod, districtTypes, userTypes, source: 'rules',
  }
}

export function executeAnalysis(observations: Observation[], plan: AnalysisPlan): AnalysisResult {
  const period = plan.intent === 'availability'
    ? { startMonth: OFFICIAL_PERIOD.start, endMonth: OFFICIAL_PERIOD.end } : plan.filters
  const groupFilters = plan.districtTypes.flatMap(districtType => plan.userTypes.map(userType => ({ ...plan.filters, ...period, districtType, userType })))
  const fullGroups = groupFilters.map(filters => aggregateObservations(observations, { ...filters, startMonth: OFFICIAL_PERIOD.start, endMonth: OFFICIAL_PERIOD.end }))
  const availableMonths = fullGroups[0].rows.map(row => row.month).filter(month => fullGroups.every(group => group.rows.some(row => row.month === month)))
  const groups = groupFilters.map(filters => resolveIntentComparison(observations, { ...plan, filters, intent: plan.intent === 'availability' ? 'compare' : plan.intent }))
  let result = groups[0]
  let groupComparison: AnalysisResult['groupComparison']
  if (groups.length > 1) {
    const includedMonths = groups[0].rows.map(row => row.month).filter(month => groups.every(group => group.rows.some(row => row.month === month)))
    const allMonths = [...new Set(groups.flatMap(group => [...group.rows.map(row => row.month), ...group.excludedMonths.map(row => row.month)]))].sort()
    const excludedMonths = allMonths.filter(month => !includedMonths.includes(month)).map(month => ({
      month, reason: groups.filter(group => !group.rows.some(row => row.month === month)).map(group =>
        `${group.filters.districtType} ${group.filters.userType}: ${group.excludedMonths.find(row => row.month === month)?.reason ?? '관측 누락'}`,
      ).join(' / '),
    }))
    const commonGroups = groups.map(group => {
      const rows = group.rows.filter(row => includedMonths.includes(row.month))
      const saturdayTotal = rows.reduce((sum, row) => sum + row.saturday, 0)
      const sundayTotal = rows.reduce((sum, row) => sum + row.sunday, 0)
      return { ...group, status: rows.length ? 'success' as const : 'empty' as const, rows, excludedMonths, saturdayTotal, sundayTotal, difference: saturdayTotal - sundayTotal }
    })
    groupComparison = { groups: commonGroups, includedMonths, excludedMonths }
    result = {
      ...commonGroups[0],
      summary: includedMonths.length
        ? `${groups.length}개 조합을 같은 ${includedMonths.length}개월의 자료로 비교했어요. 아래에서 각 조합의 토·일 건수와 비중을 확인하세요.`
        : '모든 조합에서 토·일 자료가 함께 있는 달이 없어 같은 기준으로 비교할 수 없어요.',
    }
  }
  let coverage: AnalysisResult['coverage']
  if (plan.intent === 'availability') {
    const requested = plan.requestedPeriod ?? { startMonth: OFFICIAL_PERIOD.start, endMonth: OFFICIAL_PERIOD.end }
    const requestedMonths = availableMonths.filter(month => month >= requested.startMonth && month <= requested.endMonth)
    coverage = { availableMonths, requestedMonths, observedStart: availableMonths[0] ?? null, observedEnd: availableMonths.at(-1) ?? null }
    const requestedRows = result.rows.filter(row => requestedMonths.includes(row.month))
    const saturdayTotal = requestedRows.reduce((sum, row) => sum + row.saturday, 0)
    const sundayTotal = requestedRows.reduce((sum, row) => sum + row.sunday, 0)
    result = {
      ...result,
      status: requestedRows.length ? 'success' : 'empty',
      rows: requestedRows, saturdayTotal, sundayTotal, difference: saturdayTotal - sundayTotal,
      summary: requestedMonths.length
        ? `${requested.startMonth}~${requested.endMonth} 중 ${requestedMonths.length}개월을 비교할 수 있어요. 이 조건의 마지막 관측월은 ${coverage.observedEnd}이에요.`
        : `요청한 ${requested.startMonth}~${requested.endMonth}에는 비교 가능한 자료가 없어요. ${coverage.observedStart ? `실제 비교 가능 범위는 ${coverage.observedStart}~${coverage.observedEnd}이에요.` : '이 조합에는 비교 가능한 관측월이 없어요.'}`,
    }
    if (groupComparison) {
      groupComparison = {
        ...groupComparison,
        includedMonths: groupComparison.includedMonths.filter(month => requestedMonths.includes(month)),
        groups: groupComparison.groups.map(group => {
          const rows = group.rows.filter(row => requestedMonths.includes(row.month))
          const saturdayTotal = rows.reduce((sum, row) => sum + row.saturday, 0)
          const sundayTotal = rows.reduce((sum, row) => sum + row.sunday, 0)
          return { ...group, rows, status: rows.length ? 'success' as const : 'empty' as const, saturdayTotal, sundayTotal, difference: saturdayTotal - sundayTotal }
        }),
      }
    }
  }
  return {
    ...result, requestedPeriod: plan.requestedPeriod, intent: plan.intent,
    context: { filters: plan.filters, intent: plan.intent, districtTypes: plan.districtTypes, userTypes: plan.userTypes, requestedPeriod: plan.requestedPeriod },
    interpretation: { source: plan.source, tool: plan.intent === 'availability' ? 'inspect_coverage' : plan.intent === 'monthly' ? 'monthly_trend' : groups.length > 1 ? 'compare_groups' : 'compare_weekdays', notice: plan.notice },
    groupComparison, coverage,
  }
}
