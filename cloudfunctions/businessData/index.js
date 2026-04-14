// 云函数入口文件
const cloud = require('wx-server-sdk')
const commissionRules = require('./commission-rules')

// 初始化 cloud
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const IMPORT_TEMPLATE_HEADERS = ['办理时间', '网格通账号', '发展人员网格通', '业务名称', '业务号码']
const MAX_QUERY_LIMIT = 100

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

function buildUserRecordCondition(user, openid) {
  const conditions = []

  if (user && user.gridAccount) {
    conditions.push({ gridAccount: user.gridAccount })
    conditions.push({ 'owner.gridAccount': user.gridAccount })
    conditions.push({ developerGridAccount: user.gridAccount })
    // 兼容旧数据：早期 developer 字段曾保存网格通账号。
    conditions.push({ developer: user.gridAccount })
  }

  if (openid) {
    conditions.push({ userId: openid })
    conditions.push({ 'owner.openid': openid })
  }

  if (conditions.length === 1) {
    return conditions[0]
  }

  return conditions.length > 0 ? _.or(conditions) : { _id: '__no_user_identity__' }
}

function getInputGridAccount(data = {}) {
  return String(data.gridAccount || data.developerGridAccount || data.developer || '').trim()
}

function getDeveloperDisplayName(input = {}, targetUser = {}) {
  const inputName = String(input.developerName || input.developerDisplayName || '').trim()
  if (inputName) {
    return inputName
  }

  const rawDeveloper = String(input.developer || '').trim()
  if (rawDeveloper && rawDeveloper !== targetUser.gridAccount) {
    return rawDeveloper
  }

  return String(targetUser.realName || targetUser.nickName || targetUser.gridAccount || '').trim()
}

function combineConditions(conditions) {
  const validConditions = conditions.filter(Boolean)
  if (validConditions.length === 0) {
    return null
  }
  if (validConditions.length === 1) {
    return validConditions[0]
  }
  return _.and(validConditions)
}

function buildRoleScopeCondition(user, openid) {
  if (!user) {
    return { _id: '__no_user_identity__' }
  }

  if (user.role === 'sales_person') {
    return buildUserRecordCondition(user, openid)
  }

  if (user.role === 'district_manager') {
    return user.district ? { district: user.district } : { _id: '__no_district_scope__' }
  }

  return null
}

function buildRecordFilterCondition(filters = {}) {
  const condition = {}
  const conditions = []

  if (filters.startDate && filters.endDate) {
    condition.date = _.gte(new Date(filters.startDate)).and(_.lte(new Date(filters.endDate)))
  } else if (filters.startDate) {
    condition.date = _.gte(new Date(filters.startDate))
  } else if (filters.endDate) {
    condition.date = _.lte(new Date(filters.endDate))
  }

  if (filters.createTimeStart && filters.createTimeEnd) {
    condition.createTime = _.gte(new Date(filters.createTimeStart)).and(_.lte(new Date(filters.createTimeEnd)))
  } else if (filters.createTimeStart) {
    condition.createTime = _.gte(new Date(filters.createTimeStart))
  } else if (filters.createTimeEnd) {
    condition.createTime = _.lte(new Date(filters.createTimeEnd))
  }

  if (filters.district) {
    condition.district = filters.district
  }

  if (filters.businessType) {
    condition.businessType = filters.businessType
  }

  if (filters.businessName) {
    condition.businessName = filters.businessName
  }

  if (filters.status) {
    condition.status = filters.status
  }

  const developer = String(filters.developer || '').trim()
  if (developer) {
    conditions.push(_.or([
      { developer },
      { developerGridAccount: developer },
      { gridAccount: developer },
      { 'owner.name': developer },
      { 'owner.gridAccount': developer }
    ]))
  }

  if (filters.submitterName) {
    condition['submittedBy.name'] = db.RegExp({
      regexp: filters.submitterName,
      options: 'i'
    })
  }

  const hasCommissionMin = filters.commissionMin !== undefined && filters.commissionMin !== ''
  const hasCommissionMax = filters.commissionMax !== undefined && filters.commissionMax !== ''
  if (hasCommissionMin || hasCommissionMax) {
    const min = hasCommissionMin ? Number(filters.commissionMin) : null
    const max = hasCommissionMax ? Number(filters.commissionMax) : null
    if (min !== null && max !== null) {
      condition.commission = _.gte(min).and(_.lte(max))
    } else if (min !== null) {
      condition.commission = _.gte(min)
    } else if (max !== null) {
      condition.commission = _.lte(max)
    }
  }

  if (Object.keys(condition).length > 0) {
    conditions.unshift(condition)
  }

  return combineConditions(conditions)
}

