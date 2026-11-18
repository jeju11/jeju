import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { AdminPanel } from '@/components/admin-panel'
import { isAdminEmail } from '@/lib/admin'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { datasetVersions, refreshRuns } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { sanitizeProviderFailureReason } from '@/lib/jeju/safe-errors'

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in?returnTo=%2Fadmin')
  if (!isAdminEmail(session.user.email)) notFound()

  try {
    const [activeRows, refreshRows] = await Promise.all([
      db.select().from(datasetVersions).where(eq(datasetVersions.isActive, true)).orderBy(desc(datasetVersions.appliedAt)).limit(1),
      db.select().from(refreshRuns).orderBy(desc(refreshRuns.startedAt)).limit(1),
    ])
    const latestRefresh = refreshRows[0]
      ? { ...refreshRows[0], failureReason: sanitizeProviderFailureReason(refreshRows[0].failureReason) }
      : null
    return <AdminPanel initialSnapshot={{ active: activeRows[0] ?? null, latestRefresh }} />
  } catch {
    return <AdminPanel initialSnapshot={null} initialError="관리자 데이터를 불러오지 못했어요. DB 연결과 테이블 설정을 확인해 주세요." />
  }
}
