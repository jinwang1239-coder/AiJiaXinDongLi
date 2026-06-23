# AGENTS.md

本文件是本项目的“目录式代码索引”。后续维护时，优先按目录和文件路径查本文件，再决定是否需要打开源码。

阅读范围：已阅读仓库中除 `.git/` 和第三方依赖目录 `cloudfunctions/businessData/node_modules/` 之外的项目文件。源码按 UTF-8 读取；如果 PowerShell 默认输出中文乱码，不代表源码损坏。

## 项目总览

这是一个微信小程序 + 微信云开发项目。

- 云环境：`cloud1-1g65i23w93c28d35`
- 小程序 appid：`wx524ce2ad21ef139f`
- 小程序入口：`app.js`、`app.json`、`app.wxss`
- 云函数根目录：`cloudfunctions/`
- 前端页面目录：`pages/`
- 公共工具目录：`utils/`

系统有两条业务线：

- 销售业务工作台：登录、资料维护、业务信息采集、销售记录管理、酬金统计、Excel/CSV 导出、薪酬反馈。
- 集客线路项目工作台：集客开通 Excel 导入、人员绑定、工单聚合、个人酬金概览、工单明细、月度签字确认、问题反馈、批次和导出。

核心角色：

- `sales_person`：普通销售/装维人员。
- `district_manager`：区县主管。
- `sales_department`：销售业务部/管理角色。

工作台类型：

- `sales`：销售业务工作台。
- `line_project`：集客线路项目工作台。

核心集合：

- `users`：用户、角色、工作台类型、区县、网格、网格通账号。
- `business_records`：销售业务记录。
- `salary_feedbacks`：销售酬金反馈和集客问题反馈。
- `feedback_routes`：按区县配置区县经理和基层监督员。
- `line_project_records`：集客线路项目人员明细。
- `line_project_import_batches`：集客导入批次。
- `user_person_bindings`：集客人员身份与系统用户绑定。
- `line_project_month_confirms`：集客月度签字确认。

## 目录树

```text
.
├── app.js
├── app.json
├── app.wxss
├── project.config.json
├── project.private.config.json
├── package.json
├── package-lock.json
├── sitemap.json
├── database-setup.js
├── deploy.js
├── deploy-functions.js
├── deploy.sh
├── test.js
├── test-integration.js
├── test-simple-export.js
├── test-excel-export.js
├── test-function-data.json
├── README_NEW.md
├── DEBUG_GUIDE.md
├── Grid.md
├── remuneration.md
├── cloudfunctions/
│   ├── businessData/
│   ├── fileUpload/
│   ├── lineProjectData/
│   ├── salaryFeedback/
│   ├── userManagement/
│   ├── database-config.js
│   ├── database-init.js
│   └── test-data-generator.js
├── components/
│   └── navigation-bar/
├── images/
│   ├── collect.svg
│   ├── login.svg
│   └── manage.svg
├── pages/
│   ├── collect/
│   ├── feedback/
│   ├── index/
│   ├── line-project/
│   ├── login/
│   ├── manage/
│   └── profile/
└── utils/
    ├── auth.js
    ├── commission.js
    ├── commission-fixed.js
    ├── export.js
    ├── grid-options.js
    ├── line-project-config.js
    ├── line-project-service.js
    ├── product-config.js
    ├── storage.js
    └── workspace.js
```

## 根目录

### `.editorconfig`

统一编辑器格式：UTF-8、LF、文件末尾换行、2 空格缩进、默认清理行尾空格。Markdown 不清理行尾空格。

### `.eslintrc.js`

ESLint 配置。启用 ES6、browser、node 环境；声明微信小程序全局变量 `wx`、`App`、`Page`、`Component`、`getApp` 等。当前未启用具体规则。

### `.gitattributes`

统一源码文本文件为 LF；图片、PDF、zip 等标记为 binary。

### `app.js`

小程序全局入口。

- `onLaunch()` 初始化云开发环境。
- 初始化 `globalData`：用户资料、角色、工作台类型、openid、资料完成状态等。
- `setUserProfile(user)` 是全局用户状态同步核心：传空值时清空登录状态；传用户时写入 `userInfo`、`userRole`、`workspaceType`、`openid`、`profileCompleted`、`userProfile`。
- `getUserInfo()` 是旧式微信授权兼容逻辑。

真实登录流程主要由 `utils/auth.js` 调用云函数后再同步到这里。

### `app.json`

页面、窗口、tabBar 和云开发配置。

