const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const XLSX = require('xlsx')
const {
  CURRENT_MAJOR_CATEGORY,
  CURRENT_SUBCATEGORY,
  FIXED_FIELD_COLUMNS,
  ITEM_COLUMN_MAP,
  TEMPLATE_META
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
  BINDINGS: 'user_person_bindings',
  FEEDBACKS: 'salary_feedbacks',
  MONTH_CONFIRMS: 'line_project_month_confirms'
}

const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}

const MANAGER_ROLES = ['district_manager', 'sales_department']
const MAX_QUERY_LIMIT = 100
const SUMMARY_SUBCATEGORIES = [
  '集客开通',
  '集客维护',
  '集客计次',
  '杆路维护',
  '抢修配置'
]
const LINE_PROJECT_FEEDBACK_SCENE = 'line_project_workorders'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event

  try {
    switch (action) {
      case 'importPreview':
        return await importPreview(wxContext, data)
      case 'importCommit':
        return await importCommit(wxContext, data)
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
      error: error.message || '集客开通模块执行失败'
    }
  }
}

async function ensureUser(openid) {
  const result = await db.collection(COLLECTIONS.USERS).where({ openid }).limit(1).get()
  if (!result.data.length) {
    throw new Error('用户不存在')
  }
  return normalizeUser(result.data[0])
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

function ensureLineProjectWorkspace(user = {}) {
  if (normalizeWorkspaceType(user.workspaceType) !== WORKSPACE_TYPES.LINE_PROJECT) {
    throw new Error('当前账号未开通集客线路项目工作台')
  }
}

function ensureManagerRole(user = {}) {
  if (!MANAGER_ROLES.includes(user.role)) {
    throw new Error('当前角色没有导入权限')
  }
}

function buildUserSnapshot(user = {}) {
  return {
    openid: user.openid || '',
    role: user.role || '',
    workspaceType: normalizeWorkspaceType(user.workspaceType),
    realName: user.realName || '',
    gridAccount: user.gridAccount || '',
    district: user.district || ''
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

function maskIdCard(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}****${text.slice(-2)}`
  }
  return `${text.slice(0, 6)}********${text.slice(-4)}`
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

function getActualMaxRow(worksheet) {
  let maxRow = TEMPLATE_META.dataStartRowNo
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

function isRowEmpty(worksheet, rowNo) {
  const fixedColumns = FIXED_FIELD_COLUMNS.map(item => item.sourceColumn)
  const hasBaseValue = fixedColumns.some(column => String(getCellValue(worksheet, column, rowNo) || '').trim())
  if (hasBaseValue) {
    return false
  }

  return !ITEM_COLUMN_MAP.some(item => toNumber(getCellValue(worksheet, item.sourceColumn, rowNo)) > 0)
}

function getPriceMap(worksheet) {
  const priceMap = {}
  ITEM_COLUMN_MAP.forEach(item => {
    priceMap[item.itemCode] = toNumber(getCellValue(worksheet, item.sourceColumn, TEMPLATE_META.priceRowNo))
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

function validateWorksheetStructure(worksheet) {
  const issues = []

  FIXED_FIELD_COLUMNS.forEach(field => {
    const actualHeader = getCellValue(worksheet, field.sourceColumn, 1)
    if (!matchHeader(actualHeader, field)) {
      issues.push(`${field.sourceColumn}1 表头不符合模板要求`)
    }
  })

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
    const qty = toNumber(getCellValue(worksheet, item.sourceColumn, rowNo))
    if (qty <= 0) {
      return
    }

    const unitPrice = toNumber(priceMap[item.itemCode])
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
        unitPrice: toNumber(item.unitPrice),
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

function findValidationSheet(workbook) {
  for (const sheetName of TEMPLATE_META.validationSheetNames) {
    if (workbook.Sheets[sheetName]) {
      return workbook.Sheets[sheetName]
    }
  }
  return null
}

function parseValidationSheet(workbook, expectedRecords = []) {
  const validationSheet = findValidationSheet(workbook)
  if (!validationSheet) {
    return {
      sheetFound: false,
      totalWorkOrders: 0,
      matchedCount: 0,
      mismatchCount: 0,
      mismatches: []
    }
  }

  const actualMap = {}
  const maxRow = getActualMaxRow(validationSheet)

  for (let rowNo = TEMPLATE_META.dataStartRowNo; rowNo <= maxRow; rowNo += 1) {
    if (isRowEmpty(validationSheet, rowNo)) {
      continue
    }

    const workOrderNameRaw = String(getCellValue(validationSheet, 'G', rowNo) || '').trim()
    if (!workOrderNameRaw) {
      continue
    }

    const parts = createWorkOrderParts(workOrderNameRaw)
    if (!actualMap[parts.workOrderKey]) {
      actualMap[parts.workOrderKey] = {
        workOrderNameRaw,
        amount: 0,
        participants: new Set()
      }
    }

    actualMap[parts.workOrderKey].amount = toNumber(
      actualMap[parts.workOrderKey].amount
      + toNumber(getCellValue(validationSheet, 'H', rowNo) || getCellValue(validationSheet, 'F', rowNo))
    )
    actualMap[parts.workOrderKey].participants.add(String(getCellValue(validationSheet, 'D', rowNo) || '').trim())
  }

  const expectedMap = {}
  expectedRecords.forEach(record => {
    if (!expectedMap[record.workOrderKey]) {
      expectedMap[record.workOrderKey] = {
        workOrderNameRaw: record.workOrderNameRaw,
        amount: 0,
        participants: new Set()
      }
    }

    expectedMap[record.workOrderKey].amount = toNumber(
      expectedMap[record.workOrderKey].amount + toNumber(record.calculatedAmount)
    )
    expectedMap[record.workOrderKey].participants.add(record.personName)
  })

  const allKeys = [...new Set([...Object.keys(expectedMap), ...Object.keys(actualMap)])]
  const mismatches = []
  let matchedCount = 0

  allKeys.forEach(workOrderKey => {
    const expected = expectedMap[workOrderKey]
    const actual = actualMap[workOrderKey]
    const messages = []

    if (!expected) {
      messages.push('按线路页存在该工单，但按人员页没有对应记录')
    }
    if (!actual) {
      messages.push('按人员页存在该工单，但按线路页没有对应记录')
    }

    const expectedAmount = expected ? expected.amount : 0
    const actualAmount = actual ? actual.amount : 0
    if (Math.abs(expectedAmount - actualAmount) > TEMPLATE_META.amountTolerance) {
      messages.push(`工单总金额不一致：按人员 ${expectedAmount.toFixed(2)}，按线路 ${actualAmount.toFixed(2)}`)
    }

    const expectedParticipants = expected ? [...expected.participants].filter(Boolean).sort() : []
    const actualParticipants = actual ? [...actual.participants].filter(Boolean).sort() : []
    if (expectedParticipants.join('|') !== actualParticipants.join('|')) {
      messages.push('参与人员名单不一致')
    }

    if (messages.length) {
      mismatches.push({
        workOrderKey,
        workOrderNameRaw: (expected && expected.workOrderNameRaw) || (actual && actual.workOrderNameRaw) || '',
        messages
      })
    } else {
      matchedCount += 1
    }
  })

  return {
    sheetFound: true,
    totalWorkOrders: allKeys.length,
    matchedCount,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 20)
  }
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

async function getLatestMonthConfirmRecord(openid, settlementMonth) {
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

    return isLineProjectFeedbackRecord(record)
  }).sort((left, right) => new Date(right.createTime || 0).getTime() - new Date(left.createTime || 0).getTime())

  return matchedRecords[0] || null
}

async function loadBindingContext() {
  const [bindings, users] = await Promise.all([
    fetchAllRecords(db.collection(COLLECTIONS.BINDINGS)),
    fetchAllRecords(db.collection(COLLECTIONS.USERS).where({
      workspaceType: WORKSPACE_TYPES.LINE_PROJECT
    }))
  ])

  const bindingsByPersonKey = {}
  bindings.forEach(binding => {
    if (binding && binding.personKey && binding.status !== 'inactive') {
      bindingsByPersonKey[binding.personKey] = binding
    }
  })

  const usersByName = {}
  users
    .map(normalizeUser)
    .filter(user => user.status !== 'inactive' && user.realName && user.gridAccount)
    .forEach(user => {
      const nameKey = normalizeText(user.realName)
      if (!usersByName[nameKey]) {
        usersByName[nameKey] = []
      }
      usersByName[nameKey].push(user)
    })

  return {
    bindingsByPersonKey,
    usersByName,
    pendingBindings: {}
  }
}

function buildPendingBinding(bindingContext, payload = {}) {
  if (!payload.personKey || !payload.gridAccount) {
    return
  }

  bindingContext.pendingBindings[payload.personKey] = {
    userOpenid: payload.userOpenid || '',
    gridAccount: payload.gridAccount || '',
    personKey: payload.personKey,
    personName: payload.personName || '',
    personIdCardHash: payload.personIdCardHash || '',
    district: payload.district || '',
    status: 'active',
    bindingSource: payload.bindingSource || 'auto_user_match'
  }
}

function pickMatchedUser(candidates = [], district = '') {
  if (!candidates.length) {
    return {
      user: null,
      error: '未找到已配置集客线路界面的用户，请先维护用户资料'
    }
  }

  const normalizedDistrict = normalizeText(district)
  if (normalizedDistrict) {
    const districtMatches = candidates.filter(user => normalizeText(user.district) === normalizedDistrict)
    if (districtMatches.length === 1) {
      return {
        user: districtMatches[0],
        matchType: 'real_name_and_district'
      }
    }
    if (districtMatches.length > 1) {
      return {
        user: null,
        error: `区县 ${district} 下存在多个同名账号，请先建立人员绑定`
      }
    }
  }

  if (candidates.length === 1) {
    return {
      user: candidates[0],
      matchType: 'real_name'
    }
  }

  return {
    user: null,
    error: `存在多个同名账号，请先建立人员绑定：${candidates.map(item => `${item.realName}/${item.gridAccount}`).join('、')}`
  }
}

function resolveRecordOwner(bindingContext, { personKey, personName, personIdCardHash, district }) {
  const boundRecord = bindingContext.bindingsByPersonKey[personKey]
  if (boundRecord && boundRecord.gridAccount) {
    return {
      matched: true,
      gridAccount: boundRecord.gridAccount,
      userOpenid: boundRecord.userOpenid || '',
      bindingSource: boundRecord.bindingSource || 'person_binding'
    }
  }

  const candidates = bindingContext.usersByName[normalizeText(personName)] || []
  const picked = pickMatchedUser(candidates, district)
  if (!picked.user) {
    return {
      matched: false,
      message: picked.error
    }
  }

  buildPendingBinding(bindingContext, {
    personKey,
    personName,
    personIdCardHash,
    district,
    userOpenid: picked.user.openid,
    gridAccount: picked.user.gridAccount,
    bindingSource: picked.matchType
  })

  bindingContext.bindingsByPersonKey[personKey] = {
    personKey,
    personName,
    personIdCardHash,
    district,
    userOpenid: picked.user.openid,
    gridAccount: picked.user.gridAccount,
    status: 'active',
    bindingSource: picked.matchType
  }

  return {
    matched: true,
    gridAccount: picked.user.gridAccount,
    userOpenid: picked.user.openid,
    bindingSource: picked.matchType
  }
}

function buildPreviewRow(record) {
  return {
    rowNo: record.sourceRowNo,
    district: record.district,
    personName: record.personName,
    gridAccount: record.gridAccount,
    workOrderNameRaw: record.workOrderNameRaw,
    calculatedAmount: record.calculatedAmount,
    excelFormulaAmount: record.excelFormulaAmount,
    checkStatus: record.checkStatus,
    workloadSummary: summarizeWorkloadItems(record.workloadItems),
    itemCount: record.workloadItems.length
  }
}

function buildBlockingError(rowNo, personName, workOrderNameRaw, messages = []) {
  return {
    rowNo,
    personName,
    workOrderNameRaw,
    messages
  }
}

function parseWorkbook(fileContent, options = {}) {
  const {
    settlementMonth = '',
    fileName = '',
    user = null,
    bindingContext = null
  } = options

  if (!settlementMonth) {
    throw new Error('请选择结算月份')
  }

  const workbook = XLSX.read(fileContent, {
    type: 'buffer',
    cellDates: true
  })

  const worksheet = workbook.Sheets[TEMPLATE_META.mainSheetName]
  if (!worksheet) {
    throw new Error(`未找到工作表：${TEMPLATE_META.mainSheetName}`)
  }

  const headerIssues = validateWorksheetStructure(worksheet)
  if (headerIssues.length) {
    return {
      records: [],
      previewRows: [],
      blockingErrors: headerIssues.map(message => buildBlockingError(0, '', '', [message])),
      warningRows: [],
      validationSummary: {
        sheetFound: !!findValidationSheet(workbook),
        totalWorkOrders: 0,
        matchedCount: 0,
        mismatchCount: 0,
        mismatches: []
      },
      summary: {
        settlementMonth,
        majorCategory: CURRENT_MAJOR_CATEGORY,
        subCategory: CURRENT_SUBCATEGORY,
        totalRows: 0,
        successRows: 0,
        errorRows: headerIssues.length,
        warningRows: 0,
        excelAmountTotal: 0,
        calculatedAmountTotal: 0,
        totalPeople: 0,
        totalWorkOrders: 0,
        totalGridAccounts: 0,
        districts: []
      }
    }
  }

  const priceMap = getPriceMap(worksheet)
  const maxRow = getActualMaxRow(worksheet)
  const records = []
  const blockingErrors = []
  const warningRows = []

  for (let rowNo = TEMPLATE_META.dataStartRowNo; rowNo <= maxRow; rowNo += 1) {
    if (isRowEmpty(worksheet, rowNo)) {
      continue
    }

    const district = String(getCellValue(worksheet, 'B', rowNo) || '').trim()
    const personIdCard = String(getCellValue(worksheet, 'C', rowNo) || '').trim()
    const personName = String(getCellValue(worksheet, 'D', rowNo) || '').trim()
    const businessQty = toNumber(getCellValue(worksheet, 'E', rowNo))
    const excelAmount = toNumber(getCellValue(worksheet, 'F', rowNo))
    const workOrderNameRaw = String(getCellValue(worksheet, 'G', rowNo) || '').trim()
    const excelFormulaAmount = toNumber(getCellValue(worksheet, 'H', rowNo))
    const workloadItems = buildWorkloadItems(worksheet, rowNo, priceMap)
    const calculatedAmount = toNumber(workloadItems.reduce((sum, item) => sum + toNumber(item.amount), 0))
    const amountDiff = toNumber(calculatedAmount - excelFormulaAmount)
    const workOrderParts = createWorkOrderParts(workOrderNameRaw)
    const personIdCardHash = createHashValue(personIdCard)
    const personKey = createHashValue(`${normalizeText(personName)}|${personIdCardHash}`)
    const messages = []

    if (!district) messages.push('区县不能为空')
    if (!personIdCard) messages.push('身份证号不能为空')
    if (!personName) messages.push('姓名不能为空')
    if (!workOrderNameRaw) messages.push('工单名称不能为空')
    if (!businessQty) messages.push('业务量不能为空或为 0')
    if (!workloadItems.length) messages.push('工作量明细不能为空')
    if (!workOrderParts.workOrderType) messages.push('工单类型解析失败')
    if (workOrderParts.workOrderType && workOrderParts.workOrderType !== CURRENT_SUBCATEGORY) {
      messages.push(`工单类型 ${workOrderParts.workOrderType} 与当前模块 ${CURRENT_SUBCATEGORY} 不一致`)
    }
    if (user && user.role === 'district_manager' && user.district && district !== user.district) {
      messages.push(`当前区县主管仅可导入 ${user.district} 的数据`)
    }

    let ownerInfo = null
    if (!messages.length && bindingContext) {
      ownerInfo = resolveRecordOwner(bindingContext, {
        personKey,
        personName,
        personIdCardHash,
        district
      })
      if (!ownerInfo.matched) {
        messages.push(ownerInfo.message || '未匹配到网格通账号')
      }
    }

    if (messages.length) {
      blockingErrors.push(buildBlockingError(rowNo, personName, workOrderNameRaw, messages))
      continue
    }

    const checkStatus = Math.abs(amountDiff) <= TEMPLATE_META.amountTolerance ? 'matched' : 'mismatch'
    const checkMessage = checkStatus === 'matched'
      ? ''
      : `系统重算金额 ${calculatedAmount.toFixed(2)} 与表内公式金额 ${excelFormulaAmount.toFixed(2)} 不一致`

    const record = {
      settlementMonth,
      majorCategory: CURRENT_MAJOR_CATEGORY,
      subCategory: CURRENT_SUBCATEGORY,
      district,
      gridAccount: ownerInfo.gridAccount,
      userOpenid: ownerInfo.userOpenid,
      bindingSource: ownerInfo.bindingSource,
      personName,
      personKey,
      personIdCardHash,
      personIdCardMasked: maskIdCard(personIdCard),
      businessQty,
      workOrderNameRaw,
      workOrderType: workOrderParts.workOrderType,
      workOrderSubject: workOrderParts.workOrderSubject,
      workOrderCode: workOrderParts.workOrderCode,
      workOrderKey: workOrderParts.workOrderKey,
      excelAmount,
      excelFormulaAmount,
      calculatedAmount,
      amountDiff,
      checkStatus,
      checkMessage,
      workloadItems,
      sourceSheet: TEMPLATE_META.mainSheetName,
      sourceRowNo: rowNo,
      sourceFileName: fileName
    }

    records.push(record)

    if (checkStatus === 'mismatch') {
      warningRows.push({
        rowNo,
        personName,
        gridAccount: record.gridAccount,
        workOrderNameRaw,
        excelFormulaAmount,
        calculatedAmount,
        amountDiff
      })
    }
  }

  const validationSummary = parseValidationSheet(workbook, records)
  const districts = [...new Set(records.map(record => record.district).filter(Boolean))]
  const totalPeople = new Set(records.map(record => record.personKey)).size
  const totalGridAccounts = new Set(records.map(record => record.gridAccount).filter(Boolean)).size
  const totalWorkOrders = new Set(records.map(record => record.workOrderKey)).size

  return {
    records,
    previewRows: records.slice(0, 20).map(buildPreviewRow),
    blockingErrors,
    warningRows,
    validationSummary,
    summary: {
      settlementMonth,
      majorCategory: CURRENT_MAJOR_CATEGORY,
      subCategory: CURRENT_SUBCATEGORY,
      totalRows: records.length + blockingErrors.length,
      successRows: records.length,
      errorRows: blockingErrors.length,
      warningRows: warningRows.length,
      excelAmountTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.excelFormulaAmount), 0)),
      calculatedAmountTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0)),
      totalPeople,
      totalGridAccounts,
      totalWorkOrders,
      districts
    }
  }
}

async function upsertBindings(bindings = []) {
  const now = new Date()

  for (const binding of bindings) {
    const result = await db.collection(COLLECTIONS.BINDINGS).where({
      personKey: binding.personKey
    }).limit(1).get()

    const payload = {
      userOpenid: binding.userOpenid || '',
      gridAccount: binding.gridAccount || '',
      personKey: binding.personKey,
      personName: binding.personName || '',
      personIdCardHash: binding.personIdCardHash || '',
      district: binding.district || '',
      bindingSource: binding.bindingSource || 'auto_user_match',
      status: 'active',
      updateTime: now
    }

    if (result.data.length) {
      await db.collection(COLLECTIONS.BINDINGS).doc(result.data[0]._id).update({
        data: payload
      })
    } else {
      await db.collection(COLLECTIONS.BINDINGS).add({
        data: {
          ...payload,
          createTime: now
        }
      })
    }
  }
}

function chunkArray(items = [], size = 20) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function removeExistingScopeRecords(scope = {}) {
  if (!scope.settlementMonth || !scope.subCategory || !scope.districts || !scope.districts.length) {
    return 0
  }

  const existing = await fetchAllRecords(
    db.collection(COLLECTIONS.RECORDS).where({
      settlementMonth: scope.settlementMonth,
      subCategory: scope.subCategory,
      district: _.in(scope.districts)
    })
  )
  const ids = existing.map(item => item._id).filter(Boolean)
  if (!ids.length) {
    return 0
  }

  let removedCount = 0
  for (const chunk of chunkArray(ids, 20)) {
    await db.collection(COLLECTIONS.RECORDS).where({
      _id: _.in(chunk)
    }).remove()
    removedCount += chunk.length
  }

  return removedCount
}

function buildBatchRecord(user, parseResult, payload = {}) {
  const summary = parseResult.summary || {}
  return {
    batchNo: payload.batchNo,
    settlementMonth: summary.settlementMonth || '',
    majorCategory: summary.majorCategory || CURRENT_MAJOR_CATEGORY,
    subCategory: summary.subCategory || CURRENT_SUBCATEGORY,
    sourceFileName: payload.fileName || '',
    fileID: payload.fileID || '',
    totalRows: summary.totalRows || 0,
    successRows: summary.successRows || 0,
    errorRows: summary.errorRows || 0,
    warningRows: summary.warningRows || 0,
    excelAmountTotal: summary.excelAmountTotal || 0,
    calculatedAmountTotal: summary.calculatedAmountTotal || 0,
    totalPeople: summary.totalPeople || 0,
    totalGridAccounts: summary.totalGridAccounts || 0,
    totalWorkOrders: summary.totalWorkOrders || 0,
    districts: summary.districts || [],
    replacedRows: payload.replacedRows || 0,
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
  ensureManagerRole(user)

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
      validationSummary: parseResult.validationSummary
    }
  }
}

async function importCommit(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureManagerRole(user)

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

  if (parseResult.blockingErrors.length) {
    return {
      success: false,
      error: '导入存在阻断错误，请先处理后再提交',
      data: {
        summary: parseResult.summary,
        blockingErrors: parseResult.blockingErrors.slice(0, 50)
      }
    }
  }

  const now = new Date()
  const batchNo = `jkkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const importedDistricts = [...new Set(parseResult.records.map(record => record.district).filter(Boolean))]
  const replacedRows = await removeExistingScopeRecords({
    settlementMonth,
    subCategory: CURRENT_SUBCATEGORY,
    districts: importedDistricts
  })

  for (const record of parseResult.records) {
    await db.collection(COLLECTIONS.RECORDS).add({
      data: {
        ...record,
        importBatchId: batchNo,
        createdBy: buildUserSnapshot(user),
        createTime: now,
        updateTime: now
      }
    })
  }

  await upsertBindings(Object.values(bindingContext.pendingBindings))

  const batchRecord = buildBatchRecord(user, parseResult, {
    batchNo,
    fileID: data.fileID,
    fileName: data.fileName || '',
    replacedRows,
    status: replacedRows > 0 ? 'replaced' : 'imported'
  })

  await db.collection(COLLECTIONS.BATCHES).add({
    data: batchRecord
  })

  return {
    success: true,
    data: {
      batchNo,
      summary: {
        ...parseResult.summary,
        replacedRows
      },
      warningRows: parseResult.warningRows.slice(0, 50),
      validationSummary: parseResult.validationSummary
    }
  }
}

function buildFilterQuery(filters = {}) {
  const query = {
    subCategory: CURRENT_SUBCATEGORY
  }

  if (filters.settlementMonth) {
    query.settlementMonth = filters.settlementMonth
  }
  if (filters.majorCategory) {
    query.majorCategory = filters.majorCategory
  }
  if (filters.subCategory) {
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

function buildRoleScopeCondition(user = {}) {
  if (user.role === 'sales_department') {
    return null
  }

  if (user.role === 'district_manager') {
    return user.district ? { district: user.district } : { _id: '__no_district_scope__' }
  }

  if (user.gridAccount) {
    return { gridAccount: user.gridAccount }
  }

  return { _id: '__no_grid_account_scope__' }
}

function buildSelfScopeCondition(user = {}) {
  if (!user.gridAccount) {
    return { _id: '__no_grid_account_scope__' }
  }
  return { gridAccount: user.gridAccount }
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

function buildScopedRecordQuery(user, filters = {}, scopeMode = 'role') {
  const scopeCondition = scopeMode === 'self'
    ? buildSelfScopeCondition(user)
    : buildRoleScopeCondition(user)
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
    record.personName,
    record.gridAccount,
    record.workOrderNameRaw,
    record.workOrderSubject,
    record.workOrderCode,
    record.district
  ]

  return searchFields.some(field => String(field || '').toLowerCase().includes(text))
}

function filterRecords(records = [], filters = {}) {
  return records.filter(record => {
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
    districts: [...new Set(records.map(record => record.district).filter(Boolean))].sort()
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
        personIdCardMasked: record.personIdCardMasked,
        totalAmount: 0,
        businessQtyTotal: 0,
        recordCount: 0,
        workOrderKeys: new Set(),
        districts: new Set(),
        warningCount: 0
      }
    }

    const current = map[record.personKey]
    current.totalAmount = toNumber(current.totalAmount + toNumber(record.calculatedAmount))
    current.businessQtyTotal = toNumber(current.businessQtyTotal + toNumber(record.businessQty))
    current.recordCount += 1
    current.workOrderKeys.add(record.workOrderKey)
    current.districts.add(record.district)
    if (record.checkStatus === 'mismatch') {
      current.warningCount += 1
    }
  })

  return Object.values(map).map(item => ({
    personKey: item.personKey,
    personName: item.personName,
    gridAccount: item.gridAccount,
    personIdCardMasked: item.personIdCardMasked,
    totalAmount: toNumber(item.totalAmount),
    businessQtyTotal: toNumber(item.businessQtyTotal),
    recordCount: item.recordCount,
    workOrderCount: item.workOrderKeys.size,
    districts: [...item.districts].filter(Boolean),
    warningCount: item.warningCount
  }))
}

function aggregateByWorkOrder(records = []) {
  const map = {}

  records.forEach(record => {
    if (!map[record.workOrderKey]) {
      map[record.workOrderKey] = {
        workOrderKey: record.workOrderKey,
        workOrderNameRaw: record.workOrderNameRaw,
        workOrderType: record.workOrderType,
        workOrderSubject: record.workOrderSubject,
        workOrderCode: record.workOrderCode,
        district: record.district,
        totalAmount: 0,
        businessQtyTotal: 0,
        recordCount: 0,
        participants: new Set(),
        districts: new Set(),
        warningCount: 0,
        workloadItems: []
      }
    }

    const current = map[record.workOrderKey]
    current.totalAmount = toNumber(current.totalAmount + toNumber(record.calculatedAmount))
    current.businessQtyTotal = toNumber(current.businessQtyTotal + toNumber(record.businessQty))
    current.recordCount += 1
    current.participants.add(record.personName)
    current.districts.add(record.district)
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
      totalAmount: toNumber(item.totalAmount),
      businessQtyTotal: toNumber(item.businessQtyTotal),
      recordCount: item.recordCount,
      participantCount: item.participants.size,
      participants: [...item.participants].filter(Boolean),
      districts: [...item.districts].filter(Boolean),
      warningCount: item.warningCount,
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
  const totalAmount = toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0))

  return {
    totalRecords: records.length,
    totalWorkOrders: workOrders.length,
    totalPeople: people.length,
    totalAmount,
    averagePersonAmount: people.length ? toNumber(totalAmount / people.length) : 0,
    averageWorkOrderAmount: workOrders.length ? toNumber(totalAmount / workOrders.length) : 0,
    mismatchCount: records.filter(record => record.checkStatus === 'mismatch').length,
    personTopList: sortList(people, 'totalAmount', 'desc').slice(0, 10),
    workOrderTopList: sortList(workOrders, 'totalAmount', 'desc').slice(0, 10)
  }
}

async function getScopedRecords(wxContext, filters = {}, scopeMode = 'role') {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  const rawRecords = await fetchAllRecords(buildScopedRecordQuery(user, filters, scopeMode))
  return {
    user,
    records: filterRecords(rawRecords, filters)
  }
}

function buildEmptyOverview(settlementMonth = '') {
  return {
    summary: {
      settlementMonth,
      totalAmount: 0,
      totalWorkOrders: 0,
      totalRecords: 0,
      composition: SUMMARY_SUBCATEGORIES.map(subCategory => ({
        subCategory,
        amount: 0
      }))
    },
    categories: [
      {
        subCategory: CURRENT_SUBCATEGORY,
        totalAmount: 0,
        workOrderCount: 0,
        recordCount: 0,
        workloadItems: [],
        workloadSummary: ''
      }
    ]
  }
}

async function getMyOverview(wxContext, data = {}) {
  const filters = {
    settlementMonth: (data.filters && data.filters.settlementMonth) || data.settlementMonth || formatMonth(new Date()),
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
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

  const totalAmount = toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0))
  const mergedItems = mergeWorkloadItems(records.flatMap(record => record.workloadItems || []))
  overview.summary.totalAmount = totalAmount
  overview.summary.totalWorkOrders = new Set(records.map(record => record.workOrderKey)).size
  overview.summary.totalRecords = records.length
  overview.summary.composition = SUMMARY_SUBCATEGORIES.map(subCategory => ({
    subCategory,
    amount: subCategory === CURRENT_SUBCATEGORY ? totalAmount : 0
  }))
  overview.categories = [
    {
      subCategory: CURRENT_SUBCATEGORY,
      totalAmount,
      workOrderCount: overview.summary.totalWorkOrders,
      recordCount: records.length,
      workloadItems: mergedItems,
      workloadSummary: summarizeWorkloadItems(mergedItems, 6)
    }
  ]

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
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY,
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
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY,
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
        totalAmount: toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0)),
        businessQtyTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0)),
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

  const record = await getLatestMonthConfirmRecord(user.openid, settlementMonth)

  return {
    success: true,
    data: {
      profileCompleted: true,
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

  const existingRecord = await getLatestMonthConfirmRecord(user.openid, settlementMonth)
  if (existingRecord) {
    throw new Error('当前月份已完成签字确认')
  }

  const latestFeedback = await getLatestLineProjectFeedback(user.openid, settlementMonth)
  if (latestFeedback && isProcessingFeedbackStatus(latestFeedback.status)) {
    throw new Error('当前月份存在待处理反馈，暂不能签字确认')
  }

  const { records } = await getScopedRecords(wxContext, {
    settlementMonth,
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
  }, 'self')

  const amount = toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0))
  const now = new Date()
  const confirmRecord = {
    workspaceType: WORKSPACE_TYPES.LINE_PROJECT,
    scene: LINE_PROJECT_FEEDBACK_SCENE,
    gridAccount: user.gridAccount,
    district: user.district,
    gridName: user.gridName || '',
    settlementMonth,
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
    ...(data.filters || {}),
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
  }
  const { records } = await getScopedRecords(wxContext, filters, 'role')
  const stats = buildDashboardStats(records)

  return {
    success: true,
    data: {
      stats: {
        totalRecords: stats.totalRecords,
        totalWorkOrders: stats.totalWorkOrders,
        totalPeople: stats.totalPeople,
        totalAmount: stats.totalAmount,
        averagePersonAmount: stats.averagePersonAmount,
        averageWorkOrderAmount: stats.averageWorkOrderAmount,
        mismatchCount: stats.mismatchCount
      },
      personTopList: stats.personTopList,
      workOrderTopList: stats.workOrderTopList,
      filterOptions: getFilterOptions(records)
    }
  }
}