function buildScopedRecordQuery(user, openid, filters = {}) {
  let query = db.collection('business_records')
  const queryCondition = combineConditions([
    buildRoleScopeCondition(user, openid),
    buildRecordFilterCondition(filters)
  ])

  if (queryCondition) {
    query = query.where(queryCondition)
  }

  return query
}

async function fetchAllRecords(query) {
  const records = []
  let offset = 0

  while (true) {
    const result = await query.skip(offset).limit(MAX_QUERY_LIMIT).get()
    const data = result.data || []
    records.push(...data)

    if (data.length < MAX_QUERY_LIMIT) {
      break
    }

    offset += MAX_QUERY_LIMIT
  }

  return records
}

function getRecordStats(records = []) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const stats = {
    totalRecords: 0,
    totalCommission: 0,
    todayRecords: 0,
    todayCommission: 0,
    monthRecords: 0,
    monthCommission: 0,
    settledCommission: 0,
    unsettledCommission: 0,
    statusCounts: {
      pending: 0,
      approved: 0,
      rejected: 0
    },
    businessTypeCounts: {}
  }

  records.forEach(rawRecord => {
    const record = commissionRules.enrichRecordSettlement(rawRecord)
    const recordDate = new Date(record.date || record.businessDate || record.handleTime || record.createTime || record.timestamp)
    const commission = toNumber(record.commission)

    stats.totalRecords += 1
    stats.totalCommission += commission
    stats.settledCommission += toNumber(record.settledTotal)
    stats.unsettledCommission += toNumber(record.unsettledTotal)

    if (!Number.isNaN(recordDate.getTime())) {
      if (recordDate >= todayStart) {
        stats.todayRecords += 1
        stats.todayCommission += commission
      }
      if (recordDate >= monthStart) {
        stats.monthRecords += 1
        stats.monthCommission += commission
      }
    }

    stats.statusCounts[record.status] = (stats.statusCounts[record.status] || 0) + 1
    const businessKey = record.businessName || record.businessType || '未分类'
    stats.businessTypeCounts[businessKey] = (stats.businessTypeCounts[businessKey] || 0) + 1
  })

  stats.totalCommission = toNumber(stats.totalCommission)
  stats.todayCommission = toNumber(stats.todayCommission)
  stats.monthCommission = toNumber(stats.monthCommission)
  stats.settledCommission = toNumber(stats.settledCommission)
  stats.unsettledCommission = toNumber(stats.unsettledCommission)

  return stats
}

function buildFilterOptions(records = []) {
  return {
    districts: [...new Set(records.map(record => record.district))].filter(Boolean),
    developers: [...new Set(records.map(record => record.developer || record.developerGridAccount || record.gridAccount))].filter(Boolean)
  }
}

