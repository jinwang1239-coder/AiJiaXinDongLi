// utils/export.js - 数据导出工具函数

/**
 * 将数据导出为CSV格式
 * @param {Array} data - 要导出的数据
 * @param {Array} columns - 列配置
 * @returns {string} CSV字符串
 */
function exportToCSV(data, columns) {
  if (!data || data.length === 0) {
    return ''
  }
  
  // 生成CSV标题行
  const headers = columns.map(col => col.title).join(',')
  
  // 生成数据行
  const rows = data.map(item => {
    return columns.map(col => {
      let value = item[col.field] || ''
      
      // 处理特殊字段
      if (col.field === 'date' && value) {
        value = new Date(value).toLocaleDateString()
      } else if (col.field === 'createTime' && value) {
        value = new Date(value).toLocaleString()
      } else if (col.field === 'commission' && typeof value === 'number') {
        value = value.toFixed(2)
      }
      
      // 处理包含逗号的值
      if (typeof value === 'string' && value.includes(',')) {
        value = `"${value}"`
      }
      
      return value
    }).join(',')
  })
  
  return [headers, ...rows].join('\n')
}

/**
 * 下载CSV文件
 * @param {string} csvContent - CSV内容
 * @param {string} filename - 文件名
 */
function downloadCSV(csvContent, filename) {
  // 在小程序中，我们不能直接下载文件
  // 这里我们可以将CSV内容复制到剪贴板
  wx.setClipboardData({
    data: csvContent,
    success: () => {
      wx.showToast({
        title: '数据已复制到剪贴板',
        icon: 'success'
      })
    },
    fail: () => {
      wx.showToast({
        title: '复制失败',
        icon: 'error'
      })
    }
  })
}

/**
 * 生成Excel格式的数据（通过云函数）
 * @param {Array} data - 要导出的数据
 * @param {Array} columns - 列配置
 * @param {string} filename - 文件名
 * @returns {Promise} 导出结果
 */
function exportToExcel(data, columns, filename) {
  return wx.cloud.callFunction({
    name: 'businessData',
    data: {
      action: 'export',
      data: {
        data: data,
        columns: columns,
        filename: filename,
        format: 'xlsx'
      }
    }
  })
}

/**
 * 将base64字符串转换为文件并保存
 * @param {string} base64String - base64编码的文件数据
 * @param {string} filename - 文件名
 * @returns {Promise} 保存结果
 */
function saveExcelFile(base64String, filename) {
  return new Promise((resolve, reject) => {
    try {
      // 将base64转换为ArrayBuffer
      const binaryString = wx.base64ToArrayBuffer(base64String)
      
      // 获取微信小程序的文件系统
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
      
      // 写入文件
      fs.writeFile({
        filePath: filePath,
        data: binaryString,
        success: (res) => {
          console.log('文件保存成功:', filePath)
          
          // 打开文件
          wx.openDocument({
            filePath: filePath,
            fileType: 'xlsx',
            showMenu: true, 
            success: () => {
              resolve({
                success: true,
                filePath: filePath,
                message: 'Excel文件已生成并打开'
              })
            },
            fail: (err) => {
              console.error('打开文件失败:', err)
              resolve({
                success: true,
                filePath: filePath,
                message: 'Excel文件已生成，请在文件管理器中查看'
              })
            }
          })
        },
        fail: (err) => {
          console.error('文件保存失败:', err)
          reject(new Error('文件保存失败: ' + (err.errMsg || '未知错误')))
        }
      })
    } catch (error) {
      console.error('base64转换失败:', error)
      reject(new Error('数据处理失败: ' + error.message))
    }
  })
}

/**
 * 获取导出列配置
 * @param {string} userRole - 用户角色
 * @returns {Array} 列配置
 */
function getExportColumns(userRole) {
  const baseColumns = [
    { field: 'date', title: '业务日期' },
    { field: 'district', title: '区县' },
    { field: 'businessName', title: '业务名称' },
    { field: 'userPhone', title: '用户号码' },
    { field: 'developer', title: '发展人员' },
    { field: 'commission', title: '酬金金额' },
    { field: 'createTime', title: '创建时间' }
  ]
  
  // 根据角色添加额外字段
  if (userRole === 'sales_department') {
    baseColumns.splice(1, 0, { field: 'submitterName', title: '提交人' })
  }
  
  return baseColumns
}

/**
 * 根据用户角色过滤数据
 * @param {Array} data - 原始数据
 * @param {string} userRole - 用户角色
 * @param {string} userId - 用户ID
 * @param {string} userDistrict - 用户区县
 * @returns {Array} 过滤后的数据
 */
