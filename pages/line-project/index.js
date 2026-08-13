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
    pending: '反馈待处理',
    processing: '反馈处理中',
    approved: '反馈已通过',
    rejected: '反馈已驳回',
    not_required: '无需审批'
  }

  return statusMap[status] || '待确认'
}

function getStatusClass(status) {
  const statusClassMap = {
    pending: 'status-pending',
    processing: 'status-processing',
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
    return {
      ...record,
      submitterName: (record.submitter && record.submitter.name) || record.gridAccount || '未知人员',
      submitterAccount: (record.submitter && record.submitter.gridAccount) || record.gridAccount || '',
      amountText: lineProjectConfig.formatMoney(record.salaryAmount),
      createTimeText: formatDateTime(record.createTime),
      statusText: getFeedbackStatusText(record.status),
      statusClass: getStatusClass(record.status),
      managerName: managerReview.name || managerReview.gridAccount || '未配置',
      managerStatusText: getFeedbackStatusText(managerReview.status),
      managerStatusClass: getStatusClass(managerReview.status),
      managerNote: managerReview.reviewNote || '',
      supervisorName: supervisorReview.name || supervisorReview.gridAccount || '未配置',
      supervisorStatusText: getFeedbackStatusText(supervisorReview.status),
      supervisorStatusClass: getStatusClass(supervisorReview.status),
      supervisorNote: supervisorReview.reviewNote || '',
      workOrderText: workOrder.workOrderKey
        ? `${workOrder.subCategory || ''} · ${workOrder.workOrderCode || workOrder.workOrderSubject || workOrder.workOrderNameRaw || '关联工单'}`
        : '整月薪酬'
    }
  })
}

function buildDefaultFeedbackDecision(settlementMonth) {
  return {
    settlementMonth,
    statusText: '待确认',
    statusClass: 'status-pending',
    detailText: '本月酬金核对无误可签字确认，如有疑问请提交问题反馈。',
    subText: '',
    canConfirm: true,
    canFeedback: true,
    confirmBlockedReason: '',
    feedbackBlockedReason: '',
    confirmButtonText: '签字确认',
    feedbackButtonText: '问题反馈'
  }
}

