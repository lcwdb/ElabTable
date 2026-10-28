# 第 04 项：启动 Electron 窗口

日期：2026-10-23。状态：教程已准备，待你手写、运行与验收。

## 目标与边界

将第 03 项的 Vue 页面放入 Electron 窗口，并验证两条加载路径：

- 开发：Electron 加载本机 Vite 服务。
- 本地构建：停止 Vite 后，Electron 仍可加载 dist 中的页面。

本项采用手动双终端，理解每条命令。05 再写自动启动与监听重启脚本；06 再设计业务 IPC；07 才制作安装包。这里的“本地构建启动”不是已经完成安装包发布。

AI 只维护 Markdown；工程文件与终端命令由你操作。下面路径相对仓库根目录，命令默认在仓库根目录运行。先看一个步骤，写完验证后再继续。

代码只在关键逻辑处注释。package.json 必须是合法 JSON，解释写在块外；tsconfig 可使用 JSONC。脚本字段片段需要合并到现有对象，保留已有字段。

## 第一步：理解进程和模块格式

| 部分     | 本项职责                             | 源码                 | 输出格式               |
| -------- | ------------------------------------ | -------------------- | ---------------------- |
| main     | 创建窗口、选择页面路径、管理应用退出 | src/main/index.ts    | dist/main/index.cjs    |
| preload  | 验证预加载脚本执行，暂不暴露业务能力 | src/preload/index.ts | dist/preload/index.cjs |
| renderer | 复用已有 Vue 页面                    | src/renderer         | dist/renderer          |

本项选用 main 和 preload 均构建为 CommonJS，并明确使用 .cjs 后缀。根包与 desktop 的 type: module 保持不变，.cjs 会明确按 CommonJS 加载。

源码仍写 import/export，esbuild 将 main/preload 编译成 CommonJS；类型检查采用 Bundler 规则，因为源码会先经过打包器，不直接交给 Node 执行。

main 可以使用 Node API；sandbox preload 只有受限的 Electron/Node 能力，不能假定完整 Node 环境可用。sandbox preload 不支持直接使用 ESM import，必须构建后再加载。

## 第二步：安装 Electron 与构建工具

2026-10-23 查询选定：

| 工具        | 版本    | 安装位置         |
| ----------- | ------- | ---------------- |
| electron    | 45.0.0  | desktop 开发依赖 |
| esbuild     | 0.28.2  | desktop 开发依赖 |
| @types/node | 24.19.2 | desktop 开发依赖 |

查询到 Electron 的安装工具要求 Node >=22.12.0，esbuild 要求 Node >=18，当前 Node 24.19.0 满足。Electron 自带运行时与本机 Node 不同，不能用安装包 engines 推断内置 Node 版本。

本教程只使用常见 Node API，@types/node 24 为当前开发基线，后续升级 Electron 时应核验实际运行时能力。不要另装 @types/electron，Electron 包自带类型。

```bash
# 安装到 desktop，准确版本写入其 package.json。
pnpm --filter @elabtable/desktop add -DE electron@45.0.0 esbuild@0.28.2 @types/node@24.19.2

# 查询工具是否可以实际运行，不只看依赖列表。
pnpm --filter @elabtable/desktop exec esbuild --version
pnpm --filter @elabtable/desktop exec electron --version
```

预期分别显示 0.28.2、v45.0.0。Electron 的可执行文件可能在首次运行时下载；下载成功才算验证通过。

如果提示依赖构建脚本被阻止，先阅读输出，按当前 pnpm 提示审阅需要执行的包，可用 pnpm approve-builds 选择确需执行脚本的依赖，再按提示 rebuild。不要一次放行所有包，也不要把“没有安装脚本提示”视为异常。

如果下载失败，保留完整错误；区分 npm 包获取、Electron 二进制下载与脚本策略问题，不关闭 TLS 校验或设置未知镜像绕过。pnpm 若自动修改工作区发布年龄例外，也应审阅该变更。

**检查点**：两个工具版本均可查询，无待处理的安装或运行错误。保持当前 nodeLinker，打包依赖收集方式在 07 结合打包器验证，不提前随意更换整仓安装布局。

## 第三步：建立 main 与 preload 类型配置

新建 `apps/desktop/tsconfig.main.json`：

