import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => {
  // 判断当前是开发环境（serve）还是生产构建环境（build）
  const developing = command === 'serve'

  // ==========================================
  // 🔒 核心安全策略：内容安全策略 (CSP)
  // ==========================================
  // CSP 是防止 XSS（跨站脚本攻击）和恶意注入的终极防线。
  // 这里根据环境动态拼接 CSP 规则，生产环境要求极其严格。
  const csp = [
    "default-src 'none'", // 默认禁止加载任何外部资源
    "script-src 'self'", // 只允许加载同源（本地）的 JS 脚本，禁止内联脚本 (eval 等)

    // 开发环境：Vite 注入 HMR 样式需要 'unsafe-inline'；生产环境严格禁止内联样式
    developing ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",

    "img-src 'self' data:", // 允许加载同源图片和 base64 编码的图片 (data:)
    "font-src 'self'", // 只允许加载同源字体

    // 开发环境：允许 WebSocket 连接用于 HMR（热更新）；生产环境彻底禁止任何网络连接
    developing ? "connect-src 'self' ws://127.0.0.1:5173" : "connect-src 'none'",

    "object-src 'none'", // 禁用 <object>、<embed> 等可能执行外部代码的标签
    "base-uri 'none'", // 禁用 <base> 标签，防止攻击者篡改基础 URL
    "form-action 'none'", // 禁止页面提交表单（防止恶意跳转或数据外泄）
    "frame-src 'none'", // 禁止页面被嵌套在 iframe 中，防止点击劫持
  ].join('; ') // CSP 规则之间用分号加空格连接

  // 编写一个自定义 Vite 插件，把上面配置的 CSP 动态注入到 index.html 的头部
  const cspPlugin: Plugin = {
    name: 'elabtable-csp',
    transformIndexHtml() {
      // 类型由 Plugin 提供；放在文档头部，先于页面脚本加载。
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend', // 确保这个 meta 标签在 <head> 的最前面，最先被浏览器解析
        },
      ]
    },
  }

  return {
    // 指定项目根目录。
    // 包脚本在 desktop 执行；05 的 JS API 会显式覆盖成绝对 root。
    root: 'src/renderer',

    // 设置为相对路径 ('./')。
    // 这对于 Electron 使用 file:// 协议加载本地文件至关重要，绝对路径会导致资源 404。
    base: './',

    // 挂载 Vue 插件和自定义的 CSP 插件
    plugins: [vue(), cspPlugin],

    server: {
      // 强制绑定 127.0.0.1，不对外暴露开发服务器，提高安全性
      host: '127.0.0.1',
      port: 5173,
      // 严格端口：如果 5173 被占用，直接报错退出，而不是自动切换到其他端口
      // 这保证了主进程（main）中硬编码的 `http://127.0.0.1:5173` 始终有效
      strictPort: true,
    },

    build: {
      // 相对 renderer root，实际输出 apps/desktop/dist/renderer。
      // 将构建产物输出到主进程能够正确读取的位置。
      outDir: '../../dist/renderer',
      // 每次构建前清空输出目录，避免旧文件残留
      emptyOutDir: true,
    },
  }
})
