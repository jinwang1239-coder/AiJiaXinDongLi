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
- `sales_department`：市场营销部/管理角色。

工作台类型：

- `sales`：销售业务工作台。
- `line_project`：集客线路项目工作台。

核心集合：

- `users`：用户、角色、工作台类型、区县、网格、网格通账号。
- `business_records`：已退役销售逐笔记录，只用于备份清理。
- sales_month_records：员工月度累计量及酬金快照。
- sales_import_batches：销售导入批次与更正记录。
- sales_active_versions：月份区县有效版本、定版及并发锁。
- sales_employees：员工编号与微信账号认领绑定。
- sales_claim_logs：认领更正审计。
- sales_data_receipts：员工查看月份区县有效版本记录，按当前绑定微信统计参与率。
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
│   │   ├── sales-core.js
│   │   └── SETUP.md
│   ├── fileUpload/
│   ├── lineProjectData/
│   ├── salaryFeedback/
│   ├── userManagement/
│   │   └── sales-identity.js
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
    ├── export.js
    ├── grid-options.js
    ├── line-project-config.js
    ├── line-project-service.js
    ├── product-config.js
    ├── sales-service.js
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

- `login`：按唯一 OPENID 查询或创建用户；新用户采用选择的工作台，角色默认 sales_person。
- `updateProfile`：销售普通员工仅认领 employeeId，管理资料由后台维护；集客保留姓名、网格通账号、区县和网格校验。
- `getUserInfo`：校验账号有效、唯一；销售员工资料取最新有效业务快照，管理人员不依赖员工认领。
- 原 `getUsersByRole` 无前端调用且缺少管理范围限制，已关闭。
- `test`：健康检查。

关键函数：

- `normalizeUser()`：补齐用户字段、归一工作台类型、计算资料完成状态。
- `isProfileCompleted()`：集客原资料校验；销售员工与管理人员按各自资料规则判断。

#### `cloudfunctions/userManagement/package.json`

依赖 `wx-server-sdk ~2.6.3`。

### `cloudfunctions/businessData/`

销售业务数据云函数。

#### `cloudfunctions/businessData/index.js`

销售月度数据服务。仅读取 sales_month_records 和 sales_active_versions，不再读取旧 business_records。
- getAccess：云端确认指定导入权限。
- importPreview / importCommit：12列Excel累计量校验、差异预览、月份区县版本替换；月份锁防并发重复计酬。
- getImportBatches / reopenMonth：批次历史、定版及填写原因后撤销定版。
- list / getStats / export：按员工编号及角色范围查询、数量统计、分月核算和Excel导出。
- archiveLegacy：先上传备份，再清理旧销售逐笔记录；不触及用户、反馈和集客。
- create、batchImport、update、delete 旧接口已关闭。

sales-core.js 保存模板解析及月度数量计算；SETUP.md 说明新集合、权限、索引和上线步骤。
sales-summary.js 负责 getSummary、recordReceipt：复用角色范围汇总8类数量和T+1/T+2；区县主管看本区县接收情况，市场营销部与系统管理员看全市。后台已识别的管理人员不计入员工接收人数。
exportParticipation 允许销售工作台的市场营销部及系统管理员调用，与首页共用接收判断，按业务月份导出全市或单个区县的汇总、已接收和未接收人员三张Excel表；保留未认领人员，按当前绑定微信和有效批次判断，导出结束复核版本。participation-test.js 验证导出统计、权限和版本变化。

#### `cloudfunctions/businessData/commission-rules.js`

独立云端8类产品单价；getCommissionDetail() 精确匹配并补齐T1—T5，getBusinessTypes() 返回业务名称。与 utils/product-config.js 和 remuneration.md 一致。

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

销售酬金反馈与集客问题工单云函数。两者共用 feedback_routes 的区县经理、监督员姓名与网格通名单；查询待办和答复时均核对当前名单、管理角色及区县，不使用处理人 openid 或旧分配快照授权；人员更替可直接接续未答复工单，openid 仅用于登录、本人反馈归属和实际操作记录。salary_feedbacks 按 district 查询待办，需普通升序索引。sales-context.js 校验员工绑定，取得所选业务月份的金额、归属区县与批次快照。

#### `cloudfunctions/salaryFeedback/index.js`

action：

- `create`：创建反馈。
- `listMine`：查询当前用户提交的反馈。
- `listPending`：查询分配给当前处理人的待答复反馈。
- `getSceneSummary`：查询当前用户某场景某月份最近反馈，用于集客签字确认判断。
- `resolve`：任一指定处理人答复，可附图片。
- `continueFeedback`：员工继续反馈，重新进入待答复。
- `confirmResolved`：员工确认解决，关闭工单。
- `test`：健康检查。

核心规则：

- 反馈上下文由 `workspaceType` 和 `scene` 决定。
- 销售默认场景：`sales_salary`。
- 集客场景：`line_project_workorders`。
- 反馈提交要求用户资料完整、区县已配置、`feedback_routes` 有有效路由。
- 审批路由中要配置区县经理和基层监督员网格通账号。
- 提交人与任一审批人不能是同一人。
- 集客场景保留已有签字确认限制；可选的月度提交次数限制由原环境变量控制。销售不增加签字确认。
- 销售与集客共用答复闭环：任一指定处理人答复后等待员工确认；员工可确认解决或继续反馈。事务校验身份、工作台与最新状态，防止并发覆盖。集客名单中的经理、监督员可从集客首页进入指定销售反馈处理，不扩大销售业务查询权限。

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