页面注册顺序：

1. `pages/login/login`
2. `pages/collect/collect`
3. `pages/manage/manage`
4. `pages/line-project/index`
5. `pages/line-project/import`
6. `pages/line-project/persons`
7. `pages/line-project/workorders`
8. `pages/feedback/feedback`
9. `pages/profile/profile`
10. `pages/index/index`

tabBar 只有三个入口：登录、信息采集、数据管理。集客页面不在 tabBar 中，通过登录后的工作台跳转进入。

### `app.wxss`

全局样式。定义页面默认字体和背景、通用 `.btn`、`.form-*`、`.card`、`.stats-*`、`.tag-*`、flex 工具类和 spacing 工具类。

### `project.config.json`

微信开发者工具项目配置。

- `compileType: miniprogram`
- `cloudfunctionRoot: cloudfunctions/`
- `cloud.env: cloud1-1g65i23w93c28d35`
- `appid: wx524ce2ad21ef139f`
- `libVersion: 3.8.7`

### `project.private.config.json`

本地开发者工具私有配置。包含本机调试偏好，如热重载、urlCheck、ignoreDevUnusedFiles 等。

### `package.json`

说明型项目元数据，包含项目名称、描述、功能、技术栈、页面、云函数、部署信息等。不是完整 npm 依赖清单。

### `package-lock.json`

根目录 lock 文件，内容很少。实际云函数依赖以各云函数目录内 `package.json` 为准。

### `sitemap.json`

允许所有页面索引：`allow *`。

### `database-setup.js`

旧版数据库索引初始化脚本，创建 `users`、`business_records`、`salary_feedbacks`、`feedback_routes` 相关索引。相比 `cloudfunctions/database-init.js` 少了集客线路相关集合。

### `deploy.js`

部署提示脚本，只打印手动部署步骤和集合清单。当前列表包含 `userManagement`、`businessData`、`fileUpload`、`salaryFeedback`，没有包含 `lineProjectData`，已落后于当前业务。

### `deploy-functions.js`

云函数部署和健康检查提示脚本。`checkFunctions()` 用 `wx.cloud.callFunction({ action: 'test' })` 检查云函数状态。函数列表仍偏旧，只含 `userManagement`、`businessData`、`fileUpload`。

### `deploy.sh`

Shell 版部署提示脚本，不实际部署，只打印微信开发者工具中的手动部署步骤。函数列表同样偏旧。

### `test.js`

微信开发者工具控制台测试脚本。定义 `MiniProgramTester`，可测试云函数连接、数据库连接、用户认证、业务数据提交。注意脚本中部分 action 和字段沿用旧版本，如 `register`、`businessData` 入参，直接运行前需要按当前云函数更新。

### `test-integration.js`

本地/小程序混合测试脚本，测试 `product-config`、`storage`、`commission-fixed` 的分类、产品搜索、酬金计算、本地存储。示例产品名可能与当前配置不完全匹配。

### `test-simple-export.js`

Excel 导出快速测试。调用 `businessData.export`，请求 `format: 'xlsx'`，打印 base64 长度并尝试保存打开。

### `test-excel-export.js`

更完整的 Excel 导出测试，包含测试数据、`testExportFunction()`、`testSaveFile()`。

### `test-function-data.json`

云函数测试入参：`{ "action": "test" }`。

### `README_NEW.md`

早期项目说明文档。主要描述销售业务信息收集系统，未完整覆盖当前集客线路模块和反馈审批模块。

### `DEBUG_GUIDE.md`

Excel 导出调试指南。说明 `businessData.export` 参数、云函数日志、依赖、权限、数据库等排查步骤。

### `Grid.md`

区县和网格表。内容与 `utils/grid-options.js` 基本对应。

### `remuneration.md`

荆州铁通 2026 年 3 月随销主推业务清单。是销售产品酬金配置的重要来源。修改酬金规则时，应同时核对这个文档、`utils/product-config.js`、`cloudfunctions/businessData/commission-rules.js`。

## `cloudfunctions/`

云函数目录，微信云开发后端主要在这里。

### `cloudfunctions/database-config.js`

数据库集合配置说明，列出集合字段、索引和安全规则建议。覆盖销售、反馈、集客线路所有主要集合。

### `cloudfunctions/database-init.js`

较完整的云数据库初始化脚本。创建以下集合索引：

- `users`
- `business_records`
- `salary_feedbacks`
- `line_project_month_confirms`
- `feedback_routes`
- `line_project_records`
- `line_project_import_batches`
- `user_person_bindings`

