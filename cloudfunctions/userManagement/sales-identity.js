const crypto = require('crypto')
const key = value => crypto.createHash('sha256').update(value).digest('hex')
const normalizeId = value => String(value || '').trim().toUpperCase()

module.exports = db => {
  async function all(query) {
    const rows = []
    for (let skip = 0; ; skip += 100) {
      const result = await query.skip(skip).limit(100).get()
      rows.push(...result.data)
      if (result.data.length < 100) return rows
    }
  }
  async function optional(collection, id, source = db) {
    try { return (await source.collection(collection).doc(id).get()).data || null } catch (error) {
      if (/document.*(?:not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND/i.test(String(error.message))) return null
      throw error
    }
  }
  async function claim(user, value) {
    if (user.role !== 'sales_person') throw new Error('管理人员无需认领员工编号')
    const employeeId = normalizeId(value)
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(employeeId)) throw new Error('请输入有效员工编号')
    if (user.employeeId && user.employeeId !== employeeId) throw new Error('已认领员工编号，不能自行更换，请联系管理员')
    const id = key(employeeId)
    const existing = await optional('sales_employees', id)
    if (existing && existing.userOpenid !== user.openid) throw new Error('该员工编号已被其他微信账号认领')
    let profile = existing
    let activeVersion
    if (!existing) {
      const versions = await all(db.collection('sales_active_versions'))
      const rows = await all(db.collection('sales_month_records').where({ employeeId }))
      const active = rows.filter(row => versions.some(version => version.activeBatchId === row.importBatchId &&
        version.businessMonth === row.businessMonth && version.district === row.district))
        .sort((a, b) => b.businessMonth.localeCompare(a.businessMonth))
      profile = active[0]
      if (!profile) throw new Error('该员工编号尚无已发布数据，请联系市场营销部导入')
      activeVersion = versions.find(version => version.activeBatchId === profile.importBatchId && version.district === profile.district)
    }
    const now = new Date()
    const identity = { employeeId, userOpenid: user.openid, boundUserId: user._id,
      realName: profile.realName, district: profile.district, gridName: profile.gridName, boundTime: existing ? existing.boundTime : now }
    await db.runTransaction(async transaction => {
      const freshUser = (await transaction.collection('users').doc(user._id).get()).data
      if (freshUser.status === 'inactive' || freshUser.workspaceType !== 'sales' || freshUser.role !== 'sales_person') throw new Error('当前账号不可认领销售数据')
      if (freshUser.employeeId && freshUser.employeeId !== employeeId) throw new Error('一个微信账号只能认领一个员工编号')
      const bound = await optional('sales_employees', id, transaction)
      if (existing && !bound) throw new Error('认领关系已由管理员更正，请刷新后重试')
      if (bound && bound.userOpenid !== user.openid) throw new Error('该员工编号已被其他微信账号认领')
      if (activeVersion) {
        const version = await optional('sales_active_versions', activeVersion._id, transaction)
        if (!version || version.activeBatchId !== profile.importBatchId) throw new Error('业务数据已更新，请重新认领')
      }
      await transaction.collection('sales_employees').doc(id).set({ data: identity })
      await transaction.collection('users').doc(user._id).update({ data: {
        employeeId, salesClaimed: true, realName: identity.realName, district: identity.district, gridName: identity.gridName,
        profileCompleted: true, profileCompletedTime: freshUser.profileCompletedTime || now, updateTime: now
      } })
    })
    return { ...user, ...identity, salesClaimed: true, profileCompleted: true }
  }
  // 换绑是后台维护操作，必须由已授权市场营销部人员指定目标微信账号和原因。
  async function release(operator, data) {
    if (!canRelease(operator)) throw new Error('没有更正认领权限')
    const employeeId = normalizeId(data.employeeId), reason = String(data.reason || '').trim()
    if (!employeeId || !reason) throw new Error('请填写员工编号和更正原因')
    await db.runTransaction(async transaction => {
      const freshOperator = (await transaction.collection('users').doc(operator._id).get()).data
      if (!canRelease(freshOperator)) {
        throw new Error('没有更正认领权限')
      }
      const binding = await optional('sales_employees', key(employeeId), transaction)
      if (!binding) throw new Error('该编号尚未认领')
      await transaction.collection('users').doc(binding.boundUserId).update({ data: {
        employeeId: '', salesClaimed: false, profileCompleted: false, updateTime: new Date()
      } })
      await transaction.collection('sales_employees').doc(key(employeeId)).remove()
      await transaction.collection('sales_claim_logs').doc(key(employeeId + '|' + Date.now())).set({ data: {
        employeeId, previousOpenid: binding.userOpenid, operatorOpenid: operator.openid, reason, createTime: new Date()
      } })
    })
    return {}
  }
  function canRelease(user) {
    return user.status !== 'inactive' && (user.role === 'system_admin' || user.workspaceType === 'sales' &&
      user.role === 'sales_department' && user.permissions && user.permissions.salesImport === true)
  }
  async function refresh(user) {
    if (user.workspaceType !== 'sales' || user.role !== 'sales_person' || !user.employeeId) return user
    const binding = await optional('sales_employees', key(user.employeeId))
    if (!binding || binding.userOpenid !== user.openid) return { ...user, employeeId: '', salesClaimed: false, profileCompleted: false }
    const versions = await all(db.collection('sales_active_versions'))
    const records = await all(db.collection('sales_month_records').where({ employeeId: user.employeeId }))
    const latest = records.filter(row => versions.some(version => version.activeBatchId === row.importBatchId && version.district === row.district))
      .sort((a, b) => b.businessMonth.localeCompare(a.businessMonth))[0] || binding
    return { ...user, realName: latest.realName, district: latest.district, gridName: latest.gridName, salesClaimed: true }
  }
  return { claim, release, refresh }
}
