# 第 06 项：类型化 Bridge 与 IPC

日期：2026-10-28。状态：教程已准备，等待你手写与验收。

## 目标与边界

05 已由你反馈验收完成。本项实现两项真实能力：读取应用版本与运行平台，订阅窗口最大化状态。

通信链路：Vue → window.desktop → preload → IPC → main。返回值与事件沿相反方向流动。Vue 不导入 electron，不直接使用 ipcRenderer；main 不信任仅靠 TypeScript 标注的输入。

AI 只编写 Markdown。你创建文件、运行命令、验证并提交 Git。本教程不建设数据库、登录或 Agent 工具，不暴露通用 invoke、SQL、文件路径或 shell。

命令从仓库根目录运行，路径也相对该目录。完整文件按“新建/替换”操作；片段按指定位置合并，不能重复 export 或重复注册 handler。关键代码带注释，JSON 片段不添加非法注释。

## 第一步：安装边界校验依赖

2026-10-28 查询选定 Zod 4.6.7。安装到 desktop 的运行依赖，因为 main、preload 的边界校验都需要它：

```bash
# 复制命令执行，交互 zsh 中跳过注释行。
pnpm --filter @elabtable/desktop add -E zod@4.6.7
```

复用原有 esbuild --bundle，Zod 和共享协议会进入 main/preload 构建；electron 仍 external。不要把 zod 改成 external 后让 sandbox preload 在运行时 require 它。

本次协议仅由一个桌面应用使用，放 src/shared。等云端或第二个包实际复用时，再评估 packages/contracts，避免提前维护空包。

## 第二步：定义共享协议

新建 `apps/desktop/src/shared/desktop.ts`，完整内容：

```ts
import { z } from 'zod'

// channel 仅供 main/preload 使用；界面通过命名 API 调用。
export const desktopChannels = {
  getAppInfo: 'desktop:get-app-info',
  windowState: 'desktop:window-state',
} as const

// 请求必须恰好包含一个对象参数，未知字段和多余参数都拒绝。
export const appInfoArgsSchema = z.tuple([z.strictObject({ requestId: z.uuid() })])

export const windowStateSchema = z.strictObject({
  maximized: z.boolean(),
  // 每个原生窗口自己的递增序号，用于避免旧快照覆盖新事件。
  revision: z.number().int().nonnegative(),
})

export const appInfoSchema = z.strictObject({
  version: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  windowState: windowStateSchema,
})

export const appInfoResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: appInfoSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        'FORBIDDEN',
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'IPC_UNAVAILABLE',
        'INVALID_RESPONSE',
      ]),
      message: z.string(),
    }),
  }),
])

// 类型从运行时 Schema 推导，避免接口与校验规则各写一套。
export type WindowState = z.infer<typeof windowStateSchema>
export type AppInfoResult = z.infer<typeof appInfoResultSchema>

export interface DesktopApi {
  getAppInfo(): Promise<AppInfoResult>
  onWindowState(listener: (state: WindowState) => void): () => void
}
```

TypeScript 在开发时检查写法，Zod 在运行时校验真实输入。strictObject 不默默丢弃未知字段；tuple 校验参数个数。请求 ID 用于定位请求，本项没有写操作，不把请求 ID 当作已经实现幂等存储。

shared 只放协议与 Schema，不导入 Electron、Vue、Pinia、数据库或凭据。main/preload 使用运行时校验，renderer 只导入类型，避免把系统能力引入页面。

## 第三步：实现主进程处理与来源校验

新建 `apps/desktop/src/main/desktop-ipc.ts`，完整内容：