末尾插入一个示例管理员用户 `admin_openid_example`。

### `cloudfunctions/test-data-generator.js`

云控制台测试数据脚本。提供：

- `insertTestData()`：插入测试用户和测试业务记录。
- `clearTestData()`：清理测试用户和相关业务记录。

测试数据偏早期商户/FTTR 模型，与当前销售业务记录字段不完全一致。

### `cloudfunctions/userManagement/`

用户登录与资料云函数。

#### `cloudfunctions/userManagement/index.js`

action：

- `login`：根据 `OPENID` 查询或创建用户。新用户默认 `role: sales_person`、`workspaceType: sales`、`profileCompleted: false`。
- `updateProfile`：保存 `realName`、`gridAccount`、`district`、`gridName`，要求四项完整，并校验 `gridAccount` 唯一。
- `getUserInfo`：返回当前用户。
- `getUsersByRole`：仅区县主管和业务部可按角色查询用户。
- `test`：健康检查。

关键函数：

- `normalizeUser()`：补齐用户字段、归一工作台类型、计算资料完成状态。
- `isProfileCompleted()`：检查姓名、网格通账号、区县、网格。

#### `cloudfunctions/userManagement/package.json`

依赖 `wx-server-sdk ~2.6.3`。

### `cloudfunctions/businessData/`

销售业务数据云函数。

#### `cloudfunctions/businessData/index.js`

action：

- `create`：创建单条销售业务记录。
- `batchImport`：销售业务 Excel 批量导入。
- `list`：按角色范围和筛选条件分页查询记录。
- `update`：更新记录。
- `delete`：删除记录。
- `getStats`：统计记录。
- `export`：导出 xlsx/base64 或供 CSV 流程使用的数据。
- `test`：健康检查。

核心规则：

- 创建记录时，云函数用“发展人员网格通账号”反查 `users`，把业务归属到目标用户，而不是只相信前端提交的人名。
- 普通销售只能看本人 openid 或本人网格通账号相关记录。
- 区县主管只能看本区县记录。
- 业务部可看全部记录。
- 销售记录写入 `owner`、`submittedBy`、`userId`、`gridAccount`、`developerGridAccount`、`commissionDetails`、`settlementSchedule`、`settlementSummary` 等字段。

关键函数：

- `buildUserRecordCondition()`：构造普通销售可见范围，兼容旧字段。
- `buildRoleScopeCondition()`：构造角色数据范围。
- `buildRecordFilterCondition()`：处理日期、区县、业务、状态、发展人员、提交人、酬金区间等筛选。
- `buildBusinessRecord()`：标准化销售业务记录并计算酬金和分月核算。
- `batchImportBusinessRecords()`：解析销售导入 Excel，字段为 `办理时间`、`网格通账号`、`发展人员网格通`、`业务名称`、`业务号码`。
- `exportData()`：生成销售业务 Excel，含 T+1 至 T+5 分月核算列。

#### `cloudfunctions/businessData/commission-rules.js`

云端销售酬金规则，是落库时的权威计算源。

导出：

- `calculateCommission()`
- `getCommissionDetail()`
- `findProductMatch()`
- `normalizeCommissionDetails()`
- `buildSettlementSchedule()`
- `buildSettlementSummary()`
- `enrichRecordSettlement()`
- `getBusinessTypes()`

注意：前端也有 `utils/product-config.js` 和 `utils/commission-fixed.js`，修改酬金时必须同步前后端配置。

#### `cloudfunctions/businessData/package.json`

依赖 `wx-server-sdk ~2.6.3` 和 `xlsx ^0.18.5`。

#### `cloudfunctions/businessData/package-lock.json`

`businessData` 云函数依赖锁定文件。

#### `cloudfunctions/businessData/node_modules/`

第三方依赖安装产物，不作为项目业务源码维护。

### `cloudfunctions/fileUpload/`

文件上传相关云函数，目前不是主要上传路径，前端多直接使用 `wx.cloud.uploadFile`。

#### `cloudfunctions/fileUpload/index.js`

action：

- `getUploadUrl`：生成 `business-images/{openid}/...` 云路径并调用 `cloud.uploadFile`。
- `deleteFile`：删除云文件。
- `getFileList`：目前返回空列表，占位。
- `test`：健康检查。

#### `cloudfunctions/fileUpload/package.json`

依赖 `wx-server-sdk ~2.6.3`。

### `cloudfunctions/salaryFeedback/`

