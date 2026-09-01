/**
 * 冒烟测试：不依赖完整 dsh 运行时，用最小 ctx/exec 桩直接驱动 lib/index.js 的
 * tools/pre-execute 监听器，验证四种情形的拦截行为。
 *
 * 运行：node scripts/smoke.mjs
 */
import { apply } from '../lib/index.js'
import assert from 'node:assert/strict'

/** 构造一个最小 ctx 桩。exists=false 表示目标不存在，statThrow 模拟 stat 抛错。 */
function makeCtx({ exists = true, statThrow = false } = {}) {
  let handler = null
  const ctx = {
    fs: {
      resolve: async (p, opts) => ({ key: opts?.cwd ? `${opts.cwd}/${p}` : '/root/' + p }),
      stat: async () => {
        if (statThrow) throw new Error('boom')
        return exists ? { type: 'file' } : undefined
      },
    },
    on: (evt, fn) => { if (evt === 'tools/pre-execute') handler = fn },
  }
  return { ctx, getHandler: () => handler }
}

const next = () => ({ kind: 'allow' })
const exec = (name, file_path) => ({
  name,
  arguments: { file_path },
  agent: { session: { header: { cwd: '/sess' } } },
  signal: new AbortController().signal,
})

let passed = 0

// 情形1：write 目标已存在 -> deny，并带中文提示
{
  const { ctx, getHandler } = makeCtx({ exists: true })
  apply(ctx)
  const r = await getHandler()(exec('write', 'a.txt'), next)
  assert.equal(r.kind, 'deny')
  assert.ok(r.reason.includes('请改用 edit'))
  passed++
}

// 情形2：write 目标不存在 -> 放行 allow
{
  const { ctx, getHandler } = makeCtx({ exists: false })
  apply(ctx)
  const r = await getHandler()(exec('write', 'b.txt'), next)
  assert.equal(r.kind, 'allow')
  passed++
}

// 情形3：edit 不受影响 -> 放行 allow
{
  const { ctx, getHandler } = makeCtx({ exists: true })
  apply(ctx)
  const r = await getHandler()(exec('edit', 'a.txt'), next)
  assert.equal(r.kind, 'allow')
  passed++
}

// 情形4：stat 抛错 -> 保守放行 allow，不误伤
{
  const { ctx, getHandler } = makeCtx({ exists: true, statThrow: true })
  apply(ctx)
  const r = await getHandler()(exec('write', 'c.txt'), next)
  assert.equal(r.kind, 'allow')
  passed++
}

// 情形5：write 缺 file_path 或为空 -> 放行 allow
{
  const { ctx, getHandler } = makeCtx({ exists: true })
  apply(ctx)
  const r1 = await getHandler()({ name: 'write', arguments: {} }, next)
  const r2 = await getHandler()({ name: 'write', arguments: { file_path: '  ' } }, next)
  assert.equal(r1.kind, 'allow')
  assert.equal(r2.kind, 'allow')
  passed++
}

console.log(`[smoke] 全部 ${passed} 项断言通过 ✔`)
