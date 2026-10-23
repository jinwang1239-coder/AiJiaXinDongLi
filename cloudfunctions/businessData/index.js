const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const core = require('./sales-core')
const API_VERSION = 'sales-monthly-v2'
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database(), _ = db.command
const C = { records: 'sales_month_records', batches: 'sales_import_batches', versions: 'sales_active_versions', receipts: 'sales_data_receipts' }
async function all(query) {
  const rows = []
  for (let skip = 0; ; skip += 100) {
    const result = await query.skip(skip).limit(100).get()
    rows.push(...result.data)
    if (result.data.length < 100) return rows
  }
}
async function optionalDoc(collection, id, source = db) {
  try { return (await source.collection(collection).doc(id).get()).data || null } catch (error) {
    if (/document.*(?:not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND/i.test(String(error.message))) return null
    throw error
  }
}
const versionId = (month, district) => core.hash(month + '|' + district)
const summary = require('./sales-summary')(db, { all, optionalDoc, activeRows, versionsFor, versionId })
async function currentUser() {
  const { OPENID } = cloud.getWXContext()
  const result = await db.collection('users').where({ openid: OPENID }).limit(2).get()
  const user = result.data[0]
  if (result.data.length !== 1 || !user || user.status === 'inactive' ||
      (user.role !== 'system_admin' && (user.workspaceType !== 'sales' ||
      !['sales_person', 'district_manager', 'sales_department'].includes(user.role)))) throw new Error('当前账号不可访问销售工作台')
  return user
}
function requireImporter(user) {
  if (!core.canImport(user)) throw new Error('仅指定市场营销部管理人员可导入和定版')
}
async function versionsFor(user, businessMonth = '') {
  let query = db.collection(C.versions)
  const condition = {}
  if (businessMonth) condition.businessMonth = businessMonth
  if (user.role === 'district_manager') {
    if (!core.DISTRICTS.includes(user.salesManagedDistrict)) throw new Error('尚未配置有效管理区县，请联系系统管理员')
    condition.district = user.salesManagedDistrict
  }
  if (Object.keys(condition).length) query = query.where(condition)
  return (await all(query)).filter(version => version.activeBatchId)
}
async function activeRows(user, personal = false, businessMonth = '') {
  if (personal && user.role !== 'sales_person') return { versions: [], rows: [] }
  const own = personal || user.role === 'sales_person'
  if (own) {
    if (!user.employeeId) return { versions: [], rows: [] }
    const binding = await optionalDoc('sales_employees', core.hash(user.employeeId))
    if (!binding || binding.userOpenid !== user.openid) return { versions: [], rows: [] }
  }
  const versions = await versionsFor(user, businessMonth), rows = []
  const ids = [...new Set(versions.map(item => item.activeBatchId).filter(Boolean))]
  for (let offset = 0; offset < ids.length; offset += 20) {
    const condition = { importBatchId: _.in(ids.slice(offset, offset + 20)) }
    if (own) condition.employeeId = user.employeeId
    if (user.role === 'district_manager') condition.district = user.salesManagedDistrict
    rows.push(...await all(db.collection(C.records).where(condition)))
  }
  return { versions, rows: rows.filter(row => versions.some(version => version.activeBatchId === row.importBatchId &&
    version.businessMonth === row.businessMonth && version.district === row.district)) }
}
function filterRecords(records, filters = {}) {
  return records.filter(item => (
    (!filters.businessMonth || item.businessMonth === filters.businessMonth) &&
    (!filters.startDate || item.date >= filters.startDate) &&
    (!filters.endDate || item.date <= filters.endDate) &&
    (!filters.district || item.district === filters.district) &&
    (!filters.businessName || item.businessName === filters.businessName) &&
    (!filters.employeeId || item.employeeId === core.employeeId(filters.employeeId)) &&
    (!filters.developer || item.developer.includes(String(filters.developer).trim()) ||
      item.employeeId.includes(core.employeeId(filters.developer))) &&
    (filters.commissionMin === '' || filters.commissionMin === undefined || item.commission >= Number(filters.commissionMin)) &&
    (filters.commissionMax === '' || filters.commissionMax === undefined || item.commission <= Number(filters.commissionMax))
  ))
}
async function list(user, data = {}) {
  const active = await activeRows(user, data.personal === true, data.filters && data.filters.businessMonth)
  const referenceMonth = data.referenceMonth || core.monthNow()
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(referenceMonth)) throw new Error('核发月份无效')
  const records = filterRecords(core.flatten(active.rows, active.versions, referenceMonth), data.filters)
    .sort((a, b) => b.businessMonth.localeCompare(a.businessMonth) || a.employeeId.localeCompare(b.employeeId))
  const page = Math.max(1, Number(data.page) || 1), pageSize = Math.min(100, Math.max(1, Number(data.pageSize) || 20))
  const shownRecords = records.slice((page - 1) * pageSize, page * pageSize)
  const filters = data.filters || {}
  const visibleVersions = active.versions.filter(version => active.rows.some(row =>
    row.importBatchId === version.activeBatchId && row.district === version.district) && (!filters.district || filters.district === version.district))
  const receiptVersions = visibleVersions.filter(version => data.receiptMonth ? version.businessMonth === data.receiptMonth :
    shownRecords.some(row => row.businessMonth === version.businessMonth && row.district === version.district) ||
    page === 1 && !records.length && !filters.businessName && !filters.developer && !filters.employeeId)
  return {
    records: shownRecords, total: records.length,
    stats: core.stats(records, referenceMonth), referenceMonth,
    receipts: user.role === 'sales_person' ? receiptVersions
      .map(({ businessMonth, district, activeBatchId }) => ({ businessMonth, district, activeBatchId })) : [],
    versions: visibleVersions
      .map(({ businessMonth, district, cutoffDate, finalized }) => ({ businessMonth, district, cutoffDate, finalized })),
    filterOptions: { districts: [...new Set(active.rows.map(item => item.district))], businessTypes: core.PRODUCT_NAMES }
  }
}
async function prepare(user, data) {
  requireImporter(user)
  if (!data.fileID) throw new Error('请先上传Excel')
  const downloaded = await cloud.downloadFile({ fileID: data.fileID })
  if (downloaded.fileContent.length > 10 * 1024 * 1024) throw new Error('文件不能超过10MB')
  const XLSX = require('xlsx')
  const parsed = core.parseWorkbook(XLSX.read(downloaded.fileContent, { type: 'buffer' }), XLSX, data)
  const monthLockId = core.hash('month|' + parsed.meta.businessMonth)
  const [monthLock, versions, existing] = await Promise.all([
    optionalDoc(C.versions, monthLockId),
    Promise.all(parsed.meta.districts.map(async district => {
      const version = await optionalDoc(C.versions, versionId(parsed.meta.businessMonth, district))
      if (version && version.finalized) throw new Error(district + '该月已定版，请先撤销定版')
      if (version && parsed.meta.cutoffDate < version.cutoffDate) throw new Error(district + '统计截止日期早于当前版本')
      const ruleVersion = version && (version.ruleVersion || (await optionalDoc(C.batches, version.activeBatchId) || {}).ruleVersion)
      return { district, previous: version ? version.activeBatchId : '', revision: version && version.revision || 0, ruleVersion: ruleVersion || '' }
    })),
    activeRows({ ...user, role: 'sales_department' }, false, parsed.meta.businessMonth)
  ])
  const monthRevision = monthLock && monthLock.revision || 0
  const outside = new Set(existing.rows.filter(row => row.businessMonth === parsed.meta.businessMonth &&
    !parsed.meta.districts.includes(row.district)).map(row => row.employeeId))
  parsed.rows.filter(row => outside.has(row.employeeId)).forEach(row => parsed.errors.push({
    rowNumber: 0, employeeId: row.employeeId, errors: ['员工编号已存在于该月其他区县，请先处理调区县数据']
  }))
  const previous = existing.rows.filter(row => row.businessMonth === parsed.meta.businessMonth && parsed.meta.districts.includes(row.district))
  const incoming = new Map(parsed.rows.map(row => [row.employeeId, row]))
  const differences = previous.filter(row => !incoming.has(row.employeeId) ||
    JSON.stringify(row.items) !== JSON.stringify(incoming.get(row.employeeId).items) ||
    row.realName !== incoming.get(row.employeeId).realName || row.district !== incoming.get(row.employeeId).district ||
    row.gridName !== incoming.get(row.employeeId).gridName)
    .map(row => ({
      employeeId: row.employeeId, realName: row.realName, previousQuantity: row.quantity,
      quantity: incoming.has(row.employeeId) ? incoming.get(row.employeeId).quantity : 0,
      previousCommission: row.commission, commission: incoming.has(row.employeeId) ? incoming.get(row.employeeId).commission : 0,
      missing: !incoming.has(row.employeeId)
    }))
  const previousIds = new Set(previous.map(row => row.employeeId))
  parsed.rows.filter(row => !previousIds.has(row.employeeId)).forEach(row => differences.push({
    employeeId: row.employeeId, realName: row.realName, previousQuantity: 0, quantity: row.quantity,
    previousCommission: 0, commission: row.commission, added: true
  }))
  const token = core.hash(JSON.stringify({ meta: parsed.meta, rows: parsed.rows, versions, monthRevision }))
  const unchanged = !parsed.errors.length && !differences.length && versions.every(item => {
    const version = existing.versions.find(value => value.district === item.district)
    return version && version.cutoffDate === parsed.meta.cutoffDate && version.finalized === parsed.meta.finalized && item.ruleVersion === core.RULE_VERSION
  })
  return { ...parsed, versions, token, differences, monthLockId, monthRevision, unchanged }
}
function previewResult(prepared) {
  const differences = prepared.differences.filter(item => item.missing ||
    item.quantity < item.previousQuantity || item.commission < item.previousCommission)
  return {
    previewToken: prepared.token, meta: prepared.meta, totalEmployees: prepared.rows.length,
    unchanged: prepared.unchanged,
    totalQuantity: prepared.rows.reduce((sum, row) => sum + row.quantity, 0),
    totalCommission: core.money(prepared.rows.reduce((sum, row) => sum + row.commission, 0)),
    differenceCount: differences.length, differences: differences.slice(0, 100),
    errorCount: prepared.errors.length, errors: prepared.errors.slice(0, 100)
  }
}
async function commit(user, data) {
  const prepared = await prepare(user, data)
  if (prepared.errors.length) throw new Error('存在校验错误，不能发布')
  if (!data.previewToken || data.previewToken !== prepared.token) throw new Error('数据或当前版本已变化，请重新预览')
  if (prepared.unchanged) return { unchanged: true }
  // 每次暂存独立，禁止并发请求覆盖已经生效的批次内容。
  const batchId = core.hash(prepared.token + '|' + crypto.randomBytes(16).toString('hex'))
  const now = new Date()
  await db.collection(C.batches).doc(batchId).set({ data: {
    ...prepared.meta, operatorOpenid: user.openid, operatorName: user.realName || '',
    fileID: data.fileID, fileName: String(data.fileName || '').slice(0, 150), ruleVersion: core.RULE_VERSION,
    totalEmployees: prepared.rows.length, totalQuantity: prepared.rows.reduce((sum, row) => sum + row.quantity, 0),
    totalCommission: core.money(prepared.rows.reduce((sum, row) => sum + row.commission, 0)), createTime: now, state: 'staged'
  } })
  for (let offset = 0; offset < prepared.rows.length; offset += 20) {
    await Promise.all(prepared.rows.slice(offset, offset + 20).map(row => db.collection(C.records)
      .doc(core.hash(batchId + '|' + row.employeeId)).set({ data: {
        ...row, businessMonth: prepared.meta.businessMonth, importBatchId: batchId, ruleVersion: core.RULE_VERSION
      } })))
  }
  await db.runTransaction(async transaction => {
    requireImporter((await transaction.collection('users').doc(user._id).get()).data)
    const monthLock = await optionalDoc(C.versions, prepared.monthLockId, transaction)
    if ((monthLock && monthLock.revision || 0) !== prepared.monthRevision) throw new Error('该月份数据已被更新，请重新预览')
    await transaction.collection(C.versions).doc(prepared.monthLockId).set({ data: { revision: prepared.monthRevision + 1 } })
    for (const item of prepared.versions) {
      const id = versionId(prepared.meta.businessMonth, item.district)
      const version = await optionalDoc(C.versions, id, transaction)
      if ((version ? version.activeBatchId : '') !== item.previous ||
          (version && version.revision || 0) !== item.revision || (version && version.finalized)) {
        throw new Error('其他管理员已更新或定版，请重新预览')
      }
      await transaction.collection(C.versions).doc(id).set({ data: {
        businessMonth: prepared.meta.businessMonth, district: item.district, revision: item.revision + 1,
        activeBatchId: batchId, cutoffDate: prepared.meta.cutoffDate, finalized: prepared.meta.finalized,
        ruleVersion: core.RULE_VERSION,
        updateTime: now, operatorOpenid: user.openid
      } })
    }
    await transaction.collection(C.batches).doc(batchId).update({ data: { state: 'published', publishTime: now } })
  })
  return { batchId, ...previewResult(prepared) }
}
async function reopen(user, data) {
  requireImporter(user)
  const reason = String(data.reason || '').trim()
  if (!reason) throw new Error('请填写撤销定版原因')
  await db.runTransaction(async transaction => {
    requireImporter((await transaction.collection('users').doc(user._id).get()).data)
    const id = versionId(data.businessMonth, data.district)
    const version = await optionalDoc(C.versions, id, transaction)
    if (!version || !version.finalized) throw new Error('该范围没有已定版数据')
    await transaction.collection(C.versions).doc(id).update({ data: {
      finalized: false, revision: (version.revision || 0) + 1, updateTime: new Date()
    } })
    await transaction.collection(C.batches).doc(version.activeBatchId).update({ data: {
      reopenLogs: _.push([{ reason, operatorOpenid: user.openid, time: new Date() }])
    } })
  })
  return {}
}
async function clearDistrictMonth(user, data) {
  if (user.role !== 'system_admin') throw new Error('仅系统管理员可清空区县月份数据')
  const reason = String(data.reason || '').trim()
  if (!reason || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(data.businessMonth || '')) || !core.DISTRICTS.includes(data.district)) {
    throw new Error('请选择有效区县月份并填写更正原因')
  }
  const batchId = core.hash(crypto.randomBytes(16).toString('hex'))
  await db.runTransaction(async transaction => {
    const fresh = (await transaction.collection('users').doc(user._id).get()).data
    if (fresh.role !== 'system_admin' || fresh.status === 'inactive') throw new Error('系统维护权限已变更')
    const id = versionId(data.businessMonth, data.district)
    const version = await optionalDoc(C.versions, id, transaction)
    if (!version || version.activeBatchId !== data.activeBatchId) throw new Error('区县数据已变化，请刷新后操作')
    if (version.finalized) throw new Error('该月已定版，请先由授权人员撤销定版')
    const lockId = core.hash('month|' + data.businessMonth)
    const lock = await optionalDoc(C.versions, lockId, transaction)
    const now = new Date()
    await transaction.collection(C.batches).doc(batchId).set({ data: {
      businessMonth: data.businessMonth, districts: [data.district], cutoffDate: version.cutoffDate, finalized: false,
      state: 'published', operation: 'clear_district', reason, operatorOpenid: user.openid, operatorName: user.realName || '',
      totalEmployees: 0, totalQuantity: 0, totalCommission: 0, ruleVersion: core.RULE_VERSION, createTime: now
    } })
    const { _id, ...previous } = version
    await transaction.collection(C.versions).doc(id).set({ data: {
      ...previous, activeBatchId: batchId, revision: (version.revision || 0) + 1, updateTime: now, operatorOpenid: user.openid
    } })
    await transaction.collection(C.versions).doc(lockId).set({ data: { revision: (lock && lock.revision || 0) + 1 } })
  })
  return {}
}
async function exportData(user, data) {
  const active = await activeRows(user, false, data.filters && data.filters.businessMonth)
  const rows = filterRecords(core.flatten(active.rows, active.versions), data.filters)
  const table = rows.map(row => {
    const output = {
      '业务月份': row.businessMonth, '区县': row.district, '网格名称': row.gridName, '装维人员姓名': row.developer,
      '员工编号': row.employeeId, '业务名称': row.businessName, '业务量': row.quantity, '总酬金': row.commission,
      '统计截止日期': row.cutoffDate, '状态': row.statusText
    }
    row.settlementSchedule.forEach(item => { output[item.period] = item.amount })
    return output
  })
  const XLSX = require('xlsx'), workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(table), '销售月度业务')
  return { base64: XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }), filename: '销售月度业务.xlsx' }
}
async function archiveLegacy(user, data) {
  if (user.role !== 'system_admin') throw new Error('仅系统管理员可维护旧数据')
  if (data.confirm !== 'BACKUP_AND_CLEAR_LEGACY_SALES') throw new Error('清理旧销售数据需要明确确认')
  const records = await all(db.collection('business_records'))
  if (!records.length) return { deletedCount: 0 }
  const backup = await cloud.uploadFile({ cloudPath: 'sales_backups/legacy_' + Date.now() + '_' + crypto.randomBytes(12).toString('hex') + '.json',
    fileContent: Buffer.from(JSON.stringify({ backupTime: new Date(), records }), 'utf8') })
  if (!backup.fileID) throw new Error('备份未成功，禁止清理')
  for (let offset = 0; offset < records.length; offset += 20) {
    await db.collection('business_records').where({ _id: _.in(records.slice(offset, offset + 20).map(row => row._id)) }).remove()
  }
  return { deletedCount: records.length, backupFileID: backup.fileID }
}
exports.main = async (event = {}) => {
  try {
    if (event.action === 'test') return { success: true, apiVersion: API_VERSION, message: '销售月度数据服务正常' }
    const user = await currentUser(), data = event.data || {}
    let result
    switch (event.action) {
      case 'getAccess': result = { role: user.role, canImport: core.canImport(user), canMaintain: user.role === 'system_admin',
        canExportParticipation: summary.canExportParticipation(user) }; break
      case 'getSummary': result = await summary.getSummary(user, data); break
      case 'recordReceipt': result = await summary.recordReceipt(user, data); break
      case 'exportParticipation': result = await summary.exportParticipation(user, data); break
      case 'importPreview': result = previewResult(await prepare(user, data)); break
      case 'importCommit': result = await commit(user, data); break
      case 'reopenMonth': result = await reopen(user, data); break
      case 'clearDistrictMonth': result = await clearDistrictMonth(user, data); break
      case 'getImportBatches': {
        if (user.role !== 'system_admin') requireImporter(user)
        const [records, versions] = await Promise.all([
          all(db.collection(C.batches).where({ state: 'published' })), versionsFor(user)
        ])
        result = { records: records.sort((a, b) => new Date(b.createTime) - new Date(a.createTime)).slice(0, 30), versions }
        break
      }
      case 'list':
      case 'getStats': result = await list(user, data); break
      case 'export': result = await exportData(user, { ...event, ...data }); break
      case 'archiveLegacy': result = await archiveLegacy(user, data); break
      default: throw new Error('原逐笔录入、修改、删除接口已关闭，请使用月度Excel导入')
    }
    return { success: true, apiVersion: API_VERSION, data: result }
  } catch (error) {
    console.error('businessData:', error)
    const message = String(error.message || '')
    const missingCollection = [C.records, C.batches, C.versions, C.receipts, 'sales_employees', 'sales_claim_logs']
      .find(name => message.includes(name))
    if (missingCollection && (Number(error.errCode) === -502005 ||
        /database collection not exists|Db or Table not exist|DATABASE_COLLECTION_NOT_EXIST/i.test(message))) {
      return {
        success: false, apiVersion: API_VERSION, errorCode: 'SALES_DATABASE_NOT_INITIALIZED',
        error: '销售数据库尚未初始化：缺少集合 ' + missingCollection + '。请在当前云环境创建此集合，权限选择“所有用户不可读写”。'
      }
    }
    return { success: false, apiVersion: API_VERSION, error: error.message || '操作失败' }
  }
}
