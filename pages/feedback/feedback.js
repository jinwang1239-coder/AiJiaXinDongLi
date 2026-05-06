const auth = require('../../utils/auth')

Page({
  data: {
    loading: false,
    submitting: false,
    reviewing: false,
    profileCompleted: false,
    canApprove: false,
    monthLabel: '',
    monthCommission: '0.00',
    feedbackForm: {
      content: ''
    },
    myFeedbacks: [],
    pendingFeedbacks: []
  },

  onLoad() {
    this.setMonthLabel()
  },

  async onShow() {
    await this.loadPageData()
  },

  setMonthLabel() {
    const now = new Date()
    const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({ monthLabel })
  },

  isProfileCompleted(user) {
    return !!user && !!(
      (user.realName || '').trim() &&
      (user.gridAccount || '').trim() &&
      (user.district || '').trim() &&
      (user.gridName || '').trim()
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

  buildFeedbackList(records = []) {
    return records.map(record => ({
      ...record,
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

  async loadSalarySummary() {
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

  async loadMyFeedbacks() {
    const res = await wx.cloud.callFunction({
      name: 'salaryFeedback',
      data: {
        action: 'listMine'
      }
    })

    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '反馈记录加载失败')
    }

    this.setData({
      myFeedbacks: this.buildFeedbackList((res.result.data && res.result.data.records) || [])
    })
  },

  async loadPendingFeedbacks() {
    const res = await wx.cloud.callFunction({
      name: 'salaryFeedback',
      data: {
        action: 'listPending'
      }
    })

    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '待审批记录加载失败')
    }

    const resultData = res.result.data || {}
    this.setData({
      canApprove: !!resultData.canApprove,
      pendingFeedbacks: this.buildFeedbackList(resultData.records || [])
    })
  },

  async loadPageData() {
    try {
      this.setData({ loading: true })
      this.setMonthLabel()

      const user = await auth.ensureLoggedIn()
      if (!user) {
        this.redirectToLogin()
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
        this.loadSalarySummary(),
        this.loadMyFeedbacks(),
        this.loadPendingFeedbacks()
      ])
    } catch (error) {
      console.error('加载薪酬反馈页面失败:', error)
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
    const content = (this.data.feedbackForm.content || '').trim()
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
      const res = await wx.cloud.callFunction({
        name: 'salaryFeedback',
        data: {
          action: 'create',
          data: {
            salaryMonth: this.data.monthLabel,
            salaryAmount: Number(this.data.monthCommission),
            content
          }
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '反馈提交失败')
      }

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
          const response = await wx.cloud.callFunction({
            name: 'salaryFeedback',
            data: {
              action: 'review',
              data: {
                feedbackId: id,
                action
              }
            }
          })

          if (!response.result || !response.result.success) {
            throw new Error((response.result && response.result.error) || '审批失败')
          }

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
