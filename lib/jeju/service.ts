import { executeAnalysis, readAnalysisRequest } from './analysis.ts'
import type { AnalysisRequest } from './analysis.ts'
import { planWithAgent } from './agent.ts'
import type { DatasetMetadata, Observation } from './types.ts'

export async function analyzeRequest(
  body: unknown,
  dataset: { observations: Observation[]; metadata: DatasetMetadata },
  planner: typeof planWithAgent = planWithAgent,
) {
  const request: AnalysisRequest = readAnalysisRequest(body)
  const plan = await planner(request)
  return { ...executeAnalysis(dataset.observations, plan), dataset: dataset.metadata }
}