function isUserRecordOwner(record, user) {
  if (!record || !user) {
    return false
  }

  const gridAccount = user.gridAccount || ''
  if (gridAccount && (
    record.gridAccount === gridAccount ||
    record.developerGridAccount === gridAccount ||
    record.developer === gridAccount ||
    (record.owner && record.owner.gridAccount === gridAccount)
  )) {
    return true
  }

  if (user.openid && (
    record.userId === user.openid ||
    (record.owner && record.owner.openid === user.openid)
  )) {
    return true
  }

  const hasOwnerIdentity = record.userId || record.gridAccount || record.developerGridAccount || record.owner
  return !hasOwnerIdentity && record.submittedBy && record.submittedBy.openid === user.openid
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event
  try {
    switch (action) {
      case 'create':
        return await createBusinessRecord(wxContext, data)
      case 'batchImport':
        return await batchImportBusinessRecords(wxContext, data)
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
  const gridAccount = getInputGridAccount(data)

  if (!gridAccount) {
    return {
      success: false,
      error: '请输入发展人员网格通账号'
    }
  }

  const targetUserQuery = await db.collection('users').where({
    gridAccount
  }).limit(2).get()

  if (targetUserQuery.data.length === 0) {
    return {
      success: false,
      error: `未找到网格通账号“${gridAccount}”对应用户`
    }
  }

  if (targetUserQuery.data.length > 1) {
    return {
      success: false,
      error: `网格通账号“${gridAccount}”匹配到多个用户，请联系管理员处理`
    }
  }

  const targetUser = targetUserQuery.data[0]
  const recordInput = {
    ...(data || {}),
    gridAccount: targetUser.gridAccount,
    developerGridAccount: targetUser.gridAccount
  }

  const record = buildBusinessRecord(recordInput, targetUser, user, {
    source: data && data.source ? data.source : 'form'
  })

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

function buildUserSnapshot(user) {
  if (!user) {
    return {
      openid: '',
      userId: '',
      name: '',
      nickName: '',
      realName: '',
      role: '',
      district: '',
      gridName: '',
      gridAccount: ''
    }
  }

  return {
    openid: user.openid,
    userId: user._id,
    name: user.realName || user.nickName || '',
    nickName: user.nickName || '',
    realName: user.realName || '',
    role: user.role || '',
    district: user.district || '',
    gridName: user.gridName || '',
    gridAccount: user.gridAccount || ''
  }
}

function parseBusinessDate(dateInput) {
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput
  }

  if (typeof dateInput === 'number') {
    const XLSX = require('xlsx')
    const parsed = XLSX.SSF.parse_date_code(dateInput)
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d)
    }
  }

  if (typeof dateInput === 'string') {
    const normalized = dateInput
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
      .trim()
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
  }

  if (dateInput) {
    const date = new Date(dateInput)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  return null
}

function buildBusinessRecord(input = {}, targetUser, operatorUser, options = {}) {
  const now = new Date()
  const businessDate = parseBusinessDate(input.date || input.businessDate || input.handleTime) || now
  const rawBusinessName = String(input.businessName || '').trim()
  const productDetail = commissionRules.getCommissionDetail(rawBusinessName)
  const commissionDetails = productDetail
    ? productDetail.commission
    : commissionRules.normalizeCommissionDetails(input.commissionDetails || { total: input.commission || 0 })
  const settlementSchedule = commissionRules.buildSettlementSchedule(commissionDetails, businessDate, now)
  const settlementSummary = commissionRules.buildSettlementSummary(settlementSchedule)
  const businessNumber = String(input.businessNumber || input.userPhone || '').trim()
  const owner = buildUserSnapshot(targetUser)
  const submitter = buildUserSnapshot(operatorUser || targetUser)
  const record = {
    userId: targetUser.openid,
    date: businessDate,
    district: targetUser.district || input.district || '',
    gridName: targetUser.gridName || input.gridName || '',
    gridAccount: targetUser.gridAccount || input.gridAccount || '',
    businessName: productDetail ? productDetail.businessName : rawBusinessName,
    rawBusinessName,
    businessNumber,
    userPhone: businessNumber,
    developer: getDeveloperDisplayName(input, targetUser),
    developerGridAccount: targetUser.gridAccount || input.developerGridAccount || input.gridAccount || '',
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    commission: commissionDetails.total,
    commissionDetails,
    settlementSchedule,
    settlementSummary,
    settledTotal: settlementSummary.settledTotal,
    unsettledTotal: settlementSummary.unsettledTotal,
    category: productDetail ? productDetail.category : (input.category || ''),
    subcategory: productDetail ? productDetail.subcategory : (input.subcategory || ''),
    equivalentIncome: productDetail ? productDetail.equivalentIncome : (input.equivalentIncome || 0),
    source: options.source || input.source || 'form',
    status: input.status || 'approved',
    owner,
    submittedBy: submitter,
    createTime: now,
    updateTime: now
  }

  if (options.importId) {
    record.importId = options.importId
  }

  if (options.fileName) {
    record.importFileName = options.fileName
  }

  if (operatorUser && operatorUser.openid !== targetUser.openid) {
    record.importedBy = buildUserSnapshot(operatorUser)
  }

  return record
}

function normalizeImportRow(row, rowNumber) {
  const normalized = {}
  Object.keys(row || {}).forEach(key => {
    normalized[String(key).trim()] = row[key]
  })

  return {
    rowNumber,
    handleTime: normalized['办理时间'],
    gridAccount: String(normalized['网格通账号'] || '').trim(),
    developer: String(normalized['发展人员网格通'] || normalized['办理人员'] || '').trim(),
    businessName: String(normalized['业务名称'] || '').trim(),
    businessNumber: String(normalized['业务号码'] || '').trim()
  }
}

function getWorksheetHeaders(worksheet, XLSX) {
  if (!worksheet || !worksheet['!ref']) {
    return []
  }

  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const headers = []

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col })
    const cell = worksheet[cellAddress]
    if (cell && cell.v !== undefined) {
      headers.push(String(cell.v).trim())
    }
  }

  return headers
}

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function getUsersByGridAccounts(gridAccounts) {
  const uniqueAccounts = [...new Set(gridAccounts.filter(Boolean))]
  const userMap = {}

  for (const chunk of chunkArray(uniqueAccounts, 20)) {
    const result = await db.collection('users').where({
      gridAccount: _.in(chunk)
    }).get()

    result.data.forEach(user => {
      if (!userMap[user.gridAccount]) {
        userMap[user.gridAccount] = []
      }
      userMap[user.gridAccount].push(user)
    })
  }

  return userMap
}