```jsonc
{
  // 继承 strict 与 noEmit；源码由 esbuild 构建，不由 tsc 输出。
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    // main 可使用 Node API，与 renderer 的浏览器环境分开。
    "types": ["node"],
  },
  "include": ["src/main/**/*.ts"],
}
```

新建 `apps/desktop/tsconfig.preload.json`：

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // preload 位于页面上下文，也可能需要 DOM 类型。
    "lib": ["ES2022", "DOM"],
    "types": [],
  },
  "include": ["src/preload/**/*.ts"],
}
```

类型声明不是权限系统；即使依赖类型间接提供某些名称，也不能证明 sandbox 运行时支持它们。本项 preload 只调用 console，不使用 fs、path、任意 require 或 shell。

保留现有 renderer tsconfig.json 和工具 tsconfig.tools.json，不把 Node 类型加进 renderer。

## 第四步：编写 preload

新建 `apps/desktop/src/preload/index.ts`：

```ts
// 本项先验证脚本加载，业务 bridge 与 IPC 在 06 实现。
console.info('[ElabTable] preload loaded')

// 让本文件作为模块参与检查，不向其他文件注入全局声明。
export {}
```

这里无需为了证明连接而暴露 ipcRenderer、通用文件访问或无用的演示接口。之后在 Electron 开发者工具的控制台确认日志即可。

## 第五步：编写主进程

新建 `apps/desktop/src/main/index.ts`：

```ts
import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'

// 强引用当前窗口，关闭后清空；本项保持单窗口。
let mainWindow: BrowserWindow | null = null

// 显式参数区分 Vite 加载与本地资源加载。
// 本地未打包运行也要支持构建资源，不能仅依赖 app.isPackaged。
const useDevServer = !app.isPackaged && process.argv.includes('--renderer-dev')

function reportStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[ElabTable] startup failed', error)
  dialog.showErrorBox('ElabTable 启动失败', message)
  app.quit()
}

