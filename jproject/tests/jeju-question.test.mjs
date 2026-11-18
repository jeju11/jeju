import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateObservations, interpretQuestion } from '../lib/jeju/aggregate.ts'
import { previewObservations } from '../lib/jeju/preview-data.ts'

const selected = {
  districtType: '제주시',
  userType: '내국인',
  startMonth: '2016-09',
  endMonth: '2017-11',
}

test('applies the abbreviated date and district from a natural-language question', () => {
  const { filters } = interpretQuestion('17년 11월 제주 구도심 내국인 토·일 비교해줘', {
    ...selected, districtType: '서귀포시',
  })
  assert.deepEqual(filters, { ...selected, startMonth: '2017-11', endMonth: '2017-11' })
  assert.equal(aggregateObservations(previewObservations, filters).difference, 288)
})

test('intersects a requested range with the official coverage and retains its original bounds', () => {
  const { filters, requestedPeriod } = interpretQuestion('16년 3월부터 17년 1월까지', selected)
  assert.deepEqual(requestedPeriod, { startMonth: '2016-03', endMonth: '2017-01' })
  assert.deepEqual(filters, { ...selected, endMonth: '2017-01' })
  const result = aggregateObservations(previewObservations, filters)
  assert.equal(result.rows.length, 5)
  assert.equal(result.rows[0].month, '2016-09')
  assert.equal(result.rows.at(-1).month, '2017-01')
})

test('understands a same-year abbreviated end and mixes date formats in reading order', () => {
  assert.deepEqual(interpretQuestion('2017년 4월부터 6월까지', selected).filters,
    { ...selected, startMonth: '2017-04', endMonth: '2017-06' })
  assert.deepEqual(interpretQuestion('2016-10부터 17년 3월까지', selected).filters,
    { ...selected, startMonth: '2016-10', endMonth: '2017-03' })
})

test('rejects wholly unavailable, reversed, invalid, ambiguous and unsupported input', () => {
  for (const [question, expected] of [
    ['18년 1월부터 18년 3월까지', /공식 수집 기간/],
    ['17년 4월부터 16년 10월까지', /시작월은/],
    ['17년 13월 비교', /1월부터 12월/],
    ['11월 비교', /연도도 함께/],
    ['안녕하세요', /비교할 지역/],
    ['이번 주말 제주 구도심', /조회할 연도와 월/],
  ]) {
    assert.throws(() => interpretQuestion(question, selected), expected)
  }
})

test('preserves direct selection, follow-up conditions and supported intents', () => {
  assert.deepEqual(interpretQuestion('', selected).filters, selected)
  const { filters } = interpretQuestion('2017년 11월 제주시 내국인 비교해줘', selected)
  const followUp = interpretQuestion('그럼 서귀포는?', selected, filters)
  assert.deepEqual(followUp.filters, { ...filters, districtType: '서귀포시' })
  assert.equal(aggregateObservations(previewObservations, followUp.filters).difference, 998)
  assert.equal(interpretQuestion('그 차이가 매달 비슷했어?', selected, filters).intent, 'monthly')
  assert.equal(interpretQuestion('어느 달까지 볼 수 있어?', selected, filters).intent, 'availability')
})
