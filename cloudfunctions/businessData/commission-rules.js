const SETTLEMENT_MONTHS = [1, 2, 3, 4, 5]

const PRODUCTS = [
  { category: '号卡业务', subcategory: '副卡', name: '家庭成员卡、幸福卡', commission: { T1: 3, T2: 3, total: 6 }, equivalentIncome: 10 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享39元', commission: { T1: 5, T2: 5, T3: 5, T4: 5, total: 20 }, equivalentIncome: 30 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享59元', commission: { T1: 25, T2: 21, T3: 21, T4: 4, total: 71 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享79元', commission: { T1: 43, T2: 43, T3: 43, T4: 38, total: 167 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享99元', commission: { T1: 53, T2: 53, T3: 53, T4: 48, total: 207 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享129元', commission: { T1: 70, T2: 70, T3: 70, T4: 62, total: 272 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '普通放号', name: '全家享199元', commission: { T1: 107, T2: 107, T3: 107, T4: 96, total: 417 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '优质客户', name: '优质客户79元', commission: { T2: 71, T3: 71, T4: 71, T5: 71, total: 284 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '优质客户', name: '优质客户129元', commission: { T2: 116, T3: 116, T4: 116, T5: 116, total: 464 }, equivalentIncome: 70 },
  { category: '号卡业务', subcategory: '套餐升档', name: '按照套餐实际消费提升价值,以新旧差额20元（79套餐及以上）', commission: { T1: 5, T2: 5, T3: 2, total: 12 }, equivalentIncome: 10 },
  { category: '宽带业务', subcategory: '一宽', name: '主套餐59元以下 (300M以下)', commission: { T1: 5, T2: 5, T3: 5, T4: 5, total: 20 }, equivalentIncome: 45 },
  { category: '宽带业务', subcategory: '一宽', name: '主套餐59元-79元(不含) (300M-500M)', commission: { T1: 9, T2: 9, T3: 9, T4: 9, total: 36 }, equivalentIncome: 45 },
  { category: '宽带业务', subcategory: '一宽', name: '主套餐79元及以上 (1000M以上)', commission: { T1: 14, T2: 14, T3: 14, T4: 14, total: 56 }, equivalentIncome: 45 },
  { category: '宽带业务', subcategory: '家庭权益产品', name: '千兆提速（绿色上网）（3元/月）', commission: { T2: 5, total: 5 }, equivalentIncome: 5 },
  { category: '智家业务', subcategory: 'FTTR', name: '一次性付费产品 (1688元)', commission: { T1: 253, total: 253 }, equivalentIncome: 49 },
  { category: '智家业务', subcategory: 'FTTR', name: '一次性付费产品 (599元)', commission: { T1: 90, total: 90 }, equivalentIncome: 49 },
  { category: '智家业务', subcategory: 'FTTR', name: '全光组网融合套餐直降30元', commission: { T1: 24, T2: 12, T3: 12, T4: 12, T5: 12, total: 72 }, equivalentIncome: 49 },
  { category: '智家业务', subcategory: 'FTTR', name: '全光组网融合套餐直降20元', commission: { T1: 24, T2: 12, T3: 12, T4: 12, T5: 12, total: 72 }, equivalentIncome: 49 },
  { category: '智家业务', subcategory: 'FTTR', name: '399FTTR', commission: { T1: 72, total: 72 }, equivalentIncome: 49 },
  { category: '智家业务', subcategory: '智能组网', name: '全家WIFI1台-298版', commission: { T1: 29, total: 29 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '智能组网', name: '湖北移动全家WiFi小福袋(15元/月)【2025】', commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '智能组网', name: '湖北移动看家小福袋组网版(25元/月)【2025】', commission: { T1: 15, T2: 8, T3: 8, T4: 8, T5: 8, total: 47 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '安防', name: '移动看家260礼包', commission: { T1: 29, total: 29 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '安防', name: '湖北移动看家小福袋室内/外版(15元/月)【2025】', commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '安防', name: '湖北移动看家小福袋室内/外版(25元/月)【2025】', commission: { T1: 15, T2: 8, T3: 8, T4: 8, T5: 8, total: 47 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '安防', name: '组网安防套包 (20元/月)', commission: { T1: 12, T2: 6, T3: 6, T4: 6, T5: 6, total: 36 }, equivalentIncome: 15 },
  { category: '智家业务', subcategory: '大颗粒礼包', name: '520全家福礼包安防室内/外', commission: { T1: 94, total: 94 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '大颗粒礼包', name: '365全家福礼包', commission: { T1: 66, total: 66 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '移动高清', name: '移动高清清灵犀版 (15元/月)', commission: { T1: 7, T2: 4, T3: 4, T4: 4, T5: 4, total: 23 }, equivalentIncome: 0 },
  { category: '智家业务', subcategory: '移动高清', name: '大屏增值业务 (10元/月)', commission: { T1: 3, total: 3 }, equivalentIncome: 0 },
  { category: '智家业务', subcategory: '语音遥控器', name: '语音遥控资费年包36元/年', commission: { T1: 7, total: 7 }, equivalentIncome: 0 },
  { category: '智家业务', subcategory: '全屋智能', name: '1599元档-爱家尊享入服务包 (标准包18)', commission: { T1: 336, total: 336 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '999元档-爱家智能出入服务包 (标准包16)', commission: { T1: 210, total: 210 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '399元档-爱家主食蒸煮/无油烹饪服务包 (标准包5)', commission: { T1: 60, total: 60 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '239元档-爱家运动健康/血压监测/伴学免抄服务包 (标准包2)', commission: { T1: 36, total: 36 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '199元档-爱家体脂监测服务包 (标准包1)', commission: { T1: 30, total: 30 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '359元档-爱家防暑降温服务包 (标准包4)', commission: { T1: 54, total: 54 }, equivalentIncome: 34 },
  { category: '智家业务', subcategory: '全屋智能', name: '299元档-爱家伴学照明服务包 (标准包3)', commission: { T1: 45, total: 45 }, equivalentIncome: 34 },
  { category: '商客业务', subcategory: '千里眼', name: '中小企业千里眼15元/月', commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 }, equivalentIncome: 13 },
  { category: '商客业务', subcategory: '千里眼', name: '中小企业千里眼10元/月', commission: { T1: 6, T2: 3, T3: 3, T4: 3, T5: 3, total: 18 }, equivalentIncome: 13 },
  { category: '商客业务', subcategory: '云电脑', name: '全省云电脑预存享活动2160元档', commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 }, equivalentIncome: 10 },
  { category: '商客业务', subcategory: '云电脑', name: '全省云电脑预存享活动1680元档', commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 }, equivalentIncome: 10 },
  { category: '商客业务', subcategory: '云电脑', name: '大众版云电脑365礼包', commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 }, equivalentIncome: 10 },
  { category: '商客业务', subcategory: '云电脑', name: '大众版云电脑分月优惠活动50元档', commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 }, equivalentIncome: 10 },
  { category: '新增', subcategory: '爱家亲情圈', name: '爱家亲情圈', commission: { T1: 6, total: 6 }, equivalentIncome: 0 },
  { category: '新增', subcategory: '移动高清-大屏点播', name: '移动高清-优选电影包1元', commission: { T1: 0.6, T2: 0.3, T3: 0.3, T4: 0.3, T5: 0.3, total: 1.8 }, equivalentIncome: 0 },
  { category: '新增', subcategory: '移动高清-大屏点播', name: '移动高清-优选电视剧包1元', commission: { T1: 0.6, T2: 0.3, T3: 0.3, T4: 0.3, T5: 0.3, total: 1.8 }, equivalentIncome: 0 }
]

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
  const categoryNormalized = normalizeName(product.category)
  const subcategoryNormalized = normalizeName(product.subcategory)

  if (!searchNormalized || !productNormalized) {
    return 0
  }

  if (productNormalized === searchNormalized) {
    return 1000
  }

  if (productNormalized.includes(searchNormalized)) {
    return 800 - productNormalized.length
  }

  if (searchNormalized.includes(productNormalized)) {
    return 700 - productNormalized.length
  }

  if (subcategoryNormalized === searchNormalized) {
    return 500
  }

  if (subcategoryNormalized.includes(searchNormalized)) {
    return 420 - subcategoryNormalized.length
  }

  if (categoryNormalized === searchNormalized) {
    return 300
  }

  return 0
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
