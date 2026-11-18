import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { datasetVersions, observations } from '@/lib/db/schema'
import { previewMetadata, previewObservations } from './preview-data'
import type { DatasetMetadata, Observation } from './types'

export async function readDataset(): Promise<{ observations: Observation[]; metadata: DatasetMetadata }> {
  try {
    const [activeVersion] = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.isActive, true))
      .orderBy(desc(datasetVersions.appliedAt))
      .limit(1)

    if (!activeVersion) {
      return { observations: previewObservations, metadata: previewMetadata }
    }

    const rows = await db
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

    return {
      observations: rows,
      metadata: {
        source: 'database',
        version: activeVersion.version,
        rowCount: activeVersion.rowCount,
        observedStart: activeVersion.observedStart,
        observedEnd: activeVersion.observedEnd,
        collectedAt: activeVersion.appliedAt?.toISOString() ?? null,
      },
    }
  } catch (error) {
    console.error('[v0] Falling back to bundled Jeju preview data:', error)
    return {
      observations: previewObservations,
      metadata: {
        ...previewMetadata,
        warning: 'DB를 읽을 수 없어 내장 미리보기 데이터를 사용 중이에요.',
      },
    }
  }
}
