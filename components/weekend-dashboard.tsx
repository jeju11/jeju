'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  Pencil,
  Waves,
  X,
} from 'lucide-react'
import type { AnalysisContext, AnalysisResult } from '@/lib/jeju/analysis'
import type { DatasetMetadata, Filters } from '@/lib/jeju/types'

type ComparisonResponse = AnalysisResult & { dataset: DatasetMetadata }

type Props = {
  user?: { id: string; name: string; email: string } | null
  isAdmin?: boolean
  initialFilters: Filters
  initialQuestion?: string
  initialResult?: ComparisonResponse | null
  initialError?: string | null
  initialDataset?: DatasetMetadata
}

const MONTH_OPTIONS = [
  { value: '2016-09', label: '2016년 9월' },
  { value: '2016-10', label: '2016년 10월' },
  { value: '2016-11', label: '2016년 11월' },
  { value: '2016-12', label: '2016년 12월' },
  { value: '2017-01', label: '2017년 1월' },
  { value: '2017-02', label: '2017년 2월' },
  { value: '2017-03', label: '2017년 3월' },
  { value: '2017-04', label: '2017년 4월' },
  { value: '2017-05', label: '2017년 5월' },
  { value: '2017-06', label: '2017년 6월' },
  { value: '2017-07', label: '2017년 7월' },
  { value: '2017-08', label: '2017년 8월' },
  { value: '2017-09', label: '2017년 9월' },
  { value: '2017-10', label: '2017년 10월' },
  { value: '2017-11', label: '2017년 11월' },
]

