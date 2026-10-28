# 第 03 项：启动 Vue 页面

日期：2026-10-22。状态：教学步骤已准备，等待你手写、运行并反馈验收结果。

## 目标与操作约定

本项完成 Vue + TypeScript + Vite + Pinia + Vue Router 的浏览器运行闭环，以及类型检查和生产构建。

前置条件：完成 02 的 ESLint 基础配置及完整验收。TypeScript 统一使用 6.0.3，满足 typescript-eslint 的兼容范围 >=4.8.4 <6.1.0。

AI 编写教学 Markdown，你创建工程文件、运行命令；每次完成一个步骤再继续。下面的代码均为待你操作的说明，不表示已经创建。不要一次粘贴所有代码后才检查。

本项页面只用于验证框架连接；正式首页、主题切换持久化、登录和 Electron 窗口在后续任务实现。

所有命令默认在 ElabTable 根目录运行。所有文件路径默认相对根目录。

### 如何阅读和填写代码

- 标注“新建”的文件先创建父目录，再创建文件；标注“替换”的代码替换该文件内容，不能追加第二份 script、template 或 scripts。
- package.json 示例若只列出字段，就是合并片段，必须放入已有对象并处理逗号，保留 name、依赖和其他脚本；末尾有最终脚本汇总。
- TypeScript、JavaScript、Shell、HTML、Vue、CSS 在关键位置写语法允许的注释；不逐行重复显而易见的内容。
- package.json 是严格 JSON，代码块内不写注释，用表格或段落解释。tsconfig 支持 JSONC，示例使用 jsonc 标注并可保留注释。
- 终端输出与目录树不插入伪注释，避免把输出误当作可执行代码。
- 本项未配置 @ 路径别名，所有导入用相对路径；暂不额外创建 alias、env 文件、自动导入或组件声明生成器。

执行链路：index.html → main.ts → App.vue → RouterView → 当前页面；Pinia 向组件提供共享内存状态。

## 第一步：安装依赖

你已确认 desktop 包存在，并已反馈下列六项依赖安装成功。已安装的步骤无需重复执行；此处保留完整命令供复习。版本来自本次查询，不代表永久最新。

| 依赖               | 版本   | 作用                       |
| ------------------ | ------ | -------------------------- |
| vue                | 3.5.44 | 页面组件和响应式系统       |
| pinia              | 4.1.0  | 跨组件状态                 |
| vue-router         | 5.4.0  | 页面路由                   |
| vite               | 8.3.5  | 开发服务器与页面构建       |
| @vitejs/plugin-vue | 6.0.10 | 编译 Vue 单文件组件        |
| vue-tsc            | 3.3.13 | 检查 Vue 模板和 TypeScript |

这些版本声明的 Node、Vue、Vite 和 TypeScript 范围匹配当前环境，实际兼容性仍需后面的检查与构建验证。

运行：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm --filter @elabtable/desktop add -E vue@3.5.44 pinia@4.1.0 vue-router@5.4.0
pnpm --filter @elabtable/desktop add -DE vite@8.3.5 @vitejs/plugin-vue@6.0.10 vue-tsc@3.3.13
pnpm --filter @elabtable/desktop list --depth 0
```

运行依赖放 dependencies，工具放 devDependencies；-E 固定版本；--filter 指定桌面包。本次不使用 -w，根包继续管理 TypeScript 和 Prettier。

Router 的 @pinia/colada 等 peer 是可选项，不额外安装。Pinia 声明 @vue/devtools-api 为必需 peer，pnpm 通常自动安装；若出现缺失或冲突警告，先把完整输出发给 AI，再处理，不加 force 跳过。

**检查点**：desktop 的 package.json 列出上述六项，锁文件已更新；依赖安装成功且无未解决的 peer 警告。

你的安装还在 pnpm-workspace.yaml 中生成了 minimumReleaseAgeExclude 的 vite@8.3.5 条目。它是该版本的发布年龄策略例外，不是 Vite 配置，也不等于安全认证。保留并审阅此次自动变更，随依赖与锁文件一起提交；教程不要求再添加其他例外。

## 第二步：配置 Vite

新建 `apps/desktop/vite.config.ts`：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 通过 desktop 包脚本运行，路径以 apps/desktop 为工作目录。
  root: 'src/renderer',
  // 构建资源使用相对路径，供后续 Electron 本地加载。
  base: './',
  // 编译 Vue 单文件组件。
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 固定开发端口，避免后续桌面窗口连接到错误地址。
    strictPort: true,
  },
  build: {
    // 相对 renderer 根目录，最终指向 desktop/dist/renderer。
    outDir: '../../dist/renderer',
    // 仅清理构建输出，不能指向源文件目录。
    emptyOutDir: true,
  },
})
```

