// 数据库集合配置和安全规则
module.exports = {
  collections: [
    {
      name: 'users',
      description: '用户信息表',
      fields: {
        openid: 'string',
        nickName: 'string',
        avatarUrl: 'string',
        role: 'string',
        status: 'string',
        phone: 'string',
        department: 'string',
        realName: 'string',
        gridAccount: 'string',
        district: 'string',
        gridName: 'string',
        createTime: 'date',
        updateTime: 'date'
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
        userId: 'string',
        date: 'date',
        district: 'string',
        gridName: 'string',
        gridAccount: 'string',
        businessName: 'string',
        rawBusinessName: 'string',
        businessType: 'string',
        businessNumber: 'string',
        userPhone: 'string',
        developer: 'string',
        developerGridAccount: 'string',
        contactPerson: 'string',
        contactPhone: 'string',
        address: 'string',
        bandwidth: 'number',
        monthlyFee: 'number',
        commission: 'number',
        commissionDetails: 'object',
        settlementSchedule: 'array',
        settlementSummary: 'object',
        images: 'array',
        attachments: 'array',
        notes: 'string',
        owner: 'object',
        submittedBy: 'object',
        importedBy: 'object',
        source: 'string',
        importId: 'string',
        status: 'string',
        reviewedBy: 'object',
        reviewTime: 'date',
        reviewNotes: 'string',
        createTime: 'date',
        updateTime: 'date'
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
    },
    {
      name: 'salary_feedbacks',
      description: '薪酬反馈表',
      fields: {
        gridAccount: 'string',
        district: 'string',
        gridName: 'string',
        salaryMonth: 'string',
        salaryAmount: 'number',
        content: 'string',
        status: 'string',
        submitter: 'object',
        managerReview: 'object',
        supervisorReview: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { gridAccount: 1 } },
        { keys: { status: 1 } },
        { keys: { 'submitter.openid': 1 } },
        { keys: { 'managerReview.gridAccount': 1 } },
        { keys: { 'supervisorReview.gridAccount': 1 } },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'feedback_routes',
      description: '薪酬反馈审批路由表',
      fields: {
        district: 'string',
        districtManager: 'object',
        supervisor: 'object',
        status: 'string',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { district: 1 } },
        { keys: { status: 1 } }
      ]
    }
  ],

  securityRules: {
    users: {
      read: true,
      write: false
    },
    business_records: {
      read: true,
      write: false
    },
    salary_feedbacks: {
      read: true,
      write: false
    },
    feedback_routes: {
      read: true,
      write: false
    }
  }
}
