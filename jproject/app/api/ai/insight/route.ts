import { NextResponse } from 'next/server'
import { generateConsumptionInsight, isGeminiConfigured } from '@/lib/gemini'
import { hasSameOrigin } from '@/lib/security'

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json({
        configured: false,
        insight: null,
        message: 'Gemini API 키가 설정되지 않았습니다.',
      })
    }

    const body = (await request.json().catch(() => ({}))) as {
      districtType?: string
      userType?: string
      period?: string
      saturdayTotal?: number
      sundayTotal?: number
      difference?: number
      summary?: string
    }

    if (!body.districtType || !body.userType || body.saturdayTotal === undefined || body.sundayTotal === undefined) {
      return NextResponse.json({ error: '인사이트 생성에 필요한 데이터가 부족합니다.' }, { status: 400 })
    }

    const insight = await generateConsumptionInsight({
      districtType: body.districtType,
      userType: body.userType,
      period: body.period || '',
      saturdayTotal: Number(body.saturdayTotal),
      sundayTotal: Number(body.sundayTotal),
      difference: Number(body.difference ?? 0),
      summary: body.summary || '',
    })

    return NextResponse.json({
      configured: true,
      insight,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