- 这些命令通过 desktop 的包脚本运行，工作目录是 apps/desktop，因此 root 指向其 src/renderer。
- base 使用相对资源路径，为后续本地文件加载做准备。
- vue() 注册单文件组件编译插件。
- 开发服务仅绑定本机地址；端口占用就报错，不悄悄换端口，方便后续 Electron 连接。
- outDir 相对 root 解析，最终输出到 apps/desktop/dist/renderer。
- emptyOutDir 会清空该输出目录，不能指向源码或用户数据目录。

此配置属于开发工具代码，不能被 renderer 导入。当前界面 tsconfig 不检查它，后面单独补工具配置。

## 第三步：创建 HTML 与最小 Vue 页面

新建 `apps/desktop/src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ElabTable</title>
  </head>
  <body>
    <!-- Vue 根组件挂载到这里。 -->
    <div id="app"></div>
    <!-- 以 Vite root 为起点加载 TypeScript 入口，由 Vite 处理编译。 -->
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

index.html 是 Vite 页面入口；#app 是挂载位置；main.ts 路径以 Vite root 为起点。生产构建会处理入口引用，不要把这里手动改成 dist 路径。

新建 `apps/desktop/src/renderer/main.ts`：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { createApp } from 'vue'
import App from './App.vue'

// 创建 Vue 应用并挂载到 index.html 的 #app。
createApp(App).mount('#app')
```

新建 `apps/desktop/src/renderer/App.vue`：

```vue
<script setup lang="ts">
// setup 中的导入和状态可直接在本组件模板使用。
import { appMetadata } from './app/metadata'
</script>

<template>
  <main>
    <h1>{{ appMetadata.name }}</h1>
    <p>Vue 页面已启动。</p>
  </main>
</template>
```

复用第 02 项的 metadata.ts。script setup 中的变量可直接被 template 使用；双花括号显示表达式结果。

在 `apps/desktop/package.json` 的 scripts 中新增两项，保留原 typecheck：

```json
"dev:renderer": "vite --config vite.config.ts",
"build:renderer": "vite build --config vite.config.ts"
```

在根 `package.json` 的 scripts 中新增：

```json
"dev:renderer": "pnpm --filter @elabtable/desktop dev:renderer",
"build:renderer": "pnpm --filter @elabtable/desktop build:renderer"
```

**检查点**：运行 `pnpm dev:renderer`，打开终端提供的 http://127.0.0.1:5173，显示应用名和启动提示。修改提示文字后，保存可更新页面。终端 Ctrl+C 停止服务。

此时编辑器若提示 Vue 类型问题，下一步配置 vue-tsc；若浏览器白屏或终端报错，先定位问题，不直接跳过。

## 第四步：接入 Vue 类型检查

将 `apps/desktop/tsconfig.json` 改为以下内容，已有解释注释可以保留：

```jsonc
{
  // 继承共享 strict 与 noEmit 等规则。
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // renderer 使用浏览器 API；不加入 Node 全局类型。
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    // Vite 资源导入和 import.meta.env 的类型支持。
    "types": ["vite/client"],
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.vue"],
}
```

types 显式加入 Vite 客户端类型，供 CSS 等资源导入和 import.meta.env 使用；没有加入 Node 全局类型。include 加入 .vue 文件。

本教程已通过 types: ["vite/client"] 引入类型，所以不必再创建包含同一引用的 vite-env.d.ts。也不需要 declare module '*.vue' 的宽泛声明来压掉错误；Vue 类型由 Vue 官方扩展与 vue-tsc 配合处理。以后要声明自定义环境变量时再建立专门的类型文件。

将 desktop 的 typecheck 脚本替换为：

