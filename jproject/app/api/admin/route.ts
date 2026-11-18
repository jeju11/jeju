import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { datasetVersions, refreshRuns } from '@/lib/db/schema'
import { isAdminEmail } from '@/lib/admin'
import { refreshDataset } from '@/lib/jeju/refresh'
import { hasSameOrigin } from '@/lib/security'
import { sanitizeProviderFailureReason } from '@/lib/jeju/safe-errors'

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user && isAdminEmail(session.user.email) ? session.user : null
}

async function snapshot() {
  const [active] = await db
    .select()
    .from(datasetVersions)
    .where(eq(datasetVersions.isActive, true))
    .orderBy(desc(datasetVersions.appliedAt))
    .limit(1)
  const [latestRefresh] = await db
    .select()
    .from(refreshRuns)
    .orderBy(desc(refreshRuns.startedAt))
    .limit(1)

  return {
    active: active ?? null,
    latestRefresh: latestRefresh
      ? { ...latestRefresh, failureReason: sanitizeProviderFailureReason(latestRefresh.failureReason) }
      : null,
  }
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })
  }
  try {
    return NextResponse.json(await snapshot())
  } catch {
    return NextResponse.json({ error: '관리자 데이터를 불러오지 못했어요.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })
  if (!hasSameOrigin(request)) return NextResponse.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })
  const refresh = await refreshDataset(user.id)
  return NextResponse.json({ refresh, ...(await snapshot()) }, { status: refresh.ok ? 200 : 502 })
}
