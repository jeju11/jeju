'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Folder,
  History,
  Lock,
  MapPin,
  Printer,
  RefreshCw,
  Scale,
  ShieldCheck,
  Stamp,
  User,
  UserRound,
  Verified,
} from 'lucide-react'

type QueryHistoryItem = {
  id: string
  question: string
  districtType: string
  userType: string
  startMonth: string
  endMonth: string
  createdAt: string
}

type Props = {
  user: { id: string; name: string; email: string } | null
  isAdmin: boolean
  historyItems: QueryHistoryItem[]
}

const sampleFolders = [
  {
    id: 'general-assembly',
    title: '2024 상인회 정기총회 안건 (채택)',
    district: '제주시 구도심',
    target: '내국인 소비',
    period: '2017년 11월',
    satTotal: '13,502',
    sunTotal: '13,214',
    diff: '+288',
    diffRate: '+2.18%',
    dominant: '토요일 우세',
    agendaTitle: '제주시 구도심 상권 주말(토·일) 영업일 인력 및 재고 배분 안건 의결의 건',
    guidance:
      '빅데이터 관측 결과 주말 결제 건수가 토요일에 가중치(+288건)를 보이고 있으므로, 상권 내 회원 점포는 주말 인건비 지출 총액을 유지하되 토요일 오후 조(14~19시) 인력을 15% 확충하고, 일요일 19:30 이후 조기 마감 및 재고 결산을 통한 운영 고정비 절감 전략을 총회 결의로 권고함.',
    authKey: 'JTP-AUTH-88F4-0012',
    docNo: '제주-JTP-2024-1108호',
  },
  {
    id: 'seogwipo-night',
    title: '서귀포 야간 차없는거리 심의 안건',
    district: '서귀포시 구도심',
    target: '내국인 소비',
    period: '2017년 11월',
    satTotal: '11,507',
    sunTotal: '10,509',
    diff: '+998',
    diffRate: '+9.50%',
    dominant: '토요일 우세',
    agendaTitle: '서귀포 매일올레·이중섭거리 주말 야간 보행전용거리 지정 심의의 건',
    guidance:
      '서귀포시 구도심은 토요일 야간 식음료 트래픽이 일요일 대비 +998건(+9.5%) 압도적으로 우세합니다. 토요일 18:00~22:00 차 없는 거리 운영 및 플리마켓 연계 집중 지원을 건의함.',
    authKey: 'JTP-AUTH-91A2-0045',
    docNo: '제주-JTP-2024-1115호',
  },
]

