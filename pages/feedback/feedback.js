const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const workspace = require('../../utils/workspace')

const FEEDBACK_CONTEXTS = {
  sales: {
    workspaceType: workspace.WORKSPACE_TYPES.SALES,
    scene: 'sales_salary',
    navTitle: '酬金反馈',
    sectionTitle: '提出反馈',
    historyTitle: '历史反馈',
    pendingTitle: '待审批反馈',
    monthFieldLabel: '反馈月份',
    amountFieldLabel: '当月酬金',
    submitButtonText: '提交反馈',
    textareaPlaceholder: '请输入薪酬异议或疑问内容',
    recordTitleSuffix: '酬金反馈'
  },
  line_project: {
    workspaceType: workspace.WORKSPACE_TYPES.LINE_PROJECT,
    scene: 'line_project_workorders',
    navTitle: '问题反馈',
    sectionTitle: '问题反馈',
    historyTitle: '反馈记录',
    pendingTitle: '待审批反馈',
    monthFieldLabel: '结算月份',
    amountFieldLabel: '本人酬金',
    submitButtonText: '提交反馈',
    textareaPlaceholder: '请输入本月酬金疑问或反馈说明',
    recordTitleSuffix: '集客开通酬金反馈'
  }
}

function getCurrentMonthLabel() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