async function createWindow(): Promise<void> {
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
    show: false,
    title: 'ElabTable',
    webPreferences: {
      // __dirname 为构建后 dist/main，不是源码目录。
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow = window
  window.on('closed', () => {
    mainWindow = null
  })
  window.once('ready-to-show', () => {
    window.show()
  })

  // 本项没有外部网页功能，拒绝新窗口与页面主动顶层跳转。
  // Vue Hash 路由在同一文档内切换，不需要这些导航权限。
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  if (useDevServer) {
    // 只加载本项已知的本机开发入口，不接收任意 URL 参数。
    await window.loadURL('http://127.0.0.1:5173')
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 无论当前工作目录如何，始终从构建入口定位页面。
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow).catch(reportStartupError)

app.on('activate', () => {
  // macOS 关闭窗口后应用可以保留；点击 Dock 再创建窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch(reportStartupError)
  }
})

app.on('window-all-closed', () => {
  // macOS 使用 Cmd+Q 退出；其他平台关闭最后窗口时退出。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

窗口和路由相互独立：Electron 管原生窗口，Vue Router 管窗口内部页面。应用名和正式图标在打包时完善，本项 macOS 菜单或 Dock 显示 Electron 默认名称不代表你的 Vue 页面错误。

loadURL/loadFile 失败会被捕获并显示错误；不会永远留在不可见窗口。preload 自身异常仍需查看控制台，页面能出现并不证明 preload 成功。

## 第六步：配置构建与启动命令

在 desktop 的 package.json 根对象新增 main 字段，保留 type: module：

```json
"main": "dist/main/index.cjs"
```

main 告诉 electron . 从哪里启动。不要把它误写在 scripts 内，也不要指向未编译的 src/main/index.ts。

将 desktop 的 scripts 整理为以下内容，保留其他已存在且仍有用途的脚本：

```json
"scripts": {
  "dev:renderer": "vite --config vite.config.ts",
  "build:renderer": "vite build --config vite.config.ts",
  "preview:renderer": "vite preview --config vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
  "build:main": "esbuild src/main/index.ts --bundle --platform=node --format=cjs --target=es2022 --external:electron --outfile=dist/main/index.cjs --tsconfig=tsconfig.main.json",
  "build:preload": "esbuild src/preload/index.ts --bundle --platform=node --format=cjs --target=es2022 --external:electron --outfile=dist/preload/index.cjs --tsconfig=tsconfig.preload.json",
  "build:electron": "pnpm build:main && pnpm build:preload",
  "start:electron:dev": "electron . --renderer-dev",
  "start:electron:local": "electron .",
  "build": "pnpm build:electron && pnpm build:renderer",
  "typecheck": "vue-tsc --project tsconfig.json && tsc --project tsconfig.tools.json && tsc --project tsconfig.main.json && tsc --project tsconfig.preload.json"
}
```

| 参数或命令           | 含义                                                          |
| -------------------- | ------------------------------------------------------------- |
| --bundle             | 合并入口导入的代码，preload 避免运行时加载本地碎片            |
| --platform=node      | 按 Node 类环境构建；不代表 sandbox preload 具有完整 Node 权限 |
| --format=cjs 与 .cjs | 明确输出 CommonJS，与 type: module 共存                       |
| --external:electron  | Electron API 由 Electron 运行时提供，不打包进产物             |
| --target=es2022      | 使用本项代码所需的保守语法目标，不等于 Node 版本号            |
| build:electron       | 只构建 main/preload，不清空 renderer 输出                     |
| start:electron:dev   | 连接已启动的 Vite，不替你启动服务或构建                       |
| start:electron:local | 加载已有的本地页面构建，不启动 Vite                           |
| build                | 先构建桌面入口，再构建 renderer；类型检查仍单独执行           |

esbuild 只转换源码，不做 TypeScript 类型检查，不能用构建成功替代 pnpm check。当前 main 没有原生依赖；后续 SQLite 的 external 和打包处理需另行配置。

在根 package.json 的 scripts 中新增转发项，保留现有检查和 renderer 命令：

```json
"build:electron": "pnpm --filter @elabtable/desktop build:electron",
"start:electron:dev": "pnpm --filter @elabtable/desktop start:electron:dev",
"start:electron:local": "pnpm --filter @elabtable/desktop start:electron:local",
"build:desktop": "pnpm --filter @elabtable/desktop build"
```

## 第七步：扩展 ESLint 环境

根 eslint.config.js 的现有 renderer 浏览器环境块后、最终 prettier 之前，插入：

```js
// 只给主进程声明 Node 全局，不把权限或类型扩散到 renderer。
{
  files: ['apps/desktop/src/main/**/*.ts'],
  languageOptions: {
    globals: globals.node,
  },
},
// sandbox preload 仅补本项实际用到的 console 名称。
{
  files: ['apps/desktop/src/preload/**/*.ts'],
  languageOptions: {
    globals: {
      console: 'readonly',
    },
  },
},
```

这是数组元素片段，插入已有 defineConfig 数组，不复制成第二个 export。globals 在 03 已导入，不重复安装。

preload 不直接使用 require；import electron 将来由 esbuild 转换成 sandbox 支持的加载形式。ESLint 全局名称声明只是静态检查，真正隔离由 Electron 的 webPreferences 决定。

## 第八步：开发模式验收

终端 A：

```bash
# 保持服务运行，等终端显示 5173 已就绪。
pnpm dev:renderer
```

终端 B：

```bash
# 先检查与编译，再打开 Electron。
pnpm check
pnpm build:electron
pnpm start:electron:dev
```

若仅有格式问题，先审阅 pnpm format 的影响范围，手动执行修正后再检查。其他报错先处理，不关闭规则绕过。

确认：

- 窗口展示第 03 项页面，路由与紧凑布局仍可用。
- 开发者工具控制台出现 [ElabTable] preload loaded，无 preload 加载错误。
- 修改 Vue 文本并保存，窗口内容更新。
- 修改 main/preload 不会自动更新，这是预期；本项需退出 Electron、重新 build:electron 后再启动，自动化留给 05。
- macOS 关闭窗口后点击 Dock 图标可重开，Cmd+Q 正常退出。
- 故意先停 Vite 再启动开发模式，应明确提示加载失败，不隐藏不报。

开发时若出现 Electron 的 CSP 安全提示，记录它；本项尚未完成发布安全配置。06/07 将分别完善 IPC 来源与参数校验、开发/生产 CSP、权限请求与发布设置，不以屏蔽警告代替处理。不要在 renderer 测试任意系统能力。

## 第九步：本地构建资源验收

先用 Cmd+Q 退出 Electron，再在终端 A 用 Ctrl+C 停止 Vite。关闭页面后不能误将“还有开发服务器运行”作为本地成功。

根目录运行：

```bash
# 生成 main、preload 与 renderer 的全部资源。
pnpm build:desktop

# 此次不带开发参数，必须能在无 Vite 时启动。
pnpm start:electron:local
```

确认页面可显示，首页与设置路由、刷新及紧凑状态切换仍可用。完整刷新恢复默认内存状态符合当前设计。需要检查 preload 日志时可通过默认菜单打开开发者工具，不必为本地模式长期自动打开它。

此流程验证的是生产资源路径，不是完整生产安装环境；原生模块、签名、安装包资源收集和 .app 内路径仍在 07 验证。

## 第十步：完整验收与记录

```bash
# 最终完整检查；确认依赖安装可重复。
pnpm check
pnpm install --frozen-lockfile
```

- [ ] 工具可运行，Electron 与 esbuild 版本正确。
- [ ] main、preload、renderer、工具配置的类型检查均通过。
- [ ] ESLint 与格式检查通过，无未处理的错误。
- [ ] main 字段指向 dist/main/index.cjs，两个桌面入口都生成 .cjs。
- [ ] preload 路径正确，控制台确认已执行。
- [ ] 开发模式正常，Vue 保存后更新，加载失败有反馈。
- [ ] 窗口关闭、Dock 重开和 Cmd+Q 符合 macOS 行为。
- [ ] 停止 Vite 后，本地资源仍可启动且路由可用。
- [ ] 按锁文件安装成功，依赖、锁文件与自动生成的工作区配置变更已审阅。
- [ ] 验收结果反馈后再勾选 04，阶段 Git 提交仍在 07 验收后执行。

AI 本次只编写教程，没有安装、构建或运行上述代码；清单需要你实际验证。

## 最终新增文件与配置

```text
apps/desktop/
  tsconfig.main.json
  tsconfig.preload.json
  src/
    main/index.ts
    preload/index.ts
```

还会修改 desktop package.json、根 package.json、根 ESLint 配置、锁文件，pnpm 可能更新工作区策略。原有 renderer 与 Vite 配置不需要重写。

构建结果：

```text
apps/desktop/dist/
  main/index.cjs
  preload/index.cjs
  renderer/index.html
  renderer/assets/
```

dist 不提交 Git；源码、配置与锁文件需要提交。不要使用清空整个 dist 的脚本去构建某个入口，否则可能误删另外两个进程的资源。

## 常见问题

| 现象                          | 优先检查                                                       |
| ----------------------------- | -------------------------------------------------------------- |
| 找不到 Electron 入口          | desktop 的 main 字段、build:electron 是否成功                  |
| require is not defined        | 是否错误输出 .js，导致 type: module 将 CJS 当 ESM              |
| Unable to load preload script | 路径是否相对 dist/main，文件是否存在且输出 .cjs                |
| sandbox 不支持模块            | preload 是否引入 fs、拆分代码或使用未经构建的 ESM              |
| 开发窗口加载失败              | Vite 是否运行在 127.0.0.1:5173，端口是否被其他服务占用         |
| 本地模式白屏                  | renderer 是否构建、base 是否 ./、是否错误带了开发参数          |
| Node API 在 renderer 不可用   | 属于隔离设计，不开启 nodeIntegration；需要时通过 06 的受控接口 |
| Mac 关窗后终端没退出          | 应用仍运行是本项设计，使用 Cmd+Q 退出                          |
| main 修改未生效               | 退出应用后重新 build:electron，本项没有桌面代码监听            |

遇到错误发完整命令、终端输出和文件路径，我们再逐步排查，不反复重装全部依赖。

## 官方参考

- [Electron 首个应用与生命周期](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)
- [Electron 模块格式与 sandbox preload 限制](https://www.electronjs.org/docs/latest/tutorial/esm)
- [Electron 进程沙箱](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron 安装与二进制下载](https://www.electronjs.org/docs/latest/tutorial/installation)
- [esbuild 构建选项](https://esbuild.github.io/api/)
