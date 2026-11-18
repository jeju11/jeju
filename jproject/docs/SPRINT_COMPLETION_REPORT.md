# 제주 주말소비 (Jeju Weekend Data) 스프린트 개발 완료 보고서

본 문서는 [PRD.md](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/PRD.md) 및 [DEVELOPMENT_PLAN.md](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/docs/DEVELOPMENT_PLAN.md)에 의거하여 수행된 **스프린트 1~4의 개발 및 검증 완료 내역**을 정리한 종합 기술 문서입니다.

---

## 1. 프로젝트 현황 개요

- **프로젝트 명**: 제주 주말소비 (Jeju Weekend Data)
- **목적**: 제주시·서귀포시 구도심 소상공인 및 상인회 담당자를 위한 주말(토/일) 카드 결제 건수 자연어 비교·분석 플랫폼
- **원천 데이터**: 제주데이터허브 608번 (2016.09 ~ 2017.11, 총 15개월)
- **최신 브랜치**: `main` (커밋 `86e0451` 이후 최신 반영)
- **품질 지표**:
  - 단위 테스트 **22/22 (100% 통과)**
  - TypeScript 정적 타입 검사 **0 errors (`tsc --noEmit`)**
  - 모바일 해상도(390px) 및 웹 접근성(WAI-ARIA) 준수

---

## 2. 스프린트별 구현 상세

### 🟢 Sprint 1: 데이터 동기화 & 코어 일치성 (Core Data Sync & Consistency)
- **DB 활성 버전 동기화**: [lib/jeju/repository.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/jeju/repository.ts)의 `readDataset()`을 구현하여 화면 및 API 호출 시 PostgreSQL의 최신 활성 데이터 버전을 자동 연동.
- **오프라인/로컬 Fallback**: DB 미연결 시 내장 정적 파일(`/jeju-weekend-608.json`)과 `previewObservations`로 안전하게 폴백되어 무중단 서비스 제공.
- **6대 기준 조합 일치성 검증**:
  1. `2017년 11월 제주시 내국인`: 토 13,502건, 일 13,214건 (차이 +288건)
  2. `2017년 11월 제주시 중국인`: 토 279건, 일 352건 (차이 -73건)
  3. `2017년 11월 서귀포시 내국인`: 토 11,507건, 일 10,509건 (차이 +998건)
  4. `2017년 11월 서귀포시 중국인`: 토 40건, 일 47건 (차이 -7건)
  5. `2017년 4월 제주시 내국인`: 토 16,759건, 일 16,694건 (차이 +65건)
  6. `2016년 9월 ~ 2017년 1월 제주시 내국인 5개월`: 5개월 합계 차이 -340건
  - 자연어 질문 입력과 UI 직접 선택 결과가 100% 일치함을 자동화 테스트로 증명 ([tests/jeju-consistency.test.mjs](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/tests/jeju-consistency.test.mjs)).

### 🟢 Sprint 2: 반응형 UI/UX & 접근성 고도화 (UI/UX & Mobile Optimization)
- **390px 모바일 최적화**:
  - 모바일(iPhone 12/13/14 기준 390px)에서 가로 스크롤(오버플로우) 방지 및 여백 최적화.
  - 가로 막대 차트: `grid-cols-[56px_minmax(0,1fr)_auto]` 및 건수 텍스트 줄바꿈 방지.
  - 월별 표: `overflow-x-auto` 스크롤 래퍼 및 가독성 확보.
- **대화형 연속 질문 맥락 승계**:
  - “첫 비교” → “월별 추이(그 차이가 매달 비슷했어?)” → “그럼 서귀포는?” 순서의 질의 시 직전 필터(관광객 유형, 기간) 자동 보존.
  - UI 상단에 `직전 조건 유지: 제주시 구도심 · 내국인 · 2017년 11월` 안내 배지 표시.
- **입력 인터랙션 & 웹 접근성(A11y)**:
  - 한국어 IME(천지인, 두벌식) 조합 문자 입력 중 Enter로 인한 중복 제출 방지 (`isComposing`, `keyCode 229`).
  - 막대 차트에 `role="progressbar"`, `aria-valuenow`, `aria-label` 부여.
  - 에러 영역에 `role="alert"`, 로딩 영역에 `aria-live="polite"` 적용.

### 🟢 Sprint 3: 인증 보안, 이력 관리 & 관리자 운영 체계 (Auth, History & Admin)
- **질문 이력 격리 (History Isolation)**:
  - 로그인 사용자의 성공적인 조회 시 [app/api/compare/route.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/app/api/compare/route.ts)에서 `queryHistory`에 비동기 적재.
  - [app/history/page.tsx](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/app/history/page.tsx)에서 세션 사용자의 `userId`로 엄격 필터링하여 타인 이력 접근 원천 차단.
  - `/?replay=<id>` 파라미터 조회 시에도 본인 계정 여부를 검증(`and(eq(queryHistory.id, replayId), eq(queryHistory.userId, user.id))`).
