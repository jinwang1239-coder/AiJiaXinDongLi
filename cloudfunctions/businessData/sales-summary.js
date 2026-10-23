const core = require('./sales-core')
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

  async function participation(rows, versions, businessMonth, district) {
    const receipts = []
    const batchIds = [...new Set(versions.map(version => version.activeBatchId))]
    for (let offset = 0; offset < batchIds.length; offset += 20) {
      receipts.push(...await all(db.collection(RECEIPTS).where({
        businessMonth, activeBatchId: db.command.in(batchIds.slice(offset, offset + 20))
      })))
    }
    // 换绑后，旧微信的查看不能代表新绑定人员已查看。
    const bindings = new Map(rows.length
      ? (await all(db.collection('sales_employees'))).map(binding => [binding.employeeId, binding.userOpenid]) : [])
    const managers = await all(db.collection('users').where({ role: db.command.in(['district_manager', 'sales_department', 'system_admin']) }))
    const managementIds = new Set(managers.filter(user => user.employeeId &&
      (!bindings.has(user.employeeId) || bindings.get(user.employeeId) === user.openid)).map(user => user.employeeId))
    const people = []
    const districts = (district ? [district] : core.DISTRICTS).map(name => {
      const version = versions.find(item => item.district === name)
      const employees = new Map(rows.filter(row => row.district === name && !managementIds.has(row.employeeId))
        .map(row => [row.employeeId, row]))
      const received = new Map(receipts.filter(receipt => version && receipt.district === name &&
        receipt.activeBatchId === version.activeBatchId && employees.has(receipt.employeeId) &&
        bindings.get(receipt.employeeId) && bindings.get(receipt.employeeId) === receipt.userOpenid)
        .map(receipt => [receipt.employeeId, receipt]))
      employees.forEach(row => people.push({
        businessMonth, district: name, gridName: row.gridName, realName: row.realName, employeeId: row.employeeId,
        received: received.has(row.employeeId), claimed: !!bindings.get(row.employeeId),
        viewedAt: received.has(row.employeeId) ? received.get(row.employeeId).viewedAt : null,
        cutoffDate: version ? version.cutoffDate : '', activeBatchId: version ? version.activeBatchId : '',
        finalized: !!(version && version.finalized)
      }))
      return { district: name, expected: employees.size, received: received.size,
        pending: employees.size - received.size, rate: percentage(received.size, employees.size) }
    })
    const expected = districts.reduce((sum, item) => sum + item.expected, 0)
    const received = districts.reduce((sum, item) => sum + item.received, 0)
    return { people, summary: { districts, expected, received, pending: expected - received, rate: percentage(received, expected) } }
  }

  async function getSummary(user, data) {
    const { businessMonth, district } = filters(data)
    const active = await activeRows(user, false, businessMonth)
    const rows = active.rows.filter(row => !district || row.district === district)
    const versions = active.versions.filter(version => (!district || version.district === district) &&
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
      hasData: rows.length > 0, products,
      totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0),
      nextAmount: core.money(products.reduce((sum, item) => sum + item.nextAmount, 0)),
      deferredAmount: core.money(products.reduce((sum, item) => sum + item.deferredAmount, 0)),
      receipt: null, participation: null
    }
    if (user.role === 'sales_person' && versions.length) {
      result.receipt = { businessMonth, district: versions[0].district, activeBatchId: versions[0].activeBatchId }
    }
    if (user.role !== 'sales_person') result.participation = (await participation(rows, versions, businessMonth,
      user.role === 'district_manager' ? user.salesManagedDistrict : district)).summary
    return result
  }

  async function exportParticipation(user, data) {
    if (!canExportParticipation(user)) throw new Error('仅市场营销部和系统管理员可导出员工数据接收明细')
    const { businessMonth, district } = filters(data)
    const active = await activeRows(user, false, businessMonth)
    const versions = active.versions.filter(item => !district || item.district === district)
    const { people, summary } = await participation(active.rows.filter(row => !district || row.district === district),
      versions, businessMonth, district)
    const timeText = value => {
      if (!value) return ''
      const time = new Date(value).getTime()
      return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ') : ''
    }
    const exportTime = timeText(new Date())
    const versionColumns = item => ({
      '统计截止日期': item ? item.cutoffDate || '' : '', '有效批次': item ? item.activeBatchId : '',
      '版本状态': item ? (item.finalized ? '已定版' : '更新中') : '暂无有效数据'
    })
    const totals = [...summary.districts, { district: '合计', ...summary }].map(item => ({
      '业务月份': businessMonth, '区县': item.district, '应接收人数': item.expected, '已接收人数': item.received,
      '未接收人数': item.pending, '参与率': item.rate,
      ...versionColumns(versions.find(version => version.district === item.district))
    }))
    // 合计行没有独立版本。
    totals[totals.length - 1]['版本状态'] = ''
    const received = [], pending = []
    people.sort((a, b) => core.DISTRICTS.indexOf(a.district) - core.DISTRICTS.indexOf(b.district) ||
      String(a.gridName || '').localeCompare(String(b.gridName || ''), 'zh-CN') || a.employeeId.localeCompare(b.employeeId))
      .forEach(person => {
        const row = { '业务月份': businessMonth, '区县': person.district, '网格名称': person.gridName || '',
          '姓名': person.realName || '', '员工编号': String(person.employeeId), '接收状态': person.received ? '已接收' : '未接收' }
        if (person.received) received.push({ ...row, '首次接收时间': timeText(person.viewedAt), ...versionColumns(person) })
        else pending.push({ ...row, '认领状态': person.claimed ? '已认领但未查看当前版本' : '未认领', ...versionColumns(person) })
      })
    const XLSX = require('xlsx'), workbook = XLSX.utils.book_new()
    const versionHeaders = ['统计截止日期', '有效批次', '版本状态']
    const personHeaders = ['业务月份', '区县', '网格名称', '姓名', '员工编号', '接收状态']
    const append = (name, rows, headers) => {
      const note = !versions.length ? '该月份该范围暂无有效数据' : !people.length ? '该范围暂无应接收员工数据'
        : !rows.length ? '该范围暂无' + name : '仅统计当前有效版本，按当前绑定账号判断接收。'
      const sheet = XLSX.utils.aoa_to_sheet([
        ['员工数据接收情况 · ' + name], ['业务月份', businessMonth, '导出范围', district || '全市'],
        ['导出时间（北京时间）', exportTime, '说明', note], [], headers
      ])
      XLSX.utils.sheet_add_json(sheet, rows, { header: headers, skipHeader: true, origin: 'A6' })
      sheet['!cols'] = headers.map(header => ({ wch: header === '有效批次' ? 28 : header === '首次接收时间' || header === '认领状态' ? 26 : 20 }))
      sheet['!merges'] = [XLSX.utils.decode_range('A1:' + XLSX.utils.encode_col(headers.length - 1) + '1')]
      sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + rows.length, c: headers.length - 1 } }) }
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    }
    append('区县汇总', totals, ['业务月份', '区县', '应接收人数', '已接收人数', '未接收人数', '参与率', ...versionHeaders])
    append('已接收人员', received, [...personHeaders, '首次接收时间', ...versionHeaders])
    append('未接收人员', pending, [...personHeaders, '认领状态', ...versionHeaders])
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
