import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { queryHistory } from '@/lib/db/schema'
import { aggregateObservations, interpretQuestion, resolveIntentComparison, validateFilters } from '@/lib/jeju/aggregate'
import { readDataset } from '@/lib/jeju/repository'
import type { Filters } from '@/lib/jeju/types'
import { hasSameOrigin } from '@/lib/security'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      question?: unknown
      filters?: Partial<Filters>
      previousFilters?: Partial<Filters> | null
    }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
    const selected = validateFilters(body.filters ?? {})
    const previous = body.previousFilters ? validateFilters(body.previousFilters) : null
    const { observations, metadata } = await readDataset()
    const interpreted = interpretQuestion(question, selected, previous)
    const result = resolveIntentComparison(observations, interpreted)
    const filters = result.filters

    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user && !hasSameOrigin(request)) {
      return NextResponse.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })
    }
    if (session?.user && result.status === 'success') {
      await db.insert(queryHistory).values({
        id: randomUUID(),
        userId: session.user.id,
        question: question || '직접 선택 비교',
        districtType: filters.districtType,
        userType: filters.userType,
        startMonth: filters.startMonth,
        endMonth: filters.endMonth,
      })
    }

    return NextResponse.json({ ...result, intent: interpreted.intent, requestedPeriod: interpreted.requestedPeriod, dataset: metadata })
  } catch (error) {
    const message = error instanceof Error ? error.message : '비교 중 문제가 발생했어요.'
    const badRequest = /선택해 주세요|입력해 주세요|늦을 수|조회 기간은/.test(message)
    return NextResponse.json(
      { error: message },
      { status: badRequest ? 422 : 500 },
    )
  }
}
