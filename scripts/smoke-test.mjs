import assert from 'node:assert/strict'

const base = new URL(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3106')
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Use a local test server, not a live deployment.')
const filters = { districtType: '제주시', userType: '내국인', startMonth: '2017-11', endMonth: '2017-11' }
let checks = 0
async function post(body, expectedStatus = 200, headers = {}) {
  const response = await fetch(new URL('/api/compare', base), {
    method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  assert.equal(response.status, expectedStatus)
  checks++
  return response.json()
}

const home = await fetch(base)
assert.equal(home.status, 200)
assert.match(await home.text(), /제주머니/)
checks++
const input = await fetch(new URL('/compare', base))
assert.equal(input.status, 200)
assert.match(await input.text(), /어떤 주말 소비가 궁금하세요/)
checks++
const options = await (await fetch(new URL('/api/options', base))).json()
assert.equal(options.dataset.rowCount, 120)
assert.equal(options.groups.length, 4)
assert.ok(options.groups.every(group => group.availableMonths.length === 15))
checks++

const direct = await post({ filters })
assert.equal(direct.difference, 288)
const question = await post({ filters, question: '17년 11월 제주시 내국인 토·일 비교' })
assert.deepEqual(question.rows, direct.rows)
const monthly = await post({ filters, question: '그 차이가 매달 비슷했어?', previousContext: question.context })
assert.equal(monthly.intent, 'monthly')
const seogwipo = await post({ filters, question: '그럼 서귀포는?', previousContext: monthly.context })
assert.equal(seogwipo.difference, 998)
assert.equal(seogwipo.intent, 'monthly')
const groups = await post({ filters: { ...filters, startMonth: '2016-09' }, question: '두 구도심 내국인 중국인 월별 비교' })
assert.equal(groups.groupComparison.groups.length, 4)
assert.equal(groups.groupComparison.includedMonths.length, 15)
const unavailable = await post({ filters, question: '2025년 3월 자료를 볼 수 있어?' })
assert.equal(unavailable.status, 'empty')
assert.equal(unavailable.saturdayTotal, 0)
const clipped = await post({ filters, question: '16년 3월부터 17년 1월까지 제주시 주말 비교' })
assert.equal(clipped.rows.length, 5)
assert.equal(clipped.requestedPeriod.startMonth, '2016-03')

await post({ filters: { ...filters, startMonth: '2017-12' } }, 422)
await post({ filters, question: '제주시 매출 예측해줘' }, 422)
await post('{invalid', 400)
await post({ filters }, 403, { Origin: 'https://untrusted.example' })
await post('x'.repeat(17_000), 413)
const admin = await fetch(new URL('/api/admin', base))
assert.equal(admin.status, 403)
checks++
const imported = await fetch(new URL('/api/admin/import', base), { method: 'POST', headers: { Origin: base.origin } })
assert.equal(imported.status, 403)
checks++
const cron = await fetch(new URL('/api/cron', base))
assert.equal(cron.status, 401)
checks++
const auth = await fetch(new URL('/api/auth/get-session', base))
assert.equal(auth.status, 503)
checks++
const query = new URL('/compare', base)
query.searchParams.set('q', '17년 11월 제주시 내국인 토·일 비교')
const linked = await fetch(query)
assert.equal(linked.status, 200)
assert.match(await linked.text(), /288건/)
checks++
console.log(`Passed ${checks} local HTTP checks: pages, 15-month data, questions, follow-ups, groups, errors and protected endpoints.`)
