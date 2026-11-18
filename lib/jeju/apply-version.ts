import { createHash, randomUUID } from 'node:crypto'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { datasetVersions, observations, refreshRuns } from '@/lib/db/schema'
import { normalizeMonth } from './aggregate'
import { mergeImportRows, type PreparedImport } from './import-validation'
import { previewObservations } from './preview-data'
import type { Observation } from './types'

type ApplyVersionOptions = {
  incomingRows: Observation[]
  source: string
  runId: string
  mergeExisting: boolean
  preparedImport?: PreparedImport
}

function canonicalPayload(rows: Observation[]) {
  return JSON.stringify(rows.map(({ districtType, userType, dtYearMonth, dtWeek, useCount }) => ({
    districtType,
    userType,
    dtYearMonth,
    dtWeek,
    useCount,
  })))
}

export async function applyDatasetVersion({
  incomingRows,
  source,
  runId,
  mergeExisting,
  preparedImport,
}: ApplyVersionOptions) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('jeju-608-active-version')::bigint)`)

    let rowsToApply = incomingRows
    if (mergeExisting) {
      const [activeVersion] = await tx
        .select()
        .from(datasetVersions)
        .where(eq(datasetVersions.isActive, true))
        .orderBy(desc(datasetVersions.appliedAt))
        .limit(1)

      const existingRows = activeVersion
        ? await tx
            .select({
              districtType: observations.districtType,
              userType: observations.userType,
              dtYearMonth: observations.dtYearMonth,
              dtWeek: observations.dtWeek,
              useCount: observations.useCount,
              rawPayload: observations.rawPayload,
            })
            .from(observations)
            .where(eq(observations.datasetVersionId, activeVersion.id))
        : previewObservations

      if (preparedImport) {
        rowsToApply = mergeImportRows(existingRows, preparedImport)
      }
    }

    const serialized = canonicalPayload(rowsToApply)
    const checksum = createHash('sha256').update(serialized).digest('hex')
    const now = new Date()
    const stamp = now.toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
    const version = `${source}-${stamp}-${checksum.slice(0, 8)}-${randomUUID().slice(0, 8)}`
    const months = rowsToApply
      .map((row) => normalizeMonth(row.dtYearMonth))
      .filter((month): month is string => Boolean(month))
      .sort()

    const [created] = await tx
      .insert(datasetVersions)
      .values({
        version,
        source,
        rowCount: rowsToApply.length,
        observedStart: months[0] ?? null,
        observedEnd: months.at(-1) ?? null,
        checksum,
        isActive: false,
      })
      .returning({ id: datasetVersions.id })

    for (let offset = 0; offset < rowsToApply.length; offset += 500) {
      const chunk = rowsToApply.slice(offset, offset + 500)
      await tx.insert(observations).values(
        chunk.map((row, index) => ({
          datasetVersionId: created.id,
          districtType: row.districtType,
          userType: row.userType,
          dtYearMonth: row.dtYearMonth,
          dtWeek: row.dtWeek,
          useCount: row.useCount,
          sourceRowNumber: offset + index + 1,
          rawPayload: row.rawPayload ?? null,
        })),
      )
    }

    await tx.update(datasetVersions).set({ isActive: false }).where(eq(datasetVersions.isActive, true))
    await tx
      .update(datasetVersions)
      .set({ isActive: true, appliedAt: now })
      .where(eq(datasetVersions.id, created.id))
    await tx
      .update(refreshRuns)
      .set({
        status: 'success',
        finishedAt: now,
        rowsReceived: incomingRows.length,
        datasetVersionId: created.id,
      })
      .where(eq(refreshRuns.id, runId))

    return { version, datasetVersionId: created.id, rowsApplied: rowsToApply.length }
  })
}
