'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

type Props = {
  mode: 'sign-in' | 'sign-up'
  redirectTo: string
}

export function AuthForm({ mode, redirectTo }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSignUp = mode === 'sign-up'
  const destination = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password })
      if (result.error) {
        setError(
          isSignUp
            ? '계정을 만들지 못했어요. 이메일 주소를 확인하거나 이미 가입한 계정인지 확인해 주세요.'
            : '이메일 또는 비밀번호를 확인해 주세요.'
        )
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setError('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 py-10 font-sans text-slate-900 selection:bg-[#005BAC] selection:text-white">
      <div className="w-full max-w-[440px]">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#005BAC]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 포털 홈으로 돌아가기
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#005BAC]">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <p className="mt-4 text-xs font-bold tracking-wider text-[#005BAC]">(재)제주테크노파크 빅데이터 센터</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            {isSignUp ? '상인회 및 분석 계정 생성' : '상인회 로그인'}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {isSignUp
              ? '질문 이력 및 공식 의사결정 보고서를 계정에 안전하게 보관하세요.'
              : '로그인하여 저장된 상권 분석 이력과 보고서를 확인하세요.'}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {isSignUp && (
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                이름 (담당자/상호명)
                <span className="relative">
                  <UserRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none transition focus:border-[#005BAC] focus:ring-2 focus:ring-[#005BAC]/20"
                    placeholder="홍길동"
                  />
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
              이메일
              <span className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none transition focus:border-[#005BAC] focus:ring-2 focus:ring-[#005BAC]/20"
                  placeholder="name@example.com"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
              비밀번호
              <span className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-xs text-slate-900 outline-none transition focus:border-[#005BAC] focus:ring-2 focus:ring-[#005BAC]/20"
                  placeholder="8자 이상 입력"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}

            <button
              disabled={isSubmitting}
              type="submit"
              className="mt-1 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#005BAC] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#004380] disabled:opacity-60"
            >
              {isSubmitting ? '인증 처리 중…' : isSignUp ? '계정 만들기' : '로그인'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {isSignUp ? '이미 계정이 있으신가요?' : '처음 방문하셨나요?'}{' '}
            <Link
              href={isSignUp ? '/sign-in' : '/sign-up'}
              className="font-bold text-[#005BAC] underline underline-offset-4 hover:text-[#004380]"
            >
              {isSignUp ? '로그인' : '계정 만들기'}
            </Link>
          </p>
        </section>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          제주데이터허브 제608호 관측 데이터 연계 공공 행정 포털
        </p>
      </div>
    </main>
  )
}
