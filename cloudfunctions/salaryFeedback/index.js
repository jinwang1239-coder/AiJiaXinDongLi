const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const MAX_QUERY_LIMIT = 100
const ADMIN_ROLES = ['sales_department', 'system_admin']
const salesContext = require('./sales-context')(db, fetchAll)

const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}

const FEEDBACK_SCENES = {
  SALES_SALARY: 'sales_salary',
  LINE_PROJECT_WORKORDERS: 'line_project_workorders'
}

const FEEDBACK_STATUS = {
  PENDING: 'pending',
  AWAITING_SUBMITTER: 'awaiting_submitter',
  CLOSED: 'closed'
}

const FEEDBACK_WORKFLOW_VERSION = 2

const COLLECTIONS = {
  USERS: 'users',
  FEEDBACKS: 'salary_feedbacks',
  ROUTES: 'feedback_routes',
  LINE_PROJECT_CONFIRMS: 'line_project_month_confirms',
  LINE_PROJECT_RECORDS: 'line_project_records',
  LINE_PROJECT_ACTIVE_VERSIONS: 'line_project_active_versions'
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event || {}

  try {
    switch (action) {
      case 'create':
        return await createFeedback(wxContext, data)
      case 'getSalesContext':
        return { success: true, data: await salesContext(await getCurrentUser(wxContext.OPENID, 'sales'), data && data.salaryMonth) }
      case 'listMine':
        return await listMyFeedbacks(wxContext, data)
      case 'listPending':
        return await listPendingFeedbacks(wxContext, data)
      case 'listAdmin':
      case 'listManaged':
        return await listManagedFeedbacks(wxContext, data)
      case 'getSceneSummary':
        return await getSceneSummary(wxContext, data)
      case 'resolve':
        return await resolveFeedback(wxContext, data)
      case 'continueFeedback':
        return await continueFeedback(wxContext, data)
      case 'confirmResolved':
        return await confirmFeedbackResolved(wxContext, data)
      case 'test':
        return { success: true, message: 'salaryFeedback 云函数运行正常' }
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (error) {
    console.error('salaryFeedback 执行失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

function getCurrentMonthLabel() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7)
}

function isMonthlyFeedbackLimitEnabled(context = {}) {
  return context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT &&
    String(process.env.LINE_PROJECT_MONTHLY_FEEDBACK_LIMIT_ENABLED || 'false').trim().toLowerCase() === 'true'
}

function normalizeMoney(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

function getDisplayName(user) {
  return String(user.realName || user.name || user.nickName || user.gridAccount || '').trim()
}

function getGridAccount(user) { return String(user.gridAccount || '').trim() }
function normalizeDistrict(district) {
  const value = String(district || '').trim()
  return value === '公安县' ? '公安' : value
}
function isSalesHandler(user) {
  return ['district_manager', ...ADMIN_ROLES].includes(user.role) ||
    user.accountWorkspaceType === WORKSPACE_TYPES.LINE_PROJECT &&
    (user.lineProjectRoles || []).some(role => ['district_manager', 'district_supervisor'].includes(role))
}
function canHandleSalesDistrict(user, district) {
  if (!isSalesHandler(user)) return false
  if (ADMIN_ROLES.includes(user.role)) return true
  const districts = user.accountWorkspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? (user.managedDistricts || []).concat(user.district || [])
    : [user.salesManagedDistrict]
  return districts.some(item => normalizeDistrict(item) === normalizeDistrict(district))
}
function feedbackUser(rawUser, requestedWorkspace) {
  const user = normalizeUser(rawUser)
  user.accountWorkspaceType = normalizeWorkspaceType(user.workspaceType)
  const requested = normalizeWorkspaceType(requestedWorkspace || user.workspaceType)
  if (requested !== user.accountWorkspaceType && user.role !== 'system_admin' &&
    !(requested === WORKSPACE_TYPES.SALES && isSalesHandler(user))) {
    throw new Error('当前账号不可访问该工作台反馈')
  }
  if (user.status === 'inactive') throw new Error('当前账号已停用')
  return { ...user, workspaceType: requested }
}
function isProfileCompleted(user) {
  if (user && user.workspaceType === WORKSPACE_TYPES.SALES) return !!(user.employeeId && user.salesClaimed)
  return !!user && !!(
    String(user.realName || '').trim() &&
    String(user.gridAccount || '').trim() &&
    String(user.district || '').trim() &&
    String(user.gridName || '').trim()
  )
}

function normalizeUser(user = {}) {
  return {
    ...user,
    openid: user.openid || '',
    nickName: user.nickName || '',
    realName: user.realName || '',
    gridAccount: user.gridAccount || '',
    employeeId: user.employeeId || '',
    district: user.district || '',
    gridName: user.gridName || '',
    role: user.role || ''
  }
}

function buildUserSnapshot(user) {
  return {
    openid: user.openid || '',
    name: getDisplayName(user),
    nickName: user.nickName || '',
    realName: user.realName || '',
    gridAccount: user.gridAccount || '',
    employeeId: user.employeeId || '',
    district: user.district || '',
    gridName: user.gridName || '',
    role: user.role || ''
  }
}

function buildReviewSnapshot(user, district, gridAccount, roleText) {
  if (!user) {
    return {
      name: '',
      gridAccount: gridAccount || '',
      district: district || '',
      status: 'not_required',
      reviewTime: null,
      reviewNote: `${roleText}账号暂未绑定有效系统用户`
    }
  }

  return {
    name: getDisplayName(user),
    gridAccount: user.gridAccount || '',
    employeeId: user.employeeId || '',
    district: district || user.district || '',
    status: 'pending',
    reviewTime: null
  }
}

function buildProcessLog(action, user, note = '') {
  return {
    action,
    note,
    operator: buildUserSnapshot(user),
    createTime: new Date()
  }
}

function getRouteAccount(config) {
  if (!config) {
    return ''
  }

  if (typeof config === 'string') {
    return config.trim()
  }

  return String(config.gridAccount || '').trim()
}

function getEffectiveFeedbackStatus(record = {}) {
  const status = String(record.status || '').trim()
  if (record.employeeConfirmed || status === 'closed') return 'closed'
  if (status === 'awaiting_submitter') return 'awaiting_submitter'
  if (Number(record.workflowVersion || 0) >= FEEDBACK_WORKFLOW_VERSION) return 'pending'
  if (record.resolution || ['resolved', 'approved', 'rejected'].includes(status) ||
    ['resolved', 'approved', 'rejected'].includes(record.managerReview && record.managerReview.status) ||
    ['resolved', 'approved', 'rejected'].includes(record.supervisorReview && record.supervisorReview.status)) {
    return 'awaiting_submitter'
  }
  return 'pending'
}

function normalizeFeedbackStatus(record = {}, options = {}) {
  let status = getEffectiveFeedbackStatus(record)
  if (
    options.hasConfirmedMonth &&
    normalizeRecordContext(record).workspaceType === WORKSPACE_TYPES.LINE_PROJECT &&
    status === FEEDBACK_STATUS.AWAITING_SUBMITTER
  ) {
    status = FEEDBACK_STATUS.CLOSED
  }
  return {
    ...record,
    status,
    resolution: record.resolution || buildLegacyResolution(record),
    messages: buildFeedbackMessages(record)
  }
}

function buildLegacyResolution(record = {}) {
  const reviews = [
    { type: 'manager', roleText: '区县经理', value: record.managerReview || {} },
    { type: 'supervisor', roleText: '基层监督员', value: record.supervisorReview || {} }
  ]
  const resolved = reviews.find(item => ['approved', 'rejected', 'resolved'].includes(item.value.status))
  if (!resolved) return null
  return {
    handlerType: resolved.type,
    handlerRoleText: resolved.roleText,
    handler: {
      openid: resolved.value.openid || '',
      name: resolved.value.name || resolved.value.gridAccount || '',
      gridAccount: resolved.value.gridAccount || '',
      district: resolved.value.district || record.district || ''
    },
    content: resolved.value.reviewNote || '',
    attachments: [],
    resolveTime: resolved.value.reviewTime || record.updateTime || null
  }
}

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map(item => typeof item === 'string' ? { fileID: item } : item)
    .filter(item => item && item.fileID)
}

function buildFeedbackMessage(type, user, content, attachments, roundNo, createTime, roleText = '') {
  return {
    type,
    sender: buildUserSnapshot(user || {}),
    senderRoleText: roleText,
    content: String(content || '').trim(),
    attachments: normalizeAttachments(attachments),
    roundNo: Math.max(1, Number(roundNo || 1)),
    createTime: createTime || new Date()
  }
}

function buildFeedbackMessages(record = {}) {
  if (Array.isArray(record.messages) && record.messages.length) {
    return record.messages.map(message => ({
      ...message,
      attachments: normalizeAttachments(message.attachments)
    }))
  }

  const messages = []
  if (record.content) {
    messages.push(buildFeedbackMessage(
      'submitter_question',
      record.submitter || {},
      record.content,
      [],
      1,
      record.createTime,
      '一线员工'
    ))
  }

  const resolution = record.resolution || buildLegacyResolution(record)
  if (resolution) {
    messages.push(buildFeedbackMessage(
      'handler_reply',
      resolution.handler || {},
      resolution.content,
      resolution.attachments,
      1,
      resolution.resolveTime || record.updateTime,
      resolution.handlerRoleText || '问题处理人'
    ))
  }
  return messages
}

function getRouteHandlerType(route, user) {
  if (!route || route.status === 'inactive' || !getGridAccount(user)) return ''
  if (user.workspaceType === WORKSPACE_TYPES.SALES) {
    if (!canHandleSalesDistrict(user, route.district)) return ''
  } else if (normalizeDistrict(user.district) !== normalizeDistrict(route.district)) return ''
  const types = [['districtManager', 'manager'], ['supervisor', 'supervisor']].filter(([key]) => {
    const member = route[key]
    return getRouteAccount(member) === getGridAccount(user) &&
      (!member.name || String(member.name).trim() === getDisplayName(user))
  })
  return types.length === 1 ? types[0][1] : ''
}

function getPendingReviewType(record, user, route) {
  if (getEffectiveFeedbackStatus(record) !== 'pending' ||
    !route || normalizeDistrict(record.district) !== normalizeDistrict(route.district) ||
    record.submitter && record.submitter.openid === user.openid) return ''
  return getRouteHandlerType(route, user)
}

async function hasUniqueHandlerAccount(user) {
  if (!getGridAccount(user)) return false
  const result = await db.collection(COLLECTIONS.USERS).where({ gridAccount: getGridAccount(user) }).limit(2).get()
  return result.data.length === 1 && result.data[0]._id === user._id
}

async function fetchAll(query) {
  const records = []
  let offset = 0

  while (true) {
    const result = await query.skip(offset).limit(MAX_QUERY_LIMIT).get()
    const batch = result.data || []
    records.push(...batch)

    if (batch.length < MAX_QUERY_LIMIT) {
      break
    }

    offset += MAX_QUERY_LIMIT
  }

  return records
}

function isCollectionNotFoundError(error) {
  const message = String((error && error.message) || error || '')
  return (
    message.includes('database collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('ResourceNotFound')
  )
}

function sortByCreateTimeDesc(records = []) {
  return records.slice().sort((left, right) => {
    const leftTime = new Date(left.createTime || 0).getTime()
    const rightTime = new Date(right.createTime || 0).getTime()
    return rightTime - leftTime
  })
}

function normalizeWorkspaceType(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? WORKSPACE_TYPES.LINE_PROJECT
    : WORKSPACE_TYPES.SALES
}

function getDefaultScene(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? FEEDBACK_SCENES.LINE_PROJECT_WORKORDERS
    : FEEDBACK_SCENES.SALES_SALARY
}

function resolveContext(data = {}, currentUser = {}) {
  const workspaceType = normalizeWorkspaceType(currentUser.role === 'system_admin' && data.workspaceType || currentUser.workspaceType)
  return { workspaceType, scene: getDefaultScene(workspaceType) }
}

function normalizeRecordContext(record = {}) {
  const workspaceType = normalizeWorkspaceType(record.workspaceType)
  const scene = String(record.scene || getDefaultScene(workspaceType)).trim() || getDefaultScene(workspaceType)

  return {
    workspaceType,
    scene
  }
}

function matchContext(record, context) {
  // 旧销售反馈随逐笔数据退役保留为历史档案，不混入员工编号的新业务流程。
  if (context.workspaceType === WORKSPACE_TYPES.SALES && !record.employeeId) return false
  const recordContext = normalizeRecordContext(record)
  return (
    recordContext.workspaceType === context.workspaceType &&
    recordContext.scene === context.scene
  )
}

function getContextTitle(context) {
  return context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? '集客线路工费反馈'
    : '酬金反馈'
}

function formatDateTime(dateInput) {
  if (!dateInput) {
    return ''
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function buildFeedbackSummaryRecord(record, options = {}) {
  if (!record) {
    return null
  }

  const normalizedRecord = normalizeFeedbackStatus(record, options)
  const context = normalizeRecordContext(record)
  return {
    ...normalizedRecord,
    workspaceType: context.workspaceType,
    scene: context.scene,
    createTimeText: formatDateTime(normalizedRecord.createTime),
    updateTimeText: formatDateTime(normalizedRecord.updateTime)
  }
}

async function getCurrentUser(openid, requestedWorkspace) {
  const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(2).get()
  if (!result.data || !result.data.length) throw new Error('用户不存在')
  if (result.data.length !== 1) throw new Error('账号记录重复，请联系管理员')
  return feedbackUser(result.data[0], requestedWorkspace)
}

async function getDistrictRoute(district, transaction) {
  let result
  try {
    result = await db.collection(COLLECTIONS.ROUTES).where({ district: _.in(normalizeDistrict(district) === '公安' ? ['公安', '公安县'] : [district]) }).get()
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      throw new Error('请先在云数据库创建 feedback_routes 集合并配置区县反馈处理路由')
    }
    throw error
  }

  const routes = (result.data || []).filter(item => item.status !== 'inactive')

  if (routes.length === 0) {
    throw new Error('当前区县未配置反馈处理人')
  }

  if (routes.length > 1) {
    throw new Error('当前区县存在多条有效反馈处理路由')
  }

  if (!transaction) return routes[0]
  const route = (await transaction.collection(COLLECTIONS.ROUTES).doc(routes[0]._id).get()).data
  if (!route || route.status === 'inactive' || normalizeDistrict(route.district) !== normalizeDistrict(district)) {
    throw new Error('区县处理人名单已变更，请刷新重试')
  }
  return route
}

async function findApproverByAccount(config, district, submitter) {
  const gridAccount = getRouteAccount(config)
  if (!gridAccount) return null
  const sales = submitter.workspaceType === WORKSPACE_TYPES.SALES
  const result = await db.collection(COLLECTIONS.USERS).where(sales ? { gridAccount } :
    { gridAccount, workspaceType: submitter.workspaceType }).limit(2).get()
  if (!result.data || result.data.length !== 1) return null
  const raw = result.data[0]
  if (raw.status === 'inactive' || config.name && String(config.name).trim() !== getDisplayName(raw)) return null
  const user = feedbackUser(raw)
  if (sales) {
    if (!canHandleSalesDistrict(user, district)) return null
    return { ...user, workspaceType: WORKSPACE_TYPES.SALES }
  }
  if (district && user.district && normalizeDistrict(user.district) !== normalizeDistrict(district)) return null
  return user
}

async function buildHandlerReviews(submitter, district) {
  const route = await getDistrictRoute(district)
  const managerConfig = route['districtManager']
  const supervisorConfig = route['supervisor']
  const managerGridAccount = getRouteAccount(managerConfig)
  const supervisorGridAccount = getRouteAccount(supervisorConfig)
  let [districtManager, supervisor] = await Promise.all([
    findApproverByAccount(managerConfig, district, submitter),
    findApproverByAccount(supervisorConfig, district, submitter)
  ])

  if (districtManager && supervisor && getGridAccount(districtManager) === getGridAccount(supervisor)) {
    throw new Error('区县经理和基层监督员不能配置为同一人')
  }
  if (districtManager && getGridAccount(submitter) === getGridAccount(districtManager)) districtManager = null
  if (supervisor && getGridAccount(submitter) === getGridAccount(supervisor)) supervisor = null
  if (!districtManager && !supervisor) {
    throw new Error('当前区县没有可用问题处理人，请核对经理或监督员名单、网格通账号及管理权限')
  }

  return {
    managerReview: buildReviewSnapshot(districtManager, district, managerGridAccount, '区县经理'),
    supervisorReview: buildReviewSnapshot(supervisor, district, supervisorGridAccount, '基层监督员')
  }
}

async function getConfirmedMonthsBySubmitter(openid) {
  let records = []
  try {
    records = await fetchAll(db.collection(COLLECTIONS.LINE_PROJECT_CONFIRMS).where({
      'submitter.openid': openid
    }))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  return new Set(records
    .filter(record => record.status === 'confirmed')
    .map(record => String(record.settlementMonth || '').trim())
    .filter(Boolean))
}

async function getFeedbacksBySubmitter(openid, context, salaryMonth = '') {
  let records = []
  try {
    records = await fetchAll(
      db.collection(COLLECTIONS.FEEDBACKS).where({ 'submitter.openid': openid })
    )
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return []
    }
    throw error
  }

  return sortByCreateTimeDesc(records.filter(record => {
    if (!matchContext(record, context)) {
      return false
    }

    if (salaryMonth && String(record.salaryMonth || '').trim() !== salaryMonth) {
      return false
    }

    return true
  }))
}

async function getLatestFeedbackBySubmitter(openid, context, salaryMonth = '') {
  const records = await getFeedbacksBySubmitter(openid, context, salaryMonth)
  return records[0] || null
}

async function getExistingLineProjectConfirm(openid, salaryMonth, context) {
  if (context.workspaceType !== WORKSPACE_TYPES.LINE_PROJECT) {
    return null
  }

  let records = []
  try {
    records = await fetchAll(
      db.collection(COLLECTIONS.LINE_PROJECT_CONFIRMS).where({
        'submitter.openid': openid,
        settlementMonth: salaryMonth
      })
    )
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return null
    }
    throw error
  }

  const activeBatchNos = await getActiveLineProjectBatchNos(openid, salaryMonth)
  return sortByCreateTimeDesc(records.filter(record => {
    if (record.status !== 'confirmed') {
      return false
    }

    return matchContext(record, context) && hasSameBatchVersion(record, activeBatchNos)
  }))[0] || null
}

function hasSameBatchVersion(record = {}, activeBatchNos = []) {
  const confirmedBatchNos = Array.isArray(record.importBatchNos)
    ? [...record.importBatchNos].filter(Boolean).sort()
    : []
  return confirmedBatchNos.length === activeBatchNos.length &&
    confirmedBatchNos.every((batchNo, index) => batchNo === activeBatchNos[index])
}

async function getActiveLineProjectBatchNos(openid, salaryMonth) {
  try {
    const versionResult = await db.collection(COLLECTIONS.LINE_PROJECT_ACTIVE_VERSIONS).where({
      settlementMonth: salaryMonth
    }).limit(1).get()
    const version = (versionResult.data || [])[0]
    if (version && version.activeBatchNo) {
      const records = await fetchAll(db.collection(COLLECTIONS.LINE_PROJECT_RECORDS).where({
        settlementMonth: salaryMonth,
        userOpenid: openid
      }))
      return records.some(record => record.importBatchId === version.activeBatchNo)
        ? [version.activeBatchNo]
        : []
    }
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  let records = []
  try {
    records = await fetchAll(db.collection(COLLECTIONS.LINE_PROJECT_RECORDS).where({
      settlementMonth: salaryMonth,
      userOpenid: openid
    }))
  } catch (error) {
    if (isCollectionNotFoundError(error)) return []
    throw error
  }
  return [...new Set(records
    .filter(record => !['superseded', 'rolled_back', 'staged', 'versioned'].includes(record.publishStatus))
    .map(record => record.importBatchId)
    .filter(Boolean))].sort()
}

async function getRelatedWorkOrder(currentUser, salaryMonth, workOrderKey) {
  const key = String(workOrderKey || '').trim()
  if (!key) return null

  let records = []
  try {
    records = await fetchAll(db.collection(COLLECTIONS.LINE_PROJECT_RECORDS).where({
      settlementMonth: salaryMonth,
      workOrderKey: key
    }))
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      throw new Error('集客线路数据集合尚未创建')
    }
    throw error
  }

  let activeBatchNo = ''
  try {
    const versionResult = await db.collection(COLLECTIONS.LINE_PROJECT_ACTIVE_VERSIONS).where({
      settlementMonth: salaryMonth
    }).limit(1).get()
    activeBatchNo = ((versionResult.data || [])[0] || {}).activeBatchNo || ''
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  const record = records.find(item => (
    (!activeBatchNo || item.importBatchId === activeBatchNo) &&
    (activeBatchNo || item.publishStatus !== 'versioned') &&
    !['superseded', 'rolled_back', 'staged'].includes(item.publishStatus) &&
    (item.userOpenid === currentUser.openid || item.gridAccount === currentUser.gridAccount)
  ))
  if (!record) throw new Error('关联工单不存在或不属于当前用户')

  return {
    workOrderKey: record.workOrderKey,
    workOrderCode: record.workOrderCode || '',
    subCategory: record.subCategory || '',
    workOrderSubject: record.workOrderSubject || '',
    workOrderNameRaw: record.workOrderNameRaw || ''
  }
}

async function createFeedback(wxContext, data = {}) {
  const openid = wxContext.OPENID
  let currentUser = await getCurrentUser(openid, data.workspaceType)
  const context = resolveContext(data, currentUser)

  if (!isProfileCompleted(currentUser)) {
    return {
      success: false,
      error: '请先完善个人信息后再提交反馈'
    }
  }

  const content = String(data.content || '').trim()
  if (!content || content.length > 500) {
    return {
      success: false,
      error: '请输入1至500字的疑问内容'
    }
  }

  if (!currentUser.district && context.workspaceType !== WORKSPACE_TYPES.SALES) {
    return {
      success: false,
      error: '当前用户未配置区县'
    }
  }

  const salaryMonth = String(data.salaryMonth || getCurrentMonthLabel()).trim()

  let activeBatchNos = []
  let salesSnapshot = null
  if (context.workspaceType === WORKSPACE_TYPES.SALES) {
    salesSnapshot = await salesContext(currentUser, salaryMonth)
    if (data.sourceBatchId !== salesSnapshot.batchId) throw new Error('业务数据已更新，请重新打开反馈页面后提交')
    currentUser = { ...currentUser, ...salesSnapshot }
    activeBatchNos = [salesSnapshot.batchId]
  }
  if (context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT) {
    activeBatchNos = await getActiveLineProjectBatchNos(openid, salaryMonth)
    if (!activeBatchNos.length) {
      return { success: false, error: '当前月份暂无已发布的本人数据' }
    }
    const existingConfirm = await getExistingLineProjectConfirm(openid, salaryMonth, context)
    if (existingConfirm) {
      return {
        success: false,
        error: '本月已完成签字确认，不能再提交问题反馈'
      }
    }

    if (isMonthlyFeedbackLimitEnabled(context)) {
      const latestFeedback = await getLatestFeedbackBySubmitter(openid, context, salaryMonth)
      if (latestFeedback) {
        return {
          success: false,
          error: '本月已提交过反馈，请勿重复提交'
        }
      }
    }
  }

  const { managerReview, supervisorReview } = await buildHandlerReviews(currentUser, currentUser.district)

  const now = new Date()
  const relatedWorkOrder = context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? await getRelatedWorkOrder(currentUser, salaryMonth, data.relatedWorkOrderKey)
    : null
  const feedback = {
    gridAccount: currentUser.gridAccount || '',
    employeeId: currentUser.employeeId || '',
    district: currentUser.district,
    gridName: currentUser.gridName || '',
    workspaceType: context.workspaceType,
    scene: context.scene,
    salaryMonth,
    importBatchNos: activeBatchNos,
    salaryAmount: salesSnapshot ? salesSnapshot.salaryAmount : normalizeMoney(data.salaryAmount),
    relatedWorkOrder,
    content,
    status: FEEDBACK_STATUS.PENDING,
    workflowVersion: FEEDBACK_WORKFLOW_VERSION,
    roundNo: 1,
    submitter: buildUserSnapshot(currentUser),
    managerReview,
    supervisorReview,
    messages: [buildFeedbackMessage('submitter_question', currentUser, content, [], 1, now, '一线员工')],
    processLogs: [buildProcessLog('submitted', currentUser, content)],
    createTime: now,
    updateTime: now
  }

  let result
  try {
    result = await db.collection(COLLECTIONS.FEEDBACKS).add({
      data: feedback
    })
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return {
        success: false,
        error: '请先在云数据库创建 salary_feedbacks 集合'
      }
    }
    throw error
  }

  return {
    success: true,
    data: {
      feedbackId: result._id
    }
  }
}

async function listMyFeedbacks(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid, data.workspaceType)
  const context = resolveContext(data, currentUser)

  let records = []
  try {
    records = await fetchAll(
      db.collection(COLLECTIONS.FEEDBACKS).where({ 'submitter.openid': openid })
    )
  } catch (error) {
    if (!isCollectionNotFoundError(error)) {
      throw error
    }
  }

  const confirmedMonths = context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? await getConfirmedMonthsBySubmitter(openid)
    : new Set()

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      monthlyLimitEnabled: isMonthlyFeedbackLimitEnabled(context),
      records: sortByCreateTimeDesc(records.filter(record => matchContext(record, context)))
        .map(record => normalizeFeedbackStatus(record, {
          hasConfirmedMonth: confirmedMonths.has(String(record.salaryMonth || '').trim())
        }))
    }
  }
}

async function listPendingFeedbacks(wxContext, data = {}) {
  const currentUser = await getCurrentUser(wxContext.OPENID, data.workspaceType)
  const context = resolveContext(data, currentUser)
  const empty = { success: true, data: { context, title: getContextTitle(context), canResolve: false, records: [] } }
  if (currentUser.workspaceType === 'sales' && !isSalesHandler(currentUser) || !await hasUniqueHandlerAccount(currentUser)) return empty
  let routes
  try {
    routes = (await fetchAll(db.collection(COLLECTIONS.ROUTES))).filter(route => route.status !== 'inactive')
  } catch (error) {
    if (isCollectionNotFoundError(error)) return empty
    throw error
  }
  // 同一区县存在重复有效名单时停止授权，避免名单冲突。
  const activeRoutes = routes.filter(route => getRouteHandlerType(route, currentUser) &&
    routes.filter(item => normalizeDistrict(item.district) === normalizeDistrict(route.district)).length === 1)
  if (!activeRoutes.length) return empty
  const districts = [...new Set(activeRoutes.flatMap(route => normalizeDistrict(route.district) === '公安'
    ? ['公安', '公安县'] : [route.district]))]
  let relatedRecords = []
  try {
    relatedRecords = await fetchAll(db.collection(COLLECTIONS.FEEDBACKS).where({ district: _.in(districts) }))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  const records = sortByCreateTimeDesc(relatedRecords)
    .filter(record => matchContext(record, context))
    .map(record => ({
      ...normalizeFeedbackStatus(record),
      pendingReviewType: getPendingReviewType(record, currentUser,
        activeRoutes.find(route => normalizeDistrict(route.district) === normalizeDistrict(record.district)))
    }))
    .filter(record => record.pendingReviewType)
  return { success: true, data: { context, title: getContextTitle(context), canResolve: true, records } }
}

async function resolveManagedFeedbackScope(currentUser) {
  if (ADMIN_ROLES.includes(currentUser.role)) {
    return { canViewAll: true, districts: [] }
  }

  const districts = new Set()
  const managedDistrict = currentUser.workspaceType === WORKSPACE_TYPES.SALES ? currentUser.salesManagedDistrict : currentUser.district
  if (currentUser.role === 'district_manager' && managedDistrict) districts.add(managedDistrict)
  let routes = []
  try {
    routes = await fetchAll(db.collection(COLLECTIONS.ROUTES))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  routes.filter(route => route.status !== 'inactive').forEach(route => {
    const routeMembers = ['supervisor', 'districtManager', 'districtLeader'].map(name => route[name])
    if (routeMembers.some(member => member && (
      getRouteAccount(member) === getGridAccount(currentUser) &&
      (!member.name || String(member.name).trim() === String(currentUser.realName || '').trim()) &&
      route.district === currentUser.district
    ))) {
      districts.add(route.district)
    }
  })
  if (!districts.size) throw new Error('当前账号没有查看区县问题反馈的权限')
  return { canViewAll: false, districts: [...districts] }
}

async function listManagedFeedbacks(wxContext, data = {}) {
  const currentUser = await getCurrentUser(wxContext.OPENID, data.workspaceType)
  if (currentUser.workspaceType !== 'line_project') throw new Error('销售反馈请使用待处理反馈入口')
  const scope = await resolveManagedFeedbackScope(currentUser)

  const salaryMonth = String(data.salaryMonth || getCurrentMonthLabel()).trim()
  let records = []
  try {
    records = await fetchAll(db.collection(COLLECTIONS.FEEDBACKS).where({
      workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
      salaryMonth
    }))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) {
      throw error
    }
  }

  const context = {
    workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
    scene: FEEDBACK_SCENES.LINE_PROJECT_WORKORDERS
  }
  if (!scope.canViewAll) {
    records = records.filter(record => scope.districts.includes(record.district))
  }
  let confirmedOpenids = new Set()
  try {
    const confirms = await fetchAll(db.collection(COLLECTIONS.LINE_PROJECT_CONFIRMS).where({
      settlementMonth: salaryMonth
    }))
    confirmedOpenids = new Set(confirms
      .filter(record => record.status === 'confirmed')
      .map(record => record.submitter && record.submitter.openid)
      .filter(Boolean))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  return {
    success: true,
    data: {
      context,
      salaryMonth,
      canViewAll: scope.canViewAll,
      districts: scope.districts,
      records: sortByCreateTimeDesc(records.filter(record => matchContext(record, context)))
        .map(record => normalizeFeedbackStatus(record, {
          hasConfirmedMonth: confirmedOpenids.has(record.submitter && record.submitter.openid)
        }))
    }
  }
}

async function getSceneSummary(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid, data.workspaceType)
  const context = resolveContext(data, currentUser)
  const salaryMonth = String(data.salaryMonth || getCurrentMonthLabel()).trim()
  const records = await getFeedbacksBySubmitter(openid, context, salaryMonth)
  const confirmedMonths = context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? await getConfirmedMonthsBySubmitter(openid)
    : new Set()
  const normalizedRecords = records.map(record => normalizeFeedbackStatus(record, {
    hasConfirmedMonth: confirmedMonths.has(salaryMonth)
  }))
  const record = normalizedRecords.find(item => [
    FEEDBACK_STATUS.PENDING,
    FEEDBACK_STATUS.AWAITING_SUBMITTER
  ].includes(item.status)) || normalizedRecords[0] || null

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      salaryMonth,
      record: buildFeedbackSummaryRecord(record, {
        hasConfirmedMonth: confirmedMonths.has(salaryMonth)
      })
    }
  }
}

