import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { refreshRuns } from '@/lib/db/schema'
import { applyDatasetVersion } from './apply-version'
import type { PreparedImport } from './import-validation'

export async function applyManualImport(prepared: PreparedImport, initiatedBy: string) {
  if (!prepared.summary.canApply) {
    return { ok: false as const, reason: '파일 검증을 통과하지 못해 기존 데이터를 유지했어요.' }
  }

  const runId = randomUUID()
  let runCreated = false
  try {
    await db.insert(refreshRuns).values({
      id: runId,
      initiatedBy,
      status: 'running',
      rowsReceived: prepared.summary.validRowCount,
    })
    runCreated = true

    const applied = await applyDatasetVersion({
      incomingRows: prepared.rows,
      preparedImport: prepared,
      source: 'jejudatahub-608-manual',
      runId,
      mergeExisting: true,
    })
    return {
      ok: true as const,
      version: applied.version,
      rowsReceived: prepared.summary.validRowCount,
      rowsApplied: applied.rowsApplied,
      observedStart: prepared.summary.observedStart,
      observedEnd: prepared.summary.observedEnd,
    }
  } catch {
    const reason = '파일을 적용하지 못했어요. 기존 적용 데이터는 유지됩니다.'
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
