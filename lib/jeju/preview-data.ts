import jejuWeekendDataset from '../../public/jeju-weekend-608.json' with { type: 'json' }
import type { Observation } from './types'

function formatMonth(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`
}

export const previewObservations: Observation[] = jejuWeekendDataset.data.map((row) => ({
  districtType: row.districtType.includes('서귀포') ? '서귀포시' : '제주시',
  userType: row.userType.includes('중국') ? '중국인' : '내국인',
  dtYearMonth: formatMonth(row.dtYearMonth),
  dtWeek: row.dtWeek === '토' ? '토요일' : '일요일',
  useCount: String(row.useCount),
  rawPayload: row,
}))

export const previewMetadata = {
  version: 'jejudatahub-608-201609-201711',
  rowCount: previewObservations.length,
  observedStart: formatMonth(jejuWeekendDataset.coverage.startMonth),
  observedEnd: formatMonth(jejuWeekendDataset.coverage.endMonth),
  source: 'preview-file' as const,
  collectedAt: null,
}