```ts
import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  desktopChannels,
  appInfoArgsSchema,
  appInfoResultSchema,
  windowStateSchema,
} from '../shared/desktop'
import type { AppInfoResult } from '../shared/desktop'

interface IpcOptions {
  getWindow: () => BrowserWindow | null
  useDevServer: boolean
}

export function registerDesktopIpc(options: IpcOptions) {
  // 本文件被 bundle 到 dist/main/index.cjs，__dirname 指向 dist/main。
  const expectedUrl = options.useDevServer
    ? 'http://127.0.0.1:5173/'
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const revisions = new WeakMap<BrowserWindow, number>()

  function readState(window: BrowserWindow) {
    return windowStateSchema.parse({
      maximized: window.isMaximized(),
      revision: revisions.get(window) ?? 0,
    })
  }

  // 只注册一次，不放进每次创建窗口的函数中重复注册。
  ipcMain.handle(desktopChannels.getAppInfo, (event, ...args: unknown[]): AppInfoResult => {
    const window = options.getWindow()
    const frame = event.senderFrame

    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      !frame ||
      frame !== window.webContents.mainFrame
    ) {
      return { ok: false, error: { code: 'FORBIDDEN', message: '请求来源不受信任' } }
    }

    try {
      // Hash 是 Vue 页面路由；其余 URL 必须精确对应已知入口。
      // 不用 startsWith 或只校验 host，避免错误接受其他路径和协议。
      const source = new URL(frame.url)
      source.hash = ''
      if (source.href !== expectedUrl) {
        return { ok: false, error: { code: 'FORBIDDEN', message: '页面入口不受信任' } }
      }

      const request = appInfoArgsSchema.safeParse(args)
      if (!request.success) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '请求参数无效' } }
      }

      // 用真实 Electron API 返回版本和窗口状态，不在界面写死。
      return appInfoResultSchema.parse({
        ok: true,
        data: {
          version: app.getVersion(),
          platform: process.platform,
          windowState: readState(window),
        },
      })
    } catch (error) {
      // 原始异常只留在主进程，界面不接收 stack 或系统路径。
      console.error('[ipc] getAppInfo failed', error)
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: '读取应用信息失败' } }
    }
  })

  // 返回“绑定窗口事件”的函数，与全局 IPC handler 的注册分开。
  return function bindWindowEvents(window: BrowserWindow) {
    revisions.set(window, 0)
    const publish = () => {
      if (window.isDestroyed() || window.webContents.isDestroyed()) return
      revisions.set(window, (revisions.get(window) ?? 0) + 1)
      window.webContents.send(desktopChannels.windowState, readState(window))
    }

    window.on('maximize', publish)
    window.on('unmaximize', publish)
    window.once('closed', () => {
      window.removeListener('maximize', publish)
      window.removeListener('unmaximize', publish)
      revisions.delete(window)
    })
  }
}
```

保护分三层：当前窗口、顶层 frame、准确的页面入口。不能只检查“参数是字符串”就让任意页面获得系统能力。窗口重新创建时更换 getWindow 的返回值，不重复注册全局 handler。

### 将模块接入 main/index.ts

1. 在 import 区域补充：

```ts
// 注册受控桌面能力，业务页面不直接操作 ipcMain。
import { registerDesktopIpc } from './desktop-ipc'
```

2. 保留 mainWindow 与 useDevServer 的原声明，在二者之后补充：

```ts
// 进程内注册一次；闭包每次读取当前窗口，避免持有已关闭窗口。
const bindDesktopWindow = registerDesktopIpc({
  getWindow: () => mainWindow,
  useDevServer,
})
```

3. 在 createWindow 中，mainWindow = window 后紧接着加入：

```ts
// 每个原生窗口只绑定一次，在加载页面之前准备好事件。
bindDesktopWindow(window)
```

其他生命周期、loadURL/loadFile、导航限制与 webPreferences 全部保留，不能为了调用 IPC 关闭 sandbox 或 contextIsolation。

## 第四步：实现有限 preload bridge

替换 `apps/desktop/src/preload/index.ts` 为完整内容：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { desktopChannels, appInfoResultSchema, windowStateSchema } from '../shared/desktop'
import type { DesktopApi, AppInfoResult } from '../shared/desktop'

const desktopApi: DesktopApi = {
  async getAppInfo(): Promise<AppInfoResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const request = ipcRenderer.invoke(desktopChannels.getAppInfo, {
        requestId: crypto.randomUUID(),
      })
      const unavailable = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('IPC timeout')), 5000)
      })

      // 页面不接触原始 Electron 异常；边界返回值也需要校验。
      const raw: unknown = await Promise.race([request, unavailable])
      const parsed = appInfoResultSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'INVALID_RESPONSE', message: '应用响应格式无效' } }
      }
      return parsed.data
    } catch {
      return { ok: false, error: { code: 'IPC_UNAVAILABLE', message: '桌面服务暂不可用，请重试' } }
    } finally {
      clearTimeout(timeout)
    }
  },

  onWindowState(listener) {
    let active = true
    const handler = (_event: IpcRendererEvent, raw: unknown) => {
      if (!active) return
      const parsed = windowStateSchema.safeParse(raw)
      // 不把 Electron event 或未经校验的对象传入页面。
      if (parsed.success) listener(parsed.data)
    }
    ipcRenderer.on(desktopChannels.windowState, handler)

    // 使用同一个函数引用解除监听，重复调用取消函数也安全。
    return () => {
      if (!active) return
      active = false
      ipcRenderer.removeListener(desktopChannels.windowState, handler)
    }
  },
}

