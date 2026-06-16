const MAJOR_CATEGORY_OPTIONS = ['集客', '线路']

const SUBCATEGORY_TO_MAJOR = {
  '集客开通': '集客',
  '集客维护': '集客',
  '集客计次': '集客',
  '杆路维护': '线路',
  '抢修配置': '线路'
}

const SUBCATEGORY_OPTIONS = Object.keys(SUBCATEGORY_TO_MAJOR)

const FIXED_FIELD_COLUMNS = [
  { sourceColumn: 'A', targetField: 'sourceSeq', header: '序号' },
  { sourceColumn: 'B', targetField: 'district', header: '区县' },
  { sourceColumn: 'C', targetField: 'personIdCard', header: '身份证号' },
  { sourceColumn: 'D', targetField: 'personName', header: '姓名' },
  { sourceColumn: 'E', targetField: 'businessQty', header: '业务量' },
  { sourceColumn: 'F', targetField: 'excelAmount', header: '工单支出(0.4折)' },
  {
    sourceColumn: 'G',
    targetField: 'workOrderNameRaw',
    header: '工单名称1（省公司规范）[集客开通-XX工单号（编排系统ESOP工单号）；集客维护包年-XX专线（集团客户名称+客户编码+客户级别+端数）；集客查勘-XX工单号；集客计次-XX工单号]'
  },
  { sourceColumn: 'H', targetField: 'excelFormulaAmount', header: '工单支出（公式）' }
]

