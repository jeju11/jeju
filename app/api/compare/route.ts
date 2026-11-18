import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AnalysisInputError } from '@/lib/jeju/analysis'
import { analyzeRequest } from '@/lib/jeju/service'
import { readDataset } from '@/lib/jeju/repository'
import { hasSameOrigin } from '@/lib/security'
import { isAuthConfigured } from '@/lib/auth-enabled'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })
  }
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > 16_384) return NextResponse.json({ error: '요청이 너무 길어요.' }, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: '요청 형식을 확인해 주세요.' }, { status: 400 })
  }
  try {
    const result = await analyzeRequest(body, await readDataset())
    // Account/history is optional. Failure here must not discard a completed comparison.
    if (isAuthConfigured() && result.status === 'success') {
      try {
        const [{ auth }, { db }, { queryHistory }] = await Promise.all([
          import('@/lib/auth'), import('@/lib/db'), import('@/lib/db/schema'),
        ])
        const session = await auth.api.getSession({ headers: request.headers })
        if (session?.user) {
          await db.insert(queryHistory).values({
            id: randomUUID(), userId: session.user.id,
            question: typeof (body as Record<string, unknown>).question === 'string'
              ? String((body as Record<string, unknown>).question).trim() || '직접 선택 비교' : '직접 선택 비교',
            ...result.filters,
            analysisContext: result.context,
          })
        }
      } catch {
        result.interpretation.notice = [result.interpretation.notice, '비교는 완료했지만 질문 이력을 저장하지 못했어요.'].filter(Boolean).join(' ')
      }
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AnalysisInputError) return NextResponse.json({ error: error.message }, { status: 422 })
    return NextResponse.json({ error: '분석 중 문제가 발생했어요. 입력은 유지돼요. 잠시 후 다시 비교해 주세요.' }, { status: 500 })
  }
}
