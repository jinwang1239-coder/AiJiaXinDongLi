const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const XLSX = require('xlsx')
const {
  CURRENT_MAJOR_CATEGORY,
  CURRENT_SUBCATEGORY,
  SUBCATEGORY_OPTIONS,
  SUBCATEGORY_TO_MAJOR,
  ITEM_COLUMN_MAP,
  MODULE_CONFIGS,
  APPROVAL_ROUTE_ROSTER,
  DISTRICT_LEADER_ROSTER,
  SYSTEM_ADMIN_ROSTER
} = require('./config')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const COLLECTIONS = {
  USERS: 'users',
  RECORDS: 'line_project_records',
  BATCHES: 'line_project_import_batches',
  FEEDBACKS: 'salary_feedbacks',
  MONTH_CONFIRMS: 'line_project_month_confirms',
  ROUTES: 'feedback_routes',
  EVIDENCES: 'line_project_evidences',
  AUDIT_LOGS: 'line_project_audit_logs',
  ACTIVE_VERSIONS: 'line_project_active_versions'
}

const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}

const SYSTEM_ADMIN_ROLE = 'system_admin'
const LINE_PROJECT_ADMIN_ROLE = 'sales_department'
const MAX_QUERY_LIMIT = 100
const IMPORT_CHUNK_SIZE = 10
const IMPORT_LOCK_TIMEOUT = 30 * 60 * 1000
const LINE_PROJECT_FEEDBACK_SCENE = 'line_project_workorders'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event

  try {
    switch (action) {
      case 'importPreview':
        return await importPreview(wxContext, data)
      case 'importStart':
        return await importStart(wxContext, data)
      case 'importWriteChunk':
        return await importWriteChunk(wxContext, data)
      case 'importFinalize':
        return await importFinalize(wxContext, data)
      case 'getMyOverview':
        return await getMyOverview(wxContext, data)
      case 'listMyWorkOrders':
        return await listMyWorkOrders(wxContext, data)
      case 'getMyWorkOrderDetail':
        return await getMyWorkOrderDetail(wxContext, data)
      case 'getMonthConfirmStatus':
        return await getMonthConfirmStatus(wxContext, data)
      case 'confirmMonth':
        return await confirmMonth(wxContext, data)
      case 'dashboard':
        return await getDashboard(wxContext, data)
      case 'listByPerson':
        return await listByPerson(wxContext, data)
      case 'getPersonDetail':
        return await getPersonDetail(wxContext, data)
      case 'listByWorkOrder':
        return await listByWorkOrder(wxContext, data)
      case 'getWorkOrderDetail':
        return await getWorkOrderDetail(wxContext, data)
      case 'getImportBatches':
        return await getImportBatches(wxContext, data)
      case 'export':
        return await exportData(wxContext, data)
      case 'getAccessProfile':
        return await getAccessProfile(wxContext)
      case 'syncSupervisorRoutes':
      case 'syncAccessRoster':
        return await syncSupervisorRoutes(wxContext)
      case 'createEvidence':
        return await createEvidence(wxContext, data)
      case 'listEvidence':
        return await listEvidence(wxContext, data)
      case 'rollbackImportBatch':
        return await rollbackImportBatch(wxContext, data)
      case 'test':
        return {
          success: true,
          data: {
            message: 'lineProjectData 云函数正常运行'
          }
        }
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (error) {
    console.error('lineProjectData 执行失败:', error)
    return {
      success: false,
      error: error.message || '集客线路模块执行失败'
    }
  }
}

async function ensureUser(openid) {
  const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get()
  if (!result.data.length) {
    throw new Error('用户不存在')
  }
  const user = normalizeUser(result.data[0])
  if (user.status === 'inactive') {
    throw new Error('当前账号已停用')
  }
  return user
}

function normalizeUser(user = {}) {
  return {
    ...user,
    role: user.role || '',
    status: user.status || 'active',
    realName: (user.realName || '').trim(),
    gridAccount: (user.gridAccount || '').trim(),
    district: (user.district || '').trim(),
    workspaceType: normalizeWorkspaceType(user.workspaceType)
  }
}

function normalizeWorkspaceType(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? WORKSPACE_TYPES.LINE_PROJECT
    : WORKSPACE_TYPES.SALES
}

function isSystemAdmin(user = {}) {
  return user.role === SYSTEM_ADMIN_ROLE
}

function canImportLineProject(user = {}) {
  return isSystemAdmin(user) || user.role === LINE_PROJECT_ADMIN_ROLE
}

function ensureLineProjectWorkspace(user = {}) {
  if (isSystemAdmin(user)) {
    return
  }

  if (normalizeWorkspaceType(user.workspaceType) !== WORKSPACE_TYPES.LINE_PROJECT) {
    throw new Error('当前账号未开通集客线路项目工作台')
  }
}

function ensureImportRole(user = {}) {
  if (!canImportLineProject(user)) {
    throw new Error('仅集客线路管理员或系统管理员可以执行导入、发布和回滚操作')
  }
}

function getRouteAccount(routePart) {
  if (!routePart) return ''
  return String(typeof routePart === 'string' ? routePart : routePart.gridAccount || '').trim()
}

async function getActiveFeedbackRoutes() {
  try {
    const routes = await fetchAllRecords(db.collection(COLLECTIONS.ROUTES))
    return routes.filter(route => route.status !== 'inactive')
  } catch (error) {
    if (isCollectionNotFoundError(error)) return []
    throw error
  }
}

async function resolveAccess(user = {}) {
  const admin = isSystemAdmin(user)
  const canImport = canImportLineProject(user)
  const managedDistricts = new Set()
  const roles = new Set()

  if (user.role === 'district_manager' && user.district) {
    managedDistricts.add(user.district)
    roles.add('district_manager')
  }

  if (user.gridAccount) {
    const configuredRoute = APPROVAL_ROUTE_ROSTER.find(item => item.district === user.district)
    if (
      configuredRoute &&
      configuredRoute.supervisor.gridAccount === user.gridAccount &&
      normalizeText(configuredRoute.supervisor.name) === normalizeText(user.realName)
    ) {
      managedDistricts.add(configuredRoute.district)
      roles.add('district_supervisor')
    }
    if (
      configuredRoute &&
      configuredRoute.districtManager.gridAccount === user.gridAccount &&
      normalizeText(configuredRoute.districtManager.name) === normalizeText(user.realName)
    ) {
      managedDistricts.add(configuredRoute.district)
      roles.add('district_manager')
    }
    const configuredLeader = DISTRICT_LEADER_ROSTER.find(item => (
      item.district === user.district &&
      item.gridAccount === user.gridAccount &&
      normalizeText(item.name) === normalizeText(user.realName)
    ))
    if (configuredLeader) {
      managedDistricts.add(configuredLeader.district)
      roles.add('district_leader')
    }
    const routes = await getActiveFeedbackRoutes()
    routes.forEach(route => {
      if (
        getRouteAccount(route.supervisor) === user.gridAccount &&
        (!route.supervisor.name || normalizeText(route.supervisor.name) === normalizeText(user.realName)) &&
        route.district === user.district
      ) {
        managedDistricts.add(route.district)
        roles.add('district_supervisor')
      }
      if (getRouteAccount(route.districtManager) === user.gridAccount) {
        managedDistricts.add(route.district)
        roles.add('district_manager')
      }
      if (
        getRouteAccount(route.districtLeader) === user.gridAccount &&
        (!route.districtLeader.name || normalizeText(route.districtLeader.name) === normalizeText(user.realName)) &&
        route.district === user.district
      ) {
        managedDistricts.add(route.district)
        roles.add('district_leader')
      }
    })
  }

  const canViewManagedFeedbacks = canImport || ['district_supervisor', 'district_leader', 'district_manager']
    .some(role => roles.has(role))
  const canUploadEvidence = !admin && ['district_leader', 'district_manager'].some(role => roles.has(role)) && managedDistricts.size > 0
  const canViewAllEvidence = canImport

  return {
    isSystemAdmin: admin,
    canImport,
    canManage: canImport || managedDistricts.size > 0,
    canViewAll: canImport,
    canViewManagedFeedbacks,
    canUploadEvidence,
    canViewEvidence: canViewAllEvidence || canUploadEvidence,
    canViewAllEvidence,
    managedDistricts: [...managedDistricts].filter(Boolean).sort(),
    lineProjectRoles: [...roles]
  }
}

async function getAccessProfile(wxContext) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  return {
    success: true,
    data: {
      ...(await resolveAccess(user)),
      user: buildUserSnapshot(user)
    }
  }
}

async function grantLineProjectAccess(user, lineProjectRole, district, now = new Date()) {
  if (!user || !user._id) return false
  const latestResult = await db.collection(COLLECTIONS.USERS).doc(user._id).get()
  const latestUser = latestResult.data || user
  const roles = new Set(Array.isArray(latestUser.lineProjectRoles) ? latestUser.lineProjectRoles : [])
  const districts = new Set(Array.isArray(latestUser.managedDistricts) ? latestUser.managedDistricts : [])
  roles.add(lineProjectRole)
  districts.add(district)
  await db.collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
      lineProjectRoles: [...roles],
      managedDistricts: [...districts],
      updateTime: now
    }
  })
  return true
}

async function grantSystemAdminAccess(user, now = new Date()) {
  if (!user || !user._id) return false
  await db.collection(COLLECTIONS.USERS).doc(user._id).update({
    data: {
      role: SYSTEM_ADMIN_ROLE,
      workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
      updateTime: now
    }
  })
  return true
}

