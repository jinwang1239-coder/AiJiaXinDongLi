const SETTLEMENT_MONTHS = [1, 2, 3, 4, 5]

const PRODUCTS = [
  { name: '家庭宽带', commission: { T1: 15, T2: 15, T3: 15, T4: 15, total: 60 } },
  { name: '全光组网', commission: { T1: 13, T2: 13, T3: 13, T4: 13, T5: 13, total: 65 } },
  { name: '智能组网', commission: { T1: 6, T2: 6, T3: 6, T4: 6, T5: 6, total: 30 } },
  { name: '家庭安防', commission: { T1: 6, T2: 6, T3: 6, T4: 6, T5: 6, total: 30 } },
  { name: '移动高清', commission: { T1: 4, T2: 4, T3: 4, T4: 4, T5: 4, total: 20 } },
  { name: 'HDICT', commission: { T2: 59, total: 59 } },
  { name: '号卡', commission: { T1: 5, T2: 5, total: 10 } },
  { name: '企业宽带', commission: { T2: 18, T3: 18, total: 36 } }
].map(product => ({
  ...product,
  category: '',
  subcategory: product.name,
  equivalentIncome: 0
}))

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()
}

function normalizeCommissionDetails(details = {}) {
  const normalized = {}
  let sum = 0

  SETTLEMENT_MONTHS.forEach(month => {
    const key = `T${month}`
    normalized[key] = toNumber(details[key])
    sum += normalized[key]
  })

  normalized.total = details.total !== undefined ? toNumber(details.total) : toNumber(sum)
  return normalized
}

function getMatchScore(searchName, product) {
  const searchNormalized = normalizeName(searchName)
  const productNormalized = normalizeName(product.name)

  return searchNormalized && searchNormalized === productNormalized
    ? 1000
    : 0
}

function findProductMatch(businessName) {
  let bestMatch = null
  let bestScore = 0

  PRODUCTS.forEach(product => {
    const score = getMatchScore(businessName, product)
    if (score > bestScore) {
      bestScore = score
      bestMatch = product
    }
  })

  if (!bestMatch) {
    return null
  }

  return {
    businessName: bestMatch.name,
    category: bestMatch.category,
    subcategory: bestMatch.subcategory,
    commission: normalizeCommissionDetails(bestMatch.commission),
    equivalentIncome: bestMatch.equivalentIncome || 0,
    matchScore: bestScore
  }
}

function getCommissionDetail(businessName) {
  return findProductMatch(businessName)
}

function calculateCommission(businessName) {
  const detail = getCommissionDetail(businessName)
  return detail ? detail.commission.total : 0
}

function parseDate(dateInput) {
  if (!dateInput) {
    return new Date()
  }

  if (dateInput instanceof Date) {
    return dateInput
  }

  const date = new Date(dateInput)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatMonth(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getMonthStart(dateInput) {
  const date = parseDate(dateInput)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(dateInput, monthOffset) {
  const date = parseDate(dateInput)
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1)
}

function buildSettlementSchedule(commissionDetails, businessDate, referenceDate = new Date()) {
  const currentMonth = getMonthStart(referenceDate)
  const baseDate = getMonthStart(businessDate)
  const details = normalizeCommissionDetails(commissionDetails)

  return SETTLEMENT_MONTHS.map(month => {
    const settlementDate = addMonths(baseDate, month)
    const settled = settlementDate <= currentMonth
    const key = `T${month}`
    const amount = toNumber(details[key])

    return {
      key,
      month,
      period: `T+${month}月`,
      amount,
      amountText: amount.toFixed(2),
      settled,
      status: settled ? 'settled' : 'unsettled',
      statusText: settled ? '已核算' : '未核算',
      settlementMonth: formatMonth(settlementDate)
    }
  })
}

function buildSettlementSummary(schedule = []) {
  const settledItems = schedule.filter(item => item.settled)
  const unsettledItems = schedule.filter(item => !item.settled)
  const settledTotal = toNumber(settledItems.reduce((sum, item) => sum + toNumber(item.amount), 0))
  const unsettledTotal = toNumber(unsettledItems.reduce((sum, item) => sum + toNumber(item.amount), 0))
  const maxSettledMonth = settledItems.reduce((max, item) => Math.max(max, item.month), 0)
  const settledRangeText = maxSettledMonth > 1
    ? `T+1月至T+${maxSettledMonth}月`
    : (maxSettledMonth === 1 ? 'T+1月' : '暂无已核算')
  const unsettledPeriodsText = unsettledItems.length
    ? unsettledItems.map(item => item.period).join('、')
    : '暂无未核算'

  return {
    settledTotal,
    unsettledTotal,
    settledTotalText: settledTotal.toFixed(2),
    unsettledTotalText: unsettledTotal.toFixed(2),
    maxSettledMonth,
    settledRangeText,
    unsettledPeriodsText
  }
}

function enrichRecordSettlement(record, referenceDate = new Date()) {
  const detail = record && record.commissionDetails
    ? { commission: normalizeCommissionDetails(record.commissionDetails) }
    : getCommissionDetail(record && record.businessName)
  const commissionDetails = detail ? detail.commission : normalizeCommissionDetails({ total: record && record.commission })
  const schedule = buildSettlementSchedule(
    commissionDetails,
    record && (record.date || record.businessDate || record.createTime),
    referenceDate
  )
  const summary = buildSettlementSummary(schedule)

  return {
    ...record,
    commission: record && record.commission !== undefined ? toNumber(record.commission) : commissionDetails.total,
    commissionDetails,
    settlementSchedule: schedule,
    settlementSummary: summary,
    settledTotal: summary.settledTotal,
    unsettledTotal: summary.unsettledTotal
  }
}

function getBusinessTypes() {
  return PRODUCTS.map(product => product.name)
}

module.exports = {
  calculateCommission,
  getCommissionDetail,
  findProductMatch,
  normalizeCommissionDetails,
  buildSettlementSchedule,
  buildSettlementSummary,
  enrichRecordSettlement,
  getBusinessTypes
}