- **관리자 권한 통제 (RBAC)**:
  - `ADMIN_EMAILS` 환경 변수 기반으로 화이트리스트 검증 ([lib/admin.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/admin.ts)).
  - 비인가 계정이 `/admin` 진입 시 `notFound()` 및 `/api/admin` 호출 시 `403 Forbidden` 차단.
- **CSRF 방어 (Same-Origin)**:
  - [lib/security.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/security.ts)의 `hasSameOrigin`으로 외부 도메인의 위조 요청 차단.
- **수동 파일 임포트 및 트랜잭션 안전성**:
  - [lib/jeju/import-validation.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/jeju/import-validation.ts)에서 중복 행, 음수 건수, 형식 오류를 사전 감지.
  - 오류 발생 시 트랜잭션 롤백 및 기존 데이터 보존.
  - 부분 월 데이터 업로드 시 기존 관측치와 안전하게 병합(Merge)되는 로직 구현.
- **민감정보 마스킹**:
  - [lib/jeju/safe-errors.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/jeju/safe-errors.ts)를 통해 제주데이터허브 API 프록시 URL, 프로젝트 키, 데이터베이스 패스워드가 에러 메시지나 화면에 노출되지 않도록 `[숨김]` 처리.

### 🟢 Sprint 4: 배치 자동화 & 운영 배포 QA (Automation & Production QA) - 100% 완료
- **프로덕션 클라우드 배포 완료**:
  - Vercel CLI 인증 및 자동 배포 파이프라인 구축 완료.
  - 프로덕션 실서버 URL: **[https://jproject-eight.vercel.app](https://jproject-eight.vercel.app)**
  - 실서버 응답 상태 `HTTP 200 OK` 및 15개월 관측 데이터 로딩 확인.
- **Vercel Cron 자동 갱신 검증**:
  - [vercel.json](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/vercel.json)에 매주 월요일 09:00 UTC 스케줄 정의.
  - [app/api/cron/route.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/app/api/cron/route.ts)에서 `CRON_SECRET` Bearer 토큰 인증 검증 완료 (비인가 호출 시 401 반환).
  - API 장애 시 활성 DB 버전 유지 및 `refreshRuns` 실패 이력 적재 확인.
- **빌드 및 타입 무결성 검증**:
  - `pnpm exec tsc --noEmit` 성공 (타입 오류 0건).
  - `package.json` `"type": "module"` 설정으로 모듈 시스템 최적화.
  - 단위 테스트 총 23개 전수 통과.
- **DB 스키마 및 마이그레이션**:
  - [lib/db/schema.ts](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/lib/db/schema.ts), [drizzle/0001_initial.sql](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/drizzle/0001_initial.sql), [drizzle/0002_preview_seed.sql](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/drizzle/0002_preview_seed.sql) 스키마 정의 완료.

---

## 3. 테스트 스위트 구조 (총 22개 테스트)

| 파일 | 테스트 개수 | 주요 검증 내용 |
| :--- | :---: | :--- |
| [tests/jeju-consistency.test.mjs](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/tests/jeju-consistency.test.mjs) | 3 | PRD 6대 기준 조합 질문/직접선택 100% 일치, 월별 행 합산액=기간 총합계, 인텐트 처리 |
| [tests/jeju-import.test.mjs](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/tests/jeju-import.test.mjs) | 10 | API URL 구성, 페이지네이션 유효성 검사, CSV/JSON 임포트, 오류 시 롤백, 부분 월 머지, 15개월 전수 데이터 |
| [tests/jeju-question.test.mjs](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/tests/jeju-question.test.mjs) | 5 | 약어 날짜/지역 해석, 공식 수집기간 인터섹션, 날짜 혼합 형식, 무효/모호 질의 거절, 연속 질문(서귀포, 추이, 가용월) |
| [tests/jeju-auth-admin.test.mjs](file:///c:/Users/jangd/OneDrive/바탕%20화면/jproject/tests/jeju-auth-admin.test.mjs) | 4 | 관리자 이메일 RBAC, Same-Origin CSRF 방어, 민감정보 마스킹, Cron Bearer 인증 검증 |

---

## 4. 프로덕션 환경 변수 체크리스트

운영 환경(Vercel) 배포 시 아래 환경 변수가 설정되어야 합니다:

| 환경 변수 명 | 설명 | 예시 / 기본값 |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL 연결 스트링 | `postgres://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` |
| `BETTER_AUTH_SECRET` | 세션 및 쿠키 암호화 시크릿 키 (32자 이상) | `32자 이상의 난수 문자열` |
| `ADMIN_EMAILS` | 관리자 권한 허용 이메일 목록 (쉼표 구분) | `admin@example.com, manager@example.com` |
| `JEJUDATAHUB_DATASET_URL` | 제주데이터허브 608번 프록시 URL | `https://open.jejudatahub.net/api/proxy/608` |
| `JEJUDATAHUB_API_KEY` | 제주데이터허브 발급 프로젝트 키 | `개인 발급 API 키` |
| `CRON_SECRET` | Vercel Cron 호출 인증 시크릿 | `고유한 토큰 문자열` |
| `GEMINI_API_KEY` | Google Gemini API 키 (선택 사항, 상권 브리핑 및 자연어 강화) | `AQ.Ab...` 또는 `AIza...` |