```json
"typecheck": "vue-tsc --project tsconfig.json"
```

vue-tsc 支持单文件组件及模板检查；noEmit 仍由共享配置继承。不要添加通用 any 声明来掩盖组件类型错误。

VS Code 安装 Vue 官方扩展 `Vue - Official`（Vue.volar）。如果装了旧的 Vetur，针对当前 Vue 3 工作区停用，避免冲突。

**检查点**：运行 `pnpm typecheck` 并通过。若当前 TypeScript 与 vue-tsc 发生工具内部错误，保存完整输出，重新评估兼容版本，不关闭严格检查应付。

## 第五步：加入路由

新建 `apps/desktop/src/renderer/features/home/HomeView.vue`：

```vue
<script setup lang="ts">
// setup 中的导入和状态可直接在本组件模板使用。
import { appMetadata } from '../../app/metadata'
</script>

<template>
  <section>
    <h1>{{ appMetadata.name }}</h1>
    <p>Vue 页面与首页路由已连接。</p>
  </section>
</template>
```

新建 `apps/desktop/src/renderer/features/settings/SettingsView.vue`：

```vue
<template>
  <!-- 路由验证页面，业务设置在后续阶段实现。 -->
  <section>
    <h1>设置</h1>
    <p>此页面用于验证路由，正式设置在后续阶段实现。</p>
  </section>
</template>
```

新建 `apps/desktop/src/renderer/app/router.ts`：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../features/home/HomeView.vue'
import SettingsView from '../features/settings/SettingsView.vue'

export const router = createRouter({
  // 路由写入 # 后方，避免本地文件路径被当作页面路由。
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/settings', name: 'settings', component: SettingsView },
    // 未知路由回到首页，避免显示空内容。
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
```

采用 Hash 路由，地址形如 /#/settings，适合后续 Electron 本地文件加载；未知路由暂回首页。

将 App.vue 替换为：

```vue
<script setup lang="ts">
// setup 中的导入和状态可直接在本组件模板使用。
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <main>
    <nav aria-label="主导航">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/settings">设置</RouterLink>
    </nav>
    <!-- 当前路由组件的显示位置，导航栏保留不变。 -->
    <RouterView />
  </main>
</template>
```

将 main.ts 更新为：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './app/router'

// 注册路由后挂载，RouterView 才能展示当前页面。
createApp(App).use(router).mount('#app')
```

App 负责共享布局，RouterView 负责当前页面；页面内容从 App 移入 HomeView，不维护两份首页。

**检查点**：首页与设置可以互相切换，浏览器前进后退正常，刷新 /#/settings 仍显示设置。

## 第六步：加入 Pinia

新建 `apps/desktop/src/renderer/app/stores/appearance.ts`：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppearanceStore = defineStore('appearance', () => {
  // 仅保存本次页面运行的偏好，刷新后重置。
  const compact = ref(false)

  // 通过统一操作入口修改共享状态。
  function toggleCompact() {
    compact.value = !compact.value
  }

  return { compact, toggleCompact }
})
```

用简单的布局偏好验证共享状态。defineStore 的 appearance 是唯一标识；ref 保存响应式状态，函数是操作入口。暂不写数据库或 localStorage。

将 main.ts 更新为：

```ts
// 按本节给出的目标文件填写；替换示例不要重复追加。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'

// Pinia 先注册；后续路由逻辑也可以使用已激活的 Store。
createApp(App).use(createPinia()).use(router).mount('#app')
```

将 SettingsView.vue 更新为：

```vue
<script setup lang="ts">
// setup 中的导入和状态可直接在本组件模板使用。
import { useAppearanceStore } from '../../app/stores/appearance'

// 获取应用级共享 Store，不直接解构响应式状态。
const appearance = useAppearanceStore()
</script>

<template>
  <section>
    <h1>设置</h1>
    <button type="button" :aria-pressed="appearance.compact" @click="appearance.toggleCompact">
      紧凑布局：{{ appearance.compact ? '开启' : '关闭' }}
    </button>
    <p>本项只验证内存状态，刷新后恢复默认值。</p>
  </section>
</template>
```

将 App.vue 更新为：

```vue
<script setup lang="ts">
// setup 中的导入和状态可直接在本组件模板使用。
import { RouterLink, RouterView } from 'vue-router'
import { useAppearanceStore } from './app/stores/appearance'

// 获取应用级共享 Store，不直接解构响应式状态。
const appearance = useAppearanceStore()
</script>

<template>
  <main :class="{ compact: appearance.compact }">
    <nav aria-label="主导航">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/settings">设置</RouterLink>
    </nav>
    <!-- 当前路由组件的显示位置，导航栏保留不变。 -->
    <RouterView />
  </main>
</template>
```

两个组件使用同一 Store，Settings 修改状态，App 消费状态。直接通过 appearance.compact 读取；不直接解构状态，避免丢失响应式连接，后续需要解构时学习 storeToRefs。

**检查点**：按钮文字变化，切换页面再返回状态仍保留；完整刷新恢复关闭，这是当前内存状态的预期行为。

## 第七步：加入基础主题变量

新建 `apps/desktop/src/renderer/styles/global.css`：

```css
/* 框架验证用主题变量，正式视觉阶段统一设计。 */
:root {
  font-family: system-ui, sans-serif;
  --page-bg: #f5f5f5;
  --text-color: #222;
  --space-page: 32px;
  --space-compact: 16px;
}

body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text-color);
}

