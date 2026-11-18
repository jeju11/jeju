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

const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-flash-latest',
]

/**
 * 제주 주말 소비 비교 결과를 기반으로 소상공인/상인회를 위한 AI 상권 인사이트 생성
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
  if (!apiKey) return null

  const prompt = `당신은 제주시 및 서귀포시 상권 분석 전문가입니다.
다음은 제주데이터허브 608번 공공데이터를 기반으로 집계된 주말(토/일) 카드 결제 건수 통계입니다:

- 분석 지역: ${params.districtType} 구도심
- 고객 유형: ${params.userType}
- 분석 기간: ${params.period}
- 토요일 총 결제 건수: ${params.saturdayTotal.toLocaleString('ko-KR')}건
- 일요일 총 결제 건수: ${params.sundayTotal.toLocaleString('ko-KR')}건
- 요일 차이(토요일 - 일요일): ${params.difference > 0 ? '+' : ''}${params.difference.toLocaleString('ko-KR')}건
- 집계 요약: ${params.summary}

소상공인 및 상인회 담당자가 매장 운영, 재고 준비, 주말 프로모션에 참고할 수 있도록, 2~3문장의 명확하고 실용적인 요약 인사이트를 한국어로 작성해 주세요. 문단 구분 없이 자연스러운 한국어 문장으로 답변하세요.`

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      // 다음 후보 모델로 폴백
      continue
    }
  }

  return null
}
