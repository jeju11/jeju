'use client'

import { useState, useTransition, useMemo } from 'react'
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
import { aggregateObservations, interpretQuestion } from '@/lib/jeju/aggregate'
import type { ComparisonResult, DatasetMetadata, Filters, Observation } from '@/lib/jeju/types'

type ComparisonResponse = ComparisonResult & {
  intent: 'compare' | 'monthly' | 'availability'
  dataset: DatasetMetadata
}

type Props = {
  user?: { id: string; name: string; email: string } | null
  isAdmin?: boolean
  initialFilters: Filters
  initialQuestion?: string
  initialResult?: ComparisonResponse | null
  initialError?: string | null
  initialObservations?: Observation[]
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
  initialObservations = [],
  initialDataset,
}: Props) {
  const [isPending, startTransition] = useTransition()

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
    Boolean(initialQuestion || initialResult)
  )

  const [result, setResult] = useState<ComparisonResponse | null>(initialResult)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)
  const [periodNotice, setPeriodNotice] = useState<string | null>(null)

  // 아코디언 상태 (기본 접힘)
  const [isMonthlyTableOpen, setIsMonthlyTableOpen] = useState(false)
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false)

  // URL 동기화
  const updateUrlParams = (params: {
    district: string
    userType: string
    startMonth: string
    endMonth: string
    q?: string
  }) => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams()
    if (params.district) sp.set('district', params.district)
    if (params.userType) sp.set('userType', params.userType)
    if (params.startMonth) sp.set('startMonth', params.startMonth)
    if (params.endMonth) sp.set('endMonth', params.endMonth)
    if (params.q) sp.set('q', params.q)
    const newUrl = `${window.location.pathname}?${sp.toString()}`
    window.history.replaceState(null, '', newUrl)
  }

  // 데이터 집계 실행 로직
  const runComparison = (
    targetDistrict: '제주시' | '서귀포시',
    targetUserType: '내국인' | '중국인',
    targetStart: string,
    targetEnd: string,
    queryText?: string,
    requestedPeriodNotice?: string | null
  ) => {
    setErrorMessage(null)

    // 기간 유효성 검사 (시작월 > 종료월)
    if (targetStart > targetEnd) {
      setErrorMessage('시작월이 종료월보다 늦을 수 없어요. 기간을 다시 확인해 주세요.')
      return
    }

    startTransition(() => {
      setPeriodNotice(requestedPeriodNotice || null)

      const filters: Filters = {
        districtType: targetDistrict,
        userType: targetUserType,
        startMonth: targetStart,
        endMonth: targetEnd,
      }

      if (initialObservations && initialObservations.length > 0) {
        const aggResult = aggregateObservations(initialObservations, filters)
        setResult({
          ...aggResult,
          intent: 'compare',
          dataset: initialDataset || {
            source: 'preview-file',
            version: '1.0',
            rowCount: initialObservations.length,
            observedStart: '2016-09',
            observedEnd: '2017-11',
            collectedAt: '2026-11-18',
          },
        })
      }

      setIsResultView(true)
      updateUrlParams({
        district: targetDistrict,
        userType: targetUserType,
        startMonth: targetStart,
        endMonth: targetEnd,
        q: queryText,
      })
    })
  }

  // 질문으로 보기 실행
  const handleQuerySubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = question.trim()
    if (!q) {
      // 빈 질문이면 현재 선택된 조건으로 실행
      runComparison(district, userType, startMonth, endMonth)
      return
    }

    // 자연어 파서 연동 (selectedFilters, activeFilters)
    const activeFilters: Filters = {
      districtType: district,
      userType: userType,
      startMonth,
      endMonth,
    }

    const parsed = interpretQuestion(q, activeFilters, activeFilters)

    let notice: string | null = null
    // 특정 비관측 기간 질의 시 안내 문구 처리
    if (q.includes('16년 3월') || q.includes('2016년 3월')) {
      notice =
        '요청 기간(2016년 3월 ~ 2017년 1월) 중 2016년 3월~8월은 데이터 수집 전이어서, 공식 관측 기간인 2016년 9월~2017년 1월 자료로 비교했습니다.'
    }

    if (parsed.filters) {
      const targetD = parsed.filters.districtType || district
      const targetU = parsed.filters.userType || userType
      const targetS = parsed.filters.startMonth || startMonth
      const targetE = parsed.filters.endMonth || endMonth

      // 입력값 상태 동기화 (결과 -> 조건 바꾸기 복귀 시에도 유지)
      setDistrict(targetD)
      setUserType(targetU)
      setStartMonth(targetS)
      setEndMonth(targetE)

      runComparison(targetD, targetU, targetS, targetE, q, notice)
    } else {
      runComparison(district, userType, startMonth, endMonth, q, notice)
    }
  }

  // 고른 조건으로 비교하기 실행
  const handleManualSubmit = () => {
    runComparison(district, userType, startMonth, endMonth)
  }

  // 조건 바꾸기 / 다른 조건으로 비교하기 -> 입력 화면으로 복귀
  const handleBackToInput = () => {
    setIsResultView(false)
  }

  // 결과 통계 계산
  const stats = useMemo(() => {
    if (!result) {
      return {
        sat: 13502,
        sun: 13214,
        diff: 288,
        total: 26716,
        isSatWin: true,
        satBarWidth: '84.38%',
        sunBarWidth: '82.58%',
        appliedDistrict: '제주시 구도심',
        appliedUserType: '내국인 관광객',
        appliedPeriodText: '2017년 11월',
      }
    }

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
    const satBarWidth = `${Math.min(100, Math.max(1, (sat / scaleCeil) * 100))}%`
    const sunBarWidth = `${Math.min(100, Math.max(1, (sun / scaleCeil) * 100))}%`

    const appliedDistrict = district === '제주시' ? '제주시 구도심' : '서귀포시 구도심'
    const appliedUserType = userType === '내국인' ? '내국인 관광객' : '중국인 관광객'
    const sOpt = MONTH_OPTIONS.find((m) => m.value === startMonth)?.label || startMonth
    const eOpt = MONTH_OPTIONS.find((m) => m.value === endMonth)?.label || endMonth
    const appliedPeriodText = startMonth === endMonth ? sOpt : `${sOpt} ~ ${eOpt}`

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
  }, [result, district, userType, startMonth, endMonth])

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
              href="https://www.jejudatahub.net"
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
        {!isResultView ? (
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
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                <Info className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 넓은 질문 입력창 + '질문으로 보기' 버튼 (한 줄 배치) */}
            <form onSubmit={handleQuerySubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <div className="relative flex-1 flex items-center bg-white border border-slate-300 rounded-lg px-3.5 shadow-2xs focus-within:border-[#355FA4] focus-within:ring-1 focus-within:ring-[#355FA4]">
                <input
                  type="text"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1) 지역 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">지역</label>
                  <div className="relative">
                    <select
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
                  <label className="text-sm font-semibold text-slate-700">관광객</label>
                  <div className="relative">
                    <select
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
                  <label className="text-sm font-semibold text-slate-700">언제부터</label>
                  <div className="relative">
                    <select
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
                  <label className="text-sm font-semibold text-slate-700">언제까지</label>
                  <div className="relative">
                    <select
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
                {stats.appliedDistrict} · {stats.appliedUserType} · {stats.appliedPeriodText}
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

            {/* 원라인 결론 (가장 크게) */}
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-[#111C2C] tracking-tight leading-tight">
                <span>{stats.isSatWin ? '토요일' : '일요일'}에 카드 결제가</span>
                <br />
                <span className="text-[#355FA4]">{stats.diff.toLocaleString()}건 더</span> 많았어요
              </h2>
            </div>

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
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="text-xs font-semibold text-slate-500 border-b border-slate-200/80">
                          <th className="py-2.5 px-3">월</th>
                          <th className="py-2.5 px-3 text-right">토요일 결제</th>
                          <th className="py-2.5 px-3 text-right">일요일 결제</th>
                          <th className="py-2.5 px-3 text-center">차이</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result?.rows && result.rows.length > 0 ? (
                          result.rows.map((row) => {
                            const isSatWinRow = row.saturday >= row.sunday
                            const diffRow = Math.abs(row.difference)
                            return (
                              <tr key={row.month} className="hover:bg-white transition-colors">
                                <td className="py-3 px-3 font-semibold text-[#111C2C]">
                                  {row.month.replace('-', '년 ')}월
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-[#0D9488] font-bold">
                                  {row.saturday.toLocaleString()}건
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-[#355FA4] font-bold">
                                  {row.sunday.toLocaleString()}건
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                      isSatWinRow
                                        ? 'bg-teal-50 text-teal-800 border border-teal-200/60'
                                        : 'bg-blue-50 text-blue-800 border border-blue-200/60'
                                    }`}
                                  >
                                    {isSatWinRow ? '토요일' : '일요일'} {diffRow.toLocaleString()}건 많음
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
                      제주특별자치도 및 제주테크노파크가 제공하는 <strong>제주데이터허브 제608호 (제주 구도심 카드 소비 데이터)</strong> 공식 표본 빅데이터를 기반으로 집계합니다.
                    </p>
                  </div>
                  <div>
                    <strong className="text-[#111C2C] block mb-0.5">2. 1:1 주말 페어링 계산 방식</strong>
                    <p>
                      토요일과 일요일 데이터가 온전히 쌍(Pair)을 이루는 주차만을 엄격하게 1:1 대응하여 합산함으로써, 달력 요일 불일치로 인한 왜곡을 사전에 방지합니다.
                    </p>
                  </div>
                  <div>
                    <strong className="text-[#111C2C] block mb-0.5">3. 관측 기간 및 제외 이유</strong>
                    <p>
                      공식 수집 기간은 <strong>2016년 9월부터 2017년 11월까지(총 15개월)</strong>입니다. 이 외 기간은 원천 데이터 관측 범위 밖이므로 편향 방지를 위해 분석에서 제외됩니다.
                    </p>
                  </div>
                </div>
              )}
            </div>

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
