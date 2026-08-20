const CURRENT_MAJOR_CATEGORY = '集客线路'
const CURRENT_SUBCATEGORY = '集客开通'
const MAJOR_CATEGORY_OPTIONS = ['集客', '线路']
const SUBCATEGORY_OPTIONS = ['集客开通', '集客维护', '集客计次', '杆路维护', '抢修配置']
const COMMISSION_SUBCATEGORY_OPTIONS = SUBCATEGORY_OPTIONS
const SUBCATEGORY_TO_MAJOR = {
  集客开通: '集客',
  集客维护: '集客',
  集客计次: '集客',
  杆路维护: '线路',
  抢修配置: '线路'
}
const WORKLOAD_GROUPS = [
  { groupName: '杆路', items: [
    ['pole_concrete', '立水泥杆', '根', 88.00], ['guy_wire', '拉线', '条', 51.15], ['drop_wire_50m', '吊线（杆路/墙壁）', '50米条', 14.56], ['drop_wire_add_10m', '吊线（杆路/墙壁）', '每增加10米', 3.05]
  ] },
  { groupName: '光缆安装', items: [
    ['fiber_attach_200m', '光缆附挂（架空/管道/墙壁/楼内）', '200米/条', 282.85], ['fiber_attach_add_50m', '光缆附挂（架空/管道/墙壁/楼内）', '每增加50米', 22.36], ['fiber_buried_10m', '光缆直埋', '10米条', 60.64], ['fiber_test_2core', '用户光缆测试', '2芯/全程', 13.89]
  ] },
  { groupName: '网络箱安装', items: [
    ['split_box', '分纤箱安装', '个', 31.55], ['wall_box', '壁挂箱安装', '个', 49.24], ['rack_install', '综合机架安装（综合柜/ODF/DDF等)', '个', 76.37]
  ] },
  { groupName: '设备安装', items: [
    ['small_photoelectric_install', '小型光电设备安装', '台', 45.07], ['splitter_install', '安装光分路器', '台', 8.22], ['ipbx_install', 'IPBX设备、传输汇聚层设备安装', '套', 128.04], ['private_line_open', '专线全程开通', '元/条', 34.91]
  ] },
  { groupName: '终端安装', items: [
    ['internet_terminal', '互联网用户终端安装测试', '户', 11.86], ['tv_terminal', 'N业务电视终端安装测试', '户', 4.40], ['phone_terminal', 'N业务电话终端安装测试', '户', 4.40], ['monitor_point', 'N业务和目/云监控（行业）', '点', 36.72]
  ] },
  { groupName: '综合布线', items: [['comprehensive_cabling', '综合布线（语音/数据/皮线）', '信息点', 26.25]] },
  { groupName: '其它', items: [
    ['document_fee', '资料费', '站', 25.40], ['site_survey', '现场预勘', '次', 48.02], ['fiber_jump', '电路跳纤', '站', 25.61], ['device_debug_fee', '用户设备调试费用', '客户', 37.03], ['resource_cleanup', '专线资源维护清理', '人·小时', 12.32]
  ] },
  { groupName: '复杂设备安装', items: [
    ['small_box_device', '小型盒式设备', '台', 277.60], ['medium_frame_device', '中型机框式设备', '台', 1183.54], ['large_cabinet_device', '大型机柜式设备', '台', 3913.25]
  ] },
  { groupName: '赔补费', items: [
    ['pole_hole_compensation', '杆洞及拉线洞赔补', '个', 17.25], ['overhead_compensation', '新建架空赔补', '公里', 344.95], ['drop_wire_compensation', '新增吊线赔补', '公里', 172.48]
  ] },
  { groupName: '新增取费标准', items: [
    ['router_debug', '路由器安装调试', '台', 40.79], ['switch_debug', '交换机安装调试', '台', 40.79], ['small_photoelectric_remove', '小型光电设备拆除', '台', 14.14], ['transport_remove', '传输设备拆除', '台', 47.52], ['light_cross_box', '立光交箱', '个', 689.91]
  ] }
].map(group => ({
  groupName: group.groupName,
  items: group.items.map(item => ({ itemCode: item[0], itemName: item[1], unit: item[2], referenceUnitPrice: item[3] }))
}))

function getDefaultSettlementMonth(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
}

function toMonthPickerValue(settlementMonth = '') {
  return `${settlementMonth || getDefaultSettlementMonth()}-01`
}

function getMajorCategoryBySubCategory(subCategory = CURRENT_SUBCATEGORY) {
  return SUBCATEGORY_TO_MAJOR[subCategory] || '集客'
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function decodeQueryValue(value = '') {
  let decoded = String(value || '').replace(/\+/g, ' ')
  for (let pass = 0; pass < 2 && /%[0-9a-f]{2}/i.test(decoded); pass += 1) {
    try {
      const nextValue = decodeURIComponent(decoded)
      if (nextValue === decoded) break
      decoded = nextValue
    } catch (error) {
      break
    }
  }
  return decoded.trim()
}

function normalizeSubCategory(value = '', fallback = '') {
  const decoded = decodeQueryValue(value)
  return SUBCATEGORY_OPTIONS.includes(decoded) ? decoded : fallback
}

function buildCommissionCompositionText(totalAmount = 0, composition = []) {
  const amountMap = {}
  ;(composition || []).forEach(item => { if (item && item.subCategory) amountMap[item.subCategory] = Number(item.amount || 0) })
  return `总工费（${formatMoney(totalAmount)}元）=${SUBCATEGORY_OPTIONS.map(subCategory => `${subCategory}（${formatMoney(amountMap[subCategory] || 0)}元）`).join('+')}`
}

function buildGroupedWorkloadItems(actualItems = []) {
  const itemMap = {}
  ;(actualItems || []).forEach(item => { if (item && item.itemCode) itemMap[item.itemCode] = item })
  return WORKLOAD_GROUPS.map(group => ({
    groupName: group.groupName,
    items: group.items.map(baseItem => {
      const actualItem = itemMap[baseItem.itemCode] || {}
      const qty = Number(actualItem.qty || 0)
      const unitPrice = Number(actualItem.unitPrice || baseItem.referenceUnitPrice || 0)
      const amount = actualItem.amount === undefined || actualItem.amount === null
        ? Math.round(qty * unitPrice * 100) / 100
        : Number(actualItem.amount || 0)
      return {
        ...baseItem,
        qty,
        qtyText: String(qty),
        unitPrice,
        unitPriceText: formatMoney(unitPrice),
        amount,
        amountText: formatMoney(amount),
        hasValue: qty > 0
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
  SUBCATEGORY_TO_MAJOR,
  WORKLOAD_GROUPS,
  getDefaultSettlementMonth,
  toMonthPickerValue,
  getMajorCategoryBySubCategory,
  formatMoney,
  decodeQueryValue,
  normalizeSubCategory,
  buildCommissionCompositionText,
  buildGroupedWorkloadItems,
  buildQueryString
}
