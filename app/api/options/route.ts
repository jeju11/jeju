import { readDataset } from '@/lib/jeju/repository'
import { aggregateObservations, OFFICIAL_PERIOD } from '@/lib/jeju/aggregate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const dataset = await readDataset()
  const groups = (['제주시', '서귀포시'] as const).flatMap(districtType =>
    (['내국인', '중국인'] as const).map(userType => {
      const result = aggregateObservations(dataset.observations, {
        districtType, userType, startMonth: OFFICIAL_PERIOD.start, endMonth: OFFICIAL_PERIOD.end,
      })
      return { districtType, userType, availableMonths: result.rows.map(row => row.month) }
    }),
  )
  return Response.json({
    dataset: dataset.metadata, officialPeriod: OFFICIAL_PERIOD, metric: 'useCount',
    aiAvailable: Boolean(process.env.NVIDIA_API_KEY?.trim()), groups,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
