# DSH·write 仅创建

禁止 `write` 覆盖已存在的文件：`write` 只允许创建新文件，目标已存在时在工具执行前直接拒绝并提示改用 `edit`，全局所有会话生效，防止模型用 `write` 把已有文件整体冲掉。纯 host 端插件，不碰 DSH 源码。

## 为什么

`write` 是全文件覆写。模型一旦误用 `write` 去改一个已有文件，原内容会被整段覆盖，而 dsh 默认的 `fs-observation-policy` 只要求「先读过」，并不禁止覆写。与其事后靠模型自觉，不如把「`write` = 仅创建」立成硬约束。

覆写还有第二个后果：文件没有旧内容可比，[dsh-edit-diff](https://github.com/better-er/dsh-edit-diff) 抓不到差异，只能把整份文件当成新增，差异显示退化成满屏绿色。目标已存在时直接拒绝，既留住旧内容，也留住差异显示。这不是本插件与那一件约定的，而是覆写这件事本身决定的。

## 功能

- **只拦 `write`**：`edit`、`read` 等其余工具完全不受影响。
- **目标已存在 → 拒绝**：在 `tools/pre-execute` 瀑布里对 `write` 调用先 `fs.stat` 目标，已存在则返回 `deny`，错误信息明确提示「请改用 `edit` 做定向修改；只有创建新文件时才使用 `write`」，模型看到后会改走 `edit`。
- **目标不存在 → 放行**：新建文件一切照常。
- **保守放行**：路径无效、stat 抛错等不确定情形一律放行，绝不误伤合法调用。
- **全局生效**：所有 agent 与会话统一适用。

## 宣传片

四件一起讲的宣传片，中文与日语配音两版同在一个投稿里：

| 文件四件套宣传片 · 一个核心，三个辅助 |
| :---: |
| [![文件四件套宣传片](https://i2.hdslb.com/bfs/archive/8a1e21d2afe4c23f587ed11bd94ef9172ea5651e.jpg)](https://www.bilibili.com/video/BV1EUar6YEp3/) |

## 安装

**从 GitHub 安装**：源码在 `src/`，`lib/` 不入仓库，安装时 npm 会触发 `prepare` 脚本现场构建。

```powershell
dsh plugin --profile web add github:better-er/dsh-write-create-only
```

**从 npm 安装**：包内已含构建产物 `lib/index.js`，安装时不再构建。

```powershell
dsh plugin --profile web add dsh-write-create-only
```

两种方式装完都会自动挂载，重启 DSH web 后启用，无需手工编辑任何文件。

## 卸载

```powershell
dsh plugin --profile web remove dsh-write-create-only
```

彻底移除，重启 DSH web 后不再加载。

## 原理

dsh 的每个工具在执行前都会走 `tools/pre-execute` 这个**异步瀑布**，每个监听器按序决定 allow / ask / deny。本插件注册一个全局监听器：

- 只对 `exec.name === 'write'` 生效；
- 取出 `exec.arguments.file_path`，用会话工作目录 `ctx.fs.resolve` 成绝对目标，再 `ctx.fs.stat`；
- stat 返回非空即目标已存在，返回 `{ kind: 'deny', reason }` 拒绝本次调用；
- 其余情况一律 `return next()` 放行到瀑布下一环。

选择 `tools/pre-execute` 而不是 `fs/write-intent`，是因为后者是单槽瀑布且已被默认的 `fs-observation-policy` 占用；而 `tools/pre-execute` 是多监听器瀑布，位置在工具执行最前面，既不影响 `write` 的 schema，也不与现有策略抢位。

## 开发与验证

```powershell
pnpm install
pnpm build        # 产出 lib/index.js
node scripts/smoke.mjs   # 无运行时冒烟验证：5 项断言覆盖拦截/放行/容错
```

## License

[MIT](./LICENSE)
