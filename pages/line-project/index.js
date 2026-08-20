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
    pending: '待反馈',
    processing: '待反馈',
    resolved: '已反馈',
    approved: '已反馈',
    rejected: '已反馈'
  }

  return statusMap[status] || '待确认'
}

function getStatusClass(status) {
  const statusClassMap = {
    pending: 'status-pending',
    processing: 'status-processing',
    resolved: 'status-approved',
    approved: 'status-approved',
    rejected: 'status-rejected',
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
    return {
      ...record,
      submitterName: (record.submitter && record.submitter.name) || record.gridAccount || '未知人员',
      submitterAccount: (record.submitter && record.submitter.gridAccount) || record.gridAccount || '',
      amountText: lineProjectConfig.formatMoney(record.salaryAmount),
      createTimeText: formatDateTime(record.createTime),
      statusText: getFeedbackStatusText(record.status),
      statusClass: getStatusClass(record.status),
      isResolved: ['resolved', 'approved', 'rejected'].includes(record.status),
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

  state.detailText = '最近一次问题反馈已处理完成，若无异议可继续签字确认。'
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

function buildDefaultManagementOverview(settlementMonth) {
  return {
    settlementMonth,
    totalAmountText: lineProjectConfig.formatMoney(0),
    totalWorkOrders: 0,
    totalPeople: 0,
    totalRecords: 0,
    totalBusinessQty: 0,
    moduleComposition: buildCompositionDisplay([]),
    districtComposition: []
  }
}

function buildManagementOverview(data = {}, settlementMonth = '', evidenceRecords = []) {
  const stats = data.stats || {}
  const totalAmount = Number(stats.totalAmount || 0)
  const evidenceMap = {}
  ;(evidenceRecords || []).forEach(record => {
    const district = String(record.district || '').trim()
    if (!district) return
    if (!evidenceMap[district]) evidenceMap[district] = { uploadCount: 0, imageCount: 0 }
    evidenceMap[district].uploadCount += 1
    evidenceMap[district].imageCount += Array.isArray(record.fileIDs) ? record.fileIDs.length : 0
  })
  return {
    settlementMonth,
    totalAmountText: lineProjectConfig.formatMoney(totalAmount),
    totalWorkOrders: Number(stats.totalWorkOrders || 0),
    totalPeople: Number(stats.totalPeople || 0),
    totalRecords: Number(stats.totalRecords || 0),
    totalBusinessQty: Number(stats.totalBusinessQty || 0),
    moduleComposition: buildCompositionDisplay(data.moduleComposition || []),
    districtComposition: (data.districtComposition || []).map(item => {
      const evidence = evidenceMap[item.district] || { uploadCount: 0, imageCount: 0 }
      return {
        ...item,
        amountText: lineProjectConfig.formatMoney(item.amount),
        percent: totalAmount > 0 ? Math.max(2, Math.round(Number(item.amount || 0) / totalAmount * 100)) : 0,
        evidenceUploadCount: evidence.uploadCount,
        evidenceImageCount: evidence.imageCount,
        hasEvidence: evidence.uploadCount > 0,
        evidenceText: evidence.uploadCount > 0
          ? `已上传${evidence.uploadCount}次 · 共${evidence.imageCount}张`
          : '本月暂未上传'
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
    canImport: false,
    canManage: false,
    canViewManagedFeedbacks: false,
    canResolveFeedback: false,
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
        canImport: !!access.canImport,
        canManage: !!access.canManage,
        canViewManagedFeedbacks: !!access.canViewManagedFeedbacks,
        canResolveFeedback: (access.lineProjectRoles || []).some(item => ['district_supervisor', 'district_manager'].includes(item)),
        canUploadEvidence: !!access.canUploadEvidence,
        canViewEvidence: !!access.canViewEvidence,
        canViewAllEvidence: !!access.canViewAllEvidence,
        feedbackScopeText: access.canViewAll
          ? '全市所有反馈'
          : `${(access.managedDistricts || []).join('、')}问题反馈`,
        managementScopeTitle: access.canViewAll ? '全市工费总览' : '本区县工费总览',
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
      const canViewAllEvidence = canImport
      this.currentAccess = {
        canImport,
        canManage,
        canViewAll: canImport,
        canViewManagedFeedbacks,
        canViewEvidence: canUploadEvidence || canViewAllEvidence
      }
      this.setData({
        canImport,
        canManage,
        canViewManagedFeedbacks,
        canResolveFeedback,
        canUploadEvidence,
        canViewEvidence: canUploadEvidence || canViewAllEvidence,
        canViewAllEvidence,
        feedbackScopeText: canImport ? '全市所有反馈' : `${user.district || '本区县'}问题反馈`,
        managementScopeTitle: canImport ? '全市工费总览' : '本区县工费总览',
        managementScopeText: canImport ? '数据范围：全部区县' : `数据范围：${user.district || '授权区县'}`
      })
    }
    return user
  },

  updateIdentityDisplay(user = {}, access = null) {
    const roles = access && Array.isArray(access.lineProjectRoles) ? access.lineProjectRoles : []
    const roleText = roles.includes('district_leader')
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

      const data = await lineProjectService.callLineProject('getMyOverview', {
        filters: this.data.filters
      })
      const totalAmount = Number(data.summary && data.summary.totalAmount) || 0
      const composition = (data.summary && data.summary.composition) || []
      const compositionDisplay = buildCompositionDisplay(composition)

      this.setData({
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
          evidenceData.records || []
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
    const fileIDs = [...new Set(records.reduce((list, item) => list.concat(item.resolutionFileIDs || []), []))]
    if (fileIDs.length) {
      const urlResult = await wx.cloud.getTempFileURL({ fileList: fileIDs })
      const urlMap = {}
      ;(urlResult.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
      records.forEach(item => {
        item.resolutionImageUrls = item.resolutionFileIDs.map(fileID => urlMap[fileID]).filter(Boolean)
      })
    }
    this.setData({ managedFeedbacks: records })
  },

  previewManagedFeedbackImage(e) {
    const record = this.data.managedFeedbacks[Number(e.currentTarget.dataset.recordIndex)]
    const urls = record ? record.resolutionImageUrls || [] : []
    wx.previewImage({ current: urls[Number(e.currentTarget.dataset.imageIndex)], urls })
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

  navigateToImport() {
    wx.navigateTo({
      url: `/pages/line-project/import?${lineProjectConfig.buildQueryString({
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
      wx.showToast({ title: '该区县本月暂未上传证明材料', icon: 'none' })
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
