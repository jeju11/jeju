import { redirect } from 'next/navigation'
import { LandingPortal } from '@/components/landing-portal'
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }
export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  if (typeof params.replay === 'string') redirect(`/console?replay=${encodeURIComponent(params.replay)}`)
  return <LandingPortal />
}
