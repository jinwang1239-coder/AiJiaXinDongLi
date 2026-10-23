const assert = require('assert')
const Module = require('module')
const createManagers = require('./sales-managers')
const people = [
  ['罗平', '15826500088', 'sales_department'], ['朱丽', '13997646106', 'sales_department'],
  ['李奇琦', '15171129197', 'system_admin'], ['倪江辉', '13997605198', 'sales_department']
]
let state = { users: {} }, queue = Promise.resolve(), failUserUpdate = false
function collection(source, name) {
  return {
    where(condition) {
      return { limit() { return { get: async () => ({ data: Object.values(source[name] || {})
        .filter(row => Object.entries(condition).every(([key, value]) => row[key] === value)).map(row => structuredClone(row)) }) } } }
    },
    doc(id) {
      return {
        get: async () => {
          if (!source[name] || !source[name][id]) throw new Error('document not exist')
          return { data: structuredClone(source[name][id]) }
        },
        set: async ({ data }) => { source[name][id] = { ...structuredClone(data), _id: id } },
        update: async ({ data }) => {
          if (failUserUpdate && name === 'users') throw new Error('simulated write failure')
          const row = source[name][id]
          for (const [key, value] of Object.entries(data)) {
            if (key === 'permissions.salesImport') row.permissions = { ...row.permissions, salesImport: value }
            else row[key] = value
          }
        }
      }
    }
  }
}
const db = {
  collection: name => collection(state, name),
  createCollection: async name => {
    if (state[name]) throw Object.assign(new Error('createCollection:fail -501001 resource system error. ' +
      '[ResourceUnavailable.ResourceExist] Table exist. Please check your request. 更多错误信息请访问：' +
      'https://docs.cloudbase.net/error-code/basic/DATABASE_COLLECTION_ALREADY_EXIST'), { errCode: -501001 })
    state[name] = {}
  },
  runTransaction(callback) {
    const result = queue.then(async () => {
      const snapshot = structuredClone(state)
      const value = await callback({ collection: name => collection(snapshot, name) })
      state = snapshot
      return value
    })
    queue = result.catch(() => {})
    return result
  }
}
function user(id, extra = {}) {
  return state.users[id] = { _id: id, openid: id, role: 'sales_person', workspaceType: 'sales',
    status: 'active', permissions: { other: true }, ...extra }
}
const form = index => ({ realName: people[index][0], gridAccount: people[index][1] })

