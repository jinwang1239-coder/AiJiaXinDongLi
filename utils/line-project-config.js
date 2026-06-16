const CURRENT_MAJOR_CATEGORY = '集客'
const CURRENT_SUBCATEGORY = '集客开通'
const MAJOR_CATEGORY_OPTIONS = [CURRENT_MAJOR_CATEGORY]
const SUBCATEGORY_OPTIONS = [CURRENT_SUBCATEGORY]
const COMMISSION_SUBCATEGORY_OPTIONS = [
  '集客开通',
  '集客维护',
  '集客计次',
  '杆路维护',
  '抢修配置'
]
const WORKLOAD_GROUPS = [
  {
    groupName: '杆路',
    items: [
      { itemCode: 'pole_concrete', itemName: '立水泥杆', unit: '根' },
      { itemCode: 'guy_wire', itemName: '拉线', unit: '条' },
      { itemCode: 'drop_wire_50m', itemName: '吊线（杆路/墙壁）', unit: '50米条' },
      { itemCode: 'drop_wire_add_10m', itemName: '吊线（杆路/墙壁）', unit: '每增加10米' }
    ]
  },
  {
    groupName: '光缆安装',
    items: [
      { itemCode: 'fiber_attach_200m', itemName: '光缆附挂（架空/管道/墙壁/楼内）', unit: '200米/条' },
      { itemCode: 'fiber_attach_add_50m', itemName: '光缆附挂（架空/管道/墙壁/楼内）', unit: '每增加50米' },
      { itemCode: 'fiber_buried_10m', itemName: '光缆直埋', unit: '10米条' },
      { itemCode: 'fiber_test_2core', itemName: '用户光缆测试', unit: '2芯/全程' }
    ]
  },
  {
    groupName: '网络箱安装',
    items: [
      { itemCode: 'split_box', itemName: '分纤箱安装', unit: '个' },
      { itemCode: 'wall_box', itemName: '壁挂箱安装', unit: '个' },
      { itemCode: 'rack_install', itemName: '综合机架安装（综合柜/ODF/DDF等）', unit: '个' }
    ]
  },
  {
    groupName: '设备安装',
    items: [
      { itemCode: 'small_photoelectric_install', itemName: '小型光电设备安装', unit: '台' },
      { itemCode: 'splitter_install', itemName: '安装光分路器', unit: '台' },
      { itemCode: 'ipbx_install', itemName: 'IPBX设备、传输汇聚层设备安装', unit: '套' },
      { itemCode: 'private_line_open', itemName: '专线全程开通', unit: '元/条' }
    ]
  },
  {
    groupName: '终端安装',
    items: [
      { itemCode: 'internet_terminal', itemName: '互联网用户终端安装测试', unit: '户' },
      { itemCode: 'tv_terminal', itemName: 'N业务电视终端安装测试', unit: '户' },
      { itemCode: 'phone_terminal', itemName: 'N业务电话终端安装测试', unit: '户' },
      { itemCode: 'monitor_point', itemName: 'N业务和目/云监控（行业）', unit: '点' }
    ]
  },
  {
    groupName: '综合布线',
    items: [
      { itemCode: 'comprehensive_cabling', itemName: '综合布线（语音/数据/皮线）', unit: '信息点' }
    ]
  },
  {
    groupName: '其它',
    items: [
      { itemCode: 'document_fee', itemName: '资料费', unit: '站' },
      { itemCode: 'site_survey', itemName: '现场预勘', unit: '次' },
      { itemCode: 'fiber_jump', itemName: '电路跳纤', unit: '站' },
      { itemCode: 'device_debug_fee', itemName: '用户设备调试费用', unit: '客户' },
      { itemCode: 'resource_cleanup', itemName: '专线资源维护清理', unit: '人·小时' }
    ]
  },
  {
    groupName: '复杂设备安装',
    items: [
      { itemCode: 'small_box_device', itemName: '小型盒式设备', unit: '台' },
      { itemCode: 'medium_frame_device', itemName: '中型机框式设备', unit: '台' },
      { itemCode: 'large_cabinet_device', itemName: '大型机柜式设备', unit: '台' }
    ]
  },
  {
    groupName: '赔补费',
    items: [
      { itemCode: 'pole_hole_compensation', itemName: '杆洞及拉线洞赔补', unit: '个' },
      { itemCode: 'overhead_compensation', itemName: '新建架空赔补', unit: '公里' },
      { itemCode: 'drop_wire_compensation', itemName: '新增吊线赔补', unit: '公里' }
    ]
  },
  {
    groupName: '新增取费标准',
    items: [
      { itemCode: 'router_debug', itemName: '路由器安装调试', unit: '台' },
      { itemCode: 'switch_debug', itemName: '交换机安装调试', unit: '台' },
      { itemCode: 'small_photoelectric_remove', itemName: '小型光电设备拆除', unit: '台' },
      { itemCode: 'transport_remove', itemName: '传输设备拆除', unit: '台' },
      { itemCode: 'light_cross_box', itemName: '立光交箱', unit: '个' }
    ]
  }
]

function getDefaultSettlementMonth(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  const year = current.getFullYear()
  const month = String(current.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function toMonthPickerValue(settlementMonth = '') {
  return `${settlementMonth || getDefaultSettlementMonth()}-01`
}

function getMajorCategoryBySubCategory() {
  return CURRENT_MAJOR_CATEGORY
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function buildCommissionCompositionText(totalAmount = 0, composition = []) {
  const amountMap = {}
  ;(composition || []).forEach(item => {
    if (!item || !item.subCategory) {
      return
    }
    amountMap[item.subCategory] = Number(item.amount || 0)
  })

  const detailText = COMMISSION_SUBCATEGORY_OPTIONS
    .map(subCategory => `${subCategory}（${formatMoney(amountMap[subCategory] || 0)}元）`)
    .join('+')

  return `总酬金（${formatMoney(totalAmount)}元）=${detailText}`
}

function buildGroupedWorkloadItems(actualItems = []) {
  const itemMap = {}
  ;(actualItems || []).forEach(item => {
    if (!item || !item.itemCode) {
      return
    }
    itemMap[item.itemCode] = item
  })

  return WORKLOAD_GROUPS.map(group => ({
    groupName: group.groupName,
    items: group.items.map(baseItem => {
      const actualItem = itemMap[baseItem.itemCode] || {}
      return {
        ...baseItem,
        qty: Number(actualItem.qty || 0),
        qtyText: String(Number(actualItem.qty || 0)),
        unitPrice: Number(actualItem.unitPrice || 0),
        amount: Number(actualItem.amount || 0),
        hasValue: Number(actualItem.qty || 0) > 0
      }
    })
  }))
}

function buildQueryString(filters = {}) {
  return Object.keys(filters)
    .filter(key => filters[key] !== undefined && filters[key] !== null && filters[key] !== '')
    .map(key => `${key}=${encodeURIComponent(filters[key])}`)
    .join('&')
}

module.exports = {
  CURRENT_MAJOR_CATEGORY,
  CURRENT_SUBCATEGORY,
  MAJOR_CATEGORY_OPTIONS,
  SUBCATEGORY_OPTIONS,
  COMMISSION_SUBCATEGORY_OPTIONS,
  WORKLOAD_GROUPS,
  getDefaultSettlementMonth,
  toMonthPickerValue,
  getMajorCategoryBySubCategory,
  formatMoney,
  buildCommissionCompositionText,
  buildGroupedWorkloadItems,
  buildQueryString
}