销售薪酬反馈和集客问题反馈的双审批云函数。

#### `cloudfunctions/salaryFeedback/index.js`

action：

- `create`：创建反馈。
- `listMine`：查询当前用户提交的反馈。
- `listPending`：查询当前用户作为审批人的待审批反馈。
- `getSceneSummary`：查询当前用户某场景某月份最近反馈，用于集客签字确认判断。
- `review`：审批通过或驳回。
- `test`：健康检查。

核心规则：

- 反馈上下文由 `workspaceType` 和 `scene` 决定。
- 销售默认场景：`sales_salary`。
- 集客场景：`line_project_workorders`。
- 反馈提交要求用户资料完整、区县已配置、`feedback_routes` 有有效路由。
- 审批路由中要配置区县经理和基层监督员网格通账号。
- 提交人与任一审批人不能是同一人。
- 集客场景下，本月已签字确认后不能再反馈；本月已有 `pending`/`processing` 反馈时不能重复提交。
- 整体状态：任一驳回为 `rejected`，两者都通过为 `approved`，仅一方通过为 `processing`，都未处理为 `pending`。

#### `cloudfunctions/salaryFeedback/package.json`

依赖 `wx-server-sdk ~2.6.3`。

### `cloudfunctions/lineProjectData/`

集客线路项目核心云函数。

#### `cloudfunctions/lineProjectData/config.js`

集客 Excel 模板配置。

包含：

- `MAJOR_CATEGORY_OPTIONS`
- `SUBCATEGORY_TO_MAJOR`
- `SUBCATEGORY_OPTIONS`
- `FIXED_FIELD_COLUMNS`：A-H 固定字段，包括序号、区县、身份证号、姓名、业务量、金额、工单名称、公式金额。
- `ITEM_COLUMN_MAP`：I-AR 工作量明细列。
- `TEMPLATE_META`：模板代码、主表名、校验表名、表头行数、单价行、数据开始行、金额容差等。

重要注意：当前 `index.js` 里读取 `TEMPLATE_META.mainSheetName` 和 `TEMPLATE_META.validationSheetNames`，但配置里是 `sheetName` 和 `validationSheetName`。如果集客导入运行时报找不到工作表或校验表异常，优先修这里的字段名不一致。

#### `cloudfunctions/lineProjectData/index.js`

action：

- `importPreview`：预解析集客 Excel。
- `importCommit`：正式导入。
- `getMyOverview`：本人月份概览。
- `listMyWorkOrders`：本人工单列表。
- `getMyWorkOrderDetail`：本人工单详情。
- `getMonthConfirmStatus`：本月签字确认状态。
- `confirmMonth`：月度签字确认。
- `dashboard`：管理看板统计。
- `listByPerson`：按人员聚合列表。
- `getPersonDetail`：人员详情。
- `listByWorkOrder`：按工单聚合列表。
- `getWorkOrderDetail`：工单详情。
- `getImportBatches`：导入批次。
- `export`：导出集客 Excel。
- `test`：健康检查。

权限：

- 所有业务要求用户存在且 `workspaceType === 'line_project'`。
- 导入和批次查询要求 `district_manager` 或 `sales_department`。
- 普通用户只能看本人 `gridAccount`。
- 区县主管看本区县。
- 业务部看全部。

导入流程：

1. 下载云存储 Excel。
2. 读取主表。
3. 校验模板结构。
4. 读取第 5 行单价。
5. 从第 6 行开始解析人员、身份证、工单、业务量、工作量。
6. 通过姓名 + 身份证 hash 生成 `personKey`。
7. 通过工单名称解析类型、主题、工单号，生成 `workOrderKey`。
8. 匹配系统用户或已有 `user_person_bindings`。
9. 重算 `calculatedAmount`，与表内 `excelFormulaAmount` 对比。
10. 生成预览行、阻断错误、金额预警、按线路校验摘要。

正式导入：

- 无阻断错误才可提交。
- 按 `settlementMonth + subCategory + districts` 删除旧记录。
- 写入 `line_project_records`。
- upsert `user_person_bindings`。
- 写入 `line_project_import_batches`。

聚合与确认：

- `aggregateByPerson()` 按人员汇总。
- `aggregateByWorkOrder()` 按工单汇总。
- `getMyOverview()` 仅本人范围。
- `confirmMonth()` 写入 `line_project_month_confirms`；资料不完整、已确认、有待处理反馈都会禁止确认。
- `exportData()` 生成两个 sheet：`工单汇总`、`人员明细`。

