import { AnalysisInputError, objectValue, planLocally, validateContext } from './analysis.ts'
import type { AnalysisPlan, AnalysisRequest } from './analysis.ts'
import { OFFICIAL_PERIOD } from './aggregate.ts'

// Ported from dev1/backend/agent.py. A model chooses a tool and conditions;
// all observations, totals and answers are produced by the shared analysis engine.
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const toolNames = ['compare_weekdays', 'compare_groups', 'monthly_trend', 'inspect_coverage'] as const
const systemPrompt = `제주데이터허브 608번 카드 이용 질문을 도구 호출 하나로 정리한다.
수치나 답변 문장을 생성하지 않는다. 자료의 지표는 결제 건수뿐이다.
compare_weekdays: 한 지역·한 관광객의 토요일·일요일 비교.
compare_groups: 두 구도심 또는 두 관광객 유형을 같은 월 기준으로 비교.
monthly_trend: 월별 차이나 앞선 요일의 반복 확인.
inspect_coverage: 비교 가능 기간, 최신 관측월, 현재 시점의 자료 유무 확인.
지역은 제주시·서귀포시, 관광객은 내국인·중국인이다.
이전 context가 있으면 후속 질문에서 명시한 조건만 바꾸고 나머지는 유지한다.
'그 차이가 매달 비슷했어?'는 이전 범위를 유지한 monthly_trend다.
'그럼 서귀포는?'은 지역만 좁히며 이전 분석 종류도 유지한다.
두 지역/두 유형 요청은 각 배열에 두 값을 포함한다.
2016-09~2017-11은 과거 관측 기간이다. 올해·오늘을 이 기간으로 바꾸지 않는다.
selected_plan의 requestedPeriod는 사용자가 실제 요청한 범위이므로 수정하지 않는다.
지역·관광객·기간은 catalog와 selected_plan의 조건을 따른다.
분석 도구는 질문 의미로 판단한다. '꾸준했어'처럼 반복 여부를 물으면 monthly_trend다.`

const parameters = {
  type: 'object',
  properties: {
    districtTypes: { type: 'array', items: { type: 'string', enum: ['제주시', '서귀포시'] }, minItems: 1, maxItems: 2 },
    userTypes: { type: 'array', items: { type: 'string', enum: ['내국인', '중국인'] }, minItems: 1, maxItems: 2 },
    startMonth: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
    endMonth: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
  },
  required: ['districtTypes', 'userTypes', 'startMonth', 'endMonth'],
  additionalProperties: false,
}

export function decodeToolPlan(payload: unknown, baseline: AnalysisPlan, allowIntentChoice = false): AnalysisPlan {
  const body = objectValue(payload)
  const choices = body.choices as Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>
  const calls = choices?.[0]?.message?.tool_calls
  if (!Array.isArray(calls) || calls.length !== 1) throw new AnalysisInputError('분석 도구를 하나만 선택해야 해요.')
  const tool = calls[0].function
  if (!toolNames.includes(tool?.name as typeof toolNames[number]) || typeof tool?.arguments !== 'string') {
    throw new AnalysisInputError('지원하지 않는 분석 도구예요.')
  }
  const args = objectValue(JSON.parse(tool.arguments))
  if (Object.keys(args).some(key => !['districtTypes', 'userTypes', 'startMonth', 'endMonth'].includes(key))) {
    throw new AnalysisInputError('분석 조건에 지원하지 않는 항목이 있어요.')
  }
  const intent = tool.name === 'monthly_trend' ? 'monthly' : tool.name === 'inspect_coverage' ? 'availability' : 'compare'
  const context = validateContext({
    filters: { ...baseline.filters, startMonth: args.startMonth, endMonth: args.endMonth },
    intent, districtTypes: args.districtTypes, userTypes: args.userTypes,
  })
  if (tool.name === 'compare_weekdays' && context.districtTypes.length * context.userTypes.length !== 1) {
    throw new AnalysisInputError('여러 조합은 집단 비교 도구를 사용해야 해요.')
  }
  // Explicit conditions and follow-up scope must not be silently changed by a model.
  if (context.filters.startMonth !== baseline.filters.startMonth ||
      context.filters.endMonth !== baseline.filters.endMonth ||
      (!allowIntentChoice && context.intent !== baseline.intent) ||
      [...context.districtTypes].sort().join() !== [...baseline.districtTypes].sort().join() ||
      [...context.userTypes].sort().join() !== [...baseline.userTypes].sort().join()) {
    throw new AnalysisInputError('질문 조건과 모델이 선택한 조건이 일치하지 않아요.')
  }
  return { ...baseline, intent: context.intent, source: 'nvidia' }
}

export async function planWithAgent(
  request: AnalysisRequest,
  options: { fetcher?: typeof fetch; apiKey?: string; model?: string; now?: Date } = {},
): Promise<AnalysisPlan> {
  const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY?.trim()
  let baseline: AnalysisPlan
  let ruleError: AnalysisInputError | undefined
  try {
    baseline = planLocally(request, options.now)
  } catch (error) {
    // Domain/date errors require clarification. Only unfamiliar phrasing may be
    // interpreted by the model, using the user's existing valid selections.
    if (!apiKey || !(error instanceof AnalysisInputError) || !error.message.startsWith('비교할 지역')) throw error
    ruleError = error
    baseline = {
      filters: request.filters, intent: 'compare', districtTypes: request.districtTypes,
      userTypes: request.userTypes, source: 'rules',
    }
  }
  if (!request.question || !apiKey) return baseline
  const fetcher = options.fetcher ?? fetch
  const model = options.model ?? process.env.NVIDIA_MODEL?.trim() ?? DEFAULT_MODEL
  const models = [...new Set([model || DEFAULT_MODEL, DEFAULT_MODEL])]
  try {
    for (const candidate of models) {
      const response = await fetcher(NVIDIA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: candidate,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify({
              question: request.question, context: request.previous,
              selected_plan: baseline, current_month: new Date().toISOString().slice(0, 7),
              catalog: { districtTypes: ['제주시', '서귀포시'], userTypes: ['내국인', '중국인'], officialPeriod: OFFICIAL_PERIOD },
            }) },
          ],
          tools: toolNames.map(name => ({ type: 'function', function: { name, description: name, parameters } })),
          tool_choice: 'required', max_tokens: 512, stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      })
      if ([502, 503, 504].includes(response.status) && candidate !== models.at(-1)) continue
      if (!response.ok) throw new Error('Provider unavailable')
      const explicitTool = /월별|달별|매달|매월|그\s*차이|그럼|어느\s*달|볼\s*수|기간|올해|작년|최신|최근|토요일|일요일|토\s*[·/]\s*일/.test(request.question)
      return decodeToolPlan(await response.json(), baseline, Boolean(ruleError) || !explicitTool)
    }
  } catch {
    // Provider responses can contain credentials. Never return or log their raw text.
  }
  if (ruleError) throw ruleError
  return { ...baseline, notice: 'AI 연결이나 응답을 확인하지 못해 기본 질문 해석으로 분석했어요. 직접 선택으로도 같은 결과를 볼 수 있어요.' }
}