main {
  padding: var(--space-page);
}

/* 根组件根据 Store 状态添加 compact 类。 */
main.compact {
  padding: var(--space-compact);
}

nav {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

button {
  font: inherit;
}
```

这些是框架验证用的临时基础变量，正式视觉阶段替换为确认的设计 token。这里用原生 CSS 即可，SCSS 和 UI 组件库按实际页面需要再加入。

在 main.ts 的 import 区域补充：

```ts
// 全局样式只在应用入口导入一次。
import './styles/global.css'
```

**检查点**：设置中切换紧凑布局，页面外边距在 32px 与 16px 间变化，证明共享状态、样式和页面已连接。

## 第八步：检查 Vite 工具配置

界面配置只包含 renderer，Vite 配置也需要独立类型检查。

新建 `apps/desktop/tsconfig.tools.json`：

```jsonc
{
  // 工具代码与浏览器界面分别检查，避免环境类型混用。
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": [],
  },
  "include": ["vite.config.ts"],
}
```

当前工具配置不使用 process、node:path 等 Node API，暂不额外安装 @types/node；后续需要时再显式添加。

将 desktop 的 scripts 整理为：

```json
"scripts": {
  "dev:renderer": "vite --config vite.config.ts",
  "build:renderer": "vite build --config vite.config.ts",
  "preview:renderer": "vite preview --config vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
  "typecheck": "vue-tsc --project tsconfig.json && tsc --project tsconfig.tools.json"
}
```

根包新增 preview 命令，保留已有其他 scripts：

```json
"preview:renderer": "pnpm --filter @elabtable/desktop preview:renderer"
```

此时根包的新增命令均使用 renderer 后缀。pnpm dev 留待后续桌面统一启动脚本，不把浏览器启动误称为完整桌面启动。

## 第九步：扩展 ESLint 的 Vue 支持

02 的配置只检查 JavaScript 和 TypeScript，不会自动检查 .vue 文件。本步在同一个根 eslint.config.js 扩展，不在 desktop 再建一份配置。

### 1. 安装 Vue 检查工具

本次查询选定以下版本，满足当前 ESLint 10 及 typescript-eslint 的声明要求：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm add -DwE eslint-plugin-vue@10.11.1 vue-eslint-parser@10.4.1 globals@17.13.0
```

- eslint-plugin-vue：Vue 模板与组件规则。
- vue-eslint-parser：理解 .vue 的 template、script 等区域。
- globals：提供浏览器等运行环境的全局变量名称，不提供运行时功能。

这些依赖服务根 ESLint 配置，所以放根包。插件的 @stylistic/eslint-plugin 是可选项，本项目格式交给 Prettier，不额外安装。

### 2. 更新根 eslint.config.js

将 02 的配置扩展为：

