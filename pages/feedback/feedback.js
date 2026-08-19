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
    historyTitle: '我的问题工单',
    pendingTitle: '待处理问题工单',
    monthFieldLabel: '结算月份',
    amountFieldLabel: '本人酬金',
    submitButtonText: '提交反馈',
    textareaPlaceholder: '请输入本月酬金疑问或反馈说明',
    recordTitleSuffix: '集客线路问题工单'
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
    resolvingId: '',
    profileCompleted: false,
    handleMode: false,
    hasSubmittedThisMonth: false,
    canApprove: false,
    canResolve: false,
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
      content: '',
      workOrderIndex: 0
    },
    workOrderOptions: [{ label: '整月薪酬', workOrderKey: '' }],
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
    const handleMode = isLineProject && options.mode === 'handle'

    this.setData({
      navTitle: handleMode ? '问题工单处理' : baseContext.navTitle,
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
      handleMode,
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
    if (this.isLineProjectContext()) {
      return ['resolved', 'approved', 'rejected'].includes(status) ? '已反馈' : '待反馈'
    }
    const statusMap = {
      pending: '待处理',
      processing: '处理中',
      approved: '已通过',
      rejected: '已驳回',
      not_required: '无需审批'
    }

    return statusMap[status] || '待处理'
  },

  getStatusClass(status) {
    if (this.isLineProjectContext()) {
      return ['resolved', 'approved', 'rejected'].includes(status) ? 'status-approved' : 'status-pending'
    }
    const statusClassMap = {
      pending: 'status-pending',
      processing: 'status-processing',
      approved: 'status-approved',
      rejected: 'status-rejected',
      not_required: 'status-pending'
    }

    return statusClassMap[status] || 'status-pending'
  },

  getPendingRoleText(record) {
    if (this.isLineProjectContext()) {
      return '待处理问题工单'
    }
    if (record.pendingReviewType === 'manager') {
      return '区县经理审批'
    }

    if (record.pendingReviewType === 'supervisor') {
      return '基层监督员审批'
    }

    return '待审批'
  },

  getWaitingText(record = {}) {
    const handlers = [
      { review: record.managerReview || {}, roleText: '区县经理' },
      { review: record.supervisorReview || {}, roleText: '基层监督员' }
    ].filter(item => item.review.status === 'pending')
      .map(item => `${item.review.name || item.review.gridAccount || item.roleText}（${item.roleText}）`)
    return handlers.length ? `待${handlers.join('或')}反馈中` : '等待问题处理人反馈'
  },

  getResolution(record = {}) {
    if (record.resolution) return record.resolution
    const legacyReviews = [
      { review: record.managerReview || {}, handlerRoleText: '区县经理' },
      { review: record.supervisorReview || {}, handlerRoleText: '基层监督员' }
    ]
    const resolved = legacyReviews.find(item => ['resolved', 'approved', 'rejected'].includes(item.review.status))
    if (!resolved) return null
    return {
      handlerRoleText: resolved.handlerRoleText,
      handler: resolved.review,
      content: resolved.review.reviewNote || '',
      attachments: [],
      resolveTime: resolved.review.reviewTime
    }
  },

  buildRecordTitle(record) {
    return `${record.salaryMonth} ${this.data.recordTitleSuffix}`
  },

  buildFeedbackList(records = []) {
    return records.map(record => {
      const resolution = this.getResolution(record)
      const attachments = resolution && Array.isArray(resolution.attachments) ? resolution.attachments : []
      const isResolved = ['resolved', 'approved', 'rejected'].includes(record.status)
      return {
        ...record,
        resolution,
        isResolved,
        recordTitle: this.buildRecordTitle(record),
        createTimeText: this.formatDateTime(record.createTime),
        managerStatusText: this.getStatusText(record.managerReview && record.managerReview.status),
        managerStatusClass: this.getStatusClass(record.managerReview && record.managerReview.status),
        supervisorStatusText: this.getStatusText(record.supervisorReview && record.supervisorReview.status),
        supervisorStatusClass: this.getStatusClass(record.supervisorReview && record.supervisorReview.status),
        statusText: this.getStatusText(record.status),
        statusClass: this.getStatusClass(record.status),
        salaryAmountText: this.formatMoney(record.salaryAmount),
        pendingRoleText: this.getPendingRoleText(record),
        waitingText: this.getWaitingText(record),
        resolutionHandlerText: resolution
          ? `${(resolution.handler && (resolution.handler.name || resolution.handler.realName || resolution.handler.gridAccount)) || '处理人'}（${resolution.handlerRoleText || '问题处理人'}）`
          : '',
        resolutionTimeText: resolution ? this.formatDateTime(resolution.resolveTime) : '',
        resolutionFileIDs: attachments.map(item => typeof item === 'string' ? item : item.fileID).filter(Boolean),
        resolutionImageUrls: [],
        responseText: '',
        selectedImages: []
      }
    })
  },

  async fillResolutionImageUrls(records = []) {
    const fileIDs = [...new Set(records.flatMap(item => item.resolutionFileIDs || []))]
    if (!fileIDs.length) return records
    const result = await wx.cloud.getTempFileURL({ fileList: fileIDs })
    const urlMap = {}
    ;(result.fileList || []).forEach(item => {
      if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
    })
    return records.map(item => ({
      ...item,
      resolutionImageUrls: (item.resolutionFileIDs || []).map(fileID => urlMap[fileID]).filter(Boolean)
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
    const filters = { settlementMonth: this.data.monthLabel }
    const [data, workOrders] = await Promise.all([
      lineProjectService.callLineProject('getMyOverview', { filters }),
      lineProjectService.callLineProject('listMyWorkOrders', {
        filters,
        page: 1,
        pageSize: 100
      })
    ])

    this.setData({
      monthCommission: this.formatMoney(data.summary && data.summary.totalAmount),
      workOrderOptions: [
        { label: '整月薪酬', workOrderKey: '' },
        ...(workOrders.records || []).map(item => ({
          label: `${item.subCategory || ''} ${item.workOrderCode || '未识别工单号'} ${item.workOrderSubject || item.workOrderNameRaw}`,
          workOrderKey: item.workOrderKey
        }))
      ],
      'feedbackForm.workOrderIndex': 0
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
    const records = await this.fillResolutionImageUrls(this.buildFeedbackList(resultData.records || []))
    this.setData({
      myFeedbacks: records,
      hasSubmittedThisMonth: this.isLineProjectContext() && records.some(item => item.salaryMonth === this.data.monthLabel)
    })
  },

  async loadPendingFeedbacks() {
    const resultData = await this.callFeedbackFunction('listPending', this.buildFeedbackPayload())
    this.setData({
      canApprove: !!resultData.canApprove,
      canResolve: !!resultData.canResolve,
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
          canResolve: false,
          hasSubmittedThisMonth: false,
          myFeedbacks: [],
          pendingFeedbacks: [],
          monthCommission: '0.00'
        })
        return
      }

      if (this.data.handleMode) {
        await this.loadPendingFeedbacks()
      } else {
        await Promise.all([
          this.loadContextSummary(),
          this.loadMyFeedbacks(),
          this.loadPendingFeedbacks()
        ])
      }
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

  onWorkOrderChange(e) {
    this.setData({ 'feedbackForm.workOrderIndex': Number(e.detail.value || 0) })
  },

  async submitFeedback() {
    const content = String(this.data.feedbackForm.content || '').trim()
    if (!this.data.profileCompleted) {
      wx.showToast({ title: '请先完善个人信息', icon: 'none' })
      return
    }

    if (this.data.hasSubmittedThisMonth) {
      wx.showToast({ title: '本月已提交过反馈，请勿重复提交', icon: 'none' })
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
        relatedWorkOrderKey: (this.data.workOrderOptions[this.data.feedbackForm.workOrderIndex] || {}).workOrderKey || '',
        content
      }))

      this.setData({
        'feedbackForm.content': '',
        'feedbackForm.workOrderIndex': 0
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

  onResponseInput(e) {
    this.setData({
      [`pendingFeedbacks[${Number(e.currentTarget.dataset.index)}].responseText`]: e.detail.value
    })
  },

  chooseResolutionImages(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.pendingFeedbacks[index]
    if (!record) return
    const remainCount = 5 - (record.selectedImages || []).length
    if (remainCount <= 0) {
      wx.showToast({ title: '每张问题工单最多上传5张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setData({
          [`pendingFeedbacks[${index}].selectedImages`]: (record.selectedImages || []).concat(res.tempFiles || [])
        })
      }
    })
  },

  removeResolutionImage(e) {
    const recordIndex = Number(e.currentTarget.dataset.recordIndex)
    const images = (this.data.pendingFeedbacks[recordIndex].selectedImages || []).slice()
    images.splice(Number(e.currentTarget.dataset.imageIndex), 1)
    this.setData({ [`pendingFeedbacks[${recordIndex}].selectedImages`]: images })
  },

  previewResolutionImage(e) {
    const record = this.data.pendingFeedbacks[Number(e.currentTarget.dataset.recordIndex)]
    const urls = (record.selectedImages || []).map(item => item.tempFilePath)
    wx.previewImage({ current: urls[Number(e.currentTarget.dataset.imageIndex)], urls })
  },

  previewHistoryImage(e) {
    const record = this.data.myFeedbacks[Number(e.currentTarget.dataset.recordIndex)]
    const urls = record ? record.resolutionImageUrls || [] : []
    wx.previewImage({ current: urls[Number(e.currentTarget.dataset.imageIndex)], urls })
  },

  async submitResolution(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.pendingFeedbacks[index]
    if (!record || this.data.resolvingId) return
    const responseText = String(record.responseText || '').trim()
    if (!responseText) {
      wx.showToast({ title: '请填写问题答复', icon: 'none' })
      return
    }

    const uploadedFileIDs = []
    try {
      this.setData({ resolvingId: record._id })
      wx.showLoading({ title: '提交中' })
      for (let imageIndex = 0; imageIndex < record.selectedImages.length; imageIndex += 1) {
        const image = record.selectedImages[imageIndex]
        const match = String(image.tempFilePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
        const ext = match ? match[1].toLowerCase() : 'jpg'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `line_project_feedbacks/${record.salaryMonth}/${record._id}/${Date.now()}_${imageIndex}.${ext}`,
          filePath: image.tempFilePath
        })
        uploadedFileIDs.push(uploadResult.fileID)
      }
      await this.callFeedbackFunction('resolve', {
        feedbackId: record._id,
        responseText,
        fileIDs: uploadedFileIDs
      })
      wx.showToast({ title: '问题答复已提交', icon: 'success' })
      await this.loadPendingFeedbacks()
    } catch (error) {
      if (uploadedFileIDs.length) wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {})
      console.error('提交问题答复失败:', error)
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ resolvingId: '' })
    }
  },

  async reviewFeedback(e) {
    if (this.data.reviewing) {
      return
    }

    const { id, action } = e.currentTarget.dataset
    const actionText = action === 'approved' ? '通过' : '驳回'

    wx.showModal({
      title: `确认${actionText}`,
      content: '',
      editable: true,
      placeholderText: action === 'rejected' ? '请输入驳回原因（必填）' : '处理意见（选填）',
      success: async res => {
        if (!res.confirm) {
          return
        }

        const reviewNote = String(res.content || '').trim()
        if (action === 'rejected' && !reviewNote) {
          wx.showToast({ title: '请填写驳回原因', icon: 'none' })
          return
        }

        try {
          this.setData({ reviewing: true })
          await this.callFeedbackFunction('review', {
            feedbackId: id,
            action,
            reviewNote
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
