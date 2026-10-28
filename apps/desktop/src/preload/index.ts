import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { desktopChannels, appInfoResultSchema, windowStateSchema } from '../shared/desktop'
import type { DesktopApi, AppInfoResult } from '../shared/desktop'

// 构建要暴露给渲染进程（页面）的 API 对象
// 使用 DesktopApi 接口进行类型约束，确保暴露的方法与前端声明的类型完全一致
const desktopApi: DesktopApi = {
  /**
   * 获取应用信息
   * 封装了 IPC 通信、超时控制、主进程返回数据的校验以及异常捕获。
   */
  async getAppInfo(): Promise<AppInfoResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      // 1. 发起 IPC 调用，并附带一个随机生成的 UUID 用于请求追踪
      const request = ipcRenderer.invoke(desktopChannels.getAppInfo, {
        requestId: crypto.randomUUID(),
      })

      // 2. 构造一个“超时抛错”的 Promise
      // 如果主进程卡死或迟迟不返回，5秒后自动 reject，防止前端页面一直处于 loading 状态
      const unavailable = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('IPC timeout')), 5000)
      })

      // 3. 使用 Promise.race 竞速：谁先完成就用谁的结果（要么是主进程数据，要么是超时异常）
      // 页面不接触原始 Electron 异常；边界返回值也需要校验。
      const raw: unknown = await Promise.race([request, unavailable])

      // 4. 零信任原则：即使数据来自主进程，也要假设它可能是非法的（比如主进程代码被篡改，或版本不匹配）
      // safeParse 不会抛出异常，而是返回一个对象
      const parsed = appInfoResultSchema.safeParse(raw)

      if (!parsed.success) {
        // 如果校验失败，返回一个符合接口规范的错误结果，而不是崩溃
        return { ok: false, error: { code: 'INVALID_RESPONSE', message: '应用响应格式无效' } }
      }

      // 返回经过 Zod 验证过的安全数据
      return parsed.data
    } catch {
      // 捕获通信失败（如 IPC 通道未注册）或超时异常。
      // 注意这里用的是 catch 不带 error 参数，因为不需要把底层的错误详情（可能含敏感路径）暴露给前端。
      return { ok: false, error: { code: 'IPC_UNAVAILABLE', message: '桌面服务暂不可用，请重试' } }
    } finally {
      // 5. 无论请求成功、失败还是超时，都必须清理定时器，防止内存泄漏
      clearTimeout(timeout)
    }
  },

  /**
   * 监听窗口状态变化（如最大化、还原）
   * 返回一个取消监听的函数，方便前端组件在卸载时清理事件，防止内存泄漏。
   */
  onWindowState(listener) {
    let active = true // 用于标记当前监听器是否有效

    // 内部封装的事件处理函数
    const handler = (_event: IpcRendererEvent, raw: unknown) => {
      if (!active) return

      // 同样遵循零信任原则，校验主进程推送过来的数据格式
      const parsed = windowStateSchema.safeParse(raw)

      // 不把 Electron event 或未经校验的对象传入页面。
      // 只有当数据校验通过时，才调用前端传入的回调函数，并且传递纯净的业务数据。
      if (parsed.success) listener(parsed.data)
    }

    // 注册 IPC 监听
    ipcRenderer.on(desktopChannels.windowState, handler)

    // 返回清理函数
    // 使用同一个函数引用（handler）解除监听，重复调用取消函数也安全。
    return () => {
      if (!active) return
      active = false // 标记为失效，防止清理后依然触发回调
      ipcRenderer.removeListener(desktopChannels.windowState, handler)
    }
  },
}

// ==========================================
// 🔒 核心安全机制：安全桥接
// ==========================================
// 仅暴露命名方法，不暴露 channel、invoke、on 或 ipcRenderer 本身。
// 这样前端页面（或恶意注入的脚本）就无法绕过限制，直接向任意通道发送消息。
contextBridge.exposeInMainWorld('desktop', desktopApi)

// 打印日志，确认预加载脚本成功执行
console.info('[ElabTable] desktop bridge ready')
