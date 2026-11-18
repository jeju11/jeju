import Link from 'next/link'

type Props = {
  user: { id: string; name: string; email: string } | null
  isAdmin: boolean
  historyItems: { id: string; question: string; districtType: string; userType: string; startMonth: string; endMonth: string; createdAt: string }[]
}

export function ReportDashboard({ user, historyItems }: Props) {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 text-slate-800">
    <Link className="text-sm text-blue-800 underline" href="/compare">주말 소비 비교로 돌아가기</Link>
    <h1 className="mt-6 text-3xl font-bold">내 질문 이력</h1>
    <p className="mt-3 text-sm text-slate-600">실제로 저장된 질문과 적용 조건만 표시해요.</p>
    {!user ? <p className="mt-8">이력은 계정 기능을 설정한 경우 본인 계정으로 로그인해야 볼 수 있어요. 기본 비교는 로그인 없이 이용할 수 있어요.</p>
      : !historyItems.length ? <p className="mt-8">아직 저장된 질문이 없어요.</p>
      : <ul className="mt-8 space-y-4">{historyItems.map(item => <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">{item.question}</h2>
          <p className="mt-2 text-sm">{item.districtType} · {item.userType} · {item.startMonth}~{item.endMonth}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-blue-800 underline" href={`/console?replay=${encodeURIComponent(item.id)}`}>같은 조건으로 다시 보기</Link>
        </li>)}</ul>}
  </main>
}