文件末尾 `module.exports.__test__` 暴露部分纯函数用于测试。

#### `cloudfunctions/lineProjectData/package.json`

依赖 `wx-server-sdk ~2.6.3` 和 `xlsx ^0.18.5`。

## `components/`

### `components/navigation-bar/`

自定义导航栏组件，被多数页面引用。

#### `components/navigation-bar/navigation-bar.js`

组件逻辑。

- 属性：`title`、`background`、`color`、`back`、`loading`、`homeButton`、`animated`、`show`、`delta` 等。
- `attached()` 读取胶囊按钮、设备、窗口、安全区信息，计算导航栏布局。
- `_showChange(show)` 控制显示隐藏动画。
- `back()` 调用 `wx.navigateBack` 并触发 `back` 事件。

注意：模板中存在 `home` 绑定，但 JS 没有实现 `home()` 方法。

#### `components/navigation-bar/navigation-bar.wxml`

导航栏模板，包含左侧返回/首页按钮区、中间标题或 slot、右侧 slot、loading 图标。

#### `components/navigation-bar/navigation-bar.wxss`

WeUI 风格导航栏样式，包含安全区、高度、返回箭头 mask、loading 动画。

#### `components/navigation-bar/navigation-bar.json`

声明组件，`styleIsolation: apply-shared`。

## `pages/`

前端页面目录。每个页面通常由 `.js`、`.wxml`、`.wxss`、`.json` 四个文件组成。

### `pages/login/`

销售登录页，也是登录后的销售个人首页。

#### `pages/login/login.js`

核心功能：

- 登录前选择销售工作台或集客线路工作台。
- 调用 `auth.login()` 完成微信资料授权和云端登录。
- 根据用户实际 `workspaceType` 决定是否跳转集客首页。
- 展示销售用户个人信息和当月/今日/累计统计。
- 资料不完整时弹窗要求补充姓名、网格通账号、区县、网格。
- 保存资料调用 `auth.updateProfile()`。
- 销售用户可进入薪酬反馈页。
- 支持退出登录。

#### `pages/login/login.wxml`

未登录时显示工作台选择和登录按钮；已登录时显示用户卡、当月酬金卡、业务量统计、反馈入口和资料弹窗。

#### `pages/login/login.wxss`

登录页、工作台选择卡、用户卡、酬金卡、资料弹窗样式。

#### `pages/login/login.json`

引用 `navigation-bar`，标题为“个人中心”。

### `pages/collect/`

销售业务采集页。

#### `pages/collect/collect.js`

核心功能：

- 校验登录和销售工作台访问权限。
- 初始化产品分类和默认业务日期。
- 读取上次表单并可自动填充。
- 产品三级联动：大类、子类、具体产品。
- 实时估算酬金。
- 图片选择、预览、删除，最多 5 张。
- 普通提交：上传图片后调用 `businessData.create`。
- 批量导入：区县主管和业务部可选择 Excel，上传后调用 `businessData.batchImport`。
- 表单校验包括日期、区县、业务名称、11 位手机号、发展人员网格通账号。

#### `pages/collect/collect.wxml`

包含批量导入卡、业务信息表单、图片上传区、重置和提交按钮。

#### `pages/collect/collect.wxss`

采集页表单、三级联动、图片上传、批量导入结果样式。

#### `pages/collect/collect.json`

引用 `navigation-bar`，标题为“信息收集”。

### `pages/manage/`

销售业务数据管理页。

#### `pages/manage/manage.js`

核心功能：

- 校验登录和销售工作台访问权限。
- 调用 `businessData.list` 分页加载业务记录。
- 本地补充分月核算展示。
- 统计总记录、今日、累计、已核算、未核算。
- 支持日期、区县、业务类型、发展人员、酬金范围筛选。
- 支持记录详情弹窗、图片预览、删除记录。
- 支持 xlsx 和 csv 导出。

#### `pages/manage/manage.wxml`

统计卡、筛选工具栏、筛选面板、记录列表、空状态、加载更多、导出格式弹窗。

#### `pages/manage/manage.wxss`

管理页渐变背景、统计卡、筛选面板、记录卡、分月核算摘要、导出弹窗样式。

#### `pages/manage/manage.json`

引用 `navigation-bar`，开启下拉刷新和触底加载距离。

### `pages/feedback/`

通用反馈页，既支持销售酬金反馈，也支持集客问题反馈。

#### `pages/feedback/feedback.js`

核心功能：

