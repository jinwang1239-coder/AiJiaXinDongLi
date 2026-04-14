/**
 * 数据库集合创建和初始化脚本
 * 在云开发控制台的数据库页面执行此脚本
 */

// 注意：集合需要先在控制台手动创建，然后执行此脚本添加索引

// 1. 为 users 集合创建索引
console.log('正在为 users 集合创建索引...');

// 创建 openid 唯一索引
db.collection('users').createIndex({
  "openid": 1
}, {
  "unique": true,
  "name": "openid_unique"
});

// 创建网格通账号索引
db.collection('users').createIndex({
  "gridAccount": 1
}, {
  "name": "grid_account_index"
});

// 创建角色索引
db.collection('users').createIndex({
  "role": 1
}, {
  "name": "role_index"
});

// 创建创建时间索引
db.collection('users').createIndex({
  "createTime": -1
}, {
  "name": "createTime_desc"
});

console.log('users 集合索引创建完成');

// 2. 为 business_records 集合创建索引
console.log('正在为 business_records 集合创建索引...');

// 创建提交者索引
db.collection('business_records').createIndex({
  "submittedBy.openid": 1
}, {
  "name": "submitter_openid_index"
});

// 创建业务归属用户索引
db.collection('business_records').createIndex({
  "userId": 1
}, {
  "name": "user_id_index"
});

// 创建业务网格通账号索引
db.collection('business_records').createIndex({
  "gridAccount": 1
}, {
  "name": "grid_account_index"
});

// 创建发展人员网格通账号索引
db.collection('business_records').createIndex({
  "developerGridAccount": 1
}, {
  "name": "developer_grid_account_index"
});

// 创建业务归属人快照索引
db.collection('business_records').createIndex({
  "owner.openid": 1
}, {
  "name": "owner_openid_index"
});

db.collection('business_records').createIndex({
  "owner.gridAccount": 1
}, {
  "name": "owner_grid_account_index"
});

// 创建办理日期索引
db.collection('business_records').createIndex({
  "date": -1
}, {
  "name": "business_date_desc"
});

// 创建业务名称索引
db.collection('business_records').createIndex({
  "businessName": 1
}, {
  "name": "business_name_index"
});

// 创建状态索引
db.collection('business_records').createIndex({
  "status": 1
}, {
  "name": "status_index"
});

// 创建业务类型索引
db.collection('business_records').createIndex({
  "businessType": 1
}, {
  "name": "business_type_index"
});

// 创建时间索引
db.collection('business_records').createIndex({
  "createTime": -1
}, {
  "name": "createTime_desc"
});

// 创建复合索引
db.collection('business_records').createIndex({
  "submittedBy.openid": 1,
  "createTime": -1
}, {
  "name": "submitter_createTime_index"
});

console.log('business_records 集合索引创建完成');
console.log('数据库初始化完成！');
