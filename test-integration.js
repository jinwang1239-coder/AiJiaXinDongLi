const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const XLSX = require('./cloudfunctions/businessData/node_modules/xlsx')
const core = require('./cloudfunctions/businessData/sales-core')
const products = require('./utils/product-config')
const quiet = { log() {}, error() {}, warn() {} }
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8')
function load(file, mocks = {}) {
  const module = { exports: {} }
  vm.runInNewContext(read(file), { module, exports: module.exports, console: quiet, Buffer, ...mocks }, { filename: file })
  return module.exports
}
const clone = value => structuredClone(value)
function memoryDatabase() {
  let store = new Map(), tail = Promise.resolve(), failRecordWrite = false
  const names = ['users', 'sales_month_records', 'sales_import_batches', 'sales_active_versions', 'sales_employees',
    'sales_claim_logs', 'sales_data_receipts', 'business_records', 'salary_feedbacks', 'feedback_routes', 'line_project_records', 'line_project_active_versions', 'line_project_month_confirms']
  names.forEach(name => store.set(name, new Map()))
  const matches = (row, where) => where && where.op === 'or' ? where.values.some(condition => matches(row, condition)) : Object.entries(where || {}).every(([key, value]) => {
    const actual = key.split('.').reduce((item, field) => item && item[field], row)
    return value && value.op === 'in' ? value.values.includes(actual) : actual === value
  })
  function client(source) {
    return {
      collection(name) {
        if (!source.has(name)) {
          const error = new Error('collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: ' + name)
          error.errCode = -502005
          throw error
        }
        const table = source.get(name)
        function query(where = {}, skip = 0, limit = 100) {
          return {
            where: next => query(next, skip, limit), skip: next => query(where, next, limit), limit: next => query(where, skip, next),
            get: async () => ({ data: clone([...table.values()].filter(row => matches(row, where)).slice(skip, skip + limit)) }),
            remove: async () => { for (const [id, row] of table) if (matches(row, where)) table.delete(id) }
          }
        }
        return {
          ...query(),
          add: async ({ data }) => { const id = crypto.randomBytes(12).toString('hex'); table.set(id, { ...clone(data), _id: id }); return { _id: id } },
          doc(id) {
            assert(id && typeof id === 'string')
            return {
              get: async () => {
                if (!table.has(id)) throw new Error('document not exist')
                return { data: clone(table.get(id)) }
              },
              set: async ({ data }) => {
                if (name === 'sales_month_records' && failRecordWrite) { failRecordWrite = false; throw new Error('模拟暂存失败') }
                table.set(id, { ...clone(data), _id: id }); return { _id: id }
              },
              update: async ({ data }) => {
                if (!table.has(id)) throw new Error('document not exist')
                const current = clone(table.get(id))
                for (const [key, value] of Object.entries(data)) current[key] = value && value.op === 'push'
                  ? [...current[key] || [], ...clone(value.values)] : clone(value)
                table.set(id, current)
                return { stats: { updated: 1 } }
              },
              remove: async () => table.delete(id)
            }
          }
        }
      }
    }
  }
  const db = {
    collection: name => client(store).collection(name),
    command: { in: values => ({ op: 'in', values }), push: values => ({ op: 'push', values }), or: values => ({ op: 'or', values }) },
    runTransaction(fn) {
      const result = tail.then(async () => {
        const staged = clone(store)
        const output = await fn(client(staged))
        store = staged
        return output
      })
      tail = result.catch(() => {})
      return result
    },
    rows: name => clone([...store.get(name).values()]),
    dropCollection(name) { store.delete(name) },
    createCollection(name) { assert(!store.has(name)); store.set(name, new Map()) },
    failNextRecordWrite() { failRecordWrite = true }
  }
  return db
}
async function main() {
  const db = memoryDatabase(), fileStore = new Map(), backups = []
  let openid = 'admin', failBackup = false
  const cloud = {
    init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => db, getWXContext: () => ({ OPENID: openid }),
    downloadFile: async ({ fileID }) => ({ fileContent: fileStore.get(fileID) }),
    uploadFile: async input => { if (failBackup) throw new Error('backup failed'); backups.push(input); return { fileID: 'backup-file' } }
  }
  const business = load('cloudfunctions/businessData/index.js', {
    require: name => name === 'wx-server-sdk' ? cloud : name === './sales-core' ? core : name === 'xlsx' ? XLSX
      : name === './sales-summary' ? require('./cloudfunctions/businessData/sales-summary') : require(name)
  })
  const identity = require('./cloudfunctions/userManagement/sales-identity')(db)
  const users = load('cloudfunctions/userManagement/index.js', {
    require: name => name === 'wx-server-sdk' ? cloud : name === './sales-identity' ? () => identity : require(name)
  })
  const admin = { _id: 'admin', openid: 'admin', workspaceType: 'sales', role: 'sales_department',
    permissions: { salesImport: true }, realName: '导入员', gridAccount: 'ADMIN_GRID', status: 'active' }
  const person = id => ({ _id: id, openid: id, role: 'sales_person', workspaceType: 'sales', status: 'active' })
  for (const user of [admin, person('a'), person('b'), person('c'), person('d'), person('e'), person('f'),
    { ...person('system'), workspaceType: 'line_project', role: 'system_admin', gridAccount: 'SYSTEM_GRID', realName: '系统测试员', permissions: { salesImport: true } },
    { ...person('county'), role: 'district_manager', district: '沙市区', salesManagedDistrict: '沙市区' },
    { ...person('line'), workspaceType: 'line_project', gridAccount: 'GRID001', realName: '集客测试', district: '荆州区', gridName: '集客网格' }
  ]) await db.collection('users').doc(user._id).set({ data: user })
  const businessMonth = core.addMonth(core.monthNow(), -1)
  const meta = { businessMonth, cutoffDate: businessMonth + '-14' }
  const row = (id, quantities = [1, 0, 1, 0, 1, 0, 0, 0], district = '荆州区') => [district, '城区城北网格', id + '姓名', id, ...quantities]
  function file(id, rows) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([core.HEADERS, ...rows]), 'Sheet1')
    fileStore.set(id, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
    return { ...meta, fileID: id, fileName: '业务量.xlsx' }
  }
  async function call(action, data = {}, who = 'admin') {
    openid = who
    return business.main({ action, data })
  }
  async function publish(data) {
    const preview = await call('importPreview', data)
    assert.equal(preview.success, true, preview.error)
    assert.equal(preview.data.errors.length, 0)
    const result = await call('importCommit', { ...data, previewToken: preview.data.previewToken })
    assert.equal(result.success, true, result.error)
    return result
  }
  // 首次上线：没有认领的个人首页不依赖月份集合；管理查询不能把未建集合误当作空数据。
  db.dropCollection('sales_active_versions')
  const firstVisit = await call('list', { personal: true }, 'system')
  assert.equal(firstVisit.success, true)
  assert.equal(firstVisit.data.stats.totalRecords, 0)
  assert.equal(firstVisit.data.versions.length, 0)
  const missingVersion = await call('list', {}, 'system')
  assert.equal(missingVersion.success, false)
  assert.equal(missingVersion.errorCode, 'SALES_DATABASE_NOT_INITIALIZED')
  assert.match(missingVersion.error, /缺少集合 sales_active_versions/)
  db.createCollection('sales_active_versions')
  db.dropCollection('sales_employees')
  openid = 'a'
  const missingIdentity = await users.main({ action: 'updateProfile', data: { employeeId: 'JZ001' } })
  assert.equal(missingIdentity.success, false)
  assert.match(missingIdentity.error, /缺少集合 sales_employees/)
  db.createCollection('sales_employees')
  const rates = [60, 65, 30, 30, 20, 59, 10, 36]
  products.getProducts().forEach((product, index) => {
    assert.equal(product.commission.total, rates[index])
    const result = require('./cloudfunctions/businessData/commission-rules').getCommissionDetail(product.name)
    assert.equal(result.commission.total, rates[index])
    for (let month = 1; month <= 5; month++) assert.equal(result.commission['T' + month], product.commission['T' + month] || 0)
  })
  assert.equal(core.canImport({ ...admin, permissions: {} }), false)
  assert.equal(core.canImport({ ...admin, role: 'district_manager' }), false)
  assert.equal(core.canImport({ ...admin, workspaceType: 'line_project' }), false)
  assert.equal((await call('create', {})).success, false)
  assert.equal((await call('importPreview', {}, 'a')).success, false)
  assert.equal((await call('getAccess', {}, 'system')).data.canImport, true, '系统管理员保留身份，可显式授权导入')
  await db.collection('users').doc('system').update({ data: { permissions: {} } })
  assert.equal((await call('getAccess', {}, 'system')).data.canImport, false, '管理员身份不自动授予导入权限')
  await db.collection('users').doc('system').update({ data: { permissions: { salesImport: true } } })
  assert.equal((await call('list', {}, 'system')).success, true)
  openid = 'line'
  const lineProfile = await users.main({ action: 'updateProfile', data: {
    realName: '集客测试', gridAccount: 'GRID001', district: '荆州区', gridName: '集客网格'
  } })
  assert.equal(lineProfile.success, true, lineProfile.error)
  assert.equal(lineProfile.data.gridAccount, 'GRID001')
  assert.equal(lineProfile.data.workspaceType, 'line_project')
  await assert.rejects(identity.claim(person('a'), 'JZ001'), /尚无/)
  const first = file('first', [row('JZ001'), row('JZ002', [0, 0, 0, 0, 0, 0, 0, 0])])
  assert.deepEqual((await call('importPreview', first)).data.meta.districts, ['荆州区'])
  await publish(first)
  let summary = (await call('getSummary', { businessMonth })).data
  assert.equal(summary.totalQuantity, 3)
  assert.equal(summary.nextAmount, 25)
  assert.equal(summary.deferredAmount, 25)
  assert.equal(summary.nextMonth, core.addMonth(businessMonth, 1))
  assert.equal(summary.products.length, 8)
  assert.equal(summary.participation.expected, 2, '包含未认领和0业务量员工')
  assert.equal(summary.participation.received, 0)
  assert.equal(summary.participation.districts.find(item => item.district === '石首').rate, '—')
  db.dropCollection('sales_data_receipts')
  const missingReceipts = await call('getSummary', { businessMonth })
  assert.equal(missingReceipts.errorCode, 'SALES_DATABASE_NOT_INITIALIZED')
  assert.match(missingReceipts.error, /sales_data_receipts/)
  db.createCollection('sales_data_receipts')
  const claimed = await identity.claim(person('a'), ' jz001 ')
  assert.equal(claimed.employeeId, 'JZ001')
  assert.equal((await identity.claim(person('b'), 'JZ002')).employeeId, 'JZ002')
  const firstSummary = (await call('getSummary', { businessMonth }, 'a')).data
  assert.equal(firstSummary.totalQuantity, 3)
  assert.equal(firstSummary.participation, null)
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 0, '仅查询接口不标记已查看')
  assert.equal((await call('recordReceipt', firstSummary.receipt, 'admin')).success, false, '管理员不能代员工接收')
  assert.equal((await call('recordReceipt', { ...firstSummary.receipt, employeeId: 'JZ002' }, 'a')).success, true)
  assert.equal((await call('recordReceipt', firstSummary.receipt, 'a')).success, true)
  assert.equal(db.rows('sales_data_receipts').length, 1, '同员工同版本重复查看仅一条记录')
  assert.equal(db.rows('sales_data_receipts')[0].employeeId, 'JZ001', '不信任客户端指定的员工编号')
  const zeroSummary = (await call('getSummary', { businessMonth }, 'b')).data
  assert.equal(zeroSummary.hasData, true)
  assert.equal(zeroSummary.totalQuantity, 0)
  await call('recordReceipt', zeroSummary.receipt, 'b')
  assert.equal((await call('getSummary', { businessMonth })).data.participation.rate, '100.0%')
  await assert.rejects(identity.claim(person('c'), 'JZ001'), /其他/)
  await assert.rejects(identity.claim(db.rows('users').find(user => user._id === 'a'), 'JZ002'), /不能自行更换/)
  let own = await call('list', {}, 'a')
  assert.equal(own.data.stats.totalRecords, 3)
  assert.equal(own.data.stats.totalCommission, 110)
  assert.equal((await call('list', { filters: { employeeId: 'JZ002' } }, 'a')).data.total, 0)
  let userInfo
  openid = 'a'
  userInfo = await users.main({ action: 'getUserInfo' })
  assert.equal(userInfo.data.profileCompleted, true)
  assert.equal(userInfo.data.employeeId, 'JZ001')
  const second = file('second', [row('JZ001', [8, '', 0, 0, 0, 0, 0, 0])])
  const preview = await call('importPreview', second)
  assert(preview.data.differences.some(item => item.employeeId === 'JZ002' && item.missing))
  assert.equal(preview.data.differenceCount, 1)
  assert(!preview.data.differences.some(item => item.employeeId === 'JZ001'), '正常累计增长不列入问题明细')
  const reduced = await call('importPreview', file('reduced-preview', [row('JZ001', [1, 0, 0, 0, 0, 0, 0, 0]), row('JZ002', [0])]))
  assert.equal(reduced.data.errorCount, 0, '累计量减少是核对提醒，不是阻断错误')
  assert.equal(reduced.data.differenceCount, 1)
  assert.equal(reduced.data.differences[0].employeeId, 'JZ001')
  await publish(second)
  assert.equal((await call('recordReceipt', firstSummary.receipt, 'a')).success, false, '旧版本查看不能记入新版本')
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 0)
  own = await call('list', {}, 'a')
  assert.equal(own.data.stats.totalRecords, 8, '累计量替换，不能累加')
  assert.equal(own.data.stats.totalCommission, 480)
  assert.equal((await call('list', {}, 'b')).data.stats.totalRecords, 0)
  assert.equal(db.rows('sales_employees').length, 2, '缺失员工的认领关系保留')
  assert.equal((await call('importCommit', { ...second, previewToken: preview.data.previewToken })).success, false, '旧预览不能重复发布')
  const bad = file('bad', [row('JZ001', [-1]), row('JZ001')])
  assert((await call('importPreview', bad)).data.errors.length > 0)
  const final = file('final', [row('JZ001', [9, 0, 0, 0, 0, 0, 0, 0]), row('JZ003')])
  final.finalized = true
  await publish(final)
  assert.equal((await call('importPreview', second)).success, false, '定版后禁止覆盖')
  assert.equal((await call('reopenMonth', { businessMonth, district: '荆州区', reason: '' })).success, false)
  assert.equal((await call('reopenMonth', { businessMonth, district: '荆州区', reason: '更正业务量' })).success, true)
  const contenders = await Promise.allSettled([identity.claim(person('c'), 'JZ003'), identity.claim(person('d'), 'JZ003')])
  assert.equal(contenders.filter(item => item.status === 'fulfilled').length, 1)
  const concurrent = file('concurrent', [row('JZ001', [10, 0, 0, 0, 0, 0, 0, 0])])
  const cp = (await call('importPreview', concurrent)).data.previewToken
  const commits = await Promise.all([call('importCommit', { ...concurrent, previewToken: cp }), call('importCommit', { ...concurrent, previewToken: cp })])
  assert.equal(commits.filter(result => result.success).length, 1)
  assert.equal((await call('list', {}, 'a')).data.stats.totalRecords, 10)
  const failed = file('failed', [row('JZ001', [11, 0, 0, 0, 0, 0, 0, 0])])
  const failedPreview = (await call('importPreview', failed)).data.previewToken
  db.failNextRecordWrite()
  assert.equal((await call('importCommit', { ...failed, previewToken: failedPreview })).success, false)
  assert.equal((await call('list', {}, 'a')).data.stats.totalRecords, 10, '暂存失败不得影响有效版本')
  await db.collection('users').doc('admin').update({ data: { permissions: {} } })
  assert.equal((await call('importCommit', { ...failed, previewToken: failedPreview })).success, false)
  await db.collection('users').doc('admin').update({ data: { permissions: { salesImport: true } } })
  const other = file('other', [row('JZ004', undefined, '沙市区')])
  await publish(other)
  assert.equal((await call('list', {}, 'county')).data.stats.totalRecords, 3)
  await db.collection('users').doc('county').update({ data: { district: '荆州区' } })
  assert.equal((await call('list', {}, 'county')).data.stats.totalRecords, 3, '个人区县不能改变管理范围')
  assert.equal((await call('list', {}, 'a')).data.stats.totalRecords, 10)
  const schedule = (await call('list', {}, 'a')).data.records[0].settlementSchedule
  assert.equal(schedule[0].amount, 150)
  assert.equal(schedule[4].amount, 0)
  const suppliedScope = await call('importPreview', { ...other, districts: ['石首'] })
  assert.deepEqual(suppliedScope.data.meta.districts, ['沙市区'], '覆盖范围只能由Excel确定')
  const mixed = file('mixed', [row('JZ001', [10, 0, 0, 0, 0, 0, 0, 0]), row('JZ004', undefined, '沙市区')])
  const mixedPreview = await call('importPreview', mixed)
  assert.deepEqual(mixedPreview.data.meta.districts, ['荆州区', '沙市区'].sort())
  await publish(mixed)
  assert.equal((await call('list', {}, 'a')).data.stats.totalRecords, 10)
  assert.equal((await call('list', {}, 'county')).data.stats.totalRecords, 3)
  for (const district of ['', '未知区县']) {
    const invalid = file('invalid-district', [row('JZ001', undefined, district)])
    const rejected = await call('importPreview', invalid)
    assert(rejected.data.errors.some(item => item.errors.some(message => message.includes('区县无效'))))
    assert.equal((await call('importCommit', { ...invalid, previewToken: rejected.data.previewToken })).success, false)
  }
  const alias = file('alias', [row('JZ005', undefined, '公安')])
  assert.deepEqual((await call('importPreview', alias)).data.meta.districts, ['公安县'])
  summary = (await call('getSummary', { businessMonth })).data
  assert.equal(summary.totalQuantity, 13)
  assert.equal(summary.nextAmount, 175)
  assert.equal(summary.deferredAmount, 175)
  assert.equal((await call('getSummary', { businessMonth, district: '沙市区' }, 'a')).data.totalQuantity, 0)
  const countySummary = (await call('getSummary', { businessMonth }, 'county')).data
  assert.equal(countySummary.totalQuantity, 3)
  assert.equal(countySummary.participation.expected, 1)
  assert.equal(countySummary.participation.districts.length, 1)
  assert.equal((await call('getSummary', { businessMonth, district: '荆州区' }, 'county')).data.totalQuantity, 0)
  const systemSummary = (await call('getSummary', { businessMonth }, 'system')).data
  assert.equal(systemSummary.totalQuantity, 13)
  assert.equal(systemSummary.participation.expected, 2)
  assert.equal((await call('getSummary', { businessMonth }, 'line')).success, false)
  await identity.claim(person('f'), 'JZ004')
  for (const who of ['a', 'f']) {
    const mine = (await call('getSummary', { businessMonth }, who)).data
    assert.equal((await call('recordReceipt', mine.receipt, who)).success, true)
    if (who === 'f') assert.equal((await call('recordReceipt', mine.receipt, 'a')).success, false, '不可查看或接收他人区县版本')
  }
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 2)
  const previousBatchCount = db.rows('sales_import_batches').length
  const legacyVersion = db.rows('sales_active_versions').find(version => version.businessMonth === businessMonth && version.district === '荆州区')
  await db.collection('sales_active_versions').doc(legacyVersion._id).update({ data: { ruleVersion: '' } })
  assert.equal((await publish(concurrent)).data.unchanged, true)
  assert.equal(db.rows('sales_import_batches').length, previousBatchCount)
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 2, '完全相同的重复导入不重置参与率')
  await publish({ ...concurrent, cutoffDate: businessMonth + '-15' })
  const changedParticipation = (await call('getSummary', { businessMonth })).data.participation
  assert.equal(changedParticipation.received, 1)
  assert.equal(changedParticipation.districts.find(item => item.district === '荆州区').received, 0)
  assert.equal(changedParticipation.districts.find(item => item.district === '沙市区').received, 1, '未更新区县保留接收情况')
  const latestReceipt = (await call('getSummary', { businessMonth }, 'a')).data.receipt
  await call('recordReceipt', latestReceipt, 'a')
  assert.equal((await call('export', {}, 'a')).success, true)
  await db.collection('business_records').doc('legacy').set({ data: { commission: 123 } })
  failBackup = true
  assert.equal((await call('archiveLegacy', { confirm: 'BACKUP_AND_CLEAR_LEGACY_SALES' })).success, false)
  assert.equal((await call('archiveLegacy', { confirm: 'BACKUP_AND_CLEAR_LEGACY_SALES' }, 'system')).success, false)
  assert.equal(db.rows('business_records').length, 1)
  failBackup = false
  const cleanup = await call('archiveLegacy', { confirm: 'BACKUP_AND_CLEAR_LEGACY_SALES' }, 'system')
  assert.equal(cleanup.data.deletedCount, 1)
  assert.equal(backups.length, 1)
  await identity.release(admin, { employeeId: 'JZ001', reason: '错误认领更正' })
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 1, '解除认领后不沿用旧微信的查看记录')
  assert.equal(db.rows('users').find(user => user._id === 'a').salesClaimed, false)
  assert.equal(db.rows('sales_claim_logs').length, 1)
  openid = 'e'
  const claimedResponse = await users.main({ action: 'updateProfile', data: {
    employeeId: 'JZ001', role: 'sales_department', permissions: { salesImport: true }
  } })
  assert.equal(claimedResponse.success, true, claimedResponse.error)
  assert.equal(claimedResponse.data.employeeId, 'JZ001')
  assert.equal(claimedResponse.data.role, 'sales_person', '员工认领不能提升管理权限')
  assert.equal(core.canImport(db.rows('users').find(user => user._id === 'e')), false)
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 1)
  await call('recordReceipt', latestReceipt, 'e')
  assert.equal((await call('getSummary', { businessMonth })).data.participation.received, 2)
  const hdict = file('hdict', [row('JZ001', [0, 0, 0, 0, 0, 1, 0, 0])])
  hdict.businessMonth = core.addMonth(businessMonth, -1)
  hdict.cutoffDate = hdict.businessMonth + '-14'
  await publish(hdict)
  const hdictSummary = (await call('getSummary', { businessMonth: hdict.businessMonth })).data
  assert.equal(hdictSummary.nextAmount, 0)
  assert.equal(hdictSummary.deferredAmount, 59)
  assert.equal((await call('getSummary', { businessMonth })).data.nextAmount, 175, '不混入历史月份业务的分期金额')
  const feedbackModule = load('cloudfunctions/salaryFeedback/index.js', {
    process: { env: {} },
    require: name => name === 'wx-server-sdk' ? cloud : name === './sales-context'
      ? require('./cloudfunctions/salaryFeedback/sales-context') : require(name)
  })
  const feedback = feedbackModule.__test__
  const routeFixture = { district: '荆州区', districtManager: { name: '现任经理', gridAccount: 'CURRENT_MANAGER' } }
  const salesHandler = { role: 'sales_department', workspaceType: 'sales', gridAccount: 'CURRENT_MANAGER', realName: '现任经理' }
  assert.equal(feedback.getPendingReviewType({ workspaceType: 'sales', district: '荆州区', status: 'pending',
    managerReview: { openid: 'former', gridAccount: 'FORMER_MANAGER', status: 'pending' } }, salesHandler, routeFixture), 'manager')
  assert.equal(feedback.getPendingReviewType({ workspaceType: 'line_project', district: '荆州区', status: 'pending' },
    { ...salesHandler, workspaceType: 'line_project', district: '荆州区' }, routeFixture), 'manager')
  // 管理资料与员工认领分离，旧的无限范围用户查询接口关闭。
  for (const who of ['admin', 'county', 'system']) {
    openid = who
    const rejected = await users.main({ action: 'updateProfile', data: { workspaceType: 'sales', employeeId: 'JZ001' } })
    assert.equal(rejected.success, false)
    assert.match(rejected.error, /管理|认领/)
    assert.equal((await users.main({ action: 'getUsersByRole', data: {} })).success, false)
  }
  await db.collection('users').doc('county').update({ data: { salesManagedDistrict: '' } })
  assert.equal((await call('getSummary', { businessMonth }, 'county')).success, false)
  await db.collection('users').doc('county').update({ data: { salesManagedDistrict: '沙市区' } })
  const oldPlan = await call('list', { personal: true, referenceMonth: businessMonth, receiptMonth: businessMonth }, 'e')
  assert.equal(oldPlan.data.stats.settledCommission, 0, '历史核发月份不能按今天判断分期到期')
  assert.equal(oldPlan.data.receipts.length, 1)
  assert.equal(oldPlan.data.receipts[0].businessMonth, businessMonth)
  const nextPlan = await call('list', { personal: true, referenceMonth: core.addMonth(businessMonth, 1) }, 'e')
  assert.equal(nextPlan.data.stats.currentDue, 209, '核发月包含历史业务分期')
  assert.equal(nextPlan.data.stats.settledCommission, 209)
  assert.equal((await call('list', { filters: { businessMonth, district: '沙市区' } }, 'e')).data.receipts.length, 0)
  // 同一人员下月调区县：个人资料刷新，但历史反馈仍归当月区县。
  const transfer = file('transfer', [row('JZ001', [2, 0, 0, 0, 0, 0, 0, 0], '沙市区')])
  transfer.businessMonth = core.addMonth(businessMonth, 1)
  transfer.cutoffDate = transfer.businessMonth + '-01'
  await publish(transfer)
  openid = 'e'
  const refreshed = await users.main({ action: 'getUserInfo' })
  assert.equal(refreshed.data.district, '沙市区')
  assert.equal(db.rows('users').find(user => user.openid === 'e').district, '荆州区', '读取最新归属不改历史身份快照')
  await db.collection('feedback_routes').doc('sales-jz').set({ data: {
    district: '荆州区', status: 'active', districtManager: { name: '导入员', gridAccount: 'ADMIN_GRID' }, supervisor: { name: '系统测试员', gridAccount: 'SYSTEM_GRID' }
  } })
  async function callFeedback(action, data = {}, who = 'e') {
    openid = who
    return feedbackModule.main({ action, data: { workspaceType: 'sales', ...data } })
  }
  await db.collection('feedback_routes').doc('sales-shashi').set({ data: {
    district: '沙市区', status: 'active', districtManager: { gridAccount: 'UNMATCHED_MANAGER' }
  } })
  const noHandlerAccount = await callFeedback('listPending', {}, 'county')
  assert.equal(noHandlerAccount.success, true, noHandlerAccount.error)
  assert.equal(noHandlerAccount.data.canResolve, false, '缺少网格通账号或监督员配置时不能误判处理权限')
  const context = await callFeedback('getSalesContext', { salaryMonth: businessMonth })
  assert.equal(context.success, true, context.error)
  assert.equal(context.data.salaryAmount, 600)
  assert.equal(context.data.district, '荆州区')
  const submitted = await callFeedback('create', { salaryMonth: businessMonth,
    sourceBatchId: context.data.batchId, salaryAmount: 999999, content: '核对分期金额' })
  assert.equal(submitted.success, true, submitted.error)
  const ticketId = submitted.data.feedbackId
  const ticket = db.rows('salary_feedbacks').find(item => item._id === ticketId)
  assert.equal(ticket.salaryAmount, 600, '反馈金额由云端快照确定')
  assert.equal(ticket.district, '荆州区')
  assert.equal(ticket.managerReview.gridAccount, 'ADMIN_GRID')
  assert.equal(ticket.managerReview.openid, undefined, '待办配置不再保存处理人openid')
  assert.equal((await callFeedback('listPending', {}, 'admin')).data.records.length, 1, '管理人员无需认领即可处理')
  assert.equal((await callFeedback('listPending', {}, 'e')).data.canResolve, false)
  assert.equal(ticket.workflowVersion, 2)
  assert.equal(ticket.messages.length, 1)
  assert.equal((await callFeedback('resolve', { feedbackId: ticketId, responseText: '越权答复' }, 'e')).success, false)
  assert.equal((await callFeedback('resolve', { feedbackId: ticketId, responseText: '跨区县答复' }, 'county')).success, false)
  // 同时答复只能提交一次；员工可以继续反馈，最后由本人确认结束。
  const reviewed = await Promise.all([
    callFeedback('resolve', { feedbackId: ticketId, responseText: '已核对分期规则', fileIDs: ['cloud://reply-image'] }, 'admin'),
    callFeedback('resolve', { feedbackId: ticketId, responseText: '另一次并发答复' }, 'system')
  ])
  assert.equal(reviewed.filter(result => result.success).length, 1)
  let finished = db.rows('salary_feedbacks').find(item => item._id === ticketId)
  assert.equal(finished.status, 'awaiting_submitter')
  assert.equal(finished.processLogs.length, 2)
  assert.equal(finished.messages.length, 2)
  assert.equal([finished.managerReview.status, finished.supervisorReview.status].includes('not_required'), true)
  assert.equal((await callFeedback('confirmResolved', { feedbackId: ticketId }, 'admin')).success, false)
  assert.equal((await callFeedback('continueFeedback', { feedbackId: ticketId, content: '他人补充' }, 'a')).success, false)
  assert.equal((await callFeedback('continueFeedback', { feedbackId: ticketId, content: '仍需核对', fileIDs: ['cloud://follow-up'] })).success, true)
  finished = db.rows('salary_feedbacks').find(item => item._id === ticketId)
  assert.equal(finished.status, 'pending')
  assert.equal(finished.roundNo, 2)
  assert.equal(finished.district, '荆州区', '继续反馈沿用原业务月份区县')
  assert.equal((await callFeedback('confirmResolved', { feedbackId: ticketId })).success, false)
  assert.equal((await callFeedback('resolve', { feedbackId: ticketId, responseText: '补充说明' }, 'system')).success, true)
  assert.equal((await callFeedback('confirmResolved', { feedbackId: ticketId })).success, true)
  finished = db.rows('salary_feedbacks').find(item => item._id === ticketId)
  assert.equal(finished.status, 'closed')
  assert.equal(finished.messages.length, 5)
  assert.equal((await callFeedback('continueFeedback', { feedbackId: ticketId, content: '结束后追加' })).success, false)
  assert.equal(feedback.normalizeFeedbackStatus({ ...ticket, workflowVersion: 1, messages: [], status: 'approved',
    managerReview: { ...ticket.managerReview, status: 'approved', reviewNote: '历史答复' } }).status, 'awaiting_submitter')
  // 集客名册中的监督员只取得指定销售反馈的处理权限，不能读取销售业务数据。
  await db.collection('users').doc('line').update({ data: { lineProjectRoles: ['district_supervisor'], managedDistricts: ['荆州区'] } })
  await db.collection('feedback_routes').doc('sales-jz').update({ data: { supervisor: { name: '集客测试', gridAccount: 'GRID001' } } })
  const secondTicket = await callFeedback('create', { salaryMonth: businessMonth, sourceBatchId: context.data.batchId, content: '请监督员协助' })
  assert.equal(secondTicket.success, true, secondTicket.error)
  assert.equal((await callFeedback('listPending', {}, 'line')).data.records.length, 1)
  assert.equal((await call('getSummary', { businessMonth }, 'line')).success, false)
  assert.equal((await callFeedback('resolve', { feedbackId: secondTicket.data.feedbackId, responseText: '集客处理人答复销售问题' }, 'line')).success, true)
  assert.equal((await callFeedback('confirmResolved', { feedbackId: secondTicket.data.feedbackId })).success, true)
  // 普通集客账号和姓名不匹配的账号不能通过切换工作台取得处理权限。
  await db.collection('users').doc('line').update({ data: { lineProjectRoles: [], managedDistricts: [] } })
  assert.equal((await callFeedback('listPending', {}, 'line')).success, false)
  await db.collection('users').doc('line').update({ data: { lineProjectRoles: ['district_supervisor'], managedDistricts: ['荆州区'], realName: '错误姓名' } })
  const unmatched = await callFeedback('create', { salaryMonth: businessMonth, sourceBatchId: context.data.batchId, content: '姓名不匹配测试' })
  assert.equal(unmatched.success, true, unmatched.error)
  assert.equal(db.rows('salary_feedbacks').find(item => item._id === unmatched.data.feedbackId).supervisorReview.status, 'not_required')
  await db.collection('users').doc('line').update({ data: { realName: '集客测试' } })
  // 现任名单直接接续旧待办，原快照中的账号/openid 均不能保留处理权限。
  await db.collection('users').doc('replacement').set({ data: { _id: 'replacement', openid: 'replacement', workspaceType: 'sales',
    role: 'district_manager', status: 'active', realName: '新任经理', gridAccount: 'NEW_MANAGER', salesManagedDistrict: '荆州区' } })
  const handoverTicket = await callFeedback('create', { salaryMonth: businessMonth, sourceBatchId: context.data.batchId, content: '交接前未答复问题' })
  assert.equal(handoverTicket.success, true, handoverTicket.error)
  const handoverId = handoverTicket.data.feedbackId
  await db.collection('salary_feedbacks').doc(handoverId).update({ data: {
    managerReview: { openid: 'admin', gridAccount: 'ADMIN_GRID', name: '导入员', status: 'pending' }
  } })
  await db.collection('feedback_routes').doc('sales-jz').update({ data: {
    districtManager: { name: '新任经理', gridAccount: 'NEW_MANAGER' }
  } })
  assert.equal((await callFeedback('listPending', {}, 'admin')).data.canResolve, false)
  assert.equal((await callFeedback('resolve', { feedbackId: handoverId, responseText: '原经理继续处理' }, 'admin')).success, false)
  assert((await callFeedback('listPending', {}, 'replacement')).data.records.some(record => record._id === handoverId))
  await db.collection('feedback_routes').doc('duplicate-route').set({ data: {
    district: '荆州区', status: 'active', districtManager: { name: '新任经理', gridAccount: 'NEW_MANAGER' }
  } })
  assert.equal((await callFeedback('listPending', {}, 'replacement')).data.canResolve, false, '冲突名单不得授予处理权限')
  assert.equal((await callFeedback('resolve', { feedbackId: handoverId, responseText: '冲突名单测试' }, 'replacement')).success, false)
  await db.collection('feedback_routes').doc('duplicate-route').update({ data: { status: 'inactive' } })
  await db.collection('users').doc('replacement').update({ data: { salesManagedDistrict: '沙市区' } })
  assert.equal((await callFeedback('resolve', { feedbackId: handoverId, responseText: '错误管理区县' }, 'replacement')).success, false)
  await db.collection('users').doc('replacement').update({ data: { salesManagedDistrict: '荆州区', openid: 'replacement-new-wechat' } })
  assert((await callFeedback('listPending', {}, 'replacement-new-wechat')).data.records.some(record => record._id === handoverId), '处理权限跟随当前名单账号，无需配置微信openid')
  assert.equal((await callFeedback('resolve', { feedbackId: handoverId, responseText: '现任经理接续答复' }, 'replacement-new-wechat')).success, true)
  const handoverResult = db.rows('salary_feedbacks').find(record => record._id === handoverId)
  assert.equal(handoverResult.resolution.handler.openid, 'replacement-new-wechat', '实际操作人仍有审计记录')
  assert.equal(handoverResult.processLogs[0].operator.openid, 'e')
  assert.equal((await callFeedback('confirmResolved', { feedbackId: handoverId })).success, true)
  await db.collection('feedback_routes').doc('sales-jz').update({ data: {
    districtManager: { name: '导入员', gridAccount: 'ADMIN_GRID' }
  } })
  // 同一套对话逻辑仍保留集客签字确认限制，销售与集客工单互不可越权。
  await db.collection('users').doc('line-worker').set({ data: { _id: 'line-worker', openid: 'line-worker', workspaceType: 'line_project',
    role: 'sales_person', status: 'active', realName: '集客员工', gridAccount: 'LINE_WORKER', district: '荆州区', gridName: '集客网格' } })
  await db.collection('line_project_records').doc('line-work').set({ data: {
    userOpenid: 'line-worker', settlementMonth: businessMonth, importBatchId: 'line-batch', publishStatus: 'published'
  } })
  const lineData = { workspaceType: 'line_project', salaryMonth: businessMonth }
  const lineTicket = await callFeedback('create', { ...lineData, content: '集客工费核对', salaryAmount: 12 }, 'line-worker')
  assert.equal(lineTicket.success, true, lineTicket.error)
  const lineId = lineTicket.data.feedbackId
  assert.equal((await callFeedback('resolve', { workspaceType: 'line_project', feedbackId: ticketId, responseText: '跨工作台' }, 'line')).success, false)
  assert.equal((await callFeedback('resolve', { feedbackId: lineId, responseText: '跨工作台' }, 'admin')).success, false)
  assert.equal((await callFeedback('resolve', { ...lineData, feedbackId: lineId, responseText: '集客答复' }, 'line')).success, true)
  assert.equal((await callFeedback('continueFeedback', { ...lineData, feedbackId: lineId, content: '集客补充' }, 'line-worker')).success, true)
  assert.equal((await callFeedback('resolve', { ...lineData, feedbackId: lineId, responseText: '集客再次答复' }, 'line')).success, true)
  assert.equal((await callFeedback('confirmResolved', { ...lineData, feedbackId: lineId }, 'line-worker')).success, true)
  await db.collection('line_project_month_confirms').doc('line-confirm').set({ data: {
    workspaceType: 'line_project', scene: 'line_project_workorders', submitter: { openid: 'line-worker' },
    settlementMonth: businessMonth, status: 'confirmed', importBatchNos: ['line-batch']
  } })
  const signedFeedback = await callFeedback('create', { ...lineData, content: '签字后提交' }, 'line-worker')
  assert.equal(signedFeedback.success, false)
  assert.match(signedFeedback.error, /签字确认/)
  const adjusted = { ...concurrent, cutoffDate: businessMonth + '-16' }
  await publish(adjusted)
  assert.equal((await callFeedback('create', { salaryMonth: businessMonth, sourceBatchId: context.data.batchId, content: '旧版本' })).success, false)
  assert.equal((await callFeedback('listManaged', {}, 'admin')).success, false, '销售人员不能调用集客管理查询')
  // 角色晋升后，原有管理人员绑定不计入普通员工参与率。
  await db.collection('users').doc('f').update({ data: { role: 'sales_department' } })
  assert.equal((await call('getSummary', { businessMonth })).data.participation.expected, 1)
  await db.collection('users').doc('f').update({ data: { role: 'sales_person' } })
  const beforeClear = db.rows('sales_active_versions').find(version => version.businessMonth === businessMonth && version.district === '沙市区')
  assert.equal((await call('clearDistrictMonth', { ...beforeClear, reason: '人员已全部调出' }, 'county')).success, false)
  assert.equal((await call('clearDistrictMonth', { ...beforeClear, reason: '人员已全部调出' }, 'system')).success, true)
  assert.equal((await call('getSummary', { businessMonth }, 'county')).data.totalQuantity, 0)
  assert(db.rows('sales_employees').some(binding => binding.employeeId === 'JZ004'), '清空区县不删除绑定')
  assert.equal((await call('clearDistrictMonth', { ...beforeClear, reason: '旧版本请求' }, 'system')).success, false)
  await db.collection('users').doc('e').update({ data: { status: 'inactive' } })
  openid = 'e'
  assert.equal((await users.main({ action: 'getUserInfo' })).success, false)
  assert.equal((await callFeedback('getSalesContext', { salaryMonth: businessMonth })).success, false)
  await db.collection('users').doc('e').update({ data: { status: 'active' } })
  let mockSalesResponse = { success: true, data: { records: [], stats: {} } }
  const salesService = load('utils/sales-service.js', {
    wx: { cloud: { callFunction: async request => ({ result: request.data.action === 'getAccess'
      ? { success: true, apiVersion: 'sales-monthly-v2', data: { role: 'sales_person', canImport: false } } : mockSalesResponse }) } }
  })
  await assert.rejects(salesService.callSales('list'), /接口版本不一致/)
  mockSalesResponse = { success: true, apiVersion: 'sales-monthly-v2', data: { records: [], stats: {} } }
  await assert.rejects(salesService.callSales('list'), /返回格式异常/)
  mockSalesResponse = { success: false, apiVersion: 'sales-monthly-v2', error: '请创建销售集合' }
  await assert.rejects(salesService.callSales('list'), /请创建销售集合/)
  // 云端超时给出可执行提示，不自动重发正式发布请求。
  let timeoutCalls = 0
  const timeoutService = load('utils/sales-service.js', {
    wx: { cloud: { callFunction: async () => {
      timeoutCalls++
      throw { errMsg: 'cloud.callFunction:fail Error: errCode: -504003 | Invoking task timed out after 3 seconds' }
    } } }
  })
  let importTimeout
  await assert.rejects(timeoutService.callSales('importCommit'), error => {
    importTimeout = error
    assert.equal(error.code, 'SALES_FUNCTION_TIMEOUT')
    assert.match(error.message, /businessData.*60秒/)
    assert.match(error.message, /发布结果尚未确认/)
    return true
  })
  assert.equal(timeoutCalls, 1, '超时不得自动重发发布请求')
  await assert.rejects(timeoutService.callSales('importPreview'), error => {
    assert.equal(error.code, 'SALES_FUNCTION_TIMEOUT')
    assert(!error.message.includes('发布结果尚未确认'))
    return true
  })
  let importPage, failCommit = true
  const importCalls = [], importErrors = [], importToasts = []
  load('pages/collect/collect.js', {
    Page: page => { importPage = page },
    require: name => name.endsWith('/auth') ? {} : {
      currentMonth: core.monthNow,
      callSales: async action => {
        importCalls.push(action)
        if (action === 'importCommit') { if (failCommit) throw importTimeout; return { batchId: 'published-batch' } }
        if (!failCommit) throw new Error('模拟刷新失败')
        return { records: [{ batchId: 'published-batch' }], versions: [] }
      }
    },
    wx: { showModal: input => input.success({ confirm: true }), showToast: input => importToasts.push(input.title) }
  })
  importPage.setData = patch => Object.assign(importPage.data, patch)
  importPage.showError = error => importErrors.push(error.message)
  const pendingPreview = { previewToken: 'token', errors: [], meta: { districts: ['荆州区'] } }
  importPage.setData({ preview: pendingPreview, file: { name: '业务量.xlsx' }, fileID: 'uploaded-file' })
  await importPage.commitImport()
  assert.deepEqual(importCalls, ['importCommit', 'getImportBatches'])
  assert.equal(importPage.data.preview, null, '超时后旧预览失效，重新预览才可提交')
  assert.equal(importPage.data.fileID, 'uploaded-file', '保留已上传文件供重新预览')
  assert.equal(importPage.data.batches.length, 1, '超时后刷新已发布批次')
  assert.equal(importPage.data.busy, false)
  failCommit = false
  importPage.setData({ preview: pendingPreview })
  await importPage.commitImport()
  assert.equal(importToasts[0], '发布成功')
  assert.match(importErrors[1], /发布已完成.*刷新失败/, '发布成功后刷新失败不能报告发布失败')
  assert.equal(importPage.data.fileID, '')
  let summaryPage, renderDone, receiptCalls = 0, summaryFailure = false
  const viewService = load('utils/sales-service.js', { wx: { cloud: { callFunction: async request => {
    if (request.data.action === 'recordReceipt') { receiptCalls++; return { result: { success: true, apiVersion: 'sales-monthly-v2', data: {} } } }
    if (summaryFailure) throw new Error('模拟汇总加载失败')
    return { result: { success: true, apiVersion: 'sales-monthly-v2', data: { ...firstSummary, districtOptions: [] } } }
  } } } })
  load('pages/summary/summary.js', {
    Page: page => { summaryPage = page },
    require: name => name === '../../utils/auth' ? { ensureLoggedIn: async () => true } : viewService,
    wx: { stopPullDownRefresh() {} }
  })
  summaryPage.setData = (patch, callback) => { Object.assign(summaryPage.data, patch); if (callback) renderDone = callback }
  summaryPage.visible = true
  const rendering = summaryPage.loadData()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(receiptCalls, 0, '渲染回调完成前不记录查看')
  renderDone()
  await rendering
  assert.equal(receiptCalls, 1)
  const hidden = summaryPage.loadData()
  await new Promise(resolve => setImmediate(resolve))
  summaryPage.onHide()
  renderDone()
  await hidden
  assert.equal(receiptCalls, 1, '渲染完成前离开页面不记录查看')
  summaryPage.visible = true
  summaryFailure = true
  await summaryPage.loadData()
  assert.equal(receiptCalls, 1, '加载失败不记录查看')
  assert.match(summaryPage.data.error, /加载失败/)
  for (const who of ['admin', 'county', 'system']) {
    let page
    const actions = []
    load('pages/login/login.js', {
      Page: value => { page = value },
      require: name => name === '../../utils/sales-service' ? {
        currentMonth: core.monthNow, renderSalesData: salesService.renderSalesData,
        callSales: async (action, data) => { actions.push(action); const value = await call(action, data, who); if (!value.success) throw new Error(value.error); return value.data }
      } : require('./utils/' + name.split('/').pop()),
      wx: { cloud: { callFunction: async () => ({ result: await callFeedback('listPending', {}, who) }) } }
    })
    page.setData = (patch, callback) => { Object.assign(page.data, patch); if (callback) callback() }
    page.visible = true
    page.setUserState({ ...db.rows('users').find(user => user.openid === who), currentWorkspaceType: 'sales' })
    page.data.monthLabel = businessMonth
    await page.loadDashboard()
    assert.equal(page.data.isEmployee, false)
    assert.equal(page.data.showProfileModal, false)
    assert(page.data.participation, '管理首页展示接收情况')
    assert(!actions.includes('list'), '管理首页不请求个人酬金')
    assert.equal(page.data.errorText, '')
  }
  let feedbackPage
  const feedbackRequests = []
  load('pages/feedback/feedback.js', {
    Page: value => { feedbackPage = value },
    require: name => name.endsWith('/workspace') ? require('./utils/workspace') : {},
    wx: { cloud: { callFunction: async request => { feedbackRequests.push(request); return { result: { success: true, data: {} } } } } }
  })
  feedbackPage.setData = patch => Object.assign(feedbackPage.data, patch)
  feedbackPage.initPageContext({ workspaceType: 'sales', mode: 'handle' })
  await feedbackPage.callFeedbackFunction('resolve', { feedbackId: ticketId, responseText: '答复' })
  assert.equal(feedbackRequests[0].data.data.workspaceType, 'sales', '答复请求必须携带工作台上下文')
  assert.equal(feedbackPage.ensureWorkspaceAccess(db.rows('users').find(user => user.openid === 'line')), true)
  assert.equal(feedbackPage.getStatusText('awaiting_submitter'), '待您确认')
  assert.equal(feedbackPage.buildFeedbackList([finished])[0].isClosed, true)
  let managePage
  const exports = []
  load('pages/manage/manage.js', {
    Page: value => { managePage = value },
    require: name => name === '../../utils/auth' ? { ensureLoggedIn: async () => true }
      : name === '../../utils/sales-service' ? {
        currentMonth: core.monthNow, renderSalesData: salesService.renderSalesData,
        callSales: async () => ({ records: [], versions: [], receipts: [], total: 0, stats: {}, referenceMonth: core.monthNow(), filterOptions: { districts: [] } }),
        exportSales: async filters => exports.push({ ...filters })
      } : products,
    wx: { stopPullDownRefresh() {}, showLoading() {}, hideLoading() {} }
  })
  managePage.visible = true
  managePage.setData = (patch, callback) => {
    for (const [key, value] of Object.entries(patch)) {
      const fields = key.split('.')
      fields.slice(0, -1).reduce((object, field) => object[field], managePage.data)[fields[fields.length - 1]] = value
    }
    if (callback) callback()
  }
  await managePage.loadData()
  managePage.onSearchInput({ detail: { value: '尚未查询' } })
  await managePage.exportData()
  assert.equal(exports[0].developer, '', '导出沿用已查询的条件')
  await managePage.loadData()
  await managePage.exportData()
  assert.equal(exports[1].developer, '尚未查询')
  managePage.resetFilter()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(managePage.data.appliedFilters.businessMonth, core.monthNow(), '重置回当前月')
  for (const name of ['collect', 'login', 'manage', 'profile', 'summary', 'feedback']) {
    let page
    const runtimeRequire = request => {
      if (name === 'login' && request === '../../utils/sales-service') return salesService
      if (request.startsWith('../../utils/')) return require('./utils/' + request.split('/').pop())
      return require(request)
    }
    load('pages/' + name + '/' + name + '.js', {
      Page: definition => { page = definition }, require: runtimeRequire,
      wx: { getStorageSync() {}, getAccountInfoSync() { return {} } }
    })
    if (name === 'login') {
      page.setData = (patch, callback) => { Object.assign(page.data, patch); if (callback) callback() }
      page.visible = true
      mockSalesResponse = { success: true, data: { records: [], stats: {} } }
      await page.loadDashboard()
      assert.match(page.data.errorText, /接口版本不一致/)
      assert.equal(page.data.stats.monthCommission, '0.00')
      assert.equal(page.data.monthStatus, '加载失败')
      page.data.monthLabel = businessMonth
      mockSalesResponse = await call('list', { personal: true, referenceMonth: businessMonth }, 'e')
      await page.loadDashboard()
      assert.equal(page.data.stats.monthRecords, 10)
      assert.equal(page.data.stats.monthCommission, '600.00')
    }
    const template = read('pages/' + name + '/' + name + '.wxml').replace(/<!--[\s\S]*?-->/g, '')
    const stack = [], tags = /<\/?([a-z][\w-]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>/gi
    for (const match of template.matchAll(tags)) {
      if (match[0].startsWith('</')) assert.equal(stack.pop(), match[1], name + '标签嵌套')
      else if (!match[0].endsWith('/>')) stack.push(match[1])
    }
    assert.equal(stack.length, 0, name + '标签闭合')
    for (const [, handler] of template.matchAll(/\b(?:bind|catch)(?:tap|change|input|confirm|scrolltolower)="([^"]+)"/g)) {
      assert.equal(typeof page[handler], 'function', name + '缺少方法：' + handler)
    }
  }
  const appConfig = JSON.parse(read('app.json'))
  assert(!appConfig.tabBar.list.some(item => item.pagePath === 'pages/collect/collect'))
  assert(appConfig.tabBar.list.some(item => item.pagePath === 'pages/summary/summary'))
  console.log('通过：角色首页/资料隔离、查询导出一致、业务与核发月份、调区县历史反馈、可信金额/版本、销售/集客反馈闭环与跨工作台权限、换人接续与即时撤权、并发答复、导入超时提示/结果刷新、重复导入/清空更正、参与率、认领与页面结构。')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