- 根据 URL 参数初始化反馈上下文。
- 销售场景加载 `businessData.list` 的月度酬金统计。
- 集客场景加载 `lineProjectData.getMyOverview` 的本人月度酬金。
- 调用 `salaryFeedback.listMine` 查询个人反馈历史。
- 调用 `salaryFeedback.listPending` 查询待审批反馈。
- 调用 `salaryFeedback.create` 提交反馈。
- 调用 `salaryFeedback.review` 审批通过或驳回。

#### `pages/feedback/feedback.wxml`

提交反馈卡、历史反馈列表、待审批反馈列表。

#### `pages/feedback/feedback.wxss`

反馈表单、状态标签、历史卡片、审批按钮样式。

#### `pages/feedback/feedback.json`

引用 `navigation-bar`，标题为“薪酬反馈”。

### `pages/profile/`

个人资料页。

#### `pages/profile/profile.js`

加载当前登录用户资料，展示头像、昵称、角色，允许修改姓名、网格通账号、区县、所属网格。保存调用 `auth.updateProfile()`，成功后返回上一页或工作台。

#### `pages/profile/profile.wxml`

个人摘要卡和资料表单。

#### `pages/profile/profile.wxss`

资料卡片、头像、角色标签、表单、保存/返回按钮样式。

#### `pages/profile/profile.json`

自定义导航栏配置。

### `pages/line-project/`

集客线路项目页面目录。

#### `pages/line-project/index.js`

集客首页。

- 校验登录、资料完整、工作台为 `line_project`。
- 加载 `lineProjectData.getMyOverview`。
- 展示本人本月总酬金、组成公式、参与工单、明细条数。
- 管理角色显示管理员导入入口。
- 可进入工单页、反馈页、导入页、个人资料页。
- 支持退出登录。

#### `pages/line-project/index.wxml`

用户工作台卡、月份选择卡、总酬金卡、酬金组成网格、工单入口。

#### `pages/line-project/index.wxss`

集客首页样式，主要是青绿色总酬金卡和工作台卡。

#### `pages/line-project/index.json`

引用 `navigation-bar`。

#### `pages/line-project/import.js`

集客 Excel 导入页。

- 仅 `line_project` 工作台的区县主管和业务部可用。
- 选择 `.xls`/`.xlsx` 文件。
- 上传到 `line_project_imports/`。
- `previewImport()` 调用 `lineProjectData.importPreview`。
- `commitImport()` 调用 `lineProjectData.importCommit`。
- `loadBatches()` 查询导入批次。

#### `pages/line-project/import.wxml`

导入条件、文件选择、预解析/正式导入、预览统计、样例行、阻断错误、金额预警、按线路校验、批次列表。

#### `pages/line-project/import.wxss`

导入页筛选项、统计块、文件面板、预览列表、错误项样式。

#### `pages/line-project/import.json`

引用 `navigation-bar`。

#### `pages/line-project/persons.js`

兼容跳转页。读取 `settlementMonth` 后直接 `redirectTo` 到 `pages/line-project/workorders`。

#### `pages/line-project/persons.wxml`

显示“正在跳转到我的工单...”。

#### `pages/line-project/persons.wxss`

居中空状态样式。

#### `pages/line-project/persons.json`

引用 `navigation-bar`。

#### `pages/line-project/workorders.js`

集客本人工单页。

- 校验登录和 `line_project` 工作台。
- 加载本人概览 `lineProjectData.getMyOverview`。
- 加载签字确认状态 `lineProjectData.getMonthConfirmStatus`。
- 加载反馈状态 `salaryFeedback.getSceneSummary`。
- 加载本人工单列表 `lineProjectData.listMyWorkOrders`。
- 支持月份和关键字筛选。
- 支持月度签字确认 `lineProjectData.confirmMonth`。
- 支持跳转问题反馈。
- 支持工单详情弹窗 `lineProjectData.getMyWorkOrderDetail`。
- 支持工作量分组展开/收起和触底分页。

#### `pages/line-project/workorders.wxml`

筛选区、本人酬金概览、确认反馈卡、工作量汇总、工单列表、详情弹窗。

#### `pages/line-project/workorders.wxss`

工单页布局、概览卡、状态卡、工作量分组、列表项、详情弹窗样式。

#### `pages/line-project/workorders.json`

引用 `navigation-bar`。

### `pages/index/`

默认示例页，目前不是业务入口。

#### `pages/index/index.js`

空页面定义：`Page({})`。

#### `pages/index/index.wxml`

