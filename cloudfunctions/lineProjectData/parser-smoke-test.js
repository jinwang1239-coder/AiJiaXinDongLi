const assert = require('assert')
const fs = require('fs')
const Module = require('module')
let XLSX
try {
  XLSX = require('xlsx')
} catch (error) {
  XLSX = require('../businessData/node_modules/xlsx')
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'xlsx') {
    return XLSX
  }
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return {
          command: {},
          collection() {
            throw new Error('解析冒烟测试不应访问数据库')
          }
        }
      },
      getWXContext() {
        return { OPENID: 'test' }
      }
    }
  }
  return originalLoad(request, parent, isMain)
}

const sourceFile = process.argv[2]
assert(sourceFile, '用法：node parser-smoke-test.js <集客线路导入模板.xlsx>')
const fileContent = fs.readFileSync(sourceFile)
const workbook = XLSX.read(fileContent, { type: 'buffer', cellFormula: true })
const usersByGridAccount = {}
for (const sheetName of ['集客开通', '集客维护', '集客计次', '杆路维护', '抢修配置']) {
  const worksheet = workbook.Sheets[sheetName]
  assert(worksheet, `缺少工作表 ${sheetName}`)
  const range = XLSX.utils.decode_range(worksheet['!ref'])
  const startRowNo = sheetName === '集客开通' ? 6 : 2
  for (let rowNo = startRowNo; rowNo <= range.e.r + 1; rowNo += 1) {
    const value = column => String((worksheet[`${column}${rowNo}`] || {}).v || '').trim()
    const gridAccount = value('C')
    if (!gridAccount) continue
    usersByGridAccount[gridAccount] = [{
      openid: `openid_${gridAccount}`,
      status: 'active',
      workspaceType: 'line_project',
      gridAccount,
      realName: value('D'),
      district: value('B')
    }]
  }
}

const parser = require('./index').__test__.parseWorkbook
const result = parser(fileContent, {
  settlementMonth: '2026-03',
  fileName: sourceFile,
  user: { openid: 'admin' },
  bindingContext: { usersByGridAccount }
})

assert.strictEqual(result.blockingErrors.length, 0, JSON.stringify(result.blockingErrors, null, 2))
assert(result.records.length > 0, '未解析到有效数据')
assert.strictEqual(result.summary.totalGridAccounts, Object.keys(usersByGridAccount).length)
assert.strictEqual(result.moduleSummaries.length, 5)
assert.deepStrictEqual(result.moduleSummaries.map(item => item.subCategory), ['集客开通', '集客维护', '集客计次', '杆路维护', '抢修配置'])
const openingSummary = result.moduleSummaries.find(item => item.subCategory === '集客开通')
const openingRecords = result.records.filter(item => item.subCategory === '集客开通')
assert(Math.abs(openingSummary.importedAmountTotal - openingRecords.reduce((sum, item) => sum + item.calculatedAmount, 0)) <= 0.01)
for (const summary of result.moduleSummaries.filter(item => item.subCategory !== '集客开通')) {
  assert(summary.successRows > 0, `${summary.subCategory} 未解析到有效数据`)
  assert(summary.businessQtyTotal > 0, `${summary.subCategory} 未解析业务量`)
  assert(result.records.some(record => (
    record.subCategory === summary.subCategory &&
    record.completionDateText &&
    record.siteLevel &&
    record.endpoint
  )), `${summary.subCategory} 未保留标准业务量型模板字段`)
}
const firstStandardWorkOrderName = String((workbook.Sheets['集客维护'].G2 || {}).v || '')
assert(result.records.some(record => (
  record.subCategory === '集客计次' &&
  record.workOrderNameRaw === firstStandardWorkOrderName
)), '模块必须按工作表名称识别，不能按当前重复的示例工单文本误判')

const pendingResult = parser(fileContent, {
  settlementMonth: '2026-03',
  fileName: sourceFile,
  bindingContext: { usersByGridAccount: {} }
})
assert.strictEqual(pendingResult.blockingErrors.length, 0, JSON.stringify(pendingResult.blockingErrors, null, 2))
assert.strictEqual(pendingResult.summary.pendingClaimRows, pendingResult.summary.totalRows)
assert.strictEqual(pendingResult.summary.pendingClaimAccounts, pendingResult.summary.totalGridAccounts)
assert(pendingResult.records.every(record => (
  record.bindingStatus === 'pending_claim' && !record.userOpenid
)), '未注册账号应保存为待认领记录')

console.log(JSON.stringify(result.summary, null, 2))
