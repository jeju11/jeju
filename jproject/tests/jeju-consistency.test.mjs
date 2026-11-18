import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateObservations,
  interpretQuestion,
  resolveIntentComparison,
  validateFilters,
} from '../lib/jeju/aggregate.ts'
import { previewObservations } from '../lib/jeju/preview-data.ts'

const defaultFilters = {
  districtType: '제주시',
  userType: '내국인',
  startMonth: '2016-09',
  endMonth: '2017-11',
}

const benchmarkCases = [
  {
    name: '1. 2017년 11월 제주시 내국인 (+288)',
    question: '17년 11월 제주시 구도심 내국인 비교해줘',
    direct: {
      districtType: '제주시',
      userType: '내국인',
      startMonth: '2017-11',
      endMonth: '2017-11',
    },
    expected: {
      saturdayTotal: 13502,
      sundayTotal: 13214,
      difference: 288,
      rowCount: 1,
    },
  },
  {
    name: '2. 2017년 11월 제주시 중국인 (-73)',
    question: '17년 11월 제주시 중국인 비교해줘',
    direct: {
      districtType: '제주시',
      userType: '중국인',
      startMonth: '2017-11',
      endMonth: '2017-11',
    },
    expected: {
      saturdayTotal: 279,
      sundayTotal: 352,
      difference: -73,
      rowCount: 1,
    },
  },
  {
    name: '3. 2017년 11월 서귀포시 내국인 (+998)',
    question: '17년 11월 서귀포시 구도심 내국인 비교해줘',
    direct: {
      districtType: '서귀포시',
      userType: '내국인',
      startMonth: '2017-11',
      endMonth: '2017-11',
    },
    expected: {
      saturdayTotal: 11507,
      sundayTotal: 10509,
      difference: 998,
      rowCount: 1,
    },
  },
  {
    name: '4. 2017년 11월 서귀포시 중국인 (-7)',
    question: '17년 11월 서귀포시 중국인 비교해줘',
    direct: {
      districtType: '서귀포시',
      userType: '중국인',
      startMonth: '2017-11',
      endMonth: '2017-11',
    },
    expected: {
      saturdayTotal: 40,
      sundayTotal: 47,
      difference: -7,
      rowCount: 1,
    },
  },
  {
    name: '5. 2017년 4월 제주시 내국인 (+65)',
    question: '2017년 4월 제주시 구도심 내국인 비교',
    direct: {
      districtType: '제주시',
      userType: '내국인',
      startMonth: '2017-04',
      endMonth: '2017-04',
    },
    expected: {
      saturdayTotal: 16759,
      sundayTotal: 16694,
      difference: 65,
      rowCount: 1,
    },
  },
  {
    name: '6. 2016년 9월 ~ 2017년 1월 제주시 내국인 5개월 합계 (-340)',
    question: '16년 9월부터 17년 1월까지 제주시 내국인 비교',
    direct: {
      districtType: '제주시',
      userType: '내국인',
      startMonth: '2016-09',
      endMonth: '2017-01',
    },
    expected: {
      saturdayTotal: 57133,
      sundayTotal: 57473,
      difference: -340,
      rowCount: 5,
    },
  },
]

test('PRD Section 6: Question query and Direct selection produce 100% identical benchmark results', () => {
  for (const tc of benchmarkCases) {
    const questionInterpreted = interpretQuestion(tc.question, defaultFilters)
    const directFilters = validateFilters(tc.direct)

    assert.deepEqual(
      questionInterpreted.filters,
      directFilters,
      `Filters mismatch for ${tc.name}`,
    )

    const questionResult = resolveIntentComparison(previewObservations, questionInterpreted)
    const directResult = aggregateObservations(previewObservations, directFilters)

    assert.equal(questionResult.saturdayTotal, tc.expected.saturdayTotal, `Saturday total mismatch for ${tc.name}`)
    assert.equal(questionResult.sundayTotal, tc.expected.sundayTotal, `Sunday total mismatch for ${tc.name}`)
    assert.equal(questionResult.difference, tc.expected.difference, `Difference mismatch for ${tc.name}`)
    assert.equal(questionResult.rows.length, tc.expected.rowCount, `Row count mismatch for ${tc.name}`)

    assert.deepEqual(
      questionResult.rows,
      directResult.rows,
      `Monthly table rows mismatch for ${tc.name}`,
    )
    assert.equal(questionResult.saturdayTotal, directResult.saturdayTotal)
    assert.equal(questionResult.sundayTotal, directResult.sundayTotal)
    assert.equal(questionResult.difference, directResult.difference)
  }
})

test('PRD Section 6: Sum of individual monthly table rows strictly equals period totals', () => {
  const multiMonthRanges = [
    { startMonth: '2016-09', endMonth: '2017-01' },
    { startMonth: '2016-09', endMonth: '2017-11' },
    { startMonth: '2017-01', endMonth: '2017-08' },
  ]

  for (const districtType of ['제주시', '서귀포시']) {
    for (const userType of ['내국인', '중국인']) {
      for (const range of multiMonthRanges) {
        const filters = validateFilters({ districtType, userType, ...range })
        const result = aggregateObservations(previewObservations, filters)

        const calculatedSatSum = result.rows.reduce((sum, row) => sum + row.saturday, 0)
        const calculatedSunSum = result.rows.reduce((sum, row) => sum + row.sunday, 0)
        const calculatedDiffSum = result.rows.reduce((sum, row) => sum + row.difference, 0)

        assert.equal(calculatedSatSum, result.saturdayTotal)
        assert.equal(calculatedSunSum, result.sundayTotal)
        assert.equal(calculatedDiffSum, result.difference)
        assert.equal(result.saturdayTotal - result.sundayTotal, result.difference)
      }
    }
  }
})

test('resolveIntentComparison: handles availability and monthly intents correctly', () => {
  const availabilityQuery = interpretQuestion('어느 달까지 볼 수 있어?', defaultFilters)
  const availabilityResult = resolveIntentComparison(previewObservations, availabilityQuery)
  assert.equal(availabilityResult.filters.startMonth, '2017-11')
  assert.equal(availabilityResult.filters.endMonth, '2017-11')
  assert.match(availabilityResult.summary, /2017년 11월까지 비교할 수 있어요/)

  const monthlyQuery = interpretQuestion('그 차이가 매달 비슷했어?', defaultFilters)
  const monthlyResult = resolveIntentComparison(previewObservations, monthlyQuery)
  assert.match(monthlyResult.summary, /가장 작은 차이는/)
  assert.match(monthlyResult.summary, /가장 큰 차이는/)
  assert.match(monthlyResult.summary, /월별 차이 범위는/)
})
