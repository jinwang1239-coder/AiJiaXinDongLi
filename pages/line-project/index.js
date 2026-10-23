const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

const FEEDBACK_CONTEXT = {
  workspaceType: workspace.WORKSPACE_TYPES.LINE_PROJECT,
  scene: 'line_project_workorders'
}
function isProfileCompleted(user) {
  return !!user && !!(
    String(user.realName || '').trim() &&
    String(user.gridAccount || '').trim() &&
    String(user.district || '').trim() &&
    String(user.gridName || '').trim()
  )
}

function getFeedbackStatusText(status) {
  const statusMap = {
    pending: '待处理人答复',
    processing: '待处理人答复',
    awaiting_submitter: '待您确认',
    closed: '已解决',
    resolved: '待您确认',
    approved: '待您确认',
    rejected: '待您确认'
  }

  return statusMap[status] || '待确认'
}

function getStatusClass(status) {
  const statusClassMap = {
    pending: 'status-pending',
    processing: 'status-processing',
    awaiting_submitter: 'status-processing',
    closed: 'status-approved',
    resolved: 'status-processing',
    approved: 'status-processing',
    rejected: 'status-processing',
    not_required: 'status-pending'
  }

  return statusClassMap[status] || 'status-pending'
}

function formatDateTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || 0)
  if (Number.isNaN(date.getTime())) return ''
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ]
  return `${parts.join('-')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function buildAdminFeedbackList(records = []) {
  return records.map(record => {
    const managerReview = record.managerReview || {}
    const supervisorReview = record.supervisorReview || {}
    const workOrder = record.relatedWorkOrder || {}
    const legacyResolution = [
      { value: managerReview, roleText: '区县经理' },
      { value: supervisorReview, roleText: '基层监督员' }
    ].find(item => ['resolved', 'approved', 'rejected'].includes(item.value.status))
    const resolution = record.resolution || (legacyResolution ? {
      handlerRoleText: legacyResolution.roleText,
      handler: legacyResolution.value,
      content: legacyResolution.value.reviewNote || '',
      attachments: [],
      resolveTime: legacyResolution.value.reviewTime
    } : null)
    const pendingHandlers = [
      { value: managerReview, roleText: '区县经理' },
      { value: supervisorReview, roleText: '基层监督员' }
    ].filter(item => item.value.status === 'pending')
      .map(item => `${item.value.name || item.value.gridAccount || item.roleText}（${item.roleText}）`)
    const messages = (Array.isArray(record.messages) ? record.messages : []).map((message, index) => {
      const sender = message.sender || {}
      const senderName = sender.name || sender.realName || sender.gridAccount || '处理人'
      let title = `${senderName}（一线员工）提交问题`
      if (message.type === 'submitter_follow_up') title = `${senderName}（一线员工）继续反馈`
      if (message.type === 'handler_reply') title = `${senderName}（${message.senderRoleText || '问题处理人'}）答复`
      if (message.type === 'submitter_confirmed') title = `${senderName}（一线员工）确认已解决`
      const attachments = Array.isArray(message.attachments) ? message.attachments : []
      return {
        ...message,
        messageKey: `${message.roundNo || 1}_${message.type || 'message'}_${index}`,
        title,
        timeText: formatDateTime(message.createTime),
        fileIDs: attachments.map(item => typeof item === 'string' ? item : item.fileID).filter(Boolean),
        imageUrls: []
      }
    })
    return {
      ...record,
      submitterName: (record.submitter && record.submitter.name) || record.gridAccount || '未知人员',
      submitterAccount: (record.submitter && record.submitter.gridAccount) || record.gridAccount || '',
      amountText: lineProjectConfig.formatMoney(record.salaryAmount),
      createTimeText: formatDateTime(record.createTime),
      statusText: ['awaiting_submitter', 'resolved', 'approved', 'rejected'].includes(record.status)
        ? '待员工确认'
        : getFeedbackStatusText(record.status),
      statusClass: getStatusClass(record.status),
      hasReply: !!resolution,
      messages,
      waitingText: pendingHandlers.length ? `待${pendingHandlers.join('或')}反馈中` : '等待问题处理人反馈',
      resolutionHandlerText: resolution
        ? `${(resolution.handler && (resolution.handler.name || resolution.handler.realName || resolution.handler.gridAccount)) || '处理人'}（${resolution.handlerRoleText || '问题处理人'}）`
        : '',
      resolutionContent: resolution ? resolution.content || '' : '',
      resolutionTimeText: resolution ? formatDateTime(resolution.resolveTime) : '',
      resolutionFileIDs: resolution && Array.isArray(resolution.attachments)
        ? resolution.attachments.map(item => typeof item === 'string' ? item : item.fileID).filter(Boolean)
        : [],
      resolutionImageUrls: [],
      workOrderText: workOrder.workOrderKey
        ? `${workOrder.subCategory || ''} · ${workOrder.workOrderCode || workOrder.workOrderSubject || workOrder.workOrderNameRaw || '关联工单'}`
        : '整月工费'
    }
  })
}

function buildDefaultFeedbackDecision(settlementMonth) {
  return {
    settlementMonth,
    statusText: '待确认',
    statusClass: 'status-pending',
    detailText: '本月工费核对无误可签字确认，如有疑问请提交问题反馈。',
    subText: '',
    canConfirm: true,
    confirmBlockedReason: '',
    confirmButtonText: '签字确认',
    feedbackButtonText: '问题反馈'
  }
}

function buildFeedbackDecisionState({ settlementMonth, profileCompleted, hasPublishedData, confirmRecord, feedbackRecord }) {
  const state = buildDefaultFeedbackDecision(settlementMonth)
  state.canConfirm = !!profileCompleted

  if (!profileCompleted) {
    state.statusText = '待完善资料'
    state.detailText = '请先完善个人信息后再签字确认或提交问题反馈。'
    state.canConfirm = false
    state.confirmBlockedReason = '请先完善个人信息'
    return state
  }

  if (!hasPublishedData) {
    state.statusText = '暂无发布数据'
    state.detailText = '当前月份暂无本人集客线路数据，不能签字确认或提交问题反馈。'
    state.canConfirm = false
    state.confirmBlockedReason = '当前月份暂无本人数据'
    return state
  }

  if (confirmRecord) {
    state.statusText = '已签字确认'
    state.statusClass = 'status-approved'
    state.detailText = confirmRecord.confirmTimeText
      ? `已于 ${confirmRecord.confirmTimeText} 完成签字确认。`
      : '本月工费已完成签字确认。'
    state.subText = `确认金额：￥${lineProjectConfig.formatMoney(confirmRecord.amount)}`
    state.canConfirm = false
    state.confirmBlockedReason = '本月已完成签字确认'
    state.confirmButtonText = '已签字确认'
    return state
  }

  if (!feedbackRecord) {
    return state
  }

  state.statusText = getFeedbackStatusText(feedbackRecord.status)
  state.statusClass = getStatusClass(feedbackRecord.status)
  state.subText = feedbackRecord.createTimeText ? `提交时间：${feedbackRecord.createTimeText}` : ''

  if (feedbackRecord.status === 'pending') {
    state.detailText = '问题反馈已提交，等待基层监督员或区县经理答复后可继续签字确认。'
    state.canConfirm = false
    state.confirmBlockedReason = '当前存在待处理反馈'
    return state
  }

  if (feedbackRecord.status === 'processing') {
    state.detailText = '问题反馈正在处理中，暂不能签字确认或重复反馈。'
    state.canConfirm = false
    state.confirmBlockedReason = '当前反馈正在处理中'
    return state
  }

  if (['awaiting_submitter', 'resolved', 'approved', 'rejected'].includes(feedbackRecord.status)) {
    state.detailText = '问题处理人员已答复，请进入问题反馈确认是否解决；如仍有疑问可继续反馈。'
    state.canConfirm = false
    state.confirmBlockedReason = '问题工单等待本人确认'
    return state
  }

  state.detailText = '问题工单已确认解决，如工费无异议可继续签字确认。'
  return state
}

function buildCompositionDisplay(composition = []) {
  const amountMap = {}
  ;(composition || []).forEach(item => {
    if (!item || !item.subCategory) {
      return
    }
    amountMap[item.subCategory] = Number(item.amount || 0)
  })

  return lineProjectConfig.COMMISSION_SUBCATEGORY_OPTIONS.map(subCategory => ({
    subCategory,
    amount: Number(amountMap[subCategory] || 0),
    amountText: lineProjectConfig.formatMoney(amountMap[subCategory] || 0)
  }))
}

function buildDefaultOverview(settlementMonth) {
  const compositionDisplay = buildCompositionDisplay([])
  return {
    summary: {
      settlementMonth,
      totalAmount: 0,
      totalAmountText: lineProjectConfig.formatMoney(0),
      totalWorkOrders: 0,
      totalRecords: 0,
      compositionText: lineProjectConfig.buildCommissionCompositionText(0, []),
      composition: [],
      formulaTitle: `总工费（${lineProjectConfig.formatMoney(0)}元） =`,
      compositionDisplay
    }
  }
}

function buildSalaryOverview(record, settlementMonth, detailAmount = 0) {
  const hasRecord = !!record
  const fixedPay = Number(record && record.fixedPay) || 0
  const quantitativePay = hasRecord ? Number(record.quantitativePay || 0) : Number(detailAmount || 0)
  const enterpriseWithholding = Number(record && record.enterpriseWithholding) || 0
  const personalWithholding = Number(record && record.personalWithholding) || 0
  const netPay = Number(record && record.netPay) || 0
  return {
    settlementMonth,
    hasRecord,
    fixedPayText: lineProjectConfig.formatMoney(fixedPay),
    quantitativePayText: lineProjectConfig.formatMoney(quantitativePay),
    enterpriseWithholdingText: lineProjectConfig.formatMoney(enterpriseWithholding),
    personalWithholdingText: lineProjectConfig.formatMoney(personalWithholding),
    netPayText: lineProjectConfig.formatMoney(netPay),
    detailAmountText: lineProjectConfig.formatMoney(detailAmount),
    updateTimeText: record ? record.updateTimeText || '' : ''
  }
}

function buildDefaultManagementOverview(settlementMonth) {
  return {
    settlementMonth,
    salarySummary: {
      hasSalaryData: false,
      hasDetailData: false,
      totalPeople: 0,
      fixedPayTotalText: lineProjectConfig.formatMoney(0),
      quantitativePayTotalText: lineProjectConfig.formatMoney(0),
      enterpriseWithholdingTotalText: lineProjectConfig.formatMoney(0),
      personalWithholdingTotalText: lineProjectConfig.formatMoney(0),
      netPayTotalText: lineProjectConfig.formatMoney(0),
      detailAmountText: lineProjectConfig.formatMoney(0),
      differenceText: lineProjectConfig.formatMoney(0),
      reconciliationText: '本月整体工资尚未导入',
      reconciliationClass: 'salary-reconcile-missing'
    },
    totalAmountText: lineProjectConfig.formatMoney(0),
    totalWorkOrders: 0,
    totalPeople: 0,
    totalRecords: 0,
    totalBusinessQty: 0,
    moduleComposition: buildCompositionDisplay([]),
    districtComposition: []
  }
}

function buildManagementOverview(data = {}, settlementMonth = '', evidenceData = {}) {
  const stats = data.stats || {}
  const salary = data.salarySummary || {}
  const totalAmount = Number(stats.totalAmount || 0)
  const evidenceRecords = evidenceData.records || []
  const statusMap = {}
  ;(evidenceData.districtStatuses || []).forEach(item => {
    if (item.district) statusMap[item.district] = item
  })
  const evidenceMap = {}
  ;(evidenceRecords || []).forEach(record => {
    const district = String(record.district || '').trim()
    if (!district) return
    if (!evidenceMap[district]) evidenceMap[district] = { uploadCount: 0, imageCount: 0, projectKeys: new Set() }
    evidenceMap[district].uploadCount += 1
    evidenceMap[district].imageCount += Array.isArray(record.fileIDs) ? record.fileIDs.length : 0
    const projectKey = record.workOrderKey || (record.relatedProject && record.relatedProject.workOrderKey)
    if (projectKey) evidenceMap[district].projectKeys.add(projectKey)
  })
  return {
    settlementMonth,
    salarySummary: {
      hasSalaryData: !!salary.hasSalaryData,
      hasDetailData: !!salary.hasDetailData,
      totalPeople: Number(salary.totalPeople || 0),
      fixedPayTotalText: lineProjectConfig.formatMoney(salary.fixedPayTotal),
      quantitativePayTotalText: lineProjectConfig.formatMoney(salary.quantitativePayTotal),
      enterpriseWithholdingTotalText: lineProjectConfig.formatMoney(salary.enterpriseWithholdingTotal),
      personalWithholdingTotalText: lineProjectConfig.formatMoney(salary.personalWithholdingTotal),
      netPayTotalText: lineProjectConfig.formatMoney(salary.netPayTotal),
      detailAmountText: lineProjectConfig.formatMoney(salary.detailAmount),
      differenceText: lineProjectConfig.formatMoney(salary.quantitativeDifference),
      reconciliationText: salary.reconciliationStatus === 'matched'
        ? '金额一致'
        : salary.reconciliationStatus === 'mismatch'
          ? '存在差额'
          : salary.reconciliationStatus === 'detail_missing'
            ? '业务量明细尚未导入'
            : '本月整体工资尚未导入',
      reconciliationClass: salary.reconciliationStatus === 'matched'
        ? 'salary-reconcile-matched'
        : salary.reconciliationStatus === 'mismatch'
          ? 'salary-reconcile-mismatch'
          : 'salary-reconcile-missing'
    },
    totalAmountText: lineProjectConfig.formatMoney(totalAmount),
    totalWorkOrders: Number(stats.totalWorkOrders || 0),
    totalPeople: Number(stats.totalPeople || 0),
    totalRecords: Number(stats.totalRecords || 0),
    totalBusinessQty: Number(stats.totalBusinessQty || 0),
    moduleComposition: buildCompositionDisplay(data.moduleComposition || []),
    districtComposition: (data.districtComposition || []).map(item => {
      const evidence = evidenceMap[item.district] || { uploadCount: 0, imageCount: 0, projectKeys: new Set() }
      const evidenceStatus = (statusMap[item.district] && statusMap[item.district].status) || 'unconfirmed'
      const projectCount = evidence.projectKeys.size
      return {
        ...item,
        amountText: lineProjectConfig.formatMoney(item.amount),
        percent: totalAmount > 0 ? Math.max(2, Math.round(Number(item.amount || 0) / totalAmount * 100)) : 0,
        evidenceUploadCount: evidence.uploadCount,
        evidenceImageCount: evidence.imageCount,
        evidenceProjectCount: projectCount,
        evidenceStatus,
        hasEvidence: evidence.uploadCount > 0,
        evidenceText: evidence.uploadCount > 0
          ? projectCount > 0
            ? `已关联${projectCount}个项目 · ${evidence.uploadCount}组材料 · ${evidence.imageCount}张图片`
            : `历史未关联材料${evidence.uploadCount}组 · ${evidence.imageCount}张图片`
          : evidenceStatus === 'no_special_scenario'
            ? '已确认本月无特殊场景'
            : '本月特殊场景状态未确认'
      }
    })
  }
}

Page({
  data: {
    loading: false,
    confirming: false,
    roleText: '集客线路用户',
    profileDisplayName: '正在读取个人信息',
    profileSubtitle: '区县 / 所属网格 / 网格通账号',
    profileCompleted: false,
    isSystemAdmin: false,
    canImport: false,
    canManage: false,
    canViewSalarySummary: false,
    canViewManagedFeedbacks: false,
    canResolveFeedback: false,
    canHandleSalesFeedback: false,
    canUploadEvidence: false,
    canViewEvidence: false,
    canViewAllEvidence: false,
    feedbackScopeText: '',
    managementScopeTitle: '管理范围工费总览',
    managementScopeText: '',
    managedDistrictsText: '',
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      subCategory: ''
    },
    managementOverview: buildDefaultManagementOverview(lineProjectConfig.getDefaultSettlementMonth()),
    managedFeedbacks: [],
    overview: buildDefaultOverview(lineProjectConfig.getDefaultSettlementMonth()),
    salaryOverview: buildSalaryOverview(null, lineProjectConfig.getDefaultSettlementMonth()),
    feedbackDecision: buildDefaultFeedbackDecision(lineProjectConfig.getDefaultSettlementMonth())
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.filters.settlementMonth
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      filters: {
        settlementMonth,
        subCategory: ''
      },
      managementOverview: buildDefaultManagementOverview(settlementMonth),
      managedFeedbacks: [],
      overview: buildDefaultOverview(settlementMonth),
      salaryOverview: buildSalaryOverview(null, settlementMonth),
      feedbackDecision: buildDefaultFeedbackDecision(settlementMonth)
    })
  },

  onShow() {
    this.loadOverview()
    this.loadFeedbackDecision()
  },

  async ensureLogin() {
    if (this.identityRequest) {
      return this.identityRequest
    }

    this.identityRequest = this.loadCurrentIdentity()
    try {
      return await this.identityRequest
    } finally {
      this.identityRequest = null
    }
  },

  async loadCurrentIdentity() {
    const cachedUser = await auth.ensureLoggedIn()
    if (!cachedUser) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return null
    }

    this.updateIdentityDisplay(cachedUser)
    let user = cachedUser
    try {
      user = await auth.getCurrentUserInfo()
      this.updateIdentityDisplay(user)
    } catch (error) {
      console.error('刷新集客线路用户资料失败，使用本地资料:', error)
    }

    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }

    try {
      const access = await lineProjectService.callLineProject('getAccessProfile')
      this.currentAccess = access
      this.updateIdentityDisplay(user, access)
      this.setData({
        isSystemAdmin: !!access.isSystemAdmin,
        canImport: !!access.canImport,
        canManage: !!access.canManage,
        canViewSalarySummary: !!access.canViewSalarySummary,
        canViewManagedFeedbacks: !!access.canViewManagedFeedbacks,
        canResolveFeedback: (access.lineProjectRoles || []).some(item => ['district_supervisor', 'district_manager'].includes(item)),
        canUploadEvidence: !!access.canUploadEvidence,
        canViewEvidence: !!access.canViewEvidence,
        canViewAllEvidence: !!access.canViewAllEvidence,
        feedbackScopeText: access.canViewAll
          ? '全市所有反馈'
          : `${(access.managedDistricts || []).join('、')}问题反馈`,
        managementScopeTitle: access.isSystemAdmin
          ? '全市薪酬总览'
          : access.canViewSalarySummary ? '本区县薪酬总览' : access.canViewAll ? '全市工费总览' : '本区县工费总览',
        managementScopeText: access.canViewAll
          ? '数据范围：全部区县'
          : `数据范围：${(access.managedDistricts || []).join('、')}`,
        managedDistrictsText: (access.managedDistricts || []).join('、')
      })
    } catch (error) {
      console.error('加载集客线路权限失败，不影响个人信息展示:', error)
      const role = user.role || ''
      const canImport = ['sales_department', workspace.SYSTEM_ADMIN_ROLE].includes(role)
      const canManage = ['district_manager', 'sales_department', workspace.SYSTEM_ADMIN_ROLE].includes(role)
      const lineProjectRoles = Array.isArray(user.lineProjectRoles) ? user.lineProjectRoles : []
      const canViewManagedFeedbacks = canManage || lineProjectRoles.some(item => ['district_supervisor', 'district_leader'].includes(item))
      const canResolveFeedback = role === 'district_manager' || lineProjectRoles.some(item => ['district_supervisor', 'district_manager'].includes(item))
      const canUploadEvidence = role === 'district_manager' || lineProjectRoles.includes('district_leader')
      const canViewSalarySummary = role === workspace.SYSTEM_ADMIN_ROLE || role === 'district_manager' || lineProjectRoles.some(item => ['district_leader', 'district_manager'].includes(item))
      const canViewAllEvidence = canImport
      this.currentAccess = {
        isSystemAdmin: role === workspace.SYSTEM_ADMIN_ROLE,
        canImport,
        canManage,
        canViewSalarySummary,
        canViewAll: canImport,
        canViewManagedFeedbacks,
        canViewEvidence: canUploadEvidence || canViewAllEvidence
      }
      this.setData({
        isSystemAdmin: role === workspace.SYSTEM_ADMIN_ROLE,
        canImport,
        canManage,
        canViewSalarySummary,
        canViewManagedFeedbacks,
        canResolveFeedback,
        canUploadEvidence,
        canViewEvidence: canUploadEvidence || canViewAllEvidence,
        canViewAllEvidence,
        feedbackScopeText: canImport ? '全市所有反馈' : `${user.district || '本区县'}问题反馈`,
        managementScopeTitle: role === workspace.SYSTEM_ADMIN_ROLE
          ? '全市薪酬总览'
          : canViewSalarySummary ? '本区县薪酬总览' : canImport ? '全市工费总览' : '本区县工费总览',
        managementScopeText: canImport ? '数据范围：全部区县' : `数据范围：${user.district || '授权区县'}`
      })
    }
    await this.loadSalesFeedbackAccess(user)
    return user
  },

  async loadSalesFeedbackAccess(user) {
    this.setData({ canHandleSalesFeedback: false })
    if (!['district_manager', 'sales_department', 'system_admin'].includes(user.role) &&
      !(user.lineProjectRoles || []).some(role => ['district_manager', 'district_supervisor'].includes(role))) return
    try {
      const result = await wx.cloud.callFunction({
        name: 'salaryFeedback', data: { action: 'listPending', data: { workspaceType: 'sales' } }
      })
      this.setData({ canHandleSalesFeedback: !!(result.result && result.result.success && result.result.data.canResolve) })
    } catch (error) {
      console.error('读取销售反馈处理权限失败:', error)
    }
  },

  updateIdentityDisplay(user = {}, access = null) {
    const roles = access && Array.isArray(access.lineProjectRoles) ? access.lineProjectRoles : []
    const roleText = access && access.isSystemAdmin
      ? '系统管理员'
      : roles.includes('district_leader')
      ? '集客线路区县主管'
      : roles.includes('district_supervisor')
        ? '集客线路基层监督员'
        : roles.includes('district_manager')
          ? '集客线路区县经理'
          : workspace.getRoleText(user)
    const identityParts = [
      user.district || '区县未完善',
      user.gridName || '所属网格未完善',
      user.gridAccount || '网格通账号未完善'
    ]

    this.setData({
      roleText,
      profileDisplayName: user.realName || user.nickName || '姓名未完善',
      profileSubtitle: identityParts.join(' / '),
      profileCompleted: isProfileCompleted(user)
    })
  },

  async loadOverview() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    try {
      this.setData({ loading: true })
      if (this.currentAccess && this.currentAccess.canViewManagedFeedbacks) {
        await Promise.all([
          this.loadManagementOverview(),
          this.loadManagedFeedbacks()
        ])
        return
      }

      const [data, salaryData] = await Promise.all([
        lineProjectService.callLineProject('getMyOverview', {
          filters: this.data.filters
        }),
        lineProjectService.callLineProject('getMySalary', {
          settlementMonth: this.data.filters.settlementMonth
        })
      ])
      const totalAmount = Number(data.summary && data.summary.totalAmount) || 0
      const composition = (data.summary && data.summary.composition) || []
      const compositionDisplay = buildCompositionDisplay(composition)

      this.setData({
        salaryOverview: buildSalaryOverview(
          salaryData.record,
          this.data.filters.settlementMonth,
          totalAmount
        ),
        overview: {
          summary: {
            settlementMonth: data.summary ? data.summary.settlementMonth : this.data.filters.settlementMonth,
            totalAmount,
            totalAmountText: lineProjectConfig.formatMoney(totalAmount),
            totalWorkOrders: Number(data.summary && data.summary.totalWorkOrders) || 0,
            totalRecords: Number(data.summary && data.summary.totalRecords) || 0,
            compositionText: lineProjectConfig.buildCommissionCompositionText(totalAmount, composition),
            composition,
            formulaTitle: `总工费（${lineProjectConfig.formatMoney(totalAmount)}元） =`,
            compositionDisplay
          }
        }
      })
      await this.loadManagementOverview()
    } catch (error) {
      console.error('加载集客线路概览失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadManagementOverview() {
    if (!this.currentAccess || !this.currentAccess.canManage) {
      return
    }
    try {
      const [data, evidenceData] = await Promise.all([
        lineProjectService.callLineProject('dashboard', { filters: this.data.filters }),
        this.currentAccess.canViewEvidence
          ? lineProjectService.callLineProject('listEvidence', {
            filters: { settlementMonth: this.data.filters.settlementMonth }
          }).catch(error => {
            console.error('加载区县附件状态失败:', error)
            return { records: [] }
          })
          : Promise.resolve({ records: [] })
      ])
      this.setData({
        managementOverview: buildManagementOverview(
          data,
          this.data.filters.settlementMonth,
          evidenceData
        )
      })
    } catch (error) {
      console.error('加载管理范围工费总览失败:', error)
      wx.showToast({ title: error.message || '管理总览加载失败', icon: 'none' })
    }
  },

  async loadManagedFeedbacks() {
    const result = await wx.cloud.callFunction({
      name: 'salaryFeedback',
      data: {
        action: 'listManaged',
        data: {
          salaryMonth: this.data.filters.settlementMonth
        }
      }
    })
    if (!result.result || !result.result.success) {
      throw new Error((result.result && result.result.error) || '问题反馈加载失败')
    }
    const records = buildAdminFeedbackList((result.result.data && result.result.data.records) || [])
    const fileIDs = [...new Set(records.flatMap(item => [
      ...(item.resolutionFileIDs || []),
      ...(item.messages || []).flatMap(message => message.fileIDs || [])
    ]))]
    if (fileIDs.length) {
      const urlResult = await wx.cloud.getTempFileURL({ fileList: fileIDs })
      const urlMap = {}
      ;(urlResult.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
      records.forEach(item => {
        item.resolutionImageUrls = item.resolutionFileIDs.map(fileID => urlMap[fileID]).filter(Boolean)
        item.messages = item.messages.map(message => ({
          ...message,
          imageUrls: message.fileIDs.map(fileID => urlMap[fileID]).filter(Boolean)
        }))
      })
    }
    this.setData({ managedFeedbacks: records })
  },

  previewManagedFeedbackImage(e) {
    const record = this.data.managedFeedbacks[Number(e.currentTarget.dataset.recordIndex)]
    const message = record && record.messages[Number(e.currentTarget.dataset.messageIndex)]
    const urls = message ? message.imageUrls || [] : []
    if (urls.length) wx.previewImage({ current: urls[Number(e.currentTarget.dataset.imageIndex)], urls })
  },

  async loadFeedbackDecision() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }
    if (this.currentAccess && this.currentAccess.canViewManagedFeedbacks) {
      return
    }

    try {
      const settlementMonth = this.data.filters.settlementMonth
      const [confirmData, feedbackResult] = await Promise.all([
        lineProjectService.callLineProject('getMonthConfirmStatus', {
          settlementMonth
        }),
        wx.cloud.callFunction({
          name: 'salaryFeedback',
          data: {
            action: 'getSceneSummary',
            data: {
              ...FEEDBACK_CONTEXT,
              salaryMonth: settlementMonth
            }
          }
        })
      ])

      if (!feedbackResult.result || !feedbackResult.result.success) {
        throw new Error((feedbackResult.result && feedbackResult.result.error) || '反馈状态加载失败')
      }

      this.setData({
        feedbackDecision: buildFeedbackDecisionState({
          settlementMonth,
          profileCompleted: !!confirmData.profileCompleted,
          hasPublishedData: !!confirmData.hasPublishedData,
          confirmRecord: confirmData.record || null,
          feedbackRecord: (feedbackResult.result.data && feedbackResult.result.data.record) || null
        })
      })
    } catch (error) {
      console.error('加载确认反馈状态失败:', error)
      this.setData({
        feedbackDecision: buildFeedbackDecisionState({
          settlementMonth: this.data.filters.settlementMonth,
          profileCompleted: this.data.profileCompleted,
          hasPublishedData: false,
          confirmRecord: null,
          feedbackRecord: null
        })
      })
      wx.showToast({
        title: error.message || '状态加载失败',
        icon: 'none'
      })
    }
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      monthPickerValue: e.detail.value,
      'filters.settlementMonth': settlementMonth,
      managementOverview: buildDefaultManagementOverview(settlementMonth),
      managedFeedbacks: [],
      overview: buildDefaultOverview(settlementMonth),
      salaryOverview: buildSalaryOverview(null, settlementMonth),
      feedbackDecision: buildDefaultFeedbackDecision(settlementMonth)
    }, () => {
      this.refreshOverview()
    })
  },

  refreshOverview() {
    this.loadOverview()
    this.loadFeedbackDecision()
  },

  onCompositionTap(e) {
    const { subCategory = '' } = e.currentTarget.dataset || {}
    this.navigateToWorkOrders(subCategory)
  },

  navigateToQuantitativeDetail() {
    this.navigateToWorkOrders('')
  },

  navigateToWorkOrders(subCategory = '') {
    wx.navigateTo({
      url: `/pages/line-project/workorders?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth,
        subCategory
      })}`
    })
  },

  showDecisionBlocked(reason) {
    wx.showToast({
      title: reason || '当前不可操作',
      icon: 'none'
    })
  },

  async confirmMonth() {
    if (!this.data.feedbackDecision.canConfirm) {
      this.showDecisionBlocked(this.data.feedbackDecision.confirmBlockedReason)
      return
    }

    wx.showModal({
      title: '签字确认',
      content: `确认 ${this.data.filters.settlementMonth} 本人总工费无误并完成签字确认吗？`,
      success: async res => {
        if (!res.confirm) {
          return
        }

        try {
          this.setData({ confirming: true })
          await lineProjectService.callLineProject('confirmMonth', {
            settlementMonth: this.data.filters.settlementMonth
          })
          wx.showToast({
            title: '签字确认成功',
            icon: 'success'
          })
          await this.loadFeedbackDecision()
        } catch (error) {
          console.error('签字确认失败:', error)
          wx.showToast({
            title: error.message || '签字确认失败',
            icon: 'none'
          })
        } finally {
          this.setData({ confirming: false })
        }
      }
    })
  },

  navigateToFeedback() {
    wx.navigateTo({
      url: `/pages/feedback/feedback?${lineProjectConfig.buildQueryString({
        workspaceType: FEEDBACK_CONTEXT.workspaceType,
        scene: FEEDBACK_CONTEXT.scene,
        salaryMonth: this.data.filters.settlementMonth,
        salaryAmount: this.data.overview.summary.totalAmount,
        mode: 'submit'
      })}`
    })
  },

  navigateToFeedbackHandling() {
    wx.navigateTo({
      url: `/pages/feedback/feedback?${lineProjectConfig.buildQueryString({
        workspaceType: FEEDBACK_CONTEXT.workspaceType,
        scene: FEEDBACK_CONTEXT.scene,
        salaryMonth: this.data.filters.settlementMonth,
        mode: 'handle'
      })}`
    })
  },

  navigateToSalesFeedbackHandling() {
    wx.navigateTo({ url: '/pages/feedback/feedback?workspaceType=sales&mode=handle' })
  },

  navigateToImport() {
    wx.navigateTo({
      url: `/pages/line-project/import?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  navigateToSalaryImport() {
    wx.navigateTo({
      url: `/pages/line-project/salary-import?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  navigateToManagement() {
    wx.navigateTo({
      url: `/pages/line-project/persons?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  navigateToEvidence() {
    wx.navigateTo({
      url: `/pages/line-project/evidence?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  openDistrictEvidence(e) {
    const district = String(e.currentTarget.dataset.district || '').trim()
    const record = this.data.managementOverview.districtComposition.find(item => item.district === district)
    if (!record || !record.hasEvidence) {
      wx.showToast({
        title: record && record.evidenceStatus === 'no_special_scenario'
          ? '该区县已确认本月无特殊场景'
          : '该区县本月特殊场景状态未确认',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: `/pages/line-project/evidence?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth,
        district,
        mode: 'view'
      })}`
    })
  },

  openProfile() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        auth.logout()
        workspace.relaunchWorkspaceHome(workspace.WORKSPACE_TYPES.SALES).catch(error => {
          console.error('退出登录后跳转失败:', error)
        })
      }
    })
  }
})