const ITEM_COLUMN_MAP = [
  { sourceColumn: 'I', groupName: '杆路', itemCode: 'pole_concrete', itemName: '立水泥杆', unit: '根', sortOrder: 1 },
  { sourceColumn: 'J', groupName: '杆路', itemCode: 'guy_wire', itemName: '拉线', unit: '条', sortOrder: 2 },
  { sourceColumn: 'K', groupName: '杆路', itemCode: 'drop_wire_50m', itemName: '吊线（杆路/墙壁）', unit: '50米条', sortOrder: 3 },
  { sourceColumn: 'L', groupName: '杆路', itemCode: 'drop_wire_add_10m', itemName: '吊线（杆路/墙壁）', unit: '每增加10米', sortOrder: 4 },
  { sourceColumn: 'M', groupName: '光缆安装', itemCode: 'fiber_attach_200m', itemName: '光缆附挂（架空/管道/墙壁/楼内）', unit: '200米/条', sortOrder: 5 },
  { sourceColumn: 'N', groupName: '光缆安装', itemCode: 'fiber_attach_add_50m', itemName: '光缆附挂（架空/管道/墙壁/楼内）', unit: '每增加50米', sortOrder: 6 },
  { sourceColumn: 'O', groupName: '光缆安装', itemCode: 'fiber_buried_10m', itemName: '光缆直埋', unit: '10米条', sortOrder: 7 },
  { sourceColumn: 'P', groupName: '光缆安装', itemCode: 'fiber_test_2core', itemName: '用户光缆测试', unit: '2芯/全程', sortOrder: 8 },
  { sourceColumn: 'Q', groupName: '网络箱安装', itemCode: 'split_box', itemName: '分纤箱安装', unit: '个', sortOrder: 9 },
  { sourceColumn: 'R', groupName: '网络箱安装', itemCode: 'wall_box', itemName: '壁挂箱安装', unit: '个', sortOrder: 10 },
  { sourceColumn: 'S', groupName: '网络箱安装', itemCode: 'rack_install', itemName: '综合机架安装（综合柜/ODF/DDF等)', unit: '个', sortOrder: 11 },
  { sourceColumn: 'T', groupName: '设备安装', itemCode: 'small_photoelectric_install', itemName: '小型光电设备安装', unit: '台', sortOrder: 12 },
  { sourceColumn: 'U', groupName: '设备安装', itemCode: 'splitter_install', itemName: '安装光分路器', unit: '台', sortOrder: 13 },
  { sourceColumn: 'V', groupName: '设备安装', itemCode: 'ipbx_install', itemName: 'IPBX设备、传输汇聚层设备安装', unit: '套', sortOrder: 14 },
  { sourceColumn: 'W', groupName: '设备安装', itemCode: 'private_line_open', itemName: '专线全程开通', unit: '元/条(注：跨区电路，A、Z端各算一条)', sortOrder: 15 },
  { sourceColumn: 'X', groupName: '终端安装', itemCode: 'internet_terminal', itemName: '互联网用户终端安装测试', unit: '户', sortOrder: 16 },
  { sourceColumn: 'Y', groupName: '终端安装', itemCode: 'tv_terminal', itemName: 'N业务电视终端安装测试', unit: '户', sortOrder: 17 },
  { sourceColumn: 'Z', groupName: '终端安装', itemCode: 'phone_terminal', itemName: 'N业务电话终端安装测试', unit: '户', sortOrder: 18 },
  { sourceColumn: 'AA', groupName: '终端安装', itemCode: 'monitor_point', itemName: 'N业务和目/云监控（行业）', unit: '点', sortOrder: 19 },
  { sourceColumn: 'AB', groupName: '综合布线', itemCode: 'comprehensive_cabling', itemName: '综合布线（语音/数据/皮线）', unit: '信息点', sortOrder: 20 },
  { sourceColumn: 'AC', groupName: '其它', itemCode: 'document_fee', itemName: '资料费', unit: '站', sortOrder: 21 },
  { sourceColumn: 'AD', groupName: '其它', itemCode: 'site_survey', itemName: '现场预勘', unit: '次', sortOrder: 22 },
  { sourceColumn: 'AE', groupName: '其它', itemCode: 'fiber_jump', itemName: '电路跳纤', unit: '站', sortOrder: 23 },
  { sourceColumn: 'AF', groupName: '其它', itemCode: 'device_debug_fee', itemName: '用户设备调试费用', unit: '客户', sortOrder: 24 },
  { sourceColumn: 'AG', groupName: '其它', itemCode: 'resource_cleanup', itemName: '专线资源维护清理', unit: '人·小时', sortOrder: 25 },
  { sourceColumn: 'AH', groupName: '复杂设备安装', itemCode: 'small_box_device', itemName: '小型盒式设备 （烽火620A，中兴6120H，华为916F，华为1800I等）', unit: '台', sortOrder: 26 },
  { sourceColumn: 'AI', groupName: '复杂设备安装', itemCode: 'medium_frame_device', itemName: '中型机框式设备 （烽火660，中兴6180H，华为970，华为1800V等）', unit: '台', sortOrder: 27 },
  { sourceColumn: 'AJ', groupName: '复杂设备安装', itemCode: 'large_cabinet_device', itemName: '大型机柜式设备 （烽火6000，华为9800，中兴19700等）', unit: '台', sortOrder: 28 },
  { sourceColumn: 'AK', groupName: '赔补费', itemCode: 'pole_hole_compensation', itemName: '杆洞及拉线洞赔补', unit: '个', sortOrder: 29 },
  { sourceColumn: 'AL', groupName: '赔补费', itemCode: 'overhead_compensation', itemName: '新建架空赔补', unit: '公里', sortOrder: 30 },
  { sourceColumn: 'AM', groupName: '赔补费', itemCode: 'drop_wire_compensation', itemName: '新增吊线赔补', unit: '公里', sortOrder: 31 },
  { sourceColumn: 'AN', groupName: '新增取费标准', itemCode: 'router_debug', itemName: '路由器安装调试', unit: '台', sortOrder: 32 },
  { sourceColumn: 'AO', groupName: '新增取费标准', itemCode: 'switch_debug', itemName: '交换机安装调试', unit: '台', sortOrder: 33 },
  { sourceColumn: 'AP', groupName: '新增取费标准', itemCode: 'small_photoelectric_remove', itemName: '小型光电设备拆除', unit: '台', sortOrder: 34 },
  { sourceColumn: 'AQ', groupName: '新增取费标准', itemCode: 'transport_remove', itemName: '传输设备拆除', unit: '台', sortOrder: 35 },
  { sourceColumn: 'AR', groupName: '新增取费标准', itemCode: 'light_cross_box', itemName: '立光交箱', unit: '个', sortOrder: 36 }
]

const TEMPLATE_META = {
  templateCode: 'LINE_PROJECT_V1',
  sheetName: '按人员',
  validationSheetName: '按线路工单',
  headerRowCount: 5,
  priceRowNo: 5,
  dataStartRowNo: 6,
  ignoredColumns: ['AS', 'AT'],
  amountTolerance: 0.01
}

module.exports = {
  MAJOR_CATEGORY_OPTIONS,
  SUBCATEGORY_OPTIONS,
  SUBCATEGORY_TO_MAJOR,
  FIXED_FIELD_COLUMNS,
  ITEM_COLUMN_MAP,
  TEMPLATE_META
}
