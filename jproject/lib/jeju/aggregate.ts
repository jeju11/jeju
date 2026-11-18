import type {
  ComparisonResult,
  DistrictType,
  Filters,
  Observation,
  UserType,
  Weekday,
} from './types'

export const OFFICIAL_PERIOD = { start: '2016-09', end: '2017-11' } as const

export function normalizeMonth(value: string | null | undefined) {
  if (!value) return null
  const match = value.trim().match(/^(\d{4})-?(\d{2})$/)
  if (!match) return null
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null
}

export function validateFilters(input: Partial<Filters>): Filters {
  const districtType = input.districtType
  const userType = input.userType
  const startMonth = normalizeMonth(input.startMonth)
  const endMonth = normalizeMonth(input.endMonth)

  if (districtType !== '제주시' && districtType !== '서귀포시') {
    throw new Error('지역을 선택해 주세요.')
  }
  if (userType !== '내국인' && userType !== '중국인') {
    throw new Error('관광객 유형을 선택해 주세요.')
  }
  if (!startMonth || !endMonth) {
    throw new Error('시작월과 종료월을 올바르게 입력해 주세요.')
  }
  if (startMonth > endMonth) {
    throw new Error('시작월은 종료월보다 늦을 수 없습니다.')
  }
  if (startMonth < OFFICIAL_PERIOD.start || endMonth > OFFICIAL_PERIOD.end) {
    throw new Error(`조회 기간은 공식 수집 기간인 ${OFFICIAL_PERIOD.start}부터 ${OFFICIAL_PERIOD.end}까지예요.`)
  }

  return { districtType, userType, startMonth, endMonth }
}

function canonicalDistrict(value: string | null) {
  const normalized = value?.replaceAll(/\s/g, '') ?? ''
  if (normalized.includes('제주시')) return '제주시'
  if (normalized.includes('서귀포')) return '서귀포시'
  return null
}

function canonicalUser(value: string | null) {
  const normalized = value?.replaceAll(/\s/g, '') ?? ''
  if (normalized.includes('중국')) return '중국인'
  if (normalized.includes('내국인') || normalized.toLowerCase().includes('domestic')) return '내국인'
  return null
}

function canonicalWeekday(value: string | null): Weekday | null {
  const normalized = value?.trim().toLowerCase().replaceAll(/\s/g, '') ?? ''
  if (['토요일', '토', 'sat', 'saturday', '6'].includes(normalized)) return '토요일'
  if (['일요일', '일', 'sun', 'sunday', '7', '0'].includes(normalized)) return '일요일'
  return null
}

function parseCount(value: string | null) {
  if (value === null || !/^(0|[1-9]\d*)$/.test(value.trim())) return null
  const count = Number(value)
  return Number.isSafeInteger(count) ? count : null
}