显示导航栏和 `Weixin` 文本。

#### `pages/index/index.wxss`

基础全高 flex 样式。

#### `pages/index/index.json`

引用 `navigation-bar`。

## `utils/`

公共前端工具目录。

### `utils/workspace.js`

工作台类型与角色文案工具。

导出：

- `WORKSPACE_TYPES`
- `normalizeWorkspaceType()`
- `getWorkspaceType()`
- `isSalesWorkspace()`
- `isLineProjectWorkspace()`
- `getWorkspaceLabel()`
- `getWorkspaceHomeUrl()`
- `getRoleText()`
- `relaunchWorkspaceHome()`
- `denyWorkspaceAccess()`
- `getPreferredWorkspaceType()`
- `setPreferredWorkspaceType()`

这是前端工作台隔离和跳转的核心工具。

### `utils/auth.js`

前端认证与用户状态工具。

导出：

- `getUserProfile()`
- `checkLoginStatus()`
- `getCurrentUserInfo()`
- `updateProfile(data)`
- `getUserRole()`
- `ensureLoggedIn()`
- `logout()`
- `login()`

内部使用本地存储键 `xdlLoginState` 恢复登录状态，并调用 `getApp().setUserProfile()` 同步全局用户。

### `utils/grid-options.js`

区县和网格静态数据。提供：

- `GRID_DATA`
- `getGridData()`
- `getDistricts()`
- `getGridsByDistrict(district)`

登录页和资料页用它驱动 picker。

### `utils/storage.js`

销售采集表单本地缓存工具。

提供：

- `saveLastFormData(formData)`
- `getLastFormData()`：30 天过期。
- `saveRecentSelection(type, value)`：每类最多 10 个。
- `getRecentSelections(type)`
- `clearAllData()`
- `getStorageStats()`

### `utils/product-config.js`

前端销售产品三级配置。

结构：

`产品大类 -> 产品小类 -> 产品资费名称 -> { commission, equivalentIncome }`

导出：

- `PRODUCT_CONFIG`
- `getProductCategories()`
- `getProductSubcategories(category)`
- `getProductItems(category, subcategory)`
- `calculateProductCommission(category, subcategory, item)`
- `searchProducts(searchName)`
- `getCategories()`
- `getSubcategories(category)`
- `getProducts(category, subcategory)`
- `searchProduct(searchName)`

主要服务 `pages/collect/collect.js` 的三级联动和前端估算。

### `utils/commission.js`

旧版通用酬金工具。提供记录统计、简单比例酬金计算、金额格式化、按角色获取比例配置。当前主业务更多使用 `commission-fixed.js`。

### `utils/commission-fixed.js`

前端销售酬金与分月核算工具。

核心功能：

- 按业务名称模糊匹配产品。
- 计算业务总酬金。
- 获取业务酬金明细。
- 统计记录数和酬金。
- 生成 T+1 到 T+5 分月核算进度。
- 汇总已核算和未核算金额。
- 给记录补充 `settlementSchedule`、`settlementSummary`、`settledTotal`、`unsettledTotal`。

销售登录页和管理页都依赖它。

### `utils/export.js`

销售数据导出工具。

提供：

- `exportToCSV()`
- `downloadCSV()`
- `exportToExcel()`
- `saveExcelFile()`
- `getExportColumns()`
- `filterDataByRole()`
- `generateFilename()`
- `checkExportPermission()`
- `exportBusinessData()`

xlsx 主流程：前端调用 `businessData.export` 获取 base64，再保存到小程序用户目录并打开。

### `utils/line-project-config.js`

集客线路前端配置。

包含：

- 当前模块 `集客 / 集客开通`。
- 酬金组成子类。
- `WORKLOAD_GROUPS` 工作量分组和项目清单。

导出：

- `getDefaultSettlementMonth()`
- `toMonthPickerValue()`
- `getMajorCategoryBySubCategory()`
- `formatMoney()`
- `buildCommissionCompositionText()`
- `buildGroupedWorkloadItems()`
- `buildQueryString()`

### `utils/line-project-service.js`

集客云函数前端封装。

导出：

- `callLineProject(action, data)`：统一调用 `lineProjectData` 并处理错误。
- `exportLineProject(viewType, filters)`：调用集客导出并保存 Excel。

## `images/`

SVG 资源目录。当前 `app.json` 的 tabBar 未引用这些图标。

### `images/collect.svg`

24x24 灰色线框“文档/收集”图标。

### `images/login.svg`

24x24 灰色线框“登录/进入”图标。

