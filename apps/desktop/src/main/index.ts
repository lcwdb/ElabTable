// 保留已有 app、BrowserWindow、dialog，新增 session。
import { app, BrowserWindow, dialog, session } from 'electron'
import { join } from 'node:path'
// 注册受控桌面能力，业务页面不直接操作 ipcMain。
// 将 IPC 注册逻辑抽离到单独的文件中，保持入口文件干净。
import { registerDesktopIpc } from './desktop-ipc'

// 强引用当前窗口，关闭后清空；本项保持单窗口。
// 必须用全局变量强引用，否则窗口对象可能会被垃圾回收导致窗口突然消失。
let mainWindow: BrowserWindow | null = null

// 显式参数区分 Vite 加载与本地资源加载。
// 本地未打包运行也要支持构建资源，不能仅依赖 app.isPackaged。
// （例如：在本地执行 `electron .` 但加载的是打包后的静态文件时，需要依靠命令行参数来区分）
const useDevServer = !app.isPackaged && process.argv.includes('--renderer-dev')

// 进程内注册一次；闭包每次读取当前窗口，避免持有已关闭窗口。
// 调用上一步定义的 registerDesktopIpc，传入获取当前窗口的 getter 函数和开发模式标志。
// 返回的 bindDesktopWindow 用来在每次创建新窗口时，为该窗口绑定专属事件。
const bindDesktopWindow = registerDesktopIpc({
  getWindow: () => mainWindow,
  useDevServer,
})

/**
 * 全局启动异常捕获处理
 * 如果窗口创建、页面加载过程中发生致命错误，统一弹出系统级错误框并退出，避免出现“白屏无响应”的情况。
 */
function reportStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[ElabTable] startup failed', error)
  dialog.showErrorBox('ElabTable 启动失败', message)
  app.quit()
}

/**
 * 创建主窗口的核心逻辑
 */
async function createWindow(): Promise<void> {
  // 防抖：如果窗口已经存在，则直接聚焦，不再重复创建（单窗口模式）。
  if (mainWindow) {
    mainWindow.focus()
    return
  }

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // 页面准备好后再显示；启动失败另有明确反馈。
    // 设为 false 可以避免页面加载时的“白屏闪烁”，提升用户体验。
    show: false,
    title: 'ElabTable',
    webPreferences: {
      // __dirname 为构建后 dist/main，不是源码目录。
      // 指定预加载脚本，通常用来桥接 Node.js 和渲染进程。
      preload: join(__dirname, '../preload/index.cjs'),

      // ==========================================
      // 🔒 核心安全配置
      // ==========================================
      contextIsolation: true, // 开启上下文隔离，防止页面 JS 污染 Electron 内部 API
      nodeIntegration: false, // 禁用渲染进程的 Node.js 环境，防止前端直接操作本地文件
      sandbox: true, // 开启 Chromium 沙盒，进一步提升底层安全性
    },
  })

  // 记录全局窗口引用
  mainWindow = window

  // 每个原生窗口只绑定一次，在加载页面之前准备好事件。
  // 调用之前初始化 IPC 时返回的函数，让当前窗口具备监听最大/最小化等事件的能力。
  bindDesktopWindow(window)

  // 窗口关闭时，解除全局引用，防止内存泄漏。
  window.on('closed', () => {
    mainWindow = null
  })

  // 页面渲染完成，准备显示时触发。
  window.once('ready-to-show', () => {
    window.show() // 此时才真正把窗口展示给用户
  })

  // 本项没有外部网页功能，拒绝新窗口与页面主动顶层跳转。
  // Vue Hash 路由在同一文档内切换，不需要这些导航权限。
  // ==========================================
  // 🔒 导航安全防护
  // ==========================================
  // 禁止页面通过 window.open 等方式打开新的弹窗
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // 禁止页面发生顶层导航（比如点击了 <a href="https://..."> 导致整个页面跳走）
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  if (useDevServer) {
    // 只加载本项已知的本机开发入口，不接收任意 URL 参数。
    await window.loadURL('http://127.0.0.1:5173')
    // 开发模式下自动打开开发者工具，分离模式（detach）更方便调试
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 无论当前工作目录如何，始终从构建入口定位页面。
    // 使用 loadFile 加载本地打包后的 index.html
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 在创建窗口前设置当前默认 session 的权限策略，进程内只设置一次。
app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      // 当前业务不使用摄像头、麦克风、地理位置等浏览器权限。
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)
    await createWindow()
  })
  .catch(reportStartupError)

// macOS 特性：点击 Dock 图标且没有打开任何窗口时，重新创建窗口
app.on('activate', () => {
  // macOS 关闭窗口后应用可以保留；点击 Dock 再创建窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch(reportStartupError)
  }
})

// 所有窗口关闭时的处理逻辑
app.on('window-all-closed', () => {
  // macOS 使用 Cmd+Q 退出；其他平台（Windows/Linux）关闭最后窗口时退出。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
