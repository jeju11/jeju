import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LandingPortal } from '@/components/landing-portal'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  
  // 기존 질문 이력 재조회(replay) 링크로 유입된 경우 즉시 분석 콘솔로 연결
  if (params.replay) {
    redirect(`/console?replay=${encodeURIComponent(String(params.replay))}`)
  }

  let session = null
  if (process.env.DATABASE_URL) {
    try {
      session = await auth.api.getSession({ headers: await headers() })
    } catch {
      // 비로그인 방문자 기본 게스트 모드
    }
  }

  const user = session?.user
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : null

  return <LandingPortal user={user} isAdmin={isAdminEmail(user?.email)} />
}
