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
  getWindow: () => BrowserWindow | null // 获取当前主窗口的闭包函数
  useDevServer: boolean // 是否处于开发模式（Vite 等开发服务器环境）
}

export function registerDesktopIpc(options: IpcOptions) {
  // 本文件被 bundle 到 dist/main/index.cjs，__dirname 指向 dist/main。
  // 动态计算出合法的渲染进程 URL：开发环境为本地服务器，生产环境为本地 index.html 文件。
  const expectedUrl = options.useDevServer
    ? 'http://127.0.0.1:5173/'
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href

  // 使用 WeakMap 存储每个窗口的状态修订号（revision）。
  // 使用 WeakMap 的好处是：当窗口被销毁时，相关引用会被垃圾回收器自动清理，防止内存泄漏。
  const revisions = new WeakMap<BrowserWindow, number>()

  // 辅助函数：读取并校验窗口当前状态
  function readState(window: BrowserWindow) {
    // 将真实状态传给 Zod Schema 进行校验，确保返回给前端的数据格式 100% 合法
    return windowStateSchema.parse({
      maximized: window.isMaximized(),
      revision: revisions.get(window) ?? 0,
    })
  }

  // 只注册一次，不放进每次创建窗口的函数中重复注册。
  // 注册获取应用信息（getAppInfo）的 IPC 通道
  ipcMain.handle(desktopChannels.getAppInfo, (event, ...args: unknown[]): AppInfoResult => {
    const window = options.getWindow()
    const frame = event.senderFrame

    // ==========================================
    // 🔒 第一层安全校验：校验请求来源
    // ==========================================
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents || // 确保请求不是来自被恶意注入的 webview 或 iframe
      !frame ||
      frame !== window.webContents.mainFrame // 确保请求来自主 Frame，而非子 Frame
    ) {
      return { ok: false, error: { code: 'FORBIDDEN', message: '请求来源不受信任' } }
    }

    try {
      // Hash 是 Vue 页面路由；其余 URL 必须精确对应已知入口。
      // 不用 startsWith 或只校验 host，避免错误接受其他路径和协议。
      // ==========================================
      // 🔒 第二层安全校验：校验 URL
      // ==========================================
      const source = new URL(frame.url)
      source.hash = '' // 去除 Hash 路由，因为前端切换页面时 Hash 会变，但基础入口不变

      // 精确比对去除 hash 后的 URL，防止前端被导航到了钓鱼页面依然能调用此 IPC
      if (source.href !== expectedUrl) {
        return { ok: false, error: { code: 'FORBIDDEN', message: '页面入口不受信任' } }
      }

      // ==========================================
      // 🔒 第三层安全校验：校验前端传入的参数
      // ==========================================
      // safeParse 不会像 parse 那样直接抛出异常导致主进程崩溃，而是返回包含 success 字段的对象
      const request = appInfoArgsSchema.safeParse(args)
      if (!request.success) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '请求参数无效' } }
      }

      // 用真实 Electron API 返回版本和窗口状态，不在界面写死。
      // 返回前再次用 Zod 校验生成的 Result（防止内部代码写错返回格式）
      return appInfoResultSchema.parse({
        ok: true,
        data: {
          version: app.getVersion(),
          platform: process.platform,
          windowState: readState(window), // 调用上面定义的状态读取函数
        },
      })
    } catch (error) {
      // ==========================================
      // 🛡️ 异常兜底与安全隔离
      // ==========================================
      // 原始异常只留在主进程，界面不接收 stack 或系统路径。
      // 这一点非常重要：如果把带有绝对路径的 error.stack 返回给前端，可能会泄露系统环境信息。
      console.error('[ipc] getAppInfo failed', error)
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: '读取应用信息失败' } }
    }
  })

  // 返回“绑定窗口事件”的函数，与全局 IPC handler 的注册分开。
  // 这种设计使得它可以在每次新建窗口时被调用，而不会重复注册 ipcMain.handle（避免重复注册报错）。
  return function bindWindowEvents(window: BrowserWindow) {
    // 初始化该窗口的版本号为 0
    revisions.set(window, 0)

    // 定义发布状态的函数：当窗口最大化/取消最大化时触发
    const publish = () => {
      // 防御性编程：发送前检查窗口是否已销毁
      if (window.isDestroyed() || window.webContents.isDestroyed()) return

      // 递增 revision，确保前端能识别出这是最新状态
      revisions.set(window, (revisions.get(window) ?? 0) + 1)

      // 推送最新状态给前端渲染进程
      window.webContents.send(desktopChannels.windowState, readState(window))
    }

    // 监听窗口事件
    window.on('maximize', publish)
    window.on('unmaximize', publish)

    // 当窗口关闭时，进行资源清理
    window.once('closed', () => {
      window.removeListener('maximize', publish)
      window.removeListener('unmaximize', publish)
      revisions.delete(window) // 从 WeakMap 中删除记录
    })
  }
}
