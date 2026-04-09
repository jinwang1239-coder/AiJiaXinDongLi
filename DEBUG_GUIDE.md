# Excel导出功能调试指南

## 当前问题
点击导出xlsx后，提示【导出失败： Cannot read properties of undefined (reading 'filters')】

## 已修复的问题

### 1. 云函数参数传递问题
**问题**: 前端传递的参数结构与云函数期望的不一致
**修复**: 修改了云函数入口，直接传递 event 对象而不是 data 对象

### 2. 筛选条件构建问题
**问题**: `buildFilterCondition` 方法返回的数据库命令对象无法序列化传递给云函数
**修复**: 创建了两个方法：
- `buildFilterCondition()`: 用于导出，返回简单对象
- `buildLocalFilterCondition()`: 用于本地查询，返回数据库命令对象

## 测试步骤

### 1. 重新部署云函数
```bash
# 在微信开发者工具中：
# 1. 右键点击 cloudfunctions/businessData 文件夹
# 2. 选择"上传并部署：云端安装依赖"
# 3. 等待部署完成
```

### 2. 简单测试
在小程序调试控制台中运行 `test-simple-export.js` 中的测试代码：

```javascript
// 复制并粘贴到控制台运行
function testCloudFunction() {
  wx.cloud.callFunction({
    name: 'businessData',
    data: {
      action: 'export',
      filters: {},
      format: 'xlsx'
    }
  }).then(res => {
    console.log('测试结果:', res)
  }).catch(err => {
    console.error('测试失败:', err)
  })
}
testCloudFunction()
```

### 3. 查看日志
1. 在微信开发者工具的"云开发"面板中
2. 进入"云函数"页面
3. 点击"businessData"函数
4. 查看"日志"标签页的输出

## 预期的修复效果

### 成功的调用日志应该显示：
```
导出数据云函数被调用: { openid: "...", filters: {...}, format: "xlsx" }
```

### 成功的返回结果应该包含：
```javascript
{
  success: true,
  data: {
    base64: "UEsDBBQABgAI...", // Excel文件的base64编码
    filename: "业务数据_2025-08-15.xlsx",
    total: 10, // 导出的记录数
    exportTime: "2025-08-15T...",
    exportedBy: "用户昵称"
  }
}
```

## 可能的其他问题

### 1. 依赖未安装
如果仍然报错，可能是xlsx依赖未正确安装：
```bash
cd cloudfunctions/businessData
npm install xlsx
```

### 2. 权限问题
确保用户已正确登录并有相应权限：
- 检查 `app.globalData.openid` 是否存在
- 检查用户在 users 集合中的角色

### 3. 数据库连接问题
确保云函数能正常访问数据库

## 手动验证步骤

1. **验证云函数基本功能**：
   ```javascript
   wx.cloud.callFunction({
     name: 'businessData',
     data: { action: 'test' }
   }).then(console.log)
   ```

2. **验证用户查询**：
   ```javascript
   wx.cloud.callFunction({
     name: 'businessData',
     data: { 
       action: 'export',
       format: 'json',
       filters: {}
     }
   }).then(console.log)
   ```

3. **验证Excel生成**：
   ```javascript
   wx.cloud.callFunction({
     name: 'businessData',
     data: { 
       action: 'export',
       format: 'xlsx',
       filters: {}
     }
   }).then(console.log)
   ```

## 如果还有问题

请提供以下信息：
1. 云函数日志的具体错误信息
2. 前端控制台的错误堆栈
3. 用户登录状态和角色信息
4. 是否有业务数据存在

这样我们可以进一步定位和解决问题。
