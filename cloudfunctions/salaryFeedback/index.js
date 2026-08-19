const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const MAX_QUERY_LIMIT = 100
const ADMIN_ROLES = ['sales_department', 'system_admin']

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

function buildReviewSnapshot(user, district, gridAccount, roleText) {
  if (!user) {
    return {
      openid: '',
      name: '',
      gridAccount: gridAccount || '',
      district: district || '',
      status: 'not_required',
      reviewTime: null,
      reviewNote: `${roleText}账号暂未绑定有效系统用户`
    }
  }

  return {
    openid: user.openid || '',
    name: getDisplayName(user),
    gridAccount: user.gridAccount || '',
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

  if (managerStatus === 'approved' || supervisorStatus === 'approved') {
    return 'approved'
  }

  return 'pending'
}

function getEffectiveFeedbackStatus(record = {}) {
  if (record.resolution || record.status === 'resolved') return 'resolved'
  const resolvedStatus = resolveFeedbackStatus(
    record.managerReview && record.managerReview.status,
    record.supervisorReview && record.supervisorReview.status
  )
  if (resolvedStatus !== 'pending') return resolvedStatus
  return ['approved', 'rejected'].includes(record.status) ? record.status : 'pending'
}

function normalizeFeedbackStatus(record = {}) {
  const status = getEffectiveFeedbackStatus(record)
  return {
    ...record,
    status,
    resolution: record.resolution || buildLegacyResolution(record)
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

function getPendingReviewType(record, currentGridAccount) {
  if (['approved', 'rejected', 'resolved'].includes(getEffectiveFeedbackStatus(record))) {
    return ''
  }

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

function resolveContext(data = {}, currentUser = {}) {
  const workspaceType = normalizeWorkspaceType(currentUser.workspaceType)
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
  const recordContext = normalizeRecordContext(record)
  return (
    recordContext.workspaceType === context.workspaceType &&
    recordContext.scene === context.scene
  )
}

function getContextTitle(context) {
  return context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? '集客线路酬金反馈'
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

function buildFeedbackSummaryRecord(record) {
  if (!record) {
    return null
  }

  const normalizedRecord = normalizeFeedbackStatus(record)
  const context = normalizeRecordContext(record)
  return {
    ...normalizedRecord,
    workspaceType: context.workspaceType,
    scene: context.scene,
    createTimeText: formatDateTime(normalizedRecord.createTime),
    updateTimeText: formatDateTime(normalizedRecord.updateTime)
  }
}

async function getCurrentUser(openid) {
  const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get()

  if (!result.data || result.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = normalizeUser(result.data[0])
  if (user.status === 'inactive') {
    throw new Error('当前账号已停用')
  }
  return user
}

async function getDistrictRoute(district) {
  let result
  try {
    result = await db.collection(COLLECTIONS.ROUTES).where({ district }).get()
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

  return routes[0]
}

async function findApproverByGridAccount(gridAccount, district) {
  if (!gridAccount) return null

  const result = await db.collection(COLLECTIONS.USERS).where({ gridAccount }).limit(2).get()
  if (!result.data || result.data.length !== 1) return null

  const user = normalizeUser(result.data[0])
  if (user.status === 'inactive') return null
  if (district && user.district && user.district !== district) return null

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
  const currentUser = await getCurrentUser(openid)
  const context = resolveContext(data, currentUser)

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

  let activeBatchNos = []
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

    const latestFeedback = await getLatestFeedbackBySubmitter(openid, context, salaryMonth)
    if (latestFeedback) {
      return {
        success: false,
        error: '本月已提交过反馈，请勿重复提交'
      }
    }
  }

  const route = await getDistrictRoute(currentUser.district)
  const managerGridAccount = getRouteGridAccount(route.districtManager)
  const supervisorGridAccount = getRouteGridAccount(route.supervisor)

  let [districtManager, supervisor] = await Promise.all([
    findApproverByGridAccount(managerGridAccount, currentUser.district),
    findApproverByGridAccount(supervisorGridAccount, currentUser.district)
  ])

  if (districtManager && supervisor && districtManager.gridAccount === supervisor.gridAccount) {
    return {
      success: false,
      error: '区县经理和基层监督员不能配置为同一人'
    }
  }

  if (districtManager && currentUser.gridAccount === districtManager.gridAccount) districtManager = null
  if (supervisor && currentUser.gridAccount === supervisor.gridAccount) supervisor = null
  if (!districtManager && !supervisor) {
    return {
      success: false,
      error: '当前区县没有可用问题处理人，请先绑定区县经理或基层监督员账号'
    }
  }

  const now = new Date()
  const relatedWorkOrder = context.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? await getRelatedWorkOrder(currentUser, salaryMonth, data.relatedWorkOrderKey)
    : null
  const feedback = {
    gridAccount: currentUser.gridAccount,
    district: currentUser.district,
    gridName: currentUser.gridName || '',
    workspaceType: context.workspaceType,
    scene: context.scene,
    salaryMonth,
    importBatchNos: activeBatchNos,
    salaryAmount: normalizeMoney(data.salaryAmount),
    relatedWorkOrder,
    content,
    status: 'pending',
    submitter: buildUserSnapshot(currentUser),
    managerReview: buildReviewSnapshot(districtManager, currentUser.district, managerGridAccount, '区县经理'),
    supervisorReview: buildReviewSnapshot(supervisor, currentUser.district, supervisorGridAccount, '基层监督员'),
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
  const currentUser = await getCurrentUser(openid)
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

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      records: sortByCreateTimeDesc(records.filter(record => matchContext(record, context)))
        .map(normalizeFeedbackStatus)
    }
  }
}

async function listPendingFeedbacks(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const context = resolveContext(data, currentUser)

  if (!currentUser.gridAccount) {
    return {
      success: true,
      data: {
        context,
        title: getContextTitle(context),
        canApprove: false,
        canResolve: false,
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
          canResolve: false,
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
    .map(normalizeFeedbackStatus)
    .map(record => ({
      ...record,
      pendingReviewType: getPendingReviewType(record, currentUser.gridAccount)
    }))
    .filter(record => record.pendingReviewType && !['approved', 'rejected', 'resolved'].includes(record.status))

  return {
    success: true,
    data: {
      context,
      title: getContextTitle(context),
      canApprove,
      canResolve: canApprove,
      records
    }
  }
}

async function resolveManagedFeedbackScope(currentUser) {
  if (ADMIN_ROLES.includes(currentUser.role)) {
    return { canViewAll: true, districts: [] }
  }

  const districts = new Set()
  if (currentUser.role === 'district_manager' && currentUser.district) districts.add(currentUser.district)
  let routes = []
  try {
    routes = await fetchAll(db.collection(COLLECTIONS.ROUTES))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  routes.filter(route => route.status !== 'inactive').forEach(route => {
    const routeMembers = [route.supervisor, route.districtManager, route.districtLeader]
    if (routeMembers.some(member => member && (
      getRouteGridAccount(member) === currentUser.gridAccount &&
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
  const currentUser = await getCurrentUser(wxContext.OPENID)
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
  return {
    success: true,
    data: {
      context,
      salaryMonth,
      canViewAll: scope.canViewAll,
      districts: scope.districts,
      records: sortByCreateTimeDesc(records.filter(record => matchContext(record, context)))
        .map(normalizeFeedbackStatus)
    }
  }
}

async function getSceneSummary(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const context = resolveContext(data, currentUser)
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

async function resolveFeedback(wxContext, data = {}) {
  const currentUser = await getCurrentUser(wxContext.OPENID)
  const feedbackId = String(data.feedbackId || '').trim()
  const responseText = String(data.responseText || '').trim()
  const fileIDs = [...new Set((Array.isArray(data.fileIDs) ? data.fileIDs : [])
    .map(item => String(item || '').trim())
    .filter(Boolean))]

  if (!feedbackId) return { success: false, error: '缺少问题工单标识' }
  if (!responseText) return { success: false, error: '请填写问题答复' }
  if (fileIDs.length > 5) return { success: false, error: '每张问题工单最多上传5张图片' }
  if (fileIDs.some(fileID => !fileID.startsWith('cloud://'))) {
    return { success: false, error: '问题工单附件格式无效' }
  }

  let recordResult
  try {
    recordResult = await db.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).get()
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return { success: false, error: '请先在云数据库创建 salary_feedbacks 集合' }
    }
    throw error
  }
  const record = recordResult.data
  if (!record) return { success: false, error: '问题工单不存在' }
  if (normalizeRecordContext(record).workspaceType !== WORKSPACE_TYPES.LINE_PROJECT) {
    return { success: false, error: '当前记录不是集客线路问题工单' }
  }
  if (['approved', 'rejected', 'resolved'].includes(getEffectiveFeedbackStatus(record))) {
    return { success: false, error: '该问题工单已完成处理' }
  }

  const handlerType = getPendingReviewType(record, currentUser.gridAccount)
  if (!handlerType) return { success: false, error: '当前用户没有处理该问题工单的权限' }

  const now = new Date()
  const handlerRoleText = handlerType === 'manager' ? '区县经理' : '基层监督员'
  const resolution = {
    handlerType,
    handlerRoleText,
    handler: buildUserSnapshot(currentUser),
    content: responseText,
    attachments: fileIDs.map(fileID => ({ fileID })),
    resolveTime: now
  }
  const managerReview = { ...(record.managerReview || {}) }
  const supervisorReview = { ...(record.supervisorReview || {}) }
  const handledReview = handlerType === 'manager' ? managerReview : supervisorReview
  const skippedReview = handlerType === 'manager' ? supervisorReview : managerReview
  handledReview.status = 'resolved'
  handledReview.reviewTime = now
  handledReview.reviewNote = responseText
  Object.assign(handledReview, buildUserSnapshot(currentUser))
  if (skippedReview.status === 'pending') {
    skippedReview.status = 'not_required'
    skippedReview.reviewNote = `已由${handlerRoleText}答复`
  }

  const processLogs = Array.isArray(record.processLogs) ? record.processLogs.slice() : []
  processLogs.push(buildProcessLog('resolved', currentUser, responseText))
  await db.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).update({
    data: {
      status: 'resolved',
      resolution,
      managerReview,
      supervisorReview,
      processLogs,
      updateTime: now
    }
  })

  return { success: true, data: { feedbackId, status: 'resolved' } }
}

async function reviewFeedback(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const currentUser = await getCurrentUser(openid)
  const feedbackId = String(data.feedbackId || '').trim()
  const action = String(data.action || '').trim()
  const reviewNote = String(data.reviewNote || '').trim()

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

  if (action === 'rejected' && !reviewNote) {
    return { success: false, error: '驳回时请填写处理意见' }
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

  if (normalizeRecordContext(record).workspaceType === WORKSPACE_TYPES.LINE_PROJECT) {
    return { success: false, error: '集客线路问题工单请使用问题答复功能处理' }
  }

  if (['approved', 'rejected'].includes(getEffectiveFeedbackStatus(record))) {
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
    managerReview.reviewNote = reviewNote
    if (supervisorReview.status === 'pending') {
      supervisorReview.status = 'not_required'
      supervisorReview.reviewNote = '已由区县经理处理'
    }
  } else {
    supervisorReview.status = action
    supervisorReview.reviewTime = now
    supervisorReview.openid = currentUser.openid
    supervisorReview.name = getDisplayName(currentUser)
    supervisorReview.gridAccount = currentUser.gridAccount
    supervisorReview.district = currentUser.district || record.district || ''
    supervisorReview.reviewNote = reviewNote
    if (managerReview.status === 'pending') {
      managerReview.status = 'not_required'
      managerReview.reviewNote = '已由基层监督员处理'
    }
  }

  const status = resolveFeedbackStatus(managerReview.status, supervisorReview.status)
  const processLogs = Array.isArray(record.processLogs) ? record.processLogs.slice() : []
  processLogs.push(buildProcessLog(`${reviewType}_${action}`, currentUser, reviewNote))

  try {
    await db.collection(COLLECTIONS.FEEDBACKS).doc(feedbackId).update({
      data: {
        managerReview,
        supervisorReview,
        processLogs,
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

module.exports.__test__ = {
  resolveContext,
  resolveFeedbackStatus,
  getEffectiveFeedbackStatus,
  normalizeFeedbackStatus,
  hasSameBatchVersion,
  getPendingReviewType
}
