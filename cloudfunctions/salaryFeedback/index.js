const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const MAX_QUERY_LIMIT = 100

const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}

const FEEDBACK_SCENES = {
  SALES_SALARY: 'sales_salary',
  LINE_PROJECT_WORKORDERS: 'line_project_workorders'
}

const COLLECTIONS = {
  USERS: 'users',
  FEEDBACKS: 'salary_feedbacks',
  ROUTES: 'feedback_routes',
  LINE_PROJECT_CONFIRMS: 'line_project_month_confirms'
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event || {}

  try {
    switch (action) {
      case 'create':
        return await createFeedback(wxContext, data)
      case 'listMine':
        return await listMyFeedbacks(wxContext, data)
      case 'listPending':
        return await listPendingFeedbacks(wxContext, data)
      case 'getSceneSummary':
        return await getSceneSummary(wxContext, data)
      case 'review':
        return await reviewFeedback(wxContext, data)
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
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function normalizeMoney(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

function getDisplayName(user) {
  return String(user.realName || user.nickName || user.gridAccount || '').trim()
}

function isProfileCompleted(user) {
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
    district: user.district || '',
    gridName: user.gridName || '',
    role: user.role || ''
  }
}

function buildReviewSnapshot(user, district) {
  return {
    openid: user.openid || '',
    name: getDisplayName(user),
    gridAccount: user.gridAccount || '',
    district: district || user.district || '',
    status: 'pending',
    reviewTime: null
  }
}

function getRouteGridAccount(config) {
  if (!config) {
    return ''
  }

  if (typeof config === 'string') {
    return config.trim()
  }

  return String(config.gridAccount || '').trim()
}

function resolveFeedbackStatus(managerStatus, supervisorStatus) {
  if (managerStatus === 'rejected' || supervisorStatus === 'rejected') {
    return 'rejected'
  }

  if (managerStatus === 'approved' && supervisorStatus === 'approved') {
    return 'approved'
  }

  if (managerStatus === 'approved' || supervisorStatus === 'approved') {
    return 'processing'
  }

  return 'pending'
}

function getPendingReviewType(record, currentGridAccount) {
  if (
    record &&
    record.managerReview &&
    record.managerReview.gridAccount === currentGridAccount &&
    record.managerReview.status === 'pending'
  ) {
    return 'manager'
  }

  if (
    record &&
    record.supervisorReview &&
    record.supervisorReview.gridAccount === currentGridAccount &&
    record.supervisorReview.status === 'pending'
  ) {
    return 'supervisor'
  }

  return ''
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

function resolveContext(data = {}) {
  const workspaceType = normalizeWorkspaceType(data.workspaceType)
  const scene = String(data.scene || getDefaultScene(workspaceType)).trim() || getDefaultScene(workspaceType)

  return {
    workspaceType,
    scene
  }
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
  const recordContext = normalizeRecordContext(record)
  return (
    recordContext.workspaceType === context.workspaceType &&
    recordContext.scene === context.scene
  )
}

function getContextTitle(context) {
  return context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? '集客开通酬金反馈'
    : '酬金反馈'
}

function isProcessingFeedbackStatus(status) {
  return ['pending', 'processing'].includes(String(status || '').trim())
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

function buildFeedbackSummaryRecord(record) {
  if (!record) {
    return null
  }

  const context = normalizeRecordContext(record)
  return {
    ...record,
    workspaceType: context.workspaceType,
    scene: context.scene,
    createTimeText: formatDateTime(record.createTime),
    updateTimeText: formatDateTime(record.updateTime)
  }
}

async function getCurrentUser(openid) {
  const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get()

  if (!result.data || result.data.length === 0) {
    throw new Error('用户不存在')
  }

  return normalizeUser(result.data[0])
}

async function getDistrictRoute(district) {
  let result
  try {
    result = await db.collection(COLLECTIONS.ROUTES).where({ district }).get()
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      throw new Error('请先在云数据库创建 feedback_routes 集合并配置区县审批路由')
    }
    throw error
  }

  const routes = (result.data || []).filter(item => item.status !== 'inactive')

  if (routes.length === 0) {
    throw new Error('当前区县未配置审批人')
  }

  if (routes.length > 1) {
    throw new Error('当前区县存在多条有效审批路由')
  }

  return routes[0]
}

async function getApproverByGridAccount(gridAccount, district, roleText) {
  if (!gridAccount) {
    throw new Error(`请先配置${roleText}网格通账号`)
  }

  const result = await db.collection(COLLECTIONS.USERS).where({ gridAccount }).limit(2).get()

  if (!result.data || result.data.length === 0) {
    throw new Error(`未找到${roleText}对应的网格通账号用户`)
  }

  if (result.data.length > 1) {
    throw new Error(`${roleText}网格通账号匹配到多个用户`)
  }

  const user = normalizeUser(result.data[0])
  if (district && user.district && user.district !== district) {
    throw new Error(`${roleText}账号所属区县与反馈区县不一致`)
  }

  return user
}

async function getLatestFeedbackBySubmitter(openid, context, salaryMonth = '') {
  let records = []
  try {
    records = await fetchAll(
      db.collection(COLLECTIONS.FEEDBACKS).where({ 'submitter.openid': openid })
    )
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return null
    }
    throw error
  }

  const matchedRecords = sortByCreateTimeDesc(records.filter(record => {
    if (!matchContext(record, context)) {
      return false
    }

    if (salaryMonth && String(record.salaryMonth || '').trim() !== salaryMonth) {
      return false
    }

    return true
  }))

  return matchedRecords[0] || null
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

  return sortByCreateTimeDesc(records.filter(record => {
    if (record.status !== 'confirmed') {
      return false
    }

    return matchContext(record, context)
  }))[0] || null
}

async function createFeedback(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const context = resolveContext(data)

  if (!isProfileCompleted(currentUser)) {
    return {
      success: false,
      error: '请先完善个人信息后再提交反馈'
    }
  }

  const content = String(data.content || '').trim()
  if (!content) {
    return {
      success: false,
      error: '请输入疑问内容'
    }
  }

  if (!currentUser.district) {
    return {
      success: false,
      error: '当前用户未配置区县'
    }
  }

  const salaryMonth = String(data.salaryMonth || getCurrentMonthLabel()).trim()

  if (context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT) {
    const existingConfirm = await getExistingLineProjectConfirm(openid, salaryMonth, context)
    if (existingConfirm) {
      return {
        success: false,
        error: '本月已完成签字确认，不能再提交问题反馈'
      }
    }

    const latestFeedback = await getLatestFeedbackBySubmitter(openid, context, salaryMonth)
    if (latestFeedback && isProcessingFeedbackStatus(latestFeedback.status)) {
      return {
        success: false,
        error: '当前月份已有待处理反馈，请勿重复提交'
      }
    }
  }

  const route = await getDistrictRoute(currentUser.district)
  const managerGridAccount = getRouteGridAccount(route.districtManager)
  const supervisorGridAccount = getRouteGridAccount(route.supervisor)

  const districtManager = await getApproverByGridAccount(managerGridAccount, currentUser.district, '区县经理')
  const supervisor = await getApproverByGridAccount(supervisorGridAccount, currentUser.district, '基层监督员')

  if (districtManager.gridAccount === supervisor.gridAccount) {
    return {
      success: false,
      error: '区县经理和基层监督员不能配置为同一人'
    }
  }

  if (
    currentUser.gridAccount === districtManager.gridAccount ||
    currentUser.gridAccount === supervisor.gridAccount
  ) {
    return {
      success: false,
      error: '提交人与审批人不能为同一人'
    }
  }

  const now = new Date()
  const feedback = {
    gridAccount: currentUser.gridAccount,
    district: currentUser.district,
    gridName: currentUser.gridName || '',
    workspaceType: context.workspaceType,
    scene: context.scene,
    salaryMonth,
    salaryAmount: normalizeMoney(data.salaryAmount),
    content,
    status: 'pending',
    submitter: buildUserSnapshot(currentUser),
    managerReview: buildReviewSnapshot(districtManager, currentUser.district),
    supervisorReview: buildReviewSnapshot(supervisor, currentUser.district),
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
  await getCurrentUser(openid)
  const context = resolveContext(data)

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

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      records: sortByCreateTimeDesc(records.filter(record => matchContext(record, context)))
    }
  }
}

async function listPendingFeedbacks(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const context = resolveContext(data)

  if (!currentUser.gridAccount) {
    return {
      success: true,
      data: {
        context,
        title: getContextTitle(context),
        canApprove: false,
        records: []
      }
    }
  }

  let routeRecords = []
  try {
    routeRecords = await fetchAll(db.collection(COLLECTIONS.ROUTES))
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return {
        success: true,
        data: {
          context,
          title: getContextTitle(context),
          canApprove: false,
          records: []
        }
      }
    }
    throw error
  }

  const activeRoutes = routeRecords.filter(route => route.status !== 'inactive')
  const canApprove = activeRoutes.some(route => {
    const managerGridAccount = getRouteGridAccount(route.districtManager)
    const supervisorGridAccount = getRouteGridAccount(route.supervisor)
    return managerGridAccount === currentUser.gridAccount || supervisorGridAccount === currentUser.gridAccount
  })

  let relatedRecords = []
  try {
    relatedRecords = await fetchAll(
      db.collection(COLLECTIONS.FEEDBACKS).where(_.or([
        { 'managerReview.gridAccount': currentUser.gridAccount },
        { 'supervisorReview.gridAccount': currentUser.gridAccount }
      ]))
    )
  } catch (error) {
    if (!isCollectionNotFoundError(error)) {
      throw error
    }
  }

  const records = sortByCreateTimeDesc(relatedRecords)
    .filter(record => matchContext(record, context))
    .map(record => ({
      ...record,
      pendingReviewType: getPendingReviewType(record, currentUser.gridAccount)
    }))
    .filter(record => record.pendingReviewType && !['approved', 'rejected'].includes(record.status))

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      canApprove,
      records
    }
  }
}

