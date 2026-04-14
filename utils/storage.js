// utils/storage.js - 本地存储工具函数
// 用于保存和读取用户的历史填充数据

const STORAGE_KEYS = {
  LAST_FORM_DATA: 'lastFormData',
  USER_PREFERENCES: 'userPreferences',
  RECENT_SELECTIONS: 'recentSelections'
}

/**
 * 保存最后一次填充的表单数据
 * @param {Object} formData - 表单数据
 */
function saveLastFormData(formData) {
  try {
    // 只保存需要预填充的字段
    const dataToSave = {
      district: formData.district,
      gridAccount: formData.gridAccount || '',
      userPhone: formData.userPhone,
      category: formData.category,
      subcategory: formData.subcategory,
      item: formData.item,
      timestamp: Date.now()
    }
    
    wx.setStorageSync(STORAGE_KEYS.LAST_FORM_DATA, dataToSave)
    console.log('保存表单数据成功：', dataToSave)
  } catch (error) {
    console.error('保存表单数据失败：', error)
  }
}

/**
 * 获取最后一次填充的表单数据
 * @returns {Object|null} 表单数据或null
 */
function getLastFormData() {
  try {
    const data = wx.getStorageSync(STORAGE_KEYS.LAST_FORM_DATA)
    
    // 检查数据是否过期（30天）
    if (data && data.timestamp) {
      const daysDiff = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24)
      if (daysDiff > 30) {
        // 数据过期，清除
        wx.removeStorageSync(STORAGE_KEYS.LAST_FORM_DATA)
        return null
      }
    }
    
    return data || null
  } catch (error) {
    console.error('获取表单数据失败：', error)
    return null
  }
}

/**
 * 保存用户最近的选择记录
 * @param {string} type - 选择类型（district, developer等）
 * @param {string} value - 选择的值
 */
function saveRecentSelection(type, value) {
  try {
    if (!value || !type) return
    
    const recentSelections = wx.getStorageSync(STORAGE_KEYS.RECENT_SELECTIONS) || {}
    
    if (!recentSelections[type]) {
      recentSelections[type] = []
    }
    
    // 移除重复项
    recentSelections[type] = recentSelections[type].filter(item => item !== value)
    
    // 添加到开头
    recentSelections[type].unshift(value)
    
    // 只保留最近10个
    if (recentSelections[type].length > 10) {
      recentSelections[type] = recentSelections[type].slice(0, 10)
    }
    
    wx.setStorageSync(STORAGE_KEYS.RECENT_SELECTIONS, recentSelections)
  } catch (error) {
    console.error('保存最近选择失败：', error)
  }
}

/**
 * 获取用户最近的选择记录
 * @param {string} type - 选择类型
 * @returns {Array} 最近选择的列表
 */
function getRecentSelections(type) {
  try {
    const recentSelections = wx.getStorageSync(STORAGE_KEYS.RECENT_SELECTIONS) || {}
    return recentSelections[type] || []
  } catch (error) {
    console.error('获取最近选择失败：', error)
    return []
  }
}

/**
 * 清除所有存储数据
 */
function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      wx.removeStorageSync(key)
    })
    console.log('清除所有存储数据成功')
  } catch (error) {
    console.error('清除存储数据失败：', error)
  }
}

/**
 * 获取存储数据的统计信息
 * @returns {Object} 统计信息
 */
function getStorageStats() {
  try {
    const lastFormData = getLastFormData()
    const recentSelections = wx.getStorageSync(STORAGE_KEYS.RECENT_SELECTIONS) || {}
    
    return {
      hasLastFormData: !!lastFormData,
      lastFormTimestamp: lastFormData ? lastFormData.timestamp : undefined,
      recentSelectionsCount: Object.keys(recentSelections).length,
      totalRecentItems: Object.values(recentSelections).reduce((total, arr) => total + arr.length, 0)
    }
  } catch (error) {
    console.error('获取存储统计失败：', error)
    return {
      hasLastFormData: false,
      lastFormTimestamp: null,
      recentSelectionsCount: 0,
      totalRecentItems: 0
    }
  }
}

module.exports = {
  saveLastFormData,
  getLastFormData,
  saveRecentSelection,
  getRecentSelections,
  clearAllData,
  getStorageStats
}
