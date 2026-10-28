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
