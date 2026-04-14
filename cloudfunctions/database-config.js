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
        realName: 'string',      // 姓名
        gridAccount: 'string',   // 网格通账号
        district: 'string',      // 区县
        gridName: 'string',      // 所属网格
        createTime: 'date',      // 创建时间
        updateTime: 'date'       // 更新时间
      },
      indexes: [
        { keys: { openid: 1 }, unique: true },
        { keys: { gridAccount: 1 } },
        { keys: { role: 1 } },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'business_records',
      description: '业务记录表',
      fields: {
        userId: 'string',            // 业务归属用户openid
        date: 'date',                // 办理时间
        district: 'string',          // 区县
        gridName: 'string',          // 所属网格
        gridAccount: 'string',       // 网格通账号
        businessName: 'string',      // 业务名称
        rawBusinessName: 'string',   // 原始业务名称
        businessType: 'string',      // 业务类型
        businessNumber: 'string',    // 业务号码
        userPhone: 'string',         // 兼容旧字段：用户号码
        developer: 'string',         // 发展人员展示名
        developerGridAccount: 'string', // 发展人员网格通账号
        contactPerson: 'string',     // 联系人
        contactPhone: 'string',      // 联系电话
        address: 'string',           // 地址
        bandwidth: 'number',         // 带宽
        monthlyFee: 'number',        // 月费
        commission: 'number',        // 酬金
        commissionDetails: 'object', // T+1至T+5分月酬金
        settlementSchedule: 'array', // 分月核算状态
        settlementSummary: 'object', // 已核算/未核算汇总
        images: 'array',             // 图片数组
        attachments: 'array',        // 图片附件
        notes: 'string',             // 备注
        owner: 'object',             // 业务归属人信息
        submittedBy: 'object',       // 实际录入人信息
        importedBy: 'object',        // 批量导入人信息
        source: 'string',            // 数据来源: form, batch_import
        importId: 'string',          // 批量导入批次
        status: 'string',            // 状态: pending, approved, rejected
        reviewedBy: 'object',        // 审核人信息
        reviewTime: 'date',          // 审核时间
        reviewNotes: 'string',       // 审核备注
        createTime: 'date',          // 创建时间
        updateTime: 'date'           // 更新时间
      },
      indexes: [
        { keys: { 'submittedBy.openid': 1 } },
        { keys: { userId: 1 } },
        { keys: { gridAccount: 1 } },
        { keys: { developerGridAccount: 1 } },
        { keys: { 'owner.openid': 1 } },
        { keys: { 'owner.gridAccount': 1 } },
        { keys: { date: -1 } },
        { keys: { businessName: 1 } },
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
