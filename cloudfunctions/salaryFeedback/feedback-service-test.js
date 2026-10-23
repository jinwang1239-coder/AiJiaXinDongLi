const assert = require('assert')
const Module = require('module')

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return {
          command: {
            or(conditions) { return { $or: conditions } }
          }
        }
      },
      getWXContext() { return { OPENID: 'test' } }
    }
  }
  return originalLoad(request, parent, isMain)
}

const service = require('./index').__test__

assert.deepStrictEqual(
  service.resolveContext(
    { workspaceType: 'sales', scene: 'sales_salary' },
    { workspaceType: 'line_project' }
  ),
  { workspaceType: 'line_project', scene: 'line_project_workorders' }
)
assert.strictEqual(service.getEffectiveFeedbackStatus({
  status: 'processing',
  managerReview: { status: 'approved' },
  supervisorReview: { status: 'pending' }
}), 'awaiting_submitter')
assert.strictEqual(service.getEffectiveFeedbackStatus({
  status: 'resolved',
  resolution: { content: '已解释' }
}), 'awaiting_submitter')
assert.strictEqual(service.getEffectiveFeedbackStatus({
  workspaceType: 'line_project',
  scene: 'line_project_workorders',
  status: 'resolved',
  resolution: { content: '已解释' }
}), 'awaiting_submitter')
assert.strictEqual(service.getEffectiveFeedbackStatus({
  workspaceType: 'line_project',
  workflowVersion: 2,
  status: 'closed',
  employeeConfirmed: true
}), 'closed')
assert.deepStrictEqual(service.buildFeedbackMessages({
  workspaceType: 'line_project',
  content: '首次问题',
  submitter: { name: '一线员工' },
  resolution: {
    handler: { name: '监督员' },
    handlerRoleText: '基层监督员',
    content: '首次答复'
  }
}).map(item => item.type), ['submitter_question', 'handler_reply'])
assert.strictEqual(service.normalizeFeedbackStatus({
  workspaceType: 'line_project',
  status: 'resolved',
  resolution: { content: '历史答复' }
}, { hasConfirmedMonth: true }).status, 'closed')
assert.deepStrictEqual(service.normalizeFeedbackStatus({
  status: 'approved',
  managerReview: { status: 'approved', name: '处理人', reviewNote: '历史答复' }
}).resolution.content, '历史答复')
const currentRoute = { district: '测试区县', supervisor: { gridAccount: '200', name: '现任监督员' } }
const currentHandler = { workspaceType: 'line_project', district: '测试区县', gridAccount: '200', realName: '现任监督员' }
assert.strictEqual(service.getPendingReviewType({
  status: 'pending', district: '测试区县',
  supervisorReview: { status: 'pending', gridAccount: 'OLD_ACCOUNT' }
}, currentHandler, currentRoute), 'supervisor')
assert.strictEqual(service.getPendingReviewType({ status: 'closed', district: '测试区县' }, currentHandler, currentRoute), '')
assert.strictEqual(service.getPendingReviewType({ status: 'pending', district: '其他区县' }, currentHandler, currentRoute), '')
assert.strictEqual(service.getPendingReviewType({ status: 'pending', district: '测试区县' }, { ...currentHandler, realName: '错误姓名' }, currentRoute), '')
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: ['b2', 'b1'] }, ['b1', 'b2']), true)
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: ['b1'] }, ['b2']), false)
assert.strictEqual(service.isMonthlyFeedbackLimitEnabled({ workspaceType: 'line_project' }), false)
process.env.LINE_PROJECT_MONTHLY_FEEDBACK_LIMIT_ENABLED = 'true'
assert.strictEqual(service.isMonthlyFeedbackLimitEnabled({ workspaceType: 'line_project' }), true)
assert.strictEqual(service.isMonthlyFeedbackLimitEnabled({ workspaceType: 'sales' }), false)
delete process.env.LINE_PROJECT_MONTHLY_FEEDBACK_LIMIT_ENABLED

console.log('salaryFeedback 纯函数测试通过')
