import { watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { build } from 'esbuild'
import electronPath from 'electron'

// 所有路径锚定脚本自身，避免依赖终端当前目录。
const desktopDir = fileURLToPath(new URL('../', import.meta.url))
const watchers = []
const expectedStops = new WeakSet()
let server
let electronProcess
let debounceTimer
let revision = 0
let stopping = false
let shutdownTask

// 将构建与重启串行化，防止快速保存时同时启动多份 Electron。
let buildQueue = Promise.resolve()

async function stopElectron() {
  const child = electronProcess
  if (!child) return

  if (child.exitCode !== null || child.signalCode !== null) {
    if (electronProcess === child) electronProcess = undefined
    return
  }

  expectedStops.add(child)

  await new Promise((resolveStop, rejectStop) => {
    let forceTimer
    const finish = (error) => {
      clearTimeout(killTimer)
      clearTimeout(forceTimer)
      child.removeListener('close', onClose)
      if (error) rejectStop(error)
      else resolveStop()
    }
    const onClose = () => finish()

    // 先请求终止，仍未退出再结束这一份子进程；不用 killall。
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL')
      forceTimer = setTimeout(() => {
        finish(new Error('Electron 未能退出，请检查本次进程'))
      }, 2000)
    }, 3000)

    child.once('close', onClose)
    child.kill('SIGTERM')
  })

  if (electronProcess === child) electronProcess = undefined
}

function startElectron() {
  // 某些编辑器带有此环境变量，不能让桌面可执行文件按纯 Node 模式运行。
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  // electronPath 是 Electron 可执行文件路径，直接启动它，不增加 shell 层。
  const child = spawn(electronPath, ['.', '--renderer-dev'], {
    cwd: desktopDir,
    env,
    stdio: 'inherit',
    shell: false,
  })
  electronProcess = child

  child.once('error', (error) => {
    // 启动失败也要回收 Vite 和监听器。
    if (electronProcess === child) electronProcess = undefined
    console.error('[dev] Electron 启动失败', error)
    void shutdown(1)
  })

  child.once('exit', (code, signal) => {
    if (electronProcess === child) electronProcess = undefined
    if (expectedStops.has(child) || stopping) return

    // Cmd+Q 是主动退出，不立即重新拉起；崩溃也结束本轮开发会话。
    console.info(`[dev] Electron 已退出：code=${code}, signal=${signal}`)
    void shutdown(code === 0 ? 0 : 1)
  })
}

async function rebuildAndRestart(currentRevision) {
  if (stopping || currentRevision !== revision) return
  console.info('[dev] 编译 main 与 preload…')

  const common = {
    absWorkingDir: desktopDir,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    external: ['electron'],
    logLevel: 'info',
  }

  // 等两个构建都结束；一个失败时也不能让另一个在后台继续写文件后重启。
  const results = await Promise.allSettled([
    build({
      ...common,
      entryPoints: ['src/main/index.ts'],
      outfile: 'dist/main/index.cjs',
      tsconfig: 'tsconfig.main.json',
    }),
    build({
      ...common,
      entryPoints: ['src/preload/index.ts'],
      outfile: 'dist/preload/index.cjs',
      tsconfig: 'tsconfig.preload.json',
    }),
  ])

  if (results.some((result) => result.status === 'rejected')) {
    // esbuild 已打印具体错误；保留现有窗口，修正并保存后继续尝试。
    console.error('[dev] 构建失败，本次不重启；修正代码后保存以重试')
    return
  }

  if (stopping || currentRevision !== revision) return
  await stopElectron()

  // 等待旧进程退出期间可能又保存了代码，旧结果不再启动。
  if (stopping || currentRevision !== revision) return
  startElectron()
}

function requestBuild() {
  if (stopping) return
  const currentRevision = ++revision
  clearTimeout(debounceTimer)

  // 合并短时间内的保存事件；真正的构建仍按队列串行执行。
  debounceTimer = setTimeout(() => {
    buildQueue = buildQueue
      .then(() => rebuildAndRestart(currentRevision))
      .catch((error) => {
        console.error('[dev] 开发流程失败', error)
        void shutdown(1)
      })
  }, 150)
}

async function boot() {
  server = await createServer({
    configFile: resolve(desktopDir, 'vite.config.ts'),
    // JS API 从根仓库执行时也不误用根目录下的 src/renderer。
    root: resolve(desktopDir, 'src/renderer'),
  })
  if (stopping) return

  // listen 返回后才安排桌面构建与启动，不用猜固定等待几秒。
  await server.listen()
  if (stopping) return
  server.printUrls()

  for (const relativePath of ['src/main', 'src/preload', 'src/shared']) {
    const watcher = watch(resolve(desktopDir, relativePath), { recursive: true }, requestBuild)
    watcher.on('error', (error) => {
      console.error('[dev] 文件监听失败', error)
      void shutdown(1)
    })
    watchers.push(watcher)
  }

  // 类型配置改变也会影响编译选项，监听文件名而非单独文件 inode。
  const configNames = new Set(['tsconfig.main.json', 'tsconfig.preload.json'])
  const configWatcher = watch(desktopDir, (_event, filename) => {
    if (filename && configNames.has(filename.toString())) requestBuild()
  })
  configWatcher.on('error', (error) => {
    console.error('[dev] 配置监听失败', error)
    void shutdown(1)
  })
  watchers.push(configWatcher)

  requestBuild()
}

function shutdown(exitCode = 0) {
  // 信号、退出、错误可能几乎同时发生，只执行一次清理。
  if (shutdownTask) return shutdownTask
  stopping = true
  clearTimeout(debounceTimer)

  shutdownTask = (async () => {
    // 等待启动完成，避免创建中的服务逃过清理。
    await startup.catch(() => {})
    for (const watcher of watchers) watcher.close()
    await buildQueue

    // 某项关闭失败也继续尝试关闭另一项。
    const results = await Promise.allSettled([
      stopElectron(),
      server ? server.close() : Promise.resolve(),
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[dev] 清理失败', result.reason)
        exitCode = 1
      }
    }

    console.info('[dev] 开发会话已结束')
    process.exitCode = exitCode
  })()

  return shutdownTask
}

const startup = boot()
startup.catch((error) => {
  console.error('[dev] 启动失败', error)
  void shutdown(1)
})

// Ctrl+C 或外部正常终止时关闭本次创建的资源。
process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))
