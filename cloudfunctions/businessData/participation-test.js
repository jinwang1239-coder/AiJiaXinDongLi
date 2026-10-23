const assert = require('assert')
const Module = require('module')
const XLSX = require('xlsx')

const month = '2026-10'
let state
function reset() {
  const row = (employeeId, district = '监利', batch = 'batch-a') => ({
    businessMonth: month, district, importBatchId: batch, employeeId,
    gridName: '测试网格', realName: '员工' + employeeId, items: [], quantity: 0
  })
  const receipt = (employeeId, userOpenid, batch = 'batch-a', district = '监利') => ({
    businessMonth: month, district, activeBatchId: batch, employeeId, userOpenid,
    viewedAt: new Date('2026-10-22T01:02:03Z')
  })
  state = {
    users: [
      { _id: 'admin', openid: 'test', role: 'system_admin', status: 'active', workspaceType: 'sales' },
      { openid: 'wx006', role: 'district_manager', employeeId: '006' },
      { openid: 'old-manager', role: 'sales_department', employeeId: '007' }
    ],
    sales_active_versions: [
      { businessMonth: month, district: '监利', activeBatchId: 'batch-a', revision: 1, cutoffDate: '2026-10-22', finalized: false },
      { businessMonth: month, district: '洪湖', activeBatchId: 'batch-b', revision: 2, cutoffDate: '2026-10-21', finalized: true },
      { businessMonth: '2026-08', district: '监利', activeBatchId: 'historical' }
    ],
    sales_month_records: ['001', '002', '003', '004', '005', '006', '007', '001'].map(id => row(id))
      .concat(row('008', '洪湖', 'batch-b'), { ...row('999', '监利', 'historical'), businessMonth: '2026-08' }),
    sales_employees: ['001', '003', '004', '005', '006', '007', '008'].map(id => ({ employeeId: id, userOpenid: 'wx' + id })),
    sales_data_receipts: [receipt('001', 'wx001'), receipt('004', 'old-wx004'), receipt('005', 'wx005', 'old-batch'),
      receipt('006', 'wx006'), receipt('008', 'wx008', 'batch-b', '洪湖')],
    versionReads: 0
  }
}

// 只模拟数据库读取，真实执行云函数入口、权限检查、统计与 xlsx 序列化。
const db = {
  command: { in: values => ({ values }) },
  collection(name) {
    let condition = {}, offset = 0, limit = Infinity
    return {
      where(value) { condition = value; return this },
      skip(value) { offset = value; return this },
      limit(value) { limit = value; return this },
      async get() {
        if (name === 'sales_active_versions') {
          state.versionReads++
          if (state.mutateAt === state.versionReads) state.mutateVersions()
        }
        const rows = state[name].filter(row => Object.entries(condition).every(([key, value]) =>
          value && value.values ? value.values.includes(row[key]) : row[key] === value))
        return { data: structuredClone(rows.slice(offset, offset + limit)) }
      }
    }
  }
}
const originalLoad = Module._load
let main
try {
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return {
      init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => db, getWXContext: () => ({ OPENID: 'test' })
    }
    return originalLoad(request, parent, isMain)
  }
  main = require('./index').main
} finally { Module._load = originalLoad }

async function call(action, data = {}) {
  const response = await main({ action, data })
  assert.strictEqual(response.success, true, response.error)
  return response.data
}
function workbook(result) {
  return XLSX.read(result.base64, { type: 'base64' })
}
function rows(book, name) {
  return XLSX.utils.sheet_to_json(book.Sheets[name], { range: 4, defval: '' })
}
async function rejected(data, message) {
  // 预期的拒绝不输出云函数错误堆栈。
  const originalError = console.error
  let response
  try {
    console.error = () => {}
    response = await main({ action: 'exportParticipation', data })
  } finally { console.error = originalError }
  assert.strictEqual(response.success, false)
  assert.match(response.error, message)
}

