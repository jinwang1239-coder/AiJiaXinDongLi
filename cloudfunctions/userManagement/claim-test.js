const assert = require('assert')
const Module = require('module')

const originalLoad = Module._load
const updates = []
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return {
          collection(name) {
            return {
              doc(id) {
                return {
                  update({ data }) {
                    updates.push({ name, id, data })
                    return Promise.resolve({ updated: 1 })
                  }
                }
              }
            }
          }
        }
      },
      getWXContext() { return { OPENID: 'test' } }
    }
  }
  return originalLoad(request, parent, isMain)
}

const { validatePendingClaimIdentity, claimLineProjectRecords } = require('./index').__test__
const records = [{ personName: '文雄', district: '沙市区' }]
assert.doesNotThrow(() => validatePendingClaimIdentity(records, { realName: '文雄', district: '沙市区' }))
assert.throws(
  () => validatePendingClaimIdentity(records, { realName: '文强', district: '沙市区' }),
  /姓名.*不一致/
)
assert.throws(
  () => validatePendingClaimIdentity(records, { realName: '文雄', district: '荆州区' }),
  /区县.*不一致/
)

;(async () => {
  const count = await claimLineProjectRecords([{ _id: 'r1' }, { _id: 'r2' }], {
    _id: 'u1', openid: 'openid1'
  }, new Date('2026-08-13T00:00:00Z'))
  assert.strictEqual(count, 2)
  assert.strictEqual(updates.length, 2)
  assert(updates.every(item => (
    item.data.bindingStatus === 'bound' &&
    item.data.bindingSource === 'auto_profile' &&
    item.data.userOpenid === 'openid1'
  )))
  console.log('userManagement 待认领身份与自动认领测试通过')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
