// 按本节给出的目标文件填写；替换示例不要重复追加。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
// 全局样式只在应用入口导入一次。
import './styles/global.css'
// Pinia 先注册；后续路由逻辑也可以使用已激活的 Store。
createApp(App).use(createPinia()).use(router).mount('#app')