### `images/manage.svg`

24x24 灰色线框“管理/窗口”图标。

## 关键业务流程索引

### 登录与资料

路径：

`pages/login/login.js` -> `utils/auth.js` -> `cloudfunctions/userManagement/index.js` -> `app.js`

用户登录后写入 `users`，再同步到 `app.globalData`。资料完整要求姓名、网格通账号、区县、所属网格四项都有值。

### 销售业务提交

路径：

`pages/collect/collect.js` -> `cloudfunctions/businessData/index.js` -> `cloudfunctions/businessData/commission-rules.js`

前端负责表单、图片上传和估算；云端负责用户匹配、权限、权威酬金、分月核算和落库。

### 销售业务管理和导出

路径：

`pages/manage/manage.js` -> `utils/export.js` -> `cloudfunctions/businessData/index.js`

云端按角色限制范围。xlsx 导出由云函数生成 base64，前端保存并打开。

### 销售批量导入

路径：

`pages/collect/collect.js` -> 云存储 -> `cloudfunctions/businessData/index.js`

模板字段：`办理时间`、`网格通账号`、`发展人员网格通`、`业务名称`、`业务号码`。

### 集客导入

路径：

`pages/line-project/import.js` -> 云存储 -> `cloudfunctions/lineProjectData/index.js` -> `cloudfunctions/lineProjectData/config.js`

先预解析，再正式导入。正式导入会覆盖同月份、同子类、同导入区县的旧数据。

### 集客个人工单和签字确认

路径：

`pages/line-project/workorders.js` -> `cloudfunctions/lineProjectData/index.js` -> `cloudfunctions/salaryFeedback/index.js`

如果本月已有待处理反馈，则不能签字确认；如果已签字确认，则不能再提交问题反馈。

### 反馈审批

路径：

`pages/feedback/feedback.js` -> `cloudfunctions/salaryFeedback/index.js` -> `feedback_routes`

反馈需要区县配置审批路由。区县经理和基层监督员双审批决定最终状态。

## 常见修改入口

### 调整销售产品或酬金

- 前端选择和估算：`utils/product-config.js`
- 前端分月核算展示：`utils/commission-fixed.js`
- 云端权威落库：`cloudfunctions/businessData/commission-rules.js`
- 业务资料依据：`remuneration.md`

### 调整区县和网格

- `utils/grid-options.js`
- `Grid.md`

### 调整登录后跳转或工作台隔离

- `utils/workspace.js`
- `pages/login/login.js`
- `app.js`

### 调整销售记录权限

- 云端：`cloudfunctions/businessData/index.js`
- 前端按钮显示：`pages/manage/manage.js`

### 调整反馈审批

- 路由数据：云数据库 `feedback_routes`
- 逻辑：`cloudfunctions/salaryFeedback/index.js`
- 页面：`pages/feedback/feedback.*`

### 调整集客 Excel 模板

- 模板列配置：`cloudfunctions/lineProjectData/config.js`
- 解析和校验：`cloudfunctions/lineProjectData/index.js`
- 前端工作量展示：`utils/line-project-config.js`
- 导入页面：`pages/line-project/import.*`

### 调整集客个人页或工单页

- 首页：`pages/line-project/index.*`
- 工单页：`pages/line-project/workorders.*`
- 服务封装：`utils/line-project-service.js`

## 已知注意点

1. `cloudfunctions/lineProjectData/config.js` 与 `index.js` 对模板字段名疑似不一致：配置里是 `sheetName`、`validationSheetName`，代码里读取 `mainSheetName`、`validationSheetNames`。
2. 部署脚本和 `README_NEW.md` 偏旧，未完整覆盖 `lineProjectData`、集客集合和最新业务流程。
3. `components/navigation-bar/navigation-bar.wxml` 有 `home` 绑定，但 `navigation-bar.js` 没有实现 `home()`。
4. 根目录 `package.json` 是说明型元数据，不是标准依赖配置。
5. 销售酬金前端和云端各有一份配置，修改时必须同步。
6. 如果终端中文乱码，优先检查读取编码，源码本身按 UTF-8 存储。
7. `cloudfunctions/businessData/node_modules/` 是第三方依赖产物，不要作为业务源码手动维护。

## 覆盖说明

本文件按目录覆盖了根目录配置与脚本、`cloudfunctions/`、`components/`、`pages/`、`utils/`、`images/`、文档和测试文件。未逐文件展开 `.git/` 与第三方 `node_modules/`。
