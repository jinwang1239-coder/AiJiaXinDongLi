// 本地运行：node test-integration.js。所有微信接口均使用模拟数据。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const productConfig = require('./utils/product-config')
const commission = require('./utils/commission-fixed')
const cloudRules = require('./cloudfunctions/businessData/commission-rules')

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8')
const quietConsole = { log() {}, warn() {}, error() {} }
const expected = read('remuneration.md').split(/\r?\n/)
  .filter(line => /^\|/.test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
  .filter(cells => cells.length === 6 && cells.slice(1).some(cell => /^\d+$/.test(cell)))
  .map(([name, ...amounts]) => ({ name, amounts: amounts.map(Number) }))

function loadScript(file, overrides = {}) {
  const module = { exports: {} }
  vm.runInNewContext(read(file), {
    module,
    exports: module.exports,
    console: quietConsole,
    ...overrides
  }, { filename: file })
  return module.exports
}

async function main() {
  assert.equal(expected.length, 8)
  const names = expected.map(item => item.name)
  assert.deepEqual(productConfig.getProducts().map(item => item.name), names)

  for (const rules of [commission, cloudRules]) {
    assert.deepEqual(rules.getBusinessTypes(), names)
    for (const { name, amounts } of expected) {
      const detail = rules.getCommissionDetail(name)
      const total = amounts.reduce((sum, amount) => sum + amount, 0)
      assert.deepEqual([1, 2, 3, 4, 5].map(month => detail.commission[`T${month}`]), amounts)
      assert.equal(rules.calculateCommission(name), total)
      const schedule = rules.buildSettlementSchedule(detail.commission, new Date(2026, 9, 1), new Date(2026, 10, 1))
      const summary = rules.buildSettlementSummary(schedule)
      assert.equal(summary.settledTotal, amounts[0])
      assert.equal(summary.unsettledTotal, total - amounts[0])
    }
    assert.equal(rules.getCommissionDetail(' hdict ').businessName, 'HDICT')
    assert.equal(rules.getCommissionDetail('全光组网融合套餐直降30元'), null)
    assert.equal(rules.getCommissionDetail(''), null)
    const old = rules.enrichRecordSettlement({
      businessName: '全光组网融合套餐直降30元',
      date: new Date(2026, 2, 1),
      commission: 72,
      commissionDetails: { T1: 24, T2: 12, T3: 12, T4: 12, T5: 12, total: 72 }
    }, new Date(2026, 9, 1))
    assert.equal(old.commission, 72)
    assert.equal(old.settledTotal, 72)
  }

  const cache = new Map()
  const storage = loadScript('utils/storage.js', {
    wx: {
      setStorageSync: (key, value) => cache.set(key, value),
      getStorageSync: key => cache.get(key),
      removeStorageSync: key => cache.delete(key)
    }
  })
  storage.saveLastFormData({ district: '监利', businessName: 'HDICT', userPhone: '13800138000', gridAccount: 'demo' })
  assert.equal(storage.getLastFormData().businessName, 'HDICT')

  let page
  loadScript('pages/collect/collect.js', {
    Page: definition => { page = definition },
    wx: { showToast() {} },
    require: name => ({
      '../../utils/commission-fixed': commission,
      '../../utils/product-config': productConfig,
      '../../utils/storage': storage
    }[name] || {})
  })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = function(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.')
      let target = this.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts[parts.length - 1]] = value
    }
  }
  page.initData()
  assert.equal(page.data.products.length, 8)
  expected.forEach(({ name, amounts }, index) => {
    page.onProductChange({ detail: { value: String(index) } })
    assert.equal(page.data.formData.businessName, name)
    assert.equal(page.data.estimatedCommission, amounts.reduce((sum, amount) => sum + amount, 0))
  })
  page.autoFillForm(storage.getLastFormData())
  assert.equal(page.data.formData.businessName, 'HDICT')
  assert.equal(page.data.products[page.data.productIndex].name, 'HDICT')
  assert.equal(page.validateForm(), true)
  page.autoFillForm({ businessName: '全光组网融合套餐直降30元' })
  assert.equal(page.data.formData.businessName, '')
  assert.equal(page.data.estimatedCommission, 0)
  assert.equal(page.validateForm(), false)
  page.resetForm()
  assert.equal(page.data.products.length, 8)
  assert.equal(page.data.formData.businessName, '')

  const template = read('pages/collect/collect.wxml').replace(/<!--[\s\S]*?-->/g, '')
  const stack = []
  const tags = /<\/?([a-z][\w-]*)(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>/gi
  for (const match of template.matchAll(tags)) {
    if (match[0].startsWith('</')) assert.equal(stack.pop(), match[1], '模板标签应正确嵌套')
    else if (!match[0].endsWith('/>')) stack.push(match[1])
  }
  assert.equal(stack.length, 0)
  assert.equal((template.match(/bindchange="onProductChange"/g) || []).length, 1)
  assert.doesNotMatch(template, /selectedProduct|selectedCategory|selectedSubcategory|onCategoryChange|onSubcategoryChange/)
  for (const [, handler] of template.matchAll(/\bbind(?:tap|change|input)="([^"]+)"/g)) {
    assert.equal(typeof page[handler], 'function', `事件处理方法缺失：${handler}`)
  }

  const user = { openid: 'test-user', gridAccount: 'demo', realName: '测试人员', district: '监利' }
  const saved = []
  const db = {
    command: {},
    collection(name) {
      if (name === 'users') {
        const query = { get: async () => ({ data: [user] }), limit() { return this } }
        return { where: () => query }
      }
      assert.equal(name, 'business_records')
      return { add: async ({ data }) => { saved.push(data); return { _id: 'test-record' } } }
    }
  }
  const backend = loadScript('cloudfunctions/businessData/index.js', {
    require: name => {
      if (name === './commission-rules') return cloudRules
      assert.equal(name, 'wx-server-sdk')
      return { init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => db, getWXContext: () => ({ OPENID: user.openid }) }
    }
  })
  const create = businessName => backend.main({ action: 'create', data: {
    businessName, gridAccount: user.gridAccount, date: '2026-10-01', commission: 9999,
    commissionDetails: { T1: 9999, total: 9999 }
  } })
  const accepted = await create('企业宽带')
  assert.equal(accepted.success, true)
  assert.equal(saved[0].commission, 36, '云端应忽略前端提交的酬金金额')
  assert.equal(saved[0].commissionDetails.T1, 0)
  assert.equal(saved[0].commissionDetails.T2, 18)
  assert.equal(saved[0].commissionDetails.T3, 18)
  assert.equal((await create('全光组网融合套餐直降30元')).success, false)
  assert.equal((await create('')).success, false)
  assert.equal(saved.length, 1, '无效业务不得写入数据库')

  console.log('通过：8类规则、前后端一致性、分月核算、历史明细、缓存、单级选择、模板及云端提交校验。')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
