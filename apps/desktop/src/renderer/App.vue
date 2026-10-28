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
