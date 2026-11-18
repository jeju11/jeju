import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { refreshRuns } from '@/lib/db/schema'
import { OFFICIAL_PERIOD } from './aggregate'
import { applyDatasetVersion } from './apply-version'
import { fetchProviderRows } from './provider-url'
import { validateApiRows } from './import-validation'
import { sanitizeProviderFailureReason } from './safe-errors'

export async function refreshDataset(initiatedBy: string | null) {
  const runId = randomUUID()
  const endpoint = process.env.JEJUDATAHUB_DATASET_URL
  const apiKey = process.env.JEJUDATAHUB_API_KEY
  let runCreated = false
  let applying = false

  try {
    await db.insert(refreshRuns).values({ id: runId, initiatedBy, status: 'running' })
    runCreated = true
    if (!endpoint || !apiKey) {
      throw new Error('JEJUDATAHUB_DATASET_URL과 JEJUDATAHUB_API_KEY 환경 변수를 먼저 설정해 주세요.')
    }

    const sourceRows = await fetchProviderRows(endpoint, apiKey)
    const prepared = validateApiRows(sourceRows)
    if (!prepared.summary.canApply) {
      const invalidCount = prepared.summary.invalidRows.length
      const duplicateCount = prepared.summary.duplicateRows.length
      throw new Error(`응답 검증 실패: 오류 행 ${invalidCount}개, 중복 행 ${duplicateCount}개. 기존 적용 데이터를 유지했어요.`)
    }
    if (!prepared.summary.fullOfficialCoverage) {
      throw new Error(`응답에 공식 전체 기간(${OFFICIAL_PERIOD.start}~${OFFICIAL_PERIOD.end})의 지역·관광객·요일 데이터가 모두 없어 기존 적용 데이터를 유지했어요.`)
    }

    applying = true
    const applied = await applyDatasetVersion({
      incomingRows: prepared.rows,
      source: 'jejudatahub-608',
      runId,
      mergeExisting: false,
    })
    return {
      ok: true as const,
      version: applied.version,
      rowsReceived: prepared.summary.validRowCount,
    }
  } catch (error) {
    const rawReason = error instanceof Error ? error.message : '알 수 없는 갱신 오류가 발생했어요.'
    const reason = !runCreated || applying
      ? '새 데이터 버전을 저장하지 못했어요. 기존 적용 데이터는 유지됩니다.'
      : sanitizeProviderFailureReason(rawReason, endpoint, apiKey)
    if (runCreated) {
      await db
        .update(refreshRuns)
        .set({ status: 'failed', finishedAt: new Date(), failureReason: reason })
        .where(eq(refreshRuns.id, runId))
        .catch(() => undefined)
    }
    return { ok: false as const, reason }
  }
}
