const assert = require('assert')
const Module = require('module')

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'xlsx') {
    return {}
  }
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() { return { command: {} } },
      getWXContext() { return { OPENID: 'test' } }
    }
  }
  return originalLoad(request, parent, isMain)
}

const service = require('./index').__test__
const { APPROVAL_ROUTE_ROSTER } = require('./config')
assert.strictEqual(APPROVAL_ROUTE_ROSTER.length, 9)
assert.strictEqual(new Set(APPROVAL_ROUTE_ROSTER.map(item => item.district)).size, 9)
assert(APPROVAL_ROUTE_ROSTER.every(item => (
  /^\d{11}$/.test(item.supervisor.gridAccount) &&
  /^\d{11}$/.test(item.districtManager.gridAccount) &&
  item.supervisor.gridAccount !== item.districtManager.gridAccount
)))
assert.strictEqual(service.isSystemAdmin({ role: 'system_admin' }), true)
assert.strictEqual(service.isSystemAdmin({ role: 'sales_person', realName: '系统管理员' }), false)
assert.strictEqual(service.canImportLineProject({ role: 'system_admin' }), true)
assert.strictEqual(service.canImportLineProject({ role: 'sales_department' }), true)
assert.strictEqual(service.canImportLineProject({ role: 'district_manager' }), false)
assert.strictEqual(service.canImportLineProject({ role: 'sales_person' }), false)
assert.strictEqual(service.resolveRecordOwner({ usersByGridAccount: {} }, {
  gridAccount: '13277377736', personName: '文雄', district: '沙市区'
}).bindingStatus, 'pending_claim')
assert.strictEqual(service.resolveRecordOwner({ usersByGridAccount: {
  13277377736: [{ _id: 'u1', openid: 'o1', status: 'active', realName: '文雄', district: '沙市区' }]
} }, {
  gridAccount: '13277377736', personName: '文雄', district: '沙市区'
}).bindingStatus, 'bound')
assert.strictEqual(service.resolveRecordOwner({ usersByGridAccount: {
  13277377736: [{ _id: 'u1', openid: 'o1', status: 'active', realName: '其他姓名', district: '沙市区' }]
} }, {
  gridAccount: '13277377736', personName: '文雄', district: '沙市区'
}).matched, false)
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: ['b2', 'b1'] }, ['b1', 'b2']), true)
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: [] }, ['b1']), false)
assert.strictEqual(service.getRecordAmount({ importedAmount: 10, calculatedAmount: 99 }), 10)
assert.strictEqual(service.getRecordAmount({ calculatedAmount: 9.99 }), 9.99)
const fileHash = service.createFileHash(Buffer.from('same-file'))
assert.strictEqual(fileHash, service.createFileHash(Buffer.from('same-file')))
assert.notStrictEqual(fileHash, service.createFileHash(Buffer.from('changed-file')))
assert.strictEqual(
  service.buildFileFingerprint(fileHash, '2026-08', 222),
  service.buildFileFingerprint(fileHash, '2026-08', 222)
)
assert.notStrictEqual(
  service.buildFileFingerprint(fileHash, '2026-08', 222),
  service.buildFileFingerprint(fileHash, '2026-09', 222)
)
const importKey = service.buildRecordImportKey('batch_1', { subCategory: '集客开通', sourceRowNo: 6 })
assert.strictEqual(importKey.length, 32)
assert.strictEqual(importKey, service.buildRecordImportKey('batch_1', { subCategory: '集客开通', sourceRowNo: 6 }))
assert.notStrictEqual(importKey, service.buildRecordImportKey('batch_1', { subCategory: '集客维护', sourceRowNo: 6 }))
assert.strictEqual(service.isBatchLockActive({
  status: 'processing', updateTime: new Date('2026-08-13T00:20:00Z')
}, new Date('2026-08-13T00:30:00Z')), true)
assert.strictEqual(service.isBatchLockActive({
  status: 'processing', updateTime: new Date('2026-08-12T23:00:00Z')
}, new Date('2026-08-13T00:30:00Z')), false)
const breakdowns = service.buildDashboardBreakdowns([
  { subCategory: '集客开通', district: '沙市区', importedAmount: 10, workOrderKey: 'w1', personKey: 'p1' },
  { subCategory: '集客维护', district: '沙市区', importedAmount: 20, workOrderKey: 'w2', personKey: 'p2' },
  { subCategory: '集客维护', district: '荆州区', importedAmount: 30, workOrderKey: 'w3', personKey: 'p3' }
])
assert.strictEqual(breakdowns.moduleComposition.find(item => item.subCategory === '集客维护').amount, 50)
assert.strictEqual(breakdowns.districtComposition[0].district, '沙市区')
assert.strictEqual(breakdowns.districtComposition[0].amount, 30)

console.log('lineProjectData 权限与版本纯函数测试通过')
