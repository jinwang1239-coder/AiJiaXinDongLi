// 数据库集合配置和安全规则
module.exports = {
  // 数据库集合定义
  collections: [
    {
      name: 'users',
      description: '用户信息表',
      fields: {
        openid: 'string',        // 微信用户唯一标识
        nickName: 'string',      // 用户昵称
        avatarUrl: 'string',     // 头像链接
        role: 'string',          // 用户角色: sales_person, district_manager, sales_department
        status: 'string',        // 用户状态: active, inactive
        phone: 'string',         // 联系电话
        department: 'string',    // 所属部门
        createTime: 'date',      // 创建时间
        updateTime: 'date'       // 更新时间
      },
      indexes: [
        { keys: { openid: 1 }, unique: true },
        { keys: { role: 1 } },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'business_records',
      description: '业务记录表',
      fields: {
        businessName: 'string',      // 商户名称
        businessType: 'string',      // 业务类型
        contactPerson: 'string',     // 联系人
        contactPhone: 'string',      // 联系电话
        address: 'string',           // 地址
        bandwidth: 'number',         // 带宽
        monthlyFee: 'number',        // 月费
        commission: 'number',        // 酬金
        images: 'array',             // 图片数组
        notes: 'string',             // 备注
        submittedBy: 'object',       // 提交人信息
        status: 'string',            // 状态: pending, approved, rejected
        reviewedBy: 'object',        // 审核人信息
        reviewTime: 'date',          // 审核时间
        reviewNotes: 'string',       // 审核备注
        createTime: 'date',          // 创建时间
        updateTime: 'date'           // 更新时间
      },
      indexes: [
        { keys: { 'submittedBy.openid': 1 } },
        { keys: { status: 1 } },
        { keys: { businessType: 1 } },
        { keys: { createTime: -1 } },
        { keys: { 'submittedBy.openid': 1, createTime: -1 } }
      ]
    }
  ],

  // 数据库安全规则
  securityRules: {
    users: {
      read: true,  // 允许读取（在云函数中进一步控制）
      write: false // 禁止直接写入，只能通过云函数
    },
    business_records: {
      read: true,  // 允许读取（在云函数中进一步控制）
      write: false // 禁止直接写入，只能通过云函数
    }
  }
}