function filterDataByRole(data, userRole, userId, userDistrict) {
  if (!data || data.length === 0) {
    return []
  }
  
  switch (userRole) {
    case 'sales_person':
      // 销售师傅只能看自己的数据
      return data.filter(item => item.userId === userId)
    
    case 'district_manager':
      // 区县主管可以看所属区县的数据
      return data.filter(item => item.district === userDistrict)
    
    case 'sales_department':
      // 销售业务部可以看全部数据
      return data
    
    default:
      return []
  }
}

/**
 * 生成导出文件名
 * @param {string} userRole - 用户角色
 * @param {string} userDistrict - 用户区县
 * @returns {string} 文件名
 */
function generateFilename(userRole, userDistrict = '') {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  
  let prefix = '业务数据'
  
  switch (userRole) {
    case 'sales_person':
      prefix = '个人业务数据'
      break
    case 'district_manager':
      prefix = `${userDistrict}区县业务数据`
      break
    case 'sales_department':
      prefix = '全部业务数据'
      break
  }
  
  return `${prefix}_${dateStr}.csv`
}

/**
 * 验证导出权限
 * @param {string} userRole - 用户角色
 * @returns {boolean} 是否有导出权限
 */
function checkExportPermission(userRole) {
  const allowedRoles = ['sales_person', 'district_manager', 'sales_department']
  return allowedRoles.includes(userRole)
}

/**
 * 完整的数据导出流程
 * @param {string} userRole - 用户角色
 * @param {string} userId - 用户ID
 * @param {string} userDistrict - 用户区县
 * @param {Object} filters - 筛选条件
 * @param {string} format - 导出格式 'csv' 或 'xlsx'
 * @returns {Promise} 导出结果
 */
function exportBusinessData(userRole, userId, userDistrict, filters = {}, format = 'xlsx') {
  return new Promise((resolve, reject) => {
    // 检查权限
    if (!checkExportPermission(userRole)) {
      reject('没有导出权限')
      return
    }
    
    wx.showLoading({
      title: '正在导出数据...'
    })
    
    if (format === 'xlsx') {
      // 使用云函数生成Excel文件
      wx.cloud.callFunction({
        name: 'businessData',
        data: {
          action: 'export',
          filters: filters,
          format: 'xlsx'
        }
      }).then(res => {
        wx.hideLoading()
        
        if (res.result.success) {
          const { base64, filename, total } = res.result.data
          
          // 保存Excel文件
          saveExcelFile(base64, filename).then(result => {
            wx.showToast({
              title: result.message || '导出成功',
              icon: 'success',
              duration: 2000
            })
            
            resolve({
              success: true,
              recordCount: total,
              filename: filename,
              format: 'xlsx'
            })
          }).catch(err => {
            console.error('保存文件失败:', err)
            wx.showToast({
              title: '文件保存失败',
              icon: 'error'
            })
            reject(err)
          })
        } else {
          wx.showToast({
            title: res.result.error || '导出失败',
            icon: 'error'
          })
          reject(res.result.error)
        }
      }).catch(err => {
        wx.hideLoading()
        console.error('云函数调用失败:', err)
        wx.showToast({
          title: '导出失败',
          icon: 'error'
        })
        reject(err)
      })
    } else {
      // CSV格式导出（保持原有逻辑）
      const db = wx.cloud.database()
      let query = db.collection('business_records')
      
      // 根据角色添加查询条件
      switch (userRole) {
        case 'sales_person':
          query = query.where({
            userId: userId,
            ...filters
          })
          break
        case 'district_manager':
          query = query.where({
            district: userDistrict,
            ...filters
          })
          break
        case 'sales_department':
          if (Object.keys(filters).length > 0) {
            query = query.where(filters)
          }
          break
      }
      
      query.orderBy('createTime', 'desc')
        .get()
        .then(res => {
          const data = res.data
          const columns = getExportColumns(userRole)
          const filename = generateFilename(userRole, userDistrict)
          
          // 导出为CSV
          const csvContent = exportToCSV(data, columns)
          downloadCSV(csvContent, filename)
          
          resolve({
            success: true,
            recordCount: data.length,
            filename: filename,
            format: 'csv'
          })
        })
        .catch(err => {
          console.error('导出失败：', err)
          reject(err)
        })
        .finally(() => {
          wx.hideLoading()
        })
    }
  })
}

module.exports = {
  exportToCSV,
  downloadCSV,
  exportToExcel,
  saveExcelFile,
  getExportColumns,
  filterDataByRole,
  generateFilename,
  checkExportPermission,
  exportBusinessData
}