Page({
  data: {
    loading: false,
    submitting: false,
    reviewing: false,
    profileCompleted: false,
    canApprove: false,
    navTitle: FEEDBACK_CONTEXTS.sales.navTitle,
    sectionTitle: FEEDBACK_CONTEXTS.sales.sectionTitle,
    historyTitle: FEEDBACK_CONTEXTS.sales.historyTitle,
    pendingTitle: FEEDBACK_CONTEXTS.sales.pendingTitle,
    monthFieldLabel: FEEDBACK_CONTEXTS.sales.monthFieldLabel,
    amountFieldLabel: FEEDBACK_CONTEXTS.sales.amountFieldLabel,
    submitButtonText: FEEDBACK_CONTEXTS.sales.submitButtonText,
    textareaPlaceholder: FEEDBACK_CONTEXTS.sales.textareaPlaceholder,
    recordTitleSuffix: FEEDBACK_CONTEXTS.sales.recordTitleSuffix,
    feedbackContext: {
      workspaceType: FEEDBACK_CONTEXTS.sales.workspaceType,
      scene: FEEDBACK_CONTEXTS.sales.scene
    },
    monthLabel: getCurrentMonthLabel(),
    monthCommission: '0.00',
    feedbackForm: {
      content: ''
    },
    myFeedbacks: [],
    pendingFeedbacks: []
  },

  onLoad(options = {}) {
    this.initPageContext(options)
  },

  async onShow() {
    await this.loadPageData()
  },

  initPageContext(options = {}) {
    const isLineProject = options.workspaceType === workspace.WORKSPACE_TYPES.LINE_PROJECT
    const baseContext = isLineProject ? FEEDBACK_CONTEXTS.line_project : FEEDBACK_CONTEXTS.sales
    const monthLabel = String(options.salaryMonth || options.monthLabel || getCurrentMonthLabel()).trim() || getCurrentMonthLabel()
    const salaryAmount = Number(options.salaryAmount || 0)

    this.setData({
      navTitle: baseContext.navTitle,
      sectionTitle: baseContext.sectionTitle,
      historyTitle: baseContext.historyTitle,
      pendingTitle: baseContext.pendingTitle,
      monthFieldLabel: baseContext.monthFieldLabel,
      amountFieldLabel: baseContext.amountFieldLabel,
      submitButtonText: baseContext.submitButtonText,
      textareaPlaceholder: baseContext.textareaPlaceholder,
      recordTitleSuffix: baseContext.recordTitleSuffix,
      feedbackContext: {
        workspaceType: baseContext.workspaceType,
        scene: String(options.scene || baseContext.scene).trim() || baseContext.scene
      },
      monthLabel,
      monthCommission: this.formatMoney(salaryAmount)
    })
  },

  isProfileCompleted(user) {
    return !!user && !!(
      String(user.realName || '').trim() &&
      String(user.gridAccount || '').trim() &&
      String(user.district || '').trim() &&
      String(user.gridName || '').trim()
    )
  },

  formatMoney(value) {
    return Number(value || 0).toFixed(2)
  },

  formatDateTime(dateInput) {
    if (!dateInput) {
      return ''
    }

    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  },

  getStatusText(status) {
    const statusMap = {
      pending: '待处理',
      processing: '处理中',
      approved: '已通过',
      rejected: '已驳回'
    }

    return statusMap[status] || '待处理'
  },

  getStatusClass(status) {
    const statusClassMap = {
      pending: 'status-pending',
      processing: 'status-processing',
      approved: 'status-approved',
      rejected: 'status-rejected'
    }

    return statusClassMap[status] || 'status-pending'
  },

  getPendingRoleText(record) {
    if (record.pendingReviewType === 'manager') {
      return '区县经理审批'
    }

    if (record.pendingReviewType === 'supervisor') {
      return '基层监督员审批'
    }

    return '待审批'
  },

  buildRecordTitle(record) {
    return `${record.salaryMonth} ${this.data.recordTitleSuffix}`
  },

  buildFeedbackList(records = []) {
    return records.map(record => ({
      ...record,
      recordTitle: this.buildRecordTitle(record),
      createTimeText: this.formatDateTime(record.createTime),
      managerStatusText: this.getStatusText(record.managerReview && record.managerReview.status),
      managerStatusClass: this.getStatusClass(record.managerReview && record.managerReview.status),
      supervisorStatusText: this.getStatusText(record.supervisorReview && record.supervisorReview.status),
      supervisorStatusClass: this.getStatusClass(record.supervisorReview && record.supervisorReview.status),
      statusText: this.getStatusText(record.status),
      statusClass: this.getStatusClass(record.status),
      salaryAmountText: this.formatMoney(record.salaryAmount),
      pendingRoleText: this.getPendingRoleText(record)
    }))
  },

  redirectToLogin() {
    wx.showToast({
      title: '请先登录',
      icon: 'none'
    })
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/login/login'
      })
    }, 300)
  },

  isLineProjectContext() {
    return this.data.feedbackContext.workspaceType === workspace.WORKSPACE_TYPES.LINE_PROJECT
  },

  buildFeedbackPayload(extraData = {}) {
    return {
      workspaceType: this.data.feedbackContext.workspaceType,
      scene: this.data.feedbackContext.scene,
      ...extraData
    }
  },

  async callFeedbackFunction(action, payload = {}) {
    const res = await wx.cloud.callFunction({
      name: 'salaryFeedback',
      data: {
        action,
        data: payload
      }
    })

    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '反馈请求失败')
    }

    return res.result.data || {}
  },

  async loadSalesSummary() {
    const res = await wx.cloud.callFunction({
      name: 'businessData',
      data: {
        action: 'list',
        data: {
          page: 1,
          pageSize: 100,
          filters: {},
          sortBy: 'createTime',
          sortOrder: 'desc'
        }
      }
    })

    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '薪酬数据加载失败')
    }

    const stats = (res.result.data && res.result.data.stats) || {}
    this.setData({
      monthCommission: this.formatMoney(stats.monthCommission)
    })
  },

  async loadLineProjectSummary() {
    const data = await lineProjectService.callLineProject('getMyOverview', {
      filters: {
        settlementMonth: this.data.monthLabel
      }
    })

    this.setData({
      monthCommission: this.formatMoney(data.summary && data.summary.totalAmount)
    })
  },

  async loadContextSummary() {
    if (this.isLineProjectContext()) {
      await this.loadLineProjectSummary()
      return
    }

    await this.loadSalesSummary()
  },

  async loadMyFeedbacks() {
    const resultData = await this.callFeedbackFunction('listMine', this.buildFeedbackPayload())
    this.setData({
      myFeedbacks: this.buildFeedbackList(resultData.records || [])
    })
  },

  async loadPendingFeedbacks() {
    const resultData = await this.callFeedbackFunction('listPending', this.buildFeedbackPayload())
    this.setData({
      canApprove: !!resultData.canApprove,
      pendingFeedbacks: this.buildFeedbackList(resultData.records || [])
    })
  },

  ensureWorkspaceAccess(user) {
    if (this.isLineProjectContext()) {
      if (!workspace.isLineProjectWorkspace(user)) {
        workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
        return false
      }
      return true
    }

    if (!workspace.isSalesWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.SALES)
      return false
    }

    return true
  },

  async loadPageData() {
    try {
      this.setData({ loading: true })

      const user = await auth.ensureLoggedIn()
      if (!user) {
        this.redirectToLogin()
        return
      }

      if (!this.ensureWorkspaceAccess(user)) {
        return
      }

      const profileCompleted = this.isProfileCompleted(user)
      this.setData({ profileCompleted })

      if (!profileCompleted) {
        this.setData({
          canApprove: false,
          myFeedbacks: [],
          pendingFeedbacks: [],
          monthCommission: '0.00'
        })
        return
      }

      await Promise.all([
        this.loadContextSummary(),
        this.loadMyFeedbacks(),
        this.loadPendingFeedbacks()
      ])
    } catch (error) {
      console.error('加载反馈页面失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onContentInput(e) {
    this.setData({
      'feedbackForm.content': e.detail.value
    })
  },

  async submitFeedback() {
    const content = String(this.data.feedbackForm.content || '').trim()
    if (!this.data.profileCompleted) {
      wx.showToast({ title: '请先完善个人信息', icon: 'none' })
      return
    }

    if (!content) {
      wx.showToast({ title: '请输入疑问内容', icon: 'none' })
      return
    }

    try {
      this.setData({ submitting: true })
      await this.callFeedbackFunction('create', this.buildFeedbackPayload({
        salaryMonth: this.data.monthLabel,
        salaryAmount: Number(this.data.monthCommission),
        content
      }))

      this.setData({
        'feedbackForm.content': ''
      })
      wx.showToast({
        title: '反馈已提交',
        icon: 'success'
      })
      await Promise.all([
        this.loadMyFeedbacks(),
        this.loadPendingFeedbacks()
      ])
    } catch (error) {
      console.error('提交反馈失败:', error)
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async reviewFeedback(e) {
    if (this.data.reviewing) {
      return
    }

    const { id, action } = e.currentTarget.dataset
    const actionText = action === 'approved' ? '通过' : '驳回'

    wx.showModal({
      title: '确认审批',
      content: `确认${actionText}这条反馈吗？`,
      success: async res => {
        if (!res.confirm) {
          return
        }

        try {
          this.setData({ reviewing: true })
          await this.callFeedbackFunction('review', {
            feedbackId: id,
            action
          })

          wx.showToast({
            title: '审批完成',
            icon: 'success'
          })
          await Promise.all([
            this.loadMyFeedbacks(),
            this.loadPendingFeedbacks()
          ])
        } catch (error) {
          console.error('审批反馈失败:', error)
          wx.showToast({
            title: error.message || '审批失败',
            icon: 'none'
          })
        } finally {
          this.setData({ reviewing: false })
        }
      }
    })
  }
})
