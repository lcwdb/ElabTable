<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppearanceStore } from '../../app/stores/appearance'
import type { WindowState } from '../../../shared/desktop'

// 当前页面生命周期中，bridge 是否存在不会动态改变。
const hasDesktop = Boolean(window.desktop)
const appearance = useAppearanceStore()
const version = ref('')
const platform = ref('')
const maximized = ref(false)
const loading = ref(false)
const errorMessage = ref('')
let lastRevision = -1
let active = true
let unsubscribe: (() => void) | undefined

function applyWindowState(state: WindowState) {
  // 查询结果与事件可能交错；只应用不旧于当前状态的快照。
  if (state.revision < lastRevision) return
  lastRevision = state.revision
  maximized.value = state.maximized
}

async function loadAppInfo() {
  const api = window.desktop
  if (!api || loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.getAppInfo()
    if (!active) return
    if (result.ok) {
      version.value = result.data.version
      platform.value = result.data.platform
      applyWindowState(result.data.windowState)
    } else {
      errorMessage.value = `${result.error.code}：${result.error.message}`
    }
  } catch {
    // bridge 被卸载等极端情况也不产生未处理 Promise。
    if (active) errorMessage.value = '桌面连接异常，请重试'
  } finally {
    if (active) loading.value = false
  }
}

onMounted(() => {
  const api = window.desktop
  if (!api) return
  // 先订阅再查询快照，避免初始化期间漏掉窗口变化。
  unsubscribe = api.onWindowState(applyWindowState)
  void loadAppInfo()
})

onUnmounted(() => {
  active = false
  unsubscribe?.()
})
</script>

<template>
  <section>
    <h1>设置</h1>
    <!-- 保留已有的真实布局偏好，不为 IPC 删除原能力。 -->
    <button type="button" :aria-pressed="appearance.compact" @click="appearance.toggleCompact">
      紧凑布局：{{ appearance.compact ? '开启' : '关闭' }}
    </button>
    <p>布局偏好当前只保存在内存，刷新后恢复默认值。</p>

    <h2>应用信息</h2>
    <template v-if="hasDesktop">
      <p v-if="loading" role="status">正在读取应用信息…</p>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <dl v-if="version">
        <dt>版本</dt>
        <dd>{{ version }}</dd>
        <dt>平台</dt>
        <dd>{{ platform }}</dd>
        <dt>窗口最大化</dt>
        <dd>{{ maximized ? '是' : '否' }}</dd>
      </dl>
      <button type="button" :disabled="loading" @click="loadAppInfo">刷新应用信息</button>
    </template>
    <p v-else>应用信息需要在桌面客户端中查看。</p>
  </section>
</template>
