import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { ReportDashboard } from '@/components/report-dashboard'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { db } from '@/lib/db'
import { queryHistory } from '@/lib/db/schema'

export default async function HistoryPage() {
  let session = null
  let historyItems: Array<{
    id: string
    question: string
    districtType: string
    userType: string
    startMonth: string
    endMonth: string
    createdAt: string
  }> = []

  if (process.env.DATABASE_URL) {
    try {
      session = await auth.api.getSession({ headers: await headers() })
      if (session?.user) {
        const rows = await db
          .select()
          .from(queryHistory)
          .where(eq(queryHistory.userId, session.user.id))
          .orderBy(desc(queryHistory.createdAt))
          .limit(50)

        historyItems = rows.map((r) => ({
          id: r.id,
          question: r.question,
          districtType: r.districtType,
          userType: r.userType,
          startMonth: r.startMonth,
          endMonth: r.endMonth,
          createdAt: r.createdAt.toISOString(),
        }))
      }
    } catch {
      // DB 미연결 또는 비로그인 게스트 모드
    }
  }

  const user = session?.user
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : null

  return (
    <ReportDashboard
      user={user}
      isAdmin={isAdminEmail(user?.email)}
      historyItems={historyItems}
    />
  )
}
