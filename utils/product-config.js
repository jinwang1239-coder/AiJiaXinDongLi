// utils/product-config.js - 产品配置数据
// 基于 remuneration.md 文件构建的产品三级结构和酬金配置

/**
 * 产品三级结构配置
 * 一级：产品大类
 * 二级：产品小类  
 * 三级：产品资费名称
 */
const PRODUCT_CONFIG = {
  '号卡业务': {
    '副卡': {
      '家庭成员卡、幸福卡': {
        commission: { T1: 3, T2: 3, total: 6 },
        equivalentIncome: 10
      }
    },
    '普通放号': {
      '全家享39元': {
        commission: { T1: 5, T2: 5, T3: 5, T4: 5, total: 20 },
        equivalentIncome: 30
      },
      '全家享59元': {
        commission: { T1: 25, T2: 21, T3: 21, T4: 4, total: 71 },
        equivalentIncome: 70
      },
      '全家享79元': {
        commission: { T1: 43, T2: 43, T3: 43, T4: 38, total: 167 },
        equivalentIncome: 70
      },
      '全家享99元': {
        commission: { T1: 53, T2: 53, T3: 53, T4: 48, total: 207 },
        equivalentIncome: 70
      },
      '全家享129元': {
        commission: { T1: 70, T2: 70, T3: 70, T4: 62, total: 272 },
        equivalentIncome: 70
      },
      '全家享199元': {
        commission: { T1: 107, T2: 107, T3: 107, T4: 96, total: 417 },
        equivalentIncome: 70
      }
    },
    '优质客户': {
      '优质客户79元': {
        commission: { T2: 71, T3: 71, T4: 71, T5: 71, total: 284 },
        equivalentIncome: 70
      },
      '优质客户129元': {
        commission: { T2: 116, T3: 116, T4: 116, T5: 116, total: 464 },
        equivalentIncome: 70
      }
    },
    '套餐升档': {
      '按照套餐实际消费提升价值,以新旧差额20元（79套餐及以上）': {
        commission: { T1: 5, T2: 5, T3: 2, total: 12 },
        equivalentIncome: 10
      }
    }
  },
  
  '宽带业务': {
    '一宽': {
      '主套餐59元以下 (300M以下)': {
        commission: { T1: 5, T2: 5, T3: 5, T4: 5, total: 20 },
        equivalentIncome: 45
      },
      '主套餐59元-79元(不含) (300M-500M)': {
        commission: { T1: 9, T2: 9, T3: 9, T4: 9, total: 36 },
        equivalentIncome: 45
      },
      '主套餐79元及以上 (1000M以上)': {
        commission: { T1: 14, T2: 14, T3: 14, T4: 14, total: 56 },
        equivalentIncome: 45
      }
    },
    '家庭权益产品': {
      '千兆提速（绿色上网）（3元/月）': {
        commission: { T2: 5, total: 5 },
        equivalentIncome: 5
      }
    }
  },
  
  '智家业务': {
    'FTTR': {
      '一次性付费产品 (1688元)': {
        commission: { T1: 253, total: 253 },
        equivalentIncome: 49
      },
      '一次性付费产品 (599元)': {
        commission: { T1: 90, total: 90 },
        equivalentIncome: 49
      },
      '全光组网融合套餐直降30元': {
        commission: { T1: 24, T2: 12, T3: 12, T4: 12, T5: 12, total: 72 },
        equivalentIncome: 49
      },
      '全光组网融合套餐直降20元': {
        commission: { T1: 24, T2: 12, T3: 12, T4: 12, T5: 12, total: 72 },
        equivalentIncome: 49
      },
      '399FTTR': {
        commission: { T1: 72, total: 72 },
        equivalentIncome: 49
      }
    },
    '智能组网': {
      '全家WIFI1台-298版': {
        commission: { T1: 29, total: 29 },
        equivalentIncome: 15
      },
      '湖北移动全家WiFi小福袋(15元/月)【2025】': {
        commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 },
        equivalentIncome: 15
      },
      '湖北移动看家小福袋组网版(25元/月)【2025】': {
        commission: { T1: 15, T2: 8, T3: 8, T4: 8, T5: 8, total: 47 },
        equivalentIncome: 15
      }
    },
    '安防': {
      '移动看家260礼包': {
        commission: { T1: 29, total: 29 },
        equivalentIncome: 15
      },
      '湖北移动看家小福袋室内/外版(15元/月)【2025】': {
        commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 },
        equivalentIncome: 15
      },
      '湖北移动看家小福袋室内/外版(25元/月)【2025】': {
        commission: { T1: 15, T2: 8, T3: 8, T4: 8, T5: 8, total: 47 },
        equivalentIncome: 15
      },
      '组网安防套包 (20元/月)': {
        commission: { T1: 12, T2: 6, T3: 6, T4: 6, T5: 6, total: 36 },
        equivalentIncome: 15
      }
    },
    '大颗粒礼包': {
      '520全家福礼包安防室内/外': {
        commission: { T1: 94, total: 94 },
        equivalentIncome: 34
      },
      '365全家福礼包': {
        commission: { T1: 66, total: 66 },
        equivalentIncome: 34
      }
    },
    '移动高清': {
      '移动高清清灵犀版 (15元/月)': {
        commission: { T1: 7, T2: 4, T3: 4, T4: 4, T5: 4, total: 23 },
        equivalentIncome: 0
      },
      '大屏增值业务 (10元/月)': {
        commission: { T1: 3, total: 3 },
        equivalentIncome: 0
      }
    },
    '语音遥控器': {
      '语音遥控资费年包36元/年': {
        commission: { T1: 7, total: 7 },
        equivalentIncome: 0
      }
    },
    '全屋智能': {
      '1599元档-爱家尊享入服务包 (标准包18)': {
        commission: { T1: 336, total: 336 },
        equivalentIncome: 34
      },
      '999元档-爱家智能出入服务包 (标准包16)': {
        commission: { T1: 210, total: 210 },
        equivalentIncome: 34
      },
      '399元档-爱家主食蒸煮/无油烹饪服务包 (标准包5)': {
        commission: { T1: 60, total: 60 },
        equivalentIncome: 34
      },
      '239元档-爱家运动健康/血压监测/伴学免抄服务包 (标准包2)': {
        commission: { T1: 36, total: 36 },
        equivalentIncome: 34
      },
      '199元档-爱家体脂监测服务包 (标准包1)': {
        commission: { T1: 30, total: 30 },
        equivalentIncome: 34
      },
      '359元档-爱家防暑降温服务包 (标准包4)': {
        commission: { T1: 54, total: 54 },
        equivalentIncome: 34
      },
      '299元档-爱家伴学照明服务包 (标准包3)': {
        commission: { T1: 45, total: 45 },
        equivalentIncome: 34
      }
    }
  },
  
  '商客业务': {
    '千里眼': {
      '中小企业千里眼15元/月': {
        commission: { T1: 9, T2: 5, T3: 5, T4: 5, T5: 5, total: 29 },
        equivalentIncome: 13
      },
      '中小企业千里眼10元/月': {
        commission: { T1: 6, T2: 3, T3: 3, T4: 3, T5: 3, total: 18 },
        equivalentIncome: 13
      }
    },
    '云电脑': {
      '全省云电脑预存享活动2160元档': {
        commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 },
        equivalentIncome: 10
      },
      '全省云电脑预存享活动1680元档': {
        commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 },
        equivalentIncome: 10
      },
      '大众版云电脑365礼包': {
        commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 },
        equivalentIncome: 10
      },
      '大众版云电脑分月优惠活动50元档': {
        commission: { T1: 30, T2: 30, T3: 30, T4: 30, total: 120 },
        equivalentIncome: 10
      }
    }
  },
  
  '新增': {
    '爱家亲情圈': {
      '爱家亲情圈': {
        commission: { T1: 6, total: 6 },
        equivalentIncome: 0
      }
    },
    '移动高清-大屏点播': {
      '移动高清-优选电影包1元': {
        commission: { T1: 0.6, T2: 0.3, T3: 0.3, T4: 0.3, T5: 0.3, total: 1.8 },
        equivalentIncome: 0
      },
      '移动高清-优选电视剧包1元': {
        commission: { T1: 0.6, T2: 0.3, T3: 0.3, T4: 0.3, T5: 0.3, total: 1.8 },
        equivalentIncome: 0
      }
    }
  }
}