async function listByPerson(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {}),
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
  }
  const page = data.page || 1
  const pageSize = data.pageSize || 20
  const sortBy = data.sortBy || 'totalAmount'
  const sortOrder = data.sortOrder || 'desc'
  const { records } = await getScopedRecords(wxContext, filters, 'role')
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
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY,
    personKey: data.personKey
  }
  const { records } = await getScopedRecords(wxContext, filters, 'role')
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
        personIdCardMasked: firstRecord.personIdCardMasked,
        totalAmount: toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0)),
        workOrderCount: new Set(records.map(record => record.workOrderKey)).size,
        businessQtyTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0))
      },
      workOrders
    }
  }
}

async function listByWorkOrder(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {}),
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
  }
  const page = data.page || 1
  const pageSize = data.pageSize || 20
  const sortBy = data.sortBy || 'totalAmount'
  const sortOrder = data.sortOrder || 'desc'
  const { records } = await getScopedRecords(wxContext, filters, 'role')
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
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY,
    workOrderKey: data.workOrderKey
  }
  const { records } = await getScopedRecords(wxContext, filters, 'role')
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
        businessQtyTotal: 0,
        workloadItems: []
      }
    }

    personMap[record.personKey].amount = toNumber(personMap[record.personKey].amount + toNumber(record.calculatedAmount))
    personMap[record.personKey].businessQtyTotal = toNumber(personMap[record.personKey].businessQtyTotal + toNumber(record.businessQty))
    personMap[record.personKey].workloadItems.push(...(record.workloadItems || []))
  })

  const participants = sortList(Object.values(personMap).map(item => ({
    ...item,
    workloadItems: mergeWorkloadItems(item.workloadItems)
  })), 'amount', 'desc')
  const firstRecord = records[0]

  return {
    success: true,
    data: {
      summary: {
        workOrderKey: firstRecord.workOrderKey,
        workOrderNameRaw: firstRecord.workOrderNameRaw,
        workOrderSubject: firstRecord.workOrderSubject,
        workOrderCode: firstRecord.workOrderCode,
        district: firstRecord.district,
        totalAmount: toNumber(records.reduce((sum, record) => sum + toNumber(record.calculatedAmount), 0)),
        businessQtyTotal: toNumber(records.reduce((sum, record) => sum + toNumber(record.businessQty), 0)),
        participantCount: new Set(records.map(record => record.personKey)).size
      },
      participants
    }
  }
}

