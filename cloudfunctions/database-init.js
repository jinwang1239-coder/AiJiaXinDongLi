/**
 * 微信小程序云数据库初始化脚本
 * 在开发者工具的云开发控制台执行此脚本
 */

db.collection('users').createIndex({
  openid: 1
}, {
  unique: true,
  name: 'openid_unique'
})

db.collection('users').createIndex({
  gridAccount: 1
}, {
  name: 'grid_account_index'
})

db.collection('users').createIndex({
  role: 1
}, {
  name: 'role_index'
})

db.collection('users').createIndex({
  workspaceType: 1
}, {
  name: 'workspace_type_index'
})

db.collection('users').createIndex({
  createTime: -1
}, {
  name: 'createTime_desc'
})

db.collection('business_records').createIndex({
  'submittedBy.openid': 1
}, {
  name: 'submitter_openid_index'
})

db.collection('business_records').createIndex({
  userId: 1
}, {
  name: 'user_id_index'
})

db.collection('business_records').createIndex({
  gridAccount: 1
}, {
  name: 'grid_account_index'
})

db.collection('business_records').createIndex({
  developerGridAccount: 1
}, {
  name: 'developer_grid_account_index'
})

db.collection('business_records').createIndex({
  'owner.openid': 1
}, {
  name: 'owner_openid_index'
})

db.collection('business_records').createIndex({
  'owner.gridAccount': 1
}, {
  name: 'owner_grid_account_index'
})

db.collection('business_records').createIndex({
  date: -1
}, {
  name: 'business_date_desc'
})

db.collection('business_records').createIndex({
  businessName: 1
}, {
  name: 'business_name_index'
})

db.collection('business_records').createIndex({
  status: 1
}, {
  name: 'status_index'
})

db.collection('business_records').createIndex({
  businessType: 1
}, {
  name: 'business_type_index'
})

db.collection('business_records').createIndex({
  createTime: -1
}, {
  name: 'createTime_desc'
})

db.collection('business_records').createIndex({
  'submittedBy.openid': 1,
  createTime: -1
}, {
  name: 'submitter_createTime_index'
})

db.collection('salary_feedbacks').createIndex({
  gridAccount: 1
}, {
  name: 'grid_account_index'
})

db.collection('salary_feedbacks').createIndex({
  status: 1
}, {
  name: 'status_index'
})

db.collection('salary_feedbacks').createIndex({
  'submitter.openid': 1
}, {
  name: 'submitter_openid_index'
})

db.collection('salary_feedbacks').createIndex({
  'managerReview.gridAccount': 1
}, {
  name: 'manager_review_grid_account_index'
})

db.collection('salary_feedbacks').createIndex({
  'supervisorReview.gridAccount': 1
}, {
  name: 'supervisor_review_grid_account_index'
})

db.collection('salary_feedbacks').createIndex({
  createTime: -1
}, {
  name: 'createTime_desc'
})

db.collection('line_project_month_confirms').createIndex({
  gridAccount: 1
}, {
  name: 'grid_account_index'
})

db.collection('line_project_month_confirms').createIndex({
  settlementMonth: 1
}, {
  name: 'settlement_month_index'
})

db.collection('line_project_month_confirms').createIndex({
  'submitter.openid': 1
}, {
  name: 'submitter_openid_index'
})

db.collection('line_project_month_confirms').createIndex({
  createTime: -1
}, {
  name: 'createTime_desc'
})

db.collection('feedback_routes').createIndex({
  district: 1
}, {
  name: 'district_index'
})

db.collection('feedback_routes').createIndex({
  status: 1
}, {
  name: 'status_index'
})

db.collection('line_project_records').createIndex({
  settlementMonth: 1,
  subCategory: 1,
  district: 1
}, {
  name: 'line_project_scope_index'
})

db.collection('line_project_records').createIndex({
  settlementMonth: 1,
  gridAccount: 1
}, {
  name: 'line_project_grid_account_index'
})

db.collection('line_project_records').createIndex({
  settlementMonth: 1,
  workOrderKey: 1
}, {
  name: 'line_project_work_order_index'
})

db.collection('line_project_records').createIndex({
  importBatchId: 1
}, {
  name: 'line_project_batch_index'
})

db.collection('line_project_import_batches').createIndex({
  settlementMonth: 1,
  subCategory: 1,
  createTime: -1
}, {
  name: 'line_project_batch_scope_index'
})

db.collection('line_project_import_batches').createIndex({
  batchNo: 1
}, {
  unique: true,
  name: 'line_project_batch_no_unique'
})

db.collection('user_person_bindings').createIndex({
  personKey: 1
}, {
  unique: true,
  name: 'user_person_binding_person_key_unique'
})

db.collection('user_person_bindings').createIndex({
  gridAccount: 1
}, {
  name: 'user_person_binding_grid_account_index'
})

db.collection('users').add({
  data: {
    openid: 'admin_openid_example',
    nickName: '系统管理员',
    avatarUrl: '',
    role: 'sales_department',
    workspaceType: 'sales',
    status: 'active',
    phone: '13800138000',
    department: '销售部门',
    createTime: new Date(),
    updateTime: new Date()
  }
})

console.log('数据库初始化完成')