/**
 * 获取所有产品大类
 * @returns {Array} 产品大类列表
 */
function getProductCategories() {
  return Object.keys(PRODUCT_CONFIG)
}

/**
 * 根据产品大类获取产品小类
 * @param {string} category - 产品大类
 * @returns {Array} 产品小类列表
 */
function getProductSubcategories(category) {
  if (!PRODUCT_CONFIG[category]) {
    return []
  }
  return Object.keys(PRODUCT_CONFIG[category])
}

/**
 * 根据产品大类和小类获取具体产品
 * @param {string} category - 产品大类
 * @param {string} subcategory - 产品小类
 * @returns {Array} 具体产品列表
 */
function getProductItems(category, subcategory) {
  if (!PRODUCT_CONFIG[category] || !PRODUCT_CONFIG[category][subcategory]) {
    return []
  }
  return Object.keys(PRODUCT_CONFIG[category][subcategory])
}

/**
 * 根据完整产品路径计算酬金
 * @param {string} category - 产品大类
 * @param {string} subcategory - 产品小类  
 * @param {string} item - 具体产品
 * @returns {Object} 酬金信息
 */
function calculateProductCommission(category, subcategory, item) {
  try {
    const categoryObj = PRODUCT_CONFIG[category]
    const subObj = categoryObj ? categoryObj[subcategory] : undefined
    const productConfig = subObj ? subObj[item] : undefined
    
    if (!productConfig) {
      return {
        total: 0,
        details: {},
        equivalentIncome: 0,
        error: '未找到对应产品配置'
      }
    }
    
    return {
      total: (productConfig.commission && productConfig.commission.total) ? productConfig.commission.total : 0,
      details: productConfig.commission,
      equivalentIncome: productConfig.equivalentIncome || 0,
      error: null
    }
  } catch (error) {
    console.error('计算酬金时出错：', error)
    return {
      total: 0,
      details: {},
      equivalentIncome: 0,
      error: '计算错误'
    }
  }
}

