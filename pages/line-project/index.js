const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

const FEEDBACK_CONTEXT = {
  workspaceType: workspace.WORKSPACE_TYPES.LINE_PROJECT,
  scene: 'line_project_workorders'
}
const MANAGER_ROLES = ['district_manager', 'sales_department', 'system_admin']

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
    rejected: '反馈已驳回'
  }

  return statusMap[status] || '待确认'
}

function getStatusClass(status) {
  const statusClassMap = {
    pending: 'status-pending',
    processing: 'status-processing',
    approved: 'status-approved',
    rejected: 'status-rejected'
  }

  return statusClassMap[status] || 'status-pending'
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

function buildFeedbackDecisionState({ settlementMonth, profileCompleted, confirmRecord, feedbackRecord }) {
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

Page({
  data: {
    loading: false,
    confirming: false,
    roleText: '',
    profileDisplayName: '',
    profileSubtitle: '',
    profileCompleted: false,
    canImport: false,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      majorCategory: lineProjectConfig.CURRENT_MAJOR_CATEGORY,
      subCategory: lineProjectConfig.CURRENT_SUBCATEGORY
    },
    overview: buildDefaultOverview(lineProjectConfig.getDefaultSettlementMonth()),
    feedbackDecision: buildDefaultFeedbackDecision(lineProjectConfig.getDefaultSettlementMonth())
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.filters.settlementMonth
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      filters: {
        settlementMonth,
        majorCategory: lineProjectConfig.CURRENT_MAJOR_CATEGORY,
        subCategory: lineProjectConfig.CURRENT_SUBCATEGORY
      },
      overview: buildDefaultOverview(settlementMonth),
      feedbackDecision: buildDefaultFeedbackDecision(settlementMonth)
    })
  },

  onShow() {
    this.loadOverview()
    this.loadFeedbackDecision()
  },

  async ensureLogin() {
    const user = await auth.ensureLoggedIn()
    if (!user) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return null
    }

    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }

    this.setData({
      roleText: workspace.getRoleText(user),
      profileDisplayName: user.realName || user.nickName || '未命名用户',
      profileSubtitle: [user.district, user.gridName, user.gridAccount].filter(Boolean).join(' / ') || '集客开通酬金工作台',
      profileCompleted: isProfileCompleted(user),
      canImport: MANAGER_ROLES.includes(user.role)
    })
    return user
  },

  async loadOverview() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    try {
      this.setData({ loading: true })
      const data = await lineProjectService.callLineProject('getMyOverview', {
        filters: this.data.filters
      })
      const totalAmount = Number(data.summary && data.summary.totalAmount) || 0
      const composition = (data.summary && data.summary.composition) || [
        {
          subCategory: lineProjectConfig.CURRENT_SUBCATEGORY,
          amount: 0
        }
      ]
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
    } catch (error) {
      console.error('加载集客开通概览失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadFeedbackDecision() {
    const user = await this.ensureLogin()
    if (!user) {
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
    if (subCategory === lineProjectConfig.CURRENT_SUBCATEGORY) {
      return
    }

    wx.showToast({
      title: `${subCategory}后续开放`,
      icon: 'none'
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
