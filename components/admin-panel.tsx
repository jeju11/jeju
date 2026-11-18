'use client'

import { useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react'

type Snapshot = {
  active: null | {
    version: string
    source: string
    rowCount: number
    observedStart: string | null
    observedEnd: string | null
    checksum: string | null
    appliedAt: Date | string | null
  }
  latestRefresh: null | {
    status: string
    startedAt: Date | string
    finishedAt: Date | string | null
    failureReason: string | null
    rowsReceived: number | null
  }
}

type ImportSummary = {
  totalRows: number
  validRowCount: number
  invalidRows: Array<{ rowNumber: number; reason: string }>
  duplicateRows: Array<{ rowNumber: number; reason: string }>
  observedStart: string | null
  observedEnd: string | null
  observedMonthCount: number
  completeMonths: Array<{ districtType: string; userType: string; months: string[] }>
  fullOfficialCoverage: boolean
  canApply: boolean
}

type Props = { initialSnapshot: Snapshot | null; initialError?: string | null }

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function AdminPanel({ initialSnapshot, initialError = null }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [message, setMessage] = useState(initialError)
  const [refreshState, setRefreshState] = useState<'success' | 'failed' | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [importValidation, setImportValidation] = useState<ImportSummary | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importState, setImportState] = useState<'success' | 'failed' | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isApplyingImport, setIsApplyingImport] = useState(false)

  async function refresh() {
    setIsRefreshing(true)
    setMessage(null)
    setRefreshState(null)
    try {
      const response = await fetch('/api/admin', { method: 'POST' })
      const payload = await response.json()
      setSnapshot({ active: payload.active ?? null, latestRefresh: payload.latestRefresh ?? null })
      if (!response.ok || !payload.refresh?.ok) {
        setRefreshState('failed')
        setMessage(payload.refresh?.reason ?? payload.error ?? '갱신하지 못했어요. 기존 데이터는 유지됩니다.')
      } else {
        setRefreshState('success')
        setMessage(`${payload.refresh.rowsReceived.toLocaleString('ko-KR')}개 행을 새 버전 ${payload.refresh.version}으로 적용했어요.`)
      }
    } catch {
      setRefreshState('failed')
      setMessage('서버와 연결하지 못했어요. 기존 데이터는 유지됩니다.')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function chooseImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setImportValidation(null)
    setImportMessage(null)
    setImportState(null)
    setFileContent(null)
    setFileName('')
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage('파일은 10MB 이하만 가져올 수 있어요.')
      setImportState('failed')
      event.target.value = ''
      return
    }
    try {
      setFileContent(await file.text())
      setFileName(file.name)
    } catch {
      setImportMessage('파일을 읽지 못했어요. CSV 또는 JSON 파일인지 확인해 주세요.')
      setImportState('failed')
    }
  }

  async function validateImport() {
    if (fileContent === null) return
    setIsValidating(true)
    setImportMessage(null)
    setImportState(null)
    try {
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', content: fileContent }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.validation) throw new Error(payload.error ?? '파일을 검증하지 못했어요.')
      setImportValidation(payload.validation)
      setImportMessage(
        payload.validation.canApply
          ? '검증을 마쳤어요. 아직 DB에는 아무것도 적용하지 않았습니다.'
          : '검증 오류 또는 중복 행이 있어 적용할 수 없어요. 기존 데이터는 유지됩니다.'
      )
      setImportState(payload.validation.canApply ? null : 'failed')
    } catch (error) {
      setImportValidation(null)
      setImportMessage(error instanceof Error ? error.message : '파일을 검증하지 못했어요.')
      setImportState('failed')
    } finally {
      setIsValidating(false)
    }
  }

  async function applyImport() {
    if (fileContent === null || !importValidation?.canApply) return
    setIsApplyingImport(true)
    setImportMessage(null)
    setImportState(null)
    try {
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', content: fileContent }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.import?.ok) {
        throw new Error(payload.import?.reason ?? payload.error ?? '파일을 적용하지 못했어요.')
      }
      setImportState('success')
      setImportMessage(
        `${payload.import.rowsReceived.toLocaleString('ko-KR')}개 유효 행을 적용했어요. 적용 후 비교 데이터는 기존 월을 보존해 병합했습니다.`
      )
      try {
        const snapshotResponse = await fetch('/api/admin')
        if (snapshotResponse.ok) setSnapshot(await snapshotResponse.json())
      } catch {
        // Keep the successful apply state
      }
    } catch (error) {
      setImportState('failed')
      setImportMessage(error instanceof Error ? error.message : '파일을 적용하지 못했어요. 기존 데이터는 유지됩니다.')
    } finally {
      setIsApplyingImport(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] px-4 py-8 font-sans text-slate-900 selection:bg-[#005BAC] selection:text-white sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#005BAC]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 포털 홈으로 돌아가기
        </Link>

        {/* 상단 관리자 타이틀 */}
        <div className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#005BAC]">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-wider text-[#005BAC]">DATA OPERATIONS</p>
              <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900">공공데이터 운영 관리자</h1>
              <p className="mt-1 text-xs text-slate-500">
                제주데이터허브 608호 관측 데이터 버전 동기화 및 무결성 관리
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded bg-[#005BAC] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#004380] disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? '전체 수집 동기화 중…' : '공식 데이터 새로고침'}</span>
          </button>
        </div>

        {message && (
          <div
            role={refreshState === 'failed' ? 'alert' : 'status'}
            className={`mt-4 flex items-start gap-2.5 rounded-xl border p-4 text-xs leading-relaxed ${
              refreshState === 'failed'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {refreshState === 'failed' ? (
              <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {/* 파일 수동 가져오기 */}
        <section aria-labelledby="import-title" className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Upload aria-hidden="true" className="size-4 text-[#005BAC]" />
            <h2 id="import-title" className="text-sm font-bold text-slate-900">
              집계 원자료 수동 가져오기
            </h2>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            CSV 또는 JSON(평평한 배열, data 배열, responses 응답 배열)을 검증한 뒤 적용합니다. 최대 파일 크기는 10MB입니다.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="dataset-import-file" className="mb-1.5 block text-xs font-semibold text-slate-600">
                제주데이터허브 608 원자료 파일
              </label>
              <input
                id="dataset-import-file"
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={(event) => void chooseImportFile(event)}
                className="block min-h-11 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-[#EFF6FF] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#005BAC] focus:border-[#005BAC]"
              />
              <p className="mt-1 truncate text-[11px] text-slate-400">
                {fileName || '선택한 파일은 검증 전까지 서버에 전송되지 않습니다.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void validateImport()}
              disabled={fileContent === null || isValidating || isApplyingImport}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <FileCheck2 aria-hidden="true" className="size-4" />
              <span>{isValidating ? '파일 검증 중…' : '적용 전 사전 검증'}</span>
            </button>
          </div>

          {importMessage && (
            <div
              role={importState === 'failed' ? 'alert' : 'status'}
              className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${
                importState === 'failed'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {importState === 'failed' ? (
                <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{importMessage}</span>
            </div>
          )}

          {importValidation && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold text-slate-900">검증 미리보기</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[11px] font-semibold text-slate-500">전체 행</dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {importValidation.totalRows.toLocaleString('ko-KR')}행
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[11px] font-semibold text-slate-500">유효·고유 행</dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-emerald-600">
                    {importValidation.validRowCount.toLocaleString('ko-KR')}행
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[11px] font-semibold text-slate-500">오류 행</dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-rose-600">
                    {importValidation.invalidRows.length.toLocaleString('ko-KR')}행
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[11px] font-semibold text-slate-500">중복 행</dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-amber-600">
                    {importValidation.duplicateRows.length.toLocaleString('ko-KR')}행
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => void applyImport()}
                disabled={!importValidation.canApply || isApplyingImport || isValidating}
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded bg-[#005BAC] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#004380] disabled:opacity-50"
              >
                <Upload aria-hidden="true" className="size-4" />
                <span>{isApplyingImport ? '기존 데이터와 병합 중…' : '검증된 행 DB 적용'}</span>
              </button>
            </div>
          )}
        </section>

        {/* 현재 적용 데이터 */}
        <section aria-labelledby="snapshot-title" className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Database aria-hidden="true" className="size-4 text-[#005BAC]" />
            <h2 id="snapshot-title" className="text-sm font-bold text-slate-900">
              현재 활성 데이터베이스 스냅샷
            </h2>
          </div>
          {snapshot?.active ? (
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 text-xs">
              <div>
                <dt className="font-semibold text-slate-500">활성 버전</dt>
                <dd className="mt-1 font-bold text-slate-900">{snapshot.active.version}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">관측 행 수</dt>
                <dd className="mt-1 font-bold tabular-nums text-slate-900">
                  {snapshot.active.rowCount.toLocaleString('ko-KR')}건
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">실제 관측 기간</dt>
                <dd className="mt-1 font-bold text-slate-900">
                  {snapshot.active.observedStart ?? '—'} ~ {snapshot.active.observedEnd ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">적용 시각</dt>
                <dd className="mt-1 font-bold text-slate-900">{formatDate(snapshot.active.appliedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-slate-500">체크섬 (SHA-256)</dt>
                <dd className="mt-1 font-mono text-[11px] text-slate-600">
                  {snapshot.active.checksum ?? '초기 미리보기 데이터'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500">
              활성 DB 버전이 없습니다. 포털은 내장 고성능 미리보기 데이터(120행)를 사용합니다.
            </p>
          )}
        </section>

        {/* 최근 갱신 기록 */}
        <section aria-labelledby="refresh-title" className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4 text-[#005BAC]" />
            <h2 id="refresh-title" className="text-sm font-bold text-slate-900">
              최근 자동 갱신 기록
            </h2>
          </div>
          {snapshot?.latestRefresh ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-xs">
              <div>
                <dt className="font-semibold text-slate-500">결과</dt>
                <dd
                  className={`mt-1 font-bold ${
                    snapshot.latestRefresh.status === 'success' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {snapshot.latestRefresh.status === 'success' ? '성공' : '실패'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">수집 시작 시각</dt>
                <dd className="mt-1 font-bold text-slate-900">{formatDate(snapshot.latestRefresh.startedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">수집 행 수</dt>
                <dd className="mt-1 font-bold tabular-nums text-slate-900">
                  {snapshot.latestRefresh.rowsReceived?.toLocaleString('ko-KR') ?? '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500">아직 갱신 이력이 없습니다.</p>
          )}
        </section>
      </div>
    </main>
  )
}