/**
 * 根据产品名称模糊搜索匹配的产品
 * @param {string} searchName - 搜索的产品名称
 * @returns {Array} 匹配的产品列表
 */
function searchProducts(searchName) {
  const results = []
  const searchLower = searchName.toLowerCase()
  
  Object.keys(PRODUCT_CONFIG).forEach(category => {
    Object.keys(PRODUCT_CONFIG[category]).forEach(subcategory => {
      Object.keys(PRODUCT_CONFIG[category][subcategory]).forEach(item => {
        if (item.toLowerCase().includes(searchLower) ||
            category.toLowerCase().includes(searchLower) ||
            subcategory.toLowerCase().includes(searchLower)) {
          results.push({
            category,
            subcategory,
            item,
            fullName: `${category} > ${subcategory} > ${item}`,
            commission: PRODUCT_CONFIG[category][subcategory][item].commission.total
          })
        }
      })
    })
  })
  
  return results
}

/**
 * 获取所有产品大类（返回对象数组格式）
 * @returns {Array} 产品大类列表，每个元素包含 name 属性
 */
function getCategories() {
  return Object.keys(PRODUCT_CONFIG).map(name => ({ name }))
}

/**
 * 根据产品大类获取产品小类（返回对象数组格式）
 * @param {string} category - 产品大类
 * @returns {Array} 产品小类列表，每个元素包含 name 属性
 */
function getSubcategories(category) {
  if (!PRODUCT_CONFIG[category]) {
    return []
  }
  return Object.keys(PRODUCT_CONFIG[category]).map(name => ({ name }))
}

/**
 * 根据产品大类和小类获取具体产品（返回对象数组格式）
 * @param {string} category - 产品大类
 * @param {string} subcategory - 产品小类
 * @returns {Array} 具体产品列表，每个元素包含 name 和 commission 属性
 */
function getProducts(category, subcategory) {
  if (!PRODUCT_CONFIG[category] || !PRODUCT_CONFIG[category][subcategory]) {
    return []
  }
  
  return Object.keys(PRODUCT_CONFIG[category][subcategory]).map(name => ({
    name,
    commission: PRODUCT_CONFIG[category][subcategory][name].commission.total || 0,
    equivalentIncome: PRODUCT_CONFIG[category][subcategory][name].equivalentIncome || 0
  }))
}

/**
 * 根据产品名称搜索匹配的产品
 * @param {string} searchName - 搜索的产品名称
 * @returns {Object|null} 匹配的产品信息
 */
function searchProduct(searchName) {
  const searchLower = searchName.toLowerCase()
  
  for (const category of Object.keys(PRODUCT_CONFIG)) {
    for (const subcategory of Object.keys(PRODUCT_CONFIG[category])) {
      for (const item of Object.keys(PRODUCT_CONFIG[category][subcategory])) {
        if (item.toLowerCase().includes(searchLower) || 
            item.toLowerCase() === searchLower) {
          return {
            category,
            subcategory,
            product: item
          }
        }
      }
    }
  }
  
  return null
}

module.exports = {
  PRODUCT_CONFIG,
  getProductCategories,
  getProductSubcategories,
  getProductItems,
  calculateProductCommission,
  searchProducts,
  // 添加 collect.js 中使用的方法
  getCategories,
  getSubcategories,
  getProducts,
  searchProduct
}