async function batchImportBusinessRecords(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const { fileID, fileName = '' } = data

  if (!fileID) {
    return {
      success: false,
      error: '请先上传Excel文件'
    }
  }

  const userQuery = await db.collection('users').where({ openid }).get()
  if (userQuery.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }

  const importer = userQuery.data[0]
  if (!['district_manager', 'sales_department'].includes(importer.role)) {
    return {
      success: false,
      error: '仅区县主管或销售业务部可批量导入'
    }
  }

  if (importer.role === 'district_manager' && !importer.district) {
    return {
      success: false,
      error: '当前区县主管未配置区县，无法导入'
    }
  }

  const XLSX = require('xlsx')
  const downloadResult = await cloud.downloadFile({ fileID })
  const workbook = XLSX.read(downloadResult.fileContent, {
    type: 'buffer',
    cellDates: true
  })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    return {
      success: false,
      error: 'Excel文件中没有工作表'
    }
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const headers = getWorksheetHeaders(worksheet, XLSX)
  const missingHeaders = IMPORT_TEMPLATE_HEADERS.filter(header => {
    if (header === '发展人员网格通') {
      return !headers.includes('发展人员网格通') && !headers.includes('办理人员')
    }
    return !headers.includes(header)
  })

  if (missingHeaders.length) {
    return {
      success: false,
      error: `导入模板缺少字段：${missingHeaders.join('、')}`,
      data: {
        templateHeaders: IMPORT_TEMPLATE_HEADERS
      }
    }
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true
  })
  const rows = rawRows
    .map((row, index) => normalizeImportRow(row, index + 2))
    .filter(row => row.handleTime || row.gridAccount || row.developer || row.businessName || row.businessNumber)

  if (!rows.length) {
    return {
      success: false,
      error: 'Excel文件中没有可导入的数据'
    }
  }

  const userMap = await getUsersByGridAccounts(rows.map(row => row.gridAccount))
  const importId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const failedRows = []
  const createdRecordIds = []

  for (const row of rows) {
    const errors = []
    const businessDate = parseBusinessDate(row.handleTime)
    const matchedUsers = userMap[row.gridAccount] || []
    const productDetail = commissionRules.getCommissionDetail(row.businessName)

    if (!businessDate) errors.push('办理时间格式不正确')
    if (!row.gridAccount) errors.push('网格通账号不能为空')
    if (!row.developer) errors.push('发展人员网格通不能为空')
    if (!row.businessName) errors.push('业务名称不能为空')
    if (!row.businessNumber) errors.push('业务号码不能为空')
    if (!productDetail) errors.push(`未找到业务名称“${row.businessName}”对应的酬金配置`)
    if (matchedUsers.length === 0) errors.push(`未找到网格通账号“${row.gridAccount}”对应用户`)
    if (matchedUsers.length > 1) errors.push(`网格通账号“${row.gridAccount}”匹配到多个用户`)

    const targetUser = matchedUsers[0]
    if (targetUser && importer.role === 'district_manager' && targetUser.district !== importer.district) {
      errors.push(`账号所属区县“${targetUser.district || '未配置'}”不在当前主管区县“${importer.district}”内`)
    }

    if (errors.length) {
      failedRows.push({
        rowNumber: row.rowNumber,
        gridAccount: row.gridAccount,
        businessName: row.businessName,
        businessNumber: row.businessNumber,
        errors
      })
      continue
    }

    const record = buildBusinessRecord(
      {
        date: businessDate,
        gridAccount: row.gridAccount,
        developer: row.developer,
        businessName: row.businessName,
        businessNumber: row.businessNumber
      },
      targetUser,
      importer,
      {
        source: 'batch_import',
        importId,
        fileName
      }
    )

    const result = await db.collection('business_records').add({
      data: record
    })
    createdRecordIds.push(result._id)
  }

  return {
    success: true,
    data: {
      importId,
      total: rows.length,
      successCount: createdRecordIds.length,
      failCount: failedRows.length,
      failedRows,
      createdRecordIds
    }
  }
}

