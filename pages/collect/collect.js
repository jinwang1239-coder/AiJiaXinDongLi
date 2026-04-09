// pages/collect/collect.js
const commission = require('../../utils/commission-fixed')
const productConfig = require('../../utils/product-config')
const storage = require('../../utils/storage')

Page({
  data: {
    // 琛ㄥ崟鏁版嵁
    formData: {
      date: '',
      district: '',
      businessName: '',
      userPhone: '',
      developer: '',
      attachments: []
    },
    
    // 棰勮閰噾
    estimatedCommission: 0,
    
    // 涓夌骇鑱斿姩鏁版嵁
    categories: [],
    subcategories: [],
    products: [],
    selectedCategory: '',
    selectedSubcategory: '',
    selectedProduct: '',
    categoryIndex: -1,
    subcategoryIndex: -1,
    productIndex: -1,
    
    // 鍖哄幙閫夐」
    districts: [
      '鐩戝埄', '娲箹', '鐭抽', '鏉炬粙', '鍏畨', '姹熼櫟', '娌欏競鍖?, '鑽嗗窞鍖?,'寮€鍙戝尯'
    ],
    
    // 鐣岄潰鐘舵€?
    loading: false,
    submitting: false,
    
    // 蹇€熷綍鍏ユā鏉?
    quickInputTemplate: `- 鏃ユ湡锛?025骞?鏈?鏃?
- 鍖哄幙锛氱洃鍒?
- 涓氬姟鍚嶇О锛欶TTR
- 鐢ㄦ埛鍙风爜锛?3963524198
- 鍙戝睍浜哄憳锛氬瓩鏉?
- 涓氬姟鍔炵悊鎴浘锛堥€夊～锛塦,
    
    // 鏄剧ず蹇€熷綍鍏ラ潰鏉?
    showQuickInput: false,
    quickInputText: ''
  },
  onLoad() {
    this.initData()
  },

  onShow() {
    this.checkLoginStatus()
    this.loadLastFormData()
  },

  /**
   * 鍒濆鍖栨暟鎹?
   */
  initData() {
    // 鑾峰彇浜у搧鍒嗙被
    const categories = productConfig.getCategories()
    
    // 璁剧疆榛樿鏃ユ湡涓轰粖澶?
    const today = new Date()
    const dateStr = this.formatDate(today)
    
    this.setData({
      categories,
      'formData.date': dateStr
    })
  },

  /**
   * 鍔犺浇涓婃濉啓鐨勮〃鍗曟暟鎹?
   */
  loadLastFormData() {
    const lastData = storage.getLastFormData()
    if (lastData) {
      // 璇㈤棶鐢ㄦ埛鏄惁瑕佽嚜鍔ㄥ～鍏?
      wx.showModal({
        title: '鑷姩濉厖',
        content: '妫€娴嬪埌涓婃濉啓鐨勮〃鍗曟暟鎹紝鏄惁鑷姩濉厖锛?,
        success: (res) => {
          if (res.confirm) {
            this.autoFillForm(lastData)
          }
        }
      })
    }
  },

  /**
   * 鑷姩濉厖琛ㄥ崟
   */
  autoFillForm(data) {
    const formData = { ...this.data.formData }
    
    // 淇濇寔褰撳墠鏃ユ湡锛屼絾濉厖鍏朵粬瀛楁
    if (data.district) formData.district = data.district
    if (data.userPhone) formData.userPhone = data.userPhone
    if (data.developer) formData.developer = data.developer
    
    // 濡傛灉鏈変笟鍔″悕绉帮紝灏濊瘯鍖归厤浜у搧
    if (data.businessName) {
      const productMatch = productConfig.searchProduct(data.businessName)
      if (productMatch) {
        this.selectProductByMatch(productMatch)
        formData.businessName = data.businessName
      }
    }
    
    this.setData({ formData })
    this.calculateCommission()
    
    wx.showToast({
      title: '宸茶嚜鍔ㄥ～鍏?,
      icon: 'success'
    })
  },

  /**
   * 鏍规嵁浜у搧鍖归厤缁撴灉閫夋嫨浜у搧
   */
  selectProductByMatch(match) {
    const categories = this.data.categories
    const categoryIndex = categories.findIndex(cat => cat.name === match.category)
    
    if (categoryIndex >= 0) {
      const subcategories = productConfig.getSubcategories(match.category)
      const subcategoryIndex = subcategories.findIndex(sub => sub.name === match.subcategory)
      
      if (subcategoryIndex >= 0) {
        const products = productConfig.getProducts(match.category, match.subcategory)
        const productIndex = products.findIndex(prod => prod.name === match.product)
        
        this.setData({
          categoryIndex,
          subcategoryIndex: subcategoryIndex >= 0 ? subcategoryIndex : -1,
          productIndex: productIndex >= 0 ? productIndex : -1,
          selectedCategory: match.category,
          selectedSubcategory: match.subcategory || '',
          selectedProduct: match.product || '',
          subcategories: subcategories,
          products: products
        })
      }
    }
  },

  /**
   * 妫€鏌ョ櫥褰曠姸鎬?
   */
  checkLoginStatus() {
    const app = getApp()
    if (!app.globalData.hasUserInfo) {
      wx.showModal({
        title: '璇峰厛鐧诲綍',
        content: '浣跨敤姝ゅ姛鑳介渶瑕佸厛鐧诲綍',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/login/login'
          })
        }
      })
    }
  },

  /**
   * 鏍煎紡鍖栨棩鏈?
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },
  /**
   * 琛ㄥ崟杈撳叆浜嬩欢澶勭悊
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`formData.${field}`]: value
    })
    
    // 濡傛灉鏄笟鍔″悕绉版墜鍔ㄨ緭鍏ワ紝娓呴櫎閫夋嫨鍣ㄧ姸鎬?
    if (field === 'businessName') {
      if (value && value.trim()) {
        // 娓呴櫎閫夋嫨鍣ㄧ姸鎬?
        this.setData({
          categoryIndex: -1,
          subcategoryIndex: -1,
          productIndex: -1,
          selectedCategory: '',
          selectedSubcategory: '',
          selectedProduct: '',
          subcategories: [],
          products: []
        })
      }
      this.calculateCommission()
    }
  },

  /**
   * 鏃ユ湡閫夋嫨
   */
  onDateChange(e) {
    this.setData({
      'formData.date': e.detail.value
    })
  },

  /**
   * 鍖哄幙閫夋嫨
   */
  onDistrictChange(e) {
    const index = e.detail.value
    this.setData({
      'formData.district': this.data.districts[index]
    })
  },  /**
   * 涓氬姟鍒嗙被閫夋嫨
   */
  onCategoryChange(e) {
    const index = parseInt(e.detail.value)
    const category = this.data.categories[index]
    
    // 娣诲姞绌哄€兼鏌?
    if (!category) {
      console.error('閫夋嫨鐨勫垎绫讳笉瀛樺湪锛宨ndex:', index, 'categories:', this.data.categories)
      wx.hideLoading()
      wx.showToast({
        title: '閫夋嫨鐨勫垎绫讳笉瀛樺湪',
        icon: 'error'
      })
      return
    }
    
    const subcategories = productConfig.getSubcategories(category.name)
    
    this.setData({
      categoryIndex: index,
      selectedCategory: category.name,
      subcategories,
      subcategoryIndex: -1,
      productIndex: -1,
      selectedSubcategory: '',
      selectedProduct: '',
      products: [],
      'formData.businessName': ''
    })
    
    this.calculateCommission()
  },
  /**
   * 涓氬姟瀛愬垎绫婚€夋嫨
   */
  onSubcategoryChange(e) {
    const index = parseInt(e.detail.value)
    const subcategory = this.data.subcategories[index]
    
    // 娣诲姞绌哄€兼鏌?
    if (!subcategory) {
      console.error('閫夋嫨鐨勫瓙鍒嗙被涓嶅瓨鍦紝index:', index, 'subcategories:', this.data.subcategories)
      wx.hideLoading()
      wx.showToast({
        title: '閫夋嫨鐨勫瓙鍒嗙被涓嶅瓨鍦?,
        icon: 'error'
      })
      return
    }
    
    const products = productConfig.getProducts(this.data.selectedCategory, subcategory.name)
    
    this.setData({
      subcategoryIndex: index,
      selectedSubcategory: subcategory.name,
      products,
      productIndex: -1,
      selectedProduct: '',
      'formData.businessName': ''
    })
    
    this.calculateCommission()
  },
  /**
   * 鍏蜂綋浜у搧閫夋嫨
   */
  onProductChange(e) {
    const index = parseInt(e.detail.value)
    const product = this.data.products[index]
    
    // 娣诲姞绌哄€兼鏌?
    if (!product) {
      console.error('閫夋嫨鐨勪骇鍝佷笉瀛樺湪锛宨ndex:', index, 'products:', this.data.products)
      wx.showToast({
        title: '閫夋嫨鐨勪骇鍝佷笉瀛樺湪',
        icon: 'error'
      })
      return
    }
    
    this.setData({
      productIndex: index,
      selectedProduct: product.name,
      'formData.businessName': product.name
    })
    
    this.calculateCommission()
  },
  /**
   * 璁＄畻棰勮閰噾
   */
  calculateCommission() {
    const { businessName } = this.data.formData
    if (businessName) {
      const estimatedCommission = commission.calculateCommission(businessName)
      this.setData({ estimatedCommission })
    } else {
      this.setData({ estimatedCommission: 0 })
    }
  },

  /**
   * 閫夋嫨鍥剧墖
   */
  chooseImage() {
    const { attachments } = this.data.formData
    const remainCount = 5 - attachments.length
    
    if (remainCount <= 0) {
      wx.showToast({
        title: '鏈€澶氬彧鑳戒笂浼?寮犲浘鐗?,
        icon: 'none'
      })
      return
    }
    
    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newAttachments = [...attachments, ...res.tempFiles]
        this.setData({
          'formData.attachments': newAttachments
        })
      },
      fail: (err) => {
        console.error('閫夋嫨鍥剧墖澶辫触锛?, err)
        wx.showToast({
          title: '閫夋嫨鍥剧墖澶辫触',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 棰勮鍥剧墖
   */
  previewImage(e) {
    const { index } = e.currentTarget.dataset
    const { attachments } = this.data.formData
    const urls = attachments.map(item => item.tempFilePath)
    
    wx.previewImage({
      current: urls[index],
      urls: urls
    })
  },

  /**
   * 鍒犻櫎鍥剧墖
   */
  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const { attachments } = this.data.formData
    
    wx.showModal({
      title: '纭鍒犻櫎',
      content: '纭畾瑕佸垹闄よ繖寮犲浘鐗囧悧锛?,
      success: (res) => {
        if (res.confirm) {
          attachments.splice(index, 1)
          this.setData({
            'formData.attachments': attachments
          })
        }
      }
    })
  },

  /**
   * 鏄剧ず蹇€熷綍鍏?
   */
  showQuickInput() {
    this.setData({
      showQuickInput: true,
      quickInputText: this.data.quickInputTemplate
    })
  },

  /**
   * 闅愯棌蹇€熷綍鍏?
   */
  hideQuickInput() {
    this.setData({
      showQuickInput: false,
      quickInputText: ''
    })
  },

  /**
   * 蹇€熷綍鍏ユ枃鏈敼鍙?
   */
  onQuickInputChange(e) {
    this.setData({
      quickInputText: e.detail.value
    })
  },

  /**
   * 瑙ｆ瀽蹇€熷綍鍏?
   */
  parseQuickInput() {
    const { quickInputText } = this.data
    if (!quickInputText.trim()) {
      wx.showToast({
        title: '璇疯緭鍏ュ唴瀹?,
        icon: 'none'
      })
      return
    }
    
    try {
      const lines = quickInputText.split('\n')
      const formData = { ...this.data.formData }
      
      lines.forEach(line => {
        const trimmedLine = line.trim()
        if (trimmedLine.startsWith('- 鏃ユ湡锛?)) {
          const dateStr = trimmedLine.replace('- 鏃ユ湡锛?, '').trim()
          // 杞崲涓枃鏃ユ湡鏍煎紡
          const dateMatch = dateStr.match(/(\d{4})骞?\d{1,2})鏈?\d{1,2})鏃?)
          if (dateMatch) {
            const [, year, month, day] = dateMatch
            formData.date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
          }
        } else if (trimmedLine.startsWith('- 鍖哄幙锛?)) {
          formData.district = trimmedLine.replace('- 鍖哄幙锛?, '').trim()
        } else if (trimmedLine.startsWith('- 涓氬姟鍚嶇О锛?)) {
          formData.businessName = trimmedLine.replace('- 涓氬姟鍚嶇О锛?, '').trim()
        } else if (trimmedLine.startsWith('- 鐢ㄦ埛鍙风爜锛?)) {
          formData.userPhone = trimmedLine.replace('- 鐢ㄦ埛鍙风爜锛?, '').trim()
        } else if (trimmedLine.startsWith('- 鍙戝睍浜哄憳锛?)) {
          formData.developer = trimmedLine.replace('- 鍙戝睍浜哄憳锛?, '').trim()
        }
      })
      
      this.setData({ formData })
      this.calculateCommission()
      this.hideQuickInput()
      
      wx.showToast({
        title: '瑙ｆ瀽鎴愬姛',
        icon: 'success'
      })
    } catch (error) {
      console.error('瑙ｆ瀽澶辫触锛?, error)
      wx.showToast({
        title: '瑙ｆ瀽澶辫触锛岃妫€鏌ユ牸寮?,
        icon: 'error'
      })
    }
  },

  /**
   * 楠岃瘉琛ㄥ崟
   */
  validateForm() {
    const { formData } = this.data
    
    if (!formData.date) {
      wx.showToast({
        title: '璇烽€夋嫨鏃ユ湡',
        icon: 'none'
      })
      return false
    }
    
    if (!formData.district) {
      wx.showToast({
        title: '璇烽€夋嫨鍖哄幙',
        icon: 'none'
      })
      return false
    }
    
    if (!formData.businessName) {
      wx.showToast({
        title: '璇疯緭鍏ヤ笟鍔″悕绉?,
        icon: 'none'
      })
      return false
    }
    
    if (!formData.userPhone) {
      wx.showToast({
        title: '璇疯緭鍏ョ敤鎴峰彿鐮?,
        icon: 'none'
      })
      return false
    }
    
    // 楠岃瘉鎵嬫満鍙锋牸寮?
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(formData.userPhone)) {
      wx.showToast({
        title: '璇疯緭鍏ユ纭殑鎵嬫満鍙?,
        icon: 'none'
      })
      return false
    }
    
    if (!formData.developer) {
      wx.showToast({
        title: '璇疯緭鍏ュ彂灞曚汉鍛?,
        icon: 'none'
      })
      return false
    }
    
    return true
  },

  /**
   * 涓婁紶鍥剧墖鍒颁簯瀛樺偍
   */
  async uploadImages() {
    const { attachments } = this.data.formData
    if (attachments.length === 0) {
      return []
    }
    
    const uploadPromises = attachments.map((file, index) => {
      const fileName = `business_images/${Date.now()}_${index}.${file.tempFilePath.split('.').pop()}`
      return wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: file.tempFilePath
      })
    })
    
    try {
      const results = await Promise.all(uploadPromises)
      return results.map(res => res.fileID)
    } catch (error) {
      console.error('鍥剧墖涓婁紶澶辫触锛?, error)
      throw error
    }
  },
  /**
   * 鎻愪氦琛ㄥ崟
   */
  async onSubmit() {
    if (!this.validateForm()) {
      return
    }
    
    this.setData({ submitting: true })
    wx.showLoading({
      title: '鎻愪氦涓?..'
    })
    
    try {
      const app = getApp()
      const openid = app.globalData.openid
      
      // 淇濆瓨琛ㄥ崟鏁版嵁鍒版湰鍦板瓨鍌?
      storage.saveLastFormData(this.data.formData)
      
      // 涓婁紶鍥剧墖
      const imageUrls = await this.uploadImages()
      
      // 璁＄畻閰噾
      const calculatedCommission = commission.calculateCommission(this.data.formData.businessName)
      
      // 淇濆瓨鍒版暟鎹簱
      const db = wx.cloud.database()
      await db.collection('business_records').add({
        data: {
          userId: openid,
          date: new Date(this.data.formData.date),
          district: this.data.formData.district,
          businessName: this.data.formData.businessName,
          userPhone: this.data.formData.userPhone,
          developer: this.data.formData.developer,
          attachments: imageUrls,
          commission: calculatedCommission,
          createTime: new Date(),
          updateTime: new Date()
        }
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '鎻愪氦鎴愬姛',
        icon: 'success'
      })
      
      // 閲嶇疆琛ㄥ崟
      this.resetForm()
      
    } catch (error) {
      console.error('鎻愪氦澶辫触锛?, error)
      wx.hideLoading()
      wx.showToast({
        title: '鎻愪氦澶辫触',
        icon: 'error'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
  /**
   * 閲嶇疆琛ㄥ崟
   */
  resetForm() {
    const today = new Date()
    const dateStr = this.formatDate(today)
    
    this.setData({
      formData: {
        date: dateStr,
        district: '',
        businessName: '',
        userPhone: '',
        developer: '',
        attachments: []
      },
      estimatedCommission: 0,
      categoryIndex: -1,
      subcategoryIndex: -1,
      productIndex: -1,
      selectedCategory: '',
      selectedSubcategory: '',
      selectedProduct: '',
      subcategories: [],
      products: []
    })
  },

  /**
   * 娓呯┖琛ㄥ崟
   */
  onReset() {
    wx.showModal({
      title: '纭閲嶇疆',
      content: '纭畾瑕佹竻绌哄綋鍓嶈〃鍗曞唴瀹瑰悧锛?,
      success: (res) => {
        if (res.confirm) {
          this.resetForm()
          wx.showToast({
            title: '琛ㄥ崟宸查噸缃?,
            icon: 'success'
          })
        }
      }
    })
  }
})

