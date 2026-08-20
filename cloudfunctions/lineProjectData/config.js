const CURRENT_MAJOR_CATEGORY = '集客线路'
const CURRENT_SUBCATEGORY = '集客开通'

const SUBCATEGORY_OPTIONS = ['集客开通', '集客维护', '集客计次', '杆路维护', '抢修配置']
const MAJOR_CATEGORY_OPTIONS = ['集客', '线路']
const SUBCATEGORY_TO_MAJOR = {
  集客开通: '集客',
  集客维护: '集客',
  集客计次: '集客',
  杆路维护: '线路',
  抢修配置: '线路'
}

const OPENING_FIXED_FIELDS = [
  { sourceColumn: 'A', targetField: 'sourceSeq', header: '序号' },
  { sourceColumn: 'B', targetField: 'district', header: '区县' },
  { sourceColumn: 'C', targetField: 'gridAccount', header: '网格通账号' },
  { sourceColumn: 'D', targetField: 'personName', header: '姓名' },
  { sourceColumn: 'E', targetField: 'workOrderNameRaw', header: '工单名称1', matchMode: 'startsWith' },
  { sourceColumn: 'F', targetField: 'importedAmount', header: '工单支出（公式）' }
]

const STANDARD_FIXED_FIELDS = [
  { sourceColumn: 'A', targetField: 'sourceSeq', header: '序号' },
  { sourceColumn: 'B', targetField: 'district', header: '区县' },
  { sourceColumn: 'C', targetField: 'gridAccount', header: '网格通账号' },
  { sourceColumn: 'D', targetField: 'personName', header: '姓名' },
  { sourceColumn: 'E', targetField: 'businessQty', header: '业务量', matchMode: 'startsWith' },
  { sourceColumn: 'F', targetField: 'importedAmount', header: '支出' },
  { sourceColumn: 'G', targetField: 'workOrderNameRaw', header: '工单名称1', matchMode: 'startsWith' },
  { sourceColumn: 'H', targetField: 'completionDateText', header: '工单完成日期' },
  { sourceColumn: 'I', targetField: 'companyCategory', header: '工单名称2', matchMode: 'startsWith' },
  { sourceColumn: 'J', targetField: 'siteLevel', header: '集客客户站点级别' },
  { sourceColumn: 'K', targetField: 'endpoint', header: 'A端/Z端' }
]

