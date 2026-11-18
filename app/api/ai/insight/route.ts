import { generateConsumptionInsight, isGeminiConfigured } from '@/lib/gemini'
import { analyzeRequest } from '@/lib/jeju/service'
import { AnalysisInputError } from '@/lib/jeju/analysis'
import { readDataset } from '@/lib/jeju/repository'
import { hasSameOrigin } from '@/lib/security'

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })
  try {
    const text = await request.text()
    if (text.length > 16_384) return Response.json({ error: '요청이 너무 길어요.' }, { status: 413 })
    const body = JSON.parse(text)
    // Ignore client totals: always recalculate the conditions from the authoritative dataset.
    const result = await analyzeRequest({ filters: body.filters }, await readDataset())
    if (result.status !== 'success') return Response.json({ configured: false, insight: null, message: '선택한 조건에 비교 가능한 자료가 없어요.' })
    if (!isGeminiConfigured() || !process.env.GEMINI_MODEL?.trim()) {
      return Response.json({ configured: false, insight: null, message: '추가 AI 요약은 사용하지 않고 있어요. 계산 결과는 그대로 볼 수 있어요.' })
    }
    const insight = await generateConsumptionInsight({
      ...result.filters, period: `${result.filters.startMonth}~${result.filters.endMonth}`,
      saturdayTotal: result.saturdayTotal, sundayTotal: result.sundayTotal,
      difference: result.difference, summary: result.summary,
    })
    return Response.json({ configured: true, insight, message: insight ? undefined : '추가 요약을 불러오지 못했어요. 계산 결과는 유지돼요.' })
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: '요청 형식을 확인해 주세요.' }, { status: 400 })
    if (error instanceof AnalysisInputError) return Response.json({ error: error.message }, { status: 422 })
    return Response.json({ error: '추가 요약을 처리하지 못했어요. 비교 결과는 유지돼요.' }, { status: 500 })
  }
}