async function getImportBatches(wxContext, data = {}) {
  const user = await ensureUser(wxContext.OPENID)
  ensureLineProjectWorkspace(user)
  ensureManagerRole(user)

  const filters = data.filters || {}
  let batches = await fetchAllRecords(
    db.collection(COLLECTIONS.BATCHES).where({
      subCategory: CURRENT_SUBCATEGORY
    })
  )

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
        createTimeText: formatDateTime(item.createTime)
      }))
    }
  }
}

function buildWorkOrderExportRows(records = []) {
  return aggregateByWorkOrder(records).map(item => ({
    结算月份: records[0] ? records[0].settlementMonth : '',
    工单名称: item.workOrderNameRaw,
    区县: item.district || item.districts.join('、'),
    参与人数: item.participantCount,
    工作量合计: item.businessQtyTotal,
    工单酬金: item.totalAmount,
    工作量摘要: item.workloadSummary
  }))
}

function buildRawExportRows(records = []) {
  return records.map(record => ({
    结算月份: record.settlementMonth,
    区县: record.district,
    网格通账号: record.gridAccount,
    姓名: record.personName,
    身份证脱敏: record.personIdCardMasked,
    工单名称: record.workOrderNameRaw,
    工作量: record.businessQty,
    表内公式金额: record.excelFormulaAmount,
    系统重算金额: record.calculatedAmount,
    差异: record.amountDiff,
    工作量明细: (record.workloadItems || []).map(item => `${item.itemName}${item.qty}${item.unit}`).join('；')
  }))
}

async function exportData(wxContext, data = {}) {
  const filters = {
    ...(data.filters || {}),
    majorCategory: CURRENT_MAJOR_CATEGORY,
    subCategory: CURRENT_SUBCATEGORY
  }
  const { records } = await getScopedRecords(wxContext, filters, data.scopeMode === 'self' ? 'self' : 'role')

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildWorkOrderExportRows(records)), '工单汇总')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildRawExportRows(records)), '人员明细')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const monthPart = filters.settlementMonth || formatMonth(new Date())

  return {
    success: true,
    data: {
      base64: buffer.toString('base64'),
      filename: `集客开通_${monthPart}.xlsx`,
      total: records.length
    }
  }
}

module.exports.__test__ = {
  createWorkOrderParts,
  mergeWorkloadItems,
  aggregateByPerson,
  aggregateByWorkOrder,
  parseWorkbook
}