销售登录及角色首页。普通员工显示个人酬金、认领和我的反馈；管理人员以员工接收情况替代个人酬金卡片，显示授权导入、维护和指定待办入口。

#### `pages/login/login.js`

登录与工作台路由；销售员工只填写 employeeId 完成一次认领，姓名区县网格取导入资料。薪酬卡保留布局，按业务月份展示总酬金，另列当月应核算及版本状态。授权市场营销部人员看到专属导入入口。集客继续原资料体系。

#### `pages/login/login.wxml`

未登录时显示工作台选择和登录按钮；已登录时显示用户卡、当月酬金卡、业务量统计、反馈入口和资料弹窗。
管理首页通过 components/sales-participation 展示接收情况；市场营销部和系统管理员可选择全市/单区县并导出接收明细，由 utils/sales-service.js 调用 exportParticipation，复用 utils/export.js 保存打开Excel。

#### `pages/login/login.wxss`

登录页、工作台选择卡、用户卡、酬金卡、资料弹窗样式。

#### `pages/login/login.json`

引用 `navigation-bar`，标题为“个人中心”。

### `pages/collect/`

销售业务量导入与维护页，已移出公共tabBar。管理月份、截止日期、最终标记、上传预览、自动识别区县、发布和撤销定版；完全重复导入不生成版本。市场营销部或系统管理员须有 salesImport 才可导入。系统管理员另可维护认领、按原因清空未定版区县月份；原数据与绑定保留。日常页面已移除旧数据清理按钮。

### `pages/manage/`

销售月度业务查询页。按月份、区县、业务、姓名或员工编号筛选，数量统计、分月详情和Excel导出。普通员工仅本人，区县主管仅本区县，市场营销部按管理范围查看。禁止逐笔编辑和删除。

### `pages/summary/`

底部“业务汇总”页面。按业务月份展示8类数量、T+1下月预估金额、T+2下下月递延金额；云端限制本人/区县/全市范围。接收情况组件 components/sales-participation 仅在管理首页展示。员工在个人首页、汇总或明细成功查看最新版本后自动记录接收，旧版本或未展示月份不计入。

### `pages/feedback/`

通用反馈页，既支持销售酬金反馈，也支持集客问题反馈。

#### `pages/feedback/feedback.js`

核心功能：

- 根据 URL 参数初始化反馈上下文。
- 销售场景加载 `businessData.list` 的月度酬金统计。
- 集客场景加载 `lineProjectData.getMyOverview` 的本人月度酬金。
- 调用 `salaryFeedback.listMine` 查询个人反馈历史。
- 调用 `salaryFeedback.listPending` 查询指定待答复反馈。
- 调用 `salaryFeedback.create` 提交反馈。
- 调用 `salaryFeedback.resolve` 答复，`continueFeedback` 继续反馈，`confirmResolved` 由员工确认解决；销售和集客复用对话、图片附件界面。

#### `pages/feedback/feedback.wxml`

提交反馈卡、历史反馈列表、待审批反馈列表。

#### `pages/feedback/feedback.wxss`

反馈表单、状态标签、历史卡片、审批按钮样式。

#### `pages/feedback/feedback.json`

引用 `navigation-bar`，标题为“薪酬反馈”。

### `pages/profile/`

个人资料页。

#### `pages/profile/profile.js`

按工作台展示资料：销售填写员工编号认领，已认领编号只读；集客保留原网格通账号与资料维护。

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

### `utils/product-config.js`

8类产品平铺配置；PRODUCT_CONFIG 保存单笔分月酬金，getProducts() 返回列表。已取消三级产品选择。

### `utils/export.js`

销售与集客共用 saveExcelFile(base64, filename)，保存并打开Excel。旧销售CSV和逐笔导出、前端权限过滤已删除。

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

销售工作台通过 userManagement/sales-identity.js 认领员工编号，独立 sales_employees 绑定在覆盖月份数据后仍保留。集客继续下面的网格通资料流程。

路径：

`pages/login/login.js` -> `utils/auth.js` -> `cloudfunctions/userManagement/index.js` -> `app.js`

用户登录后写入 `users`，再同步到 `app.globalData`。资料完整要求姓名、网格通账号、区县、所属网格四项都有值。

### 销售业务提交

已取消手动逐笔提交。指定市场营销部人员通过月度Excel累计表导入。

### 销售业务管理和导出

pages/manage/manage.js → utils/sales-service.js → cloudfunctions/businessData/index.js。云端以 employeeId、角色范围及有效批次确定可见记录。

### 销售批量导入

pages/collect/collect.js → 云存储 → businessData.importPreview / importCommit → sales-core.js。表头为区县、网格名称、装维人员姓名、员工编号和8类业务数量；上传时选择业务月份、截止日期和是否定版。云端根据Excel行自动识别覆盖区县，前端不再手动选择区县。

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

销售反馈按所选业务月份的归属区县，复用集客经理、监督员的姓名及网格通名单，由云端匹配处理人；任一处理人答复后由员工确认解决或继续反馈。经理管理区县与员工个人区县分开。

## 常见修改入口

### 调整销售产品或酬金

- 前端配置：utils/product-config.js
- 云端单价：cloudfunctions/businessData/commission-rules.js
- 数量计算及核算：cloudfunctions/businessData/sales-core.js
- 依据：remuneration.md

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