async function syncSupervisorRoutes(wxContext) {
  const user = await ensureUser(wxContext.OPENID)
  ensureImportRole(user)
  const now = new Date()
  const results = []

  for (const route of APPROVAL_ROUTE_ROSTER) {
    const districtLeader = DISTRICT_LEADER_ROSTER.find(item => item.district === route.district)
    const routeResult = await db.collection(COLLECTIONS.ROUTES).where({
      district: route.district
    }).get()
    const currentRoute = (routeResult.data || []).find(route => route.status !== 'inactive') || routeResult.data[0]
    const routeData = {
      district: route.district,
      supervisor: route.supervisor,
      districtManager: route.districtManager,
      districtLeader: districtLeader || null,
      status: 'active',
      source: 'approval_route_roster_202608',
      updateTime: now
    }

    if (currentRoute) {
      await db.collection(COLLECTIONS.ROUTES).doc(currentRoute._id).update({ data: routeData })
    } else {
      await db.collection(COLLECTIONS.ROUTES).add({
        data: { ...routeData, createTime: now }
      })
    }

    for (const duplicateRoute of (routeResult.data || []).filter(route => route._id !== (currentRoute && currentRoute._id))) {
      await db.collection(COLLECTIONS.ROUTES).doc(duplicateRoute._id).update({
        data: { status: 'inactive', updateTime: now }
      })
    }

    const [supervisorResult, managerResult, leaderResult] = await Promise.all([
      db.collection(COLLECTIONS.USERS).where({ gridAccount: route.supervisor.gridAccount }).limit(2).get(),
      db.collection(COLLECTIONS.USERS).where({ gridAccount: route.districtManager.gridAccount }).limit(2).get(),
      districtLeader
        ? db.collection(COLLECTIONS.USERS).where({ gridAccount: districtLeader.gridAccount }).limit(2).get()
        : Promise.resolve({ data: [] })
    ])
    const supervisorUser = (supervisorResult.data || []).find(item => (
      normalizeText(item.realName) === normalizeText(route.supervisor.name) && item.district === route.district
    ))
    const managerUser = (managerResult.data || []).find(item => (
      normalizeText(item.realName) === normalizeText(route.districtManager.name) && item.district === route.district
    ))
    const leaderUser = (leaderResult.data || []).find(item => (
      normalizeText(item.realName) === normalizeText(districtLeader && districtLeader.name) && item.district === route.district
    ))
    await grantLineProjectAccess(supervisorUser, 'district_supervisor', route.district, now)
    await grantLineProjectAccess(managerUser, 'district_manager', route.district, now)
    await grantLineProjectAccess(leaderUser, 'district_leader', route.district, now)

    results.push({
      ...route,
      supervisorMatched: !!supervisorUser,
      districtManagerMatched: !!managerUser,
      districtLeaderMatched: !!leaderUser
    })
  }

  const systemAdminMatches = []
  for (const admin of SYSTEM_ADMIN_ROSTER) {
    const adminResult = await db.collection(COLLECTIONS.USERS).where({ gridAccount: admin.gridAccount }).limit(2).get()
    const adminUser = (adminResult.data || []).find(item => normalizeText(item.realName) === normalizeText(admin.name))
    await grantSystemAdminAccess(adminUser, now)
    systemAdminMatches.push({ ...admin, matched: !!adminUser })
  }

  await writeAuditLog(user, 'sync_approval_routes', {
    total: results.length,
    matchedSupervisors: results.filter(item => item.supervisorMatched).length,
    matchedDistrictManagers: results.filter(item => item.districtManagerMatched).length,
    matchedDistrictLeaders: results.filter(item => item.districtLeaderMatched).length,
    matchedSystemAdmins: systemAdminMatches.filter(item => item.matched).length,
    districts: results.map(item => item.district)
  })

  return {
    success: true,
    data: {
      total: results.length,
      matchedSupervisors: results.filter(item => item.supervisorMatched).length,
      matchedDistrictManagers: results.filter(item => item.districtManagerMatched).length,
      matchedDistrictLeaders: results.filter(item => item.districtLeaderMatched).length,
      matchedSystemAdmins: systemAdminMatches.filter(item => item.matched).length,
      records: results,
      systemAdmins: systemAdminMatches
    }
  }
}

function normalizeEvidenceFileIDs(fileIDs = []) {
  return [...new Set((Array.isArray(fileIDs) ? fileIDs : [])
    .map(item => String(item || '').trim())
    .filter(item => item.startsWith('cloud://')))]
}

function resolveEvidenceDistrict(access = {}, requestedDistrict = '') {
  const districts = access.managedDistricts || []
  const district = String(requestedDistrict || districts[0] || '').trim()
  if (!district || !districts.includes(district)) {
    throw new Error('只能提交本人管理区县的证明材料')
  }
  return district
}

async function createEvidence(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  const access = await resolveAccess(user)
  if (!access.canUploadEvidence) throw new Error('仅区县主管或区县经理可以上传证明材料')

  const fileIDs = normalizeEvidenceFileIDs(data.fileIDs)
  if (!fileIDs.length) throw new Error('请先选择证明图片')
  if (fileIDs.length > 9) throw new Error('单次最多上传9张证明图片')

  const settlementMonth = String(data.settlementMonth || '').trim()
  if (!/^\d{4}-\d{2}$/.test(settlementMonth)) throw new Error('结算月份格式不正确')
  const district = resolveEvidenceDistrict(access, data.district)
  const now = new Date()
  const evidence = {
    settlementMonth,
    district,
    fileIDs,
    status: 'submitted',
    uploader: buildUserSnapshot(user),
    createTime: now,
    updateTime: now
  }

  let result
  try {
    result = await db.collection(COLLECTIONS.EVIDENCES).add({ data: evidence })
  } catch (error) {
    if (isCollectionNotFoundError(error)) throw new Error('请先创建 line_project_evidences 数据库集合')
    throw error
  }
  await writeAuditLog(user, 'create_evidence', { evidenceId: result._id, settlementMonth, district, imageCount: fileIDs.length })
  return { success: true, data: { evidenceId: result._id } }
}

async function attachEvidenceImageUrls(records = []) {
  const fileIDs = normalizeEvidenceFileIDs(records.reduce((list, item) => list.concat(item.fileIDs || []), []))
  const urlMap = {}
  for (let index = 0; index < fileIDs.length; index += 50) {
    try {
      const result = await cloud.getTempFileURL({ fileList: fileIDs.slice(index, index + 50) })
      ;(result.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
    } catch (error) {
      console.error('生成证明材料临时地址失败:', error)
    }
  }
  return records.map(item => {
    const recordFileIDs = normalizeEvidenceFileIDs(item.fileIDs)
    const imageUrls = recordFileIDs.map(fileID => urlMap[fileID]).filter(Boolean)
    return {
      ...item,
      imageUrls,
      failedImageCount: recordFileIDs.length - imageUrls.length
    }
  })
}

async function listEvidence(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  const access = await resolveAccess(user)
  if (!access.canViewEvidence) throw new Error('当前账号没有查看证明材料的权限')

  const filters = data.filters || {}
  const query = {}
  if (filters.settlementMonth) query.settlementMonth = String(filters.settlementMonth).trim()
  if (filters.district) {
    const district = String(filters.district).trim()
    if (!access.canViewAllEvidence && !access.managedDistricts.includes(district)) {
      throw new Error('当前账号没有查看该区县证明材料的权限')
    }
    query.district = district
  }

  let records = []
  try {
    records = await fetchAllRecords(db.collection(COLLECTIONS.EVIDENCES).where(query))
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
  if (!access.canViewAllEvidence) {
    records = records.filter(item => access.managedDistricts.includes(item.district))
  }
  const visibleRecords = records
    .filter(item => item.status !== 'inactive')
    .sort((left, right) => new Date(right.createTime || 0) - new Date(left.createTime || 0))
  const evidenceRecords = await attachEvidenceImageUrls(visibleRecords)

  return {
    success: true,
    data: {
      canUpload: access.canUploadEvidence,
      canViewAll: access.canViewAllEvidence,
      records: evidenceRecords
        .map(item => ({ ...item, createTimeText: formatDateTime(item.createTime) }))
    }
  }
}

function buildUserSnapshot(user = {}) {
  return {
    openid: user.openid || '',
    role: user.role || '',
    workspaceType: normalizeWorkspaceType(user.workspaceType),
    realName: user.realName || '',
    gridAccount: user.gridAccount || '',
    district: user.district || '',
    lineProjectRoles: Array.isArray(user.lineProjectRoles) ? user.lineProjectRoles : [],
    managedDistricts: Array.isArray(user.managedDistricts) ? user.managedDistricts : []
  }
}

async function writeAuditLog(user, action, details = {}) {
  try {
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      data: {
        action,
        details,
        operator: buildUserSnapshot(user),
        createTime: new Date()
      }
    })
  } catch (error) {
    if (!isCollectionNotFoundError(error)) throw error
  }
}

function isProfileCompleted(user = {}) {
  return !!(
    String(user.realName || '').trim() &&
    String(user.gridAccount || '').trim() &&
    String(user.district || '').trim() &&
    String(user.gridName || '').trim()
  )
}

function toNumber(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) {
    return 0
  }
  return Math.round(number * 100) / 100
}

function toRawNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function getRecordAmount(record = {}) {
  return toNumber(record.importedAmount !== undefined ? record.importedAmount : record.calculatedAmount)
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, '')
    .trim()
}

function createHashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function createFileHash(fileContent) {
  return crypto.createHash('sha256').update(fileContent).digest('hex')
}