// 获取业务记录列表
async function getBusinessRecords(wxContext, data = {}) {
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
  const currentPage = Math.max(Number(page) || 1, 1)
  const currentPageSize = Math.min(Math.max(Number(pageSize) || 10, 1), MAX_QUERY_LIMIT)
  const totalResult = await buildScopedRecordQuery(user, openid, filters).count()
  const allRecords = await fetchAllRecords(buildScopedRecordQuery(user, openid, filters))
  const result = await buildScopedRecordQuery(user, openid, filters)
    .orderBy(sortBy, sortOrder)
    .skip((currentPage - 1) * currentPageSize)
    .limit(currentPageSize)
    .get()
  const records = (result.data || []).map(record => commissionRules.enrichRecordSettlement(record))
  
  return {
    success: true,
    data: {
      records,
      total: totalResult.total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(totalResult.total / currentPageSize),
      stats: getRecordStats(allRecords),
      filterOptions: buildFilterOptions(allRecords)
    }
  }
}

// 更新业务记录
async function updateBusinessRecord(wxContext, data = {}) {
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
  if (user.role === 'sales_person' && !isUserRecordOwner(record, user)) {
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
async function deleteBusinessRecord(wxContext, data = {}) {
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
  if (user.role === 'sales_person' && !isUserRecordOwner(record, user)) {
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
async function getStatistics(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const { timeRange = 'all', filters = {} } = data
  
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
  const queryFilters = { ...filters }

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
      queryFilters.startDate = startDate
    }
  }

  const records = await fetchAllRecords(buildScopedRecordQuery(user, openid, queryFilters))
  const stats = getRecordStats(records)
  
  return {
    success: true,
    data: stats
  }
}

function formatSettlementForExport(item) {
  if (!item) {
    return '0.00元，状态：未核算'
  }

  return `${Number(item.amount || 0).toFixed(2)}元，状态：${item.statusText || '未核算'}`
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
  
  const query = buildScopedRecordQuery(user, openid, filters).orderBy('createTime', 'desc')
  const records = await fetchAllRecords(query)
  const enrichedRecords = records.map(record => commissionRules.enrichRecordSettlement(record))
  
  if (format === 'xlsx') {
    // 生成Excel文件
    const XLSX = require('xlsx')
    
    // 获取业务归属人信息，兼容旧记录中没有 owner 快照的情况。
    const userIds = [...new Set(enrichedRecords.map(record => record.userId).filter(Boolean))]
    let userMap = {}
    
    if (userIds.length > 0) {
      const usersQuery = await db.collection('users').where({
        openid: db.command.in(userIds)
      }).get()
      
      usersQuery.data.forEach(user => {
        userMap[user.openid] = user.realName || user.nickName || user.name || '未知用户'
      })
    }
    
    // 准备Excel数据
    const excelData = enrichedRecords.map(record => {
      const schedule = record.settlementSchedule || []
      const summary = record.settlementSummary || {}
      const owner = record.owner || {}
      const submitter = record.submittedBy || {}
      return {
        '业务日期': record.date ? new Date(record.date).toLocaleDateString('zh-CN') : '',
        '提交人': submitter.name || submitter.realName || submitter.nickName || '',
        '区县': record.district || '',
        '网格通账号': record.gridAccount || '',
        '业务归属人': owner.name || owner.realName || owner.nickName || userMap[record.userId] || '',
        '业务名称': record.businessName || '',
        '业务号码': record.businessNumber || record.userPhone || '',
        '发展人员': record.developer || '',
        '酬金金额': record.commission ? Number(record.commission).toFixed(2) : '0.00',
        'T+1月核算': formatSettlementForExport(schedule[0]),
        'T+2月核算': formatSettlementForExport(schedule[1]),
        'T+3月核算': formatSettlementForExport(schedule[2]),
        'T+4月核算': formatSettlementForExport(schedule[3]),
        'T+5月核算': formatSettlementForExport(schedule[4]),
        '目前已核算总金额': `${summary.settledRangeText || '暂无已核算'} ${summary.settledTotalText || '0.00'}元`,
        '目前未核算总金额': `${summary.unsettledPeriodsText || '暂无未核算'} ${summary.unsettledTotalText || '0.00'}元`,
        '录入来源': record.source || '',
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
      { wch: 16 }, // 网格通账号
      { wch: 10 }, // 业务归属人
      { wch: 25 }, // 业务名称
      { wch: 15 }, // 用户号码
      { wch: 10 }, // 发展人员
      { wch: 10 }, // 酬金金额
      { wch: 24 }, // T+1
      { wch: 24 }, // T+2
      { wch: 24 }, // T+3
      { wch: 24 }, // T+4
      { wch: 24 }, // T+5
      { wch: 28 }, // 已核算
      { wch: 36 }, // 未核算
      { wch: 12 }, // 录入来源
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
        total: enrichedRecords.length,
        exportTime: new Date(),
        exportedBy: user.nickName
      }
    }
  } else {
    // 返回JSON数据
    return {
      success: true,
      data: {
        records: enrichedRecords,
        total: enrichedRecords.length,
        exportTime: new Date(),
        exportedBy: user.nickName
      }
    }
  }
}
