const COLLECTION = 'sales_manager_accounts'
const MANAGERS = [
  { realName: '罗平', gridAccount: '15826500088', role: 'sales_department' },
  { realName: '朱丽', gridAccount: '13997646106', role: 'sales_department' },
  { realName: '李奇琦', gridAccount: '15171129197', role: 'system_admin' },
  { realName: '倪江辉', gridAccount: '13997605198', role: 'sales_department' }
]

module.exports = db => {
  let initialized
  const isListed = user => MANAGERS.some(item => item.realName === user.realName && item.gridAccount === user.gridAccount)
  async function optional(source, id) {
    try { return (await source.collection(COLLECTION).doc(id).get()).data || null } catch (error) {
      if (/document.*(?:not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND/i.test(error.message)) return null
      throw error
    }
  }
  function initialize() {
    if (!initialized) initialized = (async () => {
      try { await db.createCollection(COLLECTION) } catch (error) {
        const reason = [error.code, error.errCode, error.errMsg, error.message].join(' ')
        if (!/DATABASE_COLLECTION_(?:ALREADY_)?EXIST\b|ResourceUnavailable\.ResourceExist\b|\b(?:collection|table)\s+(?:already\s+)?exists?\b/i.test(reason)) throw error
      }
      await db.runTransaction(async transaction => {
        const existing = await Promise.all(MANAGERS.map(item => optional(transaction, item.gridAccount)))
        for (let i = 0; i < MANAGERS.length; i++) {
          if (!existing[i]) await transaction.collection(COLLECTION).doc(MANAGERS[i].gridAccount).set({ data: {
            ...MANAGERS[i], status: 'active', boundOpenid: '', boundUserId: '', createTime: new Date()
          } })
        }
      })
    })().catch(error => { initialized = null; throw error })
    return initialized
  }
  async function claim(user, data) {
    const realName = String(data.realName || '').trim(), gridAccount = String(data.gridAccount || '').trim()
    const listed = MANAGERS.find(item => item.realName === realName && item.gridAccount === gridAccount)
    if (!listed) throw new Error('姓名或网格通账号与管理人员名册不一致')
    const owners = await db.collection('users').where({ gridAccount }).limit(2).get()
    if (owners.data.some(item => item._id !== user._id)) throw new Error('该网格通账号已关联其他微信，请联系管理员核实')
    await initialize()
    return db.runTransaction(async transaction => {
      const fresh = (await transaction.collection('users').doc(user._id).get()).data
      if (!fresh || fresh.openid !== user.openid || fresh.status === 'inactive') throw new Error('当前账号不可认领')
      if (fresh.salesManagerAccount && fresh.salesManagerAccount !== gridAccount || fresh.gridAccount && fresh.gridAccount !== gridAccount) {
        throw new Error('当前微信已关联其他身份，请联系管理员核实')
      }
      const manager = await optional(transaction, gridAccount)
      if (!manager || manager.status !== 'active' || manager.realName !== realName || manager.role !== listed.role) {
        throw new Error('管理人员名册已变更或停用，请联系管理员')
      }
      if (manager.boundOpenid && manager.boundOpenid !== user.openid || manager.boundUserId && manager.boundUserId !== user._id) {
        throw new Error('该管理身份已被其他微信认领，请联系管理员处理')
      }
      const now = new Date()
      const patch = { realName, gridAccount, role: manager.role, workspaceType: 'sales',
        salesManagerAccount: gridAccount, profileCompleted: true,
        profileCompletedTime: fresh.profileCompletedTime || now, updateTime: now }
      await transaction.collection(COLLECTION).doc(gridAccount).update({ data: {
        boundOpenid: user.openid, boundUserId: user._id, boundTime: manager.boundTime || now
      } })
      await transaction.collection('users').doc(user._id).update({ data: { ...patch, 'permissions.salesImport': true } })
      return { ...fresh, ...patch, permissions: { ...fresh.permissions, salesImport: true } }
    })
  }
  return { claim, isListed }
}
