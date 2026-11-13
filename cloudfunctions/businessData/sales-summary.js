const core = require('./sales-core')
const buildCommissionPlan = require('./sales-plan')
const RECEIPTS = 'sales_data_receipts'

module.exports = (db, { all, optionalDoc, activeRows, versionsFor, versionId }) => {
  const percentage = (received, expected) => expected ? (received * 100 / expected).toFixed(1) + '%' : '—'
  const canExportParticipation = user => user.status !== 'inactive' && (user.role === 'system_admin' ||
    user.workspaceType === 'sales' && user.role === 'sales_department')

  function filters(data) {
    const businessMonth = String(data.businessMonth || core.monthNow())
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(businessMonth)) throw new Error('请选择有效业务月份')
    const district = String(data.district || '')
    if (district && !core.DISTRICTS.includes(district)) throw new Error('区县无效')
    return { businessMonth, district }
  }

  async function participation(businessMonth, district) {
    const batches = (await all(db.collection('sales_import_batches').where({ businessMonth, state: 'published' })))
      .filter(batch => batch.operation !== 'clear_district' && (!district || !Array.isArray(batch.districts) || batch.districts.includes(district)))
    const batchMap = new Map(batches.map(batch => [batch._id, batch]))
    const batchIds = Array.from(batchMap.keys())
    const rows = []
    const receipts = []
    for (let offset = 0; offset < batchIds.length; offset += 20) {
      const ids = db.command.in(batchIds.slice(offset, offset + 20))
      const [batchRows, batchReceipts] = await Promise.all([
        all(db.collection('sales_month_records').where({ importBatchId: ids, ...(district ? { district } : {}) })),
        all(db.collection(RECEIPTS).where({ businessMonth, activeBatchId: ids, ...(district ? { district } : {}) }))
      ])
      rows.push(...batchRows)
      receipts.push(...batchReceipts)
    }
    // 换绑后，旧微信的查看不能代表新绑定人员已查看。
    const bindings = new Map(rows.length
      ? (await all(db.collection('sales_employees'))).map(binding => [binding.employeeId, binding.userOpenid]) : [])
    const managers = await all(db.collection('users').where({ role: db.command.in(['district_manager', 'sales_department', 'system_admin']) }))
    const managementIds = new Set(managers.filter(user => user.employeeId &&
      (!bindings.has(user.employeeId) || bindings.get(user.employeeId) === user.openid)).map(user => user.employeeId))
    const key = (batchId, name, employeeId) => [batchId, name, employeeId].join('|')
    const receiptMap = new Map()
    receipts.forEach(receipt => {
      if (!bindings.get(receipt.employeeId) || bindings.get(receipt.employeeId) !== receipt.userOpenid) return
      const id = key(receipt.activeBatchId, receipt.district, receipt.employeeId)
      const previous = receiptMap.get(id)
      if (!previous || new Date(receipt.viewedAt) < new Date(previous.viewedAt)) receiptMap.set(id, receipt)
    })
    const opportunities = new Map(), employees = new Map()
    rows.forEach(row => {
      if (row.businessMonth !== businessMonth || !core.DISTRICTS.includes(row.district) || !row.employeeId || managementIds.has(row.employeeId)) return
      const batch = batchMap.get(row.importBatchId)
      if (!batch) return
      const id = key(row.importBatchId, row.district, row.employeeId)
      if (opportunities.has(id)) return
      const receipt = receiptMap.get(id)
      const opportunity = { businessMonth, district: row.district, gridName: row.gridName, realName: row.realName,
        employeeId: row.employeeId, activeBatchId: row.importBatchId, cutoffDate: batch.cutoffDate || '',
        publishTime: batch.publishTime || batch.createTime, received: !!receipt,
        viewedAt: receipt ? receipt.viewedAt : null, claimed: !!bindings.get(row.employeeId) }
      opportunities.set(id, opportunity)
      const employeeKey = row.district + '|' + row.employeeId
      const person = employees.get(employeeKey) || { businessMonth, district: row.district, employeeId: row.employeeId,
        claimed: opportunity.claimed, expected: 0, received: 0, latestTime: -Infinity }
      const time = new Date(opportunity.publishTime || 0).getTime()
      if (time >= person.latestTime) {
        person.realName = row.realName; person.gridName = row.gridName; person.latestTime = time
      }
      person.expected++
      if (receipt) person.received++
      employees.set(employeeKey, person)
    })
    const people = Array.from(employees.values(), person => ({ ...person,
      pending: person.expected - person.received, rate: percentage(person.received, person.expected) }))
    const details = Array.from(opportunities.values())
    const districts = (district ? [district] : core.DISTRICTS).map(name => {
      const members = people.filter(person => person.district === name)
      const expected = members.reduce((total, person) => total + person.expected, 0)
      const received = members.reduce((total, person) => total + person.received, 0)
      return { district: name, employeeCount: members.length,
        batchCount: new Set(details.filter(item => item.district === name).map(item => item.activeBatchId)).size,
        expected, received, pending: expected - received, rate: percentage(received, expected) }
    })
    const expected = districts.reduce((sum, item) => sum + item.expected, 0)
    const received = districts.reduce((sum, item) => sum + item.received, 0)
    return { people, details, batches, summary: { method: 'employee_batch', districts,
      employeeCount: new Set(people.map(person => person.employeeId)).size,
      batchCount: new Set(details.map(item => item.activeBatchId)).size,
      expected, received, pending: expected - received, rate: percentage(received, expected) } }
  }

  async function getSummary(user, data) {
    const { businessMonth, district } = filters(data)
    const personal = user.role === 'sales_person'
    const payoutMonth = String(data.payoutMonth || businessMonth)
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(payoutMonth)) throw new Error('请选择有效核发月份')
    const active = await activeRows(user, false, personal ? '' : businessMonth)
    const rows = active.rows.filter(row => row.businessMonth === businessMonth && (!district || row.district === district))
    const versions = active.versions.filter(version => version.businessMonth === businessMonth && (!district || version.district === district) &&
      (user.role !== 'sales_person' || rows.some(row => row.importBatchId === version.activeBatchId && row.district === version.district)))
    const products = core.PRODUCT_NAMES.map(businessName => {
      const items = rows.flatMap(row => row.items.filter(item => item.businessName === businessName))
      const sum = key => core.money(items.reduce((total, item) => total + Number(item.commissionDetails[key] || 0), 0))
      return { businessName, quantity: items.reduce((total, item) => total + item.quantity, 0),
        nextAmount: sum('T1'), deferredAmount: sum('T2') }
    })
    const canFilterDistrict = ['sales_department', 'system_admin'].includes(user.role)
    const result = {
      businessMonth, nextMonth: core.addMonth(businessMonth, 1), deferredMonth: core.addMonth(businessMonth, 2),
      scopeLabel: user.role === 'sales_person' ? '个人' : user.role === 'district_manager'
        ? user.salesManagedDistrict || '未配置管理区县' : district || '全市',
      canFilterDistrict, districtOptions: canFilterDistrict ? core.DISTRICTS : [],
      cutoffDates: [...new Set(versions.map(version => version.cutoffDate).filter(Boolean))].sort(),
      hasData: rows.length > 0, products,
      totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0),
      nextAmount: core.money(products.reduce((sum, item) => sum + item.nextAmount, 0)),
      deferredAmount: core.money(products.reduce((sum, item) => sum + item.deferredAmount, 0)),
      receipt: null, participation: null
    }
    if (personal) result.commissionPlan = buildCommissionPlan(
      active.rows.filter(row => !district || row.district === district), active.versions, businessMonth, payoutMonth)
    if (user.role === 'sales_person' && versions.length) {
      result.receipt = { businessMonth, district: versions[0].district, activeBatchId: versions[0].activeBatchId }
    }
    if (user.role !== 'sales_person') result.participation = (await participation(businessMonth,
      user.role === 'district_manager' ? user.salesManagedDistrict : district)).summary
    return result
  }

  async function exportParticipation(user, data) {
    if (!canExportParticipation(user)) throw new Error('仅市场营销部和系统管理员可导出员工数据接收明细')
    const { businessMonth, district } = filters(data)
    const versions = (await versionsFor(user, businessMonth)).filter(item => !district || item.district === district)
    const { people, details, batches, summary } = await participation(businessMonth, district)
    const timeText = value => {
      if (!value) return ''
      const time = new Date(value).getTime()
      return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') : ''
    }
    const exportTime = timeText(new Date())
    const totals = [...summary.districts, { district: '合计', ...summary }].map(item => ({
      '业务月份': businessMonth, '区县': item.district, '覆盖员工人数': item.employeeCount, '涉及导入批次数': item.batchCount,
      '应接收次数': item.expected, '已接收次数': item.received, '未接收次数': item.pending, '参与率': item.rate
    }))
    const personColumns = person => ({ '业务月份': businessMonth, '区县': person.district,
      '网格名称': person.gridName || '', '姓名': person.realName || '', '员工编号': String(person.employeeId) })
    const comparePeople = (a, b) => core.DISTRICTS.indexOf(a.district) - core.DISTRICTS.indexOf(b.district) ||
      String(a.gridName || '').localeCompare(String(b.gridName || ''), 'zh-CN') || a.employeeId.localeCompare(b.employeeId)
    const employees = people.sort(comparePeople).map(person => ({ ...personColumns(person),
      '应接收批次数': person.expected, '已接收批次数': person.received, '未接收批次数': person.pending, '个人参与率': person.rate,
      '接收状态': person.pending === 0 ? '全部接收' : person.received ? '部分接收' : '未接收',
      '认领状态': person.claimed ? '已认领' : '未认领' }))
    const received = [], pending = []
    details.sort((a, b) => comparePeople(a, b) || String(a.cutoffDate).localeCompare(String(b.cutoffDate)) || a.activeBatchId.localeCompare(b.activeBatchId))
      .forEach(item => {
        const row = { ...personColumns(item), '导入批次': item.activeBatchId, '统计截止日期': item.cutoffDate,
          '发布时间': timeText(item.publishTime) }
        if (item.received) received.push({ ...row, '首次接收时间': timeText(item.viewedAt) })
        else pending.push({ ...row, '认领状态': item.claimed ? '已认领但未接收本批次' : '未认领' })
      })
    const XLSX = require('xlsx'), workbook = XLSX.utils.book_new()
    const personHeaders = ['业务月份', '区县', '网格名称', '姓名', '员工编号']
    const batchHeaders = ['导入批次', '统计截止日期', '发布时间']
    const append = (name, rows, headers) => {
      const note = !batches.length ? '该月份该范围暂无正式发布的导入数据' : !people.length ? '该范围暂无应接收员工数据'
        : !rows.length ? '该范围暂无' + name : '按本月实际覆盖员工的已发布批次统计，同一员工同一批次只计一次。'
      const sheet = XLSX.utils.aoa_to_sheet([
        ['员工数据接收情况 · ' + name], ['业务月份', businessMonth, '导出范围', district || '全市'],
        ['导出时间（北京时间）', exportTime, '说明', note], [], headers
      ])
      XLSX.utils.sheet_add_json(sheet, rows, { header: headers, skipHeader: true, origin: 'A6' })
      sheet['!cols'] = headers.map(header => ({ wch: header === '导入批次' ? 34 : header === '首次接收时间' || header === '认领状态' ? 26 : 20 }))
      sheet['!merges'] = [XLSX.utils.decode_range('A1:' + XLSX.utils.encode_col(headers.length - 1) + '1')]
      sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + rows.length, c: headers.length - 1 } }) }
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    }
    append('区县汇总', totals, ['业务月份', '区县', '覆盖员工人数', '涉及导入批次数', '应接收次数', '已接收次数', '未接收次数', '参与率'])
    append('员工参与率', employees, [...personHeaders, '应接收批次数', '已接收批次数', '未接收批次数', '个人参与率', '接收状态', '认领状态'])
    append('已接收明细', received, [...personHeaders, ...batchHeaders, '首次接收时间'])
    append('未接收明细', pending, [...personHeaders, ...batchHeaders, '认领状态'])
    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
    const snapshot = items => JSON.stringify(items.map(item => [item.district, item.activeBatchId, item.revision || 0,
      item.cutoffDate || '', !!item.finalized]).sort((a, b) => a[0].localeCompare(b[0])))
    const latest = (await versionsFor(user, businessMonth)).filter(item => !district || item.district === district)
    if (snapshot(versions) !== snapshot(latest)) throw new Error('导出期间数据版本已更新，请刷新接收情况后重试')
    return { base64, filename: '员工数据接收情况_' + businessMonth + '_' + (district || '全市') + '.xlsx',
      businessMonth, district, participation: summary }
  }

  async function recordReceipt(user, data) {
    if (user.role !== 'sales_person' || !user.employeeId) throw new Error('仅已认领员工可记录本人查看情况')
    const { businessMonth, district, activeBatchId } = data
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(businessMonth || '')) ||
        !core.DISTRICTS.includes(district) || typeof activeBatchId !== 'string' || !activeBatchId) {
      throw new Error('查看版本无效，请刷新业务汇总')
    }
    await db.runTransaction(async transaction => {
      const freshUser = (await transaction.collection('users').doc(user._id).get()).data
      if (freshUser.status === 'inactive' || freshUser.role !== 'sales_person' || freshUser.workspaceType !== 'sales' ||
          freshUser.employeeId !== user.employeeId) throw new Error('账号或认领关系已变更，请重新登录')
      const binding = await optionalDoc('sales_employees', core.hash(user.employeeId), transaction)
      if (!binding || binding.userOpenid !== user.openid) throw new Error('员工认领关系已变更，请重新登录')
      const version = await optionalDoc('sales_active_versions', versionId(businessMonth, district), transaction)
      if (!version || version.activeBatchId !== activeBatchId) throw new Error('数据已更新，请刷新后查看最新版本')
      const row = await optionalDoc('sales_month_records', core.hash(activeBatchId + '|' + user.employeeId), transaction)
      if (!row || row.businessMonth !== businessMonth || row.district !== district) throw new Error('当前版本没有本人员工数据')
      const id = core.hash([businessMonth, district, activeBatchId, user.employeeId].join('|'))
      const previous = await optionalDoc(RECEIPTS, id, transaction)
      if (!previous || previous.userOpenid !== user.openid) {
        await transaction.collection(RECEIPTS).doc(id).set({ data: {
          businessMonth, district, activeBatchId, employeeId: user.employeeId, userOpenid: user.openid, viewedAt: new Date()
        } })
      }
    })
    return { recorded: true }
  }

  return { getSummary, recordReceipt, exportParticipation, canExportParticipation }
}
