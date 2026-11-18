import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { WeekendDashboard } from '@/components/weekend-dashboard'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { db } from '@/lib/db'
import { queryHistory } from '@/lib/db/schema'
import { aggregateObservations, interpretQuestion, resolveIntentComparison, validateFilters } from '@/lib/jeju/aggregate'
import { readDataset } from '@/lib/jeju/repository'
import type { Filters } from '@/lib/jeju/types'

const defaultFilters: Filters = {
  districtType: '제주시',
  userType: '내국인',
  startMonth: '2016-09',
  endMonth: '2017-11',
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ConsolePage({ searchParams }: PageProps) {
  const params = await searchParams
  let session = null
  if (process.env.DATABASE_URL) {
    try {
      session = await auth.api.getSession({ headers: await headers() })
    } catch {
      // DB 미연결 또는 초기 로컬 환경에서는 비로그인 게스트 모드로 안전하게 동작
    }
  }
  const user = session?.user
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : null

  const { observations, metadata } = await readDataset()

  let initialFilters = defaultFilters
  let initialQuestion = ''
  let initialResult = null
  let initialError: string | null = null

  // URL 쿼리 파라미터에서 직접 조건(district, userType, startMonth, endMonth, q) 주입 지원
  if (typeof params.q === 'string' && params.q.trim()) {
    initialQuestion = params.q.trim()
  }
  if (typeof params.district === 'string') {
    const d = params.district.toLowerCase()
    if (d === '제주시' || d === 'jeju') {
      initialFilters = { ...initialFilters, districtType: '제주시' }
    } else if (d === '서귀포시' || d === 'seogwipo') {
      initialFilters = { ...initialFilters, districtType: '서귀포시' }
    }
  }
  if (typeof params.userType === 'string') {
    const u = params.userType.toLowerCase()
    if (u === '내국인' || u === 'domestic' || u === 'korean') {
      initialFilters = { ...initialFilters, userType: '내국인' }
    } else if (u === '중국인' || u === 'chinese') {
      initialFilters = { ...initialFilters, userType: '중국인' }
    }
  }
  if (typeof params.startMonth === 'string' && /^\d{4}-\d{2}$/.test(params.startMonth)) {
    initialFilters = {
      ...initialFilters,
      startMonth: params.startMonth,
    }
  }
  if (typeof params.endMonth === 'string' && /^\d{4}-\d{2}$/.test(params.endMonth)) {
    initialFilters = {
      ...initialFilters,
      endMonth: params.endMonth,
    }
  }

  const replayId = typeof params.replay === 'string' ? params.replay : null
  if (replayId && user) {
    const [historyItem] = await db
      .select()
      .from(queryHistory)
      .where(and(eq(queryHistory.id, replayId), eq(queryHistory.userId, user.id)))
      .limit(1)

    if (historyItem) {
      initialFilters = validateFilters({
        districtType: historyItem.districtType as Filters['districtType'],
        userType: historyItem.userType as Filters['userType'],
        startMonth: historyItem.startMonth,
        endMonth: historyItem.endMonth,
      })
      initialQuestion = historyItem.question
      const interpreted = interpretQuestion(initialQuestion, initialFilters, null)
      const comparison = resolveIntentComparison(observations, interpreted)
      initialResult = {
        ...comparison,
        intent: interpreted.intent,
        requestedPeriod: interpreted.requestedPeriod,
        dataset: metadata,
      }
    } else {
      initialError = '이 질문 이력을 찾을 수 없어요.'
    }
  } else if (replayId) {
    initialError = '질문 이력을 다시 보려면 로그인해 주세요.'
  } else {
    initialResult = {
      ...aggregateObservations(observations, initialFilters),
      intent: 'compare' as const,
      dataset: metadata,
    }
  }

  return (
    <WeekendDashboard
      user={user}
      isAdmin={isAdminEmail(user?.email)}
      initialFilters={initialFilters}
      initialQuestion={initialQuestion}
      initialResult={initialResult}
      initialError={initialError}
      initialObservations={observations}
      initialDataset={metadata}
    />
  )
}
