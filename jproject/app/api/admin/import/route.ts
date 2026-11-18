import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { hasSameOrigin } from '@/lib/security'
import { applyManualImport } from '@/lib/jeju/manual-import'
import { ImportFormatError, prepareImport } from '@/lib/jeju/import-validation'

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user && isAdminEmail(session.user.email) ? session.user : null
}

export async function POST(request: Request) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })
  if (!hasSameOrigin(request)) return NextResponse.json({ error: '요청 출처를 확인할 수 없어요.' }, { status: 403 })

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 11 * 1024 * 1024) {
    return NextResponse.json({ error: '파일은 10MB 이하만 가져올 수 있어요.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없어요.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '업로드 요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  const payload = body as Record<string, unknown>
  if ((payload.mode !== 'preview' && payload.mode !== 'apply') || typeof payload.content !== 'string') {
    return NextResponse.json({ error: '파일 검증 또는 적용 요청 형식이 올바르지 않아요.' }, { status: 400 })
  }

  let prepared: ReturnType<typeof prepareImport>
  try {
    prepared = prepareImport(payload.content)
  } catch (error) {
    const message = error instanceof ImportFormatError ? error.message : '파일을 검증할 수 없어요.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (payload.mode === 'preview') {
    return NextResponse.json({ validation: prepared.summary })
  }
  if (!prepared.summary.canApply) {
    return NextResponse.json({
      ok: false,
      error: '검증 오류나 중복 행이 있어 적용하지 않았어요. 기존 데이터는 그대로 유지됩니다.',
      validation: prepared.summary,
    }, { status: 422 })
  }

  const result = await applyManualImport(prepared, user.id)
  return NextResponse.json({ import: result }, { status: result.ok ? 200 : 500 })
}