;(async () => {
  reset()
  assert.strictEqual((await call('getAccess')).canExportParticipation, true)
  const homepage = (await call('getSummary', { businessMonth: month })).participation
  const exported = await call('exportParticipation', { businessMonth: month })
  assert.deepStrictEqual(exported.participation, homepage)
  assert.deepStrictEqual([homepage.expected, homepage.received, homepage.pending], [7, 2, 5])
  const book = workbook(exported)
  assert.deepStrictEqual(book.SheetNames, ['区县汇总', '已接收人员', '未接收人员'])
  assert.strictEqual(exported.filename, '员工数据接收情况_2026-10_全市.xlsx')
  const received = rows(book, '已接收人员'), pending = rows(book, '未接收人员')
  assert.strictEqual(received.length, 2)
  assert.strictEqual(pending.length, 5)
  for (const district of homepage.districts) {
    const summary = rows(book, '区县汇总').find(item => item['区县'] === district.district)
    assert.strictEqual(summary['应接收人数'], district.expected)
    assert.strictEqual(received.filter(item => item['区县'] === district.district).length, district.received)
    assert.strictEqual(pending.filter(item => item['区县'] === district.district).length, district.pending)
  }
  const first = received.find(item => item['员工编号'] === '001')
  assert.strictEqual(first['首次接收时间'], '2026-10-22 09:02:03')
  assert.strictEqual(first['统计截止日期'], '2026-10-22')
  assert.strictEqual(first['有效批次'], 'batch-a')
  const idColumn = Object.entries(book.Sheets['已接收人员']).find(([key, value]) => /^[A-Z]+5$/.test(key) && value.v === '员工编号')[0].replace('5', '6')
  assert.strictEqual(book.Sheets['已接收人员'][idColumn].t, 's')
  assert.strictEqual(pending.find(item => item['员工编号'] === '002')['认领状态'], '未认领')
  assert.strictEqual(pending.find(item => item['员工编号'] === '004')['认领状态'], '已认领但未查看当前版本')
  assert(!received.concat(pending).some(item => ['006', '999'].includes(item['员工编号'])))

  const single = await call('exportParticipation', { businessMonth: month, district: '洪湖' })
  const singleBook = workbook(single)
  assert.deepStrictEqual(rows(singleBook, '区县汇总').map(item => item['区县']), ['洪湖', '合计'])
  assert.deepStrictEqual(rows(singleBook, '已接收人员').map(item => item['员工编号']), ['008'])
  assert.deepStrictEqual(rows(singleBook, '未接收人员'), [])
  assert.strictEqual(rows(singleBook, '区县汇总')[0]['版本状态'], '已定版')

  const empty = await call('exportParticipation', { businessMonth: '2026-09' })
  const emptyBook = workbook(empty)
  assert.strictEqual(empty.participation.expected, 0)
  assert.strictEqual(empty.participation.rate, '—')
  for (const name of ['已接收人员', '未接收人员']) {
    assert.deepStrictEqual(rows(emptyBook, name), [])
    assert.strictEqual(emptyBook.Sheets[name].A5.v, '业务月份')
    assert.match(emptyBook.Sheets[name].D3.v, /暂无有效数据/)
  }
  await rejected({ businessMonth: '2026-13' }, /有效业务月份/)
  await rejected({ businessMonth: month, district: '其他区县' }, /区县无效/)

  // 市场营销部是全市管理账号，按钮权限与导出接口必须同时放行，不依赖导入权限。
  reset()
  state.users[0].role = 'sales_department'
  assert.strictEqual((await call('getAccess')).canExportParticipation, true)
  const departmentExport = await call('exportParticipation', { businessMonth: month })
  assert.deepStrictEqual(departmentExport.participation, homepage)
  const departmentDistrictExport = await call('exportParticipation', { businessMonth: month, district: '洪湖' })
  assert.deepStrictEqual(rows(workbook(departmentDistrictExport), '已接收人员').map(item => item['员工编号']), ['008'])
  state.users[0].workspaceType = 'line_project'
  await rejected({ businessMonth: month }, /当前账号不可访问/)

  for (const role of ['sales_person', 'district_manager']) {
    reset()
    state.users[0].role = role
    assert.strictEqual((await call('getAccess')).canExportParticipation, false)
    await rejected({ businessMonth: month }, /仅市场营销部和系统管理员/)
    assert.strictEqual(state.versionReads, 0)
  }
  reset()
  state.users[0].status = 'inactive'
  await rejected({ businessMonth: month }, /当前账号不可访问/)

  reset()
  state.sales_data_receipts.push({ businessMonth: month, district: '监利', activeBatchId: 'batch-a',
    employeeId: '004', userOpenid: 'wx004', viewedAt: new Date() })
  assert.strictEqual((await call('exportParticipation', { businessMonth: month })).participation.received, 3)

  reset()
  state.sales_active_versions[0].activeBatchId = 'republished'
  state.sales_month_records.filter(row => row.district === '监利' && row.businessMonth === month)
    .forEach(row => { row.importBatchId = 'republished' })
  const republished = await call('exportParticipation', { businessMonth: month })
  assert.deepStrictEqual([republished.participation.expected, republished.participation.received], [7, 1])

  for (const mutation of ['replace', 'clear', 'add']) {
    reset()
    state.mutateAt = 2
    state.mutateVersions = () => {
      if (mutation === 'replace') state.sales_active_versions[0].activeBatchId = 'changed'
      if (mutation === 'clear') state.sales_active_versions[0].activeBatchId = ''
      if (mutation === 'add') state.sales_active_versions.push({ businessMonth: month, district: '石首', activeBatchId: 'new-district' })
    }
    await rejected({ businessMonth: month }, /导出期间数据版本已更新/)
  }

  let component
  global.Component = definition => { component = definition }
  try { require('../../components/sales-participation/sales-participation') } finally { delete global.Component }
  const events = []
  const instance = { data: { ...component.data }, properties: { canExport: true, exporting: false },
    setData(patch) { Object.assign(this.data, patch) }, triggerEvent(name, detail) { events.push({ name, detail }) } }
  component.observers.value.call(instance, homepage)
  component.methods.onExport.call(instance)
  component.methods.onExportScopeChange.call(instance, { detail: { value: '2' } })
  component.methods.onExport.call(instance)
  assert.deepStrictEqual(events, [{ name: 'export', detail: { district: '' } }, { name: 'export', detail: { district: '洪湖' } }])
  instance.properties.exporting = true
  component.methods.onExport.call(instance)
  instance.properties.exporting = false
  instance.properties.canExport = false
  component.methods.onExport.call(instance)
  assert.strictEqual(events.length, 2)
  console.log('员工接收导出测试通过：统计与明细一致、Excel、权限、换绑、版本切换、空数据及导出范围。')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