async function changeFeedback(wxContext, data, change) {
  const operator = await getCurrentUser(wxContext.OPENID, data.workspaceType)
  const feedbackId = String(data.feedbackId || '').trim()
  if (!feedbackId) throw new Error('缺少问题工单标识')
  let status
  await db.runTransaction(async transaction => {
    const fresh = (await transaction.collection(COLLECTIONS.USERS).doc(operator._id).get()).data
    if (!fresh || fresh.openid !== operator.openid) throw new Error('用户身份已变更，请重新登录')
    const user = feedbackUser(fresh, data.workspaceType)
    const record = (await transaction.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).get()).data
    if (!record) throw new Error('问题工单不存在')
    if (!matchContext(record, resolveContext(data, user))) throw new Error('不可处理其他工作台的反馈')
    const updates = await change(record, user, transaction)
    await transaction.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).update({ data: {
      ...updates, workflowVersion: FEEDBACK_WORKFLOW_VERSION, updateTime: new Date()
    } })
    status = updates.status
  })
  return { success: true, data: { feedbackId, status } }
}

function feedbackReply(text, files) {
  const content = String(text || '').trim()
  if (!content || content.length > 500) throw new Error('请填写1至500字的问题或答复')
  const fileIDs = [...new Set((Array.isArray(files) ? files : []).map(item => String(item || '').trim()).filter(Boolean))]
  if (fileIDs.length > 5) throw new Error('每轮最多上传5张图片')
  if (fileIDs.some(fileID => !fileID.startsWith('cloud://'))) throw new Error('问题工单附件格式无效')
  return { content, fileIDs }
}

