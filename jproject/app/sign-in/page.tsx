import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AuthForm } from '@/components/auth-form'
import { auth } from '@/lib/auth'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams
  const redirectTo = typeof params.returnTo === 'string' ? params.returnTo : '/'

  let session = null
  if (process.env.DATABASE_URL) {
    try {
      session = await auth.api.getSession({ headers: await headers() })
    } catch {
      // DB 미연결 또는 비로그인 상태
    }
  }

  if (session?.user) redirect(redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/')
  return <AuthForm mode="sign-in" redirectTo={redirectTo} />
}
