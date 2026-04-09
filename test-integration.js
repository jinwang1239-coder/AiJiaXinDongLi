// 测试三级联动和自动填充功能
const productConfig = require('./utils/product-config')
const storage = require('./utils/storage')
const commission = require('./utils/commission-fixed')

console.log('=== 产品配置测试 ===')

// 1. 测试获取分类
console.log('1. 获取产品分类:')
const categories = productConfig.getCategories()
console.log(categories.map(c => c.name))

// 2. 测试获取子分类
console.log('\n2. 获取"号卡业务"的子分类:')
const subcategories = productConfig.getSubcategories('号卡业务')
console.log(subcategories.map(s => s.name))

// 3. 测试获取具体产品
console.log('\n3. 获取"号卡业务"-"主副卡"的产品:')
const products = productConfig.getProducts('号卡业务', '主副卡')
console.log(products.map(p => ({ name: p.name, commission: p.commission })))

// 4. 测试产品搜索
console.log('\n4. 搜索"FTTR"相关产品:')
const searchResults = productConfig.searchProducts('FTTR')
console.log(searchResults.slice(0, 3).map(p => ({ name: p.name, commission: p.commission })))

// 5. 测试酬金计算
console.log('\n5. 测试酬金计算:')
console.log('FTTR标准版 酬金:', commission.calculateCommission('FTTR标准版'))
console.log('5G主副卡 酬金:', commission.calculateCommission('5G主副卡'))

// 6. 测试存储功能
console.log('\n6. 测试存储功能:')
const testFormData = {
  district: '监利',
  businessName: 'FTTR标准版',
  userPhone: '13812345678',
  developer: '张三'
}
storage.saveLastFormData(testFormData)
const retrievedData = storage.getLastFormData()
console.log('保存并读取的数据:', retrievedData)

console.log('\n=== 测试完成 ===')
