/**
 * 数据库集合创建和初始化脚本
 * 在云开发控制台的数据面板中执行此脚本
 */

console.log('正在为 users 集合创建索引...')

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
  createTime: -1
}, {
  name: 'createTime_desc'
})

console.log('users 集合索引创建完成')
console.log('正在为 business_records 集合创建索引...')

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

console.log('business_records 集合索引创建完成')
console.log('正在为 salary_feedbacks 集合创建索引...')

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

console.log('salary_feedbacks 集合索引创建完成')
console.log('正在为 feedback_routes 集合创建索引...')

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

console.log('feedback_routes 集合索引创建完成')
console.log('数据库初始化完成')
