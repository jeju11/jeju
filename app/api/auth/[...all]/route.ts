import { isAuthConfigured } from '@/lib/auth-enabled'
async function handle(request: Request) {
  if (!isAuthConfigured()) return Response.json({ error: '계정 기능은 현재 사용하지 않아요. 로그인 없이 비교할 수 있어요.' }, { status: 503 })
  const { auth } = await import('@/lib/auth')
  return auth.handler(request)
}
export { handle as GET, handle as POST }
