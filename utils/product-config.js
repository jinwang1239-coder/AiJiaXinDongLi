// utils/product-config.js - 产品配置数据
// 基于 remuneration.md 文件构建的产品选项和酬金配置
// 产品名称直接对应酬金配置，不再使用三级结构。

const PRODUCT_CONFIG = {
  '家庭宽带': {
    commission: { T1: 15, T2: 15, T3: 15, T4: 15, total: 60 }
  },
  '全光组网': {
    commission: { T1: 13, T2: 13, T3: 13, T4: 13, T5: 13, total: 65 }
  },
  '智能组网': {
    commission: { T1: 6, T2: 6, T3: 6, T4: 6, T5: 6, total: 30 }
  },
  '家庭安防': {
    commission: { T1: 6, T2: 6, T3: 6, T4: 6, T5: 6, total: 30 }
  },
  '移动高清': {
    commission: { T1: 4, T2: 4, T3: 4, T4: 4, T5: 4, total: 20 }
  },
  'HDICT': {
    commission: { T2: 59, total: 59 }
  },
  '号卡': {
    commission: { T1: 5, T2: 5, total: 10 }
  },
  '企业宽带': {
    commission: { T2: 18, T3: 18, total: 36 }
  }
}

function getProducts() {
  return Object.keys(PRODUCT_CONFIG).map(name => ({
    name,
    ...PRODUCT_CONFIG[name]
  }))
}

module.exports = {
  PRODUCT_CONFIG,
  getProducts
}
