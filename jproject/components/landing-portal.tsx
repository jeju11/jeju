'use client'

import Link from 'next/link'
import { ArrowRight, ChevronDown, ExternalLink, Waves } from 'lucide-react'

type LandingPortalProps = {
  user?: { id: string; name: string; email: string } | null
  isAdmin?: boolean
}

export function LandingPortal(_props?: LandingPortalProps) {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 font-sans flex flex-col justify-between selection:bg-blue-100 selection:text-[#005BAC] relative overflow-x-hidden">
      {/* 1. Minimal Header */}
      <header className="w-full bg-[#F8F9FA]/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="max-w-[1000px] mx-auto px-6 h-16 md:h-20 flex items-center justify-between">
          <Link className="flex items-center gap-2.5 group" href="/">
            <div className="w-9 h-9 rounded-xl bg-[#005BAC] flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
              <Waves className="size-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">제주머니</span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6 text-sm">
            <Link
              href="/compare"
              className="font-medium text-slate-600 hover:text-[#005BAC] transition-colors"
            >
              상권별 비교
            </Link>
            <div className="h-3.5 w-px bg-slate-300" />
            <a
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-200/50"
              href="https://www.jejudatahub.net"
              rel="noopener noreferrer"
              target="_blank"
              title="제주데이터허브 공식 포털 바로가기"
            >
              <span>자료 출처</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* 2. Main Hero Section (Single Screen Focused) */}
      <main className="flex-1 flex flex-col items-center justify-center relative w-full px-6 py-8 md:py-14 z-10">
        {/* Soft Ambient Radial Gradient behind text */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[900px] h-[360px] bg-gradient-to-b from-blue-100/35 via-sky-50/20 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Centered Hero Container */}
        <div className="w-full max-w-[1000px] mx-auto text-center flex flex-col items-center">
          {/* Main Title */}
          <h1 className="text-3xl sm:text-4xl md:text-[42px] lg:text-[44px] font-bold text-slate-900 tracking-tight leading-[1.3] md:leading-[1.25] mb-4">
            토요일과 일요일,<br className="sm:hidden" /> 카드를 더 많이 쓴 날은?
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-[20px] text-slate-600 font-normal leading-relaxed max-w-2xl mb-8 md:mb-10">
            제주시·서귀포시 구도심의 관광객 카드 결제 건수를 비교해 보세요.
          </p>

          {/* Primary Action CTA Button */}
          <div className="flex flex-col items-center w-full sm:w-auto">
            <Link
              className="w-full sm:w-auto inline-flex items-center justify-center min-h-[52px] h-14 px-8 rounded-xl bg-[#005BAC] hover:bg-[#00488a] text-white text-lg font-semibold shadow-md hover:shadow-lg transition-all transform active:scale-[0.99] gap-2"
              href="/compare"
            >
              <span>주말 소비 비교하기</span>
              <ArrowRight className="size-5" />
            </Link>

            {/* Subnote directly below button */}
            <span className="text-xs text-slate-500 mt-2.5 tracking-tight font-medium">
              자료 기간 2016년 9월~2017년 11월
            </span>
          </div>

          {/* Collapsible '이용 방법' (Accordion) */}
          <div className="w-full max-w-md mt-8 md:mt-12">
            <details className="group bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-xl overflow-hidden shadow-xs transition-all">
              <summary className="flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs md:text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 list-none select-none transition-colors">
                <ChevronDown className="size-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
                <span>이용 방법 알아보기</span>
              </summary>
              <div className="px-5 pb-4 pt-1 text-left border-t border-slate-100 text-xs md:text-sm text-slate-600 leading-relaxed space-y-1.5 bg-slate-50/50">
                <p>
                  <span className="font-semibold text-slate-800">1.</span> 질문창에 궁금한 점을 적거나 조건을 선택합니다.
                </p>
                <p>
                  <span className="font-semibold text-slate-800">2.</span> 토요일과 일요일 결제 건수를 비교한 결과를 확인합니다.
                </p>
              </div>
            </details>
          </div>
        </div>
      </main>

      {/* 3. 제주 풍경 배경 (화면 하단 25~30% 배치: 완만한 한라산 능선, 옅은 청록색 바다, 현무암) */}
      <div
        className="absolute bottom-0 left-0 right-0 w-full pointer-events-none select-none overflow-hidden z-0"
        style={{
          height: 'clamp(200px, 30vh, 380px)',
        }}
        aria-hidden="true"
      >
        {/* 상단 부드러운 페이드 그라데이션 오버레이 (#F8F9FA와 완벽히 융합) */}
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
          className="w-full h-full object-cover object-bottom opacity-90 brightness-[1.02] contrast-[0.98]"
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
        <div className="max-w-[1000px] mx-auto px-6">
          <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/60 shadow-2xs text-slate-700 font-medium tracking-tight">
            제주머니 · 자료 출처 제주데이터허브
          </span>
        </div>
      </footer>
    </div>
  )
}