async function getSceneSummary(wxContext, data = {}) {
  const openid = wxContext.OPENID
  await getCurrentUser(openid)
  const context = resolveContext(data)
  const salaryMonth = String(data.salaryMonth || getCurrentMonthLabel()).trim()
  const record = await getLatestFeedbackBySubmitter(openid, context, salaryMonth)

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      salaryMonth,
      record: buildFeedbackSummaryRecord(record)
    }
  }
}

async function reviewFeedback(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const feedbackId = String(data.feedbackId || '').trim()
  const action = String(data.action || '').trim()

  if (!feedbackId) {
    return {
      success: false,
      error: '缺少反馈记录标识'
    }
  }

  if (!['approved', 'rejected'].includes(action)) {
    return {
      success: false,
      error: '审批动作无效'
    }
  }

  let recordResult
  try {
    recordResult = await db.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).get()
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return {
        success: false,
        error: '请先在云数据库创建 salary_feedbacks 集合'
      }
    }
    throw error
  }
  const record = recordResult.data

  if (!record) {
    return {
      success: false,
      error: '反馈记录不存在'
    }
  }

  if (['approved', 'rejected'].includes(record.status)) {
    return {
      success: false,
      error: '该反馈已完成审批'
    }
  }

  const reviewType = getPendingReviewType(record, currentUser.gridAccount)
  if (!reviewType) {
    return {
      success: false,
      error: '当前用户没有审批权限'
    }
  }

  const now = new Date()
  const managerReview = {
    ...(record.managerReview || {})
  }
  const supervisorReview = {
    ...(record.supervisorReview || {})
  }

  if (reviewType === 'manager') {
    managerReview.status = action
    managerReview.reviewTime = now
    managerReview.openid = currentUser.openid
    managerReview.name = getDisplayName(currentUser)
    managerReview.gridAccount = currentUser.gridAccount
    managerReview.district = currentUser.district || record.district || ''
  } else {
    supervisorReview.status = action
    supervisorReview.reviewTime = now
    supervisorReview.openid = currentUser.openid
    supervisorReview.name = getDisplayName(currentUser)
    supervisorReview.gridAccount = currentUser.gridAccount
    supervisorReview.district = currentUser.district || record.district || ''
  }

  const status = resolveFeedbackStatus(managerReview.status, supervisorReview.status)

  try {
    await db.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).update({
      data: {
        managerReview,
        supervisorReview,
        status,
        updateTime: now
      }
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
      feedbackId,
      status
    }
  }
}
