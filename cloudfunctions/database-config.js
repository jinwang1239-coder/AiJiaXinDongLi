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
        workspaceType: 'string',
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
        { keys: { workspaceType: 1 } },
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
      name: 'line_project_records',
      description: '集客线路项目工单人员明细表',
      fields: {
        settlementMonth: 'string',
        majorCategory: 'string',
        subCategory: 'string',
        district: 'string',
        gridAccount: 'string',
        userOpenid: 'string',
        bindingSource: 'string',
        personName: 'string',
        personKey: 'string',
        personIdCardHash: 'string',
        personIdCardMasked: 'string',
        businessQty: 'number',
        workOrderNameRaw: 'string',
        workOrderType: 'string',
        workOrderSubject: 'string',
        workOrderCode: 'string',
        workOrderKey: 'string',
        excelAmount: 'number',
        excelFormulaAmount: 'number',
        calculatedAmount: 'number',
        amountDiff: 'number',
        checkStatus: 'string',
        checkMessage: 'string',
        workloadItems: 'array',
        importBatchId: 'string',
        sourceSheet: 'string',
        sourceRowNo: 'number',
        sourceFileName: 'string',
        createdBy: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { settlementMonth: 1, subCategory: 1, district: 1 } },
        { keys: { settlementMonth: 1, gridAccount: 1 } },
        { keys: { settlementMonth: 1, personKey: 1 } },
        { keys: { settlementMonth: 1, workOrderKey: 1 } },
        { keys: { importBatchId: 1 } },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'line_project_import_batches',
      description: '集客线路项目导入批次表',
      fields: {
        batchNo: 'string',
        settlementMonth: 'string',
        majorCategory: 'string',
        subCategory: 'string',
        sourceFileName: 'string',
        fileID: 'string',
        totalRows: 'number',
        successRows: 'number',
        errorRows: 'number',
        warningRows: 'number',
        excelAmountTotal: 'number',
        calculatedAmountTotal: 'number',
        totalPeople: 'number',
        totalWorkOrders: 'number',
        districts: 'array',
        replacedRows: 'number',
        validationMismatchCount: 'number',
        status: 'string',
        errorSummary: 'array',
        createdBy: 'object',
        createTime: 'date'
      },
      indexes: [
        { keys: { settlementMonth: 1, subCategory: 1, createTime: -1 } },
        { keys: { batchNo: 1 }, unique: true },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'user_person_bindings',
      description: '系统用户与集客线路人员绑定表',
      fields: {
        userOpenid: 'string',
        gridAccount: 'string',
        personKey: 'string',
        personName: 'string',
        personIdCardHash: 'string',
        district: 'string',
        bindingSource: 'string',
        status: 'string',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { userOpenid: 1 } },
        { keys: { personKey: 1 }, unique: true },
        { keys: { gridAccount: 1 } }
      ]
    },
    {
      name: 'salary_feedbacks',
      description: '薪酬反馈表',
      fields: {
        gridAccount: 'string',
        district: 'string',
        gridName: 'string',
        workspaceType: 'string',
        scene: 'string',
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
      name: 'line_project_month_confirms',
      description: '集客线路项目月度签字确认表',
      fields: {
        workspaceType: 'string',
        scene: 'string',
        gridAccount: 'string',
        district: 'string',
        gridName: 'string',
        settlementMonth: 'string',
        amount: 'number',
        status: 'string',
        confirmType: 'string',
        submitter: 'object',
        confirmTime: 'date',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { gridAccount: 1 } },
        { keys: { settlementMonth: 1 } },
        { keys: { 'submitter.openid': 1 } },
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
    line_project_records: {
      read: true,
      write: false
    },
    line_project_import_batches: {
      read: true,
      write: false
    },
    user_person_bindings: {
      read: true,
      write: false
    },
    salary_feedbacks: {
      read: true,
      write: false
    },
    line_project_month_confirms: {
      read: true,
      write: false
    },
    feedback_routes: {
      read: true,
      write: false
    }
  }
}
