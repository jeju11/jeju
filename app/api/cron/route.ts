import { NextResponse } from 'next/server'
import { refreshDataset } from '@/lib/jeju/refresh'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 401 })
  }

  const result = await refreshDataset(null)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
