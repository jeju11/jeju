import { WeekendDashboard } from '@/components/weekend-dashboard'
import { analyzeRequest } from '@/lib/jeju/service'
import { readDataset } from '@/lib/jeju/repository'
import { validateFilters } from '@/lib/jeju/aggregate'
import { isAuthConfigured } from '@/lib/auth-enabled'
import { AnalysisInputError, executeAnalysis, validateContext } from '@/lib/jeju/analysis'
import type { Filters } from '@/lib/jeju/types'

const defaults: Filters = { districtType: '제주시', userType: '내국인', startMonth: '2016-09', endMonth: '2017-11' }
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ConsolePage({ searchParams }: PageProps) {
  const params = await searchParams
  let initialFilters = { ...defaults }
  let initialQuestion = typeof params.q === 'string' ? params.q.trim() : ''
  let initialError: string | null = null
  let initialResult = null
  try {
    const district = typeof params.district === 'string' ? params.district : defaults.districtType
    const user = typeof params.userType === 'string' ? params.userType : defaults.userType
    const districtAliases: Record<string, string> = { jeju: '제주시', seogwipo: '서귀포시' }
    const userAliases: Record<string, string> = { domestic: '내국인', korean: '내국인', chinese: '중국인' }
    initialFilters = validateFilters({
      districtType: (districtAliases[district] ?? district) as Filters['districtType'],
      userType: (userAliases[user] ?? user) as Filters['userType'],
      startMonth: typeof params.startMonth === 'string' ? params.startMonth : defaults.startMonth,
      endMonth: typeof params.endMonth === 'string' ? params.endMonth : defaults.endMonth,
    })
    if (typeof params.replay === 'string') {
      if (!isAuthConfigured()) throw new Error('질문 이력 기능은 계정과 DB 설정 후 사용할 수 있어요.')
      const [{ auth }, { headers }, { db }, { queryHistory }, { and, eq }] = await Promise.all([
        import('@/lib/auth'), import('next/headers'), import('@/lib/db'), import('@/lib/db/schema'), import('drizzle-orm'),
      ])
      const session = await auth.api.getSession({ headers: await headers() })
      if (!session?.user) throw new Error('본인의 질문 이력을 보려면 로그인해 주세요.')
      const [item] = await db.select().from(queryHistory).where(and(eq(queryHistory.id, params.replay), eq(queryHistory.userId, session.user.id))).limit(1)
      if (!item) throw new Error('이 질문 이력을 찾을 수 없어요.')
      initialFilters = validateFilters(item as Partial<Filters>)
      initialQuestion = item.question
      const context = item.analysisContext ? validateContext(item.analysisContext) : {
        filters: initialFilters, intent: 'compare' as const,
        districtTypes: [initialFilters.districtType], userTypes: [initialFilters.userType],
      }
      const dataset = await readDataset()
      initialResult = { ...executeAnalysis(dataset.observations, { ...context, source: 'direct' }), dataset: dataset.metadata }
    } else if (Object.keys(params).length) {
      const scope = {
        districtTypes: typeof params.districtTypes === 'string' ? params.districtTypes.split(',') : [initialFilters.districtType],
        userTypes: typeof params.userTypes === 'string' ? params.userTypes.split(',') : [initialFilters.userType],
      }
      const previousContext = params.intent ? {
        filters: initialFilters, intent: params.intent, ...scope,
        ...(typeof params.requestedStart === 'string' && typeof params.requestedEnd === 'string'
          ? { requestedPeriod: { startMonth: params.requestedStart, endMonth: params.requestedEnd } } : {}),
      } : null
      initialResult = await analyzeRequest({ question: initialQuestion, filters: initialFilters, scope, previousContext }, await readDataset())
      initialFilters = initialResult.filters
    }
  } catch (error) {
    initialFilters = defaults
    initialError = error instanceof AnalysisInputError ? error.message : params.replay
      ? '질문 이력을 불러오지 못했어요. 본인 계정과 DB 설정을 확인해 주세요.'
      : '조회 조건을 확인해 주세요. 지역·관광객·시작월·종료월을 다시 선택할 수 있어요.'
  }
  return <WeekendDashboard initialFilters={initialFilters} initialQuestion={initialQuestion} initialResult={initialResult} initialError={initialError} />
}