// 仅暴露命名方法，不暴露 channel、invoke、on 或 ipcRenderer 本身。
contextBridge.exposeInMainWorld('desktop', desktopApi)
console.info('[ElabTable] desktop bridge ready')
```

本项超时只结束界面等待，不取消已经送达 main 的请求；当前能力只读，后续写操作必须另行设计取消与幂等，不能直接照搬为“超时后自动重发”。

preload 中的 crypto 是 Chromium Web Crypto，console、计时器来自页面环境；不要导入 node:crypto、fs、path 来绕过 sandbox。

## 第五步：声明界面类型

新建 `apps/desktop/src/renderer/desktop.d.ts`：

```ts
import type { DesktopApi } from '../shared/desktop'

declare global {
  interface Window {
    // 浏览器预览没有 preload，必须允许不存在。
    desktop?: DesktopApi
  }
}

export {}
```

renderer 原有 include 的 **/*.ts 能匹配 .d.ts，不需要额外扩展配置。此文件只提供类型，不会创造 window.desktop；真正对象由 preload 注入。

main/preload 的共享协议通过 import 被检查，无需把 shared 塞入所有 include 或把 Node 类型引入 renderer。

## 第六步：在设置页使用真实能力

替换 `apps/desktop/src/renderer/features/settings/SettingsView.vue`：

共享协议相对路径从 features/settings 上三级回到 src。以下是一份完整文件：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppearanceStore } from '../../app/stores/appearance'
import type { WindowState } from '../../../shared/desktop'

// 当前页面生命周期中，bridge 是否存在不会动态改变。
const hasDesktop = Boolean(window.desktop)
const appearance = useAppearanceStore()
const version = ref('')
const platform = ref('')
const maximized = ref(false)
const loading = ref(false)
const errorMessage = ref('')
let lastRevision = -1
let active = true
let unsubscribe: (() => void) | undefined

function applyWindowState(state: WindowState) {
  // 查询结果与事件可能交错；只应用不旧于当前状态的快照。
  if (state.revision < lastRevision) return
  lastRevision = state.revision
  maximized.value = state.maximized
}

async function loadAppInfo() {
  const api = window.desktop
  if (!api || loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.getAppInfo()
    if (!active) return
    if (result.ok) {
      version.value = result.data.version
      platform.value = result.data.platform
      applyWindowState(result.data.windowState)
    } else {
      errorMessage.value = `${result.error.code}：${result.error.message}`
    }
  } catch {
    // bridge 被卸载等极端情况也不产生未处理 Promise。
    if (active) errorMessage.value = '桌面连接异常，请重试'
  } finally {
    if (active) loading.value = false
  }
}

onMounted(() => {
  const api = window.desktop
  if (!api) return
  // 先订阅再查询快照，避免初始化期间漏掉窗口变化。
  unsubscribe = api.onWindowState(applyWindowState)
  void loadAppInfo()
})

onUnmounted(() => {
  active = false
  unsubscribe?.()
})
</script>

<template>
  <section>
    <h1>设置</h1>
    <!-- 保留已有的真实布局偏好，不为 IPC 删除原能力。 -->
    <button type="button" :aria-pressed="appearance.compact" @click="appearance.toggleCompact">
      紧凑布局：{{ appearance.compact ? '开启' : '关闭' }}
    </button>
    <p>布局偏好当前只保存在内存，刷新后恢复默认值。</p>

    <h2>应用信息</h2>
    <template v-if="hasDesktop">
      <p v-if="loading" role="status">正在读取应用信息…</p>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <dl v-if="version">
        <dt>版本</dt>
        <dd>{{ version }}</dd>
        <dt>平台</dt>
        <dd>{{ platform }}</dd>
        <dt>窗口最大化</dt>
        <dd>{{ maximized ? '是' : '否' }}</dd>
      </dl>
      <button type="button" :disabled="loading" @click="loadAppInfo">刷新应用信息</button>
    </template>
    <p v-else>应用信息需要在桌面客户端中查看。</p>
  </section>
</template>
```

hasDesktop 在脚本中判断能力是否存在，模板使用该局部变量；不要在模板直接引用全局 window。

**检查点**：Electron 设置页显示 app.getVersion 返回的版本、darwin 平台及真实窗口状态。纯浏览器预览显示能力提示，不编造版本，也不因 bridge 缺失白屏。

## 第七步：让开发脚本监听共享协议

先确保 src/shared 目录已在第二步创建。在 dev.mjs 的目录监听循环中，将原数组替换为：

```js
// 仅替换原 for 行中的目录数组，原循环体完整保留。
;['src/main', 'src/preload', 'src/shared']
```

协议同时影响 main/preload，修改后必须重建并重启桌面。不要用空循环覆盖原监听逻辑。renderer 的变化仍由 Vite 处理。

退出再启动 pnpm dev，确保修改过的开发脚本生效。shared 导入会由 esbuild bundle，不改变 .cjs、external:electron 或 sandbox 配置。

## 第八步：补充 preload ESLint 全局

根 eslint.config.js 中原有 preload 的 globals 对象替换为：