export function ReportDashboard({ user, isAdmin, historyItems }: Props) {
  const [selectedFolderId, setSelectedFolderId] = useState<'general-assembly' | 'seogwipo-night'>('general-assembly')
  const [isStampActive, setIsStampActive] = useState(true)
  const [isExportingExcel, setIsExportingExcel] = useState(false)

  const activeProject = sampleFolders.find((f) => f.id === selectedFolderId) || sampleFolders[0]

  function handlePrint() {
    window.print()
  }

  function handleExportExcel() {
    setIsExportingExcel(true)
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      `문서관리번호,${activeProject.docNo}\n` +
      `안건명,${activeProject.agendaTitle}\n` +
      `대상권역,${activeProject.district}\n` +
      `소비자군,${activeProject.target}\n` +
      `기준연월,${activeProject.period}\n` +
      `토요일결제건,${activeProject.satTotal}\n` +
      `일요일결제건,${activeProject.sunTotal}\n` +
      `순차이량,${activeProject.diff}\n` +
      `격차율,${activeProject.diffRate}\n` +
      `우세판정,${activeProject.dominant}\n` +
      `전자서명검증키,${activeProject.authKey}\n`

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${activeProject.docNo}_주말소비정량리포트.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => setIsExportingExcel(false), 800)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-slate-900 antialiased selection:bg-[#005BAC] selection:text-white">
      {/* 1. GNB (Global Navigation Bar - 명세서 1.3 표준) */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white shadow-sm print:hidden">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-slate-900">(재)제주테크노파크</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                  빅데이터 센터
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500">제주 구도심 주말소비 정밀 분석 포털</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              서비스 소개
            </Link>
            <Link
              href="/console"
              className="px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              데이터 분석 콘솔
            </Link>
            <Link
              href="/history"
              className="border-b-2 border-[#005BAC] px-4 py-2 text-sm font-semibold text-[#005BAC] transition-colors"
            >
              상인회 의사결정 보고서 / 이력
            </Link>
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 xl:inline-flex">
              <span className="size-2 rounded-full bg-emerald-500" />
              공식 제608호 관측 검증 (2016.09 ~ 2017.11)
            </span>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{user.name} 님</span>
                <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <UserRound className="size-4" />
                </div>
              </div>
            ) : (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-1.5 rounded bg-[#005BAC] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#004380]"
              >
                <span>로그인 / 상인회 인증</span>
                <User className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 2. Top Official Document Controller Bar (명세서 4.1) */}
      <div className="border-b border-slate-200 bg-white shadow-sm print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#005BAC]">
              <FileCheck className="size-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-slate-900 sm:text-base">
                상인회 정량 의사결정 공식 리포트 및 분석 이력
              </h1>
              <p className="text-xs text-slate-500">
                (재)제주테크노파크 원장 직인 날인 · 소상공인시장진흥공단 및 지자체 제출 공인 표준 A4 규격
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsStampActive(!isStampActive)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold shadow-sm transition ${
                isStampActive
                  ? 'border border-rose-300 bg-rose-50 text-rose-700'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Stamp className="size-3.5" />
              <span>{isStampActive ? '직인 날인 해제' : '직인 날인 적용'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              <span>{isExportingExcel ? '내보내는 중…' : '엑셀(CSV) 다운'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded bg-[#005BAC] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#004380]"
            >
              <Printer className="size-3.5" />
              <span>공식 회의용 A4 리포트 인쇄 / PDF 저장</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Content Layout (4:8 Split - 명세서 4.1) */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* 좌측 사이드 패널 (Col-4) - print:hidden */}
          <aside className="space-y-6 lg:col-span-4 print:hidden">
            {/* 1. 소속 상인회 인증 카드 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Verified className="size-4" />
                  </span>
                  <span className="text-xs font-bold text-slate-900">상인회 파트너십 인증</span>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  정회원
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">제주시 구도심상인상생협의회</h3>
                <p className="text-xs text-slate-500">인증번호: JTP-PARTNER-2024-0038</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  (재)제주테크노파크 디지털융합센터와 제주데이터허브가 빅데이터 기반 골목상권 활성화를 위해 공인한 의결 단체입니다.
                </p>
              </div>
            </div>

            {/* 2. 즐겨찾는 안건 폴더 (프로젝트 탭) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="size-4 text-[#005BAC]" />
                  <h3 className="text-xs font-bold text-slate-900">심의 안건 프로젝트</h3>
                </div>
                <span className="text-[11px] text-slate-400">2건 등록</span>
              </div>
              <div className="space-y-2">
                {sampleFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedFolderId(folder.id as 'general-assembly' | 'seogwipo-night')}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedFolderId === folder.id
                        ? 'border-[#005BAC] bg-[#EFF6FF]'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{folder.title}</span>
                      <span className="text-[10px] font-semibold text-slate-500">{folder.period}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
                      <span>{folder.district}</span>
                      <span>·</span>
                      <span className="font-bold text-[#005BAC]">{folder.diff}건 ({folder.diffRate})</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 최근 질문 히스토리 필터 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-slate-600" />
                  <h3 className="text-xs font-bold text-slate-900">최근 질문 히스토리</h3>
                </div>
                {user && <span className="text-[11px] text-slate-400">{historyItems.length}건 기록</span>}
              </div>

              {historyItems.length > 0 ? (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {historyItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/console?replay=${encodeURIComponent(item.id)}`}
                      className="block rounded-lg border border-slate-200 bg-[#F8F9FA] p-2.5 transition hover:border-[#005BAC] hover:bg-white"
                    >
                      <p className="line-clamp-1 text-xs font-semibold text-slate-800">{item.question}</p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{item.districtType} · {item.userType}</span>
                        <span>{item.startMonth}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">&apos;17년 11월 제주 구도심 내국인</p>
                    <span className="text-[11px] text-slate-400">토 13,502건 vs 일 13,214건</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">서귀포시 17년 11월 내국인</p>
                    <span className="text-[11px] text-slate-400">토 11,507건 vs 일 10,509건</span>
                  </div>
                  {!user && (
                    <p className="pt-1 text-[11px] text-slate-400">
                      로그인하시면 직접 질의한 비교 이력이 이곳에 자동으로 영구 보존됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 4. 행정기관 무결성 보증 배너 */}
            <div className="rounded-xl border border-blue-200 bg-[#EFF6FF] p-4 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-bold text-[#005BAC]">
                <ShieldCheck className="size-4" />
                <span>공공데이터 행정 효력 증명</span>
              </div>
              <p className="mt-1.5 text-slate-600 leading-relaxed">
                본 리포트는 제주데이터허브 제608호 관측 데이터와 1:1 완결 페어링 알고리즘으로 산출되어 소상공인시장진흥공단 지원사업 심의 및 지자체 조례 안건으로 공식 제출 가능합니다.
              </p>
            </div>
          </aside>

          {/* 우측 A4 공식 공문서 본체 (Col-8) - 인쇄 시 단독 A4 출력 */}
          <section className="lg:col-span-8 print:w-full print:max-w-none">
            {/* A4 용지 컨테이너 (실제 인쇄 규격 매핑 - 명세서 4.2 스니펫) */}
            <div className="relative mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-8 shadow-lg sm:p-12 print:border-none print:p-0 print:shadow-none">
              {/* 공식 직인 스탬프 (우측 상단 6도 회전 적색 원형 직인) */}
              {isStampActive && (
                <div className="absolute right-8 top-8 flex flex-col items-center sm:right-10 sm:top-10">
                  <div className="flex size-20 rotate-6 flex-col items-center justify-center rounded-full border-2 border-red-600 bg-red-50/20 p-1">
                    <span className="text-[9px] font-bold tracking-tighter text-red-600">제주테크노파크</span>
                    <span className="text-xs font-black tracking-wider text-red-700">원 장</span>
                    <span className="text-[9px] font-bold text-red-600">직 인</span>
                  </div>
                  <span className="mt-1 font-mono text-[10px] text-slate-400">JTP-OFFICIAL</span>
                </div>
              )}

              {/* 공문서 헤더 */}
              <div className="border-b-2 border-slate-900 pb-5">
                <div className="text-xs font-bold text-[#005BAC]">
                  (재)제주테크노파크 / 디지털융합센터 빅데이터연구팀
                </div>
                <div className="mt-1 text-xs text-slate-500">문서 관리번호 : {activeProject.docNo}</div>
                <div className="text-xs text-slate-500">시행 일자 : 2024. 11. 20. (수) 정기 상인총회 상정</div>

                <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-[#005BAC]">상인회 총회 심의 의결 안건</div>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">{activeProject.agendaTitle}</h2>
                  <div className="mt-1 text-xs text-slate-500">
                    수신: 제주시 구도심 상인상생협의회 대의원 귀하 · 참조: 제주특별자치도 경제활성화과
                  </div>
                </div>
              </div>

              {/* 안건 1: 주말 소비 카드 트래픽 정량 비교 요약 */}
              <div className="mt-6">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <span className="h-3.5 w-1.5 rounded-full bg-[#005BAC]" />
                  1. 주말 소비 카드 트래픽 정량 비교 요약 ({activeProject.district} · {activeProject.target})
                </h3>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded border border-[#CCFBF1] bg-[#F0FDFA] p-3.5">
                    <div className="text-[11px] font-semibold text-[#0D9488]">토요일(Saturday) 총 결제</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                      {activeProject.satTotal} <span className="text-xs font-normal text-slate-500">건</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">점유율 50.54% (4회 관측 평균)</div>
                  </div>

                  <div className="rounded border border-[#DBEAFE] bg-[#EFF6FF] p-3.5">
                    <div className="text-[11px] font-semibold text-[#2563EB]">일요일(Sunday) 총 결제</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                      {activeProject.sunTotal} <span className="text-xs font-normal text-slate-500">건</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">점유율 49.46% (4회 관측 평균)</div>
                  </div>

                  <div className="rounded bg-[#0A1E3F] p-3.5 text-white">
                    <div className="text-[11px] font-semibold text-slate-300">토 vs 일 격차 분석</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-400">
                      {activeProject.diff} <span className="text-xs font-normal text-white">건</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-300">{activeProject.diffRate} 토요일 우세 집중</div>
                  </div>
                </div>
              </div>

              {/* 안건 2: 상인회 공식 의사결정 권고안 (Executive Guidance) */}
              <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#005BAC]">
                  <Scale className="size-4" />
                  2. 상인회 공식 의사결정 권고안 (Executive Guidance)
                </h3>
                <p className="mt-2 text-xs font-bold text-slate-800 leading-relaxed">
                  &ldquo;토요일 피크타임(14:00~19:00) 아르바이트 집중 배치 및 일요일 조기마감 탄력제 도입 권고&rdquo;
                </p>
                <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
                  {activeProject.guidance}
                </p>
              </div>

              {/* 안건 3: 시계열 추이 및 원장 요약 */}
              <div className="mt-6">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <span className="h-3 w-1.5 rounded-full bg-[#005BAC]" />
                  3. 관측 데이터 원장 및 산출 기준
                </h3>
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
                  <p>
                    <strong>원천 데이터:</strong> 제주데이터허브 제608호 (제주도 구도심 상권 주말 소비 카드 트래픽 정밀 집계 전수 120행)
                  </p>
                  <p className="mt-1">
                    <strong>집계 알고리즘:</strong> 불완전 주차 제외 1:1 완결 페어링 (토요일-일요일 1회 대칭 집계 원칙)
                  </p>
                </div>
              </div>

              {/* 안건 4: 무결성 전자서명 검증키 */}
              <div className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-500 sm:flex-row sm:items-center">
                <div>
                  <span className="font-bold text-slate-800">
                    제주공공데이터포털 공인 제608호 관측 데이터 원본 일치 증명
                  </span>
                  <br />
                  알고리즘: JTP 1:1 Weekend Paired Verification v2.4
                </div>
                <div className="sm:text-right">
                  <span className="font-mono text-xs font-bold text-[#005BAC]">{activeProject.authKey}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* 4. 하단 활성 DB 엔진 상태 바 (명세서 4.1) */}
      <aside className="border-t border-slate-200 bg-white py-4 print:hidden" aria-label="데이터베이스 상태 정보">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-slate-700">활성 DB 엔진 상태: 정상 가동</span>
            <span className="text-slate-300">|</span>
            <span>버전: v2024.11-608 (120행 100% 매칭)</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span className="hidden font-mono sm:inline">SHA256: 8f4a...0012</span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/console" className="font-semibold text-[#005BAC] hover:underline">
              데이터 분석 콘솔 바로가기 ➔
            </Link>
          </div>
        </div>
      </aside>
    </div>
  )
}
