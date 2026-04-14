// utils/commission-fixed.js
// 根据业务名称计算佣金和分月核算进度的工具函数

const productConfig = require('./product-config')

const SETTLEMENT_MONTHS = [1, 2, 3, 4, 5]

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

function getAllProductEntries() {
  const config = productConfig.PRODUCT_CONFIG || {}
  const entries = []

  Object.keys(config).forEach(category => {
    Object.keys(config[category]).forEach(subcategory => {
      Object.keys(config[category][subcategory]).forEach(productName => {
        const product = config[category][subcategory][productName]
        entries.push({
          category,
          subcategory,
          productName,
          product
        })
      })
    })
  })

  return entries
}

function getMatchScore(searchName, entry) {
  const searchNormalized = normalizeName(searchName)
  const productNormalized = normalizeName(entry.productName)
  const categoryNormalized = normalizeName(entry.category)
  const subcategoryNormalized = normalizeName(entry.subcategory)

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
  if (!businessName) {
    return null
  }

  const entries = getAllProductEntries()
  let bestMatch = null
  let bestScore = 0

  entries.forEach(entry => {
    const score = getMatchScore(businessName, entry)
    if (score > bestScore) {
      bestScore = score
      bestMatch = entry
    }
  })

  if (!bestMatch) {
    return null
  }

  return {
    businessName: bestMatch.productName,
    category: bestMatch.category,
    subcategory: bestMatch.subcategory,
    commission: normalizeCommissionDetails(bestMatch.product.commission || {}),
    equivalentIncome: bestMatch.product.equivalentIncome || 0,
    matchScore: bestScore
  }
}

/**
 * 根据业务名称计算佣金
 * @param {String} businessName 业务名称
 * @returns {Number} 计算得出的佣金金额
 */
function calculateCommission(businessName) {
  if (!businessName) {
    return 0
  }

  const match = findProductMatch(businessName)
  if (match) {
    return match.commission.total || 0
  }

  console.warn(`未找到业务名称 "${businessName}" 对应的佣金配置`)
  return 0
}

/**
 * 获取产品的详细佣金信息
 * @param {String} businessName 业务名称
 * @returns {Object} 佣金详细信息
 */
function getCommissionDetail(businessName) {
  if (!businessName) {
    return null
  }

  return findProductMatch(businessName)
}

/**
 * 获取所有可用的业务名称列表
 * @returns {Array} 业务名称数组
 */
function getAllBusinessNames() {
  return getAllProductEntries().map(entry => ({
    name: entry.productName,
    category: entry.category,
    subcategory: entry.subcategory,
    commission: normalizeCommissionDetails(entry.product.commission || {}).total
  }))
}

function getBusinessTypes() {
  return getAllBusinessNames().map(item => item.name)
}

/**
 * 根据分类获取业务列表
 * @param {String} category 产品大类
 * @param {String} subcategory 产品小类（可选）
 * @returns {Array} 业务列表
 */
function getBusinessByCategory(category, subcategory = null) {
  const config = productConfig.PRODUCT_CONFIG || {}
  const businessList = []
  
  if (config[category]) {
    if (subcategory && config[category][subcategory]) {
      // 指定了子分类
      for (const productName in config[category][subcategory]) {
        businessList.push({
          name: productName,
          commission: (config[category][subcategory][productName].commission && config[category][subcategory][productName].commission.total) ? config[category][subcategory][productName].commission.total : 0,
          equivalentIncome: config[category][subcategory][productName].equivalentIncome || 0
        })
      }
    } else {
      // 只指定了大分类
      for (const subcat in config[category]) {
        for (const productName in config[category][subcat]) {
          businessList.push({
            name: productName,
            subcategory: subcat,
            commission: (config[category][subcat][productName].commission && config[category][subcat][productName].commission.total) ? config[category][subcat][productName].commission.total : 0,
            equivalentIncome: config[category][subcat][productName].equivalentIncome || 0
          })
        }
      }
    }
  }
  
  return businessList
}

/**
 * 计算多条记录的统计数据
 * @param {Array} records 记录数组
 * @returns {Object} 统计数据
 */
function calculateStats(records) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  
  const stats = {
    totalRecords: 0,
    totalCommission: 0,
    todayRecords: 0,
    todayCommission: 0,
    monthRecords: 0,
    monthCommission: 0
  }
  
  if (!Array.isArray(records)) {
    return stats
  }
  
  records.forEach(record => {
    if (!record) return
    
    const recordDate = new Date(record.date || record.businessDate || record.handleTime || record.createTime || record.timestamp)
    const commission = parseFloat(record.commission || 0)
    
    // 总计
    stats.totalRecords++
    stats.totalCommission += commission
    
    // 今日统计
    if (recordDate >= today) {
      stats.todayRecords++
      stats.todayCommission += commission
    }
    
    // 本月统计
    if (recordDate >= monthStart) {
      stats.monthRecords++
      stats.monthCommission += commission
    }
  })
  
  // 保留两位小数
  stats.totalCommission = Math.round(stats.totalCommission * 100) / 100
  stats.todayCommission = Math.round(stats.todayCommission * 100) / 100
  stats.monthCommission = Math.round(stats.monthCommission * 100) / 100
  
  return stats
}

function parseDate(dateInput) {
  if (!dateInput) {
    return new Date()
  }

  if (dateInput instanceof Date) {
    return dateInput
  }

  if (typeof dateInput === 'object' && dateInput.$date) {
    return new Date(dateInput.$date)
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

function getCommissionDetailsFromRecord(record) {
  if (!record) {
    return normalizeCommissionDetails()
  }

  if (record.commissionDetails) {
    return normalizeCommissionDetails(record.commissionDetails)
  }

  const detail = getCommissionDetail(record.businessName)
  if (detail && detail.commission) {
    return normalizeCommissionDetails(detail.commission)
  }

  return normalizeCommissionDetails({
    total: record.commission || record.amount || 0
  })
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
  const commissionDetails = getCommissionDetailsFromRecord(record)
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

module.exports = {
  calculateCommission,
  getCommissionDetail,
  getAllBusinessNames,
  getBusinessTypes,
  getBusinessByCategory,
  calculateStats,
  normalizeCommissionDetails,
  findProductMatch,
  buildSettlementSchedule,
  buildSettlementSummary,
  enrichRecordSettlement
}