```js
// 仅声明本项 sandbox preload 使用的 Web API 名称，不加入完整 Node 全局。
globals: {
  console: 'readonly',
  crypto: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
},
```

保留原 files 范围和其他配置。这里仅影响静态规则，不是运行时赋权。shared 不加浏览器或 Node 全局，它应保持与环境无关。

## 第九步：检查与验收

```bash
# 先做只读格式检查；若需 format 修正，先审阅文件范围。
pnpm format:check
pnpm check
pnpm dev
```

按下面的实际行为验收，不只看页面能启动：

1. 设置页读取真实版本与平台，刷新按钮可用。
2. 双击窗口标题栏触发最大化/还原，状态随原生 maximize/unmaximize 事件变化。macOS 绿色按钮常进入全屏，全屏不是最大化，不用它替代本项验收；系统若把双击设为最小化，改用系统支持的缩放动作或在主进程开发调试中调用当前窗口的 maximize/unmaximize 验证，不为此开放通用系统执行接口。
3. 首页与设置反复切换，事件没有重复处理。需要观察时可临时在 applyWindowState 中 console.count，检查后移除；初始查询也会调用该函数，不把它误判成重复事件。
4. 刷新页面、关闭后 Dock 重开，信息仍可查询，不出现重复 handler 注册错误。
5. 修改 shared 文件，05 的脚本自动重建并重启，应用恢复。
6. 浏览器 dev:renderer 或 preview:renderer 无 bridge 时正常提示。

### 验证错误边界

- 参数：临时将 preload 请求中的 requestId 改为 'invalid'，重启后页面应显示 INVALID_ARGUMENT；恢复 crypto.randomUUID 后正常。只改这一个测试值，不注释掉主进程校验。
- 来源：临时将 main 的开发 expectedUrl 改成另一个完整路径，页面应显示 FORBIDDEN；恢复后正常。这验证拒绝分支，不等价于完成完整攻击测试。
- 订阅：切换离开设置页，onUnmounted 执行取消函数；重新进入仅新增一个订阅。取消函数只能移除自己注册的 handler，不能 removeAllListeners 干扰其他页面。
- 响应：main 不向页面抛原始异常；preload 对未知返回格式给出 INVALID_RESPONSE，对不可用或超时给出 IPC_UNAVAILABLE。

测试结束恢复全部临时改动，再完成本地构建回归：

```bash
# 先结束 pnpm dev，确保不依赖 Vite，再验证 file 页面来源。
pnpm check
pnpm build:desktop
pnpm start:electron:local
```

最后退出应用并运行锁文件检查：

```bash
# 确认 Zod 依赖与锁文件一致。
pnpm install --frozen-lockfile
```

- [ ] 请求与返回值有运行时 Schema，界面方法有明确类型。
- [ ] IPC 只接受当前窗口顶层可信入口，不暴露通用 channel 调用。
- [ ] 正常与错误分支均有清晰反馈，界面不接收原始异常栈。
- [ ] 查询快照不覆盖较新的窗口事件。
- [ ] 订阅可取消，切换页面与窗口重建不累积监听或 handler。
- [ ] 开发模式、本地构建模式、纯浏览器预览分别验证。
- [ ] 完整检查、构建与锁文件安装通过，临时测试改动已恢复。

## 文件清单与下一项

| 文件                                            | 操作                                 |
| ----------------------------------------------- | ------------------------------------ |
| src/shared/desktop.ts                           | 新建协议、Schema 和 bridge 类型      |
| src/main/desktop-ipc.ts                         | 新建来源校验、handler 和窗口事件绑定 |
| src/main/index.ts                               | 注册一次 handler，每窗口绑定一次事件 |
| src/preload/index.ts                            | 替换为有限 bridge                    |
| src/renderer/desktop.d.ts                       | 新增可选 bridge 类型声明             |
| src/renderer/features/settings/SettingsView.vue | 使用真实数据与可取消订阅             |
| scripts/dev.mjs                                 | 为 shared 加入监听                   |
| 根 eslint.config.js                             | 补 preload 实际使用的 Web API 名称   |
| desktop package.json、pnpm-lock.yaml            | 由 Zod 安装命令更新                  |

表中 src、scripts 均位于 apps/desktop。07 再处理打包配置、生产 CSP、安装包安全与资源收集。06 不提前开放后续能力；全部验收后更新规划，第一阶段最终提交仍在 07 完成时执行。

本教程只做文档编写与静态审阅，尚未代你安装或运行集成验证。操作中遇到错误，反馈完整命令、文件路径与提示再继续。

## 官方参考

- [Electron 上下文隔离与 contextBridge](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron 安全建议与发送方校验](https://www.electronjs.org/docs/latest/tutorial/security)
- [Zod Schema API](https://zod.dev/api)
