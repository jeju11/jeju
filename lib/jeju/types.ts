export type DistrictType = '제주시' | '서귀포시'
export type UserType = '내국인' | '중국인'
export type Weekday = '토요일' | '일요일'

export type Filters = {
  districtType: DistrictType
  userType: UserType
  startMonth: string
  endMonth: string
}

export type Observation = {
  districtType: string | null
  userType: string | null
  dtYearMonth: string | null
  dtWeek: string | null
  useCount: string | null
  rawPayload?: Record<string, unknown> | null
}

export type DatasetMetadata = {
  source: 'database' | 'preview-file'
  version: string
  rowCount: number
  observedStart: string | null
  observedEnd: string | null
  collectedAt: string | null
  warning?: string
}

export type MonthlyComparison = {
  month: string
  saturday: number
  sunday: number
  difference: number
}

export type ExcludedMonth = {
  month: string
  reason: string
}

export type ComparisonResult = {
  status: 'success' | 'empty'
  filters: Filters
  requestedPeriod?: Pick<Filters, 'startMonth' | 'endMonth'>
  rows: MonthlyComparison[]
  excludedMonths: ExcludedMonth[]
  saturdayTotal: number
  sundayTotal: number
  difference: number
  summary: string
  latestCompleteMonth: string | null
  availabilityMessage: string
  officialPeriod: { start: string; end: string }
}
