/**
 * 微信小程序云数据库初始化脚本
 * 在微信开发者工具的云开发控制台中执行此脚本来初始化数据库
 */

// 1. 创建用户集合索引
db.collection('users').createIndex({
  "openid": 1
}, {
  "unique": true,
  "name": "openid_unique"
})

db.collection('users').createIndex({
  "role": 1
}, {
  "name": "role_index"
})

db.collection('users').createIndex({
  "createTime": -1
}, {
  "name": "createTime_desc"
})

// 2. 创建业务记录集合索引
db.collection('business_records').createIndex({
  "submittedBy.openid": 1
}, {
  "name": "submitter_openid_index"
})

db.collection('business_records').createIndex({
  "status": 1
}, {
  "name": "status_index"
})

db.collection('business_records').createIndex({
  "businessType": 1
}, {
  "name": "business_type_index"
})

db.collection('business_records').createIndex({
  "createTime": -1
}, {
  "name": "createTime_desc"
})

db.collection('business_records').createIndex({
  "submittedBy.openid": 1,
  "createTime": -1
}, {
  "name": "submitter_createTime_index"
})

// 3. 插入示例管理员用户（可选）
db.collection('users').add({
  data: {
    openid: "admin_openid_example",
    nickName: "系统管理员",
    avatarUrl: "",
    role: "sales_department",
    status: "active",
    phone: "13800138000",
    department: "销售部门",
    createTime: new Date(),
    updateTime: new Date()
  }
})

console.log("数据库初始化完成！")
