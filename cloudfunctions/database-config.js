// 数据库集合配置和安全规则
module.exports = {
  collections: [
    { name: 'sales_month_records', description: '销售员工月度累计业务量及规则快照',
      indexes: [{ keys: { importBatchId: 1 } }, { keys: { employeeId: 1 } },
        { keys: { importBatchId: 1, employeeId: 1 } }, { keys: { importBatchId: 1, district: 1 } }] },
    { name: 'sales_import_batches', description: '销售导入批次及定版更正记录', indexes: [{ keys: { state: 1 } }] },
    { name: 'sales_active_versions', description: '销售月份区县有效版本和月份并发锁', indexes: [{ keys: { district: 1 } }] },
    { name: 'sales_employees', description: '员工编号与微信账号独立认领关系',
      indexes: [{ keys: { employeeId: 1 }, unique: true }, { keys: { userOpenid: 1 }, unique: true }] },
    { name: 'sales_claim_logs', description: '员工认领更正审计', indexes: [{ keys: { employeeId: 1 } }] },
    { name: 'sales_data_receipts', description: '员工查看月度区县业务版本记录',
      indexes: [{ keys: { businessMonth: 1, activeBatchId: 1 } }] },
    {
      name: 'users',
      description: '用户信息表',
      fields: {
        openid: 'string',
        employeeId: 'string',
        salesClaimed: 'boolean',
        salesManagedDistrict: 'string',
        permissions: 'object',
        nickName: 'string',
        avatarUrl: 'string',
        role: 'string',
        workspaceType: 'string',
        lineProjectRoles: 'array',
        managedDistricts: 'array',
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
        boundUserId: 'string',
        bindingStatus: 'string',
        bindingSource: 'string',
        boundTime: 'date|null',
        personName: 'string',
        personKey: 'string',
        businessQty: 'number',
        workOrderNameRaw: 'string',
        workOrderType: 'string',
        workOrderSubject: 'string',
        workOrderCode: 'string',
        workOrderKey: 'string',
        completionDateText: 'string',
        companyCategory: 'string',
        siteLevel: 'string',
        endpoint: 'string',
        importedAmount: 'number',
        calculatedAmount: 'number',
        amountDiff: 'number',
        checkStatus: 'string',
        checkMessage: 'string',
        workloadItems: 'array',
        workloadSummary: 'string',
        importBatchId: 'string',
        importRecordKey: 'string',
        publishStatus: 'string',
        supersededBy: 'string',
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
        { keys: { gridAccount: 1, bindingStatus: 1, publishStatus: 1 } },
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
        boundRows: 'number',
        pendingClaimRows: 'number',
        boundAccounts: 'number',
        pendingClaimAccounts: 'number',
        importedAmountTotal: 'number',
        calculatedAmountTotal: 'number',
        totalGridAccounts: 'number',
        totalPeople: 'number',
        totalWorkOrders: 'number',
        moduleSummaries: 'array',
        districts: 'array',
        replacedRows: 'number',
        previousBatchNos: 'array',
        previousBatchNo: 'string',
        fileFingerprint: 'string',
        chunkSize: 'number',
        totalChunks: 'number',
        completedChunks: 'array',
        writtenRows: 'number',
        validationMismatchCount: 'number',
        status: 'string',
        errorSummary: 'array',
        createdBy: 'object',
        createTime: 'date',
        updateTime: 'date',
        publishedTime: 'date|null',
        rolledBackTime: 'date|null'
      },
      indexes: [
        { keys: { settlementMonth: 1, subCategory: 1, createTime: -1 } },
        { keys: { batchNo: 1 }, unique: true },
        { keys: { status: 1, createTime: -1 } },
        { keys: { createTime: -1 } }
      ]
    },
    {
      name: 'line_project_active_versions',
      description: '集客线路各结算月份当前生效批次指针',
      fields: {
        settlementMonth: 'string',
        activeBatchNo: 'string',
        previousBatchNo: 'string',
        updatedBy: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { settlementMonth: 1 }, unique: true },
        { keys: { activeBatchNo: 1 } }
      ]
    },
    {
      name: 'line_project_salary_records',
      description: '集客线路人员月度整体工资表',
      fields: {
        settlementMonth: 'string',
        district: 'string',
        gridAccount: 'string',
        personName: 'string',
        fixedPay: 'number',
        quantitativePay: 'number',
        enterpriseWithholding: 'number',
        personalWithholding: 'number',
        importedNetPay: 'number',
        calculatedNetPay: 'number',
        detailAmount: 'number',
        quantitativeDiff: 'number',
        status: 'string',
        importBatchNo: 'string',
        importedBy: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { gridAccount: 1, settlementMonth: 1 } },
        { keys: { settlementMonth: 1, district: 1, status: 1 } },
        { keys: { importBatchNo: 1 } }
      ]
    },
    {
      name: 'line_project_salary_import_batches',
      description: '集客线路人员整体工资导入批次表',
      fields: {
        batchNo: 'string',
        settlementMonth: 'string',
        sourceFileName: 'string',
        fileID: 'string',
        fileHash: 'string',
        totalRows: 'number',
        successRows: 'number',
        errorRows: 'number',
        warningRows: 'number',
        totalDistricts: 'number',
        districts: 'array',
        districtSummaries: 'array',
        netPayTotal: 'number',
        status: 'string',
        createdBy: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { batchNo: 1 }, unique: true },
        { keys: { settlementMonth: 1, createTime: -1 } }
      ]
    },
    {
      name: 'line_project_evidences',
      description: '集客线路区县项目附件材料记录',
      fields: {
        recordType: 'string',
        settlementMonth: 'string',
        district: 'string',
        workOrderKey: 'string',
        relatedProject: 'object',
        fileIDs: 'array',
        status: 'string',
        uploader: 'object',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { settlementMonth: 1, district: 1, createTime: -1 } },
        { keys: { settlementMonth: 1, district: 1, workOrderKey: 1, createTime: -1 } },
        { keys: { 'uploader.openid': 1, createTime: -1 } }
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
        importBatchNos: 'array',
        salaryAmount: 'number',
        relatedWorkOrder: 'object',
        content: 'string',
        employeeId: 'string',
        workflowVersion: 'number',
        roundNo: 'number',
        messages: 'array',
        resolution: 'object',
        employeeConfirmed: 'boolean',
        closedBy: 'object',
        closedTime: 'date',
        status: 'string',
        submitter: 'object',
        managerReview: 'object',
        supervisorReview: 'object',
        processLogs: 'array',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { gridAccount: 1 } },
        { keys: { status: 1 } },
        { keys: { 'submitter.openid': 1 } },
        { keys: { 'managerReview.gridAccount': 1 } },
        { keys: { 'supervisorReview.gridAccount': 1 } },
        { keys: { district: 1 } },
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
        importBatchNos: 'array',
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
      description: '销售与集客共用的区县反馈处理人名单',
      fields: {
        district: 'string',
        districtManager: 'object',
        supervisor: 'object',
        districtLeader: 'object',
        status: 'string',
        createTime: 'date',
        updateTime: 'date'
      },
      indexes: [
        { keys: { district: 1 } },
        { keys: { status: 1 } }
      ]
    },
    {
      name: 'line_project_audit_logs',
      description: '集客线路关键操作审计日志',
      fields: {
        action: 'string',
        details: 'object',
        operator: 'object',
        createTime: 'date'
      },
      indexes: [
        { keys: { action: 1, createTime: -1 } },
        { keys: { 'operator.openid': 1, createTime: -1 } }
      ]
    }
  ],

  securityRules: {
    sales_month_records: { read: false, write: false },
    sales_import_batches: { read: false, write: false },
    sales_active_versions: { read: false, write: false },
    sales_employees: { read: false, write: false },
    sales_claim_logs: { read: false, write: false },
    sales_data_receipts: { read: false, write: false },
    users: {
      read: false,
      write: false
    },
    business_records: {
      read: false,
      write: false
    },
    line_project_records: {
      read: false,
      write: false
    },
    line_project_import_batches: {
      read: false,
      write: false
    },
    line_project_active_versions: {
      read: false,
      write: false
    },
    line_project_salary_records: {
      read: false,
      write: false
    },
    line_project_salary_import_batches: {
      read: false,
      write: false
    },
    line_project_evidences: {
      read: false,
      write: false
    },
    salary_feedbacks: {
      read: false,
      write: false
    },
    line_project_month_confirms: {
      read: false,
      write: false
    },
    feedback_routes: {
      read: false,
      write: false
    },
    line_project_audit_logs: {
      read: false,
      write: false
    }
  }
}
