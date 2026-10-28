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
