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
  // 只给主进程声明 Node 全局，不把权限或类型扩散到 renderer。
  // // Node 环境只作用于主进程和开发脚本，不扩散到 renderer/preload
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // sandbox preload 仅补本项实际用到的 console 名称。
  {
    files: ['apps/desktop/src/preload/**/*.ts'],
    languageOptions: {
      // 仅声明本项 sandbox preload 使用的 Web API 名称，不加入完整 Node 全局。
      globals: {
        console: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  // 最后关闭与 Prettier 冲突的排版规则。
  prettier,
])