```js
// 根 ESLint flat config，配置项按顺序合并。
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import globals from 'globals'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**', '**/coverage/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.{ts,mts,vue}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  // Vue 核心正确性规则，保留 template 的解析能力。
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      // 外层解析 Vue 文件，script 内部再交给 TS 解析器。
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{js,ts,vue}'],
    languageOptions: {
      // 此配置块仅匹配 renderer，不影响 Electron 或云端环境。
      globals: globals.browser,
    },
  },
  // 最后关闭与 Prettier 冲突的排版规则。
  prettier,
])
```

理解配置顺序：

1. TypeScript 推荐规则也作用于 .vue 中的脚本。
2. Vue essential 提供防止错误的核心规则，数组通过 ... 展开。
3. .vue 外层必须由 vue-eslint-parser 解析，它再把 script 中的 TypeScript 交给 tseslint.parser；不能只把外层 parser 换成 TS 解析器，否则模板无法正确解析。
4. 浏览器全局名称只加入 renderer，不加入 main 或云端代码。
5. prettier 仍放最后，避免排版规则冲突。它不会关闭 Vue 核心正确性检查。

当前采用 essential 起步，后续团队确有需要再增加代码风格规则，不一次引入大量主观约束。这里未启用类型感知 lint 规则，vue-tsc 仍负责完整类型检查。

### 3. 编辑器与规则验证

将 .vscode/settings.json 中已有 ESLint 设置更新为：

```json
"eslint.validate": ["javascript", "typescript", "vue"]
```

保留 Prettier 作为格式化程序，不改成 ESLint。

运行：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm lint
```

确认 Vue 文件被纳入检查：可以在 HomeView.vue 的 script setup 中临时添加 `const unusedExample = '检查 Vue'`。预期报告未使用变量；删除后恢复通过。不把错误示例留进正式代码。

也可以在配置未生效时只读查询最终配置：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm exec eslint --print-config apps/desktop/src/renderer/features/home/HomeView.vue
```

输出中应包含 Vue 规则和 Vue parser。不要用添加 .vue 忽略规则的方式消除错误。

**检查点**：pnpm lint 对 .ts、配置 .js 和 .vue 生效，无待解决的警告或错误；根 pnpm check 已包含 lint，不要改回只做类型与格式检查的旧命令。

## 第十步：完整验收

运行：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm format:check
```

如果仅有格式提示，检查文件列表后运行 pnpm format；它会修改未忽略文件。再运行：

```bash
# 在 ElabTable 根目录运行；修改文件的命令先确认影响范围。
pnpm check
pnpm build:renderer
pnpm install --frozen-lockfile
pnpm preview:renderer
```

检查构建生成 apps/desktop/dist/renderer/index.html 和资源文件；预览打开 http://127.0.0.1:4173。preview 仅用于本地检查生产页面，不作为云端生产服务。

逐项确认：

- [x] 依赖已安装，peer 警告已解决。
- [x] Vue 开发页面可启动，修改文字可更新。
- [x] 首页、设置、前进后退和刷新工作正常。
- [x] Pinia 共享状态在页面切换中保留，刷新后重置。
- [x] 样式与紧凑布局切换生效，键盘可操作链接与按钮。
- [x] Vue 与工具配置的类型检查均通过。
- [x] ESLint 已覆盖 Vue 文件，代码质量检查通过。
- [x] 格式检查通过，按锁文件安装成功。
- [x] 生产构建成功，预览页面及路由可用。
- [x] 浏览器控制台没有待解决的错误。
- [x] 根转发脚本、desktop 脚本、最终 main.ts 与 VS Code 配置均与最终核对部分一致。
- [x] 审阅 package.json、锁文件和 pnpm-workspace.yaml 的自动变更；源码没有写入 dist。

页面能显示不代表类型检查通过；构建成功也不替代 pnpm check。完成后反馈真实输出，再更新任务状态，不提前勾选。

## 最终配置核对

所有步骤完成后，main.ts 最终应包含 Vue、Pinia、Router 和全局样式，避免按步骤修改时漏掉前面的注册：

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
// 全局样式在入口加载一次。
import './styles/global.css'

// 完成插件注册后挂载根组件。
createApp(App).use(createPinia()).use(router).mount('#app')
```

根 package.json 的 scripts 最终为以下结构；只替换 scripts，保留根包依赖、版本约束等字段。严格 JSON 不允许写注释：

