import assert from 'node:assert/strict'
import test from 'node:test'
import { isAdminEmail } from '../lib/admin.ts'
import { hasSameOrigin } from '../lib/security.ts'
import { sanitizeProviderFailureReason } from '../lib/jeju/safe-errors.ts'
import { getGeminiApiKey, isGeminiConfigured } from '../lib/gemini.ts'

test('Sprint 3: isAdminEmail validates admin permissions accurately', () => {
  const originalEnv = process.env.ADMIN_EMAILS
  try {
    process.env.ADMIN_EMAILS = 'admin@jeju.go.kr, SuperAdmin@Jeju.com '

    assert.equal(isAdminEmail('admin@jeju.go.kr'), true)
    assert.equal(isAdminEmail('ADMIN@JEJU.GO.KR'), true) // Case-insensitive
    assert.equal(isAdminEmail('superadmin@jeju.com'), true) // Trimmed & lowercased
    assert.equal(isAdminEmail('other@jeju.go.kr'), false)
    assert.equal(isAdminEmail(''), false)
    assert.equal(isAdminEmail(null), false)
    assert.equal(isAdminEmail(undefined), false)
  } finally {
    process.env.ADMIN_EMAILS = originalEnv
  }
})

test('Sprint 3: hasSameOrigin defends against CSRF and cross-origin attacks', () => {
  // 1. Missing origin header
  const reqNoOrigin = new Request('http://localhost:3000/api/compare', {
    method: 'POST',
    headers: { host: 'localhost:3000' },
  })
  assert.equal(hasSameOrigin(reqNoOrigin), false)

  // 2. Matching standard origin
  const reqSameOrigin = new Request('http://localhost:3000/api/compare', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  })
  assert.equal(hasSameOrigin(reqSameOrigin), true)

  // 3. Different domain / port origin (CSRF attempt)
  const reqCrossOrigin = new Request('http://localhost:3000/api/compare', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'https://malicious-site.com',
    },
  })
  assert.equal(hasSameOrigin(reqCrossOrigin), false)

  // 4. Reverse proxy / Vercel forwarded headers
  const reqForwarded = new Request('http://internal-cluster/api/compare', {
    method: 'POST',
    headers: {
      'x-forwarded-host': 'jeju-weekend.vercel.app',
      'x-forwarded-proto': 'https',
      origin: 'https://jeju-weekend.vercel.app',
    },
  })
  assert.equal(hasSameOrigin(reqForwarded), true)

  const reqForwardedMismatch = new Request('http://internal-cluster/api/compare', {
    method: 'POST',
    headers: {
      'x-forwarded-host': 'jeju-weekend.vercel.app',
      'x-forwarded-proto': 'https',
      origin: 'https://attacker.com',
    },
  })
  assert.equal(hasSameOrigin(reqForwardedMismatch), false)
})

test('Sprint 3: safe-errors masks API keys, project URLs, and credentials', () => {
  const sampleSecret = 'apikey-12345-secret-key'
  const rawProxyUrl = `Request failed at https://open.jejudatahub.net/api/proxy/608/${sampleSecret}?number=1 authorization: Bearer ${sampleSecret}`

  const sanitizedWithProxy = sanitizeProviderFailureReason(rawProxyUrl, undefined, sampleSecret)
  assert.equal(sanitizedWithProxy.includes(sampleSecret), false)
  assert.equal(sanitizedWithProxy.includes('/api/proxy/608/'), false)
  assert.equal(sanitizedWithProxy.includes('[제주데이터허브 요청 주소 숨김]'), true)
  assert.equal(sanitizedWithProxy.includes('[인증 정보 숨김]'), true)

  const rawWithCustomEndpoint = 'DB query failed at postgres://user:password@neon.tech/db'
  const sanitizedEndpoint = sanitizeProviderFailureReason(rawWithCustomEndpoint, 'postgres://user:password@neon.tech/db', undefined)
  assert.equal(sanitizedEndpoint.includes('password@neon.tech'), false)
  assert.equal(sanitizedEndpoint.includes('[숨김]'), true)
})

test('Sprint 4: Cron secret validation logic rejects unauthorized requests', () => {
  const cronSecret = 'test-cron-secret-1234'
  function verifyCronAuth(authHeader, expectedSecret) {
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return { status: 401, error: '허용되지 않은 요청입니다.' }
    }
    return { status: 200 }
  }

  assert.equal(verifyCronAuth(null, cronSecret).status, 401)
  assert.equal(verifyCronAuth('Bearer wrong-secret', cronSecret).status, 401)
  assert.equal(verifyCronAuth(`Bearer ${cronSecret}`, cronSecret).status, 200)
  assert.equal(verifyCronAuth(`Bearer ${cronSecret}`, undefined).status, 401)
})

test('Gemini API: getGeminiApiKey resolves key with fallback support', () => {
  const originalEnv = { ...process.env }
  try {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_GENAI_API_KEY

    assert.equal(isGeminiConfigured(), false)
    assert.equal(getGeminiApiKey(), null)

    process.env.GEMINI_API_KEY = 'test-gemini-key'
    assert.equal(isGeminiConfigured(), true)
    assert.equal(getGeminiApiKey(), 'test-gemini-key')

    delete process.env.GEMINI_API_KEY
    process.env.GOOGLE_API_KEY = 'test-google-key'
    assert.equal(isGeminiConfigured(), true)
    assert.equal(getGeminiApiKey(), 'test-google-key')
  } finally {
    process.env = originalEnv
  }
})