;(async () => {
  const service = createManagers(db), first = user('first'), rival = user('rival')
  await assert.rejects(() => service.claim(first, { realName: '陌生人', gridAccount: people[0][1] }), /名册不一致/)
  assert(!state.sales_manager_accounts)
  // 两个微信同时认领一个身份，只能有一个成功。
  const competing = await Promise.allSettled([service.claim(first, form(0)), service.claim(rival, form(0))])
  assert.strictEqual(competing.filter(item => item.status === 'fulfilled').length, 1)
  assert.strictEqual(Object.keys(state.sales_manager_accounts).length, 4)
  const ownerId = state.sales_manager_accounts[people[0][1]].boundUserId
  const owner = state.users[ownerId]
  assert.strictEqual(owner.role, 'sales_department')
  assert.strictEqual(owner.permissions.salesImport, true)
  assert.strictEqual(owner.permissions.other, true)
  assert.strictEqual((await service.claim(owner, form(0))).openid, ownerId)
  await assert.rejects(() => service.claim(owner, form(1)), /其他身份/)

  // 通用系统错误和权限错误必须中止认领，不能当作集合已存在。
  for (const error of [
    Object.assign(new Error('createCollection:fail -501001 resource system error.'), { errCode: -501001 }),
    Object.assign(new Error('createCollection:fail permission denied'), { code: 'DATABASE_PERMISSION_DENIED' })
  ]) {
    const before = structuredClone(state)
    const failing = createManagers({ ...db, createCollection: async () => { throw error } })
    await assert.rejects(() => failing.claim(owner, form(0)), caught => caught === error)
    assert.deepStrictEqual(state, before)
  }

  // 重启后的初始化不能覆盖已有认领或停用信息。
  state.sales_manager_accounts[people[1][1]].status = 'inactive'
  const second = user('second')
  await assert.rejects(() => createManagers(db).claim(second, form(1)), /停用/)
  assert.strictEqual(state.sales_manager_accounts[people[0][1]].boundUserId, ownerId)
  const codeOnly = createManagers({ ...db, createCollection: async () => {
    throw Object.assign(new Error('createCollection failed'), { code: 'DATABASE_COLLECTION_ALREADY_EXIST' })
  } })
  assert.strictEqual((await codeOnly.claim(owner, form(0))).openid, ownerId)
  state.sales_manager_accounts[people[1][1]].status = 'active'
  // 用户更新失败时，名册绑定一并回滚。
  failUserUpdate = true
  await assert.rejects(() => service.claim(second, form(1)), /simulated/)
  failUserUpdate = false
  assert.strictEqual(state.sales_manager_accounts[people[1][1]].boundOpenid, '')
  assert.strictEqual(state.users.second.role, 'sales_person')
  await service.claim(second, { ...form(1), role: 'system_admin', permissions: { unrestricted: true } })
  assert.strictEqual(state.users.second.role, 'sales_department')
  assert.strictEqual(state.users.second.permissions.unrestricted, undefined)

  const existing = user('existing', { ...form(2), workspaceType: 'line_project', role: 'sales_department' })
  await assert.rejects(() => service.claim(rival, form(2)), /关联其他微信/)
  assert(service.isListed(existing))
  const promoted = await service.claim(existing, form(2))
  assert.strictEqual(promoted.role, 'system_admin')
  assert.strictEqual(promoted.workspaceType, 'sales')
  const fourth = user('fourth', { status: 'inactive' })
  await assert.rejects(() => service.claim(fourth, form(3)), /不可认领/)
  state.users.fourth.status = 'active'

  // 真实云函数入口和后续登录读取，确认权限保存到 users，而非只改页面状态。
  const originalLoad = Module._load
  let caller = 'fourth', main
  try {
    Module._load = function (request, ...args) {
      if (request === 'wx-server-sdk') return { init() {}, database: () => db, getWXContext: () => ({ OPENID: caller }) }
      return originalLoad.call(this, request, ...args)
    }
    main = require('./index').main
  } finally { Module._load = originalLoad }
  const result = await main({ action: 'updateProfile', data: { ...form(3), claimType: 'manager' } })
  assert.strictEqual(result.success, true, result.error)
  assert.strictEqual(result.data.role, people[3][2])
  for (const id of [ownerId, 'second', 'existing', 'fourth']) {
    caller = id
    const current = await main({ action: 'getUserInfo' })
    assert.strictEqual(current.data.workspaceType, 'sales')
    assert.strictEqual(current.data.permissions.salesImport, true)
    assert.strictEqual(current.data.canClaimSalesManager, false)
  }
  const wang = user('wang', { realName: '王谨', role: 'sales_department', permissions: { salesImport: true } })
  caller = wang.openid
  assert.strictEqual((await main({ action: 'getUserInfo' })).data.role, 'sales_department')
  let pageDefinition
  global.Page = definition => { pageDefinition = definition }
  global.wx = { getStorageSync: () => 'sales', setStorageSync() {}, showToast() {},
    cloud: { callFunction: async ({ data }) => ({ result: await main(data) }) } }
  global.getApp = () => ({ setUserProfile() {} })
  try {
    require('../../pages/login/login')
    const page = { ...pageDefinition, data: structuredClone(pageDefinition.data), visible: true,
      setData(patch) { Object.assign(this.data, patch) },
      async loadDashboard() { assert.strictEqual(this.data.isEmployee, false) },
      error(error) { throw error } }
    page.setUserState({ role: 'sales_person', workspaceType: 'sales' })
    assert.strictEqual(page.data.claimMode, 'employee')
    assert.strictEqual(page.data.showProfileModal, true)
    page.setUserState({ ...existing, canClaimSalesManager: true })
    assert.strictEqual(page.data.managerClaimPending, true)
    assert.strictEqual(page.data.claimMode, 'manager')
    caller = 'existing'
    await page.submitProfile()
    assert.strictEqual(page.data.userRole, 'system_admin')
    assert.strictEqual(page.data.isEmployee, false)
    assert.strictEqual(page.data.showProfileModal, false)
    assert.strictEqual(page.data.managerClaimPending, false)
  } finally { delete global.Page; delete global.wx; delete global.getApp }
  console.log('管理认领测试通过：真实集合已存在错误、其他错误中止、四人角色、并发唯一绑定、事务回滚、停用、重复登录及原管理账号。')
})().catch(error => { console.error(error); process.exitCode = 1 })