function buildFeedbackDecisionState({ settlementMonth, profileCompleted, hasPublishedData, confirmRecord, feedbackRecord }) {
  const state = buildDefaultFeedbackDecision(settlementMonth)
  state.canConfirm = !!profileCompleted
  state.canFeedback = !!profileCompleted

  if (!profileCompleted) {
    state.statusText = '待完善资料'
    state.detailText = '请先完善个人信息后再签字确认或提交问题反馈。'
    state.canConfirm = false
    state.canFeedback = false
    state.confirmBlockedReason = '请先完善个人信息'
    state.feedbackBlockedReason = '请先完善个人信息'
    return state
  }

  if (!hasPublishedData) {
    state.statusText = '暂无发布数据'
    state.detailText = '当前月份暂无本人集客线路数据，不能签字确认或提交问题反馈。'
    state.canConfirm = false
    state.canFeedback = false
    state.confirmBlockedReason = '当前月份暂无本人数据'
    state.feedbackBlockedReason = '当前月份暂无本人数据'
    return state
  }

  if (confirmRecord) {
    state.statusText = '已签字确认'
    state.statusClass = 'status-approved'
    state.detailText = confirmRecord.confirmTimeText
      ? `已于 ${confirmRecord.confirmTimeText} 完成签字确认。`
      : '本月酬金已完成签字确认。'
    state.subText = `确认金额：￥${lineProjectConfig.formatMoney(confirmRecord.amount)}`
    state.canConfirm = false
    state.canFeedback = false
    state.confirmBlockedReason = '本月已完成签字确认'
    state.feedbackBlockedReason = '本月已完成签字确认'
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
    state.detailText = '问题反馈已提交，等待审批处理后可继续签字确认。'
    state.canConfirm = false
    state.canFeedback = false
    state.confirmBlockedReason = '当前存在待处理反馈'
    state.feedbackBlockedReason = '当前存在待处理反馈'
    return state
  }

  if (feedbackRecord.status === 'processing') {
    state.detailText = '问题反馈正在处理中，暂不能签字确认或重复反馈。'
    state.canConfirm = false
    state.canFeedback = false
    state.confirmBlockedReason = '当前反馈正在处理中'
    state.feedbackBlockedReason = '当前反馈正在处理中'
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
      formulaTitle: `总酬金（${lineProjectConfig.formatMoney(0)}元） =`,
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

function buildManagementOverview(data = {}, settlementMonth = '') {
  const stats = data.stats || {}
  const totalAmount = Number(stats.totalAmount || 0)
  return {
    settlementMonth,
    totalAmountText: lineProjectConfig.formatMoney(totalAmount),
    totalWorkOrders: Number(stats.totalWorkOrders || 0),
    totalPeople: Number(stats.totalPeople || 0),
    totalRecords: Number(stats.totalRecords || 0),
    totalBusinessQty: Number(stats.totalBusinessQty || 0),
    moduleComposition: buildCompositionDisplay(data.moduleComposition || []),
    districtComposition: (data.districtComposition || []).map(item => ({
      ...item,
      amountText: lineProjectConfig.formatMoney(item.amount),
      percent: totalAmount > 0 ? Math.max(2, Math.round(Number(item.amount || 0) / totalAmount * 100)) : 0
    }))
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
    managementScopeTitle: '管理范围酬金总览',
    managementScopeText: '',
    managedDistrictsText: '',
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      subCategory: ''
    },
    managementOverview: buildDefaultManagementOverview(lineProjectConfig.getDefaultSettlementMonth()),
    adminFeedbacks: [],
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
      adminFeedbacks: [],
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
        managementScopeTitle: access.canViewAll ? '全市酬金总览' : '本区县酬金总览',
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
      this.currentAccess = { canImport, canManage, canViewAll: canImport }
      this.setData({
        canImport,
        canManage,
        managementScopeTitle: canImport ? '全市酬金总览' : '本区县酬金总览',
        managementScopeText: canImport ? '数据范围：全部区县' : `数据范围：${user.district || '授权区县'}`
      })
    }
    return user
  },

  updateIdentityDisplay(user = {}, access = null) {
    const roleText = access && Array.isArray(access.lineProjectRoles) && access.lineProjectRoles.includes('district_supervisor')
      ? '集客线路基层监督员'
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
      if (this.currentAccess && this.currentAccess.canImport) {
        await Promise.all([
          this.loadManagementOverview(),
          this.loadAdminFeedbacks()
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
            formulaTitle: `总酬金（${lineProjectConfig.formatMoney(totalAmount)}元） =`,
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
      const data = await lineProjectService.callLineProject('dashboard', {
        filters: this.data.filters
      })
      this.setData({
        managementOverview: buildManagementOverview(data, this.data.filters.settlementMonth)
      })
    } catch (error) {
      console.error('加载管理范围酬金总览失败:', error)
      wx.showToast({ title: error.message || '管理总览加载失败', icon: 'none' })
    }
  },

  async loadAdminFeedbacks() {
    const result = await wx.cloud.callFunction({
      name: 'salaryFeedback',
      data: {
        action: 'listAdmin',
        data: {
          salaryMonth: this.data.filters.settlementMonth
        }
      }
    })
    if (!result.result || !result.result.success) {
      throw new Error((result.result && result.result.error) || '问题反馈加载失败')
    }
    this.setData({
      adminFeedbacks: buildAdminFeedbackList((result.result.data && result.result.data.records) || [])
    })
  },

  async loadFeedbackDecision() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }
    if (this.currentAccess && this.currentAccess.canImport) {
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
      adminFeedbacks: [],
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
      content: `确认 ${this.data.filters.settlementMonth} 本人总酬金无误并完成签字确认吗？`,
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
    if (!this.data.feedbackDecision.canFeedback) {
      this.showDecisionBlocked(this.data.feedbackDecision.feedbackBlockedReason)
      return
    }

    wx.navigateTo({
      url: `/pages/feedback/feedback?${lineProjectConfig.buildQueryString({
        workspaceType: FEEDBACK_CONTEXT.workspaceType,
        scene: FEEDBACK_CONTEXT.scene,
        salaryMonth: this.data.filters.settlementMonth,
        salaryAmount: this.data.overview.summary.totalAmount
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