export function WeekendDashboard({
  initialFilters,
  initialQuestion = '',
  initialResult = null,
  initialError = null,
}: Props) {
  const [isPending, setIsPending] = useState(false)
  const requestInFlight = useRef(false)
  const [previousContext, setPreviousContext] = useState<AnalysisContext | null>(initialResult?.context ?? null)
  const [compareDistricts, setCompareDistricts] = useState((initialResult?.context.districtTypes.length ?? 1) > 1)
  const [compareUsers, setCompareUsers] = useState((initialResult?.context.userTypes.length ?? 1) > 1)

  // 1. 입력 상태 보존
  const [question, setQuestion] = useState(initialQuestion)
  const [district, setDistrict] = useState<'제주시' | '서귀포시'>(
    initialFilters.districtType === '서귀포시' ? '서귀포시' : '제주시'
  )
  const [userType, setUserType] = useState<'내국인' | '중국인'>(
    initialFilters.userType === '중국인' ? '중국인' : '내국인'
  )
  const [startMonth, setStartMonth] = useState(initialFilters.startMonth || '2017-11')
  const [endMonth, setEndMonth] = useState(initialFilters.endMonth || '2017-11')

  // 2. 화면 전환 상태: false = 비교 입력 화면, true = 비교 결과 화면
  // URL에 명시적 질문이나 결과가 지정되어 유입된 경우 결과 화면으로 즉시 시작
  const [isResultView, setIsResultView] = useState<boolean>(
    Boolean(initialResult)
  )

  const [result, setResult] = useState<ComparisonResponse | null>(initialResult)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)
  const [periodNotice, setPeriodNotice] = useState<string | null>(initialResult?.requestedPeriod ? `요청 기간: ${initialResult.requestedPeriod.startMonth}~${initialResult.requestedPeriod.endMonth}. 실제 관측 범위를 확인해 주세요.` : null)

  // 아코디언 상태 (기본 접힘)
  const [isMonthlyTableOpen, setIsMonthlyTableOpen] = useState(initialResult?.intent === 'monthly')
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false)

  // URL 동기화
  const updateUrlParams = (params: {
    district: string
    userType: string
    startMonth: string
    endMonth: string
    q?: string
    intent?: string
    districtTypes?: string[]
    userTypes?: string[]
    requestedPeriod?: Pick<Filters, 'startMonth' | 'endMonth'>
  }) => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams()
    if (params.district) sp.set('district', params.district)
    if (params.userType) sp.set('userType', params.userType)
    if (params.startMonth) sp.set('startMonth', params.startMonth)
    if (params.endMonth) sp.set('endMonth', params.endMonth)
    if (params.q) sp.set('q', params.q)
    if (params.intent) sp.set('intent', params.intent)
    if (params.districtTypes) sp.set('districtTypes', params.districtTypes.join(','))
    if (params.userTypes) sp.set('userTypes', params.userTypes.join(','))
    if (params.requestedPeriod) { sp.set('requestedStart', params.requestedPeriod.startMonth); sp.set('requestedEnd', params.requestedPeriod.endMonth) }
    const newUrl = `${window.location.pathname}?${sp.toString()}`
    window.history.replaceState(null, '', newUrl)
  }

  // Both entry points call the same server analysis, including intent and follow-up context.
  const runComparison = async (
    targetDistrict: Filters['districtType'],
    targetUserType: Filters['userType'],
    targetStart: string,
    targetEnd: string,
    queryText = '',
  ) => {
    if (requestInFlight.current) return
    if (targetStart > targetEnd) {
      setErrorMessage('시작월이 종료월보다 늦을 수 없어요. 기간을 다시 확인해 주세요.')
      return
    }
    requestInFlight.current = true
    setIsPending(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({
          question: queryText,
          filters: { districtType: targetDistrict, userType: targetUserType, startMonth: targetStart, endMonth: targetEnd },
          previousContext,
          scope: {
            districtTypes: compareDistricts ? ['제주시', '서귀포시'] : [targetDistrict],
            userTypes: compareUsers ? ['내국인', '중국인'] : [targetUserType],
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '조회에 실패했어요. 잠시 후 다시 시도해 주세요.')
      const next = payload as ComparisonResponse
      setResult(next)
      setDistrict(next.filters.districtType)
      setUserType(next.filters.userType)
      setStartMonth(next.filters.startMonth)
      setEndMonth(next.filters.endMonth)
      setCompareDistricts(next.context.districtTypes.length > 1)
      setCompareUsers(next.context.userTypes.length > 1)
      if (next.status === 'success') setPreviousContext(next.context)
      setIsMonthlyTableOpen(next.intent === 'monthly')
      const requested = next.requestedPeriod
      setPeriodNotice(requested
        ? `요청 기간: ${requested.startMonth}~${requested.endMonth}. 실제 자료는 2016년 9월~2017년 11월이며, 범위가 겹치는 달만 계산해요.`
        : null)
      setIsResultView(true)
      updateUrlParams({ district: next.filters.districtType, userType: next.filters.userType,
        startMonth: next.filters.startMonth, endMonth: next.filters.endMonth, q: queryText, intent: next.intent, districtTypes: next.context.districtTypes, userTypes: next.context.userTypes, requestedPeriod: next.requestedPeriod })
    } catch (error) {
      setErrorMessage(error instanceof Error && error.name !== 'TimeoutError'
        ? error.message : '응답이 늦어지고 있어요. 다시 시도하거나 조건을 직접 선택해 주세요.')
    } finally {
      requestInFlight.current = false
      setIsPending(false)
    }
  }

  const handleQuerySubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    void runComparison(district, userType, startMonth, endMonth, question.trim())
  }

  const handleManualSubmit = () => {
    void runComparison(district, userType, startMonth, endMonth)
  }

  // 조건 바꾸기 / 다른 조건으로 비교하기 -> 입력 화면으로 복귀
  const handleBackToInput = () => {
    setIsResultView(false)
  }

  // 결과 통계 계산
  const stats = useMemo(() => {
    if (!result) return null

    const sat = result.saturdayTotal
    const sun = result.sundayTotal
    const diff = Math.abs(result.difference)
    const total = sat + sun || 1
    const isSatWin = result.saturdayTotal >= result.sundayTotal

    // 동일 눈금 0-기준 비율 산출 (두 값 중 큰 값을 기준으로 하거나 적절한 스케일 적용)
    // 차이가 작으면 막대 길이 차이도 그 비율에 정확히 비례하도록 산출
    const maxVal = Math.max(sat, sun, 1)
    // 상한 스케일에 여유를 주어 막대가 너무 꽉 차지 않게 85% ~ 90% 선으로 스케일링
    const scaleCeil = maxVal * 1.15 || 1
    const satBarWidth = `${Math.min(100, (sat / scaleCeil) * 100)}%`
    const sunBarWidth = `${Math.min(100, (sun / scaleCeil) * 100)}%`

    const appliedDistrict = result.filters.districtType === '제주시' ? '제주시 구도심' : '서귀포시 구도심'
    const appliedUserType = result.filters.userType === '내국인' ? '내국인 관광객' : '중국인 관광객'
    const sOpt = MONTH_OPTIONS.find((m) => m.value === result.filters.startMonth)?.label || result.filters.startMonth
    const eOpt = MONTH_OPTIONS.find((m) => m.value === result.filters.endMonth)?.label || result.filters.endMonth
    const appliedPeriodText = result.intent === 'availability' ? '조회 가능 기간 확인' : result.filters.startMonth === result.filters.endMonth ? sOpt : `${sOpt} ~ ${eOpt}`

    return {
      sat,
      sun,
      diff,
      total,
      isSatWin,
      satBarWidth,
      sunBarWidth,
      appliedDistrict,
      appliedUserType,
      appliedPeriodText,
    }
  }, [result])

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#111C2C] font-sans antialiased flex flex-col justify-between relative selection:bg-[#355FA4]/20 selection:text-[#355FA4] overflow-x-hidden">
      
      {/* 1. 상단 내비게이션 바 (공통 디자인) */}
      <header className="sticky top-0 z-40 w-full bg-[#F8F9FA]/90 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-[700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* 좌측 로고 */}
          <Link className="flex items-center gap-2.5 group" href="/">
            <div className="w-8 h-8 rounded-lg bg-[#355FA4] flex items-center justify-center text-white shadow-2xs transition-transform group-hover:scale-105">
              <Waves className="size-4.5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#111C2C]">제주머니</span>
          </Link>

          {/* 우측 바로가기 */}
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link
              href="/"
              className="text-slate-600 hover:text-[#355FA4] transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="size-3.5" />
              <span>처음으로</span>
            </Link>
            <div className="h-3.5 w-px bg-slate-300" />
            <a
              href="https://jejudatahub.net/data/view/data/608"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 text-xs"
              title="제주데이터허브 공식 포털 바로가기"
            >
              <span>자료 출처</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </header>

      {/* 2. 메인 콘텐츠 컨테이너 (너비 max-w-[700px] 중앙 정렬) */}
      <main className="flex-1 w-full max-w-[700px] mx-auto px-4 sm:px-6 py-8 sm:py-12 z-10">
        
        {/* ======================================================== */}
        {/* [화면 A: 비교 입력 화면] (!isResultView)                  */}
        {/* ======================================================== */}
        {isResultView && errorMessage && (
          <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage}</div>
        )}
        {!isResultView || !stats || !result ? (
          <div className="space-y-6 sm:space-y-7">
            {/* 타이틀 & 설명 */}
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111C2C] tracking-tight">
                어떤 주말 소비가 궁금하세요?
              </h1>
              <p className="text-base text-slate-600 font-normal">
                궁금한 내용을 적거나 조건을 골라보세요.
              </p>
            </div>

            {/* 오류 메시지 (유효하지 않은 조건/기간) */}
            {errorMessage && (
              <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 넓은 질문 입력창 + '질문으로 보기' 버튼 (한 줄 배치) */}
            <form onSubmit={handleQuerySubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <div className="relative flex-1 flex items-center bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus-within:border-[#355FA4] focus-within:ring-1 focus-within:ring-[#355FA4]">
                <input
                  type="text"
                  aria-label="궁금한 주말 소비 질문"
                  maxLength={500}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="예: 17년 11월 제주시 내국인 관광객 비교"
                  className="w-full bg-transparent border-0 outline-hidden text-[#111C2C] text-base py-3 placeholder:text-slate-400"
                />
                {question && (
                  <button
                    type="button"
                    onClick={() => setQuestion('')}
                    className="text-slate-400 hover:text-slate-600 ml-1.5 cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="h-12 px-6 rounded-lg bg-[#355FA4] hover:bg-[#2B4F8A] text-white text-base font-semibold transition-colors shadow-2xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-70"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>조회 중...</span>
                  </>
                ) : (
                  <span>질문으로 보기</span>
                )}
              </button>
            </form>

            {/* 구분선 */}
            <div className="border-t border-slate-200/80 my-6" />

            {/* '직접 골라도 돼요' 2열 4개 항목 그리드 */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-[#111C2C]">
                직접 골라도 돼요
              </h2>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={compareDistricts} onChange={e => setCompareDistricts(e.target.checked)} />두 구도심 함께 비교</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={compareUsers} onChange={e => setCompareUsers(e.target.checked)} />두 관광객 유형 함께 비교</label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1) 지역 */}
                <div className="space-y-1.5">
                  <label htmlFor="district" className="text-sm font-semibold text-slate-700">지역</label>
                  <div className="relative">
                    <select id="district"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value as '제주시' | '서귀포시')}
                      className="w-full h-12 px-3.5 bg-white border border-slate-300 rounded-lg text-base text-slate-900 appearance-none outline-hidden focus:border-[#355FA4] focus:ring-1 focus:ring-[#355FA4] cursor-pointer"
                    >
                      <option value="제주시">제주시 구도심</option>
                      <option value="서귀포시">서귀포시 구도심</option>
                    </select>
                    <ChevronDown className="size-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 2) 관광객 */}
                <div className="space-y-1.5">
                  <label htmlFor="visitor" className="text-sm font-semibold text-slate-700">관광객</label>
                  <div className="relative">
                    <select id="visitor"
                      value={userType}
                      onChange={(e) => setUserType(e.target.value as '내국인' | '중국인')}
                      className="w-full h-12 px-3.5 bg-white border border-slate-300 rounded-lg text-base text-slate-900 appearance-none outline-hidden focus:border-[#355FA4] focus:ring-1 focus:ring-[#355FA4] cursor-pointer"
                    >
                      <option value="내국인">내국인 관광객</option>
                      <option value="중국인">중국인 관광객</option>
                    </select>
                    <ChevronDown className="size-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 3) 언제부터 (시작월) */}
                <div className="space-y-1.5">
                  <label htmlFor="start-month" className="text-sm font-semibold text-slate-700">언제부터</label>
                  <div className="relative">
                    <select id="start-month"
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="w-full h-12 px-3.5 bg-white border border-slate-300 rounded-lg text-base text-slate-900 appearance-none outline-hidden focus:border-[#355FA4] focus:ring-1 focus:ring-[#355FA4] cursor-pointer"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="size-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 4) 언제까지 (종료월) */}
                <div className="space-y-1.5">
                  <label htmlFor="end-month" className="text-sm font-semibold text-slate-700">언제까지</label>
                  <div className="relative">
                    <select id="end-month"
                      value={endMonth}
                      onChange={(e) => setEndMonth(e.target.value)}
                      className="w-full h-12 px-3.5 bg-white border border-slate-300 rounded-lg text-base text-slate-900 appearance-none outline-hidden focus:border-[#355FA4] focus:ring-1 focus:ring-[#355FA4] cursor-pointer"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="size-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 바: 자료 기간 안내 & '고른 조건으로 비교하기' 버튼 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3">
              <span className="text-xs text-slate-500 font-medium">
                자료 기간 2016년 9월~2017년 11월
              </span>

              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={isPending}
                className="w-full sm:w-auto h-12 px-6 rounded-lg bg-[#355FA4] hover:bg-[#2B4F8A] text-white text-base font-semibold transition-colors shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>비교 중...</span>
                  </>
                ) : (
                  <span>고른 조건으로 비교하기</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* [화면 B: 비교 결과 화면] (isResultView)                   */
          /* ======================================================== */
          <div className="space-y-6 sm:space-y-7">
            
            {/* 상단: 적용 조건 텍스트 & '조건 바꾸기' 작은 버튼 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm sm:text-base font-medium text-slate-700">
                {result.context.districtTypes.join('·')} 구도심 · {result.context.userTypes.join('·')} 관광객 · {stats.appliedPeriodText}
              </span>

              <button
                type="button"
                onClick={handleBackToInput}
                className="h-8 px-3 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Pencil className="size-3 text-slate-500" />
                <span>조건 바꾸기</span>
              </button>
            </div>

            {/* 비관측 기간 자동 보정 안내 배너 (해당 시) */}
            {periodNotice && (
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm flex items-start gap-2">
                <Info className="size-4 text-[#355FA4] shrink-0 mt-0.5" />
                <span>{periodNotice}</span>
              </div>
            )}

            <div className="space-y-2" aria-live="polite">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111C2C] tracking-tight leading-snug">{result.summary}</h2>
              <p className="text-xs text-slate-500">{result.interpretation.source === 'nvidia' ? 'AI가 질문 조건을 정리했어요.' : result.interpretation.source === 'direct' ? '직접 고른 조건으로 계산했어요.' : '기본 질문 해석으로 조건을 정리했어요.'} 모든 수치는 실제 자료로 계산해요.</p>
              {(result.interpretation.notice || result.dataset.warning) && <p className="text-sm text-amber-800">{result.interpretation.notice || result.dataset.warning}</p>}
              {result.coverage && <p className="text-sm text-slate-600">비교 가능한 월: {result.coverage.availableMonths.join(', ') || '없음'}</p>}
            </div>

            {result.groupComparison && (
              <div className="space-y-3">
                <h3 className="font-bold">같은 달로 맞춘 지역·관광객 비교</h3>
                <p className="text-xs text-slate-600">공통으로 자료가 있는 {result.groupComparison.includedMonths.length}개월만 사용했어요. 비중은 각 조합 안에서 토요일÷(토요일+일요일)로 계산해요.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.groupComparison.groups.map(group => {
                    const total = group.saturdayTotal + group.sundayTotal
                    const satMonths = group.rows.filter(row => row.difference > 0).length
                    const sunMonths = group.rows.filter(row => row.difference < 0).length
                    const ties = group.rows.filter(row => row.difference === 0).length
                    return <article key={`${group.filters.districtType}-${group.filters.userType}`} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                      <h4 className="font-bold">{group.filters.districtType} · {group.filters.userType}</h4>
                      <p className="mt-2 text-teal-800">토요일 {group.saturdayTotal.toLocaleString()}건</p>
                      <p className="text-blue-800">일요일 {group.sundayTotal.toLocaleString()}건</p>
                      <p className="mt-2">차이 {group.difference > 0 ? '+' : ''}{group.difference.toLocaleString()}건 · 토요일 비중 {total ? `${(group.saturdayTotal / total * 100).toFixed(1)}%` : '계산 불가(전체 0건)'}</p>
                      <p className="mt-2 text-xs text-slate-600">토요일이 많았던 달 {satMonths}개 · 일요일이 많았던 달 {sunMonths}개 · 같은 달 {ties}개</p>
                      {result.intent === 'monthly' && <details open className="mt-3 text-xs"><summary>월별 수치</summary><ul className="mt-2 space-y-1">{group.rows.map(row => <li key={row.month}>{row.month} · 토 {row.saturday.toLocaleString()}건 / 일 {row.sunday.toLocaleString()}건</li>)}</ul></details>}
                    </article>
                  })}
                </div>
              </div>
            )}

            {!result.groupComparison && result.status === 'success' && result.intent !== 'availability' && <>
            {/* 토요일과 일요일 2개 가로 막대 비교 섹션 */}
            <div className="space-y-3 pt-2">
              <div className="text-sm font-semibold text-slate-700">
                토요일과 일요일 비교
              </div>

              {/* 1) 토요일 라인 */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm sm:text-base">
                  <span className="font-bold text-[#111C2C]">토요일</span>
                  <span className="font-extrabold text-[#111C2C] tabular-nums">
                    {stats.sat.toLocaleString()}건
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0D9488] transition-all duration-700 ease-out"
                    style={{ width: stats.satBarWidth }}
                  />
                </div>
              </div>

              {/* 2) 일요일 라인 */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between items-center text-sm sm:text-base">
                  <span className="font-bold text-[#111C2C]">일요일</span>
                  <span className="font-extrabold text-[#111C2C] tabular-nums">
                    {stats.sun.toLocaleString()}건
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#355FA4] transition-all duration-700 ease-out"
                    style={{ width: stats.sunBarWidth }}
                  />
                </div>
              </div>

              {/* 캡션 안내 */}
              <p className="text-xs text-slate-500 pt-1">
                선택한 기간의 결제 건수를 합산했어요.
              </p>
            </div>

            </>}

            {/* 접이식 아코디언 1: '달마다 어떻게 달랐나요?' */}
            <div className="border border-slate-200/80 rounded-xl bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setIsMonthlyTableOpen(!isMonthlyTableOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left text-sm font-bold text-[#111C2C] hover:bg-slate-50 transition cursor-pointer"
              >
                <span>달마다 어떻게 달랐나요?</span>
                <ChevronDown
                  className={`size-4 text-slate-500 transition-transform duration-200 ${
                    isMonthlyTableOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isMonthlyTableOpen && (
                <div className="border-t border-slate-100 p-4 sm:p-5 bg-slate-50/50">
                  <div className="overflow-x-auto">
                    {result.groupComparison && <p className="mb-3 text-xs">아래 표는 {stats.appliedDistrict} · {stats.appliedUserType}의 공통 월 수치예요.</p>}
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="text-xs font-semibold text-slate-500 border-b border-slate-200/80">
                          <th className="py-2.5 px-1 sm:px-3">월</th>
                          <th className="py-2.5 px-1 sm:px-3 text-right">토요일 결제</th>
                          <th className="py-2.5 px-1 sm:px-3 text-right">일요일 결제</th>
                          <th className="py-2.5 px-1 sm:px-3 text-center">차이</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result?.rows && result.rows.length > 0 ? (
                          result.rows.map((row) => {
                            const isSatWinRow = row.saturday >= row.sunday
                            const diffRow = Math.abs(row.difference)
                            return (
                              <tr key={row.month} className="hover:bg-white transition-colors">
                                <td className="py-3 px-1 sm:px-3 font-semibold text-[#111C2C]">
                                  {row.month.replace('-', '년 ')}월
                                </td>
                                <td className="py-3 px-1 sm:px-3 text-right tabular-nums text-[#0D9488] font-bold">
                                  {row.saturday.toLocaleString()}건
                                </td>
                                <td className="py-3 px-1 sm:px-3 text-right tabular-nums text-[#355FA4] font-bold">
                                  {row.sunday.toLocaleString()}건
                                </td>
                                <td className="py-3 px-1 sm:px-3 text-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                      isSatWinRow
                                        ? 'bg-teal-50 text-teal-800 border border-teal-200/60'
                                        : 'bg-blue-50 text-blue-800 border border-blue-200/60'
                                    }`}
                                  >
                                    {row.difference === 0 ? '같음' : `${isSatWinRow ? '토요일' : '일요일'} ${diffRow.toLocaleString()}건 많음`}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-xs text-slate-400">
                              상세 월별 집계 내역이 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* 접이식 아코디언 2: '자료와 계산 방법 보기' */}
            <div className="border border-slate-200/80 rounded-xl bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setIsMethodologyOpen(!isMethodologyOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left text-sm font-bold text-[#111C2C] hover:bg-slate-50 transition cursor-pointer"
              >
                <span>자료와 계산 방법 보기</span>
                <ChevronDown
                  className={`size-4 text-slate-500 transition-transform duration-200 ${
                    isMethodologyOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isMethodologyOpen && (
                <div className="border-t border-slate-100 p-5 bg-slate-50/50 text-xs sm:text-sm text-slate-600 space-y-3 leading-relaxed">
                  <div>
                    <strong className="text-[#111C2C] block mb-0.5">1. 데이터 출처</strong>
                    <p>
                      <a className="underline" href="https://jejudatahub.net/data/view/data/608" target="_blank" rel="noopener noreferrer">제주데이터허브 608번 관광지 및 상업지구 요일별 카드 데이터</a>를 사용합니다. 내국인·중국인 관광객 자료이며, 도민 전체 소비나 현재 매출을 나타내지 않아요.
                    </p>
                  </div>
                  <div>
                    <strong className="text-[#111C2C] block mb-0.5">2. 같은 월의 토·일 자료를 합산해요</strong>
                    <p>
                      같은 지역·관광객 유형에서 토요일과 일요일 값이 각각 하나씩 유효한 달만 포함해요. 0건도 포함하며, 빠지거나 중복된 값은 제외해요. 차이는 토요일 합계−일요일 합계예요. 월별 집계 자료이므로 주차별 짝맞춤이나 하루 평균으로 해석하지 않아요.
                    </p>
                  </div>
                  <div>
                    <strong className="text-[#111C2C] block mb-0.5">3. 관측 기간 및 제외 이유</strong>
                    <p>
                      공식 수집 기간은 <strong>2016년 9월부터 2017년 11월까지(총 15개월)</strong>입니다. 실제 적용 버전은 {result.dataset.version}, 관측 범위는 {result.dataset.observedStart}~{result.dataset.observedEnd}이며 {result.dataset.rowCount}행을 사용해요. 갱신 시각은 관측 시점과 달라요.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {result.excludedMonths.length > 0 && (
              <details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <summary className="cursor-pointer font-semibold">계산에서 빠진 달 {result.excludedMonths.length}개와 이유</summary>
                <ul className="mt-3 space-y-2">{result.excludedMonths.map(row => <li key={row.month}>{row.month}: {row.reason}</li>)}</ul>
              </details>
            )}
            <form onSubmit={handleQuerySubmit} className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="이어서 질문하기" maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} placeholder="예: 그 차이가 매달 비슷했어?" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-3 text-base" />
              <button disabled={isPending} className="rounded-lg bg-[#355FA4] px-5 py-3 font-semibold text-white disabled:opacity-60">{isPending ? '조회 중...' : '이어서 질문하기'}</button>
            </form>

            {/* 하단 링크: '다른 조건으로 비교하기 →' */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleBackToInput}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#355FA4] hover:text-[#2B4F8A] transition-colors cursor-pointer"
              >
                <span>다른 조건으로 비교하기</span>
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 3. 제주 풍경 배경 (화면 하단 25~30% 배치: 완만한 한라산 능선, 옅은 청록색 바다, 현무암) */}
      <div
        className="absolute bottom-0 left-0 right-0 w-full pointer-events-none select-none overflow-hidden z-0"
        style={{
          height: 'clamp(200px, 28vh, 360px)',
        }}
        aria-hidden="true"
      >
        {/* 상단 부드러운 페이드 그라데이션 오버레이 (#F8F9FA와 자연스럽게 융합) */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, #F8F9FA 0%, rgba(248, 249, 250, 0.85) 15%, rgba(248, 249, 250, 0.3) 40%, rgba(248, 249, 250, 0) 100%)',
          }}
        />

        {/* 제주 아침 풍경 이미지 */}
        <img
          src="/images/jeju-landscape.jpg"
          alt="제주 한라산과 옅은 청록색 바다, 현무암 풍경"
          className="w-full h-full object-cover object-bottom opacity-85 brightness-[1.02] contrast-[0.98]"
          style={{
            WebkitMaskImage:
              'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 45%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 45%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>

      {/* 4. Clean Minimal Footer (풍경 위에서도 선명하게 읽히도록 처리) */}
      <footer className="relative z-20 w-full py-5 text-center text-xs">
        <div className="max-w-[700px] mx-auto px-4 sm:px-6">
          <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-2xs text-slate-700 font-medium tracking-tight">
            제주머니 · 자료 출처 제주데이터허브
          </span>
        </div>
      </footer>
    </div>
  )
}
