// utils/commission.js
// 佣金计算相关工具函数

/**
 * 计算统计数据
 * @param {Array} records 业务记录数组
 * @returns {Object} 统计数据对象
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
    
    const recordDate = parseRecordDate(record.createTime || record.timestamp || record.date)
    const commission = parseFloat(record.commission || record.amount || 0)
    if (!recordDate) return
    
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

function parseRecordDate(value) {
  if (!value) return null
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  
  if (typeof value === 'number') {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }
  
  if (typeof value === 'string') {
    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
    const date = new Date(normalized)
    return isNaN(date.getTime()) ? null : date
  }
  
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const date = value.toDate()
      return isNaN(date.getTime()) ? null : date
    }
    
    if (typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000)
      return isNaN(date.getTime()) ? null : date
    }
  }
  
  return null
}

/**
 * 计算单条记录的佣金
 * @param {Object} record 业务记录
 * @param {Object} config 佣金配置
 * @returns {Number} 佣金金额
 */
function calculateCommission(record, config = {}) {
  if (!record || !record.amount) {
    return 0
  }
  
  const amount = parseFloat(record.amount)
  const rate = parseFloat(config.rate || 0.1) // 默认10%佣金率
  
  return Math.round(amount * rate * 100) / 100
}

/**
 * 格式化金额显示
 * @param {Number} amount 金额
 * @returns {String} 格式化后的金额字符串
 */
function formatAmount(amount) {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount) || 0
  }
  
  return amount.toFixed(2)
}

/**
 * 获取佣金等级配置
 * @param {String} userRole 用户角色
 * @returns {Object} 佣金配置
 */
function getCommissionConfig(userRole) {
  const configs = {
    'sales_person': {
      rate: 0.05, // 5%
      name: '销售师傅'
    },
    'district_manager': {
      rate: 0.03, // 3%
      name: '区县主管'
    },
    'sales_department': {
      rate: 0.02, // 2%
      name: '销售业务部'
    }
  }
  
  return configs[userRole] || { rate: 0, name: '未知角色' }
}

module.exports = {
  calculateStats,
  calculateCommission,
  formatAmount,
  getCommissionConfig
}