```json
"scripts": {
  "dev:renderer": "pnpm --filter @elabtable/desktop dev:renderer",
  "build:renderer": "pnpm --filter @elabtable/desktop build:renderer",
  "preview:renderer": "pnpm --filter @elabtable/desktop preview:renderer",
  "typecheck": "pnpm -r typecheck",
  "lint": "eslint . --max-warnings 0",
  "lint:fix": "eslint . --fix --max-warnings 0",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "check": "pnpm typecheck && pnpm lint && pnpm format:check"
}
```

| 命令组           | 作用                                           |
| ---------------- | ---------------------------------------------- |
| dev:renderer     | 启动开发服务器，不自动执行完整静态检查         |
| build:renderer   | 生成生产资源，Vite 不自动替代类型检查或 ESLint |
| preview:renderer | 本地预览已经生成的构建结果                     |
| check            | 类型、代码质量与排版检查，发布前仍需单独构建   |

.vscode/settings.json 最终应同时保留 Prettier 与 Vue ESLint 支持；这里使用 VS Code 支持的 JSONC：

```jsonc
{
  // 保存排版仍由 Prettier 负责。
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "prettier.requireConfig": true,
  // ESLint 负责代码问题，不替换格式化程序。
  "eslint.validate": ["javascript", "typescript", "vue"],
}
```

## 运行、停止与常见问题

- 开发服务占用当前终端是正常情况：用第二个终端运行 pnpm check；原终端 Ctrl+C 停止。生产预览服务也是如此。
- 不直接双击源码 index.html，也不直接双击 dist/index.html 来替代验收；本项通过 Vite 开发服务器及 preview 验收，Electron 的本地资源加载留到 04。
- Missing script：检查命令是否加在正确包的 scripts 中；根脚本负责转发，desktop 脚本负责执行。
- 找不到 index.html：核对它位于 src/renderer，且 Vite 通过 desktop 包脚本启动，root 没写成根仓库下的 src/renderer。
- 端口占用：停止自己已启动的服务器，或先排查占用来源，不直接结束不认识的进程。
- 找不到 .vue 类型：核对 Vue 官方扩展、vue-tsc 命令和 include，不添加通用 any 掩盖问题。
- .vue 的 lint 出现解析错误：核对外层 Vue parser、内部 TypeScript parser 的组合及依赖安装位置。
- 修改 ESLint 或 Vite 配置后行为未更新：重启对应开发服务或编辑器 ESLint 服务，再查看完整错误。
- pnpm format 会连同教学文档一起格式化，先核对文件范围；不需要额外引入自动修复插件来运行本教程。

Naive UI、图标库、SCSS、路径别名与自动导入都不是本次闭环的必需项；出现实际使用需求时在对应任务引入。界面只显示本项实际验证的能力，不增加模型选择、虚假任务或未实现功能入口。

## 完成后的文件结构

```text
apps/desktop/
  package.json
  tsconfig.json
  tsconfig.tools.json
  vite.config.ts
  src/renderer/
    index.html
    main.ts
    App.vue
    app/
      metadata.ts
      router.ts
      stores/appearance.ts
    features/
      home/HomeView.vue
      settings/SettingsView.vue
    styles/global.css
```

根 package.json、eslint.config.js、.vscode/settings.json 与 pnpm-lock.yaml 也会更新。dist 不提交，源码、配置和锁文件需要保留。

## 下一项

第 04 项接入 Electron：编译 main、preload，创建窗口；开发加载当前 Vite 地址，生产加载已构建页面。本项不安装 Electron、不写 IPC、不创建正式首页。

按约定第一阶段全部验收后，由你提交 Git；本项可以按完整的小任务另做提交，但 AI 不自动执行。

## 官方参考

- [Vite 配置：root 与 base](https://vite.dev/config/shared-options)
- [Vue 与 TypeScript](https://vuejs.org/guide/typescript/overview.html)
- [Vue Router 路由模式](https://router.vuejs.org/guide/essentials/history-mode.html)
- [Pinia Store 定义](https://pinia.vuejs.org/core-concepts/)
- [eslint-plugin-vue 使用说明](https://eslint.vuejs.org/user-guide/)