function formatMonth(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatDateTime(dateInput) {
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

function isCollectionNotFoundError(error) {
  const message = String((error && error.message) || error || '')
  return (
    message.includes('database collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('ResourceNotFound')
  )
}

function isLineProjectFeedbackRecord(record = {}) {
  return (
    normalizeWorkspaceType(record.workspaceType) === WORKSPACE_TYPES.LINE_PROJECT &&
    String(record.scene || '').trim() === LINE_PROJECT_FEEDBACK_SCENE
  )
}

function isProcessingFeedbackStatus(status) {
  return ['pending', 'processing'].includes(String(status || '').trim())
}

function getEffectiveFeedbackStatus(record = {}) {
  if (record.resolution || record.status === 'resolved') return 'resolved'
  const managerStatus = record.managerReview && record.managerReview.status
  const supervisorStatus = record.supervisorReview && record.supervisorReview.status
  if (managerStatus === 'rejected' || supervisorStatus === 'rejected') return 'rejected'
  if (managerStatus === 'approved' || supervisorStatus === 'approved') return 'approved'
  return ['approved', 'rejected'].includes(record.status) ? record.status : 'pending'
}

function buildMonthConfirmRecord(record = {}) {
  return {
    ...record,
    amount: toNumber(record.amount),
    confirmTimeText: formatDateTime(record.confirmTime || record.createTime)
  }
}

function createWorkOrderParts(rawName) {
  const text = String(rawName || '').trim()
  const parts = text.split('#').map(item => item.trim()).filter(Boolean)
  const workOrderType = parts[0] || ''
  const workOrderSubject = parts[1] || ''
  const workOrderCode = parts[2] || ''
  const workOrderKey = createHashValue([
    normalizeText(workOrderType),
    normalizeText(workOrderSubject),
    normalizeText(workOrderCode)
  ].join('|'))

  return {
    workOrderType,
    workOrderSubject,
    workOrderCode,
    workOrderKey
  }
}

function getCellValue(worksheet, column, rowNo) {
  const cell = worksheet[`${column}${rowNo}`]
  return cell ? cell.v : ''
}

function getActualMaxRow(worksheet, minimumRow = 1) {
  let maxRow = minimumRow
  Object.keys(worksheet || {}).forEach(key => {
    if (key.startsWith('!')) {
      return
    }
    const match = key.match(/(\d+)$/)
    if (match) {
      maxRow = Math.max(maxRow, Number(match[1]))
    }
  })
  return maxRow
}

function isRowEmpty(worksheet, rowNo, moduleConfig = MODULE_CONFIGS[CURRENT_SUBCATEGORY]) {
  const fixedColumns = moduleConfig.fixedFields.map(item => item.sourceColumn)
  const hasBaseValue = fixedColumns.some(column => String(getCellValue(worksheet, column, rowNo) || '').trim())
  if (hasBaseValue) {
    return false
  }

  return moduleConfig.layout !== 'workload' ||
    !ITEM_COLUMN_MAP.some(item => toNumber(getCellValue(worksheet, item.sourceColumn, rowNo)) > 0)
}

function getPriceMap(worksheet, moduleConfig = MODULE_CONFIGS[CURRENT_SUBCATEGORY]) {
  const priceMap = {}
  ITEM_COLUMN_MAP.forEach(item => {
    priceMap[item.itemCode] = toRawNumber(getCellValue(worksheet, item.sourceColumn, moduleConfig.priceRowNo))
  })
  return priceMap
}

function matchHeader(actualHeader, field) {
  const actual = String(actualHeader || '').trim()
  const expected = String(field.header || '').trim()
  if (field.matchMode === 'startsWith') {
    return actual.startsWith(expected)
  }
  return actual === expected
}

function validateWorksheetStructure(worksheet, moduleConfig = MODULE_CONFIGS[CURRENT_SUBCATEGORY]) {
  const issues = []

  moduleConfig.fixedFields.forEach(field => {
    const actualHeader = getCellValue(worksheet, field.sourceColumn, 1)
    if (!matchHeader(actualHeader, field)) {
      issues.push(`${field.sourceColumn}1 表头不符合模板要求`)
    }
  })

  if (moduleConfig.layout !== 'workload') return issues
  ITEM_COLUMN_MAP.forEach(item => {
    const actualItemName = normalizeText(getCellValue(worksheet, item.sourceColumn, 3))
    const actualUnit = normalizeText(getCellValue(worksheet, item.sourceColumn, 4))
    if (actualItemName !== normalizeText(item.itemName)) {
      issues.push(`${item.sourceColumn}3 明细名称不匹配`)
    }
    if (actualUnit !== normalizeText(item.unit)) {
      issues.push(`${item.sourceColumn}4 单位不匹配`)
    }
  })

  return issues
}

function buildWorkloadItems(worksheet, rowNo, priceMap) {
  const items = []
  ITEM_COLUMN_MAP.forEach(item => {
    const qty = toRawNumber(getCellValue(worksheet, item.sourceColumn, rowNo))
    if (qty <= 0) {
      return
    }

    const unitPrice = toRawNumber(priceMap[item.itemCode])
    items.push({
      itemCode: item.itemCode,
      groupName: item.groupName,
      itemName: item.itemName,
      unit: item.unit,
      qty,
      unitPrice,
      amount: toNumber(qty * unitPrice),
      sourceColumn: item.sourceColumn,
      sortOrder: item.sortOrder
    })
  })

  return items.sort((left, right) => left.sortOrder - right.sortOrder)
}

function mergeWorkloadItems(items = []) {
  const map = {}

  items.forEach(item => {
    if (!item || !item.itemCode) {
      return
    }

    if (!map[item.itemCode]) {
      map[item.itemCode] = {
        itemCode: item.itemCode,
        groupName: item.groupName,
        itemName: item.itemName,
        unit: item.unit,
        qty: 0,
        unitPrice: toRawNumber(item.unitPrice),
        amount: 0,
        sourceColumn: item.sourceColumn,
        sortOrder: item.sortOrder
      }
    }

    map[item.itemCode].qty = toNumber(map[item.itemCode].qty + toNumber(item.qty))
    map[item.itemCode].amount = toNumber(map[item.itemCode].amount + toNumber(item.amount))
  })

  return Object.values(map).sort((left, right) => left.sortOrder - right.sortOrder)
}

function summarizeWorkloadItems(items = [], limit = 4) {
  return items
    .slice(0, limit)
    .map(item => `${item.itemName}${item.qty}${item.unit}`)
    .join('、')
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

async function getLatestLineProjectFeedback(openid, settlementMonth) {
  let records = []
  try {
    records = await fetchAllRecords(
      db.collection(COLLECTIONS.FEEDBACKS).where({ 'submitter.openid': openid })
    )
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return null
    }
    throw error
  }

  const matchedRecords = records.filter(record => {
    if (!isLineProjectFeedbackRecord(record)) {
      return false
    }

    return String(record.salaryMonth || '').trim() === settlementMonth
  }).sort((left, right) => new Date(right.createTime || 0).getTime() - new Date(left.createTime || 0).getTime())

  return matchedRecords[0] || null
}

function getActiveBatchNos(records = []) {
  return [...new Set(records.map(record => record.importBatchId).filter(Boolean))].sort()
}

function hasSameBatchVersion(record = {}, activeBatchNos = []) {
  const confirmedBatchNos = Array.isArray(record.importBatchNos)
    ? [...record.importBatchNos].filter(Boolean).sort()
    : []
  return confirmedBatchNos.length === activeBatchNos.length &&
    confirmedBatchNos.every((batchNo, index) => batchNo === activeBatchNos[index])
}

async function getLatestMonthConfirmRecord(openid, settlementMonth, activeBatchNos = []) {
  let records = []
  try {
    records = await fetchAllRecords(
      db.collection(COLLECTIONS.MONTH_CONFIRMS).where({
        'submitter.openid': openid,
        settlementMonth
      })
    )
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      return null
    }
    throw error
  }

  const matchedRecords = records.filter(record => {
    if (record.status !== 'confirmed') {
      return false
    }

    return isLineProjectFeedbackRecord(record) && hasSameBatchVersion(record, activeBatchNos)
  }).sort((left, right) => new Date(right.createTime || 0).getTime() - new Date(left.createTime || 0).getTime())

  return matchedRecords[0] || null
}

async function loadBindingContext() {
  const users = await fetchAllRecords(db.collection(COLLECTIONS.USERS))
  const usersByGridAccount = {}
  users
    .map(normalizeUser)
    .filter(user => user.gridAccount)
    .forEach(user => {
      if (!usersByGridAccount[user.gridAccount]) {
        usersByGridAccount[user.gridAccount] = []
      }
      usersByGridAccount[user.gridAccount].push(user)
    })

  return { usersByGridAccount }
}

function resolveRecordOwner(bindingContext, { gridAccount, personName, district }) {
  const candidates = bindingContext.usersByGridAccount[gridAccount] || []
  if (!candidates.length) {
    return {
      matched: true,
      gridAccount,
      userOpenid: '',
      boundUserId: '',
      bindingStatus: 'pending_claim',
      bindingSource: 'pending_claim'
    }
  }
  if (candidates.length > 1) {
    return { matched: false, message: `网格通账号 ${gridAccount} 对应多个用户，请先清理重复账号` }
  }

  const user = candidates[0]
  if (user.status === 'inactive') {
    return { matched: false, message: `网格通账号 ${gridAccount} 对应用户已停用` }
  }
  if (normalizeText(user.realName) !== normalizeText(personName)) {
    return { matched: false, message: `账号 ${gridAccount} 对应姓名为 ${user.realName}，与模板姓名 ${personName} 不一致` }
  }
  if (normalizeText(user.district) !== normalizeText(district)) {
    return { matched: false, message: `账号 ${gridAccount} 所属区县为 ${user.district}，与模板区县 ${district} 不一致` }
  }
  return {
    matched: true,
    gridAccount,
    userOpenid: user.openid,
    boundUserId: user._id || '',
    bindingStatus: 'bound',
    bindingSource: 'import_match'
  }
}

async function activateImportedUsers(records = [], now = new Date()) {
  const users = new Map()
  records.forEach(record => {
    if (record.userOpenid) {
      users.set(record.userOpenid, record)
    }
  })

  const activated = await Promise.all([...users.entries()].map(async ([openid, record]) => {
    const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get()
    const user = (result.data || [])[0]
    if (!user || user.status === 'inactive') return false
    await db.collection(COLLECTIONS.USERS).doc(user._id).update({
      data: {
        workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
        lineProjectRoles: Array.isArray(user.lineProjectRoles) ? user.lineProjectRoles : [],
        managedDistricts: Array.isArray(user.managedDistricts) ? user.managedDistricts : [],
        lineProjectActivatedBy: 'import',
        lineProjectActivatedBatchNo: record.importBatchId || '',
        updateTime: now
      }
    })
    return true
  }))

  return activated.filter(Boolean).length
}

function buildPreviewRow(record) {
  return {
    previewKey: `${record.subCategory}_${record.sourceRowNo}`,
    rowNo: record.sourceRowNo,
    district: record.district,
    personName: record.personName,
    gridAccount: record.gridAccount,
    bindingStatus: record.bindingStatus,
    subCategory: record.subCategory,
    workOrderNameRaw: record.workOrderNameRaw,
    importedAmount: record.importedAmount,
    calculatedAmount: record.calculatedAmount,
    checkStatus: record.checkStatus,
    workloadSummary: record.workloadSummary || summarizeWorkloadItems(record.workloadItems),
    itemCount: record.workloadItems.length
  }
}

function buildPendingClaimAccounts(records = []) {
  const accountMap = {}
  records.filter(record => record.bindingStatus === 'pending_claim').forEach(record => {
    if (!accountMap[record.gridAccount]) {
      accountMap[record.gridAccount] = {
        gridAccount: record.gridAccount,
        personName: record.personName,
        district: record.district,
        recordCount: 0,
        totalAmount: 0
      }
    }
    accountMap[record.gridAccount].recordCount += 1
    accountMap[record.gridAccount].totalAmount = toNumber(
      accountMap[record.gridAccount].totalAmount + record.importedAmount
    )
  })
  return Object.values(accountMap).sort((left, right) => left.gridAccount.localeCompare(right.gridAccount))
}

function buildBlockingError(rowNo, personName, workOrderNameRaw, messages = [], subCategory = '') {
  return {
    errorKey: `${subCategory || 'template'}_${rowNo}_${createHashValue(messages.join('|')).slice(0, 8)}`,
    subCategory,
    rowNo,
    personName,
    workOrderNameRaw,
    messages
  }
}

function createStandardWorkOrderParts(rawName, subCategory) {
  const text = String(rawName || '').trim()
  const segments = text.split('-').map(item => item.trim()).filter(Boolean)
  const workOrderCodeIndex = segments.findIndex(item => /^\d{6,}$/.test(item))
  const workOrderCode = workOrderCodeIndex >= 0 ? segments[workOrderCodeIndex] : ''
  const subjectEnd = workOrderCodeIndex > 2 ? Math.max(workOrderCodeIndex - 1, 3) : segments.length
  const workOrderSubject = segments.length > 2 ? segments.slice(2, subjectEnd).join('-') || segments[2] : text
  const workOrderIdentity = workOrderCode
    ? `${subCategory}|${normalizeText(workOrderSubject)}|${workOrderCode}`
    : `${subCategory}|${normalizeText(text)}`
  return {
    workOrderType: subCategory,
    workOrderSubject,
    workOrderCode,
    workOrderKey: createHashValue(workOrderIdentity)
  }
}

function parseModuleSheet(worksheet, moduleConfig, context = {}) {
  const { settlementMonth, fileName, bindingContext, fileAccountNames } = context
  const { subCategory, majorCategory, layout } = moduleConfig
  const headerIssues = validateWorksheetStructure(worksheet, moduleConfig)
  const records = []
  const blockingErrors = headerIssues.map(message => buildBlockingError(0, '', '', [`${subCategory}：${message}`], subCategory))
  const warningRows = []
  if (headerIssues.length) return { records, blockingErrors, warningRows }

  const priceMap = layout === 'workload' ? getPriceMap(worksheet, moduleConfig) : {}
  const maxRow = getActualMaxRow(worksheet, moduleConfig.dataStartRowNo)
  const rowKeys = new Set()

  for (let rowNo = moduleConfig.dataStartRowNo; rowNo <= maxRow; rowNo += 1) {
    if (isRowEmpty(worksheet, rowNo, moduleConfig)) continue

    const district = String(getCellValue(worksheet, 'B', rowNo) || '').trim()
    const gridAccount = String(getCellValue(worksheet, 'C', rowNo) || '').trim()
    const personName = String(getCellValue(worksheet, 'D', rowNo) || '').trim()
    const workOrderNameRaw = String(getCellValue(worksheet, layout === 'workload' ? 'E' : 'G', rowNo) || '').trim()
    const businessQtyRaw = layout === 'standard' ? getCellValue(worksheet, 'E', rowNo) : ''
    const businessQty = layout === 'standard' ? toRawNumber(businessQtyRaw) : 0
    const importedAmountRaw = getCellValue(worksheet, 'F', rowNo)
    const importedAmount = toNumber(importedAmountRaw)
    const workloadItems = layout === 'workload' ? buildWorkloadItems(worksheet, rowNo, priceMap) : []
    const calculatedAmount = layout === 'workload'
      ? toNumber(workloadItems.reduce((sum, item) => sum + toRawNumber(item.qty) * toRawNumber(item.unitPrice), 0))
      : importedAmount
    const amountDiff = layout === 'workload' ? toNumber(calculatedAmount - importedAmount) : 0
    const workOrderParts = layout === 'workload'
      ? createWorkOrderParts(workOrderNameRaw)
      : createStandardWorkOrderParts(workOrderNameRaw, subCategory)
    const completionDateText = layout === 'standard' ? String(getCellValue(worksheet, 'H', rowNo) || '').trim() : ''
    const companyCategory = layout === 'standard' ? String(getCellValue(worksheet, 'I', rowNo) || '').trim() : ''
    const siteLevel = layout === 'standard' ? String(getCellValue(worksheet, 'J', rowNo) || '').trim() : ''
    const endpoint = layout === 'standard' ? String(getCellValue(worksheet, 'K', rowNo) || '').trim() : ''
    const workloadSummary = layout === 'workload'
      ? summarizeWorkloadItems(workloadItems)
      : `业务量 ${businessQty}${endpoint ? ` · ${endpoint}` : ''}${siteLevel ? ` · ${siteLevel}` : ''}`
    const fingerprint = layout === 'workload'
      ? workloadItems.map(item => `${item.itemCode}:${item.qty}:${item.unitPrice}`).join('|')
      : `${businessQty}|${completionDateText}|${companyCategory}|${siteLevel}|${endpoint}`
    const rowKey = `${subCategory}|${district}|${gridAccount}|${workOrderParts.workOrderKey}|${importedAmount}|${fingerprint}`
    const messages = []

    if (!district) messages.push('区县不能为空')
    if (!gridAccount) messages.push('网格通账号不能为空')
    if (!personName) messages.push('姓名不能为空')
    if (!workOrderNameRaw) messages.push('工单名称不能为空')
    if (importedAmountRaw === '' || importedAmountRaw === null || importedAmountRaw === undefined || !Number.isFinite(Number(importedAmountRaw))) {
      messages.push('支出金额不能为空且必须为数字')
    }
    if (layout === 'workload' && !workloadItems.length) messages.push('工作量明细不能为空')
    if (layout === 'standard' && (businessQtyRaw === '' || !Number.isFinite(Number(businessQtyRaw)))) {
      messages.push('业务量不能为空且必须为数字')
    }
    if (layout === 'workload' && workOrderParts.workOrderType !== subCategory) {
      messages.push(`工单类型 ${workOrderParts.workOrderType || '未识别'} 与工作表 ${subCategory} 不一致`)
    }
    if (rowKeys.has(rowKey)) messages.push('工作表中存在内容完全相同的重复明细行')
    if (gridAccount) {
      const normalizedName = normalizeText(personName)
      if (fileAccountNames[gridAccount] && fileAccountNames[gridAccount] !== normalizedName) {
        messages.push(`网格通账号 ${gridAccount} 在文件中对应多个姓名`)
      } else {
        fileAccountNames[gridAccount] = normalizedName
      }
    }

    let ownerInfo = null
    if (!messages.length && bindingContext) {
      ownerInfo = resolveRecordOwner(bindingContext, { gridAccount, personName, district })
      if (!ownerInfo.matched) messages.push(ownerInfo.message || '未匹配到网格通账号')
    }
    if (messages.length) {
      blockingErrors.push(buildBlockingError(rowNo, personName, workOrderNameRaw, messages.map(message => `${subCategory}：${message}`), subCategory))
      continue
    }

    const checkStatus = layout !== 'workload' || Math.abs(amountDiff) <= moduleConfig.amountTolerance ? 'matched' : 'mismatch'
    const checkMessage = checkStatus === 'matched' ? '' : `系统重算金额 ${calculatedAmount.toFixed(2)} 与导入工费金额 ${importedAmount.toFixed(2)} 不一致`
    const record = {
      settlementMonth,
      majorCategory,
      subCategory,
      district,
      gridAccount: ownerInfo.gridAccount,
      userOpenid: ownerInfo.userOpenid,
      boundUserId: ownerInfo.boundUserId,
      bindingStatus: ownerInfo.bindingStatus,
      bindingSource: ownerInfo.bindingSource,
      boundTime: null,
      personName,
      personKey: createHashValue(gridAccount),
      businessQty,
      workOrderNameRaw,
      ...workOrderParts,
      completionDateText,
      companyCategory,
      siteLevel,
      endpoint,
      importedAmount,
      calculatedAmount,
      amountDiff,
      checkStatus,
      checkMessage,
      workloadItems,
      workloadSummary,
      sourceSheet: subCategory,
      sourceRowNo: rowNo,
      sourceFileName: fileName
    }
    rowKeys.add(rowKey)
    records.push(record)
    if (checkStatus === 'mismatch') warningRows.push(buildPreviewRow(record))
  }

  return { records, blockingErrors, warningRows }
}

function parseWorkbook(fileContent, options = {}) {
  const { settlementMonth = '', fileName = '', bindingContext = null } = options
  if (!settlementMonth) throw new Error('请选择结算月份')
  const workbook = XLSX.read(fileContent, { type: 'buffer', cellDates: true })
  const missingSheets = SUBCATEGORY_OPTIONS.filter(subCategory => !workbook.Sheets[subCategory])
  if (missingSheets.length) throw new Error(`导入模板缺少工作表：${missingSheets.join('、')}`)

  const fileAccountNames = {}
  const moduleResults = SUBCATEGORY_OPTIONS.map(subCategory => parseModuleSheet(
    workbook.Sheets[subCategory],
    MODULE_CONFIGS[subCategory],
    { settlementMonth, fileName, bindingContext, fileAccountNames }
  ))
  const records = moduleResults.flatMap(item => item.records)
  const blockingErrors = moduleResults.flatMap(item => item.blockingErrors)
  const warningRows = moduleResults.flatMap(item => item.warningRows)
  if (!records.length && !blockingErrors.length) {
    blockingErrors.push(buildBlockingError(0, '', '', ['五个工作表均无可导入数据']))
  }
  const districts = [...new Set(records.map(record => record.district).filter(Boolean))]
  const boundRecords = records.filter(record => record.bindingStatus === 'bound')
  const pendingClaimRecords = records.filter(record => record.bindingStatus === 'pending_claim')
  const pendingClaimAccounts = buildPendingClaimAccounts(records)
  const moduleSummaries = SUBCATEGORY_OPTIONS.map(subCategory => {
    const moduleRecords = records.filter(record => record.subCategory === subCategory)
    const errors = blockingErrors.filter(error => (error.messages || []).some(message => message.startsWith(`${subCategory}：`)))
    const warnings = warningRows.filter(record => record.subCategory === subCategory)
    return {
      subCategory,
      majorCategory: SUBCATEGORY_TO_MAJOR[subCategory],
      successRows: moduleRecords.length,
      errorRows: errors.length,
      warningRows: warnings.length,
      boundRows: moduleRecords.filter(record => record.bindingStatus === 'bound').length,
      pendingClaimRows: moduleRecords.filter(record => record.bindingStatus === 'pending_claim').length,
      importedAmountTotal: toNumber(moduleRecords.reduce((sum, record) => sum + record.importedAmount, 0)),
      businessQtyTotal: toNumber(moduleRecords.reduce((sum, record) => sum + record.businessQty, 0))
    }
  })

  return {
    records,
    previewRows: records.slice(0, 30).map(buildPreviewRow),
    blockingErrors,
    warningRows,
    pendingClaimAccounts,
    validationSummary: { sheetFound: false, totalWorkOrders: 0, matchedCount: 0, mismatchCount: 0, mismatches: [] },
    moduleSummaries,
    summary: {
      settlementMonth,
      majorCategory: CURRENT_MAJOR_CATEGORY,
      subCategory: '全部模块',
      totalRows: records.length + blockingErrors.length,
      successRows: records.length,
      errorRows: blockingErrors.length,
      warningRows: warningRows.length,
      importedAmountTotal: toNumber(records.reduce((sum, record) => sum + record.importedAmount, 0)),
      excelAmountTotal: toNumber(records.reduce((sum, record) => sum + record.importedAmount, 0)),
      calculatedAmountTotal: toNumber(records.reduce((sum, record) => sum + record.calculatedAmount, 0)),
      totalPeople: new Set(records.map(record => record.personKey)).size,
      totalGridAccounts: new Set(records.map(record => record.gridAccount).filter(Boolean)).size,
      boundRows: boundRecords.length,
      pendingClaimRows: pendingClaimRecords.length,
      boundAccounts: new Set(boundRecords.map(record => record.gridAccount)).size,
      pendingClaimAccounts: pendingClaimAccounts.length,
      totalWorkOrders: new Set(records.map(record => record.workOrderKey)).size,
      districts,
      moduleSummaries
    }
  }
}

function buildFileFingerprint(fileHash, settlementMonth, totalRows) {
  return createHashValue(`${settlementMonth}|${fileHash}|${totalRows}`)
}

function buildRecordImportKey(batchNo, record) {
  return createHashValue(`${batchNo}|${record.subCategory}|${record.sourceRowNo}`).slice(0, 32)
}

function isBatchLockActive(batch, now = new Date()) {
  const updatedTime = new Date(batch.updateTime || batch.createTime || 0).getTime()
  return ['preparing', 'processing', 'validating'].includes(batch.status) &&
    now.getTime() - updatedTime < IMPORT_LOCK_TIMEOUT
}

async function getBatchByNo(batchNo) {
  const result = await db.collection(COLLECTIONS.BATCHES).where({ batchNo }).limit(1).get()
  return (result.data || [])[0] || null
}

async function getActiveVersion(settlementMonth) {
  try {
    const result = await db.collection(COLLECTIONS.ACTIVE_VERSIONS).where({ settlementMonth }).limit(1).get()
    return (result.data || [])[0] || null
  } catch (error) {
    if (isCollectionNotFoundError(error)) return null
    throw error
  }
}

async function getActiveVersionMap(settlementMonth = '') {
  try {
    const records = settlementMonth
      ? [await getActiveVersion(settlementMonth)].filter(Boolean)
      : await fetchAllRecords(db.collection(COLLECTIONS.ACTIVE_VERSIONS))
    return records.reduce((map, version) => {
      if (version.settlementMonth && version.activeBatchNo) map[version.settlementMonth] = version.activeBatchNo
      return map
    }, {})
  } catch (error) {
    if (isCollectionNotFoundError(error)) return {}
    throw error
  }
}

async function setActiveVersion(settlementMonth, batchNo, previousBatchNo, user, now = new Date()) {
  const version = await getActiveVersion(settlementMonth)
  const data = {
    settlementMonth,
    activeBatchNo: batchNo,
    previousBatchNo: previousBatchNo || '',
    updatedBy: buildUserSnapshot(user),
    updateTime: now
  }
  if (version) {
    await db.collection(COLLECTIONS.ACTIVE_VERSIONS).doc(version._id).update({ data })
  } else {
    await db.collection(COLLECTIONS.ACTIVE_VERSIONS).add({ data: { ...data, createTime: now } })
  }
}

function buildBatchRecord(user, parseResult, payload = {}) {
  const summary = parseResult.summary || {}
  return {
    batchNo: payload.batchNo,
    settlementMonth: summary.settlementMonth || '',
    majorCategory: summary.majorCategory || CURRENT_MAJOR_CATEGORY,
    subCategory: summary.subCategory || '全部模块',
    sourceFileName: payload.fileName || '',
    fileID: payload.fileID || '',
    totalRows: summary.totalRows || 0,
    successRows: summary.successRows || 0,
    errorRows: summary.errorRows || 0,
    warningRows: summary.warningRows || 0,
    importedAmountTotal: summary.importedAmountTotal || summary.excelAmountTotal || 0,
    excelAmountTotal: summary.importedAmountTotal || summary.excelAmountTotal || 0,
    calculatedAmountTotal: summary.calculatedAmountTotal || 0,
    totalPeople: summary.totalPeople || 0,
    totalGridAccounts: summary.totalGridAccounts || 0,
    boundRows: summary.boundRows || 0,
    pendingClaimRows: summary.pendingClaimRows || 0,
    boundAccounts: summary.boundAccounts || 0,
    pendingClaimAccounts: summary.pendingClaimAccounts || 0,
    totalWorkOrders: summary.totalWorkOrders || 0,
    moduleSummaries: summary.moduleSummaries || [],
    districts: summary.districts || [],
    replacedRows: payload.replacedRows || 0,
    previousBatchNos: payload.previousBatchNos || [],
    previousBatchNo: payload.previousBatchNo || '',
    fileFingerprint: payload.fileFingerprint || '',
    chunkSize: payload.chunkSize || IMPORT_CHUNK_SIZE,
    totalChunks: payload.totalChunks || Math.ceil((summary.successRows || 0) / IMPORT_CHUNK_SIZE),
    completedChunks: payload.completedChunks || [],
    writtenRows: payload.writtenRows || 0,
    validationMismatchCount: parseResult.validationSummary ? parseResult.validationSummary.mismatchCount : 0,
    status: payload.status || 'imported',
    errorSummary: (parseResult.blockingErrors || []).slice(0, 20),
    createdBy: buildUserSnapshot(user),
    createTime: new Date()
  }
}

async function importPreview(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)

  if (!data.fileID) {
    throw new Error('请先上传 Excel 文件')
  }

  const settlementMonth = data.settlementMonth || formatMonth(new Date())
  const downloadResult = await cloud.downloadFile({ fileID: data.fileID })
  const bindingContext = await loadBindingContext()
  const parseResult = parseWorkbook(downloadResult.fileContent, {
    settlementMonth,
    fileName: data.fileName || '',
    user,
    bindingContext
  })

  return {
    success: true,
    data: {
      uploadedFile: {
        fileID: data.fileID,
        fileName: data.fileName || ''
      },
      hasBlockingErrors: parseResult.blockingErrors.length > 0,
      summary: parseResult.summary,
      previewRows: parseResult.previewRows,
      blockingErrors: parseResult.blockingErrors.slice(0, 50),
      warningRows: parseResult.warningRows.slice(0, 50),
      pendingClaimAccounts: parseResult.pendingClaimAccounts,
      moduleSummaries: parseResult.moduleSummaries,
      validationSummary: parseResult.validationSummary
    }
  }
}

async function loadParsedImport(user, data = {}) {
  if (!data.fileID) throw new Error('请先上传 Excel 文件')
  const settlementMonth = data.settlementMonth || formatMonth(new Date())
  const downloadResult = await cloud.downloadFile({ fileID: data.fileID })
  const bindingContext = await loadBindingContext()
  const parseResult = parseWorkbook(downloadResult.fileContent, {
    settlementMonth,
    fileName: data.fileName || '',
    user,
    bindingContext
  })
  if (parseResult.blockingErrors.length) throw new Error('导入存在阻断错误，请重新预解析')
  return {
    settlementMonth,
    parseResult,
    fileHash: createFileHash(downloadResult.fileContent)
  }
}

async function importStart(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)
  const { settlementMonth, parseResult, fileHash } = await loadParsedImport(user, data)
  const now = new Date()
  const fileFingerprint = buildFileFingerprint(fileHash, settlementMonth, parseResult.records.length)
  const monthBatches = await fetchAllRecords(db.collection(COLLECTIONS.BATCHES).where({ settlementMonth }))
  const activeVersion = await getActiveVersion(settlementMonth)
  const reusableStatuses = ['processing', 'validating', 'published']
  const sameFileBatch = sortList(monthBatches, 'createTime', 'desc').find(batch => (
    batch.fileFingerprint === fileFingerprint &&
    reusableStatuses.includes(batch.status) &&
    (batch.status !== 'published' || (activeVersion && activeVersion.activeBatchNo === batch.batchNo))
  ))
  const lockedBatch = monthBatches.find(batch => (
    isBatchLockActive(batch, now) || (
      batch.status === 'validating' &&
      activeVersion &&
      activeVersion.activeBatchNo === batch.batchNo
    )
  ))
  if (lockedBatch && (!sameFileBatch || lockedBatch.batchNo !== sameFileBatch.batchNo)) {
    throw new Error(`结算月份 ${settlementMonth} 正在导入，请继续批次 ${lockedBatch.batchNo}`)
  }
  if (sameFileBatch) {
    if (sameFileBatch.status !== 'published' && sameFileBatch.fileID !== data.fileID) {
      await db.collection(COLLECTIONS.BATCHES).doc(sameFileBatch._id).update({
        data: {
          fileID: data.fileID,
          sourceFileName: data.fileName || sameFileBatch.sourceFileName,
          updateTime: now
        }
      })
    }
    return {
      success: true,
      data: {
        batchNo: sameFileBatch.batchNo,
        status: sameFileBatch.status,
        totalRows: sameFileBatch.totalRows,
        writtenRows: sameFileBatch.writtenRows || 0,
        totalChunks: sameFileBatch.totalChunks,
        completedChunks: sameFileBatch.completedChunks || [],
        summary: parseResult.summary
      }
    }
  }

  const legacyActiveBatch = activeVersion ? null : sortList(
    monthBatches.filter(batch => ['published', 'imported', 'replaced'].includes(batch.status)),
    'createTime',
    'desc'
  )[0]
  const previousBatchNo = activeVersion
    ? activeVersion.activeBatchNo
    : (legacyActiveBatch && legacyActiveBatch.batchNo) || ''
  const batchNo = `jkxl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const batchRecord = buildBatchRecord(user, parseResult, {
    batchNo,
    fileID: data.fileID,
    fileName: data.fileName || '',
    previousBatchNo,
    previousBatchNos: previousBatchNo ? [previousBatchNo] : [],
    fileFingerprint,
    status: 'processing'
  })
  await db.collection(COLLECTIONS.BATCHES).add({ data: { ...batchRecord, updateTime: now } })
  return {
    success: true,
    data: {
      batchNo,
      status: 'processing',
      totalRows: parseResult.records.length,
      writtenRows: 0,
      totalChunks: Math.ceil(parseResult.records.length / IMPORT_CHUNK_SIZE),
      completedChunks: [],
      summary: parseResult.summary
    }
  }
}

async function importWriteChunk(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)
  const batch = await getBatchByNo(String(data.batchNo || '').trim())
  if (!batch) throw new Error('导入批次不存在')
  if (batch.status === 'published') return { success: true, data: { ...batch, alreadyPublished: true } }
  if (batch.status !== 'processing') throw new Error(`当前批次状态 ${batch.status} 不能写入`)
  const chunkIndex = Number(data.chunkIndex)
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= batch.totalChunks) throw new Error('导入分块编号无效')
  const { parseResult, fileHash } = await loadParsedImport(user, {
    fileID: batch.fileID,
    fileName: batch.sourceFileName,
    settlementMonth: batch.settlementMonth
  })
  if (buildFileFingerprint(fileHash, batch.settlementMonth, parseResult.records.length) !== batch.fileFingerprint) {
    throw new Error('导入文件版本与批次不一致')
  }
  const chunkRecords = parseResult.records.slice(chunkIndex * batch.chunkSize, (chunkIndex + 1) * batch.chunkSize)
  const now = new Date()
  const writes = chunkRecords.map(record => {
    const importRecordKey = buildRecordImportKey(batch.batchNo, record)
    return db.collection(COLLECTIONS.RECORDS).doc(importRecordKey).set({
      data: {
        ...record,
        importBatchId: batch.batchNo,
        importRecordKey,
        publishStatus: 'versioned',
        boundTime: record.bindingStatus === 'bound' ? now : null,
        createdBy: batch.createdBy,
        createTime: now,
        updateTime: now
      }
    })
  })
  await Promise.all(writes)
  const completedChunks = [...new Set([...(batch.completedChunks || []), chunkIndex])].sort((a, b) => a - b)
  const writtenRows = Math.min(batch.totalRows, completedChunks.reduce((sum, index) => (
    sum + Math.min(batch.chunkSize, batch.totalRows - index * batch.chunkSize)
  ), 0))
  await db.collection(COLLECTIONS.BATCHES).doc(batch._id).update({
    data: { status: 'processing', completedChunks, writtenRows, updateTime: now }
  })
  return { success: true, data: { batchNo: batch.batchNo, chunkIndex, completedChunks, writtenRows, totalRows: batch.totalRows } }
}

async function importFinalize(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)
  const batch = await getBatchByNo(String(data.batchNo || '').trim())
  if (!batch) throw new Error('导入批次不存在')
  if (batch.status === 'published') return { success: true, data: { batchNo: batch.batchNo, summary: batch, alreadyPublished: true } }
  if (!['processing', 'validating'].includes(batch.status)) throw new Error(`当前批次状态 ${batch.status} 不能发布`)
  const records = await fetchAllRecords(db.collection(COLLECTIONS.RECORDS).where({ importBatchId: batch.batchNo }))
  const uniqueKeys = new Set(records.map(record => record.importRecordKey))
  if (records.length !== batch.totalRows || uniqueKeys.size !== batch.totalRows) {
    throw new Error(`导入数据尚未完整：已写入 ${uniqueKeys.size}/${batch.totalRows} 行`)
  }
  const amountTotal = toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0))
  if (Math.abs(amountTotal - toNumber(batch.importedAmountTotal)) > 0.01) throw new Error('导入金额校验失败')
  const activeVersion = await getActiveVersion(batch.settlementMonth)
  let currentActiveBatchNo = activeVersion ? activeVersion.activeBatchNo : ''
  if (!activeVersion) {
    const monthBatches = await fetchAllRecords(db.collection(COLLECTIONS.BATCHES).where({
      settlementMonth: batch.settlementMonth
    }))
    const legacyActiveBatch = sortList(monthBatches.filter(item => (
      item.batchNo !== batch.batchNo && ['published', 'imported', 'replaced'].includes(item.status)
    )), 'createTime', 'desc')[0]
    currentActiveBatchNo = (legacyActiveBatch && legacyActiveBatch.batchNo) || ''
  }
  if (currentActiveBatchNo !== batch.batchNo && currentActiveBatchNo !== (batch.previousBatchNo || '')) {
    throw new Error('当前月份已有更新版本发布，请重新选择文件开始导入')
  }
  const now = new Date()
  if (batch.status !== 'validating') {
    await db.collection(COLLECTIONS.BATCHES).doc(batch._id).update({
      data: { status: 'validating', updateTime: now }
    })
  }
  const activatedUsers = await activateImportedUsers(records, now)
  await setActiveVersion(batch.settlementMonth, batch.batchNo, batch.previousBatchNo, user, now)
  await db.collection(COLLECTIONS.BATCHES).doc(batch._id).update({
    data: { status: 'published', publishedTime: now, writtenRows: records.length, updateTime: now }
  })
  try {
    await writeAuditLog(user, 'publish_import_batch', {
      batchNo: batch.batchNo,
      settlementMonth: batch.settlementMonth,
      importedRows: records.length,
      importedAmountTotal: amountTotal,
      previousBatchNo: batch.previousBatchNo || '',
      activatedUsers
    })
  } catch (error) {
    console.error('导入批次已发布，审计日志写入失败:', error)
  }
  return { success: true, data: { batchNo: batch.batchNo, summary: { ...batch, successRows: records.length, importedAmountTotal: amountTotal } } }
}

async function rollbackImportBatch(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)
  const batchNo = String(data.batchNo || '').trim()
  if (!batchNo) throw new Error('缺少导入批次号')

  const batchResult = await db.collection(COLLECTIONS.BATCHES).where({ batchNo }).limit(1).get()
  const batch = (batchResult.data || [])[0]
  if (!batch) throw new Error('导入批次不存在')
  if (batch.status !== 'published') throw new Error('仅当前已发布批次可以回滚')

  const now = new Date()
  const activeVersion = await getActiveVersion(batch.settlementMonth)
  if (!activeVersion || activeVersion.activeBatchNo !== batchNo) throw new Error('仅当前生效批次可以回滚')
  const previousBatchNo = batch.previousBatchNo || ''
  if (!previousBatchNo) throw new Error('当前批次没有可恢复的上一版本')
  const previousBatch = await getBatchByNo(previousBatchNo)
  if (!previousBatch) throw new Error('上一版本批次不存在')
  await setActiveVersion(batch.settlementMonth, previousBatchNo, previousBatch.previousBatchNo || '', user, now)

  await db.collection(COLLECTIONS.BATCHES).doc(batch._id).update({
    data: {
      status: 'rolled_back',
      rolledBackBy: buildUserSnapshot(user),
      rolledBackTime: now
    }
  })
  await writeAuditLog(user, 'rollback_import_batch', {
    batchNo,
    restoredBatchNo: previousBatchNo
  })
  return {
    success: true,
    data: { batchNo, restoredBatchNo: previousBatchNo }
  }
}

function buildFilterQuery(filters = {}) {
  const query = {}

  if (filters.settlementMonth) {
    query.settlementMonth = filters.settlementMonth
  }
  if (filters.majorCategory) {
    query.majorCategory = filters.majorCategory
  }
  if (filters.subCategory && filters.subCategory !== '全部模块') {
    query.subCategory = filters.subCategory
  }
  if (filters.district) {
    query.district = filters.district
  }
  if (filters.gridAccount) {
    query.gridAccount = filters.gridAccount
  }

  return query
}

function buildRoleScopeCondition(user = {}, access = {}) {
  if (access.canViewAll || access.isSystemAdmin) {
    return null
  }
  if (access.managedDistricts && access.managedDistricts.length) {
    return { district: _.in(access.managedDistricts) }
  }
  if (user.openid && user.gridAccount) {
    return _.or([{ userOpenid: user.openid }, { gridAccount: user.gridAccount }])
  }
  if (user.openid) {
    return { userOpenid: user.openid }
  }

  return { _id: '__no_grid_account_scope__' }
}

function buildSelfScopeCondition(user = {}) {
  if (user.openid && user.gridAccount) {
    return _.or([{ userOpenid: user.openid }, { gridAccount: user.gridAccount }])
  }
  if (user.openid) {
    return { userOpenid: user.openid }
  }
  return { _id: '__no_user_scope__' }
}

function combineConditions(conditions = []) {
  const validConditions = conditions.filter(item => item && Object.keys(item).length > 0)
  if (!validConditions.length) {
    return null
  }
  if (validConditions.length === 1) {
    return validConditions[0]
  }
  return _.and(validConditions)
}

function buildScopedRecordQuery(user, filters = {}, scopeMode = 'role', access = {}) {
  const scopeCondition = scopeMode === 'self'
    ? buildSelfScopeCondition(user)
    : buildRoleScopeCondition(user, access)
  const filterCondition = buildFilterQuery(filters)
  const condition = combineConditions([scopeCondition, filterCondition])

  if (condition) {
    return db.collection(COLLECTIONS.RECORDS).where(condition)
  }
  return db.collection(COLLECTIONS.RECORDS)
}

function matchesKeyword(record, keyword) {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) {
    return true
  }

  const searchFields = [
    record.subCategory,
    record.personName,
    record.gridAccount,
    record.workOrderNameRaw,
    record.workOrderSubject,
    record.workOrderCode,
    record.district,
    record.siteLevel,
    record.endpoint
  ]

  return searchFields.some(field => String(field || '').toLowerCase().includes(text))
}

function filterRecords(records = [], filters = {}) {
  return records.filter(record => {
    if (['superseded', 'rolled_back', 'staged'].includes(record.publishStatus)) {
      return false
    }
    if (filters.personKey && record.personKey !== filters.personKey) {
      return false
    }
    if (filters.workOrderKey && record.workOrderKey !== filters.workOrderKey) {
      return false
    }
    if (filters.personName && record.personName !== filters.personName) {
      return false
    }
    return matchesKeyword(record, filters.keyword)
  })
}

function getFilterOptions(records = []) {
  return {
    settlementMonths: [...new Set(records.map(record => record.settlementMonth).filter(Boolean))].sort().reverse(),
    districts: [...new Set(records.map(record => record.district).filter(Boolean))].sort(),
    subCategories: SUBCATEGORY_OPTIONS
  }
}

function aggregateByPerson(records = []) {
  const map = {}

  records.forEach(record => {
    if (!map[record.personKey]) {
      map[record.personKey] = {
        personKey: record.personKey,
        personName: record.personName,
        gridAccount: record.gridAccount,
        totalAmount: 0,
        recordCount: 0,
        workOrderKeys: new Set(),
        districts: new Set(),
        businessQtyTotal: 0,
        warningCount: 0
      }
    }

    const current = map[record.personKey]
    current.totalAmount = toNumber(current.totalAmount + getRecordAmount(record))
    current.recordCount += 1
    current.workOrderKeys.add(record.workOrderKey)
    current.districts.add(record.district)
    current.businessQtyTotal = toNumber(current.businessQtyTotal + toNumber(record.businessQty))
    if (record.checkStatus === 'mismatch') {
      current.warningCount += 1
    }
  })

  return Object.values(map).map(item => ({
    personKey: item.personKey,
    personName: item.personName,
    gridAccount: item.gridAccount,
    totalAmount: toNumber(item.totalAmount),
    recordCount: item.recordCount,
    workOrderCount: item.workOrderKeys.size,
    districts: [...item.districts].filter(Boolean),
    businessQtyTotal: item.businessQtyTotal,
    warningCount: item.warningCount
  }))
}

function aggregateByWorkOrder(records = []) {
  const map = {}

  records.forEach(record => {
    if (!map[record.workOrderKey]) {
      map[record.workOrderKey] = {
        workOrderKey: record.workOrderKey,
        subCategory: record.subCategory,
        workOrderNameRaw: record.workOrderNameRaw,
        workOrderType: record.workOrderType,
        workOrderSubject: record.workOrderSubject,
        workOrderCode: record.workOrderCode,
        district: record.district,
        totalAmount: 0,
        recordCount: 0,
        participants: new Set(),
        districts: new Set(),
        warningCount: 0,
        businessQtyTotal: 0,
        workloadItems: []
      }
    }

    const current = map[record.workOrderKey]
    current.totalAmount = toNumber(current.totalAmount + getRecordAmount(record))
    current.recordCount += 1
    current.participants.add(record.personName)
    current.districts.add(record.district)
    current.businessQtyTotal = toNumber(current.businessQtyTotal + toNumber(record.businessQty))
    current.workloadItems.push(...(record.workloadItems || []))
    if (record.checkStatus === 'mismatch') {
      current.warningCount += 1
    }
  })

  return Object.values(map).map(item => {
    const mergedItems = mergeWorkloadItems(item.workloadItems)
    return {
      workOrderKey: item.workOrderKey,
      workOrderNameRaw: item.workOrderNameRaw,
      workOrderType: item.workOrderType,
      workOrderSubject: item.workOrderSubject,
      workOrderCode: item.workOrderCode,
      district: item.district,
      subCategory: item.subCategory,
      totalAmount: toNumber(item.totalAmount),
      recordCount: item.recordCount,
      participantCount: item.participants.size,
      participants: [...item.participants].filter(Boolean),
      districts: [...item.districts].filter(Boolean),
      warningCount: item.warningCount,
      businessQtyTotal: item.businessQtyTotal,
      workloadItems: mergedItems,
      workloadSummary: summarizeWorkloadItems(mergedItems, 4)
    }
  })
}

function sortList(records = [], sortBy = 'totalAmount', sortOrder = 'desc') {
  const factor = sortOrder === 'asc' ? 1 : -1
  return [...records].sort((left, right) => {
    const leftValue = left[sortBy]
    const rightValue = right[sortBy]

    if (typeof leftValue === 'number' || typeof rightValue === 'number') {
      return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * factor
    }

    return String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-CN') * factor
  })
}

function paginate(records = [], page = 1, pageSize = 20) {
  const currentPage = Math.max(Number(page) || 1, 1)
  const currentPageSize = Math.max(Number(pageSize) || 20, 1)
  const start = (currentPage - 1) * currentPageSize

  return {
    page: currentPage,
    pageSize: currentPageSize,
    total: records.length,
    totalPages: Math.ceil(records.length / currentPageSize) || 1,
    records: records.slice(start, start + currentPageSize)
  }
}

function buildDashboardStats(records = []) {
  const workOrders = aggregateByWorkOrder(records)
  const people = aggregateByPerson(records)
  const totalAmount = toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0))
  const totalBusinessQty = toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0))

  return {
    totalRecords: records.length,
    totalWorkOrders: workOrders.length,
    totalPeople: people.length,
    totalAmount,
    totalBusinessQty,
    averagePersonAmount: people.length ? toNumber(totalAmount / people.length) : 0,
    averageWorkOrderAmount: workOrders.length ? toNumber(totalAmount / workOrders.length) : 0,
    mismatchCount: records.filter(record => record.checkStatus === 'mismatch').length,
    personTopList: sortList(people, 'totalAmount', 'desc').slice(0, 10),
    workOrderTopList: sortList(workOrders, 'totalAmount', 'desc').slice(0, 10)
  }
}

function buildDashboardBreakdowns(records = []) {
  const moduleComposition = SUBCATEGORY_OPTIONS.map(subCategory => {
    const moduleRecords = records.filter(record => record.subCategory === subCategory)
    return {
      subCategory,
      amount: toNumber(moduleRecords.reduce((sum, record) => sum + getRecordAmount(record), 0)),
      recordCount: moduleRecords.length
    }
  })
  const districts = {}
  records.forEach(record => {
    const district = record.district || '未配置区县'
    if (!districts[district]) {
      districts[district] = { district, amount: 0, recordCount: 0, workOrders: new Set(), people: new Set() }
    }
    const current = districts[district]
    current.amount = toNumber(current.amount + getRecordAmount(record))
    current.recordCount += 1
    current.workOrders.add(record.workOrderKey)
    current.people.add(record.personKey)
  })
  const districtComposition = Object.values(districts).map(item => ({
    district: item.district,
    amount: item.amount,
    recordCount: item.recordCount,
    workOrderCount: item.workOrders.size,
    peopleCount: item.people.size
  })).sort((left, right) => right.amount - left.amount)
  return { moduleComposition, districtComposition }
}

async function getScopedRecords(wxContext, filters = {}, scopeMode = 'role') {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  const access = await resolveAccess(user)
  const activeVersionMap = await getActiveVersionMap(filters.settlementMonth)
  const rawRecords = await fetchAllRecords(buildScopedRecordQuery(user, filters, scopeMode, access))
  const versionRecords = rawRecords.filter(record => {
    const activeBatchNo = activeVersionMap[record.settlementMonth]
    return activeBatchNo
      ? record.importBatchId === activeBatchNo
      : record.publishStatus !== 'versioned'
  })
  return {
    user,
    access,
    records: filterRecords(versionRecords, filters)
  }
}

function buildEmptyOverview(settlementMonth = '') {
  return {
    summary: {
      settlementMonth,
      totalAmount: 0,
      totalWorkOrders: 0,
      totalRecords: 0,
      businessQtyTotal: 0,
      composition: SUBCATEGORY_OPTIONS.map(subCategory => ({ subCategory, amount: 0 }))
    },
    categories: SUBCATEGORY_OPTIONS.map(subCategory => ({
        subCategory,
        totalAmount: 0,
        workOrderCount: 0,
        recordCount: 0,
        businessQtyTotal: 0,
        workloadItems: [],
        workloadSummary: ''
      }))
  }
}

async function getMyOverview(wxContext, data = {}) {
  const filters = {
    settlementMonth: (data.filters && data.filters.settlementMonth) || data.settlementMonth || formatMonth(new Date()),
    subCategory: data.filters ? data.filters.subCategory : data.subCategory
  }
  const { user, records } = await getScopedRecords(wxContext, filters, 'self')
  const overview = buildEmptyOverview(filters.settlementMonth)

  if (!records.length) {
    return {
      success: true,
      data: {
        ...overview,
        user: buildUserSnapshot(user)
      }
    }
  }

  const totalAmount = toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0))
  overview.summary.totalAmount = totalAmount
  overview.summary.totalWorkOrders = new Set(records.map(record => record.workOrderKey)).size
  overview.summary.totalRecords = records.length
  overview.summary.businessQtyTotal = toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0))
  overview.summary.composition = SUBCATEGORY_OPTIONS.map(subCategory => ({
    subCategory,
    amount: toNumber(records.filter(record => record.subCategory === subCategory)
      .reduce((sum, record) => sum + getRecordAmount(record), 0))
  }))
  overview.categories = SUBCATEGORY_OPTIONS.map(subCategory => {
    const categoryRecords = records.filter(record => record.subCategory === subCategory)
    const workloadItems = mergeWorkloadItems(categoryRecords.flatMap(record => record.workloadItems || []))
    return {
      subCategory,
      totalAmount: toNumber(categoryRecords.reduce((sum, record) => sum + getRecordAmount(record), 0)),
      workOrderCount: new Set(categoryRecords.map(record => record.workOrderKey)).size,
      recordCount: categoryRecords.length,
      businessQtyTotal: toNumber(categoryRecords.reduce((sum, record) => sum + toNumber(record.businessQty), 0)),
      workloadItems,
      workloadSummary: summarizeWorkloadItems(workloadItems, 6)
    }
  })

  return {
    success: true,
    data: {
      ...overview,
      user: buildUserSnapshot(user)
    }
  }
}

async function listMyWorkOrders(wxContext, data = {}) {
  const filters = {
    settlementMonth: (data.filters && data.filters.settlementMonth) || data.settlementMonth || formatMonth(new Date()),
    subCategory: data.filters ? data.filters.subCategory : data.subCategory,
    keyword: data.filters ? data.filters.keyword : data.keyword
  }
  const page = data.page || 1
  const pageSize = data.pageSize || 20
  const { records } = await getScopedRecords(wxContext, filters, 'self')
  const aggregated = sortList(aggregateByWorkOrder(records), 'totalAmount', 'desc')
  const paged = paginate(aggregated, page, pageSize)

  return {
    success: true,
    data: {
      records: paged.records,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages
    }
  }
}

async function getMyWorkOrderDetail(wxContext, data = {}) {
  if (!data.workOrderKey) {
    throw new Error('缺少工单标识')
  }

  const filters = {
    settlementMonth: (data.filters && data.filters.settlementMonth) || data.settlementMonth || formatMonth(new Date()),
    subCategory: data.filters ? data.filters.subCategory : data.subCategory,
    workOrderKey: data.workOrderKey
  }
  const { records } = await getScopedRecords(wxContext, filters, 'self')

  if (!records.length) {
    throw new Error('未找到该工单明细')
  }

  const firstRecord = records[0]
  const mergedItems = mergeWorkloadItems(records.flatMap(record => record.workloadItems || []))

  return {
    success: true,
    data: {
      summary: {
        workOrderKey: firstRecord.workOrderKey,
        workOrderNameRaw: firstRecord.workOrderNameRaw,
        workOrderSubject: firstRecord.workOrderSubject,
        workOrderCode: firstRecord.workOrderCode,
        district: firstRecord.district,
        subCategory: firstRecord.subCategory,
        businessQtyTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0)),
        completionDateText: firstRecord.completionDateText || '',
        companyCategory: firstRecord.companyCategory || '',
        siteLevel: firstRecord.siteLevel || '',
        endpoint: firstRecord.endpoint || '',
        totalAmount: toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0)),
        recordCount: records.length
      },
      workloadItems: mergedItems
    }
  }
}

async function getMonthConfirmStatus(wxContext, data = {}) {
  const settlementMonth = (data.settlementMonth || (data.filters && data.filters.settlementMonth) || formatMonth(new Date())).trim()
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)

  if (!isProfileCompleted(user)) {
    return {
      success: true,
      data: {
        profileCompleted: false,
        record: null
      }
    }
  }

  const { records } = await getScopedRecords(wxContext, {
    settlementMonth
  }, 'self')
  const activeBatchNos = getActiveBatchNos(records)
  const record = await getLatestMonthConfirmRecord(user.openid, settlementMonth, activeBatchNos)

  return {
    success: true,
    data: {
      profileCompleted: true,
      hasPublishedData: records.length > 0,
      record: record ? buildMonthConfirmRecord(record) : null
    }
  }
}

async function confirmMonth(wxContext, data = {}) {
  const settlementMonth = (data.settlementMonth || (data.filters && data.filters.settlementMonth) || formatMonth(new Date())).trim()
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)

  if (!isProfileCompleted(user)) {
    throw new Error('请先完善个人信息后再签字确认')
  }

  const { records } = await getScopedRecords(wxContext, {
    settlementMonth
  }, 'self')

  if (!records.length) {
    throw new Error('当前月份暂无已发布的本人数据，不能签字确认')
  }

  const importBatchNos = getActiveBatchNos(records)
  const existingRecord = await getLatestMonthConfirmRecord(user.openid, settlementMonth, importBatchNos)
  if (existingRecord) {
    throw new Error('当前数据版本已完成签字确认')
  }

  const latestFeedback = await getLatestLineProjectFeedback(user.openid, settlementMonth)
  if (latestFeedback && isProcessingFeedbackStatus(getEffectiveFeedbackStatus(latestFeedback))) {
    throw new Error('当前月份存在待处理反馈，暂不能签字确认')
  }

  const amount = toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0))
  const now = new Date()
  const confirmRecord = {
    workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
    scene: LINE_PROJECT_FEEDBACK_SCENE,
    gridAccount: user.gridAccount,
    district: user.district,
    gridName: user.gridName || '',
    settlementMonth,
    importBatchNos,
    amount,
    status: 'confirmed',
    confirmType: 'electronic',
    submitter: buildUserSnapshot(user),
    confirmTime: now,
    createTime: now,
    updateTime: now
  }

  let result
  try {
    result = await db.collection(COLLECTIONS.MONTH_CONFIRMS).add({
      data: confirmRecord
    })
  } catch (error) {
    if (isCollectionNotFoundError(error)) {
      throw new Error('请先在云数据库创建 line_project_month_confirms 集合')
    }
    throw error
  }

  return {
    success: true,
    data: {
      confirmId: result._id,
      record: buildMonthConfirmRecord({
        ...confirmRecord,
        _id: result._id
      })
    }
  }
}

async function getDashboard(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {})
  }
  const { access, records } = await getScopedRecords(wxContext, filters, 'role')
  if (!access.canManage) throw new Error('当前账号没有管理看板权限')
  const stats = buildDashboardStats(records)
  const breakdowns = buildDashboardBreakdowns(records)

  return {
    success: true,
    data: {
      stats: {
        totalRecords: stats.totalRecords,
        totalWorkOrders: stats.totalWorkOrders,
        totalPeople: stats.totalPeople,
        totalAmount: stats.totalAmount,
        totalBusinessQty: stats.totalBusinessQty,
        averagePersonAmount: stats.averagePersonAmount,
        averageWorkOrderAmount: stats.averageWorkOrderAmount,
        mismatchCount: stats.mismatchCount
      },
      moduleComposition: breakdowns.moduleComposition,
      districtComposition: breakdowns.districtComposition,
      personTopList: stats.personTopList,
      workOrderTopList: stats.workOrderTopList,
      filterOptions: getFilterOptions(records)
    }
  }
}

async function listByPerson(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {})
  }
  const page = data.page || 1
  const pageSize = data.pageSize || 20
  const sortBy = data.sortBy || 'totalAmount'
  const sortOrder = data.sortOrder || 'desc'
  const { access, records } = await getScopedRecords(wxContext, filters, 'role')
  if (!access.canManage) throw new Error('当前账号没有按人员查询权限')
  const aggregated = sortList(aggregateByPerson(records), sortBy, sortOrder)
  const paged = paginate(aggregated, page, pageSize)

  return {
    success: true,
    data: {
      records: paged.records,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages,
      filterOptions: getFilterOptions(records)
    }
  }
}

async function getPersonDetail(wxContext, data = {}) {
  if (!data.personKey) {
    throw new Error('缺少人员标识')
  }

  const filters = {
    ...(data.filters || {}),
    personKey: data.personKey
  }
  const { access, records } = await getScopedRecords(wxContext, filters, 'role')
  if (!access.canManage) throw new Error('当前账号没有人员明细权限')
  if (!records.length) {
    throw new Error('未找到该人员明细')
  }

  const workOrders = sortList(aggregateByWorkOrder(records), 'totalAmount', 'desc')
  const firstRecord = records[0]

  return {
    success: true,
    data: {
      summary: {
        personKey: firstRecord.personKey,
        personName: firstRecord.personName,
        gridAccount: firstRecord.gridAccount,
        totalAmount: toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0)),
        workOrderCount: new Set(records.map(record => record.workOrderKey)).size,
        recordCount: records.length
      },
      workOrders
    }
  }
}

async function listByWorkOrder(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {})
  }
  const page = data.page || 1
  const pageSize = data.pageSize || 20
  const sortBy = data.sortBy || 'totalAmount'
  const sortOrder = data.sortOrder || 'desc'
  const { access, records } = await getScopedRecords(wxContext, filters, 'role')
  if (!access.canManage) throw new Error('当前账号没有按工单查询权限')
  const aggregated = sortList(aggregateByWorkOrder(records), sortBy, sortOrder)
  const paged = paginate(aggregated, page, pageSize)

  return {
    success: true,
    data: {
      records: paged.records,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages,
      filterOptions: getFilterOptions(records)
    }
  }
}

async function getWorkOrderDetail(wxContext, data = {}) {
  if (!data.workOrderKey) {
    throw new Error('缺少工单标识')
  }

  const filters = {
    ...(data.filters || {}),
    workOrderKey: data.workOrderKey
  }
  const { access, records } = await getScopedRecords(wxContext, filters, 'role')
  if (!access.canManage) throw new Error('当前账号没有工单明细权限')
  if (!records.length) {
    throw new Error('未找到该工单明细')
  }

  const personMap = {}
  records.forEach(record => {
    if (!personMap[record.personKey]) {
      personMap[record.personKey] = {
        personKey: record.personKey,
        personName: record.personName,
        gridAccount: record.gridAccount,
        amount: 0,
        businessQty: 0,
        endpoint: record.endpoint || '',
        siteLevel: record.siteLevel || '',
        workloadItems: []
      }
    }

    personMap[record.personKey].amount = toNumber(personMap[record.personKey].amount + getRecordAmount(record))
    personMap[record.personKey].businessQty = toNumber(personMap[record.personKey].businessQty + toNumber(record.businessQty))
    personMap[record.personKey].workloadItems.push(...(record.workloadItems || []))
  })

  const participants = sortList(Object.values(personMap).map(item => ({
    ...item,
    workloadItems: mergeWorkloadItems(item.workloadItems)
  })), 'amount', 'desc')
  const firstRecord = records[0]
  const totalAmount = toNumber(records.reduce((sum, record) => sum + getRecordAmount(record), 0))

  return {
    success: true,
    data: {
      summary: {
        workOrderKey: firstRecord.workOrderKey,
        workOrderNameRaw: firstRecord.workOrderNameRaw,
        workOrderSubject: firstRecord.workOrderSubject,
        workOrderCode: firstRecord.workOrderCode,
        district: firstRecord.district,
        subCategory: firstRecord.subCategory,
        businessQtyTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0)),
        completionDateText: firstRecord.completionDateText || '',
        companyCategory: firstRecord.companyCategory || '',
        siteLevel: firstRecord.siteLevel || '',
        endpoint: firstRecord.endpoint || '',
        totalAmount,
        participantCount: new Set(records.map(record => record.personKey)).size
      },
      participants: participants.map(item => ({
        ...item,
        amountPercent: totalAmount > 0 ? toNumber(item.amount / totalAmount * 100) : 0
      }))
    }
  }
}

async function getImportBatches(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureImportRole(user)

  const filters = data.filters || {}
  const activeVersionMap = await getActiveVersionMap(filters.settlementMonth)
  let batches = await fetchAllRecords(db.collection(COLLECTIONS.BATCHES))

  if (filters.settlementMonth) {
    batches = batches.filter(item => item.settlementMonth === filters.settlementMonth)
  }
  if (user.role === 'district_manager' && user.district) {
    batches = batches.filter(item => Array.isArray(item.districts) && item.districts.includes(user.district))
  }

  batches = sortList(batches, 'createTime', 'desc')

  return {
    success: true,
    data: {
      records: batches.map(item => ({
        ...item,
        isActive: activeVersionMap[item.settlementMonth] === item.batchNo,
        createTimeText: formatDateTime(item.createTime)
      }))
    }
  }
}

function buildWorkOrderExportRows(records = []) {
  return aggregateByWorkOrder(records).map(item => ({
    结算月份: records[0] ? records[0].settlementMonth : '',
    模块: item.subCategory,
    工单名称: item.workOrderNameRaw,
    区县: item.district || item.districts.join('、'),
    参与人数: item.participantCount,
    业务量: item.businessQtyTotal,
    工单工费: item.totalAmount,
    工作量摘要: item.workloadSummary
  }))
}

function buildRawExportRows(records = []) {
  return records.map(record => ({
    结算月份: record.settlementMonth,
    模块: record.subCategory,
    区县: record.district,
    网格通账号: record.gridAccount,
    姓名: record.personName,
    工单名称: record.workOrderNameRaw,
    业务量: record.businessQty,
    完成日期: record.completionDateText,
    公司分类: record.companyCategory,
    站点级别: record.siteLevel,
    端别: record.endpoint,
    导入工费金额: getRecordAmount(record),
    系统重算金额: record.calculatedAmount,
    差异: record.amountDiff,
    工作量明细: (record.workloadItems || []).map(item => `${item.itemName}${item.qty}${item.unit}`).join('；')
  }))
}

async function exportData(wxContext, data = {}) {
  const filters = { ...(data.filters || {}) }
  const scopeMode = data.scopeMode === 'self' ? 'self' : 'role'
  const { access, records } = await getScopedRecords(wxContext, filters, scopeMode)
  if (scopeMode !== 'self' && !access.canManage) {
    throw new Error('当前账号没有管理数据导出权限')
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildWorkOrderExportRows(records)), '工单汇总')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildRawExportRows(records)), '人员明细')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const monthPart = filters.settlementMonth || formatMonth(new Date())

  return {
    success: true,
    data: {
      base64: buffer.toString('base64'),
      filename: `集客线路_${filters.subCategory || '全部模块'}_${monthPart}.xlsx`,
      total: records.length
    }
  }
}

module.exports.__test__ = {
  createWorkOrderParts,
  mergeWorkloadItems,
  aggregateByPerson,
  aggregateByWorkOrder,
  parseWorkbook,
  resolveRecordOwner,
  getRecordAmount,
  isSystemAdmin,
  canImportLineProject,
  hasSameBatchVersion,
  buildFileFingerprint,
  buildRecordImportKey,
  isBatchLockActive,
  createFileHash,
  buildDashboardBreakdowns,
  normalizeEvidenceFileIDs,
  resolveEvidenceDistrict,
  getEffectiveFeedbackStatus
}
