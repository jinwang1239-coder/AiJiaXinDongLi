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
assert.strictEqual(service.resolveFeedbackStatus('approved', 'pending'), 'approved')
assert.strictEqual(service.resolveFeedbackStatus('approved', 'approved'), 'approved')
assert.strictEqual(service.resolveFeedbackStatus('rejected', 'approved'), 'rejected')
assert.strictEqual(service.resolveFeedbackStatus('pending', 'pending'), 'pending')
assert.strictEqual(service.getEffectiveFeedbackStatus({
  status: 'processing',
  managerReview: { status: 'approved' },
  supervisorReview: { status: 'pending' }
}), 'approved')
assert.strictEqual(service.getEffectiveFeedbackStatus({
  status: 'resolved',
  resolution: { content: '已解释' }
}), 'resolved')
assert.deepStrictEqual(service.normalizeFeedbackStatus({
  status: 'approved',
  managerReview: { status: 'approved', name: '处理人', reviewNote: '历史答复' }
}).resolution.content, '历史答复')
assert.strictEqual(service.getPendingReviewType({
  status: 'pending',
  managerReview: { status: 'pending', gridAccount: '100' },
  supervisorReview: { status: 'pending', gridAccount: '200' }
}, '200'), 'supervisor')
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: ['b2', 'b1'] }, ['b1', 'b2']), true)
assert.strictEqual(service.hasSameBatchVersion({ importBatchNos: ['b1'] }, ['b2']), false)

console.log('salaryFeedback 纯函数测试通过')