async function resolveFeedback(wxContext, data = {}) {
  const { content, fileIDs } = feedbackReply(data.responseText, data.fileIDs)
  return changeFeedback(wxContext, data, async (record, user, transaction) => {
    if (user.workspaceType === WORKSPACE_TYPES.SALES && !canHandleSalesDistrict(user, record.district)) {
      throw new Error('当前账号不可处理该区县销售反馈')
    }
    if (getEffectiveFeedbackStatus(record) !== FEEDBACK_STATUS.PENDING) throw new Error('该问题工单已答复或已结束，请刷新列表')
    if (!await hasUniqueHandlerAccount(user)) throw new Error('处理人账号不唯一，请联系管理员')
    const route = await getDistrictRoute(record.district, transaction)
    const handlerType = getPendingReviewType(record, user, route)
    if (!handlerType) throw new Error('当前用户不是该反馈的指定处理人')
    const now = new Date()
    const handlerRoleText = handlerType === 'manager' ? '区县经理' : '基层监督员'
    const managerReview = { ...(record.managerReview || {}) }
    const supervisorReview = { ...(record.supervisorReview || {}) }
    const handled = handlerType === 'manager' ? managerReview : supervisorReview
    const skipped = handlerType === 'manager' ? supervisorReview : managerReview
    Object.assign(handled, buildUserSnapshot(user), { status: 'resolved', reviewTime: now, reviewNote: content })
    if (skipped.status === 'pending') Object.assign(skipped, { status: 'not_required', reviewNote: '已由' + handlerRoleText + '答复' })
    const roundNo = Math.max(1, Number(record.roundNo || 1))
    return {
      status: FEEDBACK_STATUS.AWAITING_SUBMITTER, roundNo, managerReview, supervisorReview,
      resolution: { handlerType, handlerRoleText, handler: buildUserSnapshot(user), content,
        attachments: normalizeAttachments(fileIDs), resolveTime: now },
      messages: [...buildFeedbackMessages(record), buildFeedbackMessage('handler_reply', user, content, fileIDs, roundNo, now, handlerRoleText)],
      processLogs: [...(record.processLogs || []), buildProcessLog('handler_replied', user, content)]
    }
  })
}

