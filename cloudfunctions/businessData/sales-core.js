const crypto = require('crypto')
const rules = require('./commission-rules')
const PRODUCT_NAMES = rules.getBusinessTypes()
const HEADERS = ['区县', '网格名称', '装维人员姓名', '员工编号', ...PRODUCT_NAMES]
const RULE_VERSION = 'sales-2026-10'
const DISTRICTS = ['监利', '洪湖', '石首', '松滋', '公安县', '江陵', '沙市区', '荆州区', '开发区']
const money = value => Math.round(Number(value || 0) * 100) / 100
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const monthNow = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7)
const employeeId = value => String(value || '').trim().toUpperCase()
const districtName = value => String(value || '').trim().replace(/^公安$/, '公安县')
const canImport = user => (user.role === 'system_admin' || user.workspaceType === 'sales' && user.role === 'sales_department') &&
  user.status !== 'inactive' && !!(user.permissions && user.permissions.salesImport === true)

function addMonth(month, offset) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}
function conditions(data) {
  const businessMonth = String(data.businessMonth || '').trim()
  const cutoffDate = String(data.cutoffDate || '').trim()
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(businessMonth)) throw new Error('请选择有效业务月份')
  const date = new Date(cutoffDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) || cutoffDate.slice(0, 7) !== businessMonth ||
      Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cutoffDate ||
      cutoffDate > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)) {
    throw new Error('统计截止日期必须是业务月份内已发生的有效日期')
  }
  return { businessMonth, cutoffDate, finalized: data.finalized === true }
}
function parseWorkbook(workbook, XLSX, input) {
  const meta = conditions(input)
  if (workbook.SheetNames.length !== 1) throw new Error('模板只能包含一个业务工作表')
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet || !sheet['!ref']) throw new Error('Excel没有数据')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (range.e.r > 5000 || range.e.c > 30) throw new Error('文件超过5000行或列数异常，请分区县导入')
  const headers = []
  for (let c = 0; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })]
    headers.push(String(cell && cell.v !== undefined ? cell.v : '').trim())
  }
  if (HEADERS.some(header => headers.filter(value => value === header).length !== 1) ||
      headers.some(header => header && !HEADERS.includes(header))) throw new Error('模板表头必须与12列标准模板一致且不能重复')
  const rows = [], errors = [], seen = new Set()
  for (let r = 1; r <= range.e.r; r++) {
    const cells = HEADERS.map(header => sheet[XLSX.utils.encode_cell({ r, c: headers.indexOf(header) })] || {})
    if (cells.every(cell => !cell.f && (cell.v === undefined || String(cell.v).trim() === ''))) continue
    const values = cells.map(cell => cell.v === undefined ? '' : String(cell.v).trim())
    const [rawDistrict, gridName, realName, rawId] = values
    const id = employeeId(rawId), district = districtName(rawDistrict), messages = []
    if (cells.some(cell => cell.f || cell.t === 'e')) messages.push('请将公式或错误单元格替换为实际数值')
    if (!DISTRICTS.includes(district)) messages.push('区县无效，请填写标准区县名称')
    if (!gridName || !realName) messages.push('网格名称、姓名不能为空')
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(id) || cells[3].t === 'n') messages.push('员工编号必须按文本填写，支持字母、数字、下划线和短横线')
    if (seen.has(id)) messages.push('同一员工编号在文件中重复')
    seen.add(id)
    const quantities = values.slice(4).map(value => value === '' ? 0 : Number(value))
    if (quantities.some((value, index) => !/^\d*$/.test(values[index + 4]) ||
        !Number.isSafeInteger(value) || value < 0 || value > 100000)) messages.push('业务量必须为0至100000的整数，空白按0')
    if (messages.length) { errors.push({ rowNumber: r + 1, employeeId: id, errors: messages }); continue }
    const items = PRODUCT_NAMES.map((businessName, index) => {
      const unit = rules.getCommissionDetail(businessName).commission, commissionDetails = {}
      for (let month = 1; month <= 5; month++) commissionDetails['T' + month] = money(unit['T' + month] * quantities[index])
      commissionDetails.total = money(unit.total * quantities[index])
      return { businessName, quantity: quantities[index], commissionDetails }
    })
    rows.push({ employeeId: id, district, gridName, realName, items,
      quantity: quantities.reduce((sum, value) => sum + value, 0),
      commission: money(items.reduce((sum, item) => sum + item.commissionDetails.total, 0)) })
  }
  if (!rows.length && !errors.length) throw new Error('没有可导入的员工数据')
  meta.districts = [...new Set(rows.map(row => row.district))].sort()
  return { meta, rows, errors }
}
function flatten(rows, versions, referenceMonth = monthNow()) {
  const records = []
  for (const row of rows) {
    const version = versions.find(item => item.businessMonth === row.businessMonth &&
      item.district === row.district && item.activeBatchId === row.importBatchId)
    if (!version) continue
    for (const item of row.items) {
      if (!item.quantity) continue
      const schedule = [1, 2, 3, 4, 5].map(month => {
        const settlementMonth = addMonth(row.businessMonth, month), amount = item.commissionDetails['T' + month]
        return { month, period: 'T+' + month + '月', settlementMonth, amount, amountText: amount.toFixed(2),
          settled: settlementMonth <= referenceMonth, statusText: settlementMonth <= referenceMonth ? '已到计划核发月' : '未到计划核发月' }
      })
      const settledTotal = money(schedule.filter(item => item.settled).reduce((sum, item) => sum + item.amount, 0))
      const unsettledTotal = money(item.commissionDetails.total - settledTotal)
      records.push({
        _id: row._id + '_' + PRODUCT_NAMES.indexOf(item.businessName),
        businessMonth: row.businessMonth, date: row.businessMonth + '-01', employeeId: row.employeeId,
        district: row.district, gridName: row.gridName, developer: row.realName, businessName: item.businessName,
        quantity: item.quantity, commission: item.commissionDetails.total, commissionDetails: item.commissionDetails,
        cutoffDate: version.cutoffDate, finalized: version.finalized, statusText: version.finalized ? '已定版' : '更新中',
        settlementSchedule: schedule, settledTotal, unsettledTotal,
        settlementSummary: { settledTotal, unsettledTotal, settledTotalText: settledTotal.toFixed(2), unsettledTotalText: unsettledTotal.toFixed(2) }
      })
    }
  }
  return records
}
function stats(records, referenceMonth = monthNow()) {
  const month = records.filter(item => item.businessMonth === referenceMonth)
  const sum = (items, key) => money(items.reduce((total, item) => total + Number(item[key] || 0), 0))
  return {
    totalRecords: sum(records, 'quantity'), totalCommission: sum(records, 'commission'),
    monthRecords: sum(month, 'quantity'), monthCommission: sum(month, 'commission'),
    settledCommission: sum(records, 'settledTotal'), unsettledCommission: sum(records, 'unsettledTotal'),
    currentDue: money(records.reduce((total, record) => total + record.settlementSchedule
      .filter(item => item.settlementMonth === referenceMonth).reduce((sum, item) => sum + item.amount, 0), 0))
  }
}
module.exports = { PRODUCT_NAMES, HEADERS, RULE_VERSION, DISTRICTS, money, hash, monthNow, addMonth, employeeId, canImport,
  conditions, parseWorkbook, flatten, stats }
