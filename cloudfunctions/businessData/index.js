// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event
  try {
    switch (action) {
      case 'create':
        return await createBusinessRecord(wxContext, data)
      case 'list':
        return await getBusinessRecords(wxContext, data)
      case 'update':
        return await updateBusinessRecord(wxContext, data)
      case 'delete':
        return await deleteBusinessRecord(wxContext, data)
      case 'getStats':
        return await getStatistics(wxContext, data)
      case 'export':
        return await exportData(wxContext, event)  // 直接传递整个 event 对象
      case 'test':
        return { success: true, message: 'businessData 云函数正常运行' }
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 创建业务记录
async function createBusinessRecord(wxContext, data) {
  const openid = wxContext.OPENID
  
  // 获取用户信息
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  
  // 创建业务记录
  const record = {
    ...data,
    submittedBy: {
      openid: openid,
      userId: user._id,
      name: user.nickName,
      role: user.role
    },
    status: 'pending',
    createTime: new Date(),
    updateTime: new Date()
  }
  
  const result = await db.collection('business_records').add({
    data: record
  })
  
  return {
    success: true,
    data: {
      recordId: result._id,
      record: record
    }
  }
}

// 获取业务记录列表
async function getBusinessRecords(wxContext, data) {
  const openid = wxContext.OPENID
  const { 
    page = 1, 
    pageSize = 10, 
    filters = {},
    sortBy = 'createTime',
    sortOrder = 'desc'
  } = data
  
  // 获取用户信息验证权限
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  let query = db.collection('business_records')
  
  // 根据用户角色过滤数据
  if (user.role === 'sales_person') {
    // 销售人员只能看到自己的记录
    query = query.where({
      'submittedBy.openid': openid
    })
  } else if (user.role === 'district_manager') {
    // 片区经理可以看到所有销售人员的记录
    // 这里可以根据实际需求添加更细粒度的权限控制
  }
  // sales_department 可以看到所有记录
  
  // 应用筛选条件
  if (filters.businessType) {
    query = query.where({
      businessType: filters.businessType
    })
  }
  
  if (filters.status) {
    query = query.where({
      status: filters.status
    })
  }
  
  if (filters.startDate && filters.endDate) {
    query = query.where({
      createTime: _.gte(new Date(filters.startDate)).and(_.lte(new Date(filters.endDate)))
    })
  }
  
  if (filters.submitterName) {
    query = query.where({
      'submittedBy.name': db.RegExp({
        regexp: filters.submitterName,
        options: 'i'
      })
    })
  }
  
  // 排序
  query = query.orderBy(sortBy, sortOrder)
  
  // 分页
  const skip = (page - 1) * pageSize
  query = query.skip(skip).limit(pageSize)
  
  const result = await query.get()
  
  // 获取总数
  const countQuery = db.collection('business_records')
  if (user.role === 'sales_person') {
    countQuery.where({
      'submittedBy.openid': openid
    })
  }
  
  const totalResult = await countQuery.count()
  
  return {
    success: true,
    data: {
      records: result.data,
      total: totalResult.total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalResult.total / pageSize)
    }
  }
}

// 更新业务记录
async function updateBusinessRecord(wxContext, data) {
  const openid = wxContext.OPENID
  const { recordId, updates } = data
  
  // 获取用户信息验证权限
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  
  // 获取记录验证权限
  const recordQuery = await db.collection('business_records').doc(recordId).get()
  
  if (!recordQuery.data) {
    return {
      success: false,
      error: '记录不存在'
    }
  }
  
  const record = recordQuery.data
  
  // 权限验证
  if (user.role === 'sales_person' && record.submittedBy.openid !== openid) {
    return {
      success: false,
      error: '权限不足'
    }
  }
  
  // 更新记录
  const updateData = {
    ...updates,
    updateTime: new Date()
  }
  
  if (user.role !== 'sales_person') {
    // 管理员可以更新状态
    updateData.reviewedBy = {
      openid: openid,
      userId: user._id,
      name: user.nickName,
      role: user.role
    }
    updateData.reviewTime = new Date()
  }
  
  const result = await db.collection('business_records').doc(recordId).update({
    data: updateData
  })
  
  return {
    success: true,
    data: result
  }
}

// 删除业务记录
async function deleteBusinessRecord(wxContext, data) {
  const openid = wxContext.OPENID
  const { recordId } = data
  
  // 获取用户信息验证权限
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  
  // 获取记录验证权限
  const recordQuery = await db.collection('business_records').doc(recordId).get()
  
  if (!recordQuery.data) {
    return {
      success: false,
      error: '记录不存在'
    }
  }
  
  const record = recordQuery.data
  
  // 权限验证
  if (user.role === 'sales_person' && record.submittedBy.openid !== openid) {
    return {
      success: false,
      error: '权限不足'
    }
  }
  
  // 删除记录
  const result = await db.collection('business_records').doc(recordId).remove()
  
  return {
    success: true,
    data: result
  }
}

// 获取统计数据
async function getStatistics(wxContext, data) {
  const openid = wxContext.OPENID
  const { timeRange = 'all' } = data
  
  // 获取用户信息
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  let query = db.collection('business_records')
  
  // 根据用户角色过滤数据
  if (user.role === 'sales_person') {
    query = query.where({
      'submittedBy.openid': openid
    })
  }
  
  // 时间范围过滤
  if (timeRange !== 'all') {
    const now = new Date()
    let startDate
    
    switch (timeRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
    }
    
    if (startDate) {
      query = query.where({
        createTime: _.gte(startDate)
      })
    }
  }
  
  const records = await query.get()
  
  // 计算统计数据
  const stats = {
    totalRecords: records.data.length,
    totalCommission: 0,
    statusCounts: {
      pending: 0,
      approved: 0,
      rejected: 0
    },
    businessTypeCounts: {}
  }
  
  records.data.forEach(record => {
    stats.totalCommission += record.commission || 0
    stats.statusCounts[record.status] = (stats.statusCounts[record.status] || 0) + 1
    stats.businessTypeCounts[record.businessType] = (stats.businessTypeCounts[record.businessType] || 0) + 1
  })
  
  // 今日数据
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  
  let todayQuery = db.collection('business_records').where({
    createTime: _.gte(todayStart)
  })
  
  if (user.role === 'sales_person') {
    todayQuery = todayQuery.where({
      'submittedBy.openid': openid
    })
  }
  
  const todayRecords = await todayQuery.get()
  
  stats.todayRecords = todayRecords.data.length
  stats.todayCommission = todayRecords.data.reduce((sum, record) => sum + (record.commission || 0), 0)
  
  return {
    success: true,
    data: stats
  }
}

// 导出数据
async function exportData(wxContext, event) {
  const openid = wxContext.OPENID
  const { filters = {}, format = 'xlsx' } = event
  
  console.log('导出数据云函数被调用:', { openid, filters, format })
  
  // 获取用户信息验证权限
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  const user = userQuery.data[0]
  
  // 权限验证 - 只有管理员可以导出数据
  if (!['district_manager', 'sales_department', 'sales_person'].includes(user.role)) {
    return {
      success: false,
      error: '权限不足'
    }
  }
  
  let query = db.collection('business_records')
  
  // 根据用户角色过滤数据
  if (user.role === 'sales_person') {
    query = query.where({
      userId: openid  // 修改为使用userId字段
    })
  } else if (user.role === 'district_manager') {
    query = query.where({
      district: user.district
    })
  }
  
  // 应用筛选条件
  if (filters.startDate && filters.endDate) {
    query = query.where({
      createTime: _.gte(new Date(filters.startDate)).and(_.lte(new Date(filters.endDate)))
    })
  }
  
  if (filters.status) {
    query = query.where({
      status: filters.status
    })
  }
  
  if (filters.businessType) {
    query = query.where({
      businessType: filters.businessType
    })
  }
  
  if (filters.district && user.role === 'sales_department') {
    query = query.where({
      district: filters.district
    })
  }
  
  if (filters.developer) {
    query = query.where({
      developer: filters.developer
    })
  }
  
  if (filters.commissionMin || filters.commissionMax) {
    const commissionCondition = {}
    if (filters.commissionMin && filters.commissionMax) {
      commissionCondition.commission = _.gte(filters.commissionMin).and(_.lte(filters.commissionMax))
    } else if (filters.commissionMin) {
      commissionCondition.commission = _.gte(filters.commissionMin)
    } else if (filters.commissionMax) {
      commissionCondition.commission = _.lte(filters.commissionMax)
    }
    query = query.where(commissionCondition)
  }
  
  const result = await query.orderBy('createTime', 'desc').get()
  
  if (format === 'xlsx') {
    // 生成Excel文件
    const XLSX = require('xlsx')
    
    // 获取所有提交人信息
    const userIds = [...new Set(result.data.map(record => record.userId).filter(Boolean))]
    let userMap = {}
    
    if (userIds.length > 0) {
      const usersQuery = await db.collection('users').where({
        openid: db.command.in(userIds)
      }).get()
      
      usersQuery.data.forEach(user => {
        userMap[user.openid] = user.nickName || user.name || '未知用户'
      })
    }
    
    // 准备Excel数据
    const excelData = result.data.map(record => {
      return {
        '业务日期': record.date ? new Date(record.date).toLocaleDateString('zh-CN') : '',
        '提交人': userMap[record.userId] || record.userId || '',
        '区县': record.district || '',
        '业务名称': record.businessName || '',
        '用户号码': record.userPhone || '',
        '发展人员': record.developer || '',
        '酬金金额': record.commission ? Number(record.commission).toFixed(2) : '0.00',
        '创建时间': record.createTime ? new Date(record.createTime).toLocaleString('zh-CN') : ''
      }
    })
    
    // 创建工作簿
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    
    // 设置列宽
    const colWidths = [
      { wch: 12 }, // 业务日期
      { wch: 10 }, // 提交人
      { wch: 8 },  // 区县
      { wch: 25 }, // 业务名称
      { wch: 15 }, // 用户号码
      { wch: 10 }, // 发展人员
      { wch: 10 }, // 酬金金额
      { wch: 20 }  // 创建时间
    ]
    ws['!cols'] = colWidths
    
    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, '业务数据')
    
    // 生成Excel文件的Buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    
    // 转换为base64
    const base64String = excelBuffer.toString('base64')
    
    return {
      success: true,
      data: {
        base64: base64String,
        filename: `业务数据_${new Date().toISOString().slice(0, 10)}.xlsx`,
        total: result.data.length,
        exportTime: new Date(),
        exportedBy: user.nickName
      }
    }
  } else {
    // 返回JSON数据
    return {
      success: true,
      data: {
        records: result.data,
        total: result.data.length,
        exportTime: new Date(),
        exportedBy: user.nickName
      }
    }
  }
}
