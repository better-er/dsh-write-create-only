/**
 * dsh-write-create-only — 禁止 write 覆盖已存在文件。
 *
 * 唯一职责：在工具真正执行前的 tools/pre-execute 瀑布里拦下 write 调用，先 stat 目标文件——若已存在则返回 { kind: 'deny' } 直接拒绝，并提示模型改用 edit 做定向修改；目标不存在则放行，write 照常创建新文件。
 *
 * 为什么要拦而不是依赖工具本身：write 是全文件覆写，误用来改已有文件会把原内容整个冲掉，且 fs-observation-policy 只要求「先读过」并不禁止覆写。
 * 本插件把「write = 仅创建」立成硬约束，全局所有会话生效。
 *
 * 实现选型：tools/pre-execute 是异步瀑布，可安全 await ctx.fs.stat；它发生在工具执行的最前面，不与 fs/write-intent 那个单槽抢位，它已被 fs-observation-policy 占用，也不会改动 write 工具的 schema 与执行体。
 */

/** 插件名，与 cordis.patch.yml 的 name 一致，loader 诊断用。 */
export const name = 'dsh-write-create-only'

/** 必需服务：fs 由 @deepseek-ai/dsh-fs 提供，tools/pre-execute 事件来自 tools 服务。 */
export const inject = ['fs']

/** write 工具参数里的目标路径字段名 snake_case，与 write 的 schema 一致。 */
const FILE_PATH_KEY = 'file_path'

/** 目标路径的存活判定结果。 */
type TargetState = 'exists' | 'absent' | 'unknown'

/**
 * 目标是否已存在。resolve 用会话工作目录，与 write 工具实际写入的路径保持一致。
 * 任何异常，包括无效路径、stat 失败等，都返回 'unknown'，由调用方保守放行，避免误伤。
 */
async function targetState(
  ctx: any,
  exec: { agent?: { session?: { header?: { cwd?: string } } }; signal?: AbortSignal },
  filePath: string,
): Promise<TargetState> {
  try {
    const cwd = exec.agent?.session?.header?.cwd
    const target = await ctx.fs.resolve(filePath, {
      ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
      signal: exec.signal,
    })
    const info = await ctx.fs.stat(target, exec.signal)
    return info === undefined ? 'absent' : 'exists'
  } catch (error) {
    return 'unknown'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any): void {
  ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<any>): Promise<any> => {
    // 只拦 write，其余工具一律放行到瀑布下一环。
    if (exec.name !== 'write') return next()

    const args: Record<string, unknown> | null | undefined = exec.arguments
    const filePath = typeof args?.[FILE_PATH_KEY] === 'string' ? args[FILE_PATH_KEY] : undefined
    if (filePath === undefined || filePath.trim() === '') return next()

    const state = await targetState(ctx, exec, filePath)
    if (state !== 'exists') return next()

    return {
      kind: 'deny',
      reason:
        `目标文件已存在：${filePath}，write 只允许创建新文件，禁止覆盖已有内容。` +
        '请改用 edit 做定向修改；只有创建新文件时才使用 write。',
    }
  })
}