function monthRange(start: string, end: string) {
  const months: string[] = []
  let year = Number(start.slice(0, 4))
  let month = Number(start.slice(5, 7))
  const finalYear = Number(end.slice(0, 4))
  const finalMonth = Number(end.slice(5, 7))
  while (year < finalYear || (year === finalYear && month <= finalMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
  }
  return months
}

function validMonth(value: string | null) {
  return normalizeMonth(value)
}

export function findLatestCompleteMonth(
  observations: Observation[],
  districtType: DistrictType,
  userType: UserType,
) {
  const completeMonths: string[] = []
  const months = new Set(
    observations
      .map((row) => validMonth(row.dtYearMonth))
      .filter((month): month is string => month !== null && month >= OFFICIAL_PERIOD.start && month <= OFFICIAL_PERIOD.end),
  )

  for (const month of months) {
    const rows = observations.filter(
      (row) =>
        validMonth(row.dtYearMonth) === month &&
        canonicalDistrict(row.districtType) === districtType &&
        canonicalUser(row.userType) === userType,
    )
    const saturday = rows.filter((row) => canonicalWeekday(row.dtWeek) === '토요일')
    const sunday = rows.filter((row) => canonicalWeekday(row.dtWeek) === '일요일')
    if (
      saturday.length === 1 &&
      sunday.length === 1 &&
      parseCount(saturday[0].useCount) !== null &&
      parseCount(sunday[0].useCount) !== null
    ) {
      completeMonths.push(month)
    }
  }
  return completeMonths.sort().at(-1) ?? null
}

function differenceSummary(difference: number) {
  if (difference > 0) return `토요일이 일요일보다 ${difference.toLocaleString('ko-KR')}건 많았어요.`
  if (difference < 0) return `일요일이 토요일보다 ${Math.abs(difference).toLocaleString('ko-KR')}건 많았어요.`
  return '토요일과 일요일의 결제 건수가 같았어요.'
}

export function aggregateObservations(
  observations: Observation[],
  filters: Filters,
): ComparisonResult {
  const months = monthRange(filters.startMonth, filters.endMonth)
  const rows: ComparisonResult['rows'] = []
  const excludedMonths: ComparisonResult['excludedMonths'] = []

  for (const month of months) {
    const matching = observations.filter(
      (row) =>
        validMonth(row.dtYearMonth) === month &&
        canonicalDistrict(row.districtType) === filters.districtType &&
        canonicalUser(row.userType) === filters.userType,
    )

    if (matching.length === 0) {
      excludedMonths.push({ month, reason: '미리보기 파일에 해당 조합의 관측 행이 없어 미포함했어요.' })
      continue
    }

    const unknownWeekday = matching.some((row) => canonicalWeekday(row.dtWeek) === null)
    const saturday = matching.filter((row) => canonicalWeekday(row.dtWeek) === '토요일')
    const sunday = matching.filter((row) => canonicalWeekday(row.dtWeek) === '일요일')
    const hasInvalidCount = matching.some((row) => parseCount(row.useCount) === null)

    if (unknownWeekday || hasInvalidCount) {
      const reasons = [
        unknownWeekday ? '요일 값 오류' : null,
        hasInvalidCount ? '결제 건수 누락 또는 숫자 형식 오류' : null,
      ].filter(Boolean)
      excludedMonths.push({ month, reason: `${reasons.join(' · ')}로 제외했어요.` })
      continue
    }
    if (saturday.length > 1 || sunday.length > 1) {
      excludedMonths.push({
        month,
        reason: `중복 관측(${saturday.length > 1 ? '토요일' : '일요일'})으로 제외했어요.`,
      })
      continue
    }
    if (saturday.length !== 1 || sunday.length !== 1) {
      const missing = [
        saturday.length === 0 ? '토요일' : null,
        sunday.length === 0 ? '일요일' : null,
      ].filter(Boolean)
      excludedMonths.push({ month, reason: `${missing.join('·')} 관측 누락으로 제외했어요.` })
      continue
    }

    const saturdayCount = parseCount(saturday[0].useCount)!
    const sundayCount = parseCount(sunday[0].useCount)!
    rows.push({
      month,
      saturday: saturdayCount,
      sunday: sundayCount,
      difference: saturdayCount - sundayCount,
    })
  }

  const saturdayTotal = rows.reduce((total, row) => total + row.saturday, 0)
  const sundayTotal = rows.reduce((total, row) => total + row.sunday, 0)
  const difference = saturdayTotal - sundayTotal
  const latestCompleteMonth = findLatestCompleteMonth(
    observations,
    filters.districtType,
    filters.userType,
  )

  return {
    status: rows.length ? 'success' : 'empty',
    filters,
    rows,
    excludedMonths,
    saturdayTotal,
    sundayTotal,
    difference,
    summary: rows.length ? differenceSummary(difference) : '선택한 조건에서 비교할 수 있는 월별 데이터가 없어요.',
    latestCompleteMonth,
    availabilityMessage: latestCompleteMonth
      ? `${filters.districtType} 구도심 · ${filters.userType} 기준 ${latestCompleteMonth.replace('-', '년 ')}월까지 비교할 수 있어요.`
      : '이 조건에서 토요일과 일요일을 모두 비교할 수 있는 월이 아직 없어요.',
    officialPeriod: OFFICIAL_PERIOD,
  }
}

export type QuestionIntent = 'compare' | 'monthly' | 'availability'

function parseQuestionMonths(text: string) {
  const pattern = /(?<!\d)(?:(\d{2}|\d{4})\s*년\s*(\d{1,2})\s*월|(\d{4})[-./](\d{1,2})(?![\d./-])|(\d{1,2})\s*월)/g
  const matches = Array.from(text.matchAll(pattern))
  let explicitYear: number | undefined

  return matches.map(([, koreanYear, koreanMonth, numericYear, numericMonth, bareMonth]) => {
    const year = koreanYear ?? numericYear
    if (year) explicitYear = Number(year) + (year.length === 2 ? 2000 : 0)

    const month = Number(koreanMonth ?? numericMonth ?? bareMonth)
    if (month < 1 || month > 12) throw new Error('월은 1월부터 12월 사이로 입력해 주세요.')

    const monthNumber = String(month).padStart(2, '0')
    if (explicitYear !== undefined) return `${explicitYear}-${monthNumber}`

    const dataYears = [OFFICIAL_PERIOD.start.slice(0, 4), OFFICIAL_PERIOD.end.slice(0, 4)]
    const possibleMonths = [...new Set(dataYears)].map((dataYear) => `${dataYear}-${monthNumber}`)
      .filter((candidate) => candidate >= OFFICIAL_PERIOD.start && candidate <= OFFICIAL_PERIOD.end)

    if (possibleMonths.length !== 1) {
      throw new Error('같은 달을 여러 해에서 조회할 수 있어요. 연도도 함께 입력해 주세요. 예: 17년 11월.')
    }
    return possibleMonths[0]
  })
}

export function interpretQuestion(
  question: string,
  selected: Filters,
  previous?: Filters | null,
) {
  const text = question.normalize('NFKC').trim()
  const monthly = /월별|달별|매달|매월|차이.*비슷/.test(text)
  const availability = /어느\s*달(?:까지)?|몇\s*월까지|언제까지|최신.*(?:월|자료|데이터)|최근.*(?:월|자료|데이터)/.test(text)
  const intent: QuestionIntent = availability ? 'availability' : monthly ? 'monthly' : 'compare'
  const isFollowUp = /그\s*차이|그럼|그렇다면|그\s*조건|그\s*지역|해당\s*조건/.test(text)
  const filters = { ...(isFollowUp && previous ? previous : selected) }

  const district = /서귀포/.test(text) ? '서귀포시' : /제주시|제주\s*구도심/.test(text) ? '제주시' : null
  const audience = /중국/.test(text) ? '중국인' : /내국인/.test(text) ? '내국인' : null
  if (district) filters.districtType = district
  if (audience) filters.userType = audience

  const months = parseQuestionMonths(text)
  const hasRelativeDate = /오늘|어제|내일|올해|작년|(?:이번|지난|다음)\s*(?:주말|주|달|해)/.test(text)
  if (hasRelativeDate && !availability) {
    throw new Error('이 데이터는 2016년 9월부터 2017년 11월까지예요. 조회할 연도와 월을 입력해 주세요.')
  }
  if (months.length > 2) throw new Error('시작월과 종료월 두 개만 입력해 주세요.')
  if (months.length === 1 && /부터|이전|이후/.test(text)) {
    throw new Error('기간을 비교하려면 시작월과 종료월을 함께 입력해 주세요.')
  }
  if (text && !months.length && !district && !audience && intent === 'compare' &&
      !/토요일|일요일|토\s*[·ㆍ/]\s*일|토일|요일별/.test(text)) {
    throw new Error('비교할 지역, 관광객 유형 또는 연도와 월을 입력해 주세요. 예: 17년 11월 제주시 내국인.')
  }

  let requestedPeriod: { startMonth: string; endMonth: string } | undefined
  if (months.length) {
    const [startMonth, endMonth = startMonth] = months
    if (startMonth > endMonth) throw new Error('시작월은 종료월보다 늦을 수 없습니다.')
    if (endMonth < OFFICIAL_PERIOD.start || startMonth > OFFICIAL_PERIOD.end) {
      throw new Error('조회 기간은 공식 수집 기간인 2016년 9월~2017년 11월과 겹쳐야 해요.')
    }
    filters.startMonth = startMonth < OFFICIAL_PERIOD.start ? OFFICIAL_PERIOD.start : startMonth
    filters.endMonth = endMonth > OFFICIAL_PERIOD.end ? OFFICIAL_PERIOD.end : endMonth
    if (startMonth !== filters.startMonth || endMonth !== filters.endMonth) {
      requestedPeriod = { startMonth, endMonth }
    }
  }

  return { filters: validateFilters(filters), intent, requestedPeriod }
}

export function resolveIntentComparison(
  observations: Observation[],
  interpreted: {
    filters: Filters
    intent: QuestionIntent
    requestedPeriod?: { startMonth: string; endMonth: string }
  },
): ComparisonResult {
  let comparison = aggregateObservations(observations, interpreted.filters)

  if (interpreted.intent === 'availability' && comparison.latestCompleteMonth) {
    const latestMonth = comparison.latestCompleteMonth
    comparison = aggregateObservations(observations, {
      ...comparison.filters,
      startMonth: latestMonth,
      endMonth: latestMonth,
    })
    comparison = {
      ...comparison,
      summary: `${latestMonth.replace('-', '년 ')}월까지 비교할 수 있어요.`,
    }
  } else if (interpreted.intent === 'monthly' && comparison.rows.length > 0) {
    const sortedByDifference = [...comparison.rows].sort((left, right) => left.difference - right.difference)
    const least = sortedByDifference[0]
    const most = sortedByDifference[sortedByDifference.length - 1]
    const spread = most.difference - least.difference
    const formatDifference = (difference: number) => `${difference > 0 ? '+' : ''}${difference.toLocaleString('ko-KR')}건`
    comparison = {
      ...comparison,
      summary: comparison.rows.length === 1
        ? `${least.month.replace('-', '년 ')}월의 차이는 ${formatDifference(least.difference)}이에요. 비교 가능한 달이 한 달뿐이라 월별 유사성은 판단할 수 없어요.`
        : `가장 작은 차이는 ${least.month.replace('-', '년 ')}월 ${formatDifference(least.difference)}, 가장 큰 차이는 ${most.month.replace('-', '년 ')}월 ${formatDifference(most.difference)}예요. 월별 차이 범위는 ${spread.toLocaleString('ko-KR')}건입니다. 아래 표에서 달마다 확인해 보세요.`,
    }
  }

  return comparison
}