function assertSubmitterCanRespond(record, user) {
  if (!record.submitter || record.submitter.openid !== user.openid) throw new Error('只能操作本人提交的问题工单')
  if (getEffectiveFeedbackStatus(record) !== FEEDBACK_STATUS.AWAITING_SUBMITTER) {
    throw new Error('当前工单尚未收到答复或已经结束')
  }
}

async function continueFeedback(wxContext, data = {}) {
  const { content, fileIDs } = feedbackReply(data.content, data.fileIDs)
  return changeFeedback(wxContext, data, async (record, user) => {
    assertSubmitterCanRespond(record, user)
    if (await getExistingLineProjectConfirm(user.openid, record.salaryMonth, normalizeRecordContext(record))) {
      throw new Error('本月已完成签字确认，不能继续反馈')
    }
    const reviews = await buildHandlerReviews(user, record.district)
    const now = new Date()
    const roundNo = Math.max(1, Number(record.roundNo || 1)) + 1
    return {
      ...reviews, status: FEEDBACK_STATUS.PENDING, roundNo, resolution: null,
      messages: [...buildFeedbackMessages(record), buildFeedbackMessage('submitter_follow_up', user, content, fileIDs, roundNo, now, '一线员工')],
      processLogs: [...(record.processLogs || []), buildProcessLog('submitter_followed_up', user, content)]
    }
  })
}

async function confirmFeedbackResolved(wxContext, data = {}) {
  return changeFeedback(wxContext, data, async (record, user) => {
    assertSubmitterCanRespond(record, user)
    const now = new Date()
    return {
      status: FEEDBACK_STATUS.CLOSED, employeeConfirmed: true,
      closedBy: buildUserSnapshot(user), closedTime: now,
      messages: [...buildFeedbackMessages(record), buildFeedbackMessage('submitter_confirmed', user, '确认问题已解决', [], record.roundNo, now, '一线员工')],
      processLogs: [...(record.processLogs || []), buildProcessLog('submitter_confirmed', user, '确认问题已解决')]
    }
  })
}

module.exports.__test__ = {
  resolveContext,
  getEffectiveFeedbackStatus,
  normalizeFeedbackStatus,
  buildFeedbackMessages,
  hasSameBatchVersion,
  getPendingReviewType,
  isMonthlyFeedbackLimitEnabled
}
