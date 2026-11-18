/**
 * Google Gemini API 클라이언트 유틸리티
 * 
 * 환경 변수 우선순위:
 * 1. GEMINI_API_KEY (표준 권장)
 * 2. GOOGLE_API_KEY
 * 3. GOOGLE_GENAI_API_KEY
 */

export function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY
  return key?.trim() || null
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey())
}

/**
 * 제주 주말 소비 비교 결과를 기반으로 서버가 검산한 관측 결과를 한국어로 요약
 */
export async function generateConsumptionInsight(params: {
  districtType: string
  userType: string
  period: string
  saturdayTotal: number
  sundayTotal: number
  difference: number
  summary: string
}): Promise<string | null> {
  const apiKey = getGeminiApiKey()
  const model = process.env.GEMINI_MODEL?.trim()
  if (!apiKey || !model || !/^[A-Za-z0-9_.-]{1,100}$/.test(model)) return null

  const prompt = `당신은 확인된 과거 통계를 한국어로 설명하는 도우미입니다.
다음은 제주데이터허브 608번 공공데이터를 기반으로 집계된 주말(토/일) 카드 결제 건수 통계입니다:

- 분석 지역: ${params.districtType} 구도심
- 고객 유형: ${params.userType}
- 분석 기간: ${params.period}
- 토요일 총 결제 건수: ${params.saturdayTotal.toLocaleString('ko-KR')}건
- 일요일 총 결제 건수: ${params.sundayTotal.toLocaleString('ko-KR')}건
- 요일 차이(토요일 - 일요일): ${params.difference > 0 ? '+' : ''}${params.difference.toLocaleString('ko-KR')}건
- 집계 요약: ${params.summary}

위에 제시된 수치와 관측 기간만 사용해 2문장으로 요약하세요. 근거에 없는 사실이나 수치를 추가하지 마세요.
자료는 2016~2017년 관광객 카드 결제 건수이며 현재 도민 소비가 아닙니다. 인원수, 매출액, 시간대, 매장 운영이나 인력·재고 배분, 인과관계, 미래 예측을 추론하지 마세요.`

  {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
          },
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text?.trim()) return text.trim()
      }
    } catch {
      // Do not expose provider responses, URLs or credentials.
      return null
    }
  }

  return null
}