function columnName(index) {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

const WORKLOAD_ITEMS = [
  ['杆路', 'pole_concrete', '立水泥杆', '根'],
  ['杆路', 'guy_wire', '拉线', '条'],
  ['杆路', 'drop_wire_50m', '吊线（杆路/墙壁）', '50米条'],
  ['杆路', 'drop_wire_add_10m', '吊线（杆路/墙壁）', '每增加10米'],
  ['光缆安装', 'fiber_attach_200m', '光缆附挂（架空/管道/墙壁/楼内）', '200米/条'],
  ['光缆安装', 'fiber_attach_add_50m', '光缆附挂（架空/管道/墙壁/楼内）', '每增加50米'],
  ['光缆安装', 'fiber_buried_10m', '光缆直埋', '10米条'],
  ['光缆安装', 'fiber_test_2core', '用户光缆测试', '2芯/全程'],
  ['网络箱安装', 'split_box', '分纤箱安装', '个'],
  ['网络箱安装', 'wall_box', '壁挂箱安装', '个'],
  ['网络箱安装', 'rack_install', '综合机架安装（综合柜/ODF/DDF等)', '个'],
  ['设备安装', 'small_photoelectric_install', '小型光电设备安装', '台'],
  ['设备安装', 'splitter_install', '安装光分路器', '台'],
  ['设备安装', 'ipbx_install', 'IPBX设备、传输汇聚层设备安装', '套'],
  ['设备安装', 'private_line_open', '专线全程开通', '元/条(注：跨区电路，A、Z端各算一条)'],
  ['终端安装', 'internet_terminal', '互联网用户终端安装测试', '户'],
  ['终端安装', 'tv_terminal', 'N业务电视终端安装测试', '户'],
  ['终端安装', 'phone_terminal', 'N业务电话终端安装测试', '户'],
  ['终端安装', 'monitor_point', 'N业务和目/云监控（行业）', '点'],
  ['综合布线', 'comprehensive_cabling', '综合布线（语音/数据/皮线）', '信息点'],
  ['其它', 'document_fee', '资料费', '站'],
  ['其它', 'site_survey', '现场预勘', '次'],
  ['其它', 'fiber_jump', '电路跳纤', '站'],
  ['其它', 'device_debug_fee', '用户设备调试费用', '客户'],
  ['其它', 'resource_cleanup', '专线资源维护清理', '人·小时'],
  ['复杂设备安装', 'small_box_device', '小型盒式设备 （烽火620A，中兴6120H，华为916F，华为1800I等）', '台'],
  ['复杂设备安装', 'medium_frame_device', '中型机框式设备 （烽火660，中兴6180H，华为970，华为1800V等）', '台'],
  ['复杂设备安装', 'large_cabinet_device', '大型机柜式设备 （烽火6000，华为9800，中兴19700等）', '台'],
  ['赔补费', 'pole_hole_compensation', '杆洞及拉线洞赔补', '个'],
  ['赔补费', 'overhead_compensation', '新建架空赔补', '公里'],
  ['赔补费', 'drop_wire_compensation', '新增吊线赔补', '公里'],
  ['新增取费标准', 'router_debug', '路由器安装调试', '台'],
  ['新增取费标准', 'switch_debug', '交换机安装调试', '台'],
  ['新增取费标准', 'small_photoelectric_remove', '小型光电设备拆除', '台'],
  ['新增取费标准', 'transport_remove', '传输设备拆除', '台'],
  ['新增取费标准', 'light_cross_box', '立光交箱', '个']
]

const ITEM_COLUMN_MAP = WORKLOAD_ITEMS.map((item, index) => ({
  sourceColumn: columnName(index + 6),
  groupName: item[0],
  itemCode: item[1],
  itemName: item[2],
  unit: item[3],
  sortOrder: index + 1
}))

const MODULE_CONFIGS = SUBCATEGORY_OPTIONS.reduce((configs, subCategory) => {
  const opening = subCategory === CURRENT_SUBCATEGORY
  configs[subCategory] = {
    subCategory,
    majorCategory: SUBCATEGORY_TO_MAJOR[subCategory],
    sheetName: subCategory,
    layout: opening ? 'workload' : 'standard',
    fixedFields: opening ? OPENING_FIXED_FIELDS : STANDARD_FIXED_FIELDS,
    dataStartRowNo: opening ? 6 : 2,
    priceRowNo: opening ? 5 : 0,
    amountTolerance: 0.01
  }
  return configs
}, {})

const TEMPLATE_META = {
  templateCode: 'LINE_PROJECT_ALL_MODULES_V1',
  requiredSheetNames: SUBCATEGORY_OPTIONS,
  moduleConfigs: MODULE_CONFIGS,
  amountTolerance: 0.01
}

const APPROVAL_ROUTE_ROSTER = [
  { district: '荆州区', supervisor: { name: '王灿', gridAccount: '18071888614' }, districtManager: { name: '徐家军', gridAccount: '13797309966' } },
  { district: '沙市区', supervisor: { name: '赵青', gridAccount: '13986655569' }, districtManager: { name: '郑东', gridAccount: '13886637788' } },
  { district: '开发区', supervisor: { name: '杨芳', gridAccount: '13545648553' }, districtManager: { name: '王荣进', gridAccount: '13797555099' } },
  { district: '监利', supervisor: { name: '王娟', gridAccount: '13697247000' }, districtManager: { name: '白桦', gridAccount: '15272347267' } },
  { district: '洪湖', supervisor: { name: '邹方艳', gridAccount: '18772699601' }, districtManager: { name: '邓敏', gridAccount: '13872212008' } },
  { district: '松滋', supervisor: { name: '朱锦纯', gridAccount: '18272229353' }, districtManager: { name: '郑拥华', gridAccount: '13593882355' } },
  { district: '公安', supervisor: { name: '李雄', gridAccount: '18272201885' }, districtManager: { name: '徐小红', gridAccount: '13707212333' } },
  { district: '江陵', supervisor: { name: '黄刚', gridAccount: '15927919510' }, districtManager: { name: '唐山', gridAccount: '13797336655' } },
  { district: '石首', supervisor: { name: '鲁浩', gridAccount: '13508622998' }, districtManager: { name: '刘建康', gridAccount: '15272602322' } }
]

// 当前由区县主管暂代基层监督员；两类角色保持独立，后续可分别调整名单。
const DISTRICT_LEADER_ROSTER = [
  { district: '荆州区', name: '王灿', gridAccount: '18071888614' },
  { district: '沙市区', name: '赵青', gridAccount: '13986655569' },
  { district: '开发区', name: '杨芳', gridAccount: '13545648553' },
  { district: '监利', name: '王娟', gridAccount: '13697247000' },
  { district: '洪湖', name: '邹方艳', gridAccount: '18772699601' },
  { district: '松滋', name: '朱锦纯', gridAccount: '18272229353' },
  { district: '公安', name: '李雄', gridAccount: '18272201885' },
  { district: '江陵', name: '黄刚', gridAccount: '15927919510' },
  { district: '石首', name: '鲁浩', gridAccount: '13508622998' }
]

const SYSTEM_ADMIN_ROSTER = [
  { name: '张斌', gridAccount: '18707123688' },
  { name: '刘炽', gridAccount: '13995951983' },
  { name: '李奇琦', gridAccount: '15171129197' }
]

module.exports = {
  CURRENT_MAJOR_CATEGORY,
  CURRENT_SUBCATEGORY,
  MAJOR_CATEGORY_OPTIONS,
  SUBCATEGORY_OPTIONS,
  SUBCATEGORY_TO_MAJOR,
  FIXED_FIELD_COLUMNS: OPENING_FIXED_FIELDS,
  STANDARD_FIXED_FIELDS,
  ITEM_COLUMN_MAP,
  MODULE_CONFIGS,
  TEMPLATE_META,
  APPROVAL_ROUTE_ROSTER,
  DISTRICT_LEADER_ROSTER,
  SYSTEM_ADMIN_ROSTER
}
