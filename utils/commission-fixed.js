// utils/commission-fixed.js
// 根据业务名称计算佣金的工具函数

const productConfig = require('./product-config')

/**
 * 根据业务名称计算佣金
 * @param {String} businessName 业务名称
 * @returns {Number} 计算得出的佣金金额
 */
function calculateCommission(businessName) {
  if (!businessName) {
    return 0
  }
  
  // 获取产品配置
  const config = productConfig.PRODUCT_CONFIG || {}
  
  // 遍历所有产品配置，寻找匹配的业务名称
  for (const category in config) {
    for (const subcategory in config[category]) {
      for (const productName in config[category][subcategory]) {
        if (productName === businessName || businessName.includes(productName) || productName.includes(businessName)) {
          const product = config[category][subcategory][productName]
          return product.commission ? product.commission.total || 0 : 0
        }
      }
    }
  }
  
  // 如果没有找到匹配的产品，返回默认值
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
  
  const config = productConfig.PRODUCT_CONFIG || {}
  
  for (const category in config) {
    for (const subcategory in config[category]) {
      for (const productName in config[category][subcategory]) {
        if (productName === businessName || businessName.includes(productName) || productName.includes(businessName)) {
          const product = config[category][subcategory][productName]
          return {
            businessName: productName,
            category: category,
            subcategory: subcategory,
            commission: product.commission || {},
            equivalentIncome: product.equivalentIncome || 0
          }
        }
      }
    }
  }
  
  return null
}

/**
 * 获取所有可用的业务名称列表
 * @returns {Array} 业务名称数组
 */
function getAllBusinessNames() {
  const config = productConfig.PRODUCT_CONFIG || {}
  const businessNames = []
  
  for (const category in config) {
    for (const subcategory in config[category]) {
      for (const productName in config[category][subcategory]) {
        businessNames.push({
          name: productName,
          category: category,
          subcategory: subcategory,
          commission: (config[category][subcategory][productName].commission && config[category][subcategory][productName].commission.total) ? config[category][subcategory][productName].commission.total : 0
        })
      }
    }
  }
  
  return businessNames
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
    
    const recordDate = new Date(record.createTime || record.timestamp || record.date)
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

module.exports = {
  calculateCommission,
  getCommissionDetail,
  getAllBusinessNames,
  getBusinessByCategory,
  calculateStats
}
